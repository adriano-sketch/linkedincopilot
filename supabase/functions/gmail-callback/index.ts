import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured");
    if (!GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_SECRET is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) throw new Error("Unauthorized");

    const { code, redirect_uri } = await req.json();
    if (!code) throw new Error("code is required");
    if (!redirect_uri) throw new Error("redirect_uri is required");

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

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenData);
      throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    const refreshToken = tokenData.refresh_token;
    if (!refreshToken) {
      throw new Error("No refresh token received. Please revoke access and try again.");
    }

    // Store in google_connections using service role
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Upsert: update if exists, insert if not
    const { data: existing } = await supabase
      .from("google_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("google_connections")
        .update({
          google_refresh_token: refreshToken,
          gmail_watch_enabled: true,
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("google_connections").insert({
        user_id: user.id,
        google_refresh_token: refreshToken,
        gmail_watch_enabled: true,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("gmail-callback error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
