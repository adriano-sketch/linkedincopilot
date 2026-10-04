import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, effectiveUserId, unauthorized } from "../_shared/auth.ts";

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

  // Users act as themselves (body user_id ignored); service callers must pass user_id.
  const auth = await authenticate(req, { allowService: true, allowUser: true });
  if (!auth) return unauthorized();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // SCRAPIN_API_KEY no longer needed — enrichment is done by extension during visit_profile
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const ANTHROPIC_MODEL_NOTE = Deno.env.get("ANTHROPIC_MODEL_NOTE")
      || Deno.env.get("ANTHROPIC_MODEL_ICP")
      || Deno.env.get("ANTHROPIC_MODEL")
      || "claude-haiku-4-5";
    const ANTHROPIC_MODEL_DM = Deno.env.get("ANTHROPIC_MODEL_DM")
      || Deno.env.get("ANTHROPIC_MODEL")
      || "claude-sonnet-4-6";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { lead_ids, campaign_profile_id, user_id: bodyUserId } = await req.json();
    const userId = effectiveUserId(auth, bodyUserId);
    if (!userId) {
      return new Response(JSON.stringify({ error: "user_id is required for service calls" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!campaign_profile_id) throw new Error("campaign_profile_id required");
    if (!lead_ids || lead_ids.length === 0) throw new Error("lead_ids required");

    // Get campaign
    const { data: campaign } = await supabase
      .from("campaign_profiles")
      .select("*")
      .eq("id", campaign_profile_id)
      .eq("user_id", userId)
      .single();

    if (!campaign) throw new Error("Campaign not found");

    // Get sender profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("sender_name, sender_title, company_name, company_description, value_proposition")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) throw new Error("Profile not found");

    // Get leads
    const { data: leads } = await supabase
      .from("campaign_leads")
      .select("*")
      .in("id", lead_ids)
      .eq("user_id", userId);

    if (!leads || leads.length === 0) throw new Error("No leads found");

    const results = { processed: 0, icp_rejected: 0, credits_exhausted: 0, enriched: 0, messages_generated: 0, errors: [] as string[] };

    // Credit snapshot, used only as a GATE for the no-snapshot path (credits for
    // those leads are charged later by generate-dm when messages are created).
    // Actual consumption on this function's own generation path is atomic via
    // the consume_lead_credits RPC. No user_settings row = no credits.
    const { data: creditSettings, error: creditSettingsError } = await supabase
      .from("user_settings")
      .select("leads_used_this_cycle, max_leads_per_cycle")
      .eq("user_id", userId)
      .maybeSingle();
    if (creditSettingsError) throw new Error(`user_settings lookup failed: ${creditSettingsError.message}`);
    let currentUsed = creditSettings?.leads_used_this_cycle || 0;
    const maxLeads = creditSettings?.max_leads_per_cycle || 0;
    const hasCreditsForGate = () =>
      !!creditSettings && (maxLeads <= 0 || currentUsed < maxLeads);

    const markCreditsExhausted = async (leadId: string, extra: Record<string, unknown> = {}) => {
      const { error } = await supabase.from("campaign_leads")
        .update({
          ...extra,
          status: "credits_exhausted",
          error_message: "Lead credits exhausted",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", leadId);
      if (error) console.error(`credits_exhausted update failed for ${leadId}:`, error);
      results.credits_exhausted++;
      results.processed++;
    };

    const consumeCredit = async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc("consume_lead_credits", { p_user_id: userId, p_amount: 1 });
      if (error) {
        console.error(`consume_lead_credits failed for ${userId}:`, error);
        throw new Error("Could not reserve lead credit");
      }
      if (data === true) currentUsed += 1;
      return data === true;
    };

    // Give back a credit reserved for a generation that did not complete.
    // consume_lead_credits with a negative amount is an atomic decrement (the
    // limit condition is always true when subtracting).
    const refundCredit = async () => {
      const { error } = await supabase.rpc("consume_lead_credits", { p_user_id: userId, p_amount: -1 });
      if (error) console.error(`credit refund failed for ${userId}:`, error);
      else currentUsed = Math.max(0, currentUsed - 1);
    };

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
            user_id: userId,
            campaign_lead_id: lead.id,
            action: "icp_rejected",
            details: { reasons: icpResult.reasons },
          });

          results.icp_rejected++;
          continue;
        }

        // ── Scrapin-free flow (v2) ──
        // Instead of calling Scrapin API here, push lead directly to 'ready'.
        // The Chrome extension will scrape profile data from LinkedIn DOM
        // during the visit_profile warmup step (zero external API cost).
        //
        // If we have an existing snapshot for this LinkedIn URL (from a
        // previous scrape), use it immediately. Otherwise, the lead enters
        // the pipeline un-enriched and gets enriched inline during visit_profile.

        const enrichUpdate: any = {
          icp_match: true,
          icp_checked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Check for existing profile snapshot (free, no API call)
        let hasExistingSnapshot = false;
        if (normalizedLinkedinUrl) {
          const { data: existingSnapshot } = await supabase
            .from("profile_snapshots")
            .select("id, headline, about, experience, raw_text")
            .eq("linkedin_url", normalizedLinkedinUrl)
            .limit(1)
            .maybeSingle();

          if (existingSnapshot) {
            hasExistingSnapshot = true;
            enrichUpdate.snapshot_id = existingSnapshot.id;
            enrichUpdate.profile_enriched_at = new Date().toISOString();
            enrichUpdate.profile_headline = existingSnapshot.headline || null;
            enrichUpdate.profile_about = existingSnapshot.about || null;
            enrichUpdate.enrichment_source = "existing_snapshot";
            enrichUpdate.status = "ready";
            enrichUpdate.next_action_at = new Date().toISOString();
          }
        }

        if (!hasExistingSnapshot) {
          // Credit gate on the no-snapshot path too: do not push leads into the
          // outreach pipeline when the user has no credits left.
          if (!hasCreditsForGate()) {
            await markCreditsExhausted(lead.id, {
              icp_match: true,
              icp_checked_at: enrichUpdate.icp_checked_at,
            });
            continue;
          }

          // No snapshot available — push to pipeline for extension scraping
          enrichUpdate.status = "ready";
          enrichUpdate.enrichment_source = "pending_extension_scrape";
          enrichUpdate.next_action_at = new Date().toISOString();

          const { error: pushError } = await supabase.from("campaign_leads")
            .update(enrichUpdate)
            .eq("id", lead.id);
          if (pushError) throw new Error(`Lead update failed: ${pushError.message}`);

          // Messages are generated after the extension scrapes the profile
          // during visit_profile (they need headline/about to be personalized).
          results.enriched++;
          results.processed++;
          continue;
        }

        // Step 2: Generate messages with AI. Reserve 1 credit atomically first;
        // it is refunded if generation does not complete.
        const reserved = await consumeCredit();
        if (!reserved) {
          // Keep the snapshot enrichment, but do not enter the pipeline.
          const { status: _s, next_action_at: _n, ...enrichOnly } = enrichUpdate;
          await markCreditsExhausted(lead.id, enrichOnly);
          continue;
        }

        const { error: enrichError } = await supabase.from("campaign_leads")
          .update(enrichUpdate)
          .eq("id", lead.id);
        if (enrichError) {
          await refundCredit();
          throw new Error(`Lead update failed: ${enrichError.message}`);
        }
        results.enriched++;

        if (!ANTHROPIC_API_KEY) {
          await refundCredit();
          const { error: enrichedErr } = await supabase.from("campaign_leads")
            .update({ status: "enriched", updated_at: new Date().toISOString() } as any)
            .eq("id", lead.id);
          if (enrichedErr) console.error(`status=enriched update failed for ${lead.id}:`, enrichedErr);
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

        const callAnthropic = async (model: string, system: string, user: string) => {
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model,
              max_tokens: 800,
              temperature: 0.7,
              system,
              messages: [{ role: "user", content: user }],
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
          }

          const aiData = await response.json();
          const contentBlocks = Array.isArray(aiData.content) ? aiData.content : [];
          const content = contentBlocks
            .filter((b: any) => b && b.type === "text")
            .map((b: any) => b.text || "")
            .join("")
            .trim();
          if (!content) throw new Error("No text in AI response");

          let jsonStr = content.trim();
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          }
          if (!jsonStr.startsWith("{")) {
            const start = jsonStr.indexOf("{");
            const end = jsonStr.lastIndexOf("}");
            if (start !== -1 && end !== -1) {
              jsonStr = jsonStr.slice(start, end + 1);
            }
          }
          if (!jsonStr.startsWith("{")) throw new Error("No JSON in AI response");
          return JSON.parse(jsonStr);
        };

        try {
          const messages = await callAnthropic(ANTHROPIC_MODEL_DM, systemPrompt, userPrompt);

          // Validate lengths
          let connectionNote = messages.connection_note || "";
          let customDm = messages.custom_dm || "";
          let customFollowup = messages.custom_followup || "";

          if (connectionNote.length > 200) connectionNote = connectionNote.substring(0, 197) + "...";
          if (customDm.length > 350) customDm = customDm.substring(0, 347) + "...";
          if (customFollowup.length > 280) customFollowup = customFollowup.substring(0, 277) + "...";

          const { error: saveError } = await supabase.from("campaign_leads")
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
          if (saveError) throw new Error(`Saving generated messages failed: ${saveError.message}`);

          const { error: logError } = await supabase.from("activity_log").insert({
            user_id: userId,
            campaign_lead_id: lead.id,
            action: "messages_generated",
            details: { connection_note_length: connectionNote.length, dm_length: customDm.length },
          });
          if (logError) console.error(`activity_log insert failed for ${lead.id}:`, logError);

          results.messages_generated++;
        } catch (aiError) {
          console.error(`AI generation failed for ${lead.id}:`, aiError);
          await refundCredit();
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
          user_id: userId,
          campaign_profile_id,
          type: "connection_notes_ready",
        }),
      }).catch(err => console.error("notify-approval-ready error:", err));
    }

    // Credits were consumed atomically per lead (consume_lead_credits RPC);
    // no read-modify-write of leads_used_this_cycle here.

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
