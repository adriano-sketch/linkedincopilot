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
    relationship: ["S"],
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

/** LinkedIn post (content) search URL: last 24h, newest first. */
export function buildPostSearchUrl(icp: Icp): string {
  const topics = (icp.post_topics && icp.post_topics.length ? icp.post_topics : icp.keywords || [])
    .map(quoteTerm).filter(Boolean).slice(0, 5);
  const fallback = (icp.titles || []).map(quoteTerm).filter(Boolean).slice(0, 4);
  const terms = topics.length ? topics : fallback;
  const kw = terms.length > 1 ? terms.join(" OR ") : (terms[0] || icp.name);
  const params = new URLSearchParams();
  params.set("keywords", kw.slice(0, 300));
  params.set("datePosted", JSON.stringify("past-24h"));
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

export async function callClaude(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.2,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  return (Array.isArray(data.content) ? data.content : [])
    .filter((b: any) => b?.type === "text")
    .map((b: any) => b.text || "")
    .join("")
    .trim();
}

/** Extract the first JSON array from a model reply. */
export function parseJsonArray<T = any>(text: string): T[] {
  let s = text.trim();
  if (s.startsWith("```")) s = s.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("No JSON array in model reply");
  return JSON.parse(s.slice(start, end + 1));
}

export function modelFast(): string {
  return Deno.env.get("ANTHROPIC_MODEL_ICP") || "claude-haiku-4-5";
}
export function modelWriter(): string {
  return Deno.env.get("ANTHROPIC_MODEL_DM") || "claude-sonnet-4-6";
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
