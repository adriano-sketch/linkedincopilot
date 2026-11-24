// Shared helpers for the "Rede" (network) module:
// ICP-based prospecting + post monitoring with human-approved comments.

export type Icp = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  titles: string[];
  keywords: string[];
  exclude_keywords: string[];
  locations: string[];
  location_geo_ids: string[];
  industries: string[];
  seniorities: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  post_topics: string[];
  min_fit_score: number;
  prospecting_enabled: boolean;
  engagement_enabled: boolean;
  is_active: boolean;
  people_search_page: number;
  people_search_exhausted_at: string | null;
  last_people_search_at: string | null;
  last_post_search_at: string | null;
  invite_note?: string | null;
  include_third_degree?: boolean;
  recently_posted?: boolean;
  changed_jobs?: boolean;
};

/** Normalize any LinkedIn profile URL to https://www.linkedin.com/in/<slug> (lowercase, decoded). */
export function normalizeProfileUrl(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(/linkedin\.com\/in\/([^/?#]+)/i) || raw.match(/^\/in\/([^/?#]+)/i);
  if (!m) return null;
  let slug = m[1];
  try { slug = decodeURIComponent(slug); } catch (_) { /* keep raw */ }
  slug = slug.trim().toLowerCase();
  if (!slug) return null;
  return `https://www.linkedin.com/in/${slug}`;
}

function quoteTerm(t: string): string {
  const s = t.trim().replace(/"/g, "");
  if (!s) return "";
  return /\s/.test(s) ? `"${s}"` : s;
}

/** Keyword query for people search: (title1 OR title2) plus extra keywords. Kept short: LinkedIn truncates long queries. */
export function buildPeopleKeywords(icp: Icp): string {
  const titles = (icp.titles || []).map(quoteTerm).filter(Boolean).slice(0, 6);
  const extra = (icp.keywords || []).map(quoteTerm).filter(Boolean).slice(0, 3);
  const parts: string[] = [];
  if (titles.length === 1) parts.push(titles[0]);
  else if (titles.length > 1) parts.push(`(${titles.join(" OR ")})`);
  if (extra.length) parts.push(extra.join(" "));
  const excl = (icp.exclude_keywords || []).map(quoteTerm).filter(Boolean).slice(0, 3);
  for (const e of excl) parts.push(`NOT ${e}`);
  return parts.join(" ").slice(0, 400);
}

/** LinkedIn people search URL restricted to 2nd-degree connections (people with mutual connections). */
export function buildPeopleSearchUrl(icp: Icp, page: number): string {
  const params = new URLSearchParams();
  const kw = buildPeopleKeywords(icp);
  if (kw) params.set("keywords", kw);
  // 2nd degree only, whatever include_third_degree says: 3rd-degree profiles show no Connect control the
  // extension can use (2026-11-23), so finding them only spends searches and profile pages.
  params.set("network", JSON.stringify(["S"]));
  if (icp.location_geo_ids && icp.location_geo_ids.length) {
    params.set("geoUrn", JSON.stringify(icp.location_geo_ids.slice(0, 10)));
  }
  params.set("origin", "FACETED_SEARCH");
  if (page > 1) params.set("page", String(page));
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

/** People search restricted to the user's OWN connections (1st degree), for "my contacts".
 *  One keyword per search: LinkedIn returns nothing for long OR chains of quoted phrases. The
 *  keyword goes unquoted, so "gerente de manutenção" matches people with all those words. */
export function buildConnectionsSearchUrl(keyword: string, page: number): string {
  const kw = String(keyword || "").replace(/["()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  const params = new URLSearchParams();
  if (kw) params.set("keywords", kw);
  params.set("network", JSON.stringify(["F"]));
  params.set("origin", "FACETED_SEARCH");
  if (page > 1) params.set("page", String(page));
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}

// ── Sales Navigator ──────────────────────────────────────────────────────────
// Lead search URLs use LinkedIn's Rest.li query syntax:
//   /sales/search/people?query=(keywords:...,filters:List((type:X,values:List((id:..,text:..,selectionType:INCLUDED)))))
// Text values are encoded once for Rest.li, then the whole query is URL-encoded again
// (the same double encoding Sales Navigator itself produces).

export type LinkedInTier = "free" | "premium" | "sales_navigator";

/** ICP seniority keys -> Sales Navigator SENIORITY_LEVEL ids. */
export const SN_SENIORITY: Record<string, { ids: number[]; text: string }> = {
  entry: { ids: [110], text: "Entry Level" },
  senior: { ids: [120], text: "Senior" },
  manager: { ids: [200, 210], text: "Manager" },
  director: { ids: [220], text: "Director" },
  vp: { ids: [300], text: "Vice President" },
  cxo: { ids: [310], text: "CXO" },
  owner: { ids: [320], text: "Owner / Partner" },
};
const SN_SENIORITY_TEXT: Record<number, string> = {
  110: "Entry Level", 120: "Senior", 200: "Entry Level Manager", 210: "Experienced Manager",
  220: "Director", 300: "Vice President", 310: "CXO", 320: "Owner / Partner",
};

/** Company headcount buckets (Sales Navigator COMPANY_HEADCOUNT ids). */
const SN_HEADCOUNT: { id: string; text: string; min: number; max: number }[] = [
  { id: "B", text: "1-10", min: 1, max: 10 },
  { id: "C", text: "11-50", min: 11, max: 50 },
  { id: "D", text: "51-200", min: 51, max: 200 },
  { id: "E", text: "201-500", min: 201, max: 500 },
  { id: "F", text: "501-1000", min: 501, max: 1000 },
  { id: "G", text: "1001-5000", min: 1001, max: 5000 },
  { id: "H", text: "5001-10,000", min: 5001, max: 10000 },
  { id: "I", text: "10,001+", min: 10001, max: Number.MAX_SAFE_INTEGER },
];

/** Encode a text value for Rest.li (reserved chars must be escaped inside values). */
function restliText(s: string): string {
  return encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/'/g, "%27");
}

type SnValue = { id?: string | number; text?: string };
function snFilter(type: string, values: SnValue[]): string {
  const vals = values.map((v) => {
    const parts: string[] = [];
    if (v.id != null) parts.push(`id:${restliText(String(v.id))}`);
    if (v.text) parts.push(`text:${restliText(v.text)}`);
    parts.push("selectionType:INCLUDED");
    return `(${parts.join(",")})`;
  });
  return `(type:${type},values:List(${vals.join(",")}))`;
}

export type SalesNavSearch = {
  keywords?: string;
  titles?: string[];
  seniorities?: string[];
  geoIds?: string[];
  companySizeMin?: number | null;
  companySizeMax?: number | null;
  /** F = 1st degree (my connections), S = 2nd, O = 3rd+ */
  relationship?: ("F" | "S" | "O")[];
  postedRecently?: boolean;
  changedJobs?: boolean;
  page?: number;
};

export function buildSalesNavSearchUrl(s: SalesNavSearch): string {
  const filters: string[] = [];
  const titles = (s.titles || []).map((t) => t.replace(/["()]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 10);
  if (titles.length) filters.push(snFilter("CURRENT_TITLE", titles.map((text) => ({ text }))));

  const senIds = Array.from(new Set((s.seniorities || []).flatMap((k) => SN_SENIORITY[k]?.ids || [])));
  if (senIds.length) filters.push(snFilter("SENIORITY_LEVEL", senIds.map((id) => ({ id, text: SN_SENIORITY_TEXT[id] }))));

  const geo = (s.geoIds || []).filter((g) => /^\d+$/.test(String(g))).slice(0, 10);
  if (geo.length) filters.push(snFilter("REGION", geo.map((id) => ({ id }))));

  if (s.companySizeMin || s.companySizeMax) {
    const lo = s.companySizeMin || 1;
    const hi = s.companySizeMax || Number.MAX_SAFE_INTEGER;
    const buckets = SN_HEADCOUNT.filter((b) => b.max >= lo && b.min <= hi);
    if (buckets.length && buckets.length < SN_HEADCOUNT.length) {
      filters.push(snFilter("COMPANY_HEADCOUNT", buckets.map((b) => ({ id: b.id, text: b.text }))));
    }
  }

  const rel = (s.relationship || []).filter((r) => ["F", "S", "O"].includes(r));
  const relText: Record<string, string> = { F: "1st degree connections", S: "2nd degree connections", O: "3rd degree connections" };
  if (rel.length) filters.push(snFilter("RELATIONSHIP", rel.map((id) => ({ id, text: relText[id] }))));

  if (s.postedRecently) filters.push(snFilter("POSTED_ON_LINKEDIN", [{ id: "RPOL", text: "Posted on LinkedIn" }]));
  if (s.changedJobs) filters.push(snFilter("RECENTLY_CHANGED_JOBS", [{ id: "RPC", text: "Changed jobs" }]));

  const parts = ["recentSearchParam:(doLogHistory:true)"];
  if (filters.length) parts.push(`filters:List(${filters.join(",")})`);
  const kw = String(s.keywords || "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (kw) parts.push(`keywords:${restliText(kw)}`);
  const query = `(${parts.join(",")})`;

  let url = `https://www.linkedin.com/sales/search/people?query=${encodeURIComponent(query)}`;
  if (s.page && s.page > 1) url += `&page=${s.page}`;
  return url;
}

/** Keywords for a Sales Navigator ICP search: titles go in their own filter, so only the extra keywords and exclusions. */
function salesNavKeywords(icp: Icp): string {
  const extra = (icp.keywords || []).map(quoteTerm).filter(Boolean).slice(0, 4);
  const parts: string[] = [];
  if (extra.length > 1) parts.push(`(${extra.join(" OR ")})`);
  else if (extra.length) parts.push(extra[0]);
  for (const e of (icp.exclude_keywords || []).map(quoteTerm).filter(Boolean).slice(0, 4)) parts.push(`NOT ${e}`);
  return parts.join(" ");
}

export type IcpSearchExtras = { recently_posted?: boolean; changed_jobs?: boolean };

/** Sales Navigator prospecting search for an ICP: 2nd-degree leads (mutual connections), all filters applied. */
export function buildSalesNavPeopleSearchUrl(icp: Icp & IcpSearchExtras, page: number): string {
  return buildSalesNavSearchUrl({
    keywords: salesNavKeywords(icp),
    titles: icp.titles || [],
    seniorities: icp.seniorities || [],
    geoIds: icp.location_geo_ids || [],
    companySizeMin: icp.company_size_min,
    companySizeMax: icp.company_size_max,
    // 2nd degree by default; 3rd degree too when the audience asks for it (people with no mutual connection).
    relationship: ["S"], // 2nd degree only for now, see buildPeopleSearchUrl
    postedRecently: !!icp.recently_posted,
    changedJobs: !!icp.changed_jobs,
    page,
  });
}

/** Sales Navigator search over the user's own connections (Growth "my contacts"). */
export function buildSalesNavConnectionsSearchUrl(keyword: string, page: number, opts: { postedRecently?: boolean } = {}): string {
  const kw = String(keyword || "").replace(/["()]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  return buildSalesNavSearchUrl({ keywords: kw, relationship: ["F"], postedRecently: !!opts.postedRecently, page });
}

/** Sales Navigator search is used when the plan is Sales Navigator and it has not failed in the last 24h. */
export function salesNavEnabled(ext: { linkedin_account_tier?: string | null; sales_nav_failed_at?: string | null } | null, now = Date.now()): boolean {
  if (!ext || ext.linkedin_account_tier !== "sales_navigator") return false;
  if (ext.sales_nav_failed_at && now - new Date(ext.sales_nav_failed_at).getTime() < 24 * 3600 * 1000) return false;
  return true;
}

/**
 * Post search among the user's own 1st-degree connections, last week, for one of the subjects
 * they comment on. Parameter names and value format were taken from the address LinkedIn itself
 * builds when these filters are picked by hand (Nov 2026).
 */
export function buildMyNetworkPostSearchUrl(term: string): string {
  const params = new URLSearchParams();
  // Not quoted: an exact phrase ("perdas de água") returned no post in a whole week; the words
  // together are enough, and the triage discards what is off topic.
  params.set("keywords", term.replace(/"/g, "").trim().slice(0, 200));
  params.set("origin", "FACETED_SEARCH");
  params.set("datePosted", JSON.stringify(["past-week"]));
  params.set("postedBy", JSON.stringify(["first"]));
  return `https://www.linkedin.com/search/results/content/?${params.toString()}`;
}

/** Same reduction the extension uses to recognize a post by its opening words. */
export function postFingerprint(text: string): string {
  return (text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 80);
}

/** LinkedIn post (content) search URL: last 24h, newest first. */
export function buildPostSearchUrl(icp: Icp): string {
  const topics = (icp.post_topics && icp.post_topics.length ? icp.post_topics : icp.keywords || [])
    .map(quoteTerm).filter(Boolean).slice(0, 5);
  const fallback = (icp.titles || []).map(quoteTerm).filter(Boolean).slice(0, 4);
  const terms = topics.length ? topics : fallback;
  const kw = terms.length > 1 ? terms.join(" OR ") : (terms[0] || icp.name);
  const params = new URLSearchParams();
  params.set("keywords", kw.slice(0, 300));
  params.set("datePosted", JSON.stringify(["past-24h"])); // list format, as LinkedIn writes it
  params.set("sortBy", JSON.stringify("date_posted"));
  params.set("origin", "FACETED_SEARCH");
  return `https://www.linkedin.com/search/results/content/?${params.toString()}`;
}

export function icpBrief(icp: Icp): string {
  const lines = [
    `ICP name: ${icp.name}`,
    icp.description ? `Description: ${icp.description}` : "",
    icp.titles?.length ? `Target titles (examples, not exhaustive): ${icp.titles.join(", ")}` : "",
    icp.industries?.length ? `Industries: ${icp.industries.join(", ")}` : "",
    icp.locations?.length ? `Locations: ${icp.locations.join(", ")}` : "",
    icp.seniorities?.length ? `Seniority: ${icp.seniorities.join(", ")}` : "",
    (icp.company_size_min || icp.company_size_max)
      ? `Company size: ${icp.company_size_min ?? "?"} to ${icp.company_size_max ?? "?"} employees` : "",
    icp.keywords?.length ? `Keywords: ${icp.keywords.join(", ")}` : "",
    icp.exclude_keywords?.length ? `Exclude if matches: ${icp.exclude_keywords.join(", ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function matchesExclusion(icp: Icp, text: string): boolean {
  const t = (text || "").toLowerCase();
  return (icp.exclude_keywords || []).some((k) => k && t.includes(k.toLowerCase()));
}

/** Start of the next calendar month (UTC), when LinkedIn's free search limit resets. */
export function startOfNextMonthUtc(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 8, 0, 0)).toISOString();
}

// ── Models ───────────────────────────────────────────────────────────────────────────────────────
// Two tiers: a fast one that reads and judges (triage, review, matching) and a writer for the comment.
// ANTHROPIC_MODEL_ICP / ANTHROPIC_MODEL_DM override the defaults. Leave them unset: the retired outreach
// functions read the same variables and still send the earlier request shape.
// Request shape differs by generation (Anthropic migration guides for Claude Sonnet 5.5 and Haiku 5.5):
//   current models  : no temperature/top_p/top_k (400), thinking runs by default and its tokens count
//                     toward max_tokens, and the same text is about 30% more tokens.
//   earlier models  : temperature accepted, no thinking unless asked.
// These calls are short, single-turn and latency-sensitive, so up-front thinking is turned off with
// the value each model accepts.
const FAST_DEFAULT = "claude-haiku-5-5";
const WRITER_DEFAULT = "claude-sonnet-5-5";
const FAST_FALLBACK = "claude-haiku-4-5";
const WRITER_FALLBACK = "claude-sonnet-4-6";

/**
 * Claude 3.x and 4.x: the request shape this code was first written for. Opus 4.7 and 4.8 are the
 * exception: they already reject a temperature, so they take the current shape.
 */
function isEarlierModel(model: string): boolean {
  return /^claude-(3|[a-z]+-4)(\b|-)/.test(model) && !/^claude-opus-4-[78](\b|-)/.test(model);
}

function requestBody(model: string, opts: { system: string; user: string; maxTokens?: number; temperature?: number }) {
  const maxTokens = opts.maxTokens ?? 2000;
  const base = { model, system: opts.system, messages: [{ role: "user", content: opts.user }] };
  if (isEarlierModel(model)) return { ...base, max_tokens: maxTokens, temperature: opts.temperature ?? 0.2 };
  // Room for the larger token count of the same answer.
  const body: Record<string, unknown> = { ...base, max_tokens: Math.ceil(maxTokens * 1.4) };
  // "disabled" is accepted at effort high or below; the effort is stated so that does not depend on a default.
  if (/^claude-haiku-5-5/.test(model)) { body.thinking = { type: "disabled" }; body.output_config = { effort: "medium" }; }
  else if (/^claude-sonnet-5-5/.test(model)) body.thinking = { type: "between_tools" };
  // Any other current model: thinking stays adaptive, and needs room inside max_tokens.
  else body.max_tokens = Math.ceil(maxTokens * 1.4) + 4000;
  return body;
}

async function callOnce(apiKey: string, model: string, opts: { system: string; user: string; maxTokens?: number; temperature?: number }): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(requestBody(model, opts)),
  });
  if (!res.ok) return { ok: false, status: res.status, detail: (await res.text()).slice(0, 300) };
  const data = await res.json();
  // Blocks are read by type: a reply can start with thinking blocks.
  const text = (Array.isArray(data.content) ? data.content : [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text || "")
    .join("")
    .trim();
  // No text means the model declined (stop_reason "refusal") or ran out of tokens before answering.
  // Callers treat a throw as "no answer" and fail closed; an empty string would look like an answer.
  if (!text) return { ok: false, status: 200, detail: `no text (stop_reason: ${String(data.stop_reason || "unknown")})` };
  return { ok: true, text };
}

export async function callClaude(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  /** Told which model answered (after any fallback). For checks; not used in production paths. */
  onModel?: (model: string) => void;
}): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const first = await callOnce(apiKey, opts.model, opts);
  if (first.ok) { opts.onModel?.(opts.model); return first.text; }
  // A request the current model rejects outright (unknown model for this key, a parameter it does not
  // accept) must not stop drafting for everyone: answer with the earlier model of the same tier and
  // say so in the log. Rate limits, overloads and refusals are not retried here.
  const fallback = opts.model === FAST_DEFAULT ? FAST_FALLBACK : opts.model === WRITER_DEFAULT ? WRITER_FALLBACK : "";
  if (fallback && (first.status === 400 || first.status === 404)) {
    console.error(`Anthropic ${first.status} on ${opts.model}, answering with ${fallback}: ${first.detail}`);
    const second = await callOnce(apiKey, fallback, opts);
    if (second.ok) { opts.onModel?.(fallback); return second.text; }
    throw new Error(`Anthropic ${second.status}: ${second.detail.slice(0, 200)}`);
  }
  throw new Error(`Anthropic ${first.status}: ${first.detail.slice(0, 200)}`);
}

/** Extract the first JSON array from a model reply. */
/**
 * The JSON array in a model reply. With `repairKeys` (the keys the prompt asked for), a reply that does
 * not parse is given one chance: see parseRepaired. Without it, a reply that does not parse is an error.
 */
export function parseJsonArray<T = any>(text: string, repairKeys?: readonly string[]): T[] {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON array in model reply");
  const body = s.slice(start, end + 1);
  try {
    return JSON.parse(body);
  } catch (first) {
    if (!repairKeys) throw first;
    const repaired = parseRepaired(body, repairKeys);
    if (!Array.isArray(repaired)) throw first;
    return repaired as T[];
  }
}

const TEXT_KEYS = "comment|skip_reason|reason|fit_reason|signal_reason|topic|note";
/**
 * Escapes unescaped double quotes, line breaks and tabs inside the text values of a model's JSON reply.
 * The usual cause of a reply that does not parse is a quoted word inside a comment. A value is taken to
 * end at the quote that is followed by `,"key":`, `}` or `]`.
 *
 * That guess can be wrong when the text itself looks like JSON (`he said "yes", "ok": true`), and a
 * wrong guess would still parse. So the repair refuses a value whose inner quotes do not come in
 * pairs (a cut in the middle of a quoted word leaves one open), and parseRepaired checks the keys.
 * Throws when it refuses. Exported for tests.
 */
export function repairJsonStrings(json: string): string {
  const value = new RegExp(`("(?:${TEXT_KEYS})"\\s*:\\s*")([\\s\\S]*?)"(?=\\s*(?:,\\s*"[A-Za-z_]+"\\s*:|[}\\]]))`, "g");
  return json.replace(value, (_m, head: string, text: string) => {
    let quotes = 0;
    // Escapes are read in pairs, so an escaped backslash is not mistaken for the start of another escape.
    const fixed = text.replace(/\\([\s\S]?)|"|\r?\n|\t/g, (m: string, next: string | undefined) => {
      if (m === '"') { quotes++; return '\\"'; }
      if (m === "\t") return "\\t";
      if (m[0] !== "\\") return "\\n";
      if (next && '"\\/bfnrt'.includes(next)) return m;
      if (next === "u") return m;
      return `\\\\${next ?? ""}`;
    });
    if (quotes % 2 === 1) throw new Error("unbalanced quote in a text value");
    return `${head}${fixed}"`;
  });
}

/**
 * Parses a reply after repairJsonStrings, and accepts the result only when it has exactly the keys the
 * prompt asked for, each at most once per object. A repeated key (the later one silently wins in JSON)
 * or a key nobody asked for means the text was cut in the wrong place: refuse, so the caller fails
 * closed as it did before, instead of acting on a changed verdict or a shortened comment.
 * Returns the parsed value; throws when the repair or the check refuses.
 */
export function parseRepaired(json: string, allowedKeys: readonly string[]): unknown {
  const repaired = repairJsonStrings(json);
  const parsed = JSON.parse(repaired);
  const allowed = new Set(allowedKeys);
  let keys = 0;
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
        if (!allowed.has(k)) throw new Error(`unexpected key "${k}" after repair`);
        keys++;
        walk(child);
      }
    }
  };
  walk(parsed);
  // Keys as written in the text; more of them than in the parsed value means one was repeated.
  // Text values are escaped by now, so a `"word":` inside a comment reads `\"word\":` and is not counted.
  const written = (repaired.match(/(?<!\\)"[A-Za-z_]+"\s*:/g) || []).length;
  if (written !== keys) throw new Error("repeated key after repair");
  return parsed;
}

export function modelFast(): string {
  return (Deno.env.get("ANTHROPIC_MODEL_ICP") || "").trim() || FAST_DEFAULT;
}
export function modelWriter(): string {
  return (Deno.env.get("ANTHROPIC_MODEL_DM") || "").trim() || WRITER_DEFAULT;
}

/** Remove em/en dashes and collapse whitespace (comments must read as human-written). */
export function cleanComment(text: string): string {
  return (text || "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function fireAndForget(path: string, body: unknown): void {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  const p = fetch(`${url}/functions/v1/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }).then((r) => r.body?.cancel()).catch((e) => console.error(`fire-and-forget ${path} failed:`, e));
  // Keep the isolate alive until the request is sent (Supabase Edge Runtime).
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p);
}

/** Invite note for one person. {first_name} becomes the first name; without a usable name the greeting
 *  placeholder is dropped. Returns null when there is no note or it would pass LinkedIn's 300 characters. */
export function renderInviteNote(template: string | null | undefined, fullName: string | null | undefined): string | null {
  const t = (template || "").trim();
  if (!t) return null;
  const first = (fullName || "").trim().split(/\s+/)[0] || "";
  const usable = /^[\p{L}][\p{L}'’-]{1,24}$/u.test(first) ? first : "";
  let out = usable
    ? t.replace(/\{first_name\}/gi, usable)
    : t.replace(/\s*\{first_name\}\s*([,!:])?/gi, (_m, punct) => punct || "");
  out = out.replace(/\s+/g, " ").trim();
  return out && out.length <= 300 ? out : null;
}

/**
 * May Olanovo work for this user right now (paid plan or free trial still running)?
 * Fails open: if the check itself breaks, nobody is stopped because of our error.
 */
// deno-lint-ignore no-explicit-any
export async function hasProductAccess(supabase: any, userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("has_product_access", { p_user_id: userId });
    if (error) { console.error("has_product_access failed:", error.message); return true; }
    return data !== false;
  } catch (e) {
    console.error("has_product_access failed:", e instanceof Error ? e.message : e);
    return true;
  }
}
