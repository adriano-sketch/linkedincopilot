import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
};

const PLAN_LIMITS: Record<string, { max_leads_per_cycle: number; max_campaigns: number; linkedin_accounts_limit: number }> = {
  free: { max_leads_per_cycle: 50, max_campaigns: 1, linkedin_accounts_limit: 1 },
  pro: { max_leads_per_cycle: 1000, max_campaigns: -1, linkedin_accounts_limit: 1 },
  agency: { max_leads_per_cycle: 5000, max_campaigns: -1, linkedin_accounts_limit: 5 },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminKey = Deno.env.get("ADMIN_API_KEY") || "";
    const headerKey = req.headers.get("x-admin-key") || "";
    if (!adminKey || headerKey !== adminKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const body = await req.json();
    const email = String(body?.email || "").toLowerCase().trim();
    const plan = String(body?.plan || "pro").toLowerCase();
    if (!email) throw new Error("email is required");
    if (!PLAN_LIMITS[plan]) throw new Error("invalid plan");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

    const { data: user, error: userErr } = await supabase
      .from("auth.users")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();
    if (userErr) throw userErr;
    if (!user?.id) throw new Error("User not found");

    const limits = PLAN_LIMITS[plan];
    const now = new Date();
    const cycleStart = now.toISOString().slice(0, 10);
    const cycleReset = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await supabase
      .from("user_settings")
      .update({
        plan,
        max_leads_per_cycle: limits.max_leads_per_cycle,
        max_campaigns: limits.max_campaigns,
        linkedin_accounts_limit: limits.linkedin_accounts_limit,
        leads_used_this_cycle: 0,
        cycle_start_date: cycleStart,
        cycle_reset_date: cycleReset,
      })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({ success: true, user_id: user.id, plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
