// network-scheduler
// Cron (service key only), every 20 minutes. For each user with an active ICP and a connected,
// unpaused extension, it keeps the "Rede" module moving:
//   - queues connection requests (no note) for qualified prospects, within the weekly limit
//   - queues a people search when the pool of qualified prospects runs low (respecting the
//     monthly search budget of free LinkedIn accounts)
//   - queues a daily sync to detect accepted invites, and withdraws invites pending > 21 days
//   - queues post searches per ICP every 6h and publishes comments the user APPROVED,
//     spaced out and within the daily comment limit
// Nothing is ever commented without explicit approval in the dashboard.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";
import { buildPeopleSearchUrl, buildPostSearchUrl, fireAndForget, type Icp } from "../_shared/network.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

const HOUR = 3600 * 1000;
const POST_SEARCH_EVERY_MS = 6 * HOUR;
const MIN_GAP_BETWEEN_PEOPLE_SEARCHES_MS = 30 * 60 * 1000;
const WITHDRAW_AFTER_DAYS = 21;
const SYNC_EVERY_MS = 12 * HOUR;
const MAX_PENDING_APPROVAL = 50; // don't flood the approval queue
const STALE_QUEUED_MS = 36 * HOUR;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Minutes left in the user's active window right now (0 = outside the window). */
function minutesLeftInWindow(ext: any, now: number): number {
  const tz = ext.timezone || "America/New_York";
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(now)).map((p) => [p.type, p.value]));
  } catch (_) {
    return 0;
  }
  const day = String(parts.weekday || "").slice(0, 3).toLowerCase();
  const activeDays: string[] = Array.isArray(ext.active_days) && ext.active_days.length ? ext.active_days : DAY_KEYS;
  if (!activeDays.includes(day)) return 0;
  const toMin = (t: string, d: number) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : d;
  };
  const start = toMin(ext.active_hours_start, 8 * 60);
  const end = toMin(ext.active_hours_end, 18 * 60);
  const cur = Number(parts.hour) * 60 + Number(parts.minute);
  if (cur < start || cur >= end) return 0;
  return end - cur;
}

async function pendingNetworkActions(supabase: Supa, userId: string) {
  const { data, error } = await supabase.from("action_queue")
    .select("id, action_type, action_data, status")
    .eq("user_id", userId)
    .in("status", ["pending", "in_progress"])
    .contains("action_data", { module: "network" })
    .limit(500);
  if (error) throw error;
  return data || [];
}

