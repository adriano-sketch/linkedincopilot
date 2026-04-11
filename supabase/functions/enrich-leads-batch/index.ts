// v4 - fixed ScrapIn API: POST with includes param (was GET without includes, causing all profiles to return minimal data)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_LEADS_PER_CALL = 3;

function normalizeLinkedInUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  let url = String(rawUrl).trim();
  if (!url) return null;
  url = url.replace(/^<|>$/g, "");
  const inMatch = url.match(/https?:\/\/[^\s]*linkedin\.com\/in\/[^\s?#]+/i)
    || url.match(/linkedin\.com\/in\/[^\s?#]+/i);
  if (inMatch && inMatch[0]) {
    url = inMatch[0];
  }
  if (url.startsWith("www.")) url = `https://${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes("linkedin.com")) return null;
    parsed.protocol = "https:";
    if (!parsed.hostname.toLowerCase().startsWith("www.")) {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

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

    // ══════════════════════════════════════════════════════════
    // PROCESSING LIMIT CHECK (Credit Model v2)
    // Processing = every ScrapIn call. Limit = 3x outreach credits.
    // ══════════════════════════════════════════════════════════
    const { data: settings } = await supabase
      .from("user_settings")
      .select("leads_processed_this_cycle, max_leads_per_cycle")
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    const currentProcessed = settings?.leads_processed_this_cycle || 0;
    const maxOutreach = settings?.max_leads_per_cycle || 0;
    const maxProcessing = maxOutreach * 3;
    let remainingProcessing = maxProcessing > 0 ? Math.max(0, maxProcessing - currentProcessed) : 0;
    let processingCountToAdd = 0;

    // If processing limit already hit, return early
    if (maxProcessing > 0 && remainingProcessing <= 0) {
      return new Response(JSON.stringify({
        success: true,
        enriched: 0,
        remaining: 0,
        done: true,
        processing_limit_reached: true,
        message: "Processing limit reached for this cycle. Upgrade plan or wait for next cycle.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get un-enriched leads for this campaign
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

      // Normalize URL (force https, strip params)
      const linkedinUrl = normalizeLinkedInUrl(lead.linkedin_url);
      if (!linkedinUrl || !linkedinUrlPattern.test(linkedinUrl)) {
        await supabase.from("campaign_leads")
          .update({ profile_enriched_at: now, updated_at: now, error_message: "Invalid LinkedIn URL" } as any)
          .eq("id", lead.id);
        enrichedCount++;
        continue;
      }
      if (linkedinUrl !== lead.linkedin_url) {
        await supabase.from("campaign_leads")
          .update({ linkedin_url: linkedinUrl, updated_at: now } as any)
          .eq("id", lead.id);
      }

      // ── Ghost blacklist check: skip known ghosts (zero cost, zero processing) ──
      const { data: ghostEntry } = await supabase
        .from("ghost_profiles")
        .select("id, reason")
        .eq("linkedin_url", linkedinUrl)
        .maybeSingle();

      if (ghostEntry) {
        console.log(`Skipping blacklisted ghost ${linkedinUrl}: ${ghostEntry.reason}`);
        await supabase.from("campaign_leads").update({
          profile_enriched_at: now,
          updated_at: now,
          status: "skipped",
          error_message: `Blacklisted: ${ghostEntry.reason}`,
          profile_quality_status: "ghost",
        } as any).eq("id", lead.id);
        enrichedCount++;
        continue; // NO processing count — no ScrapIn call
      }

      // Check for existing snapshot first (also zero ScrapIn cost)
      const { data: existingSnapshot } = await supabase
        .from("profile_snapshots")
        .select("id, linkedin_url, headline, about, experience, raw_text")
        .eq("linkedin_url", linkedinUrl)
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

        // Fire-and-forget: generate messages
        fetch(`${supabaseUrl}/functions/v1/generate-dm`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ campaign_lead_id: lead.id, user_id: effectiveUserId }),
        }).catch(err => console.error(`generate-dm fire-and-forget error for ${lead.id}:`, err));

        continue; // NO processing count — no ScrapIn call
      }

      // ── Processing limit check before calling ScrapIn ──
      if (maxProcessing > 0 && remainingProcessing <= 0) {
        await supabase.from("campaign_leads").update({
          updated_at: now,
          status: "skipped",
          error_message: "Processing limit reached for this cycle",
        } as any).eq("id", lead.id);
        enrichedCount++;
        continue;
      }

      // ── Call Scrapin.io API (costs 1 processing unit) ──
      processingCountToAdd += 1;
      remainingProcessing -= 1;

      try {
        const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 25000);

        const res = await fetch(scrapinUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkedInUrl: linkedinUrl,
            includes: {
              includeCompany: true,
              includeSummary: true,
              includeSkills: true,
              includeExperience: true,
              includeEducation: true,
              includeFollowersCount: true,
              includeLanguages: true,
              includeCertifications: true,
            },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text();
          console.error(`Scrapin error [${res.status}] for ${linkedinUrl}:`, errText);

          if (res.status === 404) {
            // Profile not found — save to ghost blacklist
            await supabase.from("ghost_profiles").upsert({
              linkedin_url: linkedinUrl,
              reason: "404_not_found",
              signal_count: 0,
              source: "enrich-leads-batch",
              detected_at: now,
            }, { onConflict: "linkedin_url" }).select().maybeSingle();

            await supabase.from("campaign_leads").update({
              profile_enriched_at: now, updated_at: now,
              status: "skipped",
              error_message: "Profile not found on LinkedIn (404)",
              profile_quality_status: "ghost",
            } as any).eq("id", lead.id);
            enrichedCount++;
          } else {
            errors.push(`Scrapin ${res.status} for ${lead.linkedin_url}`);
          }
          continue;
        }

        const data = await res.json();
        if (!data.success || !data.person) {
          console.error("Scrapin returned no person for:", linkedinUrl);
          await supabase.from("ghost_profiles").upsert({
            linkedin_url: linkedinUrl,
            reason: "no_data_returned",
            signal_count: 0,
            source: "enrich-leads-batch",
            detected_at: now,
          }, { onConflict: "linkedin_url" }).select().maybeSingle();

          await supabase.from("campaign_leads").update({
            profile_enriched_at: now, updated_at: now,
            status: "skipped",
            error_message: "No profile data returned",
            profile_quality_status: "ghost",
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
        const positions = p.positions?.positionHistory || p.positionHistory || [];
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
        const educations = p.schools?.educationHistory || p.educationHistory || [];
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

        // Ghost profile detection
        const hasAbout = about.trim().length > 20;
        const hasSkills = Array.isArray(skills) && skills.length >= 2;
        const hasEducation = Array.isArray(educations) && educations.length > 0;
        const hasPosition = Array.isArray(positions) && positions.length >= 1;
        const followerCount = p.followersCount || p.followerCount || 0;
        const connectionCount = p.connectionsCount || p.connectionCount || 0;

        const signalCount = [hasAbout, hasSkills, hasEducation, hasPosition, followerCount > 10, connectionCount > 50].filter(Boolean).length;

        if (signalCount === 0) {
          const reason = `Ghost profile (minimal data: ${!hasAbout ? 'no about' : ''}${!hasSkills ? ', no skills' : ''}${!hasEducation ? ', no education' : ''}${!hasPosition ? ', no position' : ''}${followerCount <= 10 ? ', few followers' : ''})`.replace('(minimal data: ,', '(minimal data: ');

          console.log(`Skipping ghost profile ${linkedinUrl}: ${reason}`);

          await supabase.from("ghost_profiles").upsert({
            linkedin_url: linkedinUrl,
            reason: "ghost_minimal_data",
            signal_count: signalCount,
            source: "enrich-leads-batch",
            detected_at: now,
            raw_data: {
              hasAbout, hasSkills, hasEducation, hasPosition,
              followerCount, connectionCount,
              headline: headline?.substring(0, 100),
              name: fullName,
              rawSummary: (p.summary || "").substring(0, 200),
              rawSkillsCount: Array.isArray(p.skills) ? p.skills.length : 0,
              rawPositionsCount: Array.isArray(p.positions?.positionHistory) ? p.positions.positionHistory.length : 0,
              rawEducationCount: Array.isArray(p.schools?.educationHistory) ? p.schools.educationHistory.length : 0,
              rawFollowerCount: p.followerCount,
              rawFollowersCount: p.followersCount,
              rawConnectionsCount: p.connectionsCount,
            },
          }, { onConflict: "linkedin_url" }).select().maybeSingle();

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
            profile_quality_status: "ghost",
          } as any).eq("id", lead.id);
          enrichedCount++;
          continue;
        }

        // Save snapshot
        const { data: snapshot } = await supabase
          .from("profile_snapshots")
          .insert({
            user_id: effectiveUserId,
            linkedin_url: linkedinUrl,
            headline,
            about,
            experience: experienceText || null,
            raw_text: rawText,
            source: "scrapin",
          } as any)
          .select("id")
          .single();

        // Extract previous position (index 1 of positions history)
        const previousPos = Array.isArray(positions) && positions.length > 1 ? positions[1] : null;

        // Extract first education details
        const firstEdu = Array.isArray(educations) && educations.length > 0 ? educations[0] : null;
        const educationDisplay = firstEdu
          ? [firstEdu.degreeName || firstEdu.degree || "", firstEdu.fieldOfStudy || "", "at", firstEdu.schoolName || firstEdu.school || ""]
              .filter(Boolean)
              .join(" ")
              .trim()
          : null;

        // Skills: keep first 20 as an array for profile_skills (generate-dm slices to 5)
        const skillsArray = (Array.isArray(skills) ? skills : [])
          .map((s: any) => typeof s === "string" ? s : (s?.name || ""))
          .filter((s: string) => s && s.length > 0)
          .slice(0, 20);

        // Location (city, state, country)
        const locationDisplay = p.location
          ? [p.location.city, p.location.state, p.location.country].filter(Boolean).join(", ")
          : null;

        // Industry (Scrapin returns it at person level OR inside current position.company)
        const industryDisplay = p.industry
          || currentPos?.industry
          || currentPos?.companyIndustry
          || (currentPos?.company && typeof currentPos.company === "object" ? currentPos.company.industry : null)
          || null;

        // Build a structured snapshot JSON so generate-dm can read experience/education/skills.
        // This is the 'profile_snapshot' field on campaign_leads that ai-prompts reads.
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
          followerCount: followerCount || 0,
          connectionCount: connectionCount || 0,
        };

        const updateData: any = {
          profile_enriched_at: now,
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

        // Fire-and-forget: generate messages
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

    // ══════════════════════════════════════════════════════════
    // UPDATE PROCESSING COUNTER (Credit Model v2)
    // Only processing count — enrich-leads-batch doesn't handle outreach credits
    // ══════════════════════════════════════════════════════════
    if (processingCountToAdd > 0) {
      await supabase
        .from("user_settings")
        .update({ leads_processed_this_cycle: currentProcessed + processingCountToAdd })
        .eq("user_id", effectiveUserId);
    }

    const remaining = Math.max(0, (totalRemaining || 0) - enrichedCount);

    return new Response(JSON.stringify({
      success: true,
      enriched: enrichedCount,
      remaining,
      done: remaining === 0,
      scrapin_calls: processingCountToAdd,
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
