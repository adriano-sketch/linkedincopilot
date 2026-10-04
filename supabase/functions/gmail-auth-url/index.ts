import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";
import { createOAuthState } from "../_shared/oauth_state.ts";

// Changes (2026-10 patch):
//  - Requires a logged-in user.
//  - OAuth "state" is now a signed, user-bound, 10-minute token (was the
//    constant "gmail_connect"). It is returned to the client as `state` and
//    must be sent back to gmail-callback together with `code`.

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return unauthorized();

    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!GOOGLE_CLIENT_ID) {
      console.error("gmail-auth-url: GOOGLE_CLIENT_ID is not configured");
      return json({ error: "Gmail connection is not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const redirect_uri = typeof body.redirect_uri === "string" ? body.redirect_uri.trim() : "";
    const login_hint = typeof body.login_hint === "string" ? body.login_hint.trim() : "";
    if (!redirect_uri || !/^https?:\/\//i.test(redirect_uri)) return json({ error: "redirect_uri is required" }, 400);

    const { state, exp } = await createOAuthState(auth.userId);

    const paramsObj: Record<string, string> = {
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    };
    if (login_hint) paramsObj.login_hint = login_hint;
    const params = new URLSearchParams(paramsObj);

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return json({ url, state, state_expires_at: new Date(exp).toISOString() });
  } catch (e) {
    console.error("gmail-auth-url error:", e);
    return json({ error: "Could not start Gmail connection" }, 500);
  }
});
