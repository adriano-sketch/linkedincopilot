// LinkedIn Copilot — generate-comment edge function
// Generates contextual comments for Growth mode using Claude API.
// Called by schedule-actions when a lead is in "post_liked" status. The draft goes to the
// approval queue (monitored_posts) and the lead waits in "comment_review" until the user decides.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json } from "../_shared/auth.ts";
import { commentRules, detectLang, isSkip, LANG_NAME, reviewComments, type SenderFacts } from "../_shared/comment-quality.ts";
import { callClaude, cleanComment, modelWriter, parseJsonArray } from "../_shared/network.ts";

// Deployed with verify_jwt=false: authentication is enforced here.
//  - service callers (schedule-actions, pg_cron) may target any lead.
//  - users may only target leads where lead.user_id === auth.userId.

// Comment angles, rotated per lead for natural variety. None of them asks the model to invent
// experience or data: that is what makes AI comments sound fake (see _shared/comment-quality.ts).
const COMMENT_VARIANTS = [
  {
    key: "observation_question",
    hint: "Pick one specific point of the post and ask the follow-up question a curious peer in this field would ask.",
  },
  {
    key: "behind_the_number",
    hint: "If the post has a number or result, ask what is behind it (method, conditions, what changed). Otherwise pick its most concrete claim.",
  },
  {
    key: "practical_consideration",
    hint: "Add one precise practical consideration someone who works in this field would raise about what the post describes. Do not claim personal experience.",
  },
  {
    key: "respectful_challenge",
    hint: "Respectfully raise a 'what about...' angle the author did not cover. Constructive, never confrontational.",
  },
];

function pickVariant(leadId: string): typeof COMMENT_VARIANTS[0] {
  let hash = 0;
  for (let i = 0; i < leadId.length; i++) {
    hash = ((hash << 5) - hash + leadId.charCodeAt(i)) | 0;
  }
  return COMMENT_VARIANTS[Math.abs(hash) % COMMENT_VARIANTS.length];
}

