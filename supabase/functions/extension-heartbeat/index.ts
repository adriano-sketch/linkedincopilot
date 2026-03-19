import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const {
      linkedin_logged_in = false,
      actions_today = 0,
      connection_requests_today = 0,
      messages_today = 0,
      browser_fingerprint,
      linkedin_profile_url,
    } = await req.json();

    const now = new Date();

    // Check if we need to reset daily counters
    const { data: existing } = await supabase
      .from("extension_status")
      .select("last_limit_reset_at")
      .eq("user_id", user.id)
      .maybeSingle();

    let shouldReset = false;
    if (existing?.last_limit_reset_at) {
      const lastReset = new Date(existing.last_limit_reset_at);
      shouldReset = lastReset.toDateString() !== now.toDateString();
    }

    const upsertData: any = {
      user_id: user.id,
      is_connected: true,
      last_heartbeat_at: now.toISOString(),
      linkedin_logged_in,
      updated_at: now.toISOString(),
    };

    if (shouldReset) {
      upsertData.actions_today = 0;
      upsertData.connection_requests_today = 0;
      upsertData.messages_today = 0;
      upsertData.last_limit_reset_at = now.toISOString();
    } else {
      upsertData.actions_today = actions_today;
      upsertData.connection_requests_today = connection_requests_today;
      upsertData.messages_today = messages_today;
    }

    if (browser_fingerprint) upsertData.browser_fingerprint = browser_fingerprint;
    if (linkedin_profile_url) upsertData.linkedin_profile_url = linkedin_profile_url;

    // Upsert
    const { data: ext } = await supabase
      .from("extension_status")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ext) {
      await supabase.from("extension_status")
        .update(upsertData)
        .eq("user_id", user.id);
    } else {
      await supabase.from("extension_status")
        .insert(upsertData);
    }

    // Return pending actions count for the extension
    const { count } = await supabase
      .from("action_queue")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .lte("scheduled_for", now.toISOString());

    return new Response(JSON.stringify({
      success: true,
      pending_actions: count || 0,
      daily_reset: shouldReset,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extension-heartbeat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
