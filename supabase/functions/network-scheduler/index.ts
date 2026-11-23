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
import {
  buildMyNetworkPostSearchUrl, buildPeopleSearchUrl, buildPostSearchUrl, buildSalesNavPeopleSearchUrl, fireAndForget, hasProductAccess, salesNavEnabled, type Icp, renderInviteNote } from "../_shared/network.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

const HOUR = 3600 * 1000;
const POST_SEARCH_EVERY_MS = 6 * HOUR;
// A people search reads up to 25 profiles at once: a few a day, hours apart.
const MIN_GAP_BETWEEN_PEOPLE_SEARCHES_MS = 3 * HOUR;
const MAX_PEOPLE_SEARCHES_PER_DAY = 2;
const WITHDRAW_AFTER_DAYS = 21;
const SYNC_EVERY_MS = 12 * HOUR;
const MAX_PENDING_APPROVAL = 50; // don't flood the approval queue
// Posts of the user's own connections about the subjects they comment on (no profile page opened).
const MY_NETWORK_SEARCHES_PER_DAY = 5;
const MY_NETWORK_SEARCH_GAP_MS = 75 * 60 * 1000;
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
  // Growth comments (campaign_lead_id set) are posted by the Growth engine, not by this scheduler.
  const { data: staleM } = await supabase.from("monitored_posts").select("id")
    .eq("user_id", userId).eq("status", "queued").is("campaign_lead_id", null).lt("updated_at", staleBefore).limit(200);
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
    // "Today" is the user's local day (same start the profile-page budget uses), not the last 24 hours:
    // with a rolling window, yesterday's late-morning invitations blocked this morning's.
    const { data: budgetRows } = await supabase.rpc("profile_page_budget", { p_user_id: userId });
    const budgetRow = Array.isArray(budgetRows) ? budgetRows[0] : budgetRows;
    const dayAgo = budgetRow?.day_start || new Date(now - 24 * HOUR).toISOString();
    // The weekly limit is one budget for the account: invites sent by campaigns (Outreach) count too.
    const campaignInvites = (since: string) => supabase.from("action_queue").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("action_type", "send_connection_request").eq("status", "completed")
      .not("campaign_lead_id", "is", null).gte("completed_at", since);
    const [{ count: networkWeek }, { count: networkDay }, { count: campaignWeek }, { count: campaignDay }] = await Promise.all([
      supabase.from("network_prospects").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("invited_at", weekAgo),
      supabase.from("network_prospects").select("id", { count: "exact", head: true })
        .eq("user_id", userId).gte("invited_at", dayAgo),
      campaignInvites(weekAgo),
      campaignInvites(dayAgo),
    ]);
    const invitedWeek = (networkWeek || 0) + (campaignWeek || 0);
    const invitedDay = (networkDay || 0) + (campaignDay || 0);
    const queuedInvites = pendingOf("send_connection_request").length;
    const dailyTarget = Math.ceil(weeklyLimit / 7);
    const weeklyRemaining = weeklyLimit - (invitedWeek || 0) - queuedInvites;
    const todayRemaining = dailyTarget - (invitedDay || 0) - queuedInvites;
    // Each invitation opens a profile page: never queue past what is left of today's page ceiling.
    // The queue guard refuses campaign pages over the ceiling but lets invitations through, so the
    // stop has to be here. If the budget cannot be read, queue nothing.
    const pagesLeft = budgetRow ? Math.max(0, (Number(budgetRow.day_limit) || 0) - (Number(budgetRow.used) || 0)) : 0;
    const toQueue = invitesPaused ? 0 : Math.max(0, Math.min(weeklyRemaining, todayRemaining, pagesLeft));
    out.invites = { weeklyLimit, invitedWeek, invitedDay, queuedInvites, toQueue, pagesLeft, paused: !!invitesPaused };

    let queuedNow = 0;
    if (toQueue > 0) {
      const { data: candidates } = await supabase.from("network_prospects")
        .select("id, icp_id, linkedin_url, full_name, fit_score, mutual_connections")
        .eq("user_id", userId).eq("status", "qualified")
        // 3rd-degree profiles do not offer a Connect control the extension can use (2026-11-23: 6 of 6
        // came back without one). Inviting them only spends a profile page, so they wait.
        .or("degree.is.null,degree.not.ilike.3rd*")
        .in("icp_id", prospectingIcps.map((i) => i.id))
        .order("fit_score", { ascending: false })
        .order("mutual_connections", { ascending: false, nullsFirst: false })
        .limit(toQueue);
      const icpById = new Map(prospectingIcps.map((i) => [i.id, i]));
      let at = now + rand(3, 8) * 60 * 1000;
      for (const p of candidates || []) {
        if (!fits(at)) break; // the rest goes tomorrow
        await queueAction(supabase, {
          user_id: userId,
          action_type: "send_connection_request",
          linkedin_url: p.linkedin_url,
          message_text: renderInviteNote(icpById.get(p.icp_id)?.invite_note, p.full_name), // note is optional, set per audience
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
    // Only prospects that can be invited count as pool (see the 3rd-degree note above); otherwise a pool
    // made of 3rd-degree people would stop new searches while nothing could be sent.
    const { count: qualifiedPool } = await supabase.from("network_prospects").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "qualified").or("degree.is.null,degree.not.ilike.3rd*")
      // Same audiences as the invitations above: prospects of an audience with invitations turned off are never queued.
      .in("icp_id", prospectingIcps.map((i) => i.id));
    const searchesPaused = ext.searches_paused_until && new Date(ext.searches_paused_until).getTime() > now;
    const monthStart = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1)).toISOString();
    const { count: searchesThisMonth } = await supabase.from("network_search_runs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("kind", ["people", "connections"]).gte("created_at", monthStart)
      .in("status", ["completed", "failed", "limit_reached"]);
    const budget = ext.monthly_people_search_budget ?? 250;
    const needMore = (qualifiedPool || 0) < dailyTarget * 3;
    const noPendingSearch = pendingOf("network_search_people").length === 0;
    const { data: lastRun } = await supabase.from("network_search_runs").select("created_at")
      .eq("user_id", userId).eq("kind", "people").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const gapOk = !lastRun || now - new Date(lastRun.created_at).getTime() > MIN_GAP_BETWEEN_PEOPLE_SEARCHES_MS;
    const { count: searchesToday } = await supabase.from("network_search_runs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("kind", "people").gte("created_at", dayAgo);
    const dayOk = (searchesToday || 0) < MAX_PEOPLE_SEARCHES_PER_DAY;
    out.search = { qualifiedPool, searchesThisMonth, searchesToday, budget, paused: !!searchesPaused };

    if (needMore && noPendingSearch && gapOk && dayOk && !searchesPaused && (searchesThisMonth || 0) < budget) {
      const fortnight = 14 * 24 * HOUR;
      const eligible = prospectingIcps
        .filter((i) => !i.people_search_exhausted_at || now - new Date(i.people_search_exhausted_at).getTime() > fortnight)
        .sort((a, b) => (a.last_people_search_at ? new Date(a.last_people_search_at).getTime() : 0)
          - (b.last_people_search_at ? new Date(b.last_people_search_at).getTime() : 0));
      const icp = eligible[0];
      if (icp) {
        const page = (icp.people_search_page || 0) + 1;
        // Sales Navigator: real filters (title, seniority, region, company size, posted recently).
        const sn = salesNavEnabled(ext, now);
        const url = sn ? buildSalesNavPeopleSearchUrl(icp, page) : buildPeopleSearchUrl(icp, page);
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
          action_data: {
            module: "network", icp_id: icp.id, search_run_id: run.id, search_url: url, page,
            ...(sn ? { reader: "sales_navigator" } : {}),
          },
        });
        out.people_search_queued = { icp: icp.name, page, sales_navigator: sn };
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

    // Comments are no longer queued for the extension: the person posts each one on LinkedIn
    // from the Inbox (LinkedIn, 13 Mar 2026: a comment needs the member to click "comment").
  }

  // ── 6. My network: recent posts of 1st-degree connections about the user's own subjects.
  // One search page per subject, a few per day. It finds who posted without opening any profile.
  const terms: string[] = (ext.comment_search_terms || []).map((t: string) => String(t).trim()).filter(Boolean);
  if (terms.length && pendingOf("network_search_posts").length === 0) {
    const { count: waiting } = await supabase.from("monitored_posts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "pending");
    const since = new Date(now - 24 * HOUR).toISOString();
    const { data: runs } = await supabase.from("network_search_runs").select("created_at, query")
      .eq("user_id", userId).eq("kind", "posts").contains("query", { source: "my_network" })
      .order("created_at", { ascending: false }).limit(40);
    const lastRun = (runs || [])[0];
    const today = (runs || []).filter((r: any) => r.created_at >= since).length;
    const gapOk = !lastRun || now - new Date(lastRun.created_at).getTime() > MY_NETWORK_SEARCH_GAP_MS;
    if ((waiting || 0) < MAX_PENDING_APPROVAL && today < MY_NETWORK_SEARCHES_PER_DAY && gapOk) {
      const lastIdx = lastRun ? terms.indexOf(String((lastRun as any).query?.term || "")) : -1;
      const term = terms[(lastIdx + 1) % terms.length];
      const url = buildMyNetworkPostSearchUrl(term);
      const { data: run, error: runErr } = await supabase.from("network_search_runs").insert({
        user_id: userId, kind: "posts", page: 1, search_url: url, status: "queued",
        query: { source: "my_network", term },
      }).select("id").single();
      if (runErr) throw runErr;
      await queueAction(supabase, {
        user_id: userId,
        action_type: "network_search_posts",
        linkedin_url: url,
        priority: 4,
        scheduled_for: new Date(now + rand(2, 12) * 60 * 1000).toISOString(),
        action_data: { module: "network", source: "my_network", term, search_run_id: run.id, search_url: url },
      });
      out.my_network_search_queued = term;
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
    // People who set subjects to follow in their own network run even without an active ICP.
    const { data: kbRows, error: kbErr } = await supabase.from("profiles")
      .select("user_id, comment_search_terms").not("comment_search_terms", "is", null);
    if (kbErr) throw kbErr;
    const termsByUser = new Map<string, string[]>();
    for (const r of (kbRows || []) as any[]) {
      if (Array.isArray(r.comment_search_terms) && r.comment_search_terms.length) {
        termsByUser.set(r.user_id, r.comment_search_terms);
        if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      }
    }
    if (byUser.size === 0) return json({ ok: true, users: 0 });

    const { data: exts, error: extErr } = await supabase.from("extension_status")
      .select("user_id, is_connected, is_paused, active_days, active_hours_start, active_hours_end, timezone, weekly_invite_limit, daily_comment_limit, monthly_people_search_budget, invites_paused_until, searches_paused_until, last_connections_sync_at, linkedin_account_tier, sales_nav_failed_at")
      .in("user_id", Array.from(byUser.keys()));
    if (extErr) throw extErr;

    const results: unknown[] = [];
    let skipped = 0;
    let noAccess = 0;
    for (const ext of exts || []) {
      if (!ext.is_connected || ext.is_paused) { skipped++; continue; }
      // Trial over and no paid plan: nothing new is searched, drafted or invited.
      if (!(await hasProductAccess(supabase, ext.user_id))) { noAccess++; continue; }
      try {
        results.push(await runForUser(supabase, { ...ext, comment_search_terms: termsByUser.get(ext.user_id) || [] }, byUser.get(ext.user_id) || []));
      } catch (e) {
        console.error(`network-scheduler user ${String(ext.user_id).slice(0, 8)} failed:`, e);
        results.push({ user: String(ext.user_id).slice(0, 8), error: true });
      }
    }
    return json({ ok: true, users: results.length, skipped_offline: skipped, skipped_no_access: noAccess, results });
  } catch (e) {
    console.error("network-scheduler error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
