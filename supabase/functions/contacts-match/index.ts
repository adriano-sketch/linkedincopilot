// contacts-match
// Finds, among the user's own LinkedIn connections, the people who fit a Growth campaign.
// Auth: the user's JWT (dashboard) or the service key (network-action-completed, after the
// extension found new connections). Deployed with verify_jwt=false; auth is enforced here.
//
// Body:
//   { op: "keywords", description }                     → { keywords: string[] }
//       Short LinkedIn search terms (PT and EN variants) for the description.
//   { op: "score", campaign_id, description?, rescore? } → { scored, remaining, total }
//       Scores up to MAX_PER_CALL connections not yet scored for this campaign. The dashboard
//       calls it in a loop until remaining = 0. A new description (or rescore=true) clears
//       the previous scores of that campaign first, keeping the user's selections.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, effectiveUserId, json, unauthorized } from "../_shared/auth.ts";
import { callClaude, modelFast, parseJsonArray } from "../_shared/network.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

const BATCH = 40;
const PARALLEL = 4;
const MAX_PER_CALL = BATCH * PARALLEL;

const SYSTEM_SCORE = `You screen a LinkedIn user's existing connections for a relationship-building campaign.
For each person, rate from 0 to 100 how well they match the TARGET description, using only their job title, headline and company.
- 85-100: clearly matches (right role or responsibility, right kind of company)
- 60-84: likely matches (adjacent role, or right role in a company type that is unclear)
- 30-59: weak or unclear match
- 0-29: does not match
Judge the role and responsibilities, not exact words: "Maintenance Manager", "Gerente de Manutenção", "Reliability Engineer" and "Coordenador de Utilidades" can all match a maintenance target.
Students, job seekers and people whose current role is unknown score at most 40.
Reply ONLY with a JSON array, one object per person, in the same order:
[{"i": <index>, "score": <0-100>, "reason": "<max 12 words, in the target's language>"}]`;

const SYSTEM_KEYWORDS = `You turn a description of target people into LinkedIn people-search keywords.
Return 4 to 8 short job-title or responsibility terms, mixing Portuguese and English when the description suggests Brazil, and the description's own language otherwise.
Prefer terms people put in their LinkedIn title (e.g. "gerente de manutenção", "maintenance manager", "eficiência energética").
Reply ONLY with a JSON array of strings.`;

async function scoreBatch(people: any[], description: string): Promise<{ i: number; score: number; reason: string }[]> {
  const lines = people.map((p, i) => {
    const bits = [p.job_title || p.position, p.headline, p.company && `at ${p.company}`].filter(Boolean).join(" | ");
    return `${i}. ${p.full_name || "Unknown"}: ${bits || "no title available"}`;
  }).join("\n");
  const text = await callClaude({
    model: modelFast(),
    system: SYSTEM_SCORE,
    user: `TARGET:\n${description}\n\nPEOPLE:\n${lines}`,
    maxTokens: 2200,
    temperature: 0,
  });
  return parseJsonArray(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authenticate(req, { allowService: true, allowUser: true });
  if (!auth) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const supabase: Supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userId = effectiveUserId(auth, body.user_id);
    if (!userId) return json({ error: "user_id required" }, 400);

    if (body.op === "keywords") {
      const description = String(body.description || "").trim().slice(0, 600);
      if (description.length < 3) return json({ error: "description required" }, 400);
      const text = await callClaude({ model: modelFast(), system: SYSTEM_KEYWORDS, user: description, maxTokens: 300, temperature: 0 });
      const keywords = parseJsonArray<string>(text)
        .map((k) => String(k).replace(/["()]/g, "").trim())
        .filter((k) => k.length >= 3 && k.length <= 60)
        .slice(0, 8);
      return json({ keywords });
    }

    if (body.op !== "score") return json({ error: "unknown op" }, 400);
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
    if (!campaignId) return json({ error: "campaign_id required" }, 400);

    const { data: campaign } = await supabase.from("campaign_profiles")
      .select("id, icp_description").eq("id", campaignId).eq("user_id", userId).maybeSingle();
    if (!campaign) return json({ error: "campaign not found" }, 404);

    let description = String(campaign.icp_description || "").trim();
    const newDescription = typeof body.description === "string" ? body.description.trim().slice(0, 600) : "";
    if (newDescription && newDescription !== description) {
      await supabase.from("campaign_profiles").update({ icp_description: newDescription, updated_at: new Date().toISOString() })
        .eq("id", campaignId).eq("user_id", userId);
      description = newDescription;
    }
    if (description.length < 3) return json({ error: "describe who you are looking for first" }, 400);

    // Scores computed against another description are stale: drop them but keep selections.
    if (newDescription || body.rescore === true) {
      let del = supabase.from("connection_matches").delete()
        .eq("campaign_profile_id", campaignId).eq("user_id", userId).eq("selected", false);
      if (body.rescore !== true) del = del.neq("criteria", description);
      await del;
    }

    const { count: total } = await supabase.from("linkedin_connections")
      .select("id", { count: "exact", head: true }).eq("user_id", userId);

    // Connections not yet scored for this campaign (NOT EXISTS in SQL: no 1000-row API cap).
    const { data: todoRows, error: todoErr } = await supabase.rpc("unscored_connections", {
      p_user_id: userId, p_campaign_id: campaignId, p_limit: MAX_PER_CALL,
    });
    if (todoErr) throw todoErr;
    const todo: any[] = todoRows || [];

    const batches: any[][] = [];
    for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));
    let scored = 0;
    const results = await Promise.allSettled(batches.map(async (batch) => {
      const out = await scoreBatch(batch, description);
      const rows = [];
      for (const r of out) {
        const person = batch[Number(r.i)];
        if (!person) continue;
        const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
        rows.push({
          user_id: userId,
          campaign_profile_id: campaignId,
          connection_id: person.id,
          score,
          reason: String(r.reason || "").slice(0, 200),
          criteria: description,
        });
      }
      // Anyone the model skipped gets a 0 so the loop always finishes.
      const seen = new Set(rows.map((r) => r.connection_id));
      for (const p of batch) {
        if (!seen.has(p.id)) rows.push({ user_id: userId, campaign_profile_id: campaignId, connection_id: p.id, score: 0, reason: "", criteria: description });
      }
      const { error } = await supabase.from("connection_matches")
        .upsert(rows, { onConflict: "campaign_profile_id,connection_id", ignoreDuplicates: true });
      if (error) throw error;
      return rows.length;
    }));
    const failures = results.filter((r) => r.status === "rejected");
    for (const r of results) if (r.status === "fulfilled") scored += r.value;
    if (failures.length) console.error("contacts-match batch failures:", failures.map((f: any) => String(f.reason).slice(0, 200)));

    const { count: doneCount } = await supabase.from("connection_matches")
      .select("id", { count: "exact", head: true }).eq("campaign_profile_id", campaignId).eq("user_id", userId);
    const remaining = Math.max(0, (total || 0) - (doneCount || 0));
    if (scored === 0 && failures.length) return json({ error: "scoring failed, try again", remaining, total }, 502);
    return json({ scored, remaining, total: total || 0 });
  } catch (e) {
    console.error("contacts-match error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
