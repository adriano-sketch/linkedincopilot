import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";

// Changes (2026-10 patch):
//  - Auth via shared helper (logged-in user JWT, getUser-verified).
//  - The client can NO LONGER set daily counters (actions_today,
//    connection_requests_today, messages_today, visits_today). They are only
//    incremented server-side (bump_extension_counters) and reset here at the
//    day boundary. Any counter fields in the body are ignored.
//  - Update/insert errors are checked and logged.
//  - Raw internal errors are not returned to the client.

const MAX_STR = 512;

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, MAX_STR) : null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return unauthorized();
    const userId = auth.userId;

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const body = await req.json().catch(() => ({}));
    // Only these fields are accepted from the client. Counters are ignored on purpose.
    const linkedin_logged_in = body.linkedin_logged_in === true;
    const browser_fingerprint = cleanStr(body.browser_fingerprint);
    const linkedinProfileRaw = cleanStr(body.linkedin_profile_url);
    const linkedin_profile_url =
      linkedinProfileRaw && /^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(linkedinProfileRaw) ? linkedinProfileRaw : null;

    const now = new Date();

    const { data: existing, error: existingErr } = await supabase
      .from("extension_status")
      .select("id, last_limit_reset_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingErr) {
      console.error("extension-heartbeat: status lookup failed", existingErr);
      return json({ error: "Heartbeat failed" }, 500);
    }

    // Daily reset (server-side only, UTC day boundary).
    let shouldReset = false;
    let stampResetOnly = false;
    if (existing?.last_limit_reset_at) {
      const lastReset = new Date(existing.last_limit_reset_at);
      shouldReset = lastReset.toDateString() !== now.toDateString();
    } else if (existing) {
      // Never stamped before: start tracking from now without wiping counters.
      stampResetOnly = true;
    }

    const writeData: Record<string, unknown> = {
      is_connected: true,
      last_heartbeat_at: now.toISOString(),
      linkedin_logged_in,
      updated_at: now.toISOString(),
    };

    if (shouldReset) {
      writeData.actions_today = 0;
      writeData.connection_requests_today = 0;
      writeData.messages_today = 0;
      writeData.visits_today = 0;
      writeData.last_limit_reset_at = now.toISOString();
    } else if (stampResetOnly) {
      writeData.last_limit_reset_at = now.toISOString();
    }

    if (browser_fingerprint) writeData.browser_fingerprint = browser_fingerprint;
    if (linkedin_profile_url) writeData.linkedin_profile_url = linkedin_profile_url;

    if (existing) {
      const { error: updErr } = await supabase
        .from("extension_status")
        .update(writeData)
        .eq("user_id", userId);
      if (updErr) {
        console.error("extension-heartbeat: update failed", updErr);
        return json({ error: "Heartbeat failed" }, 500);
      }
    } else {
      const { error: insErr } = await supabase
        .from("extension_status")
        .insert({ ...writeData, user_id: userId, last_limit_reset_at: now.toISOString() });
      if (insErr) {
        // Concurrent first heartbeat may have created the row: fall back to update.
        if ((insErr as any).code === "23505") {
          const { error: updErr2 } = await supabase
            .from("extension_status")
            .update(writeData)
            .eq("user_id", userId);
          if (updErr2) {
            console.error("extension-heartbeat: update after conflict failed", updErr2);
            return json({ error: "Heartbeat failed" }, 500);
          }
        } else {
          console.error("extension-heartbeat: insert failed", insErr);
          return json({ error: "Heartbeat failed" }, 500);
        }
      }
    }

    // Return pending actions count for the extension
    const { count, error: countErr } = await supabase
      .from("action_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "pending")
      .lte("scheduled_for", now.toISOString());
    if (countErr) console.error("extension-heartbeat: pending count failed", countErr);

    return json({
      success: true,
      pending_actions: count || 0,
      daily_reset: shouldReset,
    });
  } catch (e) {
    console.error("extension-heartbeat error:", e);
    return json({ error: "Heartbeat failed" }, 500);
  }
});
