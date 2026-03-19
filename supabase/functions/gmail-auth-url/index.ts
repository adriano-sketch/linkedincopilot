import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured");

    const { redirect_uri, login_hint } = await req.json();
    if (!redirect_uri) throw new Error("redirect_uri is required");

    const scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
    ].join(" ");

    const paramsObj: Record<string, string> = {
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri,
      response_type: "code",
      scope: scopes,
      access_type: "offline",
      prompt: "consent",
      state: "gmail_connect",
    };
    if (login_hint) paramsObj.login_hint = login_hint;
    const params = new URLSearchParams(paramsObj);

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-auth-url error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
