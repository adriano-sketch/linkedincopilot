// network-process
// Internal (service key only). Runs the AI steps of the "Rede" module for one user:
//   1. Scores newly discovered people against their ICP (Haiku, batches of 15).
//   2. Classifies newly captured posts (ICP fit + business signal) with Haiku,
//      then drafts a comment for the ones worth engaging (Sonnet, batches of 5).
// Nothing is published here: drafted comments wait for human approval in the dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";
import { commentRules, detectLang, isSkip, LANG_NAME, reviewComments, type SenderFacts } from "../_shared/comment-quality.ts";
import {
  callClaude, cleanComment, icpBrief, type Icp, matchesExclusion, modelFast, modelWriter, parseJsonArray,
} from "../_shared/network.ts";

const PROSPECT_BATCH = 15;
const MAX_PROSPECTS_PER_RUN = 60;
const POST_CLASSIFY_BATCH = 15;
const MAX_POSTS_PER_RUN = 30;
const DRAFT_BATCH = 5;

// deno-lint-ignore no-explicit-any
type Supa = any;

async function scoreProspects(supabase: Supa, userId: string, icps: Map<string, Icp>) {
  const { data: prospects, error } = await supabase
    .from("network_prospects")
    .select("id, icp_id, full_name, headline, location, current_company, degree, mutual_connections")
    .eq("user_id", userId)
    .eq("status", "discovered")
    .order("created_at", { ascending: true })
    .limit(MAX_PROSPECTS_PER_RUN);
  if (error) throw error;
  if (!prospects || prospects.length === 0) return { scored: 0, qualified: 0 };

  let scored = 0;
  let qualified = 0;
  const byIcp = new Map<string, any[]>();
  for (const p of prospects) {
    const icp = p.icp_id ? icps.get(p.icp_id) : undefined;
    if (!icp) {
      await supabase.from("network_prospects").update({ status: "skipped", last_error: "ICP removed or inactive" }).eq("id", p.id);
      continue;
    }
    if (matchesExclusion(icp, `${p.headline || ""} ${p.current_company || ""}`)) {
      await supabase.from("network_prospects")
        .update({ status: "rejected", fit_score: 0, fit_reason: "Matches an excluded keyword" }).eq("id", p.id);
      scored++;
      continue;
    }
    const list = byIcp.get(icp.id) || [];
    list.push(p);
    byIcp.set(icp.id, list);
  }

  for (const [icpId, list] of byIcp) {
    const icp = icps.get(icpId)!;
    for (let i = 0; i < list.length; i += PROSPECT_BATCH) {
      const batch = list.slice(i, i + PROSPECT_BATCH);
      const people = batch.map((p, idx) => [
        `[${idx}] ${p.full_name || "Unknown"}`,
        p.headline ? `Headline: ${p.headline}` : "",
        p.current_company ? `Company: ${p.current_company}` : "",
        p.location ? `Location: ${p.location}` : "",
        p.mutual_connections != null ? `Mutual connections: ${p.mutual_connections}` : "",
      ].filter(Boolean).join("\n")).join("\n---\n");

      const system = `You qualify LinkedIn profiles for a B2B networking campaign. You only see the short search-result card (name, headline, company, location, mutual connections).
Score each person 0-100 for how well they match the ICP below. Be realistic:
- 85-100: clearly matches role AND company/industry signals.
- 70-84: likely match, minor uncertainty.
- 40-69: partial match (right industry but wrong role, or vice versa).
- 0-39: not a match (students, job seekers outside the ICP, recruiters unless targeted, competitors, unrelated fields).
More mutual connections is a small positive signal, never the main one.

ICP:
${icpBrief(icp)}

Reply ONLY with a JSON array: [{"index": <number>, "score": <0-100>, "reason": "<max 15 words, in Portuguese>"}]`;

      let results: { index: number; score: number; reason: string }[] = [];
      try {
        const text = await callClaude({ model: modelFast(), system, user: people, maxTokens: 1500, temperature: 0.1 });
        results = parseJsonArray(text);
      } catch (e) {
        // Fail closed: leave them as 'discovered' so the next run retries.
        console.error("prospect scoring failed:", e instanceof Error ? e.message : e);
        continue;
      }
      for (const r of results) {
        const p = batch[r.index];
        if (!p) continue;
        const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
        const ok = score >= (icp.min_fit_score ?? 70);
        const { error: upErr } = await supabase.from("network_prospects").update({
          status: ok ? "qualified" : "rejected",
          fit_score: score,
          fit_reason: String(r.reason || "").slice(0, 300),
        }).eq("id", p.id).eq("status", "discovered");
        if (upErr) console.error("prospect update failed:", upErr);
        scored++;
        if (ok) qualified++;
      }
    }
  }
  return { scored, qualified };
}

