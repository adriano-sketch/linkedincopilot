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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Unauthorized");

    const { count } = await req.json();
    if (!count || count <= 0) throw new Error("Invalid count");

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Increment leads_used_this_cycle
    const { data: settings } = await supabaseAdmin
      .from("user_settings")
      .select("leads_used_this_cycle")
      .eq("user_id", user.id)
      .single();

    const currentUsed = settings?.leads_used_this_cycle || 0;

    await supabaseAdmin
      .from("user_settings")
      .update({ leads_used_this_cycle: currentUsed + count })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ success: true, leads_used: currentUsed + count }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("increment-leads-used error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
