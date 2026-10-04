// increment-leads-used (patched 2026-10)
// Changes: shared auth helper; atomic increment via consume_lead_credits RPC
// (before: read-modify-write lost increments under concurrency); count capped.
import { authenticate, corsHeaders, effectiveUserId, json, unauthorized } from "../_shared/auth.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await authenticate(req, { allowService: true, allowUser: true });
  if (!auth) return unauthorized();

  try {
    const body = await req.json().catch(() => ({}));
    const userId = effectiveUserId(auth, body.user_id);
    if (!userId) return json({ error: "user_id required" }, 400);

    const count = Number(body.count);
    if (!Number.isInteger(count) || count <= 0 || count > 1000) return json({ error: "Invalid count" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: ok, error } = await supabase.rpc("consume_lead_credits", { p_user_id: userId, p_amount: count });
    if (error) throw error;

    const { data: settings } = await supabase
      .from("user_settings")
      .select("leads_used_this_cycle, max_leads_per_cycle")
      .eq("user_id", userId)
      .maybeSingle();

    if (!ok) return json({ success: false, error: "Lead credits exhausted", leads_used: settings?.leads_used_this_cycle ?? null }, 402);
    return json({ success: true, leads_used: settings?.leads_used_this_cycle ?? null });
  } catch (e) {
    console.error("increment-leads-used error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
