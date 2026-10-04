import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, effectiveUserId, json, unauthorized } from "../_shared/auth.ts";

// Security notes (2026-10 patch):
//  - Caller must be an authenticated user or a service caller.
//  - Users always act as themselves (body user_id ignored).
//  - The campaign lead must belong to the effective user BEFORE we spend a
//    ScrapIn credit, and every read/update is scoped by user_id.
//  - Snapshot reuse is limited to the same user's snapshots (no cross-tenant
//    linking of another user's snapshot).
//  - Each real ScrapIn call is counted via add_leads_processed().

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req, { allowService: true, allowUser: true });
    if (!auth) return unauthorized();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    if (!SCRAPIN_API_KEY) {
      console.error("capture-profile: SCRAPIN_API_KEY not configured");
      return json({ error: "Enrichment is not configured" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const linkedin_url: unknown = body.linkedin_url;
    const campaign_lead_id: string | null =
      typeof body.campaign_lead_id === "string" && body.campaign_lead_id ? body.campaign_lead_id : null;
    const userId = effectiveUserId(auth, body.user_id);

    if (!userId) return json({ error: "user_id required" }, 400);
    if (typeof linkedin_url !== "string" || !/^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(linkedin_url.trim())) {
      return json({ error: "valid linkedin_url required" }, 400);
    }
    const linkedinUrl = linkedin_url.trim();

    // Verify lead ownership BEFORE spending any credit.
    if (campaign_lead_id) {
      const { data: lead, error: leadErr } = await supabase
        .from("campaign_leads")
        .select("id")
        .eq("id", campaign_lead_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (leadErr) {
        console.error("capture-profile: lead lookup failed", leadErr);
        return json({ error: "Failed to load lead" }, 500);
      }
      if (!lead) return json({ error: "Lead not found" }, 404);
    }

    // Check for existing snapshot (same user only) to save credits
    const { data: existingSnapshot, error: existingErr } = await supabase
      .from("profile_snapshots")
      .select("id")
      .eq("user_id", userId)
      .eq("linkedin_url", linkedinUrl)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingErr) console.error("capture-profile: snapshot lookup failed", existingErr);

    if (existingSnapshot) {
      if (campaign_lead_id) {
        const { error: linkErr } = await supabase.from("campaign_leads")
          .update({ snapshot_id: existingSnapshot.id, updated_at: new Date().toISOString() } as any)
          .eq("id", campaign_lead_id)
          .eq("user_id", userId);
        if (linkErr) {
          console.error("capture-profile: failed to link existing snapshot", linkErr);
          return json({ error: "Failed to update lead" }, 500);
        }
      }
      return json({ success: true, snapshot_id: existingSnapshot.id, reused: true });
    }

    // Call Scrapin.io API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let scrapinResponse: Response;
    try {
      const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}&linkedInUrl=${encodeURIComponent(linkedinUrl)}`;
      scrapinResponse = await fetch(scrapinUrl, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (error: any) {
      clearTimeout(timeout);
      if (error?.name === "AbortError") {
        return json({
          success: false, reason: "timeout",
          message: "Profile capture timed out. Manual capture available.",
        });
      }
      throw error;
    }

    if (!scrapinResponse.ok) {
      const errorText = await scrapinResponse.text();
      console.error(`Scrapin error (${scrapinResponse.status}):`, errorText.slice(0, 500));
      return json({
        success: false, reason: scrapinResponse.status === 404 ? "profile_not_found" : "scrapin_error",
        message: scrapinResponse.status === 404
          ? "Profile not found or is private. Manual capture required."
          : "Profile scrape failed. Manual capture available as fallback.",
      });
    }

    // A successful ScrapIn response consumes a credit: count it (atomic RPC).
    {
      const { error: usageErr } = await supabase.rpc("add_leads_processed", { p_user_id: userId, p_amount: 1 });
      if (usageErr) console.error("capture-profile: add_leads_processed failed", usageErr);
    }

    const data = await scrapinResponse.json();
    if (!data.success || !data.person) {
      return json({
        success: false, reason: "profile_not_found",
        message: "Profile not found or is private. Manual capture required.",
      });
    }

    const p = data.person;
    const firstName = p.firstName || "";
    const lastName = p.lastName || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const headline = p.headline || "";
    const about = p.summary || p.about || "";

    const positions = p.positionHistory || p.positions || [];
    const experienceText = (Array.isArray(positions) ? positions : [])
      .map((pos: any) => {
        const title = pos.title || "";
        const company = pos.companyName || pos.company || "";
        const startDate = pos.startEndDate?.start?.month ? `${pos.startEndDate.start.month}/${pos.startEndDate.start.year}` : "";
        const endDate = pos.startEndDate?.end?.month ? `${pos.startEndDate.end.month}/${pos.startEndDate.end.year}` : "Present";
        const dateStr = startDate ? `${startDate} - ${endDate}` : "";
        const desc = pos.description || "";
        return `${title} at ${company}${dateStr ? ` (${dateStr})` : ""}${desc ? `: ${desc}` : ""}`;
      })
      .filter((s: string) => s.trim() !== "at")
      .join("\n");

    const educations = p.educationHistory || p.educations || [];
    const educationText = (Array.isArray(educations) ? educations : [])
      .map((edu: any) => {
        const school = edu.schoolName || edu.school || "";
        const degree = edu.degreeName || edu.degree || "";
        const field = edu.fieldOfStudy || "";
        return `${degree}${field ? ` in ${field}` : ""} at ${school}`;
      })
      .filter((s: string) => s.trim() !== "at")
      .join("\n");

    const skills = p.skills || [];
    const skillsText = (Array.isArray(skills) ? skills : [])
      .map((s: any) => typeof s === "string" ? s : (s.name || ""))
      .filter(Boolean)
      .join(", ");

    const rawText = [
      headline ? `Headline: ${headline}` : "",
      about ? `About: ${about}` : "",
      experienceText ? `Experience:\n${experienceText}` : "",
      educationText ? `Education:\n${educationText}` : "",
      skillsText ? `Skills: ${skillsText}` : "",
      p.location ? `Location: ${[p.location.city, p.location.state, p.location.country].filter(Boolean).join(", ")}` : "",
    ].filter(Boolean).join("\n\n");

    // Save snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from("profile_snapshots")
      .insert({
        user_id: userId,
        linkedin_url: linkedinUrl,
        headline,
        about,
        experience: experienceText || null,
        raw_text: rawText,
        source: "scrapin",
      } as any)
      .select("id")
      .single();

    if (snapshotError || !snapshot) {
      console.error("capture-profile: snapshot insert failed", snapshotError);
      return json({ error: "Failed to save profile snapshot" }, 500);
    }

    // Update campaign_lead with FULL enrichment so generate-dm has rich data.
    if (campaign_lead_id) {
      const currentPos = Array.isArray(positions) && positions.length > 0 ? positions[0] : null;
      const previousPos = Array.isArray(positions) && positions.length > 1 ? positions[1] : null;
      const firstEdu = Array.isArray(educations) && educations.length > 0 ? educations[0] : null;
      const educationDisplay = firstEdu
        ? [firstEdu.degreeName || firstEdu.degree || "", firstEdu.fieldOfStudy || "", "at", firstEdu.schoolName || firstEdu.school || ""]
            .filter(Boolean)
            .join(" ")
            .trim()
        : null;
      const skillsArray = (Array.isArray(skills) ? skills : [])
        .map((s: any) => typeof s === "string" ? s : (s?.name || ""))
        .filter((s: string) => s && s.length > 0)
        .slice(0, 20);
      const locationDisplay = p.location
        ? [p.location.city, p.location.state, p.location.country].filter(Boolean).join(", ")
        : null;
      const industryDisplay = p.industry
        || currentPos?.industry
        || currentPos?.companyIndustry
        || (currentPos?.company && typeof currentPos.company === "object" ? currentPos.company.industry : null)
        || null;

      const structuredSnapshot = {
        headline,
        about,
        location: locationDisplay,
        industry: industryDisplay,
        experience: (Array.isArray(positions) ? positions : []).map((pos: any) => ({
          title: pos.title || "",
          companyName: pos.companyName || pos.company || "",
          description: pos.description || "",
          startDate: pos.startEndDate?.start || null,
          endDate: pos.startEndDate?.end || null,
        })),
        education: (Array.isArray(educations) ? educations : []).map((edu: any) => ({
          schoolName: edu.schoolName || edu.school || "",
          degreeName: edu.degreeName || edu.degree || "",
          fieldOfStudy: edu.fieldOfStudy || edu.field || "",
        })),
        skills: skillsArray,
      };

      const updateData: any = {
        snapshot_id: snapshot.id,
        profile_enriched_at: new Date().toISOString(),
        profile_headline: headline || null,
        profile_about: about || null,
        profile_current_title: currentPos?.title || null,
        profile_current_company: currentPos?.companyName || currentPos?.company || null,
        profile_previous_title: previousPos?.title || null,
        profile_previous_company: previousPos?.companyName || previousPos?.company || null,
        profile_education: educationDisplay,
        profile_skills: skillsArray.length > 0 ? skillsArray : null,
        profile_snapshot: structuredSnapshot,
        industry: industryDisplay,
        location: locationDisplay,
        updated_at: new Date().toISOString(),
      };
      if (fullName) {
        updateData.full_name = fullName;
        updateData.first_name = firstName;
        updateData.last_name = lastName;
      }
      if (headline) updateData.title = headline;

      const { error: leadUpdErr } = await supabase.from("campaign_leads")
        .update(updateData)
        .eq("id", campaign_lead_id)
        .eq("user_id", userId);
      if (leadUpdErr) {
        console.error("capture-profile: lead enrichment update failed", leadUpdErr);
        return json({ error: "Failed to update lead", snapshot_id: snapshot.id }, 500);
      }
    }

    return json({
      success: true,
      snapshot_id: snapshot.id,
      profile_name: fullName,
      has_about: !!about,
      has_experience: (Array.isArray(positions) ? positions : []).length > 0,
    });
  } catch (e) {
    console.error("capture-profile error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
