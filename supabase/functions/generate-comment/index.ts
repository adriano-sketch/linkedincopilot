// LinkedIn Copilot — generate-comment edge function
// Generates contextual comments for Growth mode using Claude API.
// Called by schedule-actions when a lead is in "post_liked" status. The draft goes to the
// approval queue (monitored_posts) and the lead waits in "comment_review" until the user decides.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json } from "../_shared/auth.ts";

// Deployed with verify_jwt=false: authentication is enforced here.
//  - service callers (schedule-actions, pg_cron) may target any lead.
//  - users may only target leads where lead.user_id === auth.userId.

// Comment style variants — rotated per lead for natural variety
const COMMENT_VARIANTS = [
  {
    key: "observation_question",
    hint: "Make a specific observation about one point in the post, then ask a follow-up question. Sound like a curious peer, not a marketer. Max 160 chars.",
  },
  {
    key: "personal_experience",
    hint: "Briefly share a relevant personal experience related to the post topic. Be genuine and specific — not generic. End with an insight or micro-question. Max 180 chars.",
  },
  {
    key: "expand_on_point",
    hint: "Pick one specific claim or idea from the post and expand on it with a fresh angle or nuance the author didn't mention. Max 160 chars.",
  },
  {
    key: "respectful_challenge",
    hint: "Respectfully offer a different perspective or ask a thought-provoking 'what about...' question. Be constructive, never confrontational. Max 160 chars.",
  },
  {
    key: "data_or_example",
    hint: "Reference a relevant data point, case study, or example that supports or enriches the post. Keep it brief and specific. Max 180 chars.",
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

    // Fetch campaign profile for context (scoped to the lead owner)
    const { data: campaign } = await supabase
      .from("campaign_profiles")
      .select("campaign_objective, value_proposition, icp_description, dm_tone, message_language")
      .eq("id", lead.campaign_profile_id)
      .eq("user_id", lead.user_id)
      .maybeSingle();

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      console.error("generate-comment: ANTHROPIC_API_KEY not configured");
      return fail("Comment generation is not configured", 500);
    }

    const variant = pickVariant(campaign_lead_id);
    const language = campaign?.message_language || "English";
    const tone = campaign?.dm_tone || "professional but conversational";

    const systemPrompt = `You are a LinkedIn professional genuinely engaging with content in your feed.
You write brief, authentic comments that add value to the conversation.

RULES:
- Write in ${language}
- Tone: ${tone}
- NEVER be promotional or mention any product/service
- NEVER use generic phrases like "Great post!", "Love this!", "So true!", "Couldn't agree more!"
- Reference a SPECIFIC detail from the post content
- Sound like a real human thinking out loud, not a marketing bot
- Keep it concise — LinkedIn comments that perform best are 1-3 sentences
- Do NOT use hashtags in comments
- Do NOT tag anyone
- Do NOT use emojis excessively (0-1 max)`;

    const userPrompt = `Generate a LinkedIn comment on this post.

POST CONTENT:
"""
${String(lead.post_content).substring(0, 1500)}
"""

POST AUTHOR: ${lead.full_name || "Unknown"}
THEIR ROLE: ${lead.title || lead.profile_current_title || "Unknown"}
THEIR COMPANY: ${lead.company || lead.profile_current_company || "Unknown"}

COMMENT STYLE: ${variant.hint}

Write ONLY the comment text. No quotes, no explanation, no preamble.`;

    // Call Claude API (Haiku for speed + cost)
    const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!anthropicResp.ok) {
      const errText = await anthropicResp.text();
      console.error(`generate-comment: Anthropic API error ${anthropicResp.status}`, errText.substring(0, 300));
      return fail("Comment generation failed", 502);
    }

    const anthropicJson = await anthropicResp.json();
    const commentText = anthropicJson?.content?.[0]?.text?.trim();

    if (!commentText) return fail("Empty comment generated", 502);

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