function fail(error: string, status: number): Response {
  return json({ success: false, error }, status);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req, { allowService: true, allowUser: true });
    if (!auth) return fail("Unauthorized", 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const campaign_lead_id: unknown = body.campaign_lead_id;
    if (typeof campaign_lead_id !== "string" || !campaign_lead_id) return fail("campaign_lead_id required", 400);

    // Fetch the lead with post content
    const { data: lead, error: leadErr } = await supabase
      .from("campaign_leads")
      .select("*")
      .eq("id", campaign_lead_id)
      .maybeSingle();

    if (leadErr) {
      console.error("generate-comment: lead lookup failed", leadErr);
      return fail("Failed to load lead", 500);
    }
    // Users may only act on their own leads. Same 404 for "missing" and
    // "not yours" so lead ids of other tenants cannot be probed.
    if (!lead || (auth.kind === "user" && lead.user_id !== auth.userId)) return fail("Lead not found", 404);
    if (!lead.post_content) return fail("No post_content to generate comment for", 400);

    // Fetch campaign profile and the sender's own facts (scoped to the lead owner)
    const [{ data: campaign }, { data: me }] = await Promise.all([
      supabase.from("campaign_profiles")
        .select("icp_description, dm_tone, proof_points")
        .eq("id", lead.campaign_profile_id).eq("user_id", lead.user_id).maybeSingle(),
      supabase.from("profiles")
        .select("sender_name, sender_title, company_name, company_description, proof_points, dm_tone")
        .eq("user_id", lead.user_id).maybeSingle(),
    ]);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      console.error("generate-comment: ANTHROPIC_API_KEY not configured");
      return fail("Comment generation is not configured", 500);
    }

    const variant = pickVariant(campaign_lead_id);
    const postText = String(lead.post_content).substring(0, 2000);
    const facts: SenderFacts = {
      name: me?.sender_name, title: me?.sender_title, company: me?.company_name,
      about: [me?.company_description, campaign?.proof_points || me?.proof_points].filter(Boolean).join(" "),
      tone: campaign?.dm_tone || me?.dm_tone,
    };
    const author = lead.full_name || null;

    // The comment follows the POST's language, never the campaign's.
    const write = async (feedback: { previous: string; why: string } | null): Promise<{ comment: string; skip: string | null }> => {
      const user = [
        `POST AUTHOR: ${author || "Unknown"} (${lead.title || lead.profile_current_title || "role unknown"}${(lead.company || lead.profile_current_company) ? `, ${lead.company || lead.profile_current_company}` : ""})`,
        `POST LANGUAGE: ${LANG_NAME[detectLang(postText)]}`,
        `POST:\n"""\n${postText}\n"""`,
        `ANGLE: ${variant.hint}`,
        feedback ? `Your previous draft was REJECTED: "${feedback.previous}"\nWhy: ${feedback.why}\nWrite a better one or skip.` : "",
      ].filter(Boolean).join("\n\n");
      const system = `${commentRules(facts)}

Reply ONLY with a JSON array with one entry: [{"index": 0, "skip": false, "comment": "..."}] or [{"index": 0, "skip": true, "skip_reason": "<max 12 words>"}]`;
      const text = await callClaude({ model: modelWriter(), system, user, maxTokens: 500, temperature: 0.6 });
      const r = parseJsonArray<{ skip?: boolean; skip_reason?: string; comment?: string }>(text)[0] || {};
      if (r.skip === true || isSkip(r.comment)) return { comment: "", skip: String(r.skip_reason || "nothing specific to add").slice(0, 120) };
      return { comment: cleanComment(String(r.comment)).slice(0, 1200), skip: null };
    };

    let draft: { comment: string; skip: string | null };
    try {
      draft = await write(null);
      if (!draft.skip) {
        let [rev] = await reviewComments([{ post: postText, author, comment: draft.comment }], facts);
        if (!rev.ok) {
          const second = await write({ previous: draft.comment, why: rev.reason });
          if (!second.skip) [rev] = await reviewComments([{ post: postText, author, comment: second.comment }], facts);
          draft = second.skip ? second : (rev.ok ? second : { comment: "", skip: rev.reason });
        }
      }
    } catch (e) {
      console.error("generate-comment: drafting failed", e instanceof Error ? e.message : e);
      return fail("Comment generation failed", 502);
    }

    // Nothing worth saying on this post: no comment this cycle, the lead tries again with a newer post in 7 days.
    if (draft.skip || !draft.comment) {
      const now = new Date().toISOString();
      await supabase.from("campaign_leads").update({
        status: "engagement_done", comment_text: null, post_url: null, post_content: null,
        last_engagement_at: now, next_action_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: now,
      }).eq("id", campaign_lead_id).eq("user_id", lead.user_id).eq("status", "post_liked");
      await supabase.from("activity_log").insert({
        user_id: lead.user_id, campaign_lead_id, action: "comment_skipped_quality",
        details: { reason: draft.skip || "empty", variant: variant.key },
      });
      console.log(`generate-comment: skipped lead ${campaign_lead_id} for quality (${draft.skip})`);
      return json({ success: true, skipped: "quality", reason: draft.skip, lead_id: campaign_lead_id });
    }
    const commentText = draft.comment;

    // The comment is NOT auto-approved: it waits in the dashboard approval queue
    // (Network > Comments), next to the original post. Approving or skipping there moves
    // the lead forward (DB triggers on monitored_posts), and the Growth engine posts it.
    const now = new Date().toISOString();
    const { data: claimed, error: updateErr } = await supabase
      .from("campaign_leads")
      .update({
        comment_text: commentText,
        comment_generated_at: now,
        comment_approved: false,
        comment_approved_at: null,
        status: "comment_review",
        updated_at: now,
      })
      .eq("id", campaign_lead_id)
      .eq("user_id", lead.user_id)
      .eq("status", "post_liked")
      .select("id");

    if (updateErr) {
      console.error("generate-comment: lead update failed", updateErr);
      return fail("Failed to save comment", 500);
    }
    // Another run already handled this lead (status moved on): nothing to queue.
    if (!claimed || claimed.length === 0) return json({ success: true, skipped: "lead not in post_liked", lead_id: campaign_lead_id });

    const postUrl: string = lead.post_url || "";
    const urnMatch = postUrl.match(/urn:li:(?:activity|share|ugcPost):\d+/i);
    const postUrn = urnMatch ? urnMatch[0] : `growth:${campaign_lead_id}:${Date.now()}`;
    // The same post may already be in the queue (found by a Network search).
    const { data: existing } = await supabase.from("monitored_posts")
      .select("id, status").eq("user_id", lead.user_id).eq("post_urn", postUrn).maybeSingle();
    let queueErr: unknown = null;
    if (existing && ["approved", "queued", "posted"].includes(existing.status)) {
      // Already commented (or about to): skip this cycle instead of commenting twice.
      await supabase.from("campaign_leads").update({
        status: "engagement_done", comment_text: null, post_url: null, post_content: null,
        last_engagement_at: now, next_action_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: now,
      }).eq("id", campaign_lead_id).eq("user_id", lead.user_id).eq("status", "comment_review");
      return json({ success: true, skipped: "post already commented", lead_id: campaign_lead_id });
    } else if (existing) {
      const { error } = await supabase.from("monitored_posts").update({
        campaign_lead_id, suggested_comment: commentText, final_comment: null, status: "pending", updated_at: now,
      }).eq("id", existing.id);
      queueErr = error;
    } else {
      const { error } = await supabase.from("monitored_posts").insert({
        user_id: lead.user_id,
        campaign_lead_id,
        post_urn: postUrn,
        post_url: postUrl || null,
        author_name: lead.full_name || null,
        author_headline: lead.profile_headline || lead.title || null,
        author_profile_url: lead.linkedin_url || null,
        post_text: String(lead.post_content).slice(0, 5000),
        suggested_comment: commentText,
        status: "pending",
        priority: 2,
        fit_reason: campaign?.icp_description ? `Growth: ${String(campaign.icp_description).slice(0, 150)}` : "Growth campaign target",
      });
      queueErr = error;
    }
    if (queueErr) {
      // Without a queue row nobody could approve it: put the lead back so it is retried.
      console.error("generate-comment: queue insert failed", queueErr);
      await supabase.from("campaign_leads").update({ status: "post_liked", comment_text: null })
        .eq("id", campaign_lead_id).eq("user_id", lead.user_id).eq("status", "comment_review");
      return fail("Failed to queue comment for approval", 500);
    }

    console.log(`Generated comment for lead ${campaign_lead_id} (variant: ${variant.key})`);

    return json({
      success: true,
      comment_text: commentText,
      variant: variant.key,
      lead_id: campaign_lead_id,
    });
  } catch (err) {
    console.error("generate-comment error:", err);
    return fail("Internal error", 500);
  }
});
