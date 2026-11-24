// Comment quality guard, shared by the Network module (network-process) and Growth (generate-comment).
//
// The product promise: a Olanovo comment never reads like the generic "Impressive results!"
// spam that floods LinkedIn. Every draft goes through three layers before the user sees it:
//   1. The writer prompt (COMMENT_RULES): same language as the post, one concrete detail, no invented
//      experience, no selling, and permission to SKIP when there is nothing worth saying.
//   2. Cheap local checks (localIssues): praise openers, dashes, links, too long.
//   3. A strict reviewer model (reviewComments): "would this comment fit a different post?" If yes,
//      or if it paraphrases the post, invents facts, or pitches, it is rejected.
// A rejected draft is rewritten once with the reviewer's feedback; if it fails again the post is
// skipped. Three good comments a day beat twenty forgettable ones.
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
    // Sentence ends and question marks of other scripts count too (。！？ and the Arabic ؟).
    const sentences = c.split(/(?<=[.!?])\s+|(?<=[。！？؟])\s*/).map((x) => x.trim()).filter(Boolean);
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
};

/**
 * What the user's own decisions in the Inbox teach the writer.
 *   posted   : comments they published, newest first. `edited` = they changed the draft before posting.
 *   rejected : drafts they skipped saying the draft itself was wrong ("not my voice", "too generic").
 * Skips for other reasons (off subject, do not know the person) are about the choice of post, not the
 * wording, so they are stored but not shown to the writer.
 */
export type LearnedComment = { kind: "milestone" | "topic"; text: string; edited: boolean };
export type Learned = { posted: LearnedComment[]; rejected: { kind: "milestone" | "topic"; text: string; reason: string }[] };

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
  const empty: Learned = { posted: [], rejected: [] };
  try {
    const [posted, rejected] = await Promise.all([
      supabase.from("monitored_posts")
        .select("signal_type, suggested_comment, final_comment, commented_at")
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
    return { posted: p, rejected: j };
  } catch (e) {
    console.error("loadLearned failed:", e instanceof Error ? e.message : e);
    return empty;
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
    const text = await callClaude({ model: modelFast(), system, user, maxTokens: 290, temperature: 0 });
    const m = text.match(/\{[\s\S]*\}/);
    const r = JSON.parse(m ? m[0] : text) as { kind?: string; topic?: string; reason?: string; signal?: string; signal_reason?: string; language?: string };
    const kind: PostKind = r.kind === "on_topic" || r.kind === "milestone" ? r.kind : "off_topic";
    const signalReason = String(r.signal_reason || "").trim().slice(0, 200);
    // A signal needs a stated reason; without one it is not shown as a signal.
    const signal: PostSignal = kind === "on_topic" && signalReason && (r.signal === "opportunity" || r.signal === "pain") ? r.signal : "none";
    return { kind, topic: String(r.topic || "").slice(0, 60), reason: String(r.reason || "").slice(0, 140), signal, signalReason: signal === "none" ? "" : signalReason, language: cleanLanguage(r.language) };
  } catch (e) {
    console.error("post triage failed:", e instanceof Error ? e.message : e);
    return { kind: "off_topic", topic: "", reason: "triage unavailable", signal: "none", signalReason: "", language: "" };
  }
}

function factsBlock(f: SenderFacts): string {
  const lines = [
    f.name ? `Name: ${f.name}` : "",
    f.title ? `Role: ${f.title}` : "",
    f.company ? `Company: ${f.company}` : "",
    f.about ? `What they do (written by them): ${String(f.about).slice(0, 700)}` : "",
    f.topics ? `Subjects they have something to say about: ${String(f.topics).slice(0, 600)}` : "",
    f.avoid ? `Subjects they stay out of: ${String(f.avoid).slice(0, 400)}` : "",
    f.views ? `What they think and have seen on these subjects (written by them, the only source for opinions and experience):\n${String(f.views).slice(0, 2500)}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(no facts provided)";
}

function voiceBlock(f: SenderFacts, kind: PostKind = "on_topic"): string {
  const ex = String(f.examples || "").trim();
  const { posted, rejected } = learnedFor(f.learned, kind);
  const parts: string[] = [];
  if (ex) parts.push(`Comments this person wrote themselves. Match their voice, length and rhythm. Do not copy their content:\n"""\n${ex.slice(0, 1200)}\n"""`);
  if (posted.length) {
    const lines = posted.map((r) => `- ${r.edited ? "[rewritten by them] " : ""}${r.text.slice(0, 320)}`).join("\n");
    parts.push(`Comments this person recently published on posts of this kind. They approved every one; the ones marked
"rewritten by them" are in their own words and count the most. Use them for voice, length and the kind of point they
make. They answered OTHER posts: never reuse their sentences, their opening or their structure, and never write a
comment that could be one of these with a few words swapped:\n${lines}`);
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
export function commentRules(f: SenderFacts, kind: PostKind = "on_topic", topic = "", need = ""): string {
  if (kind === "milestone") return milestoneRules(f);
  // Only when a triage picked this post for a subject (Growth). Network posts are chosen by who wrote them.
  const lens = hasKnowledgeBase(f) && topic
    ? `\nThis post was chosen because it touches a subject the sender works on${topic ? ` (${topic})` : ""}. Write from that
knowledge: the observation must be one that someone who works on that subject would make. Do not drift
to parts of the post that are outside the sender's subjects (contracts, finance, politics, institutional news).
The comment must stay on what the post actually describes. If connecting the post to the sender's subject needs a
stretch, or you are not sure what a technical term in the post means, SKIP: a forced link is worse than no comment.\n`
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
  items: { post: string; comment: string; author?: string | null; language?: string | null }[],
  f: SenderFacts,
  kind: PostKind = "on_topic",
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
9. is about a part of the post unrelated to the subjects the sender works on, when those subjects are listed above;
10. is only a question, or is mainly a request for the author to explain how they do something: the comment must
   contribute a statement of its own (a short closing question after a real statement is fine);
11. changes the topic: it asks about something the post does not describe, or uses a technical term from the post in a way that does not fit what the post says.
Approve only comments a respected peer would be glad to have written.
Reply ONLY with a JSON array: [{"index": n, "ok": true|false, "reason": "<if rejected: max 20 words, what to fix>"}]`;

  try {
    const system = kind === "milestone" ? milestoneSystem : topicSystem;
    const text = await callClaude({ model: modelFast(), system, user, maxTokens: 1200, temperature: 0 });
    const res = parseJsonArray<{ index: number; ok: boolean; reason?: string }>(text);
    const seen = new Set<number>();
    for (const r of res) {
      const it = toCheck[r.index];
      if (!it) continue;
      seen.add(r.index);
      out[it.i] = r.ok === true ? { ok: true, reason: "" } : { ok: false, reason: String(r.reason || "generic").slice(0, 200) };
    }
    toCheck.forEach((it, idx) => { if (!seen.has(idx)) out[it.i] = { ok: false, reason: "not reviewed" }; });
  } catch (e) {
    console.error("comment review failed:", e instanceof Error ? e.message : e);
    toCheck.forEach((it) => { out[it.i] = { ok: false, reason: "review unavailable" }; });
  }
  return out;
}

/** True when the writer chose to skip ("SKIP", empty, or a JSON skip flag already unwrapped to ""). */
export function isSkip(comment: string | null | undefined): boolean {
  const c = String(comment || "").trim();
  return !c || /^skip\b/i.test(c);
}
