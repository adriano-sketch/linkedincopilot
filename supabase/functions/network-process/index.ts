// network-process
// Internal (service key only). Runs the AI steps of the "Rede" module for one user:
//   1. Scores newly discovered people against their ICP (Haiku, batches of 15).
//   2. Classifies newly captured posts (ICP fit + business signal) with Haiku,
//      then drafts a comment for the ones worth engaging (Sonnet, batches of 5).
// Nothing is published here: drafted comments wait for human approval in the dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";
import {
  brokeOnSubject, commentRules, cleanLanguage, draftNotes, factsForPost, hasKnowledgeBase, isSkip, languageLine, loadLearned, numberedAsAsked, outageBatches, outageNext, outageState, readPost, reviewComments, reviewUnavailable, triagePost, triageUnavailable, type PostKind, type Reading, type Review, type SenderFacts,
} from "../_shared/comment-quality.ts";
import {
  callClaude, cleanComment, icpBrief, type Icp, matchesExclusion, modelFast, modelWriter, parseJsonArray, parseWriterReply,
} from "../_shared/network.ts";

const PROSPECT_BATCH = 15;
const MAX_PROSPECTS_PER_RUN = 60;
const POST_CLASSIFY_BATCH = 15;
const MAX_POSTS_PER_RUN = 30;

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
      await supabase.from("network_prospects").update({ status: "skipped", last_error: "Audience removed or inactive" }).eq("id", p.id);
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

Reply ONLY with a JSON array: [{"index": <number>, "score": <0-100>, "reason": "<max 15 words, in English>"}]`;

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
  batch: { post: any; signal: string; reason: string; language?: string }[],
  facts: SenderFacts,
  retry: { previous: string; feedback: string }[] | null,
  kind: PostKind = "on_topic",
  topic = "",
  need = "",
  reading: Reading | null = null,
): Promise<{ comment: string; skip: string | null }[]> {
  const items = batch.map((d, idx) => [
    `[${idx}] Author: ${d.post.author_name || "Unknown"}`,
    d.post.author_headline ? `Headline: ${d.post.author_headline}` : "",
    `Post language: ${languageLine(d.language)}`,
    `Signal: ${d.signal}${d.reason ? ` (${d.reason})` : ""}`,
    `Post:\n${String(d.post.post_text).slice(0, 2000)}`,
    retry ? `Your previous draft was REJECTED${retry[idx].previous ? `: "${retry[idx].previous}"` : "."}\nWhy: ${retry[idx].feedback}\nWrite a better one or skip.` : "",
  ].filter(Boolean).join("\n")).join("\n=====\n");
  const system = `${commentRules(facts, kind, topic, need, reading)}

