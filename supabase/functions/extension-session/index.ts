import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";

// Gives the browser extension a session of its own for the person who is signed in on the site, so
// the extension does not need a password (an account created with a sign-in provider has none).
//
// The site calls this with the person's own token and hands the result to the extension. The
// session is a new one, not a copy of the site's: each side renews its own. (Signing out on the
// site ends the site's own session only; the extension stays connected until "Sign out everywhere" or
// its own sign-out.)
//
// How: a one-time sign-in token is generated for the caller's own email (no email is sent) and is
// exchanged at once for a session. The email comes from the verified token of the caller, never
// from the request body.
//
// One request per account every WAIT_SECONDS: each one opens a session that nothing closes short of
// "Sign out everywhere" (a normal sign-out on the site is local, and the extension's own sign-out
// only forgets the session), so they must not be created in a loop.
const WAIT_SECONDS = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return unauthorized();
    if (!auth.email) return json({ error: "This account has no email address", code: "no_email" }, 400);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    if (!url || !serviceKey || !anonKey) {
      console.error("extension-session: configuration error", { url: !!url, serviceKey: !!serviceKey, anonKey: !!anonKey });
      return json({ error: "Not configured", code: "config_error" }, 500);
    }

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

    // Check and mark in one database statement: two requests arriving together cannot both pass.
    // Taken before the session is created: if the turn cannot be taken, no session is handed out.
    const { data: claimed, error: claimErr } = await admin.rpc("claim_extension_connect", { p_user: auth.userId, p_wait_seconds: WAIT_SECONDS });
    if (claimErr) {
      console.error("extension-session: could not take the turn", claimErr.message);
      return json({ error: "Could not connect the extension", code: "unexpected" }, 500);
    }
    if (claimed !== true) {
      return json({ error: "Requested a moment ago. Try again in a minute.", code: "too_soon" }, 429);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email: auth.email });
    const tokenHash = link?.properties?.hashed_token;
    if (linkErr || !tokenHash) {
      console.error("extension-session: could not generate the sign-in token", linkErr?.message);
      return json({ error: "Could not connect the extension", code: "link_failed" }, 500);
    }
    // The token must belong to the caller. generateLink creates an account when the email has none,
    // which cannot happen for a signed-in caller, but the result is checked rather than assumed.
    if (link.user?.id !== auth.userId) {
      console.error("extension-session: the sign-in token is for another account");
      return json({ error: "Could not connect the extension", code: "user_mismatch" }, 500);
    }

    const visitor = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: verified, error: verifyErr } = await visitor.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    const session = verified?.session;
    if (verifyErr || !session || session.user?.id !== auth.userId) {
      console.error("extension-session: could not open the session", verifyErr?.message);
      return json({ error: "Could not connect the extension", code: "verify_failed" }, 500);
    }

    return json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      user_id: session.user.id,
    });
  } catch (e) {
    console.error("extension-session: unexpected error", e instanceof Error ? e.message : e);
    return json({ error: "Could not connect the extension", code: "unexpected" }, 500);
  }
});
