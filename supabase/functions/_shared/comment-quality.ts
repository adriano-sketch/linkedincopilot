// Comment quality guard, shared by the Network module (network-process) and Growth (generate-comment).
//
// The product promise: a LinkedIn Copilot comment never reads like the generic "Impressive results!"
// spam that floods LinkedIn. Every draft goes through three layers before the user sees it:
//   1. The writer prompt (COMMENT_RULES): same language as the post, one concrete detail, no invented
//      experience, no selling, and permission to SKIP when there is nothing worth saying.
//   2. Cheap local checks (localIssues): praise openers, wrong language, dashes, links, too long.
//   3. A strict reviewer model (reviewComments): "would this comment fit a different post?" If yes,
//      or if it paraphrases the post, invents facts, or pitches, it is rejected.
// A rejected draft is rewritten once with the reviewer's feedback; if it fails again the post is
// skipped. Three good comments a day beat twenty forgettable ones.
import { callClaude, modelFast, parseJsonArray } from "./network.ts";

export type Lang = "pt" | "en" | "es" | "other";
export const LANG_NAME: Record<Lang, string> = { pt: "Portuguese", en: "English", es: "Spanish", other: "the same language as the post" };

const STOP: Record<Exclude<Lang, "other">, string[]> = {
  pt: ["de", "que", "não", "para", "com", "uma", "os", "as", "dos", "das", "mais", "mas", "foi", "são", "está", "isso", "nos", "pela", "pelo", "também", "já", "quando", "muito", "nossa", "você", "em", "ao", "à", "é"],
  en: ["the", "and", "of", "to", "is", "in", "that", "for", "with", "this", "are", "was", "we", "our", "you", "have", "it", "on", "be", "not", "they", "from", "what", "how"],
  es: ["el", "los", "las", "del", "que", "para", "con", "una", "por", "pero", "más", "fue", "son", "está", "esto", "nuestro", "también", "ya", "cuando", "muy", "es", "en", "y"],
};

/** Rough language detection by stopword frequency (good enough for pt / en / es posts). */
export function detectLang(text: string): Lang {
  const words = String(text || "").toLowerCase().normalize("NFC").match(/[a-zà-ÿ]+/g) || [];
  if (words.length < 4) return "other";
  const score = (l: Exclude<Lang, "other">) => words.reduce((n, w) => n + (STOP[l].includes(w) ? 1 : 0), 0);
  const s = { pt: score("pt"), en: score("en"), es: score("es") };
  // Portuguese and Spanish share words: accents and a few markers break the tie.
  if (/[ãõç]|ção|ções|\bnão\b|\bvocê\b/.test(text.toLowerCase())) s.pt += 3;
  if (/[ñ¿¡]|\bpero\b|\bmuy\b|\bdel\b/.test(text.toLowerCase())) s.es += 3;
  const best = (Object.entries(s) as [Exclude<Lang, "other">, number][]).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 && best[1] / words.length >= 0.04 ? best[0] : "other";
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
export function localIssues(comment: string, post: string): string[] {
  const c = String(comment || "").trim();
  const issues: string[] = [];
  if (c.length < 25) issues.push("too short to say anything specific");
  if (c.length > 450) issues.push("too long for a LinkedIn comment");
  const head = c.toLowerCase().replace(/^[^a-zà-ÿ]+/, "").slice(0, 40);
  const opener = PRAISE_OPENERS.find((p) => head.startsWith(p));
  if (opener) issues.push(`opens with generic praise ("${opener}")`);
  if (/https?:\/\/|www\./i.test(c)) issues.push("contains a link");
  if (/#\w/.test(c)) issues.push("contains a hashtag");
  if (/[—–]/.test(c)) issues.push("contains a dash typical of AI text");
  const postLang = detectLang(post);
  const commentLang = detectLang(c);
  if (postLang !== "other" && commentLang !== "other" && postLang !== commentLang) {
    issues.push(`written in ${LANG_NAME[commentLang]} but the post is in ${LANG_NAME[postLang]}`);
  }
  return issues;
}

export type SenderFacts = {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  about?: string | null; // company description / value proposition / proof points the USER wrote
  tone?: string | null;
};

function factsBlock(f: SenderFacts): string {
  const lines = [
    f.name ? `Name: ${f.name}` : "",
    f.title ? `Role: ${f.title}` : "",
    f.company ? `Company: ${f.company}` : "",
    f.about ? `What they do (written by them): ${String(f.about).slice(0, 700)}` : "",
  ].filter(Boolean);
  return lines.length ? lines.join("\n") : "(no facts provided)";
}

/** Writer rules used by every comment prompt. */
export function commentRules(f: SenderFacts): string {
  return `You write LinkedIn comments for this person. These are the ONLY facts you know about them:
${factsBlock(f)}

The comment exists to start a real conversation with the author, the way a respected peer would. LinkedIn is full of
generic comments ("Impressive results!", "Incredible to see how technology...") written by people who want to sell
something. Those comments are worthless and hurt the sender's reputation. Never write one.

Hard rules:
- Write in the SAME language as the post. A post in Portuguese gets a comment in Portuguese.
- Anchor the comment on ONE concrete detail of the post: a number, a result, a method, a claim, a place. A reader must
  be able to tell which post it answers. Test: if the comment would still make sense under a different post, it fails.
- Do not summarize, restate or paraphrase the post back to the author.
- Do not open with praise or agreement ("Great post", "Impressive", "Incrível", "Parabéns pelo post", "Concordo").
- NEVER invent personal experience, projects, clients, numbers, studies or anecdotes. Only use the facts above. If you
  have no real experience to share, ask a sharp question or add a precise technical consideration instead.
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
export async function reviewComments(items: { post: string; comment: string; author?: string | null }[], f: SenderFacts): Promise<Review[]> {
  const out: Review[] = items.map((it) => {
    const local = localIssues(it.comment, it.post);
    return local.length ? { ok: false, reason: local.join("; ") } : { ok: true, reason: "" };
  });
  const toCheck = items.map((it, i) => ({ ...it, i })).filter((it) => out[it.i].ok);
  if (!toCheck.length) return out;

  const user = toCheck.map((it, idx) => [
    `[${idx}] POST${it.author ? ` by ${it.author}` : ""}:\n${String(it.post).slice(0, 1800)}`,
    `DRAFT COMMENT:\n${it.comment}`,
  ].join("\n")).join("\n=====\n");
  const system = `You are a strict editor protecting a professional's reputation on LinkedIn. Reject any draft comment that:
1. is generic: it would make sense under a different post on the same topic (the "swap test");
2. does not reference a concrete detail of THIS post (number, result, method, claim, place);
3. paraphrases or summarizes the post instead of adding a question, a consideration or a perspective;
4. claims experience, projects, clients, numbers or anecdotes not supported by these facts about the sender:
${factsBlock(f)}
5. sells, pitches, hints at the sender's services, or asks for a call or DM;
6. opens with praise or flattery, or sounds like AI or marketing copy;
7. is not in the same language as the post.
Approve only comments a respected peer would be glad to have written.
Reply ONLY with a JSON array: [{"index": n, "ok": true|false, "reason": "<if rejected: max 20 words, what to fix>"}]`;

  try {
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
