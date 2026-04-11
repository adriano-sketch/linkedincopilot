/**
 * classify-reply
 * ──────────────
 * Takes a reply text and asks Claude Haiku (via tool_use to guarantee
 * well-formed JSON) to classify it into:
 *   sentiment: positive | neutral | negative | not_interested | auto_reply
 *   intent:    meeting  | ask_more | reject  | out_of_office | other
 *   summary:   one-line human gloss
 *
 * Then writes the classification back to campaign_leads and — if the
 * intent is "meeting" — advances the lead status to "meeting_booked".
 * If the intent is "reject" or sentiment is "not_interested", advances
 * to "lost" so the follow-up sequence stops.
 *
 * Called fire-and-forget from action-completed right after a reply is
 * detected. Idempotent: if reply_classified_at is already set, we skip.
 *
 * POST /functions/v1/classify-reply
 *   {
 *     "user_id":         "uuid",      // required
 *     "campaign_lead_id":"uuid",      // required
 *     "reply_text":      "text"       // optional — falls back to DB value
 *   }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLASSIFY_TOOL = {
  name: "classify_linkedin_reply",
  description: "Return the sentiment, intent, and one-line summary for a LinkedIn reply to a cold outreach DM.",
  input_schema: {
    type: "object",
    properties: {
      sentiment: {
        type: "string",
        enum: ["positive", "neutral", "negative", "not_interested", "auto_reply"],
        description:
          "positive = interested / open / wants to talk. neutral = question / acknowledgment without commitment. negative = dislikes the pitch but not a hard reject. not_interested = explicit rejection / 'remove me' / 'not a fit'. auto_reply = out-of-office / vacation auto-responder.",
      },
      intent: {
        type: "string",
        enum: ["meeting", "ask_more", "reject", "out_of_office", "other"],
        description:
          "meeting = willing to book a call or proposes a time. ask_more = asks for info/deck/details before committing. reject = explicit no / unsubscribe. out_of_office = auto-responder. other = anything else.",
      },
      summary: {
        type: "string",
        description: "One short sentence (<= 140 chars) in the same language as the reply summarizing what the lead said.",
      },
    },
    required: ["sentiment", "intent", "summary"],
  },
};

async function classify(reply: string, apiKey: string, model: string): Promise<{ sentiment: string; intent: string; summary: string } | null> {
  const system = `You classify replies to cold outreach LinkedIn DMs. Be conservative:
- Only mark "positive" if the lead shows clear interest or willingness to continue the conversation.
- Any explicit rejection ("not interested", "no thanks", "remove me", "unsubscribe", "we don't need") → sentiment=not_interested, intent=reject.
- Auto-responders ("I'm out of office", "on vacation", "maternity leave") → sentiment=auto_reply, intent=out_of_office.
- Questions or neutral requests for info → sentiment=neutral, intent=ask_more.
- Calendar / time / "let's talk" / "send the deck" with clear commitment → sentiment=positive, intent=meeting.
- Keep the summary to one short sentence in the original language.
You MUST call the classify_linkedin_reply tool exactly once. Do not emit prose.`;

  const user = `Reply text:\n"""${reply.slice(0, 3000)}"""`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      temperature: 0.2,
      system,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_linkedin_reply" },
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!resp.ok) {
    console.error("classify-reply: anthropic error", resp.status, await resp.text());
    return null;
  }

  const data = await resp.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const tool = blocks.find((b: any) => b?.type === "tool_use" && b?.name === "classify_linkedin_reply");
  if (!tool || !tool.input || typeof tool.input !== "object") {
    console.error("classify-reply: no tool_use block", JSON.stringify(data).slice(0, 400));
    return null;
  }
  const { sentiment, intent, summary } = tool.input;
  if (!sentiment || !intent) return null;
  return { sentiment, intent, summary: summary || "" };
}

// Terminal statuses for the lead once classification completes.
// Anything else leaves the lead in "replied" so the human can review.
function terminalStatusFor(sentiment: string, intent: string): string | null {
  if (intent === "meeting") return "meeting_booked";
  if (intent === "reject" || sentiment === "not_interested") return "lost";
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    // Hard default to haiku-4-5 — the generic ANTHROPIC_MODEL env var in
    // this project currently points at a deprecated Sonnet build, and this
    // classifier MUST be fast + cheap anyway. Override via
    // ANTHROPIC_MODEL_REPLY_CLASSIFIER if you want to experiment.
    const model =
      Deno.env.get("ANTHROPIC_MODEL_REPLY_CLASSIFIER") ||
      "claude-haiku-4-5";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const user_id: string | undefined = body.user_id;
    const campaign_lead_id: string | undefined = body.campaign_lead_id;
    if (!user_id || !campaign_lead_id) {
      return new Response(JSON.stringify({ error: "user_id and campaign_lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the lead. Skip if already classified (idempotent).
    const { data: lead, error: leadErr } = await supabase
      .from("campaign_leads")
      .select("id, user_id, status, reply_text, reply_classified_at")
      .eq("id", campaign_lead_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (leadErr) throw leadErr;
    if (!lead) {
      return new Response(JSON.stringify({ error: "lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (lead.reply_classified_at) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_classified" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const replyText = (body.reply_text || lead.reply_text || "").toString().trim();
    if (!replyText) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_reply_text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "ANTHROPIC_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classification = await classify(replyText, ANTHROPIC_API_KEY, model);
    if (!classification) {
      // Don't fail loudly — persist reply_text at least and leave
      // sentiment null so a background retry can pick it up later.
      await supabase
        .from("campaign_leads")
        .update({ reply_text: replyText })
        .eq("id", campaign_lead_id);
      return new Response(JSON.stringify({ ok: false, error: "classification_failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const update: Record<string, any> = {
      reply_text: replyText,
      reply_sentiment: classification.sentiment,
      reply_intent: classification.intent,
      reply_classified_at: new Date().toISOString(),
    };

    // Terminal status advancement (optional).
    const nextStatus = terminalStatusFor(classification.sentiment, classification.intent);
    if (nextStatus) {
      update.status = nextStatus;
      update.next_action_at = null; // Stop the sequence.
    }

    const { error: updateErr } = await supabase
      .from("campaign_leads")
      .update(update)
      .eq("id", campaign_lead_id);

    if (updateErr) {
      console.error("classify-reply: update failed", updateErr);
      return new Response(JSON.stringify({ ok: false, error: updateErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      classification,
      next_status: nextStatus,
      summary: classification.summary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("classify-reply error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