async function queueAction(supabase: Supa, row: Record<string, unknown>) {
  const { data, error } = await supabase.from("action_queue").insert({ status: "pending", ...row }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function runForUser(supabase: Supa, ext: any, icps: Icp[]) {
  const userId: string = ext.user_id;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const out: Record<string, unknown> = { user: userId.slice(0, 8) };
  const pending = await pendingNetworkActions(supabase, userId);
  const pendingOf = (t: string) => pending.filter((a: any) => a.action_type === t);

  // ── 0. Recover items stuck in 'queued' whose queue row vanished (e.g. cleaned by watchdog)
  const pendingProspectIds = new Set(pendingOf("send_connection_request").map((a: any) => a.action_data?.prospect_id));
  const pendingPostIds = new Set(pendingOf("post_comment").map((a: any) => a.action_data?.post_id));
  const staleBefore = new Date(now - STALE_QUEUED_MS).toISOString();
  const { data: staleP } = await supabase.from("network_prospects").select("id")
    .eq("user_id", userId).eq("status", "queued").lt("updated_at", staleBefore).limit(200);
  const revertP = (staleP || []).map((r: any) => r.id).filter((id: string) => !pendingProspectIds.has(id));
  if (revertP.length) await supabase.from("network_prospects").update({ status: "qualified" }).in("id", revertP);
  const { data: staleM } = await supabase.from("monitored_posts").select("id")
    .eq("user_id", userId).eq("status", "queued").lt("updated_at", staleBefore).limit(200);
  const revertM = (staleM || []).map((r: any) => r.id).filter((id: string) => !pendingPostIds.has(id));
  if (revertM.length) await supabase.from("monitored_posts").update({ status: "approved" }).in("id", revertM);

  // ── 1. Kick AI processing for leftovers (scoring / drafting that failed or was skipped)
  const tenMinAgo = new Date(now - 10 * 60 * 1000).toISOString();
  const [{ count: discovered }, { count: newPosts }] = await Promise.all([
    supabase.from("network_prospects").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "discovered").lt("created_at", tenMinAgo),
    supabase.from("monitored_posts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "new").lt("created_at", tenMinAgo),
  ]);
  if ((discovered || 0) > 0 || (newPosts || 0) > 0) fireAndForget("network-process", { user_id: userId });

  // Everything below touches LinkedIn: only inside the user's active days/hours (like a human would).
  const minutesLeft = minutesLeftInWindow(ext, now);
  out.window_minutes_left = minutesLeft;
  if (minutesLeft < 20) return out;
  const windowEnd = now + minutesLeft * 60 * 1000;
  const fits = (t: number) => t < windowEnd - 5 * 60 * 1000;

  const prospectingIcps = icps.filter((i) => i.prospecting_enabled);
  const engagementIcps = icps.filter((i) => i.engagement_enabled);

  // ── 2. Connection requests (no note) within the weekly limit
  if (prospectingIcps.length) {
    const weeklyLimit = ext.weekly_invite_limit ?? 100;
    const invitesPaused = ext.invites_paused_until && new Date(ext.invites_paused_until).getTime() > now;
    const weekAgo = new Date(now - 7 * 24 * HOUR).toISOString();
    const dayAgo = new Date(now - 24 * HOUR).toISOString();
    const [{ count: invitedWeek }, { count: invitedDay }] = await Promise.all([
      supabase.from("network_prospects").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("invited_at", weekAgo),
      supabase.from("network_prospects").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("invited_at", dayAgo),
    ]);
    const queuedInvites = pendingOf("send_connection_request").length;
    const dailyTarget = Math.ceil(weeklyLimit / 7);
    const weeklyRemaining = weeklyLimit - (invitedWeek || 0) - queuedInvites;
    const todayRemaining = dailyTarget - (invitedDay || 0) - queuedInvites;
    const toQueue = invitesPaused ? 0 : Math.max(0, Math.min(weeklyRemaining, todayRemaining));
    out.invites = { weeklyLimit, invitedWeek, invitedDay, queuedInvites, toQueue, paused: !!invitesPaused };

    let queuedNow = 0;
    if (toQueue > 0) {
      const { data: candidates } = await supabase.from("network_prospects")
        .select("id, icp_id, linkedin_url, full_name, fit_score, mutual_connections")
        .eq("user_id", userId).eq("status", "qualified")
        .in("icp_id", prospectingIcps.map((i) => i.id))
        .order("fit_score", { ascending: false })
        .order("mutual_connections", { ascending: false, nullsFirst: false })
        .limit(toQueue);
      let at = now + rand(3, 8) * 60 * 1000;
      for (const p of candidates || []) {
        if (!fits(at)) break; // the rest goes tomorrow
        await queueAction(supabase, {
          user_id: userId,
          action_type: "send_connection_request",
          linkedin_url: p.linkedin_url,
          message_text: null, // no note, by design
          priority: 2,
          scheduled_for: new Date(at).toISOString(),
          action_data: { module: "network", prospect_id: p.id, icp_id: p.icp_id, expected_name: p.full_name },
        });
        await supabase.from("network_prospects").update({ status: "queued" }).eq("id", p.id);
        at += rand(12, 30) * 60 * 1000;
        queuedNow++;
      }
      out.invites_queued = queuedNow;
    }

    // ── 3. Refill the pool with a people search when it runs low
    const { count: qualifiedPool } = await supabase.from("network_prospects").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "qualified");
    const searchesPaused = ext.searches_paused_until && new Date(ext.searches_paused_until).getTime() > now;
    const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).toISOString();
    const { count: searchesThisMonth } = await supabase.from("network_search_runs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("kind", "people").gte("created_at", monthStart)
      .in("status", ["completed", "failed", "limit_reached"]);
    const budget = ext.monthly_people_search_budget ?? 250;
    const needMore = (qualifiedPool || 0) < dailyTarget * 3;
    const noPendingSearch = pendingOf("network_search_people").length === 0;
    const { data: lastRun } = await supabase.from("network_search_runs").select("created_at")
      .eq("user_id", userId).eq("kind", "people").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const gapOk = !lastRun || now - new Date(lastRun.created_at).getTime() > MIN_GAP_BETWEEN_PEOPLE_SEARCHES_MS;
    out.search = { qualifiedPool, searchesThisMonth, budget, paused: !!searchesPaused };

    if (needMore && noPendingSearch && gapOk && !searchesPaused && (searchesThisMonth || 0) < budget) {
      const fortnight = 14 * 24 * HOUR;
      const eligible = prospectingIcps
        .filter((i) => !i.people_search_exhausted_at || now - new Date(i.people_search_exhausted_at).getTime() > fortnight)
        .sort((a, b) => (a.last_people_search_at ? new Date(a.last_people_search_at).getTime() : 0)
          - (b.last_people_search_at ? new Date(b.last_people_search_at).getTime() : 0));
      const icp = eligible[0];
      if (icp) {
        const page = (icp.people_search_page || 0) + 1;
        const url = buildPeopleSearchUrl(icp, page);
        const { data: run, error: runErr } = await supabase.from("network_search_runs").insert({
          user_id: userId, icp_id: icp.id, kind: "people", page, search_url: url, status: "queued",
        }).select("id").single();
        if (runErr) throw runErr;
        await queueAction(supabase, {
          user_id: userId,
          action_type: "network_search_people",
          linkedin_url: url,
          priority: 4,
          scheduled_for: new Date(now + rand(1, 5) * 60 * 1000).toISOString(),
          action_data: { module: "network", icp_id: icp.id, search_run_id: run.id, search_url: url, page },
        });
        out.people_search_queued = { icp: icp.name, page };
      }
    }

    // ── 4. Sync accepted invites (twice a day) and withdraw stale invites
    const { count: openInvites } = await supabase.from("network_prospects").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "invited");
    const lastSync = ext.last_connections_sync_at ? new Date(ext.last_connections_sync_at).getTime() : 0;
    if ((openInvites || 0) > 0 && now - lastSync > SYNC_EVERY_MS && pendingOf("network_sync_connections").length === 0) {
      await queueAction(supabase, {
        user_id: userId,
        action_type: "network_sync_connections",
        linkedin_url: "https://www.linkedin.com/mynetwork/invite-connect/connections/",
        priority: 3,
        scheduled_for: new Date(now + rand(2, 10) * 60 * 1000).toISOString(),
        action_data: { module: "network" },
      });
      out.sync_queued = true;
    }
    if (pendingOf("network_withdraw_invites").length === 0) {
      const cutoff = new Date(now - WITHDRAW_AFTER_DAYS * 24 * HOUR).toISOString();
      const { data: stale } = await supabase.from("network_prospects").select("linkedin_url")
        .eq("user_id", userId).eq("status", "invited").lt("invited_at", cutoff).limit(10);
      if (stale && stale.length) {
        await queueAction(supabase, {
          user_id: userId,
          action_type: "network_withdraw_invites",
          linkedin_url: "https://www.linkedin.com/mynetwork/invitation-manager/sent/",
          priority: 5,
          scheduled_for: new Date(now + rand(10, 40) * 60 * 1000).toISOString(),
          action_data: { module: "network", profile_urls: stale.map((s: any) => s.linkedin_url) },
        });
        out.withdraw_queued = stale.length;
      }
    }
  }

  // ── 5. Engagement: find fresh posts per ICP and publish APPROVED comments
  if (engagementIcps.length) {
    const { count: awaiting } = await supabase.from("monitored_posts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "pending");
    if ((awaiting || 0) < MAX_PENDING_APPROVAL && pendingOf("network_search_posts").length === 0) {
      const due = engagementIcps
        .filter((i) => !i.last_post_search_at || now - new Date(i.last_post_search_at).getTime() > POST_SEARCH_EVERY_MS)
        .sort((a, b) => (a.last_post_search_at ? new Date(a.last_post_search_at).getTime() : 0)
          - (b.last_post_search_at ? new Date(b.last_post_search_at).getTime() : 0))[0];
      if (due) {
        const url = buildPostSearchUrl(due);
        const { data: run, error: runErr } = await supabase.from("network_search_runs").insert({
          user_id: userId, icp_id: due.id, kind: "posts", page: 1, search_url: url, status: "queued",
        }).select("id").single();
        if (runErr) throw runErr;
        await queueAction(supabase, {
          user_id: userId,
          action_type: "network_search_posts",
          linkedin_url: url,
          priority: 4,
          scheduled_for: new Date(now + rand(1, 6) * 60 * 1000).toISOString(),
          action_data: { module: "network", icp_id: due.id, search_run_id: run.id, search_url: url },
        });
        // mark now so a slow extension doesn't get a second search for the same ICP
        await supabase.from("icps").update({ last_post_search_at: nowIso }).eq("id", due.id);
        out.post_search_queued = due.name;
      }
    }

    const dailyComments = ext.daily_comment_limit ?? 20;
    const dayAgo = new Date(now - 24 * HOUR).toISOString();
    const { count: postedDay } = await supabase.from("monitored_posts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).gte("commented_at", dayAgo);
    const queuedComments = pendingOf("post_comment").length;
    const allowance = Math.max(0, dailyComments - (postedDay || 0) - queuedComments);
    if (allowance > 0) {
      const { data: approved } = await supabase.from("monitored_posts")
        .select("id, icp_id, post_url, final_comment, suggested_comment, author_name")
        .eq("user_id", userId).eq("status", "approved")
        .order("priority", { ascending: false }).order("approved_at", { ascending: true })
        .limit(Math.min(allowance, 4)); // a few per run, the rest in later runs
      let at = now + rand(4, 12) * 60 * 1000;
      let commentsNow = 0;
      for (const p of approved || []) {
        if (!fits(at)) break;
        const text = (p.final_comment || p.suggested_comment || "").trim();
        if (!text || !p.post_url) {
          await supabase.from("monitored_posts").update({ status: "failed", last_error: "missing comment text or post url" }).eq("id", p.id);
          continue;
        }
        await queueAction(supabase, {
          user_id: userId,
          action_type: "post_comment",
          linkedin_url: p.post_url,
          message_text: text,
          priority: 2,
          scheduled_for: new Date(at).toISOString(),
          action_data: { module: "network", post_id: p.id, icp_id: p.icp_id, post_url: p.post_url },
        });
        await supabase.from("monitored_posts").update({ status: "queued" }).eq("id", p.id);
        at += rand(20, 45) * 60 * 1000;
        commentsNow++;
      }
      out.comments_queued = commentsNow;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authenticate(req, { allowService: true, allowUser: false });
  if (!auth) return unauthorized();

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: icpRows, error: icpErr } = await supabase.from("icps").select("*").eq("is_active", true);
    if (icpErr) throw icpErr;
    const byUser = new Map<string, Icp[]>();
    for (const i of (icpRows || []) as Icp[]) {
      const l = byUser.get(i.user_id) || [];
      l.push(i);
      byUser.set(i.user_id, l);
    }
    if (byUser.size === 0) return json({ ok: true, users: 0 });

    const { data: exts, error: extErr } = await supabase.from("extension_status")
      .select("user_id, is_connected, is_paused, active_days, active_hours_start, active_hours_end, timezone, weekly_invite_limit, daily_comment_limit, monthly_people_search_budget, invites_paused_until, searches_paused_until, last_connections_sync_at, linkedin_account_tier")
      .in("user_id", Array.from(byUser.keys()));
    if (extErr) throw extErr;

    const results: unknown[] = [];
    let skipped = 0;
    for (const ext of exts || []) {
      if (!ext.is_connected || ext.is_paused) { skipped++; continue; }
      try {
        results.push(await runForUser(supabase, ext, byUser.get(ext.user_id) || []));
      } catch (e) {
        console.error(`network-scheduler user ${String(ext.user_id).slice(0, 8)} failed:`, e);
        results.push({ user: String(ext.user_id).slice(0, 8), error: true });
      }
    }
    return json({ ok: true, users: results.length, skipped_offline: skipped, results });
  } catch (e) {
    console.error("network-scheduler error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
