// generate-dm (patched 2026-10)
// Changes:
//  - Auth required (before: no auth at all; anyone could pass any user_id and spend
//    that user's credits + your Anthropic key). Users act only as themselves and only
//    on their own leads; internal callers use the service key.
//  - Credits reserved atomically BEFORE calling the AI (consume_lead_credits) and refunded
//    on failure. Exhausted credits -> status 'credits_exhausted' (before: 'icp_rejected',
//    which polluted ICP stats and got re-enriched).
//  - jobs row is marked 'fail' with the error (before: stuck in 'running' forever).
//  - On failure the lead's updated_at is bumped so generate-dm-cron backs off 30 min.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMessagePrompts } from "../_shared/ai-prompts.ts";
import { authenticate, corsHeaders, effectiveUserId, json, unauthorized } from "../_shared/auth.ts";
// Shared prompt + helpers live in _shared/ai-prompts.ts

// ─────────────────────────────────────────────────────────────────────
// DM strategy variants. Each variant gives the AI a *different* angle
// of attack. We rotate across variants so we gather enough data to learn
// which ones actually earn replies — per-user, per-campaign, per-vertical.
//
// Keep this list tight (5–7 variants) so each gets statistically meaningful
// sample size. Every variant has:
//   key: unique stable id (what we store + join on later)
//   hook_type: one of curiosity / proof / pain / observation / peer
//   structure: the skeleton the AI should follow
//   length_bucket: short | medium — affects target char count
// ─────────────────────────────────────────────────────────────────────
interface Variant {
  key: string;
  hook_type: "curiosity" | "proof" | "pain" | "observation" | "peer";
  structure: string;
  length_bucket: "short" | "medium";
  hint: string; // injected into the prompt userPrompt
}

const DM_VARIANTS: Variant[] = [
  {
    key: "curiosity_question_v1",
    hook_type: "curiosity",
    structure: "open_with_specific_detail → genuine_question_no_pitch",
    length_bucket: "short",
    hint: "Open by referencing ONE specific detail from their profile (a role, a company focus, an education marker). Then ask one genuine open-ended question tied to that detail. Do NOT mention your product or offer. Target 180–240 chars.",
  },
  {
    key: "proof_point_v1",
    hook_type: "proof",
    structure: "peer_result → transfer_to_them → light_question",
    length_bucket: "medium",
    hint: "Lead with a concrete result a similar peer/company achieved (use a proof point from the campaign). Then pivot with 'wondering if that pattern could apply to [their context]' — and ask one soft question. Target 220–300 chars.",
  },
  {
    key: "pain_mirror_v1",
    hook_type: "pain",
    structure: "name_the_friction → normalize_it → invite_reaction",
    length_bucket: "medium",
    hint: "Name a specific friction that someone in their role typically feels (draw from campaign pain points). Do not diagnose them — frame it as 'most [role]s I talk to are seeing X'. End with 'curious if that matches your experience'. Target 220–300 chars.",
  },
  {
    key: "observation_v1",
    hook_type: "observation",
    structure: "specific_profile_observation → why_it_caught_attention → micro_question",
    length_bucket: "short",
    hint: "State something you genuinely observed about their profile that is NOT generic (a career transition, a rare skill combo, a post topic, an industry shift they rode). Explain in one sentence why it was interesting to you. End with a tiny question. Target 180–240 chars. NO pitch.",
  },
  {
    key: "peer_reference_v1",
    hook_type: "peer",
    structure: "mention_peer_company → shared_context → invitation",
    length_bucket: "medium",
    hint: "Reference a relevant peer company or role they'd recognize (from their industry or competitive landscape). Position your DM as something you'd normally mention to peers in that space. End with a low-friction invitation to chat — not a meeting ask. Target 220–300 chars.",
  },
  {
    key: "short_signal_v1",
    hook_type: "curiosity",
    structure: "one_line_signal → one_line_question",
    length_bucket: "short",
    hint: "Write ONLY two short lines. Line 1: a crisp signal tying you to their world (industry, role, stage). Line 2: a single direct question. Total < 180 chars. No greetings beyond first name. The power is brevity.",
  },
];

