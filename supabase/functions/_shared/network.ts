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

/** People search restricted to the user's OWN connections (1st degree), for "my contacts". */
export function buildConnectionsSearchUrl(keywords: string[], page: number): string {
  const terms = keywords.map(quoteTerm).filter(Boolean).slice(0, 8);
  const params = new URLSearchParams();
  if (terms.length) params.set("keywords", (terms.length > 1 ? terms.join(" OR ") : terms[0]).slice(0, 400));
  params.set("network", JSON.stringify(["F"]));
  params.set("origin", "FACETED_SEARCH");
  if (page > 1) params.set("page", String(page));
  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
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
