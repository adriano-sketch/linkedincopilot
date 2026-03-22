import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

// Detect if a "name" is actually a company/organization name
function detectCompanyName(name: string): boolean {
  if (!name) return false;
  const companyIndicators = [
    /\b(solutions|consulting|services|technologies|group|inc|llc|ltd|corp|agency|partners|associates|holdings|enterprises|healthcare|capital|ventures|labs|studio|media|digital|systems|network|global|international|foundation|institute)\b/i,
    /\b(co\.|company|gmbh|s\.a\.|s\.r\.l|pvt|pty)\b/i,
  ];
  return companyIndicators.some(regex => regex.test(name));
}

function validateICP(lead: any, campaign: any): { pass: boolean; reasons: string[] } {
  const failures: string[] = [];
  const mismatches: string[] = [];
  let hasChecks = false;

  if (campaign.icp_job_titles?.length > 0 || campaign.icp_titles?.length > 0) {
    hasChecks = true;
    const titles = [...(campaign.icp_job_titles || []), ...(campaign.icp_titles || [])];
    const match = titles.some((t: string) =>
      (lead.title || "").toLowerCase().includes(t.toLowerCase())
    );
    if (!match) mismatches.push(`Title "${lead.title || "N/A"}" doesn't match ICP titles`);
  }

  if (campaign.icp_industries?.length > 0) {
    hasChecks = true;
    const match = campaign.icp_industries.some((i: string) =>
      (lead.industry || "").toLowerCase().includes(i.toLowerCase())
    );
    if (!match) mismatches.push(`Industry "${lead.industry || "N/A"}" doesn't match ICP industries`);
  }

  if (campaign.icp_locations?.length > 0) {
    hasChecks = true;
    const match = campaign.icp_locations.some((l: string) =>
      (lead.location || "").toLowerCase().includes(l.toLowerCase())
    );
    if (!match) mismatches.push(`Location "${lead.location || "N/A"}" doesn't match ICP locations`);
  }

  if (campaign.icp_company_size_min || campaign.icp_company_size_max) {
    hasChecks = true;
    // We don't have company size on leads typically, so skip if not available
  }

  if (campaign.icp_exclude_keywords?.length > 0) {
    const text = `${lead.title || ""} ${lead.company || ""}`.toLowerCase();
    const excluded = campaign.icp_exclude_keywords.some((kw: string) =>
      text.includes(kw.toLowerCase())
    );
    if (excluded) {
      hasChecks = true;
      failures.push("Contains excluded keyword");
    }
  }

  if (!hasChecks) return { pass: true, reasons: [] };
  if (failures.length > 0) return { pass: false, reasons: failures };
  if (mismatches.length >= 2) return { pass: false, reasons: mismatches };
  return { pass: true, reasons: [] };
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { lead_ids, campaign_profile_id } = await req.json();
    if (!campaign_profile_id) throw new Error("campaign_profile_id required");
    if (!lead_ids || lead_ids.length === 0) throw new Error("lead_ids required");

    // Get campaign
    const { data: campaign } = await supabase
      .from("campaign_profiles")
      .select("*")
      .eq("id", campaign_profile_id)
      .eq("user_id", user.id)
      .single();

    if (!campaign) throw new Error("Campaign not found");

    // Get sender profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("sender_name, sender_title, company_name, company_description, value_proposition")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) throw new Error("Profile not found");

    // Get leads
    const { data: leads } = await supabase
      .from("campaign_leads")
      .select("*")
      .in("id", lead_ids)
      .eq("user_id", user.id);

    if (!leads || leads.length === 0) throw new Error("No leads found");

    const results = { processed: 0, icp_rejected: 0, enriched: 0, messages_generated: 0, errors: [] as string[] };

    const { data: creditSettings } = await supabase
      .from("user_settings")
      .select("leads_used_this_cycle, max_leads_per_cycle")
      .eq("user_id", user.id)
      .maybeSingle();
    let currentUsed = creditSettings?.leads_used_this_cycle || 0;
    const maxLeads = creditSettings?.max_leads_per_cycle || 0;
    let creditsToAdd = 0;

    for (const lead of leads) {
      try {
        const normalizedLinkedinUrl = normalizeLinkedInUrl(lead.linkedin_url);
        if (lead.linkedin_url && normalizedLinkedinUrl && normalizedLinkedinUrl !== lead.linkedin_url) {
          await supabase.from("campaign_leads")
            .update({ linkedin_url: normalizedLinkedinUrl, updated_at: new Date().toISOString() } as any)
            .eq("id", lead.id);
        }

        if (lead.profile_quality_status === "pending") {
          results.errors.push(`${lead.first_name || "Unknown"}: quality scan pending`);
          continue;
        }
        if (lead.profile_quality_status === "ghost") {
          await supabase.from("campaign_leads")
            .update({
              status: "skipped",
              profile_enriched_at: new Date().toISOString(),
              error_message: "Ghost profile (LinkedIn)",
              profile_quality_status: "ghost",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);
          results.processed++;
          continue;
        }

        // ── Ghost blacklist check: skip known ghosts without calling ScrapIn ──
        if (normalizedLinkedinUrl) {
          const { data: ghostEntry } = await supabase
            .from("ghost_profiles")
            .select("id, reason")
            .eq("linkedin_url", normalizedLinkedinUrl)
            .maybeSingle();

          if (ghostEntry) {
            await supabase.from("campaign_leads")
              .update({
                status: "skipped",
                profile_enriched_at: new Date().toISOString(),
                error_message: `Blacklisted: ${ghostEntry.reason}`,
                profile_quality_status: "ghost",
                updated_at: new Date().toISOString(),
              } as any)
              .eq("id", lead.id);
            results.processed++;
            continue;
          }
        }

        // Step 0: ICP Validation
        const icpResult = validateICP(lead, campaign);
        if (!icpResult.pass) {
          await supabase.from("campaign_leads")
            .update({
              status: "icp_rejected",
              icp_match: false,
              icp_match_reason: icpResult.reasons.join("; "),
              icp_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action: "icp_rejected",
            details: { reasons: icpResult.reasons },
          });

          results.icp_rejected++;
          continue;
        }

        await supabase.from("campaign_leads")
          .update({
            icp_match: true,
            icp_checked_at: new Date().toISOString(),
            status: "enriching",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", lead.id);

        // Step 1: Enrich via Scrapin.io
        let profileData: any = null;
        let scrapinFailureReason: string | null = null;
        if (SCRAPIN_API_KEY && normalizedLinkedinUrl) {
          try {
            const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}&linkedInUrl=${encodeURIComponent(normalizedLinkedinUrl)}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);
            const scrapinResponse = await fetch(scrapinUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (scrapinResponse.ok) {
              const payload = await scrapinResponse.json();
              if (payload?.success && payload?.person) {
                profileData = payload.person;
              }
            } else {
              await scrapinResponse.text();
              scrapinFailureReason = scrapinResponse.status === 404 ? "404_not_found" : "scrapin_no_data";
            }
          } catch (e) {
            console.error(`Scrapin enrichment failed for ${lead.id}:`, e);
            scrapinFailureReason = "scrapin_no_data";
          }
        }

        // Save enrichment data
        const enrichUpdate: any = {
          updated_at: new Date().toISOString(),
        };

        if (profileData) {
          enrichUpdate.profile_snapshot = profileData;
          enrichUpdate.profile_headline = profileData.headline || null;
          enrichUpdate.profile_about = profileData.summary || profileData.about || null;
          const positions = profileData.positionHistory || profileData.positions || [];
          enrichUpdate.profile_current_title = positions?.[0]?.title || null;
          enrichUpdate.profile_current_company = positions?.[0]?.companyName || positions?.[0]?.company || null;
          enrichUpdate.profile_previous_title = positions?.[1]?.title || null;
          enrichUpdate.profile_previous_company = positions?.[1]?.companyName || positions?.[1]?.company || null;
          const educations = profileData.educationHistory || profileData.educations || [];
          enrichUpdate.profile_education = Array.isArray(educations)
            ? educations.map((e: any) => `${e.degreeName || e.degree || ""} ${e.schoolName || e.school || ""}`).join("; ").trim() || null
            : null;
          const skills = profileData.skills || [];
          enrichUpdate.profile_skills = Array.isArray(skills)
            ? skills.map((s: any) => typeof s === "string" ? s : s.name || "").filter(Boolean)
            : null;
          enrichUpdate.profile_enriched_at = new Date().toISOString();
          enrichUpdate.status = "enriched";

          // Also update name fields if missing
          const fullName = profileData.fullName || `${profileData.firstName || ""} ${profileData.lastName || ""}`.trim();
          if (!lead.full_name && fullName) {
            enrichUpdate.full_name = fullName;
            enrichUpdate.first_name = profileData.firstName || fullName.split(" ")[0] || null;
            enrichUpdate.last_name = profileData.lastName || null;
          }

          // ── Ghost detection: minimal LinkedIn presence ──
          const about = profileData.summary || profileData.about || "";
          const hasAbout = about.trim().length > 20;
          const hasSkills = Array.isArray(skills) && skills.length >= 2;
          const hasEducation = Array.isArray(educations) && educations.length > 0;
          const hasMultiplePositions = Array.isArray(positions) && positions.length > 1;
          const followerCount = profileData.followersCount || profileData.followerCount || 0;
          const connectionCount = profileData.connectionsCount || profileData.connectionCount || 0;

          const signalCount = [hasAbout, hasSkills, hasEducation, hasMultiplePositions, followerCount > 10, connectionCount > 50].filter(Boolean).length;

          if (signalCount <= 1) {
            const ghostReason = `Ghost profile (signals: ${signalCount}/6)`;

            const ghostUrl = normalizedLinkedinUrl || lead.linkedin_url;
            if (ghostUrl) {
              await supabase.from("ghost_profiles").upsert({
                linkedin_url: ghostUrl,
                reason: "ghost_minimal_data",
                signal_count: signalCount,
                source: "process-new-lead",
                detected_at: new Date().toISOString(),
                raw_data: {
                  hasAbout, hasSkills, hasEducation, hasMultiplePositions,
                  followerCount, connectionCount,
                  headline: (profileData.headline || "").substring(0, 100),
                  name: fullName,
                },
              }, { onConflict: "linkedin_url" }).select().maybeSingle();
            }

            await supabase.from("campaign_leads").update({
              status: "skipped",
              profile_enriched_at: new Date().toISOString(),
              error_message: ghostReason,
              profile_quality_status: "ghost",
              profile_headline: profileData.headline || null,
              profile_about: about || null,
              updated_at: new Date().toISOString(),
            } as any).eq("id", lead.id);

            results.processed++;
            continue;
          }

          results.enriched++;
        } else {
          const ghostUrl = normalizedLinkedinUrl || lead.linkedin_url;
          if (ghostUrl) {
            await supabase.from("ghost_profiles").upsert({
              linkedin_url: ghostUrl,
              reason: scrapinFailureReason || "scrapin_no_data",
              signal_count: 0,
              source: "process-new-lead",
              detected_at: new Date().toISOString(),
            }, { onConflict: "linkedin_url" }).select().maybeSingle();
          }

          await supabase.from("campaign_leads")
            .update({
              status: "skipped",
              profile_enriched_at: new Date().toISOString(),
              error_message: "No profile data available",
              profile_quality_status: "ghost",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);

          results.processed++;
          continue;
        }

        await supabase.from("campaign_leads")
          .update(enrichUpdate)
          .eq("id", lead.id);

        // Step 2: Generate messages with AI (outreach credits are consumed only on success)
        if (maxLeads > 0 && currentUsed >= maxLeads) {
          await supabase.from("campaign_leads")
            .update({
              status: "icp_rejected",
              icp_match: false,
              icp_checked_at: new Date().toISOString(),
              icp_match_reason: "Lead credits exhausted",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);
          results.icp_rejected++;
          results.processed++;
          continue;
        }

        if (!LOVABLE_API_KEY) {
          await supabase.from("campaign_leads")
            .update({ status: "enriched", updated_at: new Date().toISOString() } as any)
            .eq("id", lead.id);
          results.processed++;
          continue;
        }

        await supabase.from("campaign_leads")
          .update({ status: "generating_messages", updated_at: new Date().toISOString() } as any)
          .eq("id", lead.id);

        const senderFirstName = (profile.sender_name || "").split(" ")[0] || "Unknown";
        const fullName = lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim();
        const isCompanyName = detectCompanyName(fullName);
        const leadFirstName = isCompanyName ? "" : (lead.first_name || fullName.split(" ")[0] || "Unknown");

        const messageLanguage = campaign.message_language || 'English';
        const systemPrompt = `You are a world-class LinkedIn outreach strategist. Generate 3 hyper-personalized messages.
You MUST write ALL messages entirely in ${messageLanguage}. Every word must be native ${messageLanguage} — no mixing languages.
Return ONLY valid JSON: {"connection_note": "...", "custom_dm": "...", "custom_followup": "..."}

RULES:
- connection_note: MAX 200 chars. Reference ONE specific thing from their profile. Zero selling. Don't start with "Hi [Name]".
- custom_dm: 200-350 chars. Different hook than connection note. MUST address one of the listed pain points using the campaign angle. Use first name once (if available — skip name if it's a company). End with low-friction question. Sign with sender's first name only.
- custom_followup: 150-280 chars. Completely different angle from DM. Never say "following up". Sign with sender's first name only.
- ALL messages MUST be written in native ${messageLanguage}. Use natural, culturally appropriate expressions for ${messageLanguage}.
- CRITICAL: The custom_dm must make the recipient think "this person understands MY specific challenge." Generic industry observations are NOT acceptable. If a DM example is provided, study its APPROACH (how it raises a pain point) and write something with the same strategic intent but different words.

Tone: ${campaign.dm_tone || "professional_warm"}
Objective: ${campaign.campaign_objective || "start_conversation"}`;

        const userPrompt = `Generate 3 LinkedIn messages for this lead.

SENDER: ${profile.sender_name || "Unknown"}, ${profile.sender_title || ""} at ${profile.company_name || ""}
Value prop: ${campaign.value_proposition || profile.value_proposition || ""}
Pain points (MUST address at least ONE in the DM): ${Array.isArray(campaign.pain_points) ? campaign.pain_points.join(", ") : ""}
${campaign.campaign_angle ? `Campaign angle (CORE STRATEGY — DM must align): ${campaign.campaign_angle}` : ""}
${campaign.dm_example ? `Example DM (study APPROACH, don't copy): ${campaign.dm_example}` : ""}

LEAD:
Name: ${fullName || "Unknown"}${isCompanyName ? " ⚠️ This is a COMPANY name, NOT a person. Do NOT use it as a personal name greeting." : ""}
Title: ${enrichUpdate.profile_current_title || lead.title || "N/A"}
Company: ${enrichUpdate.profile_current_company || lead.company || "N/A"}
Headline: ${enrichUpdate.profile_headline || "N/A"}
About: ${truncateText(enrichUpdate.profile_about || "", 600)}
Industry: ${lead.industry || "N/A"}
Location: ${lead.location || "N/A"}

Sign messages as "${senderFirstName}".`;

        try {
          const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "openai/gpt-5-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.75,
            }),
          });

          if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            throw new Error(`AI API error: ${aiResponse.status} ${errText}`);
          }

          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content || "";

          // Parse JSON from response
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) throw new Error("No JSON in AI response");

          const messages = JSON.parse(jsonMatch[0]);

          // Validate lengths
          let connectionNote = messages.connection_note || "";
          let customDm = messages.custom_dm || "";
          let customFollowup = messages.custom_followup || "";

          if (connectionNote.length > 200) connectionNote = connectionNote.substring(0, 197) + "...";
          if (customDm.length > 350) customDm = customDm.substring(0, 347) + "...";
          if (customFollowup.length > 280) customFollowup = customFollowup.substring(0, 277) + "...";

          await supabase.from("campaign_leads")
            .update({
              connection_note: connectionNote,
              custom_dm: customDm,
              custom_followup: customFollowup,
              dm_text: customDm, // Keep dm_text for backward compat
              follow_up_text: customFollowup,
              messages_generated_at: new Date().toISOString(),
              status: "pending_approval",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action: "messages_generated",
            details: { connection_note_length: connectionNote.length, dm_length: customDm.length },
          });

          results.messages_generated++;
          creditsToAdd += 1;
          currentUsed += 1;
        } catch (aiError) {
          console.error(`AI generation failed for ${lead.id}:`, aiError);
          await supabase.from("campaign_leads")
            .update({
              status: "enriched",
              error_message: aiError instanceof Error ? aiError.message : "AI generation failed",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);
          results.errors.push(`${lead.first_name || "Unknown"}: AI generation failed`);
        }

        results.processed++;
      } catch (leadError) {
        console.error(`Processing failed for lead ${lead.id}:`, leadError);
        results.errors.push(`${lead.first_name || "Unknown"}: ${leadError instanceof Error ? leadError.message : "Unknown"}`);

        await supabase.from("campaign_leads")
          .update({
            status: "error",
            error_message: leadError instanceof Error ? leadError.message : "Processing failed",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", lead.id);
      }
    }

    // Send notification email if we generated messages
    if (results.messages_generated > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/notify-approval-ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          campaign_profile_id,
          type: "connection_notes_ready",
        }),
      }).catch(err => console.error("notify-approval-ready error:", err));
    }

    if (creditsToAdd > 0) {
      await supabase
        .from("user_settings")
        .update({ leads_used_this_cycle: currentUsed })
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-new-lead error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
