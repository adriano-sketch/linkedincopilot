// v2 - supports csv + search sources
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_LEADS_PER_CALL = 3;

function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    if (!SCRAPIN_API_KEY) throw new Error("SCRAPIN_API_KEY not configured");

    const { campaign_profile_id, user_id: requestedUserId } = await req.json();
    if (!campaign_profile_id) throw new Error("campaign_profile_id is required");

    const authHeader = req.headers.get("authorization");
    const internalKey = req.headers.get("x-internal-key");

    let effectiveUserId: string | null = null;

    // Internal trusted call (watchdog/scheduler)
    if (internalKey && internalKey === supabaseKey) {
      if (typeof requestedUserId === "string" && requestedUserId.length > 0) {
        effectiveUserId = requestedUserId;
      }
    } else {
      if (!authHeader) throw new Error("Missing authorization header");
      const token = authHeader.replace("Bearer ", "").trim();

      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token);

      if (!userError && user) {
        effectiveUserId = user.id;
      } else {
        const jwtPayload = parseJwtPayload(token);
        const isServiceRole = jwtPayload?.role === "service_role";
        if (isServiceRole && typeof requestedUserId === "string" && requestedUserId.length > 0) {
          effectiveUserId = requestedUserId;
        }
      }
    }

    if (!effectiveUserId) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get un-enriched leads for this campaign (include Apollo data for pre-screening)
    const { data: leads, error: leadsError } = await supabase
      .from("campaign_leads")
      .select("id, linkedin_url, source, profile_enriched_at, full_name, first_name, last_name, title, company, industry, location, profile_quality_status")
      .eq("campaign_profile_id", campaign_profile_id)
      .eq("user_id", effectiveUserId)
      .is("profile_enriched_at", null)
      .in("source", ["csv", "search"])
      .in("status", ["new", "imported", "ready", "icp_rejected", "icp_matched"])
      .or("profile_quality_status.is.null,profile_quality_status.eq.ok")
      .limit(MAX_LEADS_PER_CALL);

    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, enriched: 0, remaining: 0, done: true 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check total remaining (beyond this batch)
    const { count: totalRemaining } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_profile_id", campaign_profile_id)
      .eq("user_id", effectiveUserId)
      .is("profile_enriched_at", null)
      .in("source", ["csv", "search"])
      .in("status", ["new", "imported", "ready", "icp_rejected", "icp_matched"])
      .or("profile_quality_status.is.null,profile_quality_status.eq.ok");

    let enrichedCount = 0;
    const errors: string[] = [];
    const linkedinUrlPattern = /linkedin\.com\/in\/.+/i;

    for (const lead of leads) {
      const now = new Date().toISOString();

      // Normalize URL if missing protocol
      let linkedinUrl = lead.linkedin_url;
      if (linkedinUrl && !linkedinUrl.startsWith('http')) {
        linkedinUrl = `https://www.${linkedinUrl.replace(/^www\./, '')}`;
        // Update the URL in the database
        await supabase.from("campaign_leads")
          .update({ linkedin_url: linkedinUrl, updated_at: now } as any)
          .eq("id", lead.id);
      }

      // Validate URL
      if (!linkedinUrlPattern.test(linkedinUrl)) {
        await supabase.from("campaign_leads")
          .update({ profile_enriched_at: now, updated_at: now, error_message: "Invalid LinkedIn URL" } as any)
          .eq("id", lead.id);
        enrichedCount++;
        continue;
      }

      // Check for existing snapshot first
      const { data: existingSnapshot } = await supabase
        .from("profile_snapshots")
        .select("id, linkedin_url, headline, about, experience, raw_text")
        .eq("linkedin_url", lead.linkedin_url)
        .limit(1)
        .maybeSingle();

      if (existingSnapshot) {
        await supabase.from("campaign_leads").update({
          snapshot_id: existingSnapshot.id,
          profile_enriched_at: now,
          profile_headline: existingSnapshot.headline || null,
          profile_about: existingSnapshot.about || null,
          updated_at: now,
        } as any).eq("id", lead.id);
        enrichedCount++;

        // Fire-and-forget: generate messages so approval samples are ready
        fetch(`${supabaseUrl}/functions/v1/generate-dm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ campaign_lead_id: lead.id, user_id: effectiveUserId }),
        }).catch(err => console.error(`generate-dm fire-and-forget error for ${lead.id}:`, err));

        continue;
      }

      // Call Scrapin.io API
      try {
        const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}&linkedInUrl=${encodeURIComponent(lead.linkedin_url)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const res = await fetch(scrapinUrl, { signal: controller.signal });
        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Scrapin error [${res.status}] for ${lead.linkedin_url}:`, errText);
          
          if (res.status === 404) {
            // Profile not found — mark as enriched with error to avoid loops
            await supabase.from("campaign_leads").update({
              profile_enriched_at: now, updated_at: now,
              error_message: "Profile not found on LinkedIn",
            } as any).eq("id", lead.id);
            enrichedCount++;
          } else {
            errors.push(`Scrapin ${res.status} for ${lead.linkedin_url}`);
          }
          continue;
        }

        const data = await res.json();
        if (!data.success || !data.person) {
          console.error("Scrapin returned no person for:", lead.linkedin_url);
          await supabase.from("campaign_leads").update({
            profile_enriched_at: now, updated_at: now,
            error_message: "No profile data returned",
          } as any).eq("id", lead.id);
          enrichedCount++;
          continue;
        }

        const p = data.person;
        const firstName = p.firstName || "";
        const lastName = p.lastName || "";
        const fullName = `${firstName} ${lastName}`.trim();
        const headline = p.headline || "";
        const about = p.summary || p.about || "";

        // Position history
        const positions = p.positionHistory || p.positions || [];
        const currentPos = Array.isArray(positions) && positions.length > 0 ? positions[0] : null;
        const experienceText = (Array.isArray(positions) ? positions : [])
          .map((pos: any) => {
            const title = pos.title || "";
            const company = pos.companyName || pos.company || "";
            const startDate = pos.startEndDate?.start?.month ? `${pos.startEndDate.start.month}/${pos.startEndDate.start.year}` : "";
            const endDate = pos.startEndDate?.end?.month ? `${pos.startEndDate.end.month}/${pos.startEndDate.end.year}` : "Present";
            const dateStr = startDate ? `${startDate} - ${endDate}` : "";
            return `${title} at ${company}${dateStr ? ` (${dateStr})` : ""}`;
          })
          .filter((s: string) => s.trim() !== "at")
          .join("\n");

        // Education history
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

        // Skills
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

        // Ghost profile detection: skip profiles with minimal LinkedIn presence
        // These are auto-created profiles where the person isn't truly active on LinkedIn
        const hasAbout = about.trim().length > 20;
        const hasSkills = Array.isArray(skills) && skills.length >= 2;
        const hasEducation = Array.isArray(educations) && educations.length > 0;
        const hasMultiplePositions = Array.isArray(positions) && positions.length > 1;
        const followerCount = p.followersCount || p.followerCount || 0;
        const connectionCount = p.connectionsCount || p.connectionCount || 0;

        // A profile is considered a "ghost" if it lacks most engagement signals
        const signalCount = [hasAbout, hasSkills, hasEducation, hasMultiplePositions, followerCount > 10, connectionCount > 50].filter(Boolean).length;

        if (signalCount <= 1) {
          const reason = `Ghost profile (minimal data: ${!hasAbout ? 'no about' : ''}${!hasSkills ? ', no skills' : ''}${!hasEducation ? ', no education' : ''}${!hasMultiplePositions ? ', single/no position' : ''}${followerCount <= 10 ? ', few followers' : ''})`.replace('(minimal data: ,', '(minimal data: ');

          console.log(`Skipping ghost profile ${lead.linkedin_url}: ${reason}`);
          await supabase.from("campaign_leads").update({
            profile_enriched_at: now,
            updated_at: now,
            status: "skipped",
            error_message: reason,
            profile_headline: headline || null,
            profile_about: about || null,
            first_name: firstName || null,
            last_name: lastName || null,
            full_name: fullName || null,
          } as any).eq("id", lead.id);
          enrichedCount++;
          continue;
        }

        // Save snapshot
        const { data: snapshot } = await supabase
          .from("profile_snapshots")
          .insert({
            user_id: effectiveUserId,
            linkedin_url: lead.linkedin_url,
            headline,
            about,
            experience: experienceText || null,
            raw_text: rawText,
            source: "scrapin",
          } as any)
          .select("id")
          .single();

        const updateData: any = {
          profile_enriched_at: now,
          profile_headline: headline || null,
          profile_about: about || null,
          profile_current_title: currentPos?.title || null,
          profile_current_company: currentPos?.companyName || currentPos?.company || null,
          updated_at: now,
          error_message: null,
        };
        if (snapshot) updateData.snapshot_id = snapshot.id;
        if (fullName) {
          updateData.full_name = fullName;
          updateData.first_name = firstName;
          updateData.last_name = lastName;
        }

        await supabase.from("campaign_leads").update(updateData).eq("id", lead.id);
        enrichedCount++;

        // Fire-and-forget: generate messages so approval samples are ready
        fetch(`${supabaseUrl}/functions/v1/generate-dm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ campaign_lead_id: lead.id, user_id: effectiveUserId }),
        }).catch(err => console.error(`generate-dm fire-and-forget error for ${lead.id}:`, err));


      } catch (e: any) {
        if (e.name === "AbortError") {
          console.error("Scrapin timeout for:", lead.linkedin_url);
          errors.push(`Timeout for ${lead.linkedin_url}`);
        } else {
          console.error("Scrapin error for lead:", lead.linkedin_url, e);
          errors.push(e.message || "Unknown error");
        }
      }
    }

    const remaining = Math.max(0, (totalRemaining || 0) - enrichedCount);

    return new Response(JSON.stringify({
      success: true,
      enriched: enrichedCount,
      remaining,
      done: remaining === 0,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-leads-batch error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
