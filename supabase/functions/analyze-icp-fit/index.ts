/**
 * analyze-icp-fit
 * ───────────────
 * ICP pre-flight analyzer. Given a campaign's ICP definition (description,
 * titles, industries, pain points, value prop), returns:
 *   1. A quality score 0–100
 *   2. Specific weaknesses in the ICP
 *   3. Concrete suggestions to tighten/sharpen it
 *   4. A "simulated" test: does the ICP logic correctly classify 5 canonical
 *      personas (2 clear-yes, 2 clear-no, 1 edge case)?
 *   5. Estimated quality of acceptance/reply rates given the current ICP
 *      shape (very wide ICPs degrade reply rates sharply).
 *
 * This is what lets users avoid burning 200 Scrapin credits on a bad ICP.
 * It is lightweight (one Claude Haiku call + deterministic heuristics)
 * and should run on every save of the campaign wizard.
 *
 * Usage:
 *   POST /functions/v1/analyze-icp-fit
 *   Body:
 *     {
 *       "user_id": "uuid",             // required
 *       "campaign_profile_id": "uuid"  // optional — analyze stored campaign
 *       // OR pass campaign fields inline:
 *       "icp_description": "...",
 *       "icp_titles": ["..."],
 *       "icp_industries": ["..."],
 *       "pain_points": ["..."],
 *       "value_proposition": "...",
 *       "campaign_objective": "book_call"
 *     }
 *
 * Response:
 *   {
 *     score: 72,
 *     verdict: "good" | "ok" | "needs_work" | "broken",
 *     strengths: [ "..." ],
 *     weaknesses: [ "..." ],
 *     suggestions: [ { priority, message, example } ],
 *     simulation: { personas: [{ name, role, expected, verdict, reasoning }] },
 *     projected: { acceptance_tier, reply_tier, notes }
 *   }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IcpInput {
  icp_description?: string | null;
  icp_titles?: string[] | null;
  icp_industries?: string[] | null;
  pain_points?: string[] | null;
  value_proposition?: string | null;
  proof_points?: string | null;
  campaign_objective?: string | null;
  campaign_angle?: string | null;
}

// ─────────────────────────────────────────────────────────────────────
// Deterministic heuristic score — runs even if the AI call fails.
// Scores the ICP 0..100 based on measurable structure quality.
// ─────────────────────────────────────────────────────────────────────
interface Heuristic {
  score: number; // 0..100
  strengths: string[];
  weaknesses: string[];
}

function heuristicScore(icp: IcpInput): Heuristic {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  let score = 0;

  const desc = (icp.icp_description || "").trim();
  const titles = Array.isArray(icp.icp_titles) ? icp.icp_titles.filter(Boolean) : [];
  const industries = Array.isArray(icp.icp_industries) ? icp.icp_industries.filter(Boolean) : [];
  const pains = Array.isArray(icp.pain_points) ? icp.pain_points.filter(Boolean) : [];
  const vp = (icp.value_proposition || "").trim();

  // 1. Description depth (max 25 pts)
  if (desc.length >= 200) { score += 25; strengths.push("ICP description is detailed enough to guide classification."); }
  else if (desc.length >= 100) { score += 15; weaknesses.push("ICP description is short — add 1–2 more sentences about company size, stage, or buying trigger."); }
  else if (desc.length >= 40) { score += 7; weaknesses.push("ICP description is too short to classify leads reliably. Aim for 100+ characters."); }
  else { weaknesses.push("ICP description is missing or nearly empty. The AI has nothing to classify against."); }

  // 2. Titles specificity (max 20 pts)
  if (titles.length >= 3 && titles.length <= 8) { score += 20; strengths.push(`${titles.length} target titles — precise enough to filter without being rigid.`); }
  else if (titles.length > 8) { score += 12; weaknesses.push(`${titles.length} target titles is too broad. Narrow to 3–6 and include seniority modifiers (e.g. 'Head of', 'VP', 'Director').`); }
  else if (titles.length > 0) { score += 7; weaknesses.push("Only 1–2 target titles. Add 2–4 more variants of how the role is named."); }
  else { weaknesses.push("No target titles — ICP gate cannot verify role fit."); }

  // 3. Industries (max 15 pts)
  if (industries.length > 0 && industries.length <= 5) { score += 15; strengths.push("Industries are bounded — enrichment credits stay focused."); }
  else if (industries.length > 5) { score += 8; weaknesses.push("Too many industries. Pick the 2–3 where your case studies apply most strongly."); }
  else { score += 4; weaknesses.push("No industries specified — consider adding 1–3 to improve ICP precision."); }

  // 4. Pain points (max 20 pts)
  if (pains.length >= 2 && pains.length <= 5) { score += 20; strengths.push("Pain points are framed — DMs have real hooks to anchor on."); }
  else if (pains.length > 5) { score += 10; weaknesses.push("Too many pain points — DM writer will pick weaker ones. Keep the top 2–3."); }
  else if (pains.length === 1) { score += 8; weaknesses.push("Only 1 pain point. Add a second so follow-ups can use a different angle."); }
  else { weaknesses.push("No pain points defined — DMs will default to generic value prop statements."); }

  // 5. Value proposition (max 20 pts)
  if (vp.length >= 80) { score += 20; strengths.push("Value proposition is concrete enough for the DM writer to reference."); }
  else if (vp.length >= 40) { score += 12; weaknesses.push("Value proposition is short. Add a quantified outcome (e.g. '30% faster', '$X saved')."); }
  else if (vp.length > 0) { score += 5; weaknesses.push("Value proposition is too vague. Specify WHAT you deliver and HOW it's measured."); }
  else { weaknesses.push("No value proposition — first DM cannot make the ask compelling."); }

  return { score: Math.min(100, score), strengths, weaknesses };
}

function verdictFromScore(score: number): "broken" | "needs_work" | "ok" | "good" | "great" {
  if (score < 30) return "broken";
  if (score < 50) return "needs_work";
  if (score < 70) return "ok";
  if (score < 85) return "good";
  return "great";
}

// ─────────────────────────────────────────────────────────────────────
// AI pass: simulate against canonical personas + suggestion engine.
// ─────────────────────────────────────────────────────────────────────
// Tool schema that forces Claude to return strictly well-formed JSON.
// This is FAR more reliable than asking the model to emit JSON in prose,
// which was producing malformed responses on larger ICPs (>5KB output).
const ICP_ANALYSIS_TOOL = {
  name: "return_icp_analysis",
  description: "Return the structured ICP critique. Must be called exactly once.",
  input_schema: {
    type: "object",
    properties: {
      ai_strengths: {
        type: "array",
        items: { type: "string" },
        description: "1–4 concrete strengths of the current ICP.",
      },
      ai_weaknesses: {
        type: "array",
        items: { type: "string" },
        description: "1–5 concrete, honest weaknesses. No vague praise.",
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            priority: { type: "string", enum: ["high", "medium", "low"] },
            message: { type: "string", description: "One sentence: what to change." },
            example: { type: "string", description: "Optional concrete example." },
          },
          required: ["priority", "message"],
        },
      },
      simulation: {
        type: "object",
        properties: {
          personas: {
            type: "array",
            description: "Exactly 5 personas: 2 clear-yes, 2 clear-no, 1 edge.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                role: { type: "string", description: "Title @ Company type" },
                expected: { type: "string", enum: ["yes", "no", "edge"] },
                verdict: { type: "string", enum: ["yes", "no", "edge"] },
                reasoning: { type: "string" },
              },
              required: ["name", "role", "expected", "verdict", "reasoning"],
            },
          },
        },
        required: ["personas"],
      },
      projected: {
        type: "object",
        properties: {
          acceptance_tier: { type: "string", enum: ["poor", "ok", "good", "great"] },
          reply_tier: { type: "string", enum: ["poor", "ok", "good", "great"] },
          notes: { type: "string" },
        },
        required: ["acceptance_tier", "reply_tier", "notes"],
      },
    },
    required: ["ai_strengths", "ai_weaknesses", "suggestions", "simulation", "projected"],
  },
};

async function aiAnalyze(icp: IcpInput, apiKey: string, model: string): Promise<any | null> {
  const system = `You are a world-class B2B sales strategist specializing in LinkedIn cold outreach ICP design. Your job is to critique a user-defined ICP for specificity, coherence, and market reality. You must be honest, concrete, and actionable — no vague praise.

Rules:
- Generate exactly 5 personas: 2 should clearly match ("yes"), 2 should clearly not match ("no"), 1 should be an edge case ("edge").
- "expected" is what a smart human would say; "verdict" is what the ICP LOGIC would say given the rules. When expected != verdict, that's a gap — call it out in weaknesses.
- "projected" tiers are your best estimate for how well this ICP shape will perform in cold outreach.
- Keep every string concise. No markdown.
- You MUST call the return_icp_analysis tool exactly once. Do not emit any prose.`;

  const user = `ICP Definition:
Description: ${icp.icp_description || "(none)"}
Target titles: ${(icp.icp_titles || []).join(", ") || "(none)"}
Target industries: ${(icp.icp_industries || []).join(", ") || "(none)"}
Pain points: ${(icp.pain_points || []).join(" | ") || "(none)"}
Value proposition: ${icp.value_proposition || "(none)"}
Proof points: ${icp.proof_points || "(none)"}
Objective: ${icp.campaign_objective || "start_conversation"}
Angle: ${icp.campaign_angle || "(none)"}

Analyze this ICP and call return_icp_analysis with your critique.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.4,
      system,
      tools: [ICP_ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "return_icp_analysis" },
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!resp.ok) {
    console.error("anthropic error", resp.status, await resp.text());
    return null;
  }

  const data = await resp.json();
  const blocks = Array.isArray(data.content) ? data.content : [];
  const toolUse = blocks.find((b: any) => b?.type === "tool_use" && b?.name === "return_icp_analysis");
  if (toolUse && toolUse.input && typeof toolUse.input === "object") {
    // Some models occasionally return nested objects as stringified JSON.
    // Re-parse any string fields that should be structured.
    const out: any = { ...toolUse.input };
    // Models occasionally return nested objects as stringified JSON.
    for (const key of ["simulation", "projected"]) {
      if (typeof out[key] === "string") {
        try { out[key] = JSON.parse(out[key]); }
        catch { /* leave as string, handled below */ }
      }
    }
    for (const key of ["ai_strengths", "ai_weaknesses", "suggestions"]) {
      if (typeof out[key] === "string") {
        try { out[key] = JSON.parse(out[key]); }
        catch { /* ignore */ }
      }
    }
    // Normalize simulation: may come as {personas:[...]} or directly [...]
    if (Array.isArray(out.simulation)) {
      out.simulation = { personas: out.simulation };
    } else if (out.simulation && typeof out.simulation === "object" && !Array.isArray(out.simulation.personas)) {
      // maybe {persona1:{}, persona2:{}} — coerce values to array
      const vals = Object.values(out.simulation).filter((v: any) => v && typeof v === "object" && !Array.isArray(v));
      if (vals.length && vals.every((v: any) => "expected" in v || "verdict" in v)) {
        out.simulation = { personas: vals };
      }
    }
    return out;
  }

  // Fallback: some older models may still return text. Try best-effort parse.
  const text = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text || "").join("").trim();
  if (!text) {
    console.error("icp-fit: no tool_use block and no text in response", JSON.stringify(data).slice(0, 500));
    return null;
  }
  let jsonStr = text;
  if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const s = jsonStr.indexOf("{");
  const e = jsonStr.lastIndexOf("}");
  if (s === -1 || e === -1) return null;
  try {
    return JSON.parse(jsonStr.slice(s, e + 1));
  } catch (err) {
    console.error("icp-fit JSON parse fallback error", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const model = Deno.env.get("ANTHROPIC_MODEL_ICP")
      || Deno.env.get("ANTHROPIC_MODEL")
      || "claude-haiku-4-5";

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const user_id: string | undefined = body.user_id;
    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let icp: IcpInput = {
      icp_description: body.icp_description,
      icp_titles: body.icp_titles,
      icp_industries: body.icp_industries,
      pain_points: body.pain_points,
      value_proposition: body.value_proposition,
      proof_points: body.proof_points,
      campaign_objective: body.campaign_objective,
      campaign_angle: body.campaign_angle,
    };

    // If a stored campaign_profile_id was passed, load it as the source of truth.
    if (body.campaign_profile_id) {
      const { data: cp } = await supabase
        .from("campaign_profiles")
        .select("*")
        .eq("id", body.campaign_profile_id)
        .eq("user_id", user_id)
        .single();
      if (cp) {
        icp = {
          icp_description: cp.icp_description,
          icp_titles: cp.icp_titles,
          icp_industries: cp.icp_industries,
          pain_points: cp.pain_points,
          value_proposition: cp.value_proposition,
          proof_points: cp.proof_points,
          campaign_objective: cp.campaign_objective,
          campaign_angle: cp.campaign_angle,
        };
      }
    }

    // Always compute the deterministic heuristic.
    const h = heuristicScore(icp);

    // Attempt AI analysis; fall back gracefully.
    let ai: any = null;
    if (ANTHROPIC_API_KEY) {
      try {
        ai = await aiAnalyze(icp, ANTHROPIC_API_KEY, model);
      } catch (err) {
        console.error("ai analyze failed", err);
      }
    }

    // Merge: AI adds qualitative critique, heuristic anchors the score.
    const strengths = [...h.strengths];
    const weaknesses = [...h.weaknesses];
    if (ai && Array.isArray(ai.ai_strengths)) strengths.push(...ai.ai_strengths);
    if (ai && Array.isArray(ai.ai_weaknesses)) weaknesses.push(...ai.ai_weaknesses);

    // If the AI flagged simulation mismatches, bump down the score slightly.
    let score = h.score;
    if (ai && ai.simulation?.personas) {
      const mismatches = ai.simulation.personas.filter((p: any) => p.expected !== p.verdict).length;
      score = Math.max(0, score - mismatches * 6);
    }

    const verdict = verdictFromScore(score);

    return new Response(JSON.stringify({
      score,
      verdict,
      strengths: strengths.slice(0, 8),
      weaknesses: weaknesses.slice(0, 8),
      suggestions: ai?.suggestions || [],
      simulation: ai?.simulation || null,
      projected: ai?.projected || null,
      ai_available: !!ai,
      updated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-icp-fit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