Reply ONLY with a JSON array, one entry per post: [{"index": n, "skip": false, "comment": "..."}] or
[{"index": n, "skip": true, "skip_reason": "<max 12 words>"}]`;
  const text = await callClaude({ model: modelWriter(), system, user: items, maxTokens: 1800, temperature: 0.6 });
  const res = parseWriterReply(text, batch.length);
  const out = batch.map(() => ({ comment: "", skip: "no draft returned" as string | null }));
  for (const r of res) {
    const i = typeof r.index === "number" ? r.index : -1;
    if (!out[i]) continue;
    if (r.skip === true || isSkip(r.comment)) out[i] = { comment: "", skip: String(r.skip_reason || "nothing specific to add").slice(0, 120) };
    else out[i] = { comment: cleanComment(String(r.comment)).slice(0, 1200), skip: null };
  }
  return out;
}

type DraftInput = { post: any; signal: string; reason: string; language?: string };
type Drafted = { draft: { comment: string; skip: string | null }; rev: Review; down: "" | "reading" | "review"; good: boolean; notes: unknown; subject: string };
/** Posts drafted side by side. Each one is still read, written and reviewed on its own. */
const DRAFTS_AT_ONCE = 4;

/**
 * One post, start to finish: the post is read first (what it is about, which detail to answer, which of
 * the sender's notes bear on it), then written and reviewed. A rejected draft is written once more with
 * none of the sender's subject notes, when it was rejected for what it was about. `down` names a step
 * (reading the post, the review) that could not be read: that is an outage, so no decision is made.
 * Throws when the writer cannot be reached; the caller counts the try.
 */
async function draftPost(d: DraftInput, facts: SenderFacts, kind: PostKind, topic: string, need: string): Promise<Drafted> {
  const text = String(d.post.post_text);
  // A milestone gets a congratulation: there is no subject to pick notes for.
  const reading = kind === "milestone" ? null : await readPost(text, { name: d.post.author_name, title: d.post.author_headline }, facts, need);
  const down = (step: "reading" | "review"): Drafted => ({ draft: { comment: "", skip: null }, rev: { ok: false, reason: "" }, down: step, good: false, notes: null, subject: "" });
  if (reading && !reading.available) return down("reading");
  const own = reading ? factsForPost(facts, reading) : facts;
  const bare = reading ? factsForPost(facts, reading, false) : facts;
  const reviewOf = (comment: string, f: SenderFacts) =>
    reviewComments([{ post: text, author: d.post.author_name, comment, language: d.language, reading }], f, kind);
  let attempts = 1;
  let withoutNotes = false;

  let [draft] = await writeComments([d], own, null, kind, topic, need, reading);
  let rev: Review = { ok: false, reason: draft.skip || "" };
  if (!draft.skip) {
    [rev] = await reviewOf(draft.comment, own);
    if (reviewUnavailable(rev)) return down("review");
    if (!rev.ok) {
      attempts = 2;
      // Rejected for what it was about: the second attempt gets none of the subject notes, and is not shown
      // the first draft (which carried them). Rejected for wording: the notes stay.
      withoutNotes = !!reading && reading.notes.length > 0 && brokeOnSubject(rev);
      const facts2 = withoutNotes ? bare : own;
      const [second] = await writeComments([d], facts2, [{ previous: withoutNotes ? "" : draft.comment, feedback: rev.reason }], kind, topic, need, reading);
      draft = second;
      if (second.skip) rev = { ok: false, reason: second.skip };
      else {
        [rev] = await reviewOf(second.comment, facts2);
        if (reviewUnavailable(rev)) return down("review");
      }
    }
  }
  const good = !draft.skip && rev.ok && !isSkip(draft.comment);
  const outcome = good ? "drafted" : `skipped: ${(draft.skip || rev.reason || "nothing specific to add").slice(0, 160)}`;
  return { draft, rev, down: "", good, notes: draftNotes(facts, reading, { attempts, withoutNotes, outcome }), subject: reading?.subject || "" };
}

async function processPosts(supabase: Supa, userId: string, icps: Map<string, Icp>) {
  const { data: fetched, error } = await supabase
    .from("monitored_posts")
    .select("id, icp_id, campaign_lead_id, post_urn, author_name, author_headline, author_degree, post_text, reactions_count, comments_count, icp_fit, signal_type, signal_reason, last_error")
    .eq("user_id", userId)
    .eq("status", "new")
    .order("created_at", { ascending: true })
    .limit(MAX_POSTS_PER_RUN * 4);
  if (error) throw error;
  // Posts that failed less than an hour ago wait their turn and do not take a place in this run.
  // deno-lint-ignore no-explicit-any
  const posts = (fetched || []).filter((p: any) => !outageState(p.last_error).waiting).slice(0, MAX_POSTS_PER_RUN);
  if (posts.length === 0) return { classified: 0, drafted: 0 };

  const { data: me } = await supabase
    .from("profiles")
    .select("sender_name, sender_title, company_name, company_description, proof_points, dm_tone, comment_topics, comment_avoid, comment_examples, comment_views")
    .eq("user_id", userId)
    .maybeSingle();

  let classified = 0;
  const toDraft: { post: any; icp: Icp; signal: string; reason: string; language?: string }[] = [];

  // The user's comment knowledge base: subjects, what to stay out of, and their own voice.
  const facts: SenderFacts = {
    name: me?.sender_name, title: me?.sender_title, company: me?.company_name,
    about: [me?.company_description, me?.proof_points].filter(Boolean).join(" "), tone: me?.dm_tone,
    // deno-lint-ignore no-explicit-any
    topics: (me as any)?.comment_topics, avoid: (me as any)?.comment_avoid, examples: (me as any)?.comment_examples, views: (me as any)?.comment_views,
    // What the user's own Inbox decisions show: published comments and rejected drafts.
    learned: await loadLearned(supabase, userId),
  };

  // Posts found in the user's own network (post_urn "lc:…", no ICP, no campaign contact) are judged
  // against the knowledge base, exactly like the Growth flow: off-topic posts get no comment.
  const isMyNetwork = (p: any) => !p.icp_id && !p.campaign_lead_id && String(p.post_urn || "").startsWith("lc:");
  let kbDrafted = 0;
  let kbSkipped = 0;
  // The model could not be reached or its answer could not be read: no decision is recorded, the post
  // stays 'new' for the next run, and the try is counted. After OUTAGE_MAX_TRIES it is given up, so a
  // post the model can never answer for is not retried for ever.
  let waiting = 0;
  // deno-lint-ignore no-explicit-any
  const tryLater = async (p: any, step: string) => {
    const next = outageNext(p.last_error, step);
    const update = next.giveUp ? { status: "ignored", last_error: next.lastError } : { last_error: next.lastError };
    const { error: upErr } = await supabase.from("monitored_posts").update(update).eq("id", p.id).eq("user_id", userId).eq("status", "new");
    if (upErr) console.error("could not record an unavailable step:", upErr);
    waiting++;
  };
  for (const p of posts.filter(isMyNetwork)) {
    classified++;
    const ignore = (why: string) => supabase.from("monitored_posts").update({
      status: "ignored", signal_type: "ignore", fit_reason: why.slice(0, 200),
    }).eq("id", p.id).eq("status", "new");
    if (!hasKnowledgeBase(facts)) { await ignore("No comment subjects set"); kbSkipped++; continue; }
    if (!p.post_text || p.post_text.trim().length < 40) { await ignore("Post too short to comment meaningfully"); kbSkipped++; continue; }
    try {
      const triage = await triagePost(String(p.post_text), { name: p.author_name, title: p.author_headline }, facts);
      if (triageUnavailable(triage)) { await tryLater(p, "triage"); continue; }
      if (triage.kind === "off_topic") { await ignore(`Off topic: ${triage.reason}`); kbSkipped++; continue; }
      // The subject the triage matched is not handed to the writer: the post's own subject, as read, leads.
      const item = { post: p, signal: triage.kind, reason: "", language: triage.language };
      const topic = triage.topic || "one of the subjects listed above";
      const res = await draftPost(item, facts, triage.kind, topic, triage.signalReason);
      if (res.down) { await tryLater(p, res.down); continue; }
      const { draft, rev } = res;
      // Shown beside the draft: what the post is about, as read, and not the subject the triage matched.
      const about = triage.kind === "milestone" ? "Milestone of a contact" : (res.subject ? `Post about: ${res.subject}` : `Your subject: ${triage.topic || "one of your subjects"}`).slice(0, 200);
      if (res.good) {
        await supabase.from("monitored_posts").update({
          suggested_comment: draft.comment, status: "pending", last_error: null, draft_notes: res.notes,
          // A need shown by the author goes to the top of the Inbox, labelled (same values as generate-comment).
          signal_type: triage.signal === "opportunity" ? "business_opportunity" : triage.signal === "pain" ? "pain_point"
            : triage.kind === "milestone" ? "milestone" : "relationship",
          ...(triage.signal !== "none" ? { signal_reason: triage.signalReason, priority: triage.signal === "opportunity" ? 95 : 90 } : {}),
          fit_reason: about,
        }).eq("id", p.id).eq("status", "new");
        kbDrafted++;
      } else {
        await supabase.from("monitored_posts").update({
          status: "ignored", last_error: `quality skip: ${(draft.skip || rev.reason || "nothing specific to add").slice(0, 200)}`, draft_notes: res.notes,
          fit_reason: about,
        }).eq("id", p.id).eq("status", "new");
        kbSkipped++;
      }
    } catch (e) {
      // Stays 'new': the next run tries again, a counted number of times.
      console.error("my-network post failed:", e instanceof Error ? e.message : e);
      await tryLater(p, "drafting");
    }
  }

  const byIcp = new Map<string, any[]>();
  for (const p of posts) {
    if (isMyNetwork(p)) continue;
    const icp = p.icp_id ? icps.get(p.icp_id) : undefined;
    // Already classified in a previous run (drafting failed): go straight to drafting.
    if (icp && p.signal_type && p.icp_fit === true && p.signal_type !== "ignore") {
      toDraft.push({ post: p, icp, signal: p.signal_type, reason: p.signal_reason || "" });
      continue;
    }
    if (!icp || !p.post_text || p.post_text.trim().length < 40) {
      await supabase.from("monitored_posts").update({
        status: "ignored", icp_fit: false, signal_type: "ignore",
        fit_reason: !icp ? "Audience removed or inactive" : "Post too short to comment meaningfully",
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
    // deno-lint-ignore no-explicit-any
    for (const batch of outageBatches(list, POST_CLASSIFY_BATCH, (p: any) => outageState(p.last_error).tries >= 2)) {
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

Reply ONLY with a JSON array: [{"index": n, "icp_fit": true|false, "fit_reason": "<max 15 words, in English>", "signal_type": "...", "signal_reason": "<max 20 words, in English, say concretely what the opportunity is>", "priority": 0-100, "language": "<the language the POST is written in, as its English name, e.g. \"German\">"}]`;

      let results: any[] = [];
      try {
        const text = await callClaude({ model: modelFast(), system, user: items, maxTokens: 2500, temperature: 0.1 });
        results = parseJsonArray(text);
        // Misnumbered entries could put one post's verdict on another: the reply is not used at all.
        if (!numberedAsAsked(results, batch.length)) throw new Error("classification reply is not numbered as asked");
      } catch (e) {
        console.error("post classification failed:", e instanceof Error ? e.message : e);
        // Fail closed: they stay 'new' for the next run, a counted number of times.
        for (const p of batch) await tryLater(p, "classification");
        continue;
      }

      const judged = new Set<number>();
      for (const r of results) {
        const p = batch[r.index];
        if (!p) continue;
        judged.add(r.index);
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
        if (keep) toDraft.push({ post: p, icp, signal, reason: String(r.signal_reason || ""), language: cleanLanguage(r.language) });
      }
      // A post the reply left out was not classified: counted and tried again, not left waiting for ever.
      for (let k = 0; k < batch.length; k++) if (!judged.has(k)) await tryLater(batch[k], "classification");
    }
  }

  // Drafting goes through the quality guard (_shared/comment-quality.ts), one post at a time: the post is
  // read first, then writer → local checks → strict reviewer → one rewrite without the sender's subject
  // notes → otherwise the post is skipped (status 'ignored').
  let drafted = kbDrafted;
  let skipped = kbSkipped;
  for (let i = 0; i < toDraft.length; i += DRAFTS_AT_ONCE) {
    const group = toDraft.slice(i, i + DRAFTS_AT_ONCE);
    // A post that fails does not take the others in its group down: each result stands alone.
    const results = await Promise.all(group.map((d) =>
      draftPost(d, facts, "on_topic", "", "").catch((e) => {
        console.error("comment drafting failed:", e instanceof Error ? e.message : e);
        return null;
      })));
    for (let k = 0; k < group.length; k++) {
      const d = group[k];
      const res = results[k];
      // The post stays 'new' with its classification; the next run retries the draft, a counted number of times.
      if (!res) { await tryLater(d.post, "drafting"); continue; }
      if (res.down) { await tryLater(d.post, res.down); continue; }
      const update = res.good
        ? { suggested_comment: res.draft.comment, status: "pending", last_error: null, draft_notes: res.notes }
        : { status: "ignored", last_error: `quality skip: ${(res.draft.skip || res.rev.reason || "nothing specific to add").slice(0, 200)}`, draft_notes: res.notes };
      const { error: upErr } = await supabase.from("monitored_posts").update(update).eq("id", d.post.id).eq("status", "new");
      if (upErr) console.error("draft save failed:", upErr);
      else if (res.good) drafted++;
      else skipped++;
    }
  }
  return { classified, drafted, skipped_for_quality: skipped, waiting_for_retry: waiting };
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
