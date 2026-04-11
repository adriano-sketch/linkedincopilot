import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    if (!SCRAPIN_API_KEY) throw new Error("SCRAPIN_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { linkedin_url, user_id, campaign_lead_id } = await req.json();
    if (!linkedin_url) {
      return new Response(JSON.stringify({ error: "linkedin_url required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check for existing snapshot to save credits
    const { data: existingSnapshot } = await supabase
      .from("profile_snapshots")
      .select("id")
      .eq("linkedin_url", linkedin_url)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSnapshot) {
      if (campaign_lead_id) {
        await supabase.from("campaign_leads")
          .update({ snapshot_id: existingSnapshot.id, updated_at: new Date().toISOString() } as any)
          .eq("id", campaign_lead_id);
      }
      return new Response(JSON.stringify({
        success: true, snapshot_id: existingSnapshot.id, reused: true,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Call Scrapin.io API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let scrapinResponse: Response;
    try {
      const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}&linkedInUrl=${encodeURIComponent(linkedin_url)}`;
      scrapinResponse = await fetch(scrapinUrl, { signal: controller.signal });
      clearTimeout(timeout);
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.name === "AbortError") {
        return new Response(JSON.stringify({
          success: false, reason: "timeout",
          message: "Profile capture timed out. Manual capture available.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw error;
    }

    if (!scrapinResponse.ok) {
      const errorText = await scrapinResponse.text();
      console.error(`Scrapin error (${scrapinResponse.status}):`, errorText);
      return new Response(JSON.stringify({
        success: false, reason: scrapinResponse.status === 404 ? "profile_not_found" : "scrapin_error",
        message: scrapinResponse.status === 404 
          ? "Profile not found or is private. Manual capture required."
          : "Profile scrape failed. Manual capture available as fallback.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await scrapinResponse.json();
    if (!data.success || !data.person) {
      return new Response(JSON.stringify({
        success: false, reason: "profile_not_found",
        message: "Profile not found or is private. Manual capture required.",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
        user_id,
        linkedin_url,
        headline,
        about,
        experience: experienceText || null,
        raw_text: rawText,
        source: "scrapin",
      } as any)
      .select("id")
      .single();

    if (snapshotError) throw snapshotError;

    // Update campaign_lead with FULL enrichment so generate-dm has rich data.
    // Previously this function only wrote snapshot_id/full_name and left all
    // the profile_* columns NULL, which broke per-lead DM personalization.
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

      await supabase.from("campaign_leads")
        .update(updateData)
        .eq("id", campaign_lead_id);
    }

    return new Response(JSON.stringify({
      success: true,
      snapshot_id: snapshot.id,
      profile_name: fullName,
      has_about: !!about,
      has_experience: (Array.isArray(positions) ? positions : []).length > 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("capture-profile error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
