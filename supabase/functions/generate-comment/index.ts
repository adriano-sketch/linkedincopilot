// Olanovo — generate-comment edge function
// Generates contextual comments for Growth mode using Claude API.
// Called by schedule-actions when a lead is in "post_liked" status. The draft goes to the
// approval queue (monitored_posts) and the lead waits in "comment_review" until the user decides.
//
// Not every post gets a comment. Before anything is written the post is sorted against the user's
// comment knowledge base (profiles.comment_topics / comment_avoid / comment_examples):
//   on_topic  -> a comment written from what the user works on
//   milestone -> a short, specific congratulation (new role, anniversary, award)
//   off_topic -> no comment; the like already given is the whole interaction
// Without a knowledge base there is nothing to judge relevance against: no comment is drafted.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json } from "../_shared/auth.ts";
import {
  commentRules, hasKnowledgeBase, isSkip, languageLine, loadLearned, OUTAGE_MAX_TRIES, OUTAGE_WAIT_MS, reviewComments, reviewUnavailable, triagePost,
  triageUnavailable, type SenderFacts, type Triage,
} from "../_shared/comment-quality.ts";
import { callClaude, cleanComment, modelWriter, normalizeProfileUrl, parseWriterReply, samePost } from "../_shared/network.ts";

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

// A "what about..." from a supplier under a CEO's post reads as a challenge, not as curiosity.
const SENIOR_TITLE = /\b(ceo|coo|cfo|cto|cio|chief|president[ea]?|diretor[a]?(-presidente)?|director|vp|vice|superintendente|founder|fundador[a]?|owner|s[oó]ci[oa]|partner|head)\b/i;

function pickVariant(leadId: string, authorTitle: string): typeof COMMENT_VARIANTS[0] {
  const pool = SENIOR_TITLE.test(authorTitle) ? COMMENT_VARIANTS.filter((v) => v.key !== "respectful_challenge") : COMMENT_VARIANTS;
  let hash = 0;
  for (let i = 0; i < leadId.length; i++) {
    hash = ((hash << 5) - hash + leadId.charCodeAt(i)) | 0;
  }
  return pool[Math.abs(hash) % pool.length];
}

type Draft = { comment: string; skip: string | null };

/**
 * One draft (or a skip) for one post. The comment follows the POST's language, whatever it is: the
 * language comes from the triage, which read the post, never from the list or the account.
 */
async function writeDraft(a: {
  facts: SenderFacts; triage: Triage; postText: string;
  author: string | null; authorTitle: string; authorCompany: string; hint: string;
  feedback: { previous: string; why: string } | null;
  onModel?: (model: string) => void;
}): Promise<Draft> {
  const user = [
    `POST AUTHOR: ${a.author || "Unknown"} (${a.authorTitle || "role unknown"}${a.authorCompany ? `, ${a.authorCompany}` : ""})`,
    `POST LANGUAGE: ${languageLine(a.triage.language)}`,
    `POST:\n"""\n${a.postText}\n"""`,
    a.hint ? `ANGLE: ${a.hint}` : "",
    a.feedback ? `Your previous draft was REJECTED: "${a.feedback.previous}"\nWhy: ${a.feedback.why}\nWrite a better one or skip.` : "",
  ].filter(Boolean).join("\n\n");
  const system = `${commentRules(a.facts, a.triage.kind, a.triage.topic || "one of the subjects listed above", a.triage.signalReason)}

Reply ONLY with a JSON array with one entry: [{"index": 0, "skip": false, "comment": "..."}] or [{"index": 0, "skip": true, "skip_reason": "<max 12 words>"}]`;
  const text = await callClaude({ model: modelWriter(), system, user, maxTokens: 500, temperature: 0.6, onModel: a.onModel });
  const r = parseWriterReply(text, 1)[0] || {};
  if (r.skip === true || isSkip(r.comment)) return { comment: "", skip: String(r.skip_reason || "nothing specific to add").slice(0, 120) };
  return { comment: cleanComment(String(r.comment)).slice(0, 1200), skip: null };
}

function fail(error: string, status: number): Response {
  return json({ success: false, error }, status);
}

/** Queue statuses that mean the user (or the engine) already dealt with the post. */
const DECIDED = ["approved", "queued", "posted", "dismissed"];

/**
 * Stable identity of a post in the approval queue. LinkedIn's own id when the URL carries one; otherwise
 * the lead plus a hash of the start of the text, so the same post read on another day is the same row.
 * (It used to end in a timestamp, which made every read a new row and hid posts already commented.)
 */
