import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Status → next action mapping
// Day 0: visit_profile → Day 1: follow_profile → Day 2: send_connection_request
const STATUS_TO_ACTION: Record<string, string> = {
  ready: "visit_profile",
  visiting_profile: "follow_profile",
  following: "send_connection_request",
  connection_sent: "check_connection_status",
  connected: "send_dm",
  dm_sent: "check_reply_status",
  waiting_reply: "send_followup",
};

// Actions that involve sending a message — restricted to business hours
const MESSAGING_ACTIONS = new Set(["send_connection_request", "send_dm", "send_followup"]);

// Action → message field mapping
const ACTION_MESSAGE_FIELD: Record<string, string> = {
  send_connection_request: "connection_note",
  send_dm: "custom_dm",
  send_followup: "custom_followup",
};

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function randomBusinessTime(
  activeDays: string[] = ['mon','tue','wed','thu','fri'],
  startHour = '08:00',
  endHour = '18:00',
  daysAhead = 1
): string {
  const start = startHour.split(':').map(Number);
  const end = endHour.split(':').map(Number);
  const startMin = start[0] * 60 + (start[1] || 0);
  const endMin = end[0] * 60 + (end[1] || 0);
  const allowedDays = new Set(activeDays.map(d => DAY_MAP[d]).filter(d => d !== undefined));

  const date = new Date();
  date.setDate(date.getDate() + daysAhead);

  // Find next allowed day
  for (let i = 0; i < 7; i++) {
    if (allowedDays.has(date.getDay())) break;
    date.setDate(date.getDate() + 1);
  }

  const randomMin = startMin + Math.floor(Math.random() * (endMin - startMin));
  date.setHours(Math.floor(randomMin / 60), randomMin % 60, 0, 0);
  return date.toISOString();
}

/**
 * Spread actions across remaining business hours today.
 * slotIndex 0 = soonest (5-10 min from now), each subsequent slot adds
 * a random 8-20 min gap, ensuring natural spacing like a human.
 * If the computed time exceeds today's end hour, it stays at end hour
 * (schedule-actions will pick it up next cycle).
 */
