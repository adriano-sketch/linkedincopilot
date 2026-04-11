/**
 * user-health-alert
 * ─────────────────
 * Computes a per-user account/pipeline health score, identifies critical
 * issues, optionally auto-pauses the extension on severe signals, and
 * sends a user-facing email alert via Resend.
 *
 * This complements the internal `watchdog` function — watchdog alerts the
 * support team, this function alerts the actual user whose pipeline is
 * affected. Safe to call often; it is stateless aside from side-effects.
 *
 * Usage:
 *   POST /functions/v1/user-health-alert      (scans all active users)
 *   POST /functions/v1/user-health-alert      with { "user_id": "..." } (single)
 *   POST /functions/v1/user-health-alert      with { "user_id": "...", "force": true } (send email even if not critical)
 *
 * Returns: { checked: N, alerted: M, paused: K, reports: [...] }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Severity = "ok" | "warn" | "critical";

interface Issue {
  severity: Severity;
  code: string;
  message: string;
  detail?: string;
}

interface HealthReport {
  user_id: string;
  email: string | null;
  score: number; // 0..100
  status: Severity;
  issues: Issue[];
  metrics: Record<string, any>;
  auto_paused: boolean;
  email_sent: boolean;
}

const SEVERITY_WEIGHT: Record<Severity, number> = { ok: 0, warn: 1, critical: 3 };

// Minutes an online extension can go without actions during business hours
// before we consider the pipeline idle.
const IDLE_ALERT_MINUTES = 120;
// Minutes without heartbeat before we consider the extension offline.
const HEARTBEAT_STALE_MINUTES = 20;

function inBusinessHours(
  nowUtc: Date,
  activeDays: string[] | null,
  startHour: string | null,
  endHour: string | null,
  timeZone: string = "America/New_York",
): boolean {
  try {
    // Use Intl to get current hour/day in the user's timezone
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(nowUtc);
    const weekday = parts.find(p => p.type === "weekday")?.value?.toLowerCase() || "";
    const hourStr = parts.find(p => p.type === "hour")?.value || "0";
    const minuteStr = parts.find(p => p.type === "minute")?.value || "0";
    const minutes = parseInt(hourStr) * 60 + parseInt(minuteStr);

    const dayMap: Record<string, string> = {
      mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun",
    };
    const normDay = dayMap[weekday.slice(0, 3)] || weekday.slice(0, 3);
    const days = activeDays && activeDays.length > 0
      ? activeDays.map(d => d.toLowerCase())
      : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    if (!days.includes(normDay)) return false;

    const [sh, sm] = (startHour || "08:00").split(":").map(Number);
    const [eh, em] = (endHour || "18:00").split(":").map(Number);
    const startMin = sh * 60 + (sm || 0);
    const endMin = eh * 60 + (em || 0);
    return minutes >= startMin && minutes <= endMin;
  } catch {
    return true; // fail open
  }
}

async function computeHealth(
  supabase: any,
  userId: string,
  now: Date,
): Promise<Omit<HealthReport, "email" | "email_sent">> {
  const issues: Issue[] = [];
  const metrics: Record<string, any> = {};
  let autoPaused = false;

  // ── Extension status ──
  const { data: ext } = await supabase
    .from("extension_status")
    .select("is_connected, is_paused, last_heartbeat_at, linkedin_logged_in, active_days, active_hours_start, active_hours_end, actions_today, messages_today, connection_requests_today")
    .eq("user_id", userId)
    .maybeSingle();

  if (!ext) {
    issues.push({
      severity: "warn",
      code: "no_extension",
      message: "No extension record found for this user.",
    });
    metrics.extension = null;
  } else {
    metrics.extension = {
      connected: ext.is_connected,
      paused: ext.is_paused,
      linkedin_logged_in: ext.linkedin_logged_in,
      actions_today: ext.actions_today || 0,
      messages_today: ext.messages_today || 0,
      connection_requests_today: ext.connection_requests_today || 0,
    };

    const withinHours = inBusinessHours(
      now,
      ext.active_days,
      ext.active_hours_start,
      ext.active_hours_end,
    );
    metrics.in_business_hours = withinHours;

    const lastBeat = ext.last_heartbeat_at ? new Date(ext.last_heartbeat_at) : null;
    const minsSinceBeat = lastBeat ? (now.getTime() - lastBeat.getTime()) / 60000 : Infinity;
    metrics.minutes_since_heartbeat = Math.round(minsSinceBeat);

    if (withinHours && !ext.is_paused) {
      if (minsSinceBeat > HEARTBEAT_STALE_MINUTES) {
        issues.push({
          severity: "critical",
          code: "extension_offline_business_hours",
          message: `Extension offline for ${Math.round(minsSinceBeat)} min during your active hours.`,
          detail: "Check that Chrome is running and the LinkedIn Copilot extension is installed and signed in.",
        });
      }
      if (ext.is_connected && !ext.linkedin_logged_in) {
        issues.push({
          severity: "critical",
          code: "linkedin_logged_out",
          message: "Extension is online but LinkedIn appears logged out.",
          detail: "Open LinkedIn in Chrome and log back in. The pipeline will resume automatically.",
        });
      }
    }

    if (ext.is_paused) {
      issues.push({
        severity: "warn",
        code: "extension_paused",
        message: "Extension is currently paused — no outreach is running.",
      });
    }
  }

  // ── Failure rate in last 6h ──
  const sixHoursAgo = new Date(now.getTime() - 6 * 3600_000).toISOString();
  const { data: recentActions } = await supabase
    .from("action_queue")
    .select("status, action_type, error_message")
    .eq("user_id", userId)
    .in("status", ["completed", "failed"])
    .gte("completed_at", sixHoursAgo)
    .limit(500);

  const total = recentActions?.length || 0;
  const failed = (recentActions || []).filter((a: any) => a.status === "failed").length;
  const failRate = total > 0 ? failed / total : 0;
  metrics.recent_6h = { total, failed, fail_rate_pct: Math.round(failRate * 100) };

  if (total >= 10 && failRate >= 0.5) {
    // Identify top error pattern
    const errs: Record<string, number> = {};
    for (const a of recentActions || []) {
      if (a.status === "failed" && a.error_message) {
        const key = String(a.error_message).slice(0, 80);
        errs[key] = (errs[key] || 0) + 1;
      }
    }
    const topErr = Object.entries(errs).sort((a, b) => b[1] - a[1])[0];
    issues.push({
      severity: "critical",
      code: "high_failure_rate",
      message: `${Math.round(failRate * 100)}% of recent actions failed (${failed} of ${total} in last 6h).`,
      detail: topErr ? `Top error: "${topErr[0]}" (${topErr[1]}x)` : undefined,
    });
  } else if (total >= 10 && failRate >= 0.25) {
    issues.push({
      severity: "warn",
      code: "elevated_failure_rate",
      message: `${Math.round(failRate * 100)}% failure rate in last 6h (${failed}/${total}).`,
    });
  }

  // ── Pipeline funnel sanity (last 7 days) ──
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();
  const { data: leadsSample } = await supabase
    .from("campaign_leads")
    .select("status, connection_sent_at, connected_at, connection_accepted_at, dm_sent_at")
    .eq("user_id", userId)
    .gte("updated_at", sevenDaysAgo)
    .limit(2000);

  const sample = leadsSample || [];
  const REPLIED_OR_BEYOND = new Set(["replied", "meeting_booked", "won", "lost"]);
  const dmsSent = sample.filter((l: any) => l.dm_sent_at).length;
  const replied = sample.filter((l: any) => REPLIED_OR_BEYOND.has(l.status)).length;
  const connReqs = sample.filter((l: any) => l.connection_sent_at).length;
  const connAccepted = sample.filter((l: any) =>
    l.connected_at || l.connection_accepted_at || l.dm_sent_at ||
    ["connected","dm_sent","waiting_reply","replied","meeting_booked","won","lost"].includes(l.status)
  ).length;
  metrics.pipeline_7d = {
    connection_requests: connReqs,
    connection_accepted: connAccepted,
    dms_sent: dmsSent,
    replies: replied,
    accept_rate_pct: connReqs > 0 ? Math.round((connAccepted / connReqs) * 100) : null,
    reply_rate_pct: dmsSent > 0 ? Math.round((replied / dmsSent) * 100) : null,
  };

  if (connReqs >= 30 && connReqs > 0) {
    const acceptRate = connAccepted / connReqs;
    if (acceptRate < 0.1) {
      issues.push({
        severity: "warn",
        code: "low_acceptance_rate",
        message: `Only ${Math.round(acceptRate * 100)}% of connection requests are being accepted in the last 7 days.`,
        detail: "This usually signals an ICP mismatch, a generic connection note, or low sender credibility. Consider refining your target audience.",
      });
    }
  }

  if (dmsSent >= 30 && replied === 0) {
    issues.push({
      severity: "warn",
      code: "zero_reply_rate",
      message: `${dmsSent} DMs sent in 7 days with zero replies.`,
      detail: "Most likely causes: ICP doesn't match buyer persona, message is too generic, or you're outside prospect's decision window.",
    });
  }

  // ── Orphaned leads (retry exhausted, null next_action_at) ──
  const { count: orphanCount } = await supabase
    .from("campaign_leads")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("next_action_at", null)
    .in("status", ["connected", "visiting_profile", "following", "connection_sent", "dm_sent", "waiting_reply"]);
  metrics.orphan_leads = orphanCount || 0;
  if ((orphanCount || 0) >= 5) {
    issues.push({
      severity: "warn",
      code: "orphan_leads",
      message: `${orphanCount} leads are stuck with no next action scheduled.`,
      detail: "These will not progress until you manually retry or support resolves them.",
    });
  }

  // ── Compute score ──
  let score = 100;
  for (const i of issues) score -= SEVERITY_WEIGHT[i.severity] * 15;
  if (score < 0) score = 0;

  const topSeverity: Severity = issues.some(i => i.severity === "critical")
    ? "critical"
    : issues.some(i => i.severity === "warn")
      ? "warn"
      : "ok";

  // ── Auto-pause on severe conditions ──
  // If failure rate is catastrophic OR LinkedIn logged out, auto-pause to
  // protect the account. User will be notified via email.
  const catastrophicFail = total >= 10 && failRate >= 0.8;
  const loggedOut = metrics.extension?.linkedin_logged_in === false && metrics.extension?.connected === true;
  if ((catastrophicFail || loggedOut) && ext && !ext.is_paused) {
    await supabase
      .from("extension_status")
      // NOTE: extension_status has no `updated_at` column — including it
      // here causes a silent 400 and the auto-pause never actually fires.
      .update({ is_paused: true })
      .eq("user_id", userId);
    autoPaused = true;
    issues.push({
      severity: "critical",
      code: "auto_paused",
      message: "Extension auto-paused to protect your LinkedIn account.",
      detail: catastrophicFail
        ? "Pipeline paused because >80% of recent actions failed. Fix the root cause, then unpause from the dashboard."
        : "Pipeline paused because LinkedIn appears logged out. Log back in and unpause from the dashboard.",
    });
  }

  return {
    user_id: userId,
    score,
    status: topSeverity,
    issues,
    metrics,
    auto_paused: autoPaused,
  };
}

function buildEmailHtml(report: HealthReport, appUrl: string): { subject: string; html: string } {
  const emoji = report.status === "critical" ? "🔴" : report.status === "warn" ? "🟡" : "🟢";
  const label = report.status === "critical" ? "Action required" : report.status === "warn" ? "Heads up" : "Pipeline healthy";
  const subject = `${emoji} LinkedIn Copilot — ${label} (health ${report.score}/100)`;

  const issueRows = report.issues.map(i => {
    const color = i.severity === "critical" ? "#dc2626" : i.severity === "warn" ? "#d97706" : "#2563eb";
    const icon = i.severity === "critical" ? "🔴" : i.severity === "warn" ? "🟡" : "🔵";
    return `
      <div style="padding:14px 16px;margin-bottom:10px;background:#fafafa;border-left:4px solid ${color};border-radius:4px">
        <div style="font-weight:600;color:${color};margin-bottom:4px">${icon} ${i.message}</div>
        ${i.detail ? `<div style="color:#555;font-size:13px;line-height:1.5">${i.detail}</div>` : ""}
      </div>
    `;
  }).join("");

  const p7 = report.metrics?.pipeline_7d || {};
  const funnelRow = (label: string, value: any) =>
    `<tr><td style="padding:6px 0;color:#666;font-size:13px">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600">${value ?? "—"}</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <div style="background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
        <div style="background:${report.status === "critical" ? "#fef2f2" : report.status === "warn" ? "#fffbeb" : "#f0fdf4"};padding:20px 24px;border-bottom:1px solid #eee">
          <div style="font-size:13px;text-transform:uppercase;color:#888;letter-spacing:1px">Pipeline Health</div>
          <h2 style="margin:8px 0 0;color:#1a1a1a;font-size:22px">${emoji} ${label}</h2>
          <div style="margin-top:8px;color:#555;font-size:14px">Score: <strong>${report.score}/100</strong></div>
        </div>

        <div style="padding:20px 24px">
          ${report.issues.length > 0 ? `<h3 style="margin:0 0 12px;font-size:15px;color:#333">What's happening</h3>${issueRows}` : `<p style="color:#555">Everything looks healthy. No action needed.</p>`}

          <h3 style="margin:20px 0 10px;font-size:15px;color:#333">Last 7 days</h3>
          <table style="width:100%;border-top:1px solid #eee">
            ${funnelRow("Connection requests", p7.connection_requests)}
            ${funnelRow("Acceptances", p7.connection_accepted)}
            ${funnelRow("Acceptance rate", p7.accept_rate_pct != null ? p7.accept_rate_pct + "%" : null)}
            ${funnelRow("DMs sent", p7.dms_sent)}
            ${funnelRow("Replies", p7.replies)}
            ${funnelRow("Reply rate", p7.reply_rate_pct != null ? p7.reply_rate_pct + "%" : null)}
          </table>

          ${report.auto_paused ? `
          <div style="margin-top:20px;padding:14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#991b1b;font-size:14px">
            <strong>Your extension was auto-paused to protect your LinkedIn account.</strong><br/>
            Fix the issues above, then unpause from the dashboard.
          </div>` : ""}

          <div style="margin-top:24px;text-align:center">
            <a href="${appUrl}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Open Dashboard</a>
          </div>
        </div>

        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #eee;color:#999;font-size:12px;text-align:center">
          You're getting this because LinkedIn Copilot detected something that needs your attention.
        </div>
      </div>
    </div>
  `;
  return { subject, html };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const APP_URL = Deno.env.get("APP_URL") || "https://app.linkedincopilot.io";
    const EMAIL_FROM = Deno.env.get("ALERT_FROM_EMAIL") || "LinkedIn Copilot <notifications@linkedincopilot.io>";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = req.body ? await req.json().catch(() => ({})) : {};
    const targetUserId: string | undefined = body.user_id;
    const force: boolean = !!body.force;

    const now = new Date();

    // Determine which users to check
    let userIds: string[] = [];
    if (targetUserId) {
      userIds = [targetUserId];
    } else {
      const { data: users } = await supabase
        .from("extension_status")
        .select("user_id")
        .eq("is_connected", true);
      userIds = (users || []).map((u: any) => u.user_id);
    }

    const reports: HealthReport[] = [];
    let alerted = 0;
    let paused = 0;

    for (const uid of userIds) {
      const partial = await computeHealth(supabase, uid, now);

      // Fetch email
      let email: string | null = null;
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(uid);
        email = authUser?.user?.email || null;
      } catch {
        email = null;
      }

      const shouldSend = force || partial.status === "critical";
      let emailSent = false;

      if (shouldSend && email && RESEND_API_KEY) {
        const { subject, html } = buildEmailHtml(
          { ...partial, email, email_sent: false },
          APP_URL,
        );
        try {
          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: EMAIL_FROM,
              to: [email],
              subject,
              html,
            }),
          });
          emailSent = res.ok;
          if (!res.ok) {
            const txt = await res.text();
            console.error(`Resend failed for ${uid}: ${txt}`);
          }
        } catch (e) {
          console.error(`Resend exception for ${uid}:`, e);
        }
      }

      if (emailSent) alerted++;
      if (partial.auto_paused) paused++;

      reports.push({ ...partial, email, email_sent: emailSent });
    }

    return new Response(
      JSON.stringify({
        checked: userIds.length,
        alerted,
        paused,
        reports,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("user-health-alert error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