async function postKey(postUrl: string, leadId: string, text: string): Promise<string> {
  const urn = postUrl.match(/urn:li:(?:activity|share|ugcPost):\d+/i);
  if (urn) return urn[0];
  // Counted in characters, not UTF-16 units, so an emoji is one position (as it is in Postgres).
  const start = [...text.toLowerCase().replace(/\s+/g, " ").trim()].slice(0, 300).join("");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(start));
  const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `growth:${leadId}:${hex.slice(0, 24)}`;
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

    // Check of the triage alone, for the service role only: classifies a post text for a user and returns
    // the verdict. It writes nothing and drafts nothing. Used to see how posts are classified before trusting it.
    if (auth.kind === "service" && typeof body.triage_only === "string" && typeof body.user_id === "string") {
      const { data: me } = await supabase.from("profiles")
        .select("sender_name, sender_title, company_name, company_description, proof_points, dm_tone, comment_topics, comment_avoid, comment_examples, comment_views")
        .eq("user_id", body.user_id).maybeSingle();
      // deno-lint-ignore no-explicit-any
      const k = (me || {}) as any;
      const f: SenderFacts = {
        name: k.sender_name, title: k.sender_title, company: k.company_name,
        about: [k.company_description, k.proof_points].filter(Boolean).join(" "), tone: k.dm_tone,
        topics: k.comment_topics, avoid: k.comment_avoid, examples: k.comment_examples, views: k.comment_views,
      };
      // Which model answered each step, reported by the call itself (no shared state between requests).
      const models: { triage: string | null; writer: string | null; reviewer: string | null } = { triage: null, writer: null, reviewer: null };
      const t = await triagePost(body.triage_only.slice(0, 2000), { name: body.author || null, title: body.author_title || null }, f, (m) => { models.triage = m; });
      // triagePost answers "off_topic / triage unavailable" when the model call fails (so that no comment is
      // written). Here that must not be read as a verdict.
      if (triageUnavailable(t)) return json({ success: false, unavailable: true }, 503);
      // With draft: true the writer and the reviewer run as well, on this text only. Still nothing is
      // stored. Used to check what a post in a given language gets before trusting it.
      // It is a check, not the production path: no learned examples, no angle, no company, no rewrite.
      if (body.draft === true && t.kind !== "off_topic") {
        const postText = body.triage_only.slice(0, 2000);
        const author = typeof body.author === "string" ? body.author : "";
        const d = await writeDraft({
          facts: f, triage: t, postText, author,
          authorTitle: typeof body.author_title === "string" ? body.author_title : "", authorCompany: "", hint: "", feedback: null,
          onModel: (m) => { models.writer = m; },
        });
        const [review] = d.skip ? [null] : await reviewComments([{ post: postText, author, comment: d.comment, language: t.language }], f, t.kind, (m) => { models.reviewer = m; });
        return json({ success: true, triage: t, draft: d, review, models });
      }
      return json({ success: true, triage: t, models });
    }

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
        .select("sender_name, sender_title, company_name, company_description, proof_points, dm_tone, comment_topics, comment_avoid, comment_examples, comment_views")
        .eq("user_id", lead.user_id).maybeSingle(),
    ]);
    if (!Deno.env.get("ANTHROPIC_API_KEY")) {
      console.error("generate-comment: ANTHROPIC_API_KEY not configured");
      return fail("Comment generation is not configured", 500);
    }

    const postText = String(lead.post_content).substring(0, 2000);
    // deno-lint-ignore no-explicit-any
    const kb = (me || {}) as any;
    const facts: SenderFacts = {
      name: me?.sender_name, title: me?.sender_title, company: me?.company_name,
      about: [me?.company_description, campaign?.proof_points || me?.proof_points].filter(Boolean).join(" "),
      tone: campaign?.dm_tone || me?.dm_tone,
      topics: kb.comment_topics, avoid: kb.comment_avoid, examples: kb.comment_examples, views: kb.comment_views,
      // What the user's own Inbox decisions show: published comments and rejected drafts.
      learned: await loadLearned(supabase, lead.user_id),
    };
    const author = lead.full_name || null;
    const authorTitle = String(lead.title || lead.profile_current_title || "");
    const authorCompany = String(lead.company || lead.profile_current_company || "");

    // No comment this cycle: the lead rests and tries again with a newer post in 7 days.
    // Returns false when the lead could not be updated, so the caller can answer with an error.
    const restLead = async (action: string, details: Record<string, unknown>, from: string[] = ["post_liked"]): Promise<boolean> => {
      const ts = new Date().toISOString();
      const { error } = await supabase.from("campaign_leads").update({
        status: "engagement_done", comment_text: null, post_url: null, post_content: null,
        last_engagement_at: ts, next_action_at: new Date(Date.now() + 7 * 864e5).toISOString(), updated_at: ts,
      }).eq("id", campaign_lead_id).eq("user_id", lead.user_id).in("status", from);
      if (error) {
        console.error(`generate-comment: could not rest lead ${campaign_lead_id}`, error);
        return false;
      }
      await supabase.from("activity_log").insert({ user_id: lead.user_id, campaign_lead_id, action, details });
      return true;
    };

    if (!hasKnowledgeBase(facts)) {
      await restLead("comment_skipped_no_context", { reason: "comment knowledge base is empty" });
      console.log(`generate-comment: lead ${campaign_lead_id} liked only (no comment knowledge base)`);
      return json({ success: true, skipped: "no_context", lead_id: campaign_lead_id });
    }

    // The user already decided on this very post (published, approved or skipped): the lead rests and no
    // second draft is written. Checked before any model call.
    const postUrl: string = lead.post_url || "";
    const postUrn = await postKey(postUrl, campaign_lead_id, String(lead.post_content));
    const { data: existing, error: existingErr } = await supabase.from("monitored_posts")
      .select("id, status").eq("user_id", lead.user_id).eq("post_urn", postUrn).maybeSingle();
    if (existingErr) {
      console.error("generate-comment: queue lookup failed", existingErr);
      return fail("Failed to check the approval queue", 500);
    }
    if (existing && DECIDED.includes(existing.status)) {
      // A finished post (published or skipped) also releases a lead left in comment_review by a failed
      // clean-up below. An approved or queued post still has its publishing step, which owns the lead.
      const from = ["posted", "dismissed"].includes(existing.status) ? ["post_liked", "comment_review"] : ["post_liked"];
      if (!(await restLead("comment_skipped_already_seen", { reason: `post already ${existing.status}` }, from))) {
        return fail("Failed to update the lead", 500);
      }
      console.log(`generate-comment: lead ${campaign_lead_id} rests (post already ${existing.status})`);
      return json({ success: true, skipped: "post already decided", lead_id: campaign_lead_id });
    }

    // The search of the user's network stores posts under another key. Without this check a contact who
    // is in a list and also turns up in a search gets two drafts for one post, and a post skipped in one
    // place comes back from the other. One touch per person: a draft already waiting for this author, or
    // a comment published to them in the last 7 days, also rests the lead.
    const authorUrl = normalizeProfileUrl(lead.linkedin_url);
    if (authorUrl) {
      // The author's whole history, page by page: a post skipped long ago is still the same post.
      // deno-lint-ignore no-explicit-any
      const theirs: any[] = [];
      // deno-lint-ignore no-explicit-any
      let theirsErr: any = null;
      // Read until a page comes back empty, so the result does not depend on how many rows the API
      // returns per request.
      for (let from = 0; ; ) {
        const { data: page, error } = await supabase.from("monitored_posts")
          .select("id, status, post_text, commented_at, created_at")
          .eq("user_id", lead.user_id).in("author_profile_url", [...new Set([authorUrl, String(lead.linkedin_url)])])
          .order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, from + 999);
        if (error) { theirsErr = error; break; }
        if (!page || page.length === 0) break;
        theirs.push(...page);
        from += page.length;
        if (from > 20000) { theirsErr = new Error("author history too long to read"); break; }
      }
      if (theirsErr) {
        console.error("generate-comment: author lookup failed", theirsErr);
        return fail("Failed to check the approval queue", 500);
      }
      const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
      const WAITING = ["new", "pending", "approved", "queued"];
      // "Busy" has an age limit, so a draft nobody ever decides cannot keep an author out for good:
      // a draft counts while it is at most 14 days old, a post not yet classified for 2 days.
      const since = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
      // deno-lint-ignore no-explicit-any
      const waitingNow = (r: any) => r.status === "new" ? r.created_at >= since(2) : WAITING.includes(r.status) && r.created_at >= since(14);
      // deno-lint-ignore no-explicit-any
      const other = theirs.filter((r: any) => r.id !== existing?.id);
      // deno-lint-ignore no-explicit-any
      const sameOne = other.find((r: any) => [...WAITING, "posted", "dismissed"].includes(r.status) && samePost(r.post_text, postText));
      // deno-lint-ignore no-explicit-any
      const busy = other.find((r: any) => waitingNow(r) || (r.status === "posted" && r.commented_at && r.commented_at >= weekAgo));
      const hit = sameOne || busy;
      if (hit) {
        const why = sameOne ? `same post already ${hit.status} (found by the network search)` : `author already has a comment ${hit.status}`;
        if (!(await restLead("comment_skipped_already_seen", { reason: why }))) return fail("Failed to update the lead", 500);
        console.log(`generate-comment: lead ${campaign_lead_id} rests (${why})`);
        return json({ success: true, skipped: sameOne ? "post already seen" : "author already has a comment", lead_id: campaign_lead_id });
      }
    }

    // The model could not be reached, or its answer could not be read. That says nothing about the post
    // or the draft, so no decision is recorded: the lead stays where it is and the scheduler asks again.
    // Each try is logged and the next one waits an hour. After OUTAGE_MAX_TRIES the lead rests like after
    // any other skip, so a post the model can never answer for does not keep it busy for ever.
    const unavailable = async (step: "triage" | "drafting" | "review") => {
      // Seven days: tries only happen while the extension is connected, and an earlier cycle ended in a 7-day rest.
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const { count, error: countErr } = await supabase.from("activity_log").select("id", { count: "exact", head: true })
        .eq("user_id", lead.user_id).eq("campaign_lead_id", campaign_lead_id).eq("action", "comment_unavailable").gte("created_at", since);
      // Without the count the tries cannot be bounded: treat it as the last one.
      const tries = countErr ? OUTAGE_MAX_TRIES : (count || 0) + 1;
      if (countErr) console.error("generate-comment: could not count earlier tries", countErr);
      if (tries >= OUTAGE_MAX_TRIES) {
        if (!(await restLead("comment_skipped_unavailable", { reason: `${step} unavailable, gave up after ${tries} tries` }))) return fail("Failed to update the lead", 500);
        console.log(`generate-comment: lead ${campaign_lead_id} rests (${step} unavailable, ${tries} tries)`);
        return json({ success: true, skipped: "unavailable", lead_id: campaign_lead_id });
      }
      const { error: waitErr } = await supabase.from("campaign_leads")
        .update({ next_action_at: new Date(Date.now() + 3600e3).toISOString() })
        .eq("id", campaign_lead_id).eq("user_id", lead.user_id).eq("status", "post_liked");
      if (waitErr) console.error(`generate-comment: could not postpone lead ${campaign_lead_id}`, waitErr);
      const { error: logErr } = await supabase.from("activity_log").insert({ user_id: lead.user_id, campaign_lead_id, action: "comment_unavailable", details: { step, tries } });
      // The log is the count: if it cannot be written the tries would never end, so this one is the last.
      if (logErr) {
        console.error(`generate-comment: could not log a try for lead ${campaign_lead_id}`, logErr);
        if (!(await restLead("comment_skipped_unavailable", { reason: `${step} unavailable, tries could not be counted` }))) return fail("Failed to update the lead", 500);
        return json({ success: true, skipped: "unavailable", lead_id: campaign_lead_id });
      }
      console.error(`generate-comment: ${step} unavailable for lead ${campaign_lead_id} (try ${tries}), will be tried again`);
      return json({ success: false, unavailable: step, lead_id: campaign_lead_id }, 503);
    };

    // The hour between tries is kept by the log itself, not only by the lead's next_action_at: if that
    // update failed, the scheduler would call again within minutes and the tries would be used up in
    // an hour. A call that arrives too early does nothing and counts nothing. (Five minutes of slack,
    // so the scheduler's own tick an hour later is not turned away.)
    {
      const { data: lastTry, error: lastTryErr } = await supabase.from("activity_log").select("created_at")
        .eq("user_id", lead.user_id).eq("campaign_lead_id", campaign_lead_id).eq("action", "comment_unavailable")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (lastTryErr) {
        console.error(`generate-comment: could not read the last try for lead ${campaign_lead_id}`, lastTryErr);
        return json({ success: false, unavailable: "waiting", lead_id: campaign_lead_id }, 503);
      }
      const last = lastTry?.created_at ? Date.parse(String(lastTry.created_at)) : NaN;
      if (Number.isFinite(last) && Date.now() - last < OUTAGE_WAIT_MS - 5 * 60e3) {
        console.log(`generate-comment: lead ${campaign_lead_id} tried less than an hour ago, waiting`);
        return json({ success: false, unavailable: "waiting", lead_id: campaign_lead_id }, 503);
      }
    }

    const triage = await triagePost(postText, { name: author, title: authorTitle, company: authorCompany }, facts);
    if (triageUnavailable(triage)) return await unavailable("triage");
    if (triage.kind === "off_topic") {
      await restLead("comment_skipped_off_topic", { reason: triage.reason });
      console.log(`generate-comment: lead ${campaign_lead_id} liked only (off topic: ${triage.reason})`);
      return json({ success: true, skipped: "off_topic", reason: triage.reason, lead_id: campaign_lead_id });
    }
    const variant = triage.kind === "milestone"
      ? { key: "milestone", hint: "" }
      : pickVariant(campaign_lead_id, authorTitle);

    // The comment follows the POST's language, never the campaign's.
    const write = (feedback: { previous: string; why: string } | null) =>
      writeDraft({ facts, triage, postText, author, authorTitle, authorCompany, hint: variant.hint, feedback });

    let draft: Draft;
    let reviewDown = false;
    try {
      draft = await write(null);
      if (!draft.skip) {
        let [rev] = await reviewComments([{ post: postText, author, comment: draft.comment, language: triage.language }], facts, triage.kind);
        // An unreadable review is not feedback to rewrite from, and not a reason to skip the post.
        if (reviewUnavailable(rev)) reviewDown = true;
        else if (!rev.ok) {
          const second = await write({ previous: draft.comment, why: rev.reason });
          if (!second.skip) [rev] = await reviewComments([{ post: postText, author, comment: second.comment, language: triage.language }], facts, triage.kind);
          if (!second.skip && reviewUnavailable(rev)) reviewDown = true;
          else draft = second.skip ? second : (rev.ok ? second : { comment: "", skip: rev.reason });
        }
      }
    } catch (e) {
      // The writer could not be reached or its reply could not be read: counted and tried again, like the others.
      console.error("generate-comment: drafting failed", e instanceof Error ? (e.stack || e.message) : e);
      return await unavailable("drafting");
    }

    if (reviewDown) return await unavailable("review");

    // Nothing worth saying on this post: no comment this cycle, the lead tries again with a newer post in 7 days.
    if (draft.skip || !draft.comment) {
      await restLead("comment_skipped_quality", { reason: draft.skip || "empty", variant: variant.key, kind: triage.kind });
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

    // Shown next to the draft, so the user sees why this post got a comment.
    const whyCommented = triage.kind === "milestone"
      ? "Milestone of a contact"
      : `Your subject: ${triage.topic || "matches what you work on"}`;
    // The author shows a need the user's work addresses: it goes to the top of the Inbox, labelled.
    const signalFields = triage.signal === "none"
      ? (triage.kind === "milestone" ? { signal_type: "milestone", signal_reason: null, priority: 2 } : { signal_type: null, signal_reason: null, priority: 2 })
      : {
        signal_type: triage.signal === "opportunity" ? "business_opportunity" : "pain_point",
        signal_reason: triage.signalReason,
        priority: triage.signal === "opportunity" ? 95 : 90,
      };
    // The same post may already be waiting in the queue (found by a Network search, or a failed attempt):
    // that row gets the new draft instead of a second row.
    let queueErr: unknown = null;
    if (existing) {
      // Drafting took several model calls: only write if the user did not decide on the row meanwhile.
      const { data: written, error } = await supabase.from("monitored_posts").update({
        campaign_lead_id, suggested_comment: commentText, final_comment: null, status: "pending", updated_at: now,
        fit_reason: whyCommented, ...signalFields,
      }).eq("id", existing.id).not("status", "in", `(${DECIDED.join(",")})`).select("id");
      queueErr = error;
      if (!error && (!written || written.length === 0)) {
        // Decided while we were drafting: their decision stands, this draft is dropped and the lead rests.
        if (!(await restLead("comment_skipped_already_seen", { reason: "post decided while the draft was being written" }, ["comment_review"]))) {
          return fail("Failed to update the lead", 500);
        }
        return json({ success: true, skipped: "post already decided", lead_id: campaign_lead_id });
      }
    } else {
      const { error } = await supabase.from("monitored_posts").insert({
        user_id: lead.user_id,
        campaign_lead_id,
        post_urn: postUrn,
        post_url: postUrl || null,
        author_name: lead.full_name || null,
        author_headline: lead.profile_headline || lead.title || null,
        // Stored in the one form the search looks authors up by.
        author_profile_url: authorUrl || lead.linkedin_url || null,
        post_text: String(lead.post_content).slice(0, 5000),
        suggested_comment: commentText,
        status: "pending",
        fit_reason: whyCommented,
        ...signalFields,
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
      kind: triage.kind,
      topic: triage.topic,
      lead_id: campaign_lead_id,
    });
  } catch (err) {
    console.error("generate-comment error:", err);
    return fail("Internal error", 500);
  }
});