/** Writes one comment (or a skip) per post. `retry` carries the reviewer's feedback for a second attempt. */
async function writeComments(
  batch: { post: any; signal: string; reason: string }[],
  facts: SenderFacts,
  retry: { previous: string; feedback: string }[] | null,
): Promise<{ comment: string; skip: string | null }[]> {
  const items = batch.map((d, idx) => [
    `[${idx}] Author: ${d.post.author_name || "Unknown"}`,
    d.post.author_headline ? `Headline: ${d.post.author_headline}` : "",
    `Post language: ${LANG_NAME[detectLang(String(d.post.post_text))]}`,
    `Signal: ${d.signal}${d.reason ? ` (${d.reason})` : ""}`,
    `Post:\n${String(d.post.post_text).slice(0, 2000)}`,
    retry ? `Your previous draft was REJECTED: "${retry[idx].previous}"\nWhy: ${retry[idx].feedback}\nWrite a better one or skip.` : "",
  ].filter(Boolean).join("\n")).join("\n=====\n");
  const system = `${commentRules(facts)}

Reply ONLY with a JSON array, one entry per post: [{"index": n, "skip": false, "comment": "..."}] or
[{"index": n, "skip": true, "skip_reason": "<max 12 words>"}]`;
  const text = await callClaude({ model: modelWriter(), system, user: items, maxTokens: 1800, temperature: 0.6 });
  const res = parseJsonArray<{ index: number; skip?: boolean; skip_reason?: string; comment?: string }>(text);
  const out = batch.map(() => ({ comment: "", skip: "no draft returned" as string | null }));
  for (const r of res) {
    if (!out[r.index]) continue;
    if (r.skip === true || isSkip(r.comment)) out[r.index] = { comment: "", skip: String(r.skip_reason || "nothing specific to add").slice(0, 120) };
    else out[r.index] = { comment: cleanComment(String(r.comment)).slice(0, 1200), skip: null };
  }
  return out;
}

