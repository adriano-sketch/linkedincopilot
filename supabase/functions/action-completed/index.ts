// LinkedIn Copilot — action-completed edge function
// Deploy trigger: updated SUPABASE_DB_URL secret (Apr 3, 2026)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAY_MAP: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

// Status progression order — used to prevent status regression
const STATUS_ORDER: Record<string, number> = {
  new: 0,
  ready: 1,
  queued_for_connection: 2,
  visiting_profile: 3,
  following: 4,
  connection_sent: 5,
  connected: 6,
  dm_ready: 7,
  ready_for_dm: 8,
  dm_queued: 9,
  dm_sent: 10,
  waiting_reply: 11,
  follow_up_due: 12,
  followup_sent: 13,
  replied: 14,
  connection_rejected: 15,
  error: 15,
  skipped: 15,
  do_not_contact: 15,
  icp_rejected: 15,
};

function randomBusinessTime(
  daysAhead: number = 1,
  activeDays: string[] = ['mon','tue','wed','thu','fri'],
  startHour: string = '08:00',
  endHour: string = '18:00'
): string {
  const start = startHour.split(':').map(Number);
  const end = endHour.split(':').map(Number);
  const startMin = start[0] * 60 + (start[1] || 0);
  const endMin = end[0] * 60 + (end[1] || 0);
  const allowedDays = new Set(activeDays.map(d => DAY_MAP[d]).filter(d => d !== undefined));

  const date = new Date();
  date.setDate(date.getDate() + daysAhead);

  for (let i = 0; i < 7; i++) {
    if (allowedDays.has(date.getDay())) break;
    date.setDate(date.getDate() + 1);
  }

  const randomMin = startMin + Math.floor(Math.random() * (endMin - startMin));
  date.setHours(Math.floor(randomMin / 60), randomMin % 60, 0, 0);
  return date.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date().toISOString();

    const { action_queue_id, success, result, error_message } = await req.json();
    if (!action_queue_id) throw new Error("action_queue_id required");

    // Get the action
    const { data: action } = await supabase
      .from("action_queue")
      .select("*")
      .eq("id", action_queue_id)
      .eq("user_id", user.id)
      .single();

    if (!action) throw new Error("Action not found");

    // Get user schedule settings
    const { data: extStatus } = await supabase
      .from("extension_status")
      .select("active_days, active_hours_start, active_hours_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const userDays = extStatus?.active_days || ['mon','tue','wed','thu','fri'];
    const userStart = extStatus?.active_hours_start || '08:00';
    const userEnd = extStatus?.active_hours_end || '18:00';
    const rbt = (days: number = 1) => randomBusinessTime(days, userDays, userStart, userEnd);

    // Update action_queue
    await supabase.from("action_queue")
      .update({
        status: success ? "completed" : "failed",
        completed_at: now,
        result: result || null,
        error_message: error_message || null,
      } as any)
      .eq("id", action_queue_id);

    // ══════════════════════════════════════════════════════════════
    // ANOMALY DETECTION: "same thread consecutive" DM navigation bug
    // ══════════════════════════════════════════════════════════════
    // Detects the class of bug that caused the 2026-04-10 incident where
    // 16 DMs all landed in the same LinkedIn thread because the extension
    // redirected every lead to the messaging inbox root instead of the
    // intended compose URL. The extension now ships `telemetry.thread_header`
    // in every send_dm result; we compare the current DM's thread header
    // against the previous 2 successful send_dm completions for the same
    // user. If 3 consecutive DMs target leads A, B, C but all land in the
    // same thread_header, the navigation is clearly broken — pause the
    // extension immediately and log a critical alert.
    //
    // This is deliberately narrow: only fires on 3-in-a-row with matching
    // non-empty headers AND distinct campaign_lead_ids. Single-thread reply
    // chains won't trigger it because each send is to a different lead.
    if (
      success &&
      action.action_type === "send_dm" &&
      result &&
      typeof result === "object" &&
      (result as any).telemetry?.thread_header
    ) {
      try {
        const currentHeader = String((result as any).telemetry.thread_header || "").trim().toLowerCase();
        if (currentHeader) {
          const { data: recent } = await supabase
            .from("action_queue")
            .select("id, campaign_lead_id, result, completed_at")
            .eq("user_id", user.id)
            .eq("action_type", "send_dm")
            .eq("status", "completed")
            .neq("id", action_queue_id)
            .order("completed_at", { ascending: false })
            .limit(2);

          const recentSame = (recent || []).filter((r: any) => {
            const h = String(r?.result?.telemetry?.thread_header || "").trim().toLowerCase();
            return h && h === currentHeader && r.campaign_lead_id !== action.campaign_lead_id;
          });

          if (recentSame.length >= 2) {
            // 3-in-a-row (current + 2 previous) landing in the same thread
            // across distinct leads. Pause the user's extension immediately.
            const affectedLeadIds = [
              action.campaign_lead_id,
              ...recentSame.map((r: any) => r.campaign_lead_id),
            ];
            console.error(
              `🚨 DM_NAVIGATION_ANOMALY: user=${user.id} 3 consecutive send_dm completions all landed in thread "${currentHeader}" across distinct leads ${JSON.stringify(affectedLeadIds)}. Pausing extension.`
            );

            // Pause the extension to stop the bleeding
            await supabase
              .from("extension_status")
              .update({
                is_paused: true,
                pause_reason: `dm_navigation_anomaly: 3 consecutive DMs landed in same thread "${currentHeader}"`,
                paused_at: now,
                updated_at: now,
              } as any)
              .eq("user_id", user.id);

            // Critical entry in activity_log for visibility
            await supabase.from("activity_log").insert({
              user_id: user.id,
              campaign_lead_id: action.campaign_lead_id,
              action: "dm_navigation_anomaly_detected",
              details: {
                severity: "critical",
                thread_header: currentHeader,
                affected_action_ids: [action_queue_id, ...recentSame.map((r: any) => r.id)],
                affected_lead_ids: affectedLeadIds,
                telemetry_current: (result as any).telemetry,
                telemetry_previous: recentSame.map((r: any) => r?.result?.telemetry || null),
                auto_action: "extension_paused",
                incident_reference: "2026-04-10_same_thread_bug",
              },
            });
          }
        }
      } catch (anomalyErr) {
        // Never let anomaly detection break the happy path — just log.
        console.error("DM anomaly detection failed (non-fatal):", anomalyErr);
      }
    }

    const { data: currentLead } = await supabase.from("campaign_leads")
      .select("status, connection_verified, connection_verified_at")
      .eq("id", action.campaign_lead_id)
      .single();

    // If failed, handle retry
    if (!success) {
      const retryCount = (action.retry_count || 0) + 1;
      const errorLower = (error_message || "").toLowerCase();

      // ── LINKEDIN LIMIT DETECTION ──
      // If the error is a LinkedIn rate limit, don't retry — reschedule to next day
      // and pause all pending same-type actions for this user
      const isLimitError = errorLower.includes("linkedin_limit") ||
        errorLower.includes("limit_reached") ||
        errorLower.includes("invitation limit") ||
        errorLower.includes("weekly invitation") ||
        errorLower.includes("too many") ||
        errorLower.includes("temporarily restricted") ||
        (errorLower.includes("limit") && errorLower.includes("connection"));

      if (isLimitError) {
        console.log(`⚠️ LinkedIn limit detected for user ${user.id}: ${error_message}`);

        // Don't retry this action — reschedule to next business day
        const rescheduleTime = rbt(1);
        await supabase.from("action_queue").insert({
          user_id: user.id,
          campaign_lead_id: action.campaign_lead_id,
          action_type: action.action_type,
          linkedin_url: action.linkedin_url,
          message_text: action.message_text,
          scheduled_for: rescheduleTime,
          priority: action.priority,
          status: "pending",
          retry_count: 0, // Reset retry count — this isn't a bug, it's a limit
        });

        // Reschedule ALL pending same-type actions for this user to tomorrow
        const { data: pendingActions } = await supabase.from("action_queue")
          .select("id")
          .eq("user_id", user.id)
          .eq("action_type", action.action_type)
          .eq("status", "pending")
          .lt("scheduled_for", new Date().toISOString());

        if (pendingActions && pendingActions.length > 0) {
          const ids = pendingActions.map((a: any) => a.id);
          console.log(`Rescheduling ${ids.length} pending ${action.action_type} actions to tomorrow`);
          for (const id of ids) {
            const newTime = rbt(1); // Spread across next business day
            await supabase.from("action_queue")
              .update({ scheduled_for: newTime } as any)
              .eq("id", id);
          }
        }

        // Record in activity log
        await supabase.from("activity_log").insert({
          user_id: user.id,
          campaign_lead_id: action.campaign_lead_id,
          action: "linkedin_limit_reached",
          details: {
            error: error_message,
            action_type: action.action_type,
            rescheduled_count: (pendingActions?.length || 0) + 1,
          },
        });

        // Update lead — don't mark as error, just record the limit
        await supabase.from("campaign_leads")
          .update({
            error_message: `LinkedIn limit reached — rescheduled to next business day`,
            updated_at: now,
          } as any)
          .eq("id", action.campaign_lead_id);

        return new Response(JSON.stringify({
          ok: true,
          limit_detected: true,
          rescheduled: (pendingActions?.length || 0) + 1,
        }), { headers: { "Content-Type": "application/json" } });
      }

      if (retryCount < (action.max_retries || 3)) {
        // For lightweight actions (checks), retry in 2-5 minutes instead of next business day
        const LIGHTWEIGHT = new Set(["check_connection_status", "check_reply_status", "check_profile_quality"]);
        let retryScheduledFor: string;
        if (LIGHTWEIGHT.has(action.action_type)) {
          const delayMs = (2 + Math.floor(Math.random() * 3)) * 60 * 1000;
          retryScheduledFor = new Date(Date.now() + delayMs).toISOString();
        } else {
          retryScheduledFor = rbt(1);
        }
        // Create retry action
        await supabase.from("action_queue").insert({
          user_id: user.id,
          campaign_lead_id: action.campaign_lead_id,
          action_type: action.action_type,
          linkedin_url: action.linkedin_url,
          message_text: action.message_text,
          scheduled_for: retryScheduledFor,
          priority: action.priority,
          status: "pending",
          retry_count: retryCount,
        });
      } else {
        // Max retries reached — for post-connection actions, preserve the
        // current pipeline status instead of regressing to 'error'.
        // This ensures accepted connections aren't lost when DM sending fails.
        const POST_CONNECTION_ACTIONS = new Set(["send_dm", "send_followup", "check_reply_status"]);

        if (POST_CONNECTION_ACTIONS.has(action.action_type)) {
          // Keep current status (e.g. 'connected'), record the error,
          // and schedule next_action_at to the next business day so that
          // schedule-actions can re-enqueue the DM. Previously this set
          // next_action_at=null which orphaned connected leads forever —
          // they'd stay in 'connected' with no ability to ever reach dm_sent
          // until someone manually re-enqueued the action.
          // Using rbt(1) (tomorrow's business window) gives a human-scale
          // backoff while ensuring the pipeline does self-heal.
          const nextRetryAt = rbt(1);
          await supabase.from("campaign_leads")
            .update({
              error_message: `${action.action_type} failed: ${error_message || "Max retries reached"}`,
              retry_count: 0, // Reset so the next attempt gets a fresh retry budget
              next_action_at: nextRetryAt,
              updated_at: now,
            } as any)
            .eq("id", action.campaign_lead_id);
          console.log(`Lead ${action.campaign_lead_id}: ${action.action_type} max retries — preserved status, rescheduled for ${nextRetryAt}`);
        } else {
          // Pre-connection actions: safe to mark as error
          await supabase.from("campaign_leads")
            .update({
              status: "error",
              error_message: error_message || "Max retries reached",
              retry_count: retryCount,
              updated_at: now,
            } as any)
            .eq("id", action.campaign_lead_id);
        }
      }

      await supabase.from("activity_log").insert({
        user_id: user.id,
        campaign_lead_id: action.campaign_lead_id,
        action: `${action.action_type}_failed`,
        details: { error: error_message, retry_count: retryCount },
      });

      return new Response(JSON.stringify({ success: true, retried: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Success — update campaign_leads based on action_type
    const leadUpdate: any = { updated_at: now };

    switch (action.action_type) {
      case "visit_profile": {
        leadUpdate.status = "visiting_profile";
        leadUpdate.profile_visited_at = now;
        // Next day — follow profile
        leadUpdate.next_action_at = rbt(1);
        break;
      }

      case "follow_profile": {
        leadUpdate.status = "following";
        leadUpdate.followed_at = now;
        // Next day — send connection request
        leadUpdate.next_action_at = rbt(1);
        break;
      }

      case "send_connection_request":
        leadUpdate.status = "connection_sent";
        leadUpdate.connection_sent_at = now;
        leadUpdate.next_action_at = rbt(1);
        break;

      case "check_connection_status": {
        const note = result?.note || null;
        const strongNotes = new Set([
          "message_button_1st",
          "message_link_1st",
          "first_degree_badge",
          "remove_connection",
          "connected_label",
          "degree_badge_1st",
        ]);

        const strongConnected = result?.is_connected === true && (
          result?.confidence === "strong" ||
          (note && (strongNotes.has(note) || note.includes("1st") || note.includes("first_degree")))
        );

        if (strongConnected) {
          leadUpdate.status = "connected";
          leadUpdate.connection_accepted_at = now;
          leadUpdate.next_action_at = rbt(0);
          leadUpdate.connection_verified = true;
          leadUpdate.connection_verified_at = now;
          leadUpdate.connection_verification_note = note || "verified";
        } else {
          if (currentLead?.connection_verified !== true) {
            leadUpdate.connection_verified = false;
            leadUpdate.connection_verified_at = now;
            leadUpdate.connection_verification_note = note || "not_connected";
          }
          // Check again tomorrow if < 10 days — get connection_sent_at from the lead
          const { data: leadData } = await supabase.from("campaign_leads")
            .select("connection_sent_at")
            .eq("id", action.campaign_lead_id)
            .single();
          const sentAt = leadData?.connection_sent_at ? new Date(leadData.connection_sent_at) : new Date();
          const daysSince = (Date.now() - sentAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince < 10) {
            leadUpdate.next_action_at = rbt(1);
          } else {
            leadUpdate.status = "connection_rejected";
          }
        }
        break;
      }

      case "check_profile_quality": {
        const isGhost = result?.is_ghost === true;
        const note = result?.note || null;
        leadUpdate.profile_quality_status = isGhost ? "ghost" : "ok";
        leadUpdate.profile_quality_checked_at = now;
        leadUpdate.profile_quality_note = note || (isGhost ? "ghost_profile" : "ok");
        if (isGhost) {
          leadUpdate.status = "skipped";
          leadUpdate.profile_enriched_at = now;
          leadUpdate.error_message = "Ghost profile (LinkedIn)";
        }
        break;
      }

      case "send_dm":
        leadUpdate.status = "dm_sent";
        leadUpdate.dm_sent_at = now;
        // Check for replies on the next business day (was rbt(4) which
        // delayed detection by ~4 days and made the dashboard blind to
        // any response for nearly a week).
        leadUpdate.next_action_at = rbt(1);
        break;

      case "check_reply_status":
        if (result?.has_reply) {
          leadUpdate.status = "replied";
          leadUpdate.replied_at = now;
          leadUpdate.reply_detected_at = now;
          if (result?.reply_text) {
            leadUpdate.reply_text = String(result.reply_text).slice(0, 4000);
          }
          leadUpdate.next_action_at = null;
          // Fire-and-forget classification — we populate the leadUpdate
          // first, then kick classify-reply after the main update commits
          // (see fireClassifyReply() call below).
        } else {
          leadUpdate.status = "waiting_reply";
          leadUpdate.next_action_at = now; // Trigger follow-up immediately
        }
        break;

      case "send_followup":
        leadUpdate.status = "followup_sent";
        leadUpdate.followup_sent_at = now;
        // Same fix as send_dm: check for replies next business day, not 4 days later.
        leadUpdate.next_action_at = rbt(1);
        break;
    }

    // ── Anti-regression guard ──
    // Fetch current lead status and only apply update if the new status
    // is equal or ahead in the pipeline. This prevents out-of-order
    // action completions from regressing a lead's progress.
    const currentOrder = STATUS_ORDER[currentLead?.status || ''] ?? -1;
    const newOrder = STATUS_ORDER[leadUpdate.status || ''] ?? -1;

    if (leadUpdate.status && currentOrder > newOrder) {
      console.warn(
        `BLOCKED status regression for lead ${action.campaign_lead_id}: ` +
        `current="${currentLead?.status}" (${currentOrder}) → attempted="${leadUpdate.status}" (${newOrder}). ` +
        `Action: ${action.action_type}. Skipping status update, keeping timestamps.`
      );
      // Still update timestamps (profile_visited_at etc.) but NOT status or next_action_at
      delete leadUpdate.status;
      delete leadUpdate.next_action_at;
    }

    if (Object.keys(leadUpdate).length > 1) { // more than just updated_at
      const { error: leadUpdateError } = await supabase.from("campaign_leads")
        .update(leadUpdate)
        .eq("id", action.campaign_lead_id);

      if (leadUpdateError) {
        console.error(`Failed to update lead ${action.campaign_lead_id} after ${action.action_type}:`, leadUpdateError);
      } else {
        console.log(`Lead ${action.campaign_lead_id} updated: ${action.action_type} → ${leadUpdate.status || '(no status change)'}`);
      }
    }

    // Fire-and-forget sentiment classification when a real reply was
    // detected. We intentionally don't await — the extension shouldn't wait
    // on an LLM round-trip to close the action, and classify-reply is
    // idempotent via reply_classified_at.
    if (
      action.action_type === "check_reply_status" &&
      result?.has_reply === true &&
      result?.reply_text
    ) {
      try {
        const baseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (baseUrl && serviceKey) {
          // Do NOT await — best-effort, log failures only.
          fetch(`${baseUrl}/functions/v1/classify-reply`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${serviceKey}`,
            },
            body: JSON.stringify({
              user_id: user.id,
              campaign_lead_id: action.campaign_lead_id,
              reply_text: String(result.reply_text).slice(0, 4000),
            }),
          }).catch((e) => console.error("classify-reply fire-and-forget failed:", e));
        }
      } catch (e) {
        console.error("classify-reply dispatch error:", e);
      }
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: user.id,
      campaign_lead_id: action.campaign_lead_id,
      action: `${action.action_type}_completed`,
      details: { result },
    });

    // Update extension daily counters
    const counterUpdate: any = {
      last_action_at: now,
    };
    // Read current counters once
    const { data: ext } = await supabase
      .from("extension_status")
      .select("connection_requests_today, messages_today, actions_today, visits_today")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ext) {
      counterUpdate.actions_today = (ext.actions_today || 0) + 1;

      if (action.action_type === "visit_profile" || action.action_type === "follow_profile") {
        counterUpdate.visits_today = (ext.visits_today || 0) + 1;
      } else if (action.action_type === "send_connection_request") {
        counterUpdate.connection_requests_today = (ext.connection_requests_today || 0) + 1;
      } else if (action.action_type === "send_dm" || action.action_type === "send_followup") {
        counterUpdate.messages_today = (ext.messages_today || 0) + 1;
      }
    }

    await supabase.from("extension_status")
      .update(counterUpdate)
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ success: true, new_status: leadUpdate.status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("action-completed error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
