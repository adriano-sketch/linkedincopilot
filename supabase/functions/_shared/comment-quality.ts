// Comment quality guard, shared by the Network module (network-process) and Growth (generate-comment).
//
// The product promise: a Olanovo comment never reads like the generic "Impressive results!"
// spam that floods LinkedIn. Every draft goes through three layers before the user sees it:
//   1. The writer prompt (COMMENT_RULES): same language as the post, one concrete detail, no invented
//      experience, no selling, and permission to SKIP when there is nothing worth saying.
//   2. Cheap local checks (localIssues): praise openers, dashes, links, too long.
//   3. A strict reviewer model (reviewComments): "would this comment fit a different post?" If yes,
//      or if it paraphrases the post, invents facts, or pitches, it is rejected.
// Before the writer, the post is read on its own (readPost): what it is about, which detail to answer,
// what is only planned. Only then are the sender's notes looked at, and only the ones that bear on that
// subject reach the writer (factsForPost). A word in common is not a link.
// A rejected draft is rewritten once with the reviewer's feedback and none of the sender's subject
// notes; if it fails again the post is skipped. Three good comments a day beat twenty forgettable ones.
import { callClaude, modelFast, parseJsonArray } from "./network.ts";

/**
 * The post's language as an English name ("German", "Portuguese"), judged by the model that reads the
 * post. This is what the writer is told. Anything that is not a plain language name is dropped.
 */
