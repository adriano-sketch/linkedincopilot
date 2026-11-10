// extension-offline-alert
// Emails the user when their extension has been silent for 60+ minutes INSIDE their active window
// while there is work waiting. Called by pg_cron every 15 minutes. Internal only.
//
// One alert per stoppage: after an alert, no new one is sent until a heartbeat arrives (the
// extension came back) and it goes silent again. A user who is travelling gets one email, not one
// per hour. The user can also turn the alerts off or snooze them (Network → Limits).
//
// Body: { dry_run?: boolean }  → dry_run reports what would be sent and sends nothing.
// Returns counts only: { checked, would_alert | alerted, skipped: { reason: n } }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";

const OFFLINE_MINUTES = 60;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Minutes since the start of the user's active window today (their timezone). -1 = outside it. */
function minutesIntoActiveWindow(ext: any, nowMs: number): number {
  let parts: Record<string, string> = {};
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: ext?.timezone || "America/New_York", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(nowMs)).map((p) => [p.type, p.value]));
  } catch (_) {
    const d = new Date(nowMs);
    parts = { weekday: DAY_KEYS[d.getUTCDay()], hour: String(d.getUTCHours()), minute: String(d.getUTCMinutes()) };
  }
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const day = String(parts.weekday || "").slice(0, 3).toLowerCase();
  const days: string[] = Array.isArray(ext?.active_days) && ext.active_days.length ? ext.active_days : DAY_KEYS;
  if (!days.includes(day)) return -1;
  const toMin = (t: string, d: number) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : d;
  };
  const start = toMin(ext?.active_hours_start, 8 * 60);
  const end = toMin(ext?.active_hours_end, 18 * 60);
  if (minutes < start || minutes >= end) return -1;
  return minutes - start;
}

function emailHtml(hoursText: string, pending: number, appUrl: string): { subject: string; html: string } {
  const subject = `Your LinkedIn Copilot has been stopped for ${hoursText}`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <div style="background:#fff;border:1px solid #eee;border-radius:12px;overflow:hidden">
        <div style="background:#fffbeb;padding:20px 24px;border-bottom:1px solid #eee">
          <h2 style="margin:0;color:#1a1a1a;font-size:20px">Your Copilot is not running</h2>
        </div>
        <div style="padding:20px 24px;color:#333;font-size:15px;line-height:1.6">
          <p style="margin:0 0 12px">The Chrome extension has not checked in for ${hoursText}, during your active hours.
          ${pending} ${pending === 1 ? "action is" : "actions are"} waiting.</p>
          <p style="margin:0 0 12px">Nothing is lost. Everything resumes by itself when the extension is back. To bring it back:</p>
          <ol style="margin:0 0 12px;padding-left:20px">
            <li>Make sure the computer is on and awake.</li>
            <li>Open Chrome.</li>
            <li>Open LinkedIn and check that you are logged in.</li>
          </ol>
          <p style="margin:0 0 12px;color:#555;font-size:14px">You will not get this email again until the extension has come back and stopped a second time.</p>
          <div style="margin-top:20px;text-align:center">
            <a href="${appUrl}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">Open dashboard</a>
          </div>
        </div>
        <div style="padding:14px 24px;background:#fafafa;border-top:1px solid #eee;color:#888;font-size:12px;text-align:center">
          Away for a while? Turn these alerts off or pause them for a few days in Network, Limits.
        </div>
      </div>
    </div>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authenticate(req, { allowService: true, allowUser: false });
  if (!auth) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const EMAIL_FROM = Deno.env.get("ALERT_FROM_EMAIL") || "LinkedIn Copilot <notifications@linkedincopilot.io>";
    const APP_URL = Deno.env.get("APP_URL") || "https://app.linkedincopilot.io";

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const { data: exts, error } = await supabase.from("extension_status")
      .select("user_id, is_paused, last_heartbeat_at, active_days, active_hours_start, active_hours_end, timezone, offline_alerts_enabled, offline_alerts_snoozed_until, offline_alert_sent_at");
    if (error) throw error;

    const skipped: Record<string, number> = {};
    const skip = (r: string) => { skipped[r] = (skipped[r] || 0) + 1; };
    let alerted = 0;
    let wouldAlert = 0;

    for (const ext of exts || []) {
      if (ext.offline_alerts_enabled === false) { skip("alerts_off"); continue; }
      if (ext.offline_alerts_snoozed_until && new Date(ext.offline_alerts_snoozed_until).getTime() > nowMs) { skip("snoozed"); continue; }
      if (ext.is_paused) { skip("paused_by_user"); continue; }
      if (!ext.last_heartbeat_at) { skip("never_connected"); continue; }
      const beatMs = new Date(ext.last_heartbeat_at).getTime();
      const silentMin = (nowMs - beatMs) / 60000;
      if (silentMin < OFFLINE_MINUTES) { skip("online_or_recent"); continue; }
      // Only time inside the active window counts: at 08:10 the night before is not "an hour stopped".
      const into = minutesIntoActiveWindow(ext, nowMs);
      if (into < 0) { skip("outside_active_hours"); continue; }
      if (into < OFFLINE_MINUTES) { skip("window_just_opened"); continue; }
      // One alert per stoppage.
      if (ext.offline_alert_sent_at && new Date(ext.offline_alert_sent_at).getTime() > beatMs) { skip("already_alerted"); continue; }

      const { count: pending } = await supabase.from("action_queue")
        .select("id", { count: "exact", head: true })
        .eq("user_id", ext.user_id).eq("status", "pending").lte("scheduled_for", nowIso);
      if (!pending) { skip("nothing_waiting"); continue; }

      if (dryRun) { wouldAlert++; continue; }
      if (!RESEND_API_KEY) { skip("no_email_key"); continue; }

      let email: string | null = null;
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(ext.user_id);
        email = authUser?.user?.email || null;
      } catch (_) { email = null; }
      if (!email) { skip("no_email_address"); continue; }

      const stoppedMin = Math.min(silentMin, into);
      const hours = Math.floor(stoppedMin / 60);
      const hoursText = hours <= 1 ? "1 hour" : `${hours} hours`;
      const { subject, html } = emailHtml(hoursText, pending, APP_URL);
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: [email], subject, html }),
      });
      if (!res.ok) {
        console.error(`extension-offline-alert: email failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
        skip("email_failed");
        continue;
      }
      await res.body?.cancel();
      await supabase.from("extension_status").update({ offline_alert_sent_at: nowIso }).eq("user_id", ext.user_id);
      alerted++;
    }

    return json({ checked: (exts || []).length, ...(dryRun ? { would_alert: wouldAlert } : { alerted }), skipped });
  } catch (e) {
    console.error("extension-offline-alert error:", e);
    return json({ error: `internal_error: ${String((e as Error)?.message || e).slice(0, 160)}` }, 500);
  }
});