/**
 * Pick a variant using simple rotation biased by the lead id so that
 * (a) distinct leads get distinct variants, and (b) the same lead regenerated
 * deterministically picks the same variant (idempotent retries).
 */
function pickVariant(seed: string): Variant {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % DM_VARIANTS.length;
  return DM_VARIANTS[idx];
}


const ADVANCED_STATUSES = new Set([
  "ready", "visiting_profile", "following", "connection_sent",
  "connected", "dm_sent", "waiting_reply", "followup_sent",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticate(req, { allowService: true, allowUser: true });
  if (!auth) return unauthorized();

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  let jobId: string | null = null;
  let creditReserved = false;
  let userId: string | null = null;
  let campaignLeadId: string | null = null;

  try {
    const requestBody = await req.json().catch(() => ({}));
    userId = effectiveUserId(auth, requestBody.user_id);
    campaignLeadId = typeof requestBody.campaign_lead_id === "string" ? requestBody.campaign_lead_id : null;
    if (!userId) return json({ error: "user_id required" }, 400);
    if (!campaignLeadId) return json({ error: "campaign_lead_id required" }, 400);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const ANTHROPIC_MODEL_NOTE = Deno.env.get("ANTHROPIC_MODEL_NOTE")
      || Deno.env.get("ANTHROPIC_MODEL_ICP")
      || "claude-haiku-4-5";
    const ANTHROPIC_MODEL_DM = Deno.env.get("ANTHROPIC_MODEL_DM") || "claude-sonnet-4-6";
    if (!ANTHROPIC_API_KEY) return json({ error: "config_error" }, 500);

    // Lead must belong to the user
    const { data: lead, error: leadError } = await supabase
      .from("campaign_leads")
      .select("*")
      .eq("id", campaignLeadId)
      .eq("user_id", userId)
      .maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return json({ error: "Campaign lead not found" }, 404);

    const { data: masterProfile } = await supabase
      .from("profiles")
      .select("sender_name, sender_title, company_name, company_description")
      .eq("user_id", userId)
      .maybeSingle();
    if (!masterProfile) return json({ error: "User profile not found" }, 404);

    // Campaign profile — lead's campaign, fallback to user's default, fallback to legacy profile
    const campaignProfileId = lead.campaign_profile_id;
    let campaignProfile: any = null;
    if (campaignProfileId) {
      const { data } = await supabase.from("campaign_profiles").select("*")
        .eq("id", campaignProfileId).eq("user_id", userId).maybeSingle();
      campaignProfile = data;
    }
    if (!campaignProfile) {
      const { data } = await supabase.from("campaign_profiles").select("*")
        .eq("user_id", userId).eq("is_default", true).limit(1).maybeSingle();
      campaignProfile = data;
    }
    if (!campaignProfile) {
      const { data: oldProfile } = await supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle();
      if (!oldProfile) return json({ error: "Complete your campaign setup first" }, 400);
      campaignProfile = {
        name: "Default",
        campaign_objective: oldProfile.campaign_objective || "start_conversation",
        value_proposition: oldProfile.value_proposition || oldProfile.offer_focus || "",
        proof_points: oldProfile.proof_points || "",
        icp_description: oldProfile.icp_description || oldProfile.icp || "",
        icp_titles: oldProfile.icp_titles || [],
        pain_points: oldProfile.pain_points || [],
        dm_tone: oldProfile.dm_tone || "professional_warm",
        dm_example: oldProfile.dm_example || "",
      };
    }

    // Reserve one credit atomically (refunded below if generation fails)
    const { data: reserved, error: creditErr } = await supabase.rpc("consume_lead_credits", {
      p_user_id: userId, p_amount: 1,
    });
    if (creditErr) throw creditErr;
    if (!reserved) {
      await supabase.from("campaign_leads").update({
        status: "credits_exhausted",
        error_message: "Lead credits exhausted",
        next_action_at: null,
        updated_at: new Date().toISOString(),
      } as any).eq("id", campaignLeadId).eq("user_id", userId);
      return json({ error: "Lead credits exhausted" }, 402);
    }
    creditReserved = true;

    const { data: job } = await supabase.from("jobs")
      .insert({ user_id: userId, type: "generate_dm", status: "running" })
      .select("id").single();
    jobId = job?.id ?? null;

    const leadName = lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown";
    const leadTitle = lead.title || lead.profile_current_title || "N/A";
    const leadCompany = lead.company || lead.profile_current_company || "N/A";
    const leadHeadline = lead.profile_headline || leadTitle;
    const leadAbout = lead.profile_about || "N/A";
    const currentPositionTitle = lead.profile_current_title || leadTitle;
    const currentPositionCompany = lead.profile_current_company || leadCompany;
    const skillsList = Array.isArray(lead.profile_skills) ? lead.profile_skills.slice(0, 5).join(", ") : "N/A";
    const fullProfileText = [leadHeadline, leadAbout, currentPositionTitle, currentPositionCompany].filter(Boolean).join(" | ");

    let verticalContext: any = null;
    if (campaignProfile.vertical_id) {
      const { data: vertical } = await supabase.from("verticals")
        .select("name, primary_compliance, fear_trigger, default_pain_points")
        .eq("id", campaignProfile.vertical_id).maybeSingle();
      verticalContext = vertical;
    }

    const snapshot = (lead.profile_snapshot && typeof lead.profile_snapshot === "object") ? lead.profile_snapshot as Record<string, any> : {};
    const education = snapshot.education || snapshot.educations;
    const firstEducation = Array.isArray(education) ? education[0] : (typeof education === "object" && education ? education : null);

    const promptInputs = {
      sender: {
        name: masterProfile.sender_name || "Unknown",
        title: masterProfile.sender_title || "",
        company: masterProfile.company_name || "",
        companyDescription: masterProfile.company_description || "",
      },
      campaign: {
        name: campaignProfile.name,
        objective: campaignProfile.campaign_objective,
        tone: campaignProfile.dm_tone,
        angle: campaignProfile.campaign_angle,
        painPoints: Array.isArray(campaignProfile.pain_points) ? campaignProfile.pain_points : [],
        valueProposition: campaignProfile.value_proposition || "",
        proofPoints: campaignProfile.proof_points || "",
        icpDescription: campaignProfile.icp_description || "",
        icpTitles: Array.isArray(campaignProfile.icp_titles) ? campaignProfile.icp_titles : [],
        dmExample: campaignProfile.dm_example || "",
        messageLanguage: campaignProfile.message_language || "English",
      },
      lead: {
        fullName: leadName,
        title: leadTitle,
        company: leadCompany,
        headline: leadHeadline,
        about: leadAbout,
        currentTitle: currentPositionTitle,
        currentCompany: currentPositionCompany,
        currentDescription: "",
        previousTitle: lead.profile_previous_title || "N/A",
        previousCompany: lead.profile_previous_company || "N/A",
        educationSchool: lead.profile_education || "N/A",
        educationDegree: firstEducation?.degreeName || firstEducation?.degree || "N/A",
        educationField: firstEducation?.fieldOfStudy || firstEducation?.field || "N/A",
        skills: skillsList,
        industry: lead.industry || "N/A",
        location: lead.location || "N/A",
        fullProfileText,
      },
      vertical: verticalContext,
    };

    const variant = pickVariant(campaignLeadId);
    const variantInjection = `

══════ STRATEGY VARIANT FOR THIS DM ══════
Variant key: ${variant.key}
Hook type: ${variant.hook_type}
Structure: ${variant.structure}
Length bucket: ${variant.length_bucket}
Guidance: ${variant.hint}
Follow this variant's guidance for the FIRST DM. The follow-up should use a different angle (as always).`;

    const { systemPrompt: noteSystem, userPrompt: noteUser } = buildMessagePrompts(promptInputs, "note");
    const { systemPrompt: dmSystem, userPrompt: dmUserBase } = buildMessagePrompts(promptInputs, "dm_followup");
    const dmUser = dmUserBase + variantInjection;

    const callAnthropic = async (model: string, system: string, user: string) => {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 800, temperature: 0.7, system, messages: [{ role: "user", content: user }] }),
      });
      if (!response.ok) {
        console.error("Anthropic error:", response.status, await response.text());
        throw new Error(`Anthropic API error: ${response.status}`);
      }
      const aiData = await response.json();
      const content = (Array.isArray(aiData.content) ? aiData.content : [])
        .filter((b: any) => b && b.type === "text").map((b: any) => b.text || "").join("").trim();
      if (!content) throw new Error("No text in AI response");
      let jsonStr = content;
      if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      if (!jsonStr.startsWith("{")) {
        const start = jsonStr.indexOf("{");
        const end = jsonStr.lastIndexOf("}");
        if (start !== -1 && end !== -1) jsonStr = jsonStr.slice(start, end + 1);
      }
      if (!jsonStr.startsWith("{")) throw new Error("No JSON in AI response");
      return JSON.parse(jsonStr);
    };

    const [noteArgs, dmArgs] = await Promise.all([
      callAnthropic(ANTHROPIC_MODEL_NOTE, noteSystem, noteUser),
      callAnthropic(ANTHROPIC_MODEL_DM, dmSystem, dmUser),
    ]);

    const args = {
      connection_note: noteArgs.connection_note,
      custom_dm: dmArgs.custom_dm,
      custom_followup: dmArgs.custom_followup,
      personalization_hook: dmArgs.personalization_hook || noteArgs.personalization_hook,
      reasoning: dmArgs.reasoning || noteArgs.reasoning,
    };
    if (!args.connection_note || !args.custom_dm || !args.custom_followup) {
      throw new Error("AI response missing required fields");
    }
    // LinkedIn hard limit for connection notes is 200 chars (300 for premium). Never send an over-limit note.
    if (args.connection_note.length > 200) {
      args.connection_note = args.connection_note.slice(0, 197).replace(/\s+\S*$/, "") + "...";
    }
    if (args.custom_dm.length > 350) console.warn(`custom_dm over limit: ${args.custom_dm.length} chars`);
    if (args.custom_followup.length > 280) console.warn(`custom_followup over limit: ${args.custom_followup.length} chars`);

    const now = new Date().toISOString();
    const { error: gmErr } = await supabase.from("generated_messages").insert({
      user_id: userId,
      connection_note: args.connection_note,
      dm1: args.custom_dm,
      followup1: args.custom_followup,
      reasoning_short: `[${variant.key}] ${args.personalization_hook || ""} | ${args.reasoning || ""}`.substring(0, 500),
      dm_variant: variant.key,
      variant_meta: {
        hook_type: variant.hook_type,
        structure: variant.structure,
        length_bucket: variant.length_bucket,
        campaign_profile_id: campaignProfileId || null,
      },
    } as any);
    if (gmErr) console.error("generated_messages insert failed:", gmErr);

    const updateData: any = {
      connection_note: args.connection_note,
      custom_dm: args.custom_dm,
      dm_text: args.custom_dm,
      custom_followup: args.custom_followup,
      follow_up_text: args.custom_followup,
      dm_generated_at: now,
      messages_generated_at: now,
      dm_variant: variant.key,
      error_message: null,
      updated_at: now,
    };
    if (ADVANCED_STATUSES.has(lead.status)) {
      updateData.next_action_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    } else {
      updateData.status = "pending_approval";
    }

    const { error: updErr } = await supabase.from("campaign_leads").update(updateData)
      .eq("id", campaignLeadId).eq("user_id", userId);
    if (updErr) throw updErr;

    if (jobId) await supabase.from("jobs").update({ status: "success" }).eq("id", jobId);

    return json({
      success: true,
      connection_note: args.connection_note,
      dm1: args.custom_dm,
      followup1: args.custom_followup,
      dm_variant: variant.key,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("generate-dm error:", msg);
    if (creditReserved && userId) {
      const { error: refundErr } = await supabase.rpc("consume_lead_credits", { p_user_id: userId, p_amount: -1 });
      if (refundErr) console.error("credit refund failed:", refundErr);
    }
    if (jobId) await supabase.from("jobs").update({ status: "fail", error: msg.slice(0, 500) }).eq("id", jobId);
    if (campaignLeadId && userId) {
      // Bump updated_at so generate-dm-cron waits before retrying this lead
      await supabase.from("campaign_leads").update({ updated_at: new Date().toISOString() } as any)
        .eq("id", campaignLeadId).eq("user_id", userId);
    }
    return json({ error: "generation_failed" }, 500);
  }
});