export function cleanLanguage(x: unknown): string {
  const s = String(x ?? "").normalize("NFC").trim();
  // Letters of any script (with their combining marks, as in हिन्दी), at most four words: a name,
  // never a sentence.
  if (!/^\p{L}[\p{L}\p{M} ()'-]{1,30}$/u.test(s) || s.split(/\s+/).length > 4) return "";
  if (/^(unknown|none|mixed|other|multiple|several|various|n a|na)$/i.test(s)) return "";
  return s;
}

/** The "write in this language" line for the writer. Without a known language: follow the post. */
export function languageLine(language: string | null | undefined): string {
  return cleanLanguage(language) || "the same language as the post";
}

const PRAISE_OPENERS = [
  // English
  "great post", "love this", "so true", "couldn't agree more", "could not agree more", "thanks for sharing",
  "thank you for sharing", "insightful", "impressive", "incredible", "amazing", "awesome", "fantastic",
  "well said", "spot on", "great insights", "great share", "powerful", "this is huge", "congrats on",
  "what a great", "brilliant", "inspiring",
  // Portuguese
  "ótimo post", "otimo post", "excelente post", "excelente reflexão", "excelente conteúdo", "parabéns pelo post",
  "muito bom", "sensacional", "incrível", "incrivel", "impressionante", "que post", "adorei", "perfeito",
  "show de bola", "top demais", "obrigado por compartilhar", "obrigada por compartilhar", "muito interessante",
  // Spanish
  "excelente publicación", "gran post", "muy interesante", "increíble", "gracias por compartir",
];

/** Deterministic problems we never let through. Empty array = passes. */
export function localIssues(comment: string, kind: PostKind = "on_topic"): string[] {
  const c = String(comment || "").trim();
  const issues: string[] = [];
  // Chinese, Japanese and Korean say in one character what other scripts say in a word, so the same
  // limits in characters would reject a complete sentence as too short and allow an essay.
  const dense = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(c);
  if (c.length < (dense ? 8 : 25)) issues.push("too short to say anything specific");
  if (c.length > (dense ? 220 : 450)) issues.push("too long for a LinkedIn comment");
  const head = c.toLowerCase().replace(/^[^\p{L}]+/u, "").slice(0, 40);
  const opener = PRAISE_OPENERS.find((p) => head.startsWith(p));
  // A congratulation is the point of a milestone comment.
  if (opener && kind !== "milestone") issues.push(`opens with generic praise ("${opener}")`);
  if (kind !== "milestone") {
    // A comment has to say something: reject it when every sentence is a question.
    // Sentence ends and question marks of other scripts count too (。！？, the Arabic ؟ and the Urdu ۔).
    const sentences = c.split(/(?<=[.!?])\s+|(?<=[。！？؟۔])\s*/).map((x) => x.trim()).filter(Boolean);
    if (sentences.length && sentences.every((x) => /[?？؟]$/.test(x))) issues.push("is only a question: state a point of view, a question may only close it");
  }
  if (/https?:\/\/|www\./i.test(c)) issues.push("contains a link");
  if (/#\w/.test(c)) issues.push("contains a hashtag");
  if (/[—–]/.test(c)) issues.push("contains a dash typical of AI text");
  // The language is not checked here. A word list can only know a few languages and is wrong for the
  // rest (it read German as English), so it would treat languages differently. The reviewer, which is
  // told the post's language, checks it the same way for every language.
  return issues;
}

export type SenderFacts = {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  about?: string | null; // company description / value proposition / proof points the USER wrote
  tone?: string | null;
  // The user's comment knowledge base (profiles.comment_topics / comment_avoid / comment_examples).
  topics?: string | null;   // subjects where they have something to say
  avoid?: string | null;    // subjects they stay out of
  examples?: string | null; // comments they wrote themselves, as a voice reference
  views?: string | null;    // what they think and have seen on their subjects (profiles.comment_views)
  learned?: Learned | null; // what their own Inbox decisions show (loadLearned)
  // Set by factsForPost: `views` then holds only the notes that bear on ONE post (possibly none), and
  // `voice` the notes about how they write, which apply to every post.
  picked?: boolean;
  voice?: string | null;
};

/**
 * What the user's own decisions in the Inbox teach the writer.
 *   posted   : comments they published, newest first. `edited` = they changed the draft before posting.
 *   rejected : drafts they skipped saying the draft itself was wrong ("not my voice", "too generic").
 * Skips for other reasons (off subject, do not know the person) are about the choice of post, not the
 * wording, so they are stored but not shown to the writer.
 */
export type LearnedComment = { kind: "milestone" | "topic"; text: string; edited: boolean };
export type Learned = {
  posted: LearnedComment[];
  rejected: { kind: "milestone" | "topic"; text: string; reason: string }[];
  /**
   * Edits in which the person changed what the comment was ABOUT, one line each ("On a post about X they
   * dropped Y"). Each one is a sign of what fits a post like that one. It is never a standing rule: the
   * dropped subject may be the right one under another post. Edits of fact, tone or style, and edits
   * whose reason is not clear, are not here.
   */
  corrections?: string[];
};
/** Why a draft was changed before it was published. Keep in sync with the check on monitored_posts.edit_kind. */
export type EditKind = "subject" | "fact" | "tone" | "style" | "unclear";
const EDIT_KINDS: EditKind[] = ["subject", "fact", "tone", "style", "unclear"];
/** How many unclassified edits one run reads. Small: it is one model call, on the way to a draft. */
const EDITS_PER_RUN = 3;
const MAX_CORRECTIONS = 5;

/** Skip reasons the Inbox offers. Keep in sync with the check constraint on monitored_posts.dismiss_reason. */
export const DISMISS_REASONS: Record<string, string> = {
  off_topic: "outside my subjects",
  not_my_voice: "I would not say this",
  too_generic: "too generic",
  dont_know_person: "I do not know this person well enough",
};
const DRAFT_REASONS = ["not_my_voice", "too_generic"];

const kindOf = (signal: unknown): "milestone" | "topic" => (signal === "milestone" ? "milestone" : "topic");
const norm = (t: unknown) => String(t || "").replace(/\s+/g, " ").trim();

/**
 * Reads the user's recent Inbox decisions. Never throws: learning is an improvement, not a dependency,
 * so any failure returns an empty result and the comment is written as before.
 */
// deno-lint-ignore no-explicit-any
export async function loadLearned(supabase: any, userId: string): Promise<Learned> {
  const empty: Learned = { posted: [], rejected: [], corrections: [] };
  try {
    const [posted, rejected] = await Promise.all([
      supabase.from("monitored_posts")
        .select("id, signal_type, post_text, suggested_comment, final_comment, commented_at, edit_kind, edit_note")
        .eq("user_id", userId).eq("status", "posted")
        .order("commented_at", { ascending: false, nullsFirst: false }).limit(40),
      supabase.from("monitored_posts")
        .select("signal_type, suggested_comment, final_comment, dismiss_reason, updated_at")
        .eq("user_id", userId).eq("status", "dismissed").in("dismiss_reason", DRAFT_REASONS)
        .order("updated_at", { ascending: false }).limit(12),
    ]);
    if (posted.error) console.error("loadLearned posted:", posted.error.message);
    if (rejected.error) console.error("loadLearned rejected:", rejected.error.message);
    // deno-lint-ignore no-explicit-any
    const p = ((posted.data || []) as any[]).map((r) => {
      const text = norm(r.final_comment || r.suggested_comment);
      return { kind: kindOf(r.signal_type), text, edited: !!norm(r.suggested_comment) && text !== norm(r.suggested_comment) };
    }).filter((r) => r.text.length >= 25);
    // deno-lint-ignore no-explicit-any
    const j = ((rejected.data || []) as any[]).map((r) => ({
      kind: kindOf(r.signal_type), text: norm(r.final_comment || r.suggested_comment), reason: DISMISS_REASONS[r.dismiss_reason] || "",
    })).filter((r) => r.text.length >= 25 && r.reason);
    // deno-lint-ignore no-explicit-any
    const rows = ((posted.data || []) as any[]);
    await classifyEdits(supabase, userId, rows);
    const corrections = rows.filter((r) => r.edit_kind === "subject" && norm(r.edit_note))
      .map((r) => norm(r.edit_note).slice(0, 260)).slice(0, MAX_CORRECTIONS);
    return { posted: p, rejected: j, corrections };
  } catch (e) {
    console.error("loadLearned failed:", e instanceof Error ? e.message : e);
    return empty;
  }
}

/** True when the person changed the draft before publishing it. */
// deno-lint-ignore no-explicit-any
const wasEdited = (r: any) => !!norm(r.suggested_comment) && !!norm(r.final_comment) && norm(r.final_comment) !== norm(r.suggested_comment);

/** Reads the classifier's reply for one edit. Anything that is not a known kind is "unclear". */
export function readEditVerdict(v: unknown): { kind: EditKind; note: string } {
  const o = (v && typeof v === "object" ? v : {}) as { kind?: unknown; note?: unknown };
  const kind = EDIT_KINDS.includes(o.kind as EditKind) ? (o.kind as EditKind) : "unclear";
  // Only a change of subject carries a note, and a subject change without one teaches nothing.
  const note = kind === "subject" ? norm(o.note).slice(0, 260) : "";
  return kind === "subject" && !note ? { kind: "unclear", note: "" } : { kind, note };
}

/**
 * Says WHY each edited draft was changed (subject, fact, tone, style, or unclear) and stores it on the
 * row, so the reason is worked out once. Changes the rows it is given in place. Never throws: an edit
 * that could not be classified stays unclassified and is tried again on a later run.
 */
// deno-lint-ignore no-explicit-any
async function classifyEdits(supabase: any, userId: string, rows: any[]): Promise<void> {
  const todo = rows.filter((r) => r.id && !r.edit_kind && wasEdited(r)).slice(0, EDITS_PER_RUN);
  if (!todo.length) return;
  const system = `Someone was given a draft of a LinkedIn comment and changed it before publishing. For each case say what kind of change it was. You do not judge the comment.
Exactly one of:
- "subject": they changed what the comment is ABOUT. A subject in the draft was removed or replaced by another one.
- "fact": same subject, but they corrected a fact, a claim or a number.
- "tone": same content, a different attitude (warmer, less sure, less critical, more direct).
- "style": wording, length, rhythm or language only.
- "unclear": you cannot tell, or several of these at once with no main one.
When in doubt, "unclear": a wrong reason is worse than none.
For "subject" only, write a note of at most 35 words, in English, in this shape: "On a post about <what the POST is mainly about>, they dropped <the subject they removed>" and, when they put another subject in its place, " and wrote about <it>". Describe subjects in general words; no names of people or companies. For every other kind the note is empty.
Reply ONLY with a JSON array: [{"index": n, "kind": "...", "note": "..."}]`;
  const user = todo.map((r, i) => [
    `[${i}] POST:\n${String(r.post_text || "").slice(0, 900)}`,
    `DRAFT:\n${norm(r.suggested_comment).slice(0, 600)}`,
    `PUBLISHED:\n${norm(r.final_comment).slice(0, 600)}`,
  ].join("\n")).join("\n=====\n");
  try {
    const text = await callClaude({ model: modelFast(), system, user, maxTokens: 500, temperature: 0 });
    const res = parseJsonArray<{ index: number }>(text);
    if (!numberedAsAsked(res, todo.length)) throw new Error("edit reply is not numbered as asked");
    for (const v of res) {
      const row = todo[v.index];
      const verdict = readEditVerdict(v);
      const { error } = await supabase.from("monitored_posts")
        .update({ edit_kind: verdict.kind, edit_note: verdict.note || null }).eq("id", row.id).eq("user_id", userId);
      if (error) { console.error("could not store an edit reason:", error.message); continue; }
      row.edit_kind = verdict.kind;
      row.edit_note = verdict.note || null;
    }
  } catch (e) {
    console.error("edit classification failed:", e instanceof Error ? e.message : e);
  }
}

/** Picks what to show the writer for one kind of post: edited comments first, then the most recent. */
export function learnedFor(l: Learned | null | undefined, kind: PostKind, maxPosted = 6, maxRejected = 4) {
  const k = kind === "milestone" ? "milestone" : "topic";
  const seen = new Set<string>();
  const uniq = <T extends { text: string }>(list: T[]) => list.filter((r) => {
    const key = r.text.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const same = uniq((l?.posted || []).filter((r) => r.kind === k));
  const posted = [...same.filter((r) => r.edited), ...same.filter((r) => !r.edited)].slice(0, maxPosted);
  const rejected = uniq((l?.rejected || []).filter((r) => r.kind === k)).slice(0, maxRejected);
  return { posted, rejected };
}

/** What a post is, seen from the sender's business. Decides whether and how to comment. */
export type PostKind = "on_topic" | "milestone" | "off_topic";
/** A post in which the author shows a need the sender's work addresses. "none" for everything else. */
export type PostSignal = "opportunity" | "pain" | "none";
/**
 * What triagePost and reviewComments answer when the model could not be reached or its reply could not
 * be read. Both still answer "no" (off topic, not approved) so that nothing is written by mistake, but
 * this is not a judgement of the post or of the draft: callers must try again later, not record a
 * decision. Test with triageUnavailable / reviewUnavailable.
 */
export const TRIAGE_UNAVAILABLE = "triage unavailable";
export const REVIEW_UNAVAILABLE = "review unavailable";
export const triageUnavailable = (t: { kind: string; reason: string }): boolean => t.kind === "off_topic" && t.reason === TRIAGE_UNAVAILABLE;
export const reviewUnavailable = (r: { ok: boolean; reason: string }): boolean => !r.ok && r.reason === REVIEW_UNAVAILABLE;
/**
 * How many times a post is tried again after an outage before it is given up. A post that fails every
 * time (its text makes the model answer in a way that cannot be read) must not be retried for ever.
 */
export const OUTAGE_MAX_TRIES = 6;
/** Tries are an hour apart, so a short outage does not use them all up. */
export const OUTAGE_WAIT_MS = 3600 * 1000;
/**
 * Posts found by the network search keep their count in last_error, as "unavailable: <n> <time of the
 * last try>". Returns the count and whether the hour since the last try is still running.
 */
export function outageState(lastError: string | null | undefined, now = Date.now()): { tries: number; waiting: boolean } {
  const m = /^unavailable: (\d+)(?: (\S+))?$/.exec(String(lastError || ""));
  if (!m) return { tries: 0, waiting: false };
  const at = m[2] ? Date.parse(m[2]) : NaN;
  return { tries: Number(m[1]), waiting: Number.isFinite(at) && now - at < OUTAGE_WAIT_MS };
}
/** What tryLater writes: the next count, or the final "gave up" line (which the reading summary does not count as off topic). */
export function outageNext(lastError: string | null | undefined, step: string, now = Date.now()): { giveUp: boolean; lastError: string } {
  const tries = outageState(lastError, now).tries + 1;
  return tries >= OUTAGE_MAX_TRIES
    ? { giveUp: true, lastError: `gave up: ${step} unavailable after ${tries} tries` }
    : { giveUp: false, lastError: `unavailable: ${tries} ${new Date(now).toISOString()}` };
}
/**
 * True when a reply's entries are numbered the way the prompt asked: every index a whole number, inside
 * the batch, and used once. Anything else (counting from 1, a repeated index) means no entry can be
 * tied to its post with certainty, so the caller treats the whole reply as unreadable.
 */
export function numberedAsAsked(res: unknown, count: number): boolean {
  if (!Array.isArray(res)) return false;
  const seen = new Set<number>();
  for (const r of res) {
    const i = (r as { index?: unknown } | null)?.index;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0 || i >= count || seen.has(i)) return false;
    seen.add(i);
  }
  return true;
}
/**
 * Splits posts into batches for one model call. Posts the caller marks as retried go alone, so a post
 * the model cannot answer for does not take the others in its batch down with it. Callers mark a post
 * from its second failure: one failure is usually a general outage, two point at the post.
 */
export function outageBatches<T>(items: T[], size: number, retried: (item: T) => boolean): T[][] {
  const out: T[][] = [];
  const fresh = items.filter((it) => !retried(it));
  for (let i = 0; i < fresh.length; i += size) out.push(fresh.slice(i, i + size));
  for (const it of items) if (retried(it)) out.push([it]);
  return out;
}

export type Triage = { kind: PostKind; topic: string; reason: string; signal: PostSignal; signalReason: string; language: string };

/** True when the user told us what they work on. Without it there is no basis to judge relevance. */
export function hasKnowledgeBase(f: SenderFacts): boolean {
  return String(f.topics || "").trim().length >= 10;
}

/**
 * Sorts a post before any comment is written:
 *   on_topic  : touches one of the sender's subjects, so they have something real to add
 *   milestone : a personal or professional milestone of the author (new role, anniversary, award)
 *   off_topic : everything else; the post gets a like and no comment
 * Fails closed: if the model cannot answer, the post is off_topic (no comment).
 */
export async function triagePost(
  post: string,
  author: { name?: string | null; title?: string | null; company?: string | null },
  f: SenderFacts,
  onModel?: (model: string) => void,
): Promise<Triage> {
  const system = `You decide whether a LinkedIn post deserves a comment from this person. You do not write the comment.

THE PERSON:
${factsBlock(f)}

Classify the post as exactly one of:
- "on_topic": the post is substantially about one of the subjects listed under "Subjects they have something to say about". A passing mention is not enough: the subject must be what the post is about, or a clear part of it. Belonging to the same department or sharing a word is not enough either: a post about training the sales team, a new procedure manual or a team event is NOT a post about "sales forecasting" or "pricing". Ask yourself: could this person add something specific from that subject without changing the topic of the post? If not, it is off_topic.
- "milestone": the post announces a personal or professional milestone of the AUTHOR (new job or role, promotion, work anniversary, award, graduation, retirement). Company marketing and project announcements are NOT milestones.
- "off_topic": anything else, including posts about a subject the person stays out of, job openings, sponsorships, institutional announcements, politics, motivational text, and posts from the right industry that are not about the person's subjects.
When a post is both a milestone and on topic, answer "on_topic". When in doubt, answer "off_topic": no comment is better than a comment with nothing behind it.

Then, ONLY for an "on_topic" post, say whether the AUTHOR personally shows an OPEN need that this person's work addresses. This is rare: most on-topic posts are "none". All three must be true:
1. The author is on the side that HAS the problem or will BUY: they operate, manage or own the thing (a manufacturer, a hospital, a retailer, a public agency, or the team that runs the operation). An author who sells, advises or promotes in this subject (supplier, vendor, consultant, business development, a company page, someone whose role or headline is about offering these services) is describing other people's problems to attract them: always "none".
2. The need is theirs and specific: something they are looking for, deciding, or failing at now.
3. It is still open. A contract signed, a project started, a centre inaugurated, a result achieved, a partnership announced: these are things already solved or under way, always "none". So is any project the person's own company takes part in.
Then pick:
- "opportunity": they are looking for, planning, tendering or evaluating something in the subject (a supplier or partner search, a request for recommendations, a tender, a budget or programme being set up and not yet awarded).
- "pain": they describe a concrete problem, loss or failure THEY have and have not solved (their own bad numbers, something of theirs that does not work, a constraint they cannot get around).
- "none": everything else, including: opinion and thought-leadership posts, rhetorical questions to the reader ("what would you find if you looked at your own numbers?"), sector statistics and funding news, reports of a busy month, articles, and general statements that a problem exists in the sector.
When in doubt, "none": a false alarm costs the person's attention and their trust in the label.
For "milestone" and "off_topic" posts the signal is always "none".
Reply ONLY with JSON: {"kind": "on_topic"|"milestone"|"off_topic", "topic": "<for on_topic: the matching subject, in the person's words, max 6 words; otherwise empty>", "reason": "<max 14 words, in English>", "signal": "opportunity"|"pain"|"none", "signal_reason": "<for opportunity or pain: what THEY need or struggle with, as a plain statement starting with who (e.g. \"Acme Logistics is looking for...\"), written in English whatever the language of the post, max 18 words; otherwise empty>", "language": "<the language the POST is written in, as its English name, e.g. \"German\", \"Portuguese\", \"Japanese\">"}`;
  const user = [
    `AUTHOR: ${author.name || "Unknown"} (${author.title || "role unknown"}${author.company ? `, ${author.company}` : ""})`,
    `POST:\n"""\n${String(post).slice(0, 2000)}\n"""`,
  ].join("\n\n");
  try {
    const text = await callClaude({ model: modelFast(), system, user, maxTokens: 290, temperature: 0, onModel });
    const m = text.match(/\{[\s\S]*\}/);
    const raw = m ? m[0] : text;
    // A verdict is never repaired: a reply that does not parse is "triage unavailable" (below).
    const parsed: unknown = JSON.parse(raw);
    const r = parsed as { kind?: string; topic?: string; reason?: string; signal?: string; signal_reason?: string; language?: string };
    const kind: PostKind = r.kind === "on_topic" || r.kind === "milestone" ? r.kind : "off_topic";
    const signalReason = String(r.signal_reason || "").trim().slice(0, 200);
    // A signal needs a stated reason; without one it is not shown as a signal.
    const signal: PostSignal = kind === "on_topic" && signalReason && (r.signal === "opportunity" || r.signal === "pain") ? r.signal : "none";
    // The model's own words can never be the outage marker.
    const reason = String(r.reason || "").slice(0, 140);
    return { kind, topic: String(r.topic || "").slice(0, 60), reason: reason === TRIAGE_UNAVAILABLE ? "off topic" : reason, signal, signalReason: signal === "none" ? "" : signalReason, language: cleanLanguage(r.language) };
  } catch (e) {
    console.error("post triage failed:", e instanceof Error ? e.message : e);
    return { kind: "off_topic", topic: "", reason: TRIAGE_UNAVAILABLE, signal: "none", signalReason: "", language: "" };
  }
}

function factsBlock(f: SenderFacts): string {
  // For one post (factsForPost): only the notes that bear on it. What the person sells is background, so
  // the writer knows who is speaking; it is never where the comment's point comes from.
  const notes = f.picked
    ? (norm(f.views)
      ? `Notes of theirs that bear on THIS post (written by them, the only source for opinions and experience):\n${String(f.views).slice(0, 2500)}`
      : "None of their notes bears on this post. The comment comes from the post itself.")
    : (f.views ? `What they think and have seen on these subjects (written by them, the only source for opinions and experience):\n${String(f.views).slice(0, 2500)}` : "");
  const lines = [
    f.name ? `Name: ${f.name}` : "",
    f.title ? `Role: ${f.title}` : "",
    f.company ? `Company: ${f.company}` : "",
    f.about ? `What they do (written by them${f.picked ? "; background only, never the point of the comment" : ""}): ${String(f.about).slice(0, 700)}` : "",
    f.topics ? `Subjects they have something to say about: ${String(f.topics).slice(0, 600)}` : "",
    f.avoid ? `Subjects they stay out of: ${String(f.avoid).slice(0, 400)}` : "",
    notes,
    norm(f.voice) ? `How they write and what they never do (written by them):\n${String(f.voice).slice(0, 1200)}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(no facts provided)";
}

/** The person's notes (profiles.comment_views), one per paragraph. */
export function splitNotes(views: string | null | undefined): string[] {
  return String(views || "").split(/\n\s*\n/).map((n) => n.replace(/\s+/g, " ").trim()).filter((n) => n.length >= 12).slice(0, 14);
}

/**
 * What a post says, read BEFORE anything the sender knows is looked at, and then which of the sender's
 * notes bear on it. `available: false` means the model could not answer: the comment is then written
 * with none of the notes, which is the safe side.
 */
export type Reading = {
  available: boolean;
  subject: string; // what the post is mainly about
  intent: string;  // what the author is doing
  detail: string;  // the concrete detail worth answering ("" when the post has none)
  plans: string;   // what the post presents as planned or future, not achieved
  notes: number[]; // notes that bear on the subject (indexes into splitNotes)
  voice: number[]; // notes about how the person writes
  why: string;     // why notes were used or left out
};
const NO_READING: Reading = { available: false, subject: "", intent: "", detail: "", plans: "", notes: [], voice: [], why: "reading unavailable" };

/** Turns the model's reply into a Reading. Indexes outside the notes are dropped; a voice note is never knowledge. */
export function readReading(v: unknown, noteCount: number): Reading {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const idx = (x: unknown) => [...new Set((Array.isArray(x) ? x : []).filter((n) => typeof n === "number" && Number.isInteger(n) && n >= 0 && n < noteCount) as number[])];
  const voice = idx(o.voice);
  const subject = norm(o.subject).slice(0, 160);
  if (!subject) return NO_READING;
  return {
    available: true, subject, intent: norm(o.intent).slice(0, 120), detail: norm(o.detail).slice(0, 260), plans: norm(o.plans).slice(0, 260),
    notes: idx(o.notes).filter((n) => !voice.includes(n)), voice, why: norm(o.why).slice(0, 220),
  };
}

export async function readPost(
  post: string,
  author: { name?: string | null; title?: string | null; company?: string | null },
  f: SenderFacts,
  onModel?: (model: string) => void,
): Promise<Reading> {
  const notes = splitNotes(f.views);
  const corrections = (f.learned?.corrections || []).slice(0, MAX_CORRECTIONS);
  const system = `You read a LinkedIn post before someone comments on it. You do not write the comment.

STEP 1. From the post alone, before you look at anything else:
- "subject": what the post is mainly about, max 14 words.
- "intent": what the author is doing (reporting a result, announcing a talk, asking for something, giving an opinion), max 10 words.
- "detail": the one concrete detail most worth answering (a number, a result, a method, a claim), taken from the post, max 25 words. Empty when the post has no concrete detail.
- "plans": what the post presents as planned, future or under development and NOT yet achieved, max 25 words. Empty when there is none. A reported result is not a plan.

STEP 2. Only now look at the person's NOTES. They are numbered.
- "notes": the numbers of the notes that say something directly about the SUBJECT from step 1, so that a comment on that detail could use them without changing the topic of the post. A shared word is not enough: a note about choosing which pipes to replace does not bear on a post about connecting control systems, even though both say "assets". A note about a product the person sells bears on a post only when the post is about what that product does. When you are not sure, leave the note out. An empty list is a good answer.
- "voice": the numbers of the notes that are about HOW the person writes or what they never do (style, tone, limits), not about a subject. These apply to every post.
- "why": one line, max 25 words: why you used those notes or left the others out.
${corrections.length ? `\nEarlier, this person corrected drafts that brought in the wrong subject. Each line is about ONE kind of post. Use it for posts like that one only; it is not a rule against the subject:\n${corrections.map((c) => `- ${c}`).join("\n")}\n` : ""}
Write subject, intent, detail, plans and why in English, whatever the language of the post.
Reply ONLY with JSON: {"subject": "...", "intent": "...", "detail": "...", "plans": "...", "notes": [n], "voice": [n], "why": "..."}`;
  const user = [
    `AUTHOR: ${author.name || "Unknown"} (${author.title || "role unknown"}${author.company ? `, ${author.company}` : ""})`,
    `POST:\n"""\n${String(post).slice(0, 2000)}\n"""`,
    notes.length ? `NOTES:\n${notes.map((n, i) => `[${i}] ${n.slice(0, 500)}`).join("\n")}` : "NOTES: (none)",
  ].join("\n\n");
  try {
    const text = await callClaude({ model: modelFast(), system, user, maxTokens: 420, temperature: 0, onModel });
    const m = text.match(/\{[\s\S]*\}/);
    return readReading(JSON.parse(m ? m[0] : text), notes.length);
  } catch (e) {
    console.error("post reading failed:", e instanceof Error ? e.message : e);
    return NO_READING;
  }
}

/**
 * The facts the writer and the reviewer get for ONE post: the notes the reading picked, and the notes
 * about voice. With `withNotes: false` (the second attempt after a rejected draft) no subject note at all.
 */
export function factsForPost(f: SenderFacts, reading: Reading, withNotes = true): SenderFacts {
  const notes = splitNotes(f.views);
  const pick = (list: number[]) => list.map((i) => notes[i]).filter(Boolean).join("\n\n");
  return { ...f, picked: true, views: withNotes ? pick(reading.notes) : "", voice: pick(reading.voice) };
}

/** What a draft was built from, kept with the post for diagnosis. Not shown to the person by default. */
export function draftNotes(f: SenderFacts, reading: Reading | null, o: { attempts: number; withoutNotes: boolean; outcome: string }) {
  if (!reading) return { reading: null, ...o };
  const notes = splitNotes(f.views);
  const head = (i: number) => notes[i]?.slice(0, 70) || "";
  const left = notes.map((_, i) => i).filter((i) => !reading.notes.includes(i) && !reading.voice.includes(i));
  return {
    reading: reading.available, subject: reading.subject, intent: reading.intent, detail: reading.detail, plans: reading.plans,
    notes_used: (o.withoutNotes ? [] : reading.notes).map(head), notes_left: [...(o.withoutNotes ? reading.notes : []), ...left].map(head),
    voice_notes: reading.voice.map(head), why: reading.why, ...o,
  };
}

function voiceBlock(f: SenderFacts, kind: PostKind = "on_topic"): string {
  const ex = String(f.examples || "").trim();
  const { posted, rejected } = learnedFor(f.learned, kind);
  const parts: string[] = [];
  if (ex) parts.push(`Comments this person wrote themselves. Match their voice, length and rhythm. Do not copy their content:\n"""\n${ex.slice(0, 1200)}\n"""`);
  if (posted.length) {
    const lines = posted.map((r) => `- ${r.edited ? "[rewritten by them] " : ""}${r.text.slice(0, 320)}`).join("\n");
    parts.push(`Comments this person recently published on posts of this kind. They approved every one; the ones marked
"rewritten by them" are in their own words and count the most. Use them ONLY for voice, length and rhythm. They are
not a guide to what to write about: each one answered its own post, and the subject of this comment comes from THIS
post. Never reuse their sentences, their opening or their structure, and never write a comment that could be one of
these with a few words swapped:\n${lines}`);
  }
  if (rejected.length) {
    const lines = rejected.map((r) => `- "${r.text.slice(0, 280)}" (their reason: ${r.reason})`).join("\n");
    parts.push(`Drafts this person REJECTED, with their reason. Do not write anything that has the same problem:\n${lines}`);
  }
  return parts.length ? `\n${parts.join("\n\n")}\n` : "";
}

/** Rules for a milestone post: a short, specific congratulation. No question, no analysis. */
function milestoneRules(f: SenderFacts): string {
  return `You write LinkedIn comments for this person. These are the ONLY facts you know about them:
${factsBlock(f)}
${voiceBlock(f, "milestone")}
The post announces a milestone of its author (new role, anniversary, award). The comment is what a colleague from the
same industry would write: a short, warm, specific congratulation.

Hard rules:
- Write in the SAME language as the post, whatever language that is. Never translate into the language of these instructions.
- 1 or 2 short sentences, under 200 characters.
- Name the specific milestone (the role, the company, the number of years). Never a generic "Congratulations!".
- No question that makes the author explain or justify anything. No analysis, no advice, no "what about".
- NEVER invent a shared history, a past meeting or an opinion about their work. Only use the facts above.
- Never sell, never mention the sender's company, products or services, no links, no hashtags, no @mentions.
- No em dashes or en dashes. At most one emoji, and only if the post uses emojis.
- Tone: ${f.tone || "professional and warm"}.

If the post is not really a milestone of the author, SKIP it.`;
}

/** Writer rules used by every comment prompt. `kind` comes from triagePost (default: a post on the sender's subjects). */
export function commentRules(f: SenderFacts, kind: PostKind = "on_topic", topic = "", need = "", reading: Reading | null = null): string {
  if (kind === "milestone") return milestoneRules(f);
  // The post comes first: what it is about and which detail to answer were read before any of the
  // sender's notes. Without a reading (the model could not answer) the post still leads, with no notes.
  const lens = reading?.available
    ? `\nStart from the post. It is mainly about: ${reading.subject}.${reading.detail ? `\nThe detail to answer: ${reading.detail}.` : ""}${reading.plans ? `\nPlanned or future in the post, NOT achieved: ${reading.plans}. Never write as if it had already happened, worked or failed.` : ""}
Stay on that subject. Any note of the sender listed above is there because it bears on it; if none is listed, write
from the post alone. Do not bring in another subject the sender works on, however close it looks: a shared word
("assets", "data", "AI") is not a link. If you are not sure what a technical term in the post means, SKIP.\n`
    : hasKnowledgeBase(f) && topic
    ? `\nThis post was chosen because it touches a subject the sender works on (${topic}). The comment must stay on what
the post actually describes. Do not drift to parts of the post that are outside the sender's subjects (contracts,
finance, politics, institutional news). If connecting the post to the sender's subject needs a stretch, or you are
not sure what a technical term in the post means, SKIP: a forced link is worse than no comment.\n`
    : "";
  // The author shows a need the sender's work addresses. The comment helps them think about THEIR problem.
  const needLens = need
    ? `\nIn this post the author shows a need: ${need}
Answer that need as a peer who has been through it: one concrete consideration that helps them decide or look in the
right place, taken from what the sender thinks and has seen (facts above). Do not offer help, do not offer a call, do
not say what the sender or their company does, do not suggest a product. A comment that reads like the first line of
a sales pitch fails. If the facts give nothing useful for this need, SKIP.\n`
    : "";
  return `You write LinkedIn comments for this person. These are the ONLY facts you know about them:
${factsBlock(f)}
${voiceBlock(f, kind)}${lens}${needLens}
The comment exists to add something to the author's post, the way a respected peer would: a point of view, a
consequence, a practical consideration. It is a contribution, not an interview. LinkedIn is full of
generic comments ("Impressive results!", "Incredible to see how technology...") written by people who want to sell
something. Those comments are worthless and hurt the sender's reputation. Never write one.

Hard rules:
- Write in the SAME language as the post, whatever language that is. A post in German gets a comment in German, a post in Portuguese gets one in Portuguese. Never translate into the language of these instructions.
- Anchor the comment on ONE concrete detail of the post: a number, a result, a method, a claim, a place. A reader must
  be able to tell which post it answers. Test: if the comment would still make sense under a different post, it fails.
- Do not summarize, restate or paraphrase the post back to the author.
- Do not open with praise or agreement ("Great post", "Impressive", "Incrível", "Parabéns pelo post", "Concordo").
- NEVER invent personal experience, projects, clients, numbers, studies or anecdotes. Only use the facts above. When
  the facts include what the sender thinks or has seen on the subject, build the comment on that, in their words.
  Otherwise add a precise consideration that follows from the post itself and that any practitioner would accept.
- Never invent a problem, a risk or a weakness at the author's organisation, and never predict that something of
  theirs will fail. Answer what the post says, not what might be wrong behind it.
- What the post presents as planned or future is not a result. Do not treat it as done, and do not judge it.
- A reader who knows only the post must understand the comment. Nothing that needs the sender's own context, and no
  subject the post does not raise.
- No made-up magnitudes. Do not state that something "doubles", "halves", takes "twice as long", happens "in most
  cases" or "80% of the time" unless that figure is in the post or in the facts above. Describe the effect without
  quantifying it.
- STATE, do not ask. The default comment is an observation or a point of view, written as a statement. A question is
  the exception: at most one, short, at the end, and only when it is real curiosity that the statement before it
  raises. Never write a comment that is only a question, and never ask the author to explain how they do something
  ("how do you prioritize...", "what criteria do you use...", "como vocês estão...").
- Never sell, never mention the sender's company, products or services, no links, no hashtags, no @mentions.
- 1 to 3 short sentences, ideally under 250 characters. Sounds like a busy expert typing on a phone.
- No em dashes or en dashes. No emojis unless the post is casual, and then at most one.
- For milestones (new job, award), congratulate briefly and specifically, then one genuine line.
- Tone: ${f.tone || "professional and warm"}.

If the post gives nothing concrete to engage with (vague motivation, engagement bait, a repost with no text, a topic
where any comment would be generic), SKIP it. Skipping is a good outcome.`;
}

export type Review = { ok: boolean; reason: string };

/** Strict second opinion. Fails closed: if the reviewer cannot answer, every draft is rejected. */
export async function reviewComments(
  items: { post: string; comment: string; author?: string | null; language?: string | null; reading?: Reading | null }[],
  f: SenderFacts,
  kind: PostKind = "on_topic",
  onModel?: (model: string) => void,
): Promise<Review[]> {
  const out: Review[] = items.map((it) => {
    const local = localIssues(it.comment, kind);
    return local.length ? { ok: false, reason: local.join("; ") } : { ok: true, reason: "" };
  });
  const toCheck = items.map((it, i) => ({ ...it, i })).filter((it) => out[it.i].ok);
  if (!toCheck.length) return out;

  const user = toCheck.map((it, idx) => [
    `[${idx}] POST${it.author ? ` by ${it.author}` : ""}:\n${String(it.post).slice(0, 1800)}`,
    cleanLanguage(it.language) ? `POST LANGUAGE: ${cleanLanguage(it.language)}` : "",
    it.reading?.available ? `POST SUBJECT: ${it.reading.subject}` : "",
    it.reading?.available && it.reading.plans ? `PLANNED IN THE POST, NOT ACHIEVED: ${it.reading.plans}` : "",
    `DRAFT COMMENT:\n${it.comment}`,
  ].filter(Boolean).join("\n")).join("\n=====\n");
  const milestoneSystem = `You are a strict editor protecting a professional's reputation on LinkedIn. Each post announces a milestone
of its author and each draft is a congratulation. Reject any draft that:
1. does not name the specific milestone (role, company, years) and could be pasted under any announcement;
2. asks the author to explain, justify or analyse anything, or gives advice;
3. claims a shared history, a past meeting, experience or opinions not supported by these facts about the sender:
${factsBlock(f)}
4. sells, pitches, hints at the sender's services, or asks for a call or DM;
5. is longer than two sentences, or sounds like AI or marketing copy;
6. is not in the same language as the post.
A warm, specific congratulation is what we want: do not reject it for being praise.
Reply ONLY with a JSON array: [{"index": n, "ok": true|false, "reason": "<if rejected: max 20 words, what to fix>"}]`;
  const topicSystem = `You are a strict editor protecting a professional's reputation on LinkedIn. Reject any draft comment that:
1. is generic: it would make sense under a different post on the same topic (the "swap test");
2. does not reference a concrete detail of THIS post (number, result, method, claim, place);
3. paraphrases or summarizes the post instead of adding a consideration or a perspective;
4. claims experience, projects, clients, numbers or anecdotes not supported by these facts about the sender, or
   states a magnitude ("doubles", "twice as long", "most", a percentage) that is neither in the post nor in the facts:
${factsBlock(f)}
5. sells, pitches, hints at the sender's services, or asks for a call or DM;
6. opens with praise or flattery, or sounds like AI or marketing copy;
7. is not in the same language as the post;
8. questions the author's competence or decisions, or reads like an auditor or an interviewer rather than a peer;
9. is not about the main subject of the post (given as POST SUBJECT when known), or brings in a subject the post does
   not raise, even one the sender works on: a word in common ("assets", "data", "AI") is not a link;
10. is only a question, or is mainly a request for the author to explain how they do something: the comment must
   contribute a statement of its own (a short closing question after a real statement is fine);
11. changes the topic: it asks about something the post does not describe, or uses a technical term from the post in a way that does not fit what the post says;
12. invents a problem, a risk or a weakness at the author's organisation, or predicts that something of theirs will
   fail, when the post does not say so;
13. treats something the post presents as planned or future as if it were done, or passes judgement on it;
14. cannot be understood by a reader who knows only the post: it leans on the sender's own context (who approves a
   budget, how the sender ranks priorities) that the post does not mention.
Approve only comments a respected peer would be glad to have written.
Reply ONLY with a JSON array: [{"index": n, "ok": true|false, "reason": "<if rejected: max 20 words, what to fix>"}]`;

  try {
    const system = kind === "milestone" ? milestoneSystem : topicSystem;
    const text = await callClaude({ model: modelFast(), system, user, maxTokens: 1200, temperature: 0, onModel });
    const verdicts = readVerdicts(parseJsonArray<ReviewVerdict>(text), toCheck.length);
    toCheck.forEach((it, idx) => { out[it.i] = verdicts[idx]; });
  } catch (e) {
    console.error("comment review failed:", e instanceof Error ? e.message : e);
    toCheck.forEach((it) => { out[it.i] = { ok: false, reason: REVIEW_UNAVAILABLE }; });
  }
  return out;
}

type ReviewVerdict = { index: number; ok: boolean; reason?: string };
/**
 * Turns the reviewer's reply into one verdict per draft, in order. A draft is approved only by a
 * single verdict that says ok:true for its index; a draft with no verdict is not approved and is marked
 * as not reviewed (REVIEW_UNAVAILABLE), to be tried again. Some replies are refused
 * whole (throws, and the caller rejects every draft), because they show the reviewer did not follow
 * the numbering, so no verdict in them can be tied to a draft with certainty: two verdicts for one
 * draft, an index outside the drafts that were sent, or an index that is not a whole number
 * ("0" beside 0 would let a second verdict overwrite the first). Exported for tests.
 */
export function readVerdicts(res: unknown, count: number): { ok: boolean; reason: string }[] {
  if (!Array.isArray(res)) throw new Error("review reply is not a list");
  const out: ({ ok: boolean; reason: string } | undefined)[] = new Array(count).fill(undefined);
  const seen = new Set<number>();
  for (const r of res as ReviewVerdict[]) {
    if (!r || typeof r !== "object" || !Number.isInteger(r.index)) throw new Error("review reply has an index that is not a whole number");
    // A verdict for a draft that was not sent means the numbering is off (counting from 1, say), and
    // then every verdict may belong to another draft.
    if (r.index < 0 || r.index >= count) throw new Error("review reply names a draft that was not sent");
    // Two verdicts for one draft: the reply is not what was asked for, so none of it is trusted.
    if (seen.has(r.index)) throw new Error("review reply judges a draft twice");
    seen.add(r.index);
    // The reviewer's own words can never be the outage marker.
    const reason = String(r.reason || "generic").slice(0, 200);
    out[r.index] = r.ok === true ? { ok: true, reason: "" } : { ok: false, reason: reason === REVIEW_UNAVAILABLE ? "generic" : reason };
  }
  // A draft the reviewer left out was not judged: that is an answer that could not be read, not a rejection.
  return out.map((v) => v ?? { ok: false, reason: REVIEW_UNAVAILABLE });
}

/** True when the writer chose to skip ("SKIP", empty, or a JSON skip flag already unwrapped to ""). */
export function isSkip(comment: string | null | undefined): boolean {
  const c = String(comment || "").trim();
  return !c || /^skip\b/i.test(c);
}
