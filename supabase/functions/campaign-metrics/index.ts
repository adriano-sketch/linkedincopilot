/**
 * campaign-metrics
 * ────────────────
 * Returns funnel metrics + conversion rates + benchmark comparisons for a
 * user's outreach pipeline. Used by the dashboard and by alert emails so the
 * user can see WHY their pipeline is/isn't working.
 *
 * Computes both lifetime and windowed (last N days) metrics so users can see
 * short-term momentum alongside overall history.
 *
 * The benchmarks below are conservative industry averages for cold B2B
 * LinkedIn outreach in 2026 (source: blended averages from public reports +
 * internal observations). They are intentionally realistic, not inflated.
 *
 * Usage:
 *   POST /functions/v1/campaign-metrics
 *   Body:
 *     {
 *       "user_id": "uuid",                // required
 *       "campaign_profile_id": "uuid",    // optional — filter to one campaign
 *       "window_days": 30                 // optional — defaults to 30
 *     }
 *
 * Response:
 *   {
 *     lifetime: { funnel, rates, counts },
 *     window:   { days, funnel, rates, counts },
 *     benchmarks: { ... },
 *     diagnosis: [ { severity, code, message, recommendation } ],
 *     top_blockers: [ ... ],
 *     updated_at: "ISO"
 *   }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────
// Industry benchmarks for cold B2B LinkedIn outreach (2026, realistic).
// "good" = what a well-tuned campaign should hit.
// "great" = top-decile performance.
// ─────────────────────────────────────────────────────────────────────
const BENCHMARKS = {
  // of ready leads, how many make it through ICP gate
  icp_pass_rate:           { poor: 0.40, ok: 0.55, good: 0.70, great: 0.85 },
  // of ICP-approved leads, how many get connection request sent
  connection_send_rate:    { poor: 0.80, ok: 0.90, good: 0.95, great: 0.98 },
  // of connection requests sent, how many accept
  acceptance_rate:         { poor: 0.15, ok: 0.22, good: 0.30, great: 0.40 },
  // of accepted connections, how many receive first DM
  dm_send_rate:            { poor: 0.80, ok: 0.90, good: 0.95, great: 0.98 },
  // of DMs sent, how many get ANY reply (positive or negative)
  reply_rate:              { poor: 0.03, ok: 0.07, good: 0.12, great: 0.20 },
  // of replies, how many are positive / meeting interest
  positive_reply_rate:     { poor: 0.20, ok: 0.35, good: 0.50, great: 0.65 },
  // of DMs sent -> meeting booked (composite health metric)
  dm_to_meeting_rate:      { poor: 0.005, ok: 0.015, good: 0.030, great: 0.060 },
};

type BenchmarkTier = "poor" | "ok" | "good" | "great";

function classify(rate: number, b: { poor: number; ok: number; good: number; great: number }): BenchmarkTier {
  if (rate >= b.great) return "great";
  if (rate >= b.good) return "good";
  if (rate >= b.ok) return "ok";
  return "poor";
}

function safeDiv(n: number, d: number): number {
  if (!d || d <= 0) return 0;
  return n / d;
}

function pct(x: number): number {
  return Math.round(x * 10000) / 100; // 2-decimal percent
}

// ─────────────────────────────────────────────────────────────────────
// Funnel computation
// ─────────────────────────────────────────────────────────────────────
interface Funnel {
  total_leads: number;
  icp_approved: number;
  icp_rejected: number;
  visited: number;
  connection_requested: number;
  connected: number;
  dm_sent: number;
  replied: number;
  positive_replies: number;
  meetings_booked: number;
}

interface Rates {
  icp_pass_rate: number;
  icp_pass_tier: BenchmarkTier;
  connection_send_rate: number;
  connection_send_tier: BenchmarkTier;
  acceptance_rate: number;
  acceptance_tier: BenchmarkTier;
  dm_send_rate: number;
  dm_send_tier: BenchmarkTier;
  reply_rate: number;
  reply_tier: BenchmarkTier;
  positive_reply_rate: number;
  positive_reply_tier: BenchmarkTier;
  dm_to_meeting_rate: number;
  dm_to_meeting_tier: BenchmarkTier;
}

function buildFunnel(leads: any[]): Funnel {
  let icp_approved = 0;
  let icp_rejected = 0;
  let visited = 0;
  let connection_requested = 0;
  let connected = 0;
  let dm_sent = 0;
  let replied = 0;
  let positive_replies = 0;
  let meetings_booked = 0;

  // Status tiers — a lead in tier N has also passed every earlier tier.
  // Note: replied / meeting_booked are optional statuses that may or may not
  // exist in this project; we still count them if present so the code is
  // forward-compatible.
  const VISITED_STATUSES = new Set([
    "visiting_profile", "following", "connection_sent", "connection_rejected",
    "connected", "pending_approval", "dm_sent", "waiting_reply", "replied",
    "meeting_booked", "won", "lost",
  ]);
  const CONNECTION_REQUESTED_STATUSES = new Set([
    "connection_sent", "connection_rejected", "connected", "dm_sent",
    "waiting_reply", "replied", "meeting_booked", "won", "lost",
  ]);
  const CONNECTED_STATUSES = new Set([
    "connected", "dm_sent", "waiting_reply", "replied", "meeting_booked", "won", "lost",
  ]);
  const DM_SENT_STATUSES = new Set([
    "dm_sent", "waiting_reply", "replied", "meeting_booked", "won", "lost",
  ]);
  const REPLIED_STATUSES = new Set(["replied", "meeting_booked", "won", "lost"]);
  const POSITIVE_REPLY_STATUSES = new Set(["meeting_booked", "won"]);
  const MEETING_BOOKED_STATUSES = new Set(["meeting_booked", "won"]);

  for (const l of leads) {
    const status = l.status || "";
    // ICP state
    if (l.icp_match === false || status === "icp_rejected") icp_rejected++;
    if (l.icp_match === true) icp_approved++;
    // Funnel progression — tracked via *_at timestamps where available, with
    // a status-tier fallback for anything older than the timestamp columns.
    if (l.profile_visited_at || VISITED_STATUSES.has(status)) visited++;
    if (l.connection_sent_at || CONNECTION_REQUESTED_STATUSES.has(status)) connection_requested++;
    if (l.connected_at || l.connection_accepted_at || CONNECTED_STATUSES.has(status)) connected++;
    if (l.dm_sent_at || DM_SENT_STATUSES.has(status)) dm_sent++;
    if (REPLIED_STATUSES.has(status)) replied++;
    if (POSITIVE_REPLY_STATUSES.has(status)) positive_replies++;
    if (MEETING_BOOKED_STATUSES.has(status)) meetings_booked++;
  }

  return {
    total_leads: leads.length,
    icp_approved,
    icp_rejected,
    visited,
    connection_requested,
    connected,
    dm_sent,
    replied,
    positive_replies,
    meetings_booked,
  };
}

function computeRates(f: Funnel): Rates {
  const icp_decided = f.icp_approved + f.icp_rejected;
  const icp_pass_rate = safeDiv(f.icp_approved, icp_decided || f.total_leads);
  const connection_send_rate = safeDiv(f.connection_requested, f.icp_approved || f.visited || f.total_leads);
  const acceptance_rate = safeDiv(f.connected, f.connection_requested);
  const dm_send_rate = safeDiv(f.dm_sent, f.connected);
  const reply_rate = safeDiv(f.replied, f.dm_sent);
  const positive_reply_rate = safeDiv(f.positive_replies, f.replied);
  const dm_to_meeting_rate = safeDiv(f.meetings_booked, f.dm_sent);

  return {
    icp_pass_rate,
    icp_pass_tier: classify(icp_pass_rate, BENCHMARKS.icp_pass_rate),
    connection_send_rate,
    connection_send_tier: classify(connection_send_rate, BENCHMARKS.connection_send_rate),
    acceptance_rate,
    acceptance_tier: classify(acceptance_rate, BENCHMARKS.acceptance_rate),
    dm_send_rate,
    dm_send_tier: classify(dm_send_rate, BENCHMARKS.dm_send_rate),
    reply_rate,
    reply_tier: classify(reply_rate, BENCHMARKS.reply_rate),
    positive_reply_rate,
    positive_reply_tier: classify(positive_reply_rate, BENCHMARKS.positive_reply_rate),
    dm_to_meeting_rate,
    dm_to_meeting_tier: classify(dm_to_meeting_rate, BENCHMARKS.dm_to_meeting_rate),
  };
}

// ─────────────────────────────────────────────────────────────────────
// Diagnosis — human-readable recommendations based on benchmark tiers.
// This is what makes the product feel smart: it doesn't just show numbers,
// it tells the user what to do next.
// ─────────────────────────────────────────────────────────────────────
interface Diagnosis {
  severity: "info" | "warn" | "critical";
  code: string;
  message: string;
  recommendation: string;
}

function buildDiagnosis(rates: Rates, f: Funnel): Diagnosis[] {
  const d: Diagnosis[] = [];
  const enoughDMs = f.dm_sent >= 20;
  const enoughReqs = f.connection_requested >= 20;

  if (enoughReqs && rates.acceptance_tier === "poor") {
    d.push({
      severity: "critical",
      code: "low_acceptance",
      message: `Acceptance rate is ${pct(rates.acceptance_rate)}%. Industry floor is ${pct(BENCHMARKS.acceptance_rate.ok)}%.`,
      recommendation: "Your connection note is the blocker. Test: (a) remove any pitch words from the note, (b) reference ONE specific detail from the lead's profile, (c) keep it under 160 chars. Also re-check your ICP — if you're targeting senior execs in saturated industries, acceptance will be lower.",
    });
  }

  if (enoughDMs && rates.reply_tier === "poor") {
    d.push({
      severity: "critical",
      code: "low_reply_rate",
      message: `Reply rate is ${pct(rates.reply_rate)}%. Healthy campaigns land between ${pct(BENCHMARKS.reply_rate.ok)}–${pct(BENCHMARKS.reply_rate.good)}%.`,
      recommendation: "Your first DM is not earning a response. Common causes: (1) asks for a meeting too early, (2) mentions 'calendly' or a CTA link, (3) is interchangeable with any other lead. Try a DM that references something ONLY this lead would recognize (a post, a project, a company detail) and ends with a curious question — not a call request.",
    });
  }

  if (enoughDMs && rates.reply_tier === "ok") {
    d.push({
      severity: "warn",
      code: "mid_reply_rate",
      message: `Reply rate is ${pct(rates.reply_rate)}%, just above the floor.`,
      recommendation: "You're getting replies but leaving meetings on the table. Test a second DM variant that references a proof point / customer result instead of a pain point — it shifts the conversation from 'should I care?' to 'how did you do that?'",
    });
  }

  if (f.dm_sent > 0 && rates.dm_send_rate > 0 && rates.dm_send_tier === "poor") {
    d.push({
      severity: "warn",
      code: "dm_send_gap",
      message: `Only ${pct(rates.dm_send_rate)}% of your accepted connections received a first DM.`,
      recommendation: "Leads accepting but not getting DMs means the pipeline is stalling between 'connected' and 'dm_sent'. Check that approval is not blocking, and that generate-dm is running daily. Orphan connected leads lose context fast.",
    });
  }

  if (f.replied > 5 && rates.positive_reply_tier === "poor") {
    d.push({
      severity: "warn",
      code: "negative_sentiment",
      message: `Only ${pct(rates.positive_reply_rate)}% of replies are positive.`,
      recommendation: "You're reaching the wrong people with the wrong frame. Review negative replies: are they saying 'wrong person'? → tighten ICP titles. 'Not interested' without reason? → your angle isn't resonating, revisit the pain point.",
    });
  }

  if (f.icp_approved > 0 && rates.icp_pass_tier === "poor") {
    d.push({
      severity: "warn",
      code: "low_icp_pass",
      message: `Only ${pct(rates.icp_pass_rate)}% of scraped leads pass ICP.`,
      recommendation: "You're wasting enrichment credits on leads that won't qualify. Tighten your lead sources BEFORE Scrapin enrichment — use better LinkedIn search filters, or write a stricter ICP description.",
    });
  }

  if (!enoughDMs && !enoughReqs) {
    d.push({
      severity: "info",
      code: "low_volume",
      message: `Only ${f.dm_sent} DMs and ${f.connection_requested} connection requests so far — metrics are noisy at this volume.`,
      recommendation: "Give the pipeline 1–2 weeks and ~50+ DMs before judging. Right now, even 2–3 replies vs 0 will swing your rate dramatically.",
    });
  }

  if (rates.acceptance_tier === "great" && rates.reply_tier === "poor" && enoughDMs) {
    d.push({
      severity: "critical",
      code: "acceptance_reply_mismatch",
      message: `Great acceptance (${pct(rates.acceptance_rate)}%) but poor replies (${pct(rates.reply_rate)}%) — classic bait-and-switch signal.`,
      recommendation: "Your connection note earns trust but your first DM destroys it. The tone of note → DM must feel like the SAME person. Try: first DM that continues the exact thread from the note, not a fresh pitch.",
    });
  }

  if (d.length === 0) {
    d.push({
      severity: "info",
      code: "healthy",
      message: "Your funnel is operating within or above industry benchmarks across the board.",
      recommendation: "Hold the strategy. Scale volume gradually (10% per week) to avoid LinkedIn flags.",
    });
  }

  return d;
}

// ─────────────────────────────────────────────────────────────────────
// Top blockers — which stage is leaking the most leads?
// ─────────────────────────────────────────────────────────────────────
function topBlockers(f: Funnel): Array<{ stage: string; lost: number; conversion: number }> {
  const stages = [
    { stage: "icp_filter",          lost: f.icp_rejected,                                   base: f.total_leads,  next: f.icp_approved },
    { stage: "connection_request",  lost: Math.max(0, f.icp_approved - f.connection_requested), base: f.icp_approved, next: f.connection_requested },
    { stage: "acceptance",          lost: Math.max(0, f.connection_requested - f.connected), base: f.connection_requested, next: f.connected },
    { stage: "dm_send",             lost: Math.max(0, f.connected - f.dm_sent),             base: f.connected,    next: f.dm_sent },
    { stage: "reply",               lost: Math.max(0, f.dm_sent - f.replied),               base: f.dm_sent,      next: f.replied },
    { stage: "positive_reply",      lost: Math.max(0, f.replied - f.positive_replies),      base: f.replied,      next: f.positive_replies },
    { stage: "meeting_booked",      lost: Math.max(0, f.positive_replies - f.meetings_booked), base: f.positive_replies, next: f.meetings_booked },
  ];
  return stages
    .map((s) => ({ stage: s.stage, lost: s.lost, conversion: safeDiv(s.next, s.base) }))
    .filter((s) => s.lost > 0)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const user_id: string | undefined = body.user_id;
    const campaign_profile_id: string | undefined = body.campaign_profile_id;
    const window_days: number = Number.isFinite(body.window_days) ? Math.max(1, Math.min(365, body.window_days)) : 30;

    if (!user_id) {
      return new Response(JSON.stringify({ error: "user_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull the columns we need to classify funnel state. Note: replied_at /
    // meeting_booked_at / reply_sentiment intentionally omitted — this
    // project tracks reply progression through `status` today.
    const columns = [
      "id", "status", "icp_match",
      "profile_visited_at", "connection_sent_at",
      "connected_at", "connection_accepted_at",
      "dm_sent_at", "created_at", "campaign_profile_id",
    ].join(",");

    // PostgREST defaults to a 1000 row cap per request. Paginate in pages of
    // 1000 up to a hard cap so users with large histories still get accurate
    // funnel counts. Cap at 20k pages (20k leads) to stay under ~5s runtime.
    const PAGE = 1000;
    const HARD_CAP = 20000;
    const all: any[] = [];
    for (let offset = 0; offset < HARD_CAP; offset += PAGE) {
      let q = supabase
        .from("campaign_leads")
        .select(columns)
        .eq("user_id", user_id)
        .range(offset, offset + PAGE - 1);
      if (campaign_profile_id) q = q.eq("campaign_profile_id", campaign_profile_id);
      const { data: page, error: pageErr } = await q;
      if (pageErr) throw pageErr;
      if (!page || page.length === 0) break;
      all.push(...page);
      if (page.length < PAGE) break;
    }

    // Lifetime
    const lifetimeFunnel = buildFunnel(all);
    const lifetimeRates = computeRates(lifetimeFunnel);

    // Windowed — last N days by created_at
    const cutoff = new Date(Date.now() - window_days * 24 * 60 * 60 * 1000).toISOString();
    const windowed = all.filter((l: any) => l.created_at && l.created_at >= cutoff);
    const windowFunnel = buildFunnel(windowed);
    const windowRates = computeRates(windowFunnel);

    const diagnosis = buildDiagnosis(lifetimeRates, lifetimeFunnel);
    const blockers = topBlockers(lifetimeFunnel);

    // Credit usage
    const { data: settings } = await supabase
      .from("user_settings")
      // NOTE: column is `cycle_start_date`, not `cycle_start_at`. Wrong
      // name silently 400s the whole query and credit usage disappears
      // from the dashboard.
      .select("leads_used_this_cycle, max_leads_per_cycle, cycle_start_date")
      .eq("user_id", user_id)
      .maybeSingle();

    // Generated messages count (volume sanity check)
    const { count: messagesCount } = await supabase
      .from("generated_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user_id);

    return new Response(JSON.stringify({
      user_id,
      campaign_profile_id: campaign_profile_id || null,
      lifetime: {
        funnel: lifetimeFunnel,
        rates: lifetimeRates,
      },
      window: {
        days: window_days,
        funnel: windowFunnel,
        rates: windowRates,
      },
      benchmarks: BENCHMARKS,
      diagnosis,
      top_blockers: blockers,
      credits: settings ? {
        used: settings.leads_used_this_cycle || 0,
        max: settings.max_leads_per_cycle || 0,
        remaining: Math.max(0, (settings.max_leads_per_cycle || 0) - (settings.leads_used_this_cycle || 0)),
        cycle_start_at: settings.cycle_start_date || null,
      } : null,
      messages_generated_total: messagesCount || 0,
      updated_at: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("campaign-metrics error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
