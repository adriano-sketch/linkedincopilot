// v5 - verified auth via _shared/auth.ts (no unsigned JWT decoding), atomic processing counter
//      (add_leads_processed RPC), credit exhaustion leaves leads untouched for the next cycle,
//      missing user_settings = zero allowance.
// v4 - fixed ScrapIn API: POST with includes param (was GET without includes, causing all profiles to return minimal data)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, effectiveUserId as resolveUserId, unauthorized } from "../_shared/auth.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Users act as themselves (body user_id ignored); service callers (watchdog,
  // scheduler) must pass user_id in the body.
  const auth = await authenticate(req, { allowService: true, allowUser: true });
  if (!auth) return unauthorized();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    if (!SCRAPIN_API_KEY) throw new Error("SCRAPIN_API_KEY not configured");

    const { campaign_profile_id, user_id: requestedUserId } = await req.json();
    if (!campaign_profile_id) throw new Error("campaign_profile_id is required");

    const effectiveUserId = resolveUserId(auth, requestedUserId);
    if (!effectiveUserId) {
      return new Response(JSON.stringify({ error: "user_id is required for service calls" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ══════════════════════════════════════════════════════════
    // PROCESSING LIMIT CHECK (Credit Model v2)
    // Processing = every ScrapIn call. Limit = 3x outreach credits.
    // Auto-resets when cycle_reset_date has passed.
    // ══════════════════════════════════════════════════════════
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("leads_processed_this_cycle, max_leads_per_cycle, cycle_reset_date, cycle_start_date")
      .eq("user_id", effectiveUserId)
      .maybeSingle();
    if (settingsError) throw new Error(`user_settings lookup failed: ${settingsError.message}`);

    // No user_settings row = zero allowance (previously treated as unlimited).
    if (!settings) {
      return new Response(JSON.stringify({
        success: true,
        enriched: 0,
        remaining: 0,
        done: true,
        processing_limit_reached: true,
        message: "No plan settings found for this user. Processing is disabled until a plan is assigned.",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-reset cycle if cycle_reset_date has passed
    if (settings.cycle_reset_date) {
      const resetDate = new Date(settings.cycle_reset_date + "T00:00:00Z");
      if (new Date() >= resetDate) {
        const newStart = new Date().toISOString().slice(0, 10);
        const nextReset = new Date();
        nextReset.setMonth(nextReset.getMonth() + 1);
        const newResetDate = nextReset.toISOString().slice(0, 10);
        const { error: resetError } = await supabase
          .from("user_settings")
          .update({
            leads_processed_this_cycle: 0,
            leads_used_this_cycle: 0,
            cycle_start_date: newStart,
            cycle_reset_date: newResetDate,
          })
          .eq("user_id", effectiveUserId)
          // Guard against two concurrent calls both resetting (second one would wipe fresh usage).
          .eq("cycle_reset_date", settings.cycle_reset_date);
        if (resetError) {
          console.error(`Cycle auto-reset failed for user ${effectiveUserId}:`, resetError);
        } else {
          settings.leads_processed_this_cycle = 0;
          console.log(`Cycle auto-reset for user ${effectiveUserId}: ${newStart} → ${newResetDate}`);
        }
      }
    }

    // max_leads_per_cycle <= 0 means unlimited (same convention as consume_lead_credits).
    const currentProcessed = settings.leads_processed_this_cycle || 0;
    const maxOutreach = settings.max_leads_per_cycle || 0;
    const maxProcessing = maxOutreach * 3;
    let remainingProcessing = maxProcessing > 0 ? Math.max(0, maxProcessing - currentProcessed) : 0;
    let processingCountToAdd = 0;
    let processingLimitHit = false;

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
      .select("id, linkedin_url, source, profile_enriched_at, full_name, first_name, last_name, title, company, industry, location, profile_quality_status, enrich_retry_count")
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
        const { error: snapUpdErr } = await supabase.from("campaign_leads").update({
          snapshot_id: existingSnapshot.id,
          profile_enriched_at: now,
          profile_headline: existingSnapshot.headline || null,
          profile_about: existingSnapshot.about || null,
          updated_at: now,
        } as any).eq("id", lead.id);
        if (snapUpdErr) {
          console.error(`Snapshot reuse update failed for ${lead.id}:`, snapUpdErr);
          errors.push(`DB update failed for ${lead.id}`);
          continue;
        }
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
      // Out of processing credits: leave the lead untouched so it is picked up
      // again next cycle (previously it was marked 'skipped' and lost for good).
      if (maxProcessing > 0 && remainingProcessing <= 0) {
        processingLimitHit = true;
        continue;
      }

      // ── Call Scrapin.io API (costs 1 processing unit) ──
      // Charge atomically before the call (same accounting as before: every
      // attempt counts, success or not).
      const { data: newProcessedTotal, error: processedError } = await supabase.rpc("add_leads_processed", {
        p_user_id: effectiveUserId,
        p_amount: 1,
      });
      if (processedError) {
        console.error(`add_leads_processed failed for user ${effectiveUserId}:`, processedError);
        errors.push("Could not record processing usage; ScrapIn call skipped");
        continue;
      }
      processingCountToAdd += 1;
      if (maxProcessing > 0) {
        remainingProcessing = typeof newProcessedTotal === "number"
          ? Math.max(0, maxProcessing - newProcessedTotal)
          : remainingProcessing - 1;
      }

      try {
        // ScrapIn's legacy v1 endpoint (api.scrapin.io) documents only the
        // `apikey` query parameter. The new Reverse Contact v2 API accepts
        // `x-api-key` / `Authorization: Bearer`, but that is not confirmed for
        // v1, so the key stays in the query string. Do not log this URL.
        const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${encodeURIComponent(SCRAPIN_API_KEY)}`;
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

            // ── SCRAPIN FALLBACK: after repeated failures, push lead to pipeline ──
            // The extension will enrich inline during visit_profile.
            const enrichRetryCount = (lead as any).enrich_retry_count || 0;
            if (enrichRetryCount >= 2 || res.status >= 500) {
              console.log(`Scrapin unavailable for ${linkedinUrl} (${res.status}, retries=${enrichRetryCount}) — pushing to pipeline for extension scraping`);
              await supabase.from("campaign_leads").update({
                status: "ready",
                enrichment_source: "pending_extension_scrape",
                enrich_retry_count: enrichRetryCount + 1,
                error_message: `Scrapin ${res.status} — will be enriched by extension during visit`,
                next_action_at: now,
                updated_at: now,
              } as any).eq("id", lead.id);
              enrichedCount++;
            } else {
              // Increment retry counter for next attempt
              await supabase.from("campaign_leads").update({
                enrich_retry_count: enrichRetryCount + 1,
                updated_at: now,
              } as any).eq("id", lead.id);
            }
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
        const { data: snapshot, error: snapshotInsertErr } = await supabase
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
        if (snapshotInsertErr) console.error(`profile_snapshots insert failed for ${lead.id}:`, snapshotInsertErr);

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

        const { error: enrichUpdErr } = await supabase.from("campaign_leads").update(updateData).eq("id", lead.id);
        if (enrichUpdErr) {
          // Do not fire generate-dm for a lead whose enrichment did not persist.
          console.error(`Enrichment update failed for ${lead.id}:`, enrichUpdErr);
          errors.push(`DB update failed for ${lead.id}`);
          continue;
        }
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

        // ── SCRAPIN FALLBACK on exception: push to pipeline after repeated failures ──
        const enrichRetryCount = (lead as any).enrich_retry_count || 0;
        if (enrichRetryCount >= 2) {
          const linkedinUrl = normalizeLinkedInUrl(lead.linkedin_url);
          console.log(`Scrapin exception for ${linkedinUrl} (retries=${enrichRetryCount}) — pushing to pipeline for extension scraping`);
          await supabase.from("campaign_leads").update({
            status: "ready",
            enrichment_source: "pending_extension_scrape",
            enrich_retry_count: enrichRetryCount + 1,
            error_message: `Scrapin error — will be enriched by extension during visit`,
            next_action_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as any).eq("id", lead.id);
        } else {
          await supabase.from("campaign_leads").update({
            enrich_retry_count: enrichRetryCount + 1,
            updated_at: new Date().toISOString(),
          } as any).eq("id", lead.id);
        }
      }
    }

    // Processing counter is now incremented atomically per ScrapIn call
    // (add_leads_processed RPC above); no read-modify-write here.

    const remaining = Math.max(0, (totalRemaining || 0) - enrichedCount);

    return new Response(JSON.stringify({
      success: true,
      enriched: enrichedCount,
      remaining,
      done: remaining === 0,
      scrapin_calls: processingCountToAdd,
      processing_limit_reached: processingLimitHit || undefined,
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
