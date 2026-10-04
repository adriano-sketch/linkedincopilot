import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";
import { verifyOAuthState } from "../_shared/oauth_state.ts";

// Changes (2026-10 patch):
//  - Auth via shared helper (logged-in user).
//  - Requires `state` (from gmail-auth-url, echoed back by Google in the
//    redirect query string). Its HMAC, expiry and user binding are verified;
//    otherwise the request is rejected before the code is exchanged.
//  - Writes to google_connections are error-checked.
//  - No raw Google / internal error text is returned to the client.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return unauthorized();
    const userId = auth.userId;

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      console.error("gmail-callback: Google OAuth client is not configured");
      return json({ error: "Gmail connection is not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body.code === "string" ? body.code : "";
    const redirect_uri = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";
    if (!code) return json({ error: "code is required" }, 400);
    if (!redirect_uri) return json({ error: "redirect_uri is required" }, 400);

    const check = await verifyOAuthState(body.state, userId);
    if (!check.ok) {
      console.warn(`gmail-callback: rejected state for user ${userId}: ${check.reason}`);
      const msg = check.reason === "expired"
        ? "Gmail connection link expired. Please start again."
        : "Invalid Gmail connection state. Please start again.";
      return json({ error: msg, code: `state_${check.reason}` }, 400);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok) {
      console.error("gmail-callback: token exchange failed", tokenResponse.status, tokenData?.error, tokenData?.error_description);
      return json({ error: "Could not connect Gmail. Please try again.", code: "token_exchange_failed" }, 400);
    }

    const refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      return json({
        error: "No refresh token received. Please revoke access and try again.",
        code: "no_refresh_token",
      }, 400);
    }

    // Store in google_connections using service role
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: existing, error: existingErr } = await supabase
      .from("google_connections")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingErr) {
      console.error("gmail-callback: lookup failed", existingErr);
      return json({ error: "Could not save Gmail connection" }, 500);
    }

    if (existing) {
      const { error: updErr } = await supabase
        .from("google_connections")
        .update({
          google_refresh_token: refreshToken,
          gmail_watch_enabled: true,
        })
        .eq("id", existing.id)
        .eq("user_id", userId);
      if (updErr) {
        console.error("gmail-callback: update failed", updErr);
        return json({ error: "Could not save Gmail connection" }, 500);
      }
    } else {
      const { error: insErr } = await supabase.from("google_connections").insert({
        user_id: userId,
        google_refresh_token: refreshToken,
        gmail_watch_enabled: true,
      });
      if (insErr) {
        console.error("gmail-callback: insert failed", insErr);
        return json({ error: "Could not save Gmail connection" }, 500);
      }
    }

    return json({ success: true });
  } catch (e) {
    console.error("gmail-callback error:", e);
    return json({ error: "Could not connect Gmail" }, 500);
  }
});
