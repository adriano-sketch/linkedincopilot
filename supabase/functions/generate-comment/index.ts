// LinkedIn Copilot — generate-comment edge function
// Generates contextual comments for Growth mode using Claude API.
// Called by schedule-actions when a lead is in "post_liked" status.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { campaign_lead_id, user_id } = await req.json();
    if (!campaign_lead_id) throw new Error("campaign_lead_id required");

    // Fetch the lead with post content
    const { data: lead, error: leadErr } = await supabase
      .from("campaign_leads")
      .select("*, campaign_profile_id")
      .eq("id", campaign_lead_id)
      .single();

    if (leadErr || !lead) throw new Error(`Lead not found: ${leadErr?.message}`);
    if (!lead.post_content) throw new Error("No post_content to generate comment for");

    // Fetch campaign profile for context
    const { data: campaign } = await supabase
      .from("campaign_profiles")
      .select("campaign_objective, value_proposition, icp_description, dm_tone, message_language")
      .eq("id", lead.campaign_profile_id)
      .single();

    // Get Anthropic API key from user settings or env
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY not configured");

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
${lead.post_content.substring(0, 1500)}
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
      throw new Error(`Anthropic API error: ${anthropicResp.status} ${errText.substring(0, 200)}`);
    }

    const anthropicJson = await anthropicResp.json();
    const commentText = anthropicJson?.content?.[0]?.text?.trim();

    if (!commentText) throw new Error("Empty comment generated");

    // Update lead with generated comment
    const now = new Date().toISOString();
    const { error: updateErr } = await supabase
      .from("campaign_leads")
      .update({
        comment_text: commentText,
        comment_generated_at: now,
        comment_approved: true,  // Auto-approve for now (can add approval queue later)
        comment_approved_at: now,
        updated_at: now,
      })
      .eq("id", campaign_lead_id);

    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`);

    console.log(`Generated comment for lead ${campaign_lead_id}: "${commentText.substring(0, 80)}..." (variant: ${variant.key})`);

    return new Response(JSON.stringify({
      success: true,
      comment_text: commentText,
      variant: variant.key,
      lead_id: campaign_lead_id,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("generate-comment error:", err);
    return new Response(JSON.stringify({
      success: false,
      error: (err as Error).message,
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