function computeThrottledTime(
  slotIndex: number,
  startHour: string,
  endHour: string,
  minGapMin = 8,
  maxGapMin = 20
): string {
  const now = new Date();
  const [startH, startM] = startHour.split(':').map(Number);
  const [endH, endM] = endHour.split(':').map(Number);

  const todayStart = new Date(now);
  todayStart.setHours(startH, startM || 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(endH, endM || 0, 0, 0);

  // Base time: max of now and today's start hour
  const baseTime = new Date(Math.max(now.getTime(), todayStart.getTime()));

  // First action: 2-5 min from base. Each subsequent: add configurable gap
  const initialDelayMs = (2 + Math.floor(Math.random() * 3)) * 60 * 1000;
  const perSlotGapMs = slotIndex * (minGapMin + Math.floor(Math.random() * (maxGapMin - minGapMin))) * 60 * 1000;
  const jitterMs = Math.floor(Math.random() * 2 * 60 * 1000); // 0-2 min jitter

  const scheduledTime = new Date(baseTime.getTime() + initialDelayMs + perSlotGapMs + jitterMs);

  // Cap at today's end hour
  if (scheduledTime > todayEnd) {
    scheduledTime.setTime(todayEnd.getTime());
  }

  return scheduledTime.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date().toISOString();
    const todayDateStr = new Date().toISOString().slice(0, 10);
    const activeStatuses = Object.keys(STATUS_TO_ACTION);

    // Get all extension_status to know user schedules
    const { data: allExtensions } = await supabase
      .from("extension_status")
      .select("user_id, is_connected, is_paused, active_days, active_hours_start, active_hours_end, timezone, last_limit_reset_at, visits_today, actions_today, connection_requests_today, messages_today, daily_limit_visits, daily_limit_connection_requests, daily_limit_messages");

    // ── Daily counter reset (inline, before any limit checks) ──
    for (const ext of allExtensions || []) {
      const lastResetDate = ext.last_limit_reset_at
        ? new Date(ext.last_limit_reset_at).toISOString().slice(0, 10)
        : null;

      if (lastResetDate !== todayDateStr) {
        await supabase
          .from("extension_status")
          .update({
            visits_today: 0,
            actions_today: 0,
            connection_requests_today: 0,
            messages_today: 0,
            last_limit_reset_at: now,
            updated_at: now,
          })
          .eq("user_id", ext.user_id);

        // Update local copy so limit checks below use fresh values
        ext.visits_today = 0;
        ext.actions_today = 0;
        ext.connection_requests_today = 0;
        ext.messages_today = 0;
        ext.last_limit_reset_at = now;
        console.log(`Reset daily counters for user ${ext.user_id.slice(0, 8)}…`);
      }
    }

    const extensionMap = new Map(
      (allExtensions || []).map(e => [e.user_id, e])
    );

    // Get active campaigns only (include stage approval flags)
    const { data: activeCampaigns } = await supabase
      .from("campaign_profiles")
      .select("id, auto_approve_dms, stage_connection_approved, stage_dm_approved, stage_followup_approved")
      .eq("status", "active");

    const activeCampaignIds = (activeCampaigns || []).map(c => c.id);
    const campaignAutoApprove = new Map(
      (activeCampaigns || []).map(c => [c.id, c.auto_approve_dms === true])
    );
    // Stage approval maps
    const campaignStageConnection = new Map(
      (activeCampaigns || []).map(c => [c.id, c.stage_connection_approved === true])
    );
    const campaignStageDm = new Map(
      (activeCampaigns || []).map(c => [c.id, c.stage_dm_approved === true])
    );
    const campaignStageFollowup = new Map(
      (activeCampaigns || []).map(c => [c.id, c.stage_followup_approved === true])
    );

    if (activeCampaignIds.length === 0) {
      return new Response(JSON.stringify({
        success: true, scheduled: 0, timeouts: 0, leads_checked: 0,
        message: "No active campaigns",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check how many actions were already created/completed today per user to avoid flooding
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { data: todayActions } = await supabase
      .from("action_queue")
      .select("user_id, action_type, status, campaign_lead_id")
      .gte("created_at", todayStart.toISOString())
      .in("status", ["pending", "completed", "in_progress"]);

    // ── Per-campaign balancing maps ──
    const connReqsPerUserCampaign = new Map<string, number>(); // "userId:campaignId" -> count
    const visitActionsPerUser = new Map<string, number>(); // "userId" -> count (visit+follow)
    const visitActionsPerUserCampaign = new Map<string, number>(); // "userId:campaignId" -> count

    const todayConnReqLeadIds = (todayActions || [])
      .filter(a => a.action_type === "send_connection_request")
      .map(a => a.campaign_lead_id);

    const todayWarmingLeadIds = (todayActions || [])
      .filter(a => a.action_type === "visit_profile" || a.action_type === "follow_profile")
      .map(a => a.campaign_lead_id);

    const allLeadIds = Array.from(new Set([...todayConnReqLeadIds, ...todayWarmingLeadIds]));

    if (allLeadIds.length > 0) {
      const { data: actionLeads } = await supabase
        .from("campaign_leads")
        .select("id, user_id, campaign_profile_id")
        .in("id", allLeadIds);

      const leadCampaignMap = new Map((actionLeads || []).map(cl => [cl.id, cl]));

      for (const a of todayActions || []) {
        const leadInfo = leadCampaignMap.get(a.campaign_lead_id);
        if (!leadInfo) continue;

        if (a.action_type === "send_connection_request") {
          const key = `${leadInfo.user_id}:${leadInfo.campaign_profile_id}`;
          connReqsPerUserCampaign.set(key, (connReqsPerUserCampaign.get(key) || 0) + 1);
        }

        if (a.action_type === "visit_profile" || a.action_type === "follow_profile") {
          visitActionsPerUser.set(leadInfo.user_id, (visitActionsPerUser.get(leadInfo.user_id) || 0) + 1);
          const visitKey = `${leadInfo.user_id}:${leadInfo.campaign_profile_id}`;
          visitActionsPerUserCampaign.set(visitKey, (visitActionsPerUserCampaign.get(visitKey) || 0) + 1);
        }
      }
    }

    // (Per-user pending counts are computed below after sorting leads)

    // Find leads ready for next action — only from active campaigns
    // IMPORTANT: order by oldest next_action_at and fetch up to 1000 to avoid starvation
    // when users have multiple active campaigns with large lead volumes.
    const { data: leads, error: leadsError } = await supabase
      .from("campaign_leads")
      .select("id, user_id, linkedin_url, status, connection_note, custom_dm, custom_followup, dm_text, follow_up_text, connection_sent_at, campaign_profile_id, dm_approved")
      .in("status", activeStatuses)
      .in("campaign_profile_id", activeCampaignIds)
      .lte("next_action_at", now)
      .not("next_action_at", "is", null)
      .order("next_action_at", { ascending: true })
      .limit(1000);

    if (leadsError) throw leadsError;

    console.log(`Found ${leads?.length || 0} leads ready for scheduling. Active campaigns: ${activeCampaignIds.length}. Now: ${now}`);

    let scheduled = 0;
    let timeouts = 0;
    const errors: string[] = [];

    if (leads && leads.length > 0) {
      const connectedUsers = new Set(
        (allExtensions || [])
          .filter(e => e.is_connected && !e.is_paused)
          .map(e => e.user_id)
      );
      console.log(`Connected users: ${[...connectedUsers].join(', ')}. Extensions total: ${allExtensions?.length || 0}`);

      // ── Priority ordering: process check/reply actions FIRST so they don't
      // get starved by the per-user cap. Then messaging, then visits.
      const PRIORITY_ORDER: Record<string, number> = {
        check_connection_status: 0,
        check_reply_status: 0,
        send_dm: 1,
        send_followup: 1,
        send_connection_request: 2,
        follow_profile: 3,
        visit_profile: 3,
      };
      const sortedLeads = [...leads].sort((a, b) => {
        const aAction = STATUS_TO_ACTION[a.status] || '';
        const bAction = STATUS_TO_ACTION[b.status] || '';
        return (PRIORITY_ORDER[aAction] ?? 99) - (PRIORITY_ORDER[bAction] ?? 99);
      });

      // Count how many campaigns per user are actually due for each stage today
      // (prevents inactive/no-backlog campaigns from consuming per-campaign quota share)
      const dueWarmingCampaignsPerUser = new Map<string, Set<string>>();
      const dueConnReqCampaignsPerUser = new Map<string, Set<string>>();

      for (const lead of sortedLeads) {
        const actionType = STATUS_TO_ACTION[lead.status];
        if (!actionType) continue;

        if (actionType === "visit_profile" || actionType === "follow_profile") {
          const set = dueWarmingCampaignsPerUser.get(lead.user_id) || new Set<string>();
          set.add(lead.campaign_profile_id);
          dueWarmingCampaignsPerUser.set(lead.user_id, set);
        }

        if (actionType === "send_connection_request") {
          const set = dueConnReqCampaignsPerUser.get(lead.user_id) || new Set<string>();
          set.add(lead.campaign_profile_id);
          dueConnReqCampaignsPerUser.set(lead.user_id, set);
        }
      }

      // ── Throttling: track how many actions we schedule per user per type
      // so we can spread scheduled_for across remaining business hours
      const userScheduleSlots = new Map<string, number>();

      // ── Per-user caps: separate cap for lightweight checks vs other actions
      const LIGHTWEIGHT_ACTIONS = new Set(["check_connection_status", "check_reply_status"]);
      const MAX_PENDING_CHECKS = 40;  // Lightweight: just visiting a profile page
      const MAX_PENDING_OTHER = 20;   // Heavier: sending messages, connections

      // Count existing pending by category
      const pendingChecksPerUser = new Map<string, number>();
      const pendingOtherPerUser = new Map<string, number>();
      for (const a of todayActions || []) {
        if (a.status === "pending" || a.status === "in_progress") {
          if (LIGHTWEIGHT_ACTIONS.has(a.action_type)) {
            pendingChecksPerUser.set(a.user_id, (pendingChecksPerUser.get(a.user_id) || 0) + 1);
          } else {
            pendingOtherPerUser.set(a.user_id, (pendingOtherPerUser.get(a.user_id) || 0) + 1);
          }
        }
      }

      for (const lead of sortedLeads) {
        // Skip if extension not connected
        if (!connectedUsers.has(lead.user_id)) continue;

        const actionType = STATUS_TO_ACTION[lead.status];
        if (!actionType) continue;

        // Cap: separate limits for lightweight checks vs other actions
        if (LIGHTWEIGHT_ACTIONS.has(actionType)) {
          const userChecks = pendingChecksPerUser.get(lead.user_id) || 0;
          if (userChecks >= MAX_PENDING_CHECKS) continue;
        } else {
          const userOther = pendingOtherPerUser.get(lead.user_id) || 0;
          if (userOther >= MAX_PENDING_OTHER) continue;
        }

        // Get user schedule
        const ext = extensionMap.get(lead.user_id);
        const userDays = ext?.active_days || ['mon','tue','wed','thu','fri'];
        const userStart = ext?.active_hours_start || '08:00';
        const userEnd = ext?.active_hours_end || '18:00';


        // ── Per-stage approval gates ──
        // Lightweight checks (check_connection_status, check_reply_status) always allowed
        // For backward compat: auto_approve_dms=true bypasses all stage gates
        const isAutoApprove = campaignAutoApprove.get(lead.campaign_profile_id) || false;
        if (!isAutoApprove && !LIGHTWEIGHT_ACTIONS.has(actionType)) {
          // Connection stage: visit_profile, follow_profile, send_connection_request
          if ((actionType === "visit_profile" || actionType === "follow_profile" || actionType === "send_connection_request") &&
              !campaignStageConnection.get(lead.campaign_profile_id)) {
            continue;
          }
          // DM stage: send_dm
          if (actionType === "send_dm" &&
              !campaignStageDm.get(lead.campaign_profile_id)) {
            continue;
          }
          // Follow-up stage: send_followup
          if (actionType === "send_followup" &&
              !campaignStageFollowup.get(lead.campaign_profile_id)) {
            continue;
          }
        }

        // Enforce daily warming limit (visit_profile + follow_profile) with per-campaign balancing
        if (actionType === "visit_profile" || actionType === "follow_profile") {
          const visitLimit = ext?.daily_limit_visits ?? 80;
          const userCampaignCount = dueWarmingCampaignsPerUser.get(lead.user_id)?.size || 1;
          const perCampaignVisitLimit = Math.max(1, Math.floor(visitLimit / userCampaignCount));

          const userVisitCount = visitActionsPerUser.get(lead.user_id) || 0;
          if (userVisitCount >= visitLimit) continue;

          const visitCampaignKey = `${lead.user_id}:${lead.campaign_profile_id}`;
          const campaignVisitCount = visitActionsPerUserCampaign.get(visitCampaignKey) || 0;
          if (campaignVisitCount >= perCampaignVisitLimit) continue;
        }

        // ── Per-campaign connection request balancing ──
        // Divide daily limit equally among active campaigns for this user
        if (actionType === "send_connection_request") {
          const connReqLimit = ext?.daily_limit_connection_requests ?? 40;
          const userCampaignCount = dueConnReqCampaignsPerUser.get(lead.user_id)?.size || 1;
          const perCampaignLimit = Math.max(1, Math.floor(connReqLimit / userCampaignCount));
          const campaignKey = `${lead.user_id}:${lead.campaign_profile_id}`;
          const alreadySent = connReqsPerUserCampaign.get(campaignKey) || 0;
          if (alreadySent >= perCampaignLimit) {
            console.log(`Skipping lead ${lead.id}: campaign ${lead.campaign_profile_id.slice(0,8)}… hit per-campaign limit (${alreadySent}/${perCampaignLimit})`);
            continue;
          }
        }

        // ── Per-lead DM approval gate ──
        // DMs require approval unless the DM stage is auto-approved
        if (actionType === "send_dm" && !lead.dm_approved) {
          const dmStageApproved = campaignStageDm.get(lead.campaign_profile_id) === true;
          if (isAutoApprove || dmStageApproved) {
            await supabase.from("campaign_leads")
              .update({ dm_approved: true, dm_approved_at: now, updated_at: now } as any)
              .eq("id", lead.id);
          } else {
            await supabase.from("campaign_leads")
              .update({ status: "dm_pending_approval", updated_at: now } as any)
              .eq("id", lead.id);
            console.log(`Lead ${lead.id} → dm_pending_approval (individual DM approval required)`);
            continue;
          }
        }

        // If this lead needs messages generated before connection request
        if (actionType === "send_connection_request" && !lead.connection_note) {
          const generateUrl = `${supabaseUrl}/functions/v1/generate-dm`;
          fetch(generateUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              campaign_lead_id: lead.id,
              user_id: lead.user_id,
            }),
          }).catch(err => console.error(`generate-dm error for lead ${lead.id}:`, err));
          console.log(`Triggered message generation for lead ${lead.id}`);
          continue;
        }

        // Check for existing pending action
        const { data: existing } = await supabase
          .from("action_queue")
          .select("id")
          .eq("campaign_lead_id", lead.id)
          .eq("action_type", actionType)
          .in("status", ["pending", "in_progress"])
          .limit(1)
          .maybeSingle();

        if (existing) continue;

        // Get message text if needed
        const messageField = ACTION_MESSAGE_FIELD[actionType];
        let messageText: string | null = null;
        if (messageField) {
          messageText = (lead as any)[messageField] || lead.dm_text || lead.follow_up_text || null;
        }

        // ── Throttled scheduling: spread actions across remaining business hours ──
        const slotKey = `${lead.user_id}:${actionType}`;
        const slotIndex = userScheduleSlots.get(slotKey) || 0;
        userScheduleSlots.set(slotKey, slotIndex + 1);

        // Lightweight/passive checks run 24/7 (no business-hour restriction)
        // Messaging actions are restricted to business hours
        let scheduledFor: string;
        if (LIGHTWEIGHT_ACTIONS.has(actionType)) {
          // Schedule from NOW with short gaps (3-8 min), ignoring business hours
          const now = new Date();
          const initialDelayMs = (2 + Math.floor(Math.random() * 3)) * 60 * 1000;
          const perSlotGapMs = slotIndex * (3 + Math.floor(Math.random() * 5)) * 60 * 1000;
          const jitterMs = Math.floor(Math.random() * 2 * 60 * 1000);
          const scheduled = new Date(now.getTime() + initialDelayMs + perSlotGapMs + jitterMs);
          scheduledFor = scheduled.toISOString();
        } else {
          scheduledFor = computeThrottledTime(slotIndex, userStart, userEnd);
        }

        const { error: insertError } = await supabase
          .from("action_queue")
          .insert({
            user_id: lead.user_id,
            campaign_lead_id: lead.id,
            action_type: actionType,
            linkedin_url: lead.linkedin_url,
            message_text: messageText,
            scheduled_for: scheduledFor,
            priority: LIGHTWEIGHT_ACTIONS.has(actionType) ? 1 : (actionType === "send_dm" || actionType === "send_followup" ? 3 : 5),
            status: "pending",
          });

        if (insertError) {
          errors.push(`Lead ${lead.id}: ${insertError.message}`);
        } else {
          scheduled++;
          if (LIGHTWEIGHT_ACTIONS.has(actionType)) {
            pendingChecksPerUser.set(lead.user_id, (pendingChecksPerUser.get(lead.user_id) || 0) + 1);
          } else {
            pendingOtherPerUser.set(lead.user_id, (pendingOtherPerUser.get(lead.user_id) || 0) + 1);
          }
          // Track per-campaign connection request count
          if (actionType === "send_connection_request") {
            const campaignKey = `${lead.user_id}:${lead.campaign_profile_id}`;
            connReqsPerUserCampaign.set(campaignKey, (connReqsPerUserCampaign.get(campaignKey) || 0) + 1);
          }

          // Track warming counters (visit/follow) for fair per-campaign distribution
          if (actionType === "visit_profile" || actionType === "follow_profile") {
            visitActionsPerUser.set(lead.user_id, (visitActionsPerUser.get(lead.user_id) || 0) + 1);
            const visitCampaignKey = `${lead.user_id}:${lead.campaign_profile_id}`;
            visitActionsPerUserCampaign.set(visitCampaignKey, (visitActionsPerUserCampaign.get(visitCampaignKey) || 0) + 1);
          }
        }
      }
    }

    // Check for connection timeouts (10 days)
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const { data: timedOut } = await supabase
      .from("campaign_leads")
      .select("id")
      .eq("status", "connection_sent")
      .lt("connection_sent_at", tenDaysAgo.toISOString())
      .not("connection_sent_at", "is", null);

    if (timedOut && timedOut.length > 0) {
      await supabase
        .from("campaign_leads")
        .update({ status: "connection_rejected", updated_at: new Date().toISOString() } as any)
        .in("id", timedOut.map(l => l.id));
      timeouts = timedOut.length;
    }
    // Trigger watchdog after each scheduler run to keep continuous monitoring at 15min cadence
    fetch(`${supabaseUrl}/functions/v1/watchdog`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ source: "schedule-actions" }),
    }).catch((watchdogErr) => {
      console.error("watchdog trigger from schedule-actions failed:", watchdogErr);
    });

    return new Response(JSON.stringify({
      success: true,
      scheduled,
      timeouts,
      leads_checked: leads?.length || 0,
      errors,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("schedule-actions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