async function processPosts(supabase: Supa, userId: string, icps: Map<string, Icp>) {
  const { data: posts, error } = await supabase
    .from("monitored_posts")
    .select("id, icp_id, author_name, author_headline, author_degree, post_text, reactions_count, comments_count, icp_fit, signal_type, signal_reason")
    .eq("user_id", userId)
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(MAX_POSTS_PER_RUN);
  if (error) throw error;
  if (!posts || posts.length === 0) return { classified: 0, drafted: 0 };

  const { data: me } = await supabase
    .from("profiles")
    .select("sender_name, sender_title, company_name, company_description, proof_points, dm_tone")
    .eq("user_id", userId)
    .maybeSingle();

  let classified = 0;
  const toDraft: { post: any; icp: Icp; signal: string; reason: string }[] = [];

  const byIcp = new Map<string, any[]>();
  for (const p of posts) {
    const icp = p.icp_id ? icps.get(p.icp_id) : undefined;
    // Already classified in a previous run (drafting failed): go straight to drafting.
    if (icp && p.signal_type && p.icp_fit === true && p.signal_type !== "ignore") {
      toDraft.push({ post: p, icp, signal: p.signal_type, reason: p.signal_reason || "" });
      continue;
    }
    if (!icp || !p.post_text || p.post_text.trim().length < 40) {
      await supabase.from("monitored_posts").update({
        status: "ignored", icp_fit: false, signal_type: "ignore",
        fit_reason: !icp ? "ICP removed or inactive" : "Post too short to comment meaningfully",
      }).eq("id", p.id);
      classified++;
      continue;
    }
    const list = byIcp.get(icp.id) || [];
    list.push(p);
    byIcp.set(icp.id, list);
  }

  for (const [icpId, list] of byIcp) {
    const icp = icps.get(icpId)!;
    for (let i = 0; i < list.length; i += POST_CLASSIFY_BATCH) {
      const batch = list.slice(i, i + POST_CLASSIFY_BATCH);
      const items = batch.map((p, idx) => [
        `[${idx}] Author: ${p.author_name || "Unknown"}${p.author_degree ? ` (${p.author_degree})` : ""}`,
        p.author_headline ? `Author headline: ${p.author_headline}` : "",
        `Post: ${String(p.post_text).slice(0, 1500)}`,
      ].filter(Boolean).join("\n")).join("\n---\n");

      const system = `You help a B2B professional decide which LinkedIn posts are worth a thoughtful comment.
For each post decide:
1. icp_fit: is the AUTHOR inside this ICP (judge by headline and post context)?
2. signal_type, one of:
   - "business_opportunity": the author describes a need, a project, a search for a vendor/partner, or a problem the sender could help with
   - "hiring": the author's company is hiring for a role related to the sender's offer
   - "pain_point": the author complains about or discusses a pain the ICP typically has
   - "launch": new product, company, office, funding
   - "milestone": promotion, anniversary, award, new job
   - "relationship": good post to engage with, no commercial signal
   - "ignore": job seeking spam, engagement bait, politics, religion, tragedy/grief, sensitive personal news, or nothing useful to add
3. priority 0-100: business_opportunity and hiring rank highest, then pain_point, launch, milestone, relationship.

Sender (who will comment): ${me?.sender_name || "unknown"}, ${me?.sender_title || ""} at ${me?.company_name || ""}. ${me?.company_description || ""}

ICP:
${icpBrief(icp)}

Reply ONLY with a JSON array: [{"index": n, "icp_fit": true|false, "fit_reason": "<max 15 words, Portuguese>", "signal_type": "...", "signal_reason": "<max 20 words, Portuguese, say concretely what the opportunity is>", "priority": 0-100}]`;

      let results: any[] = [];
      try {
        const text = await callClaude({ model: modelFast(), system, user: items, maxTokens: 2500, temperature: 0.1 });
        results = parseJsonArray(text);
      } catch (e) {
        console.error("post classification failed:", e instanceof Error ? e.message : e);
        continue; // fail closed: stays 'new'
      }

      for (const r of results) {
        const p = batch[r.index];
        if (!p) continue;
        const signal = ["business_opportunity", "hiring", "pain_point", "launch", "milestone", "relationship", "ignore"]
          .includes(r.signal_type) ? r.signal_type : "relationship";
        const fit = r.icp_fit === true;
        const keep = fit && signal !== "ignore";
        const { error: upErr } = await supabase.from("monitored_posts").update({
          icp_fit: fit,
          fit_reason: String(r.fit_reason || "").slice(0, 300),
          signal_type: signal,
          signal_reason: String(r.signal_reason || "").slice(0, 400),
          priority: Math.max(0, Math.min(100, Math.round(Number(r.priority) || 50))),
          status: keep ? "new" : "ignored",
        }).eq("id", p.id);
        if (upErr) console.error("post update failed:", upErr);
        classified++;
        if (keep) toDraft.push({ post: p, icp, signal, reason: String(r.signal_reason || "") });
      }
    }
  }

  // Drafting goes through the quality guard (_shared/comment-quality.ts): writer → local checks →
  // strict reviewer → one rewrite with feedback → otherwise the post is skipped (status 'ignored').
  const facts: SenderFacts = {
    name: me?.sender_name, title: me?.sender_title, company: me?.company_name,
    about: [me?.company_description, me?.proof_points].filter(Boolean).join(" "), tone: me?.dm_tone,
  };
  let drafted = 0;
  let skipped = 0;
  for (let i = 0; i < toDraft.length; i += DRAFT_BATCH) {
    const batch = toDraft.slice(i, i + DRAFT_BATCH);
    let drafts: { comment: string; skip: string | null }[];
    try {
      drafts = await writeComments(batch, facts, null);
    } catch (e) {
      console.error("comment drafting failed:", e instanceof Error ? e.message : e);
      continue; // Posts stay 'new' with their classification; next run retries the draft.
    }

    const review = await reviewComments(batch.map((d, k) => ({
      post: String(d.post.post_text), author: d.post.author_name, comment: drafts[k].comment,
    })), facts);
    const retryIdx = batch.map((_, k) => k).filter((k) => !drafts[k].skip && !review[k].ok);
    if (retryIdx.length) {
      try {
        const again = await writeComments(retryIdx.map((k) => batch[k]), facts, retryIdx.map((k) => ({
          previous: drafts[k].comment, feedback: review[k].reason,
        })));
        const review2 = await reviewComments(retryIdx.map((k, j) => ({
          post: String(batch[k].post.post_text), author: batch[k].post.author_name, comment: again[j].comment,
        })), facts);
        retryIdx.forEach((k, j) => {
          drafts[k] = again[j];
          review[k] = again[j].skip ? { ok: false, reason: again[j].skip } : review2[j];
        });
      } catch (e) {
        console.error("comment rewrite failed:", e instanceof Error ? e.message : e);
      }
    }

    for (let k = 0; k < batch.length; k++) {
      const d = batch[k];
      const good = !drafts[k].skip && review[k].ok && !isSkip(drafts[k].comment);
      const update = good
        ? { suggested_comment: drafts[k].comment, status: "pending", last_error: null }
        : { status: "ignored", last_error: `quality skip: ${(drafts[k].skip || review[k].reason || "nothing specific to add").slice(0, 200)}` };
      const { error: upErr } = await supabase.from("monitored_posts").update(update).eq("id", d.post.id).eq("status", "new");
      if (upErr) console.error("draft save failed:", upErr);
      else if (good) drafted++;
      else skipped++;
    }
  }
  return { classified, drafted, skipped_for_quality: skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authenticate(req, { allowService: true, allowUser: false });
  if (!auth) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body.user_id === "string" ? body.user_id : null;
    if (!userId) return json({ error: "user_id required" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: icpRows, error: icpErr } = await supabase
      .from("icps").select("*").eq("user_id", userId).eq("is_active", true);
    if (icpErr) throw icpErr;
    const icps = new Map<string, Icp>((icpRows || []).map((i: any) => [i.id, i as Icp]));

    const prospects = await scoreProspects(supabase, userId, icps);
    const posts = await processPosts(supabase, userId, icps);
    return json({ ok: true, prospects, posts });
  } catch (e) {
    console.error("network-process error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
