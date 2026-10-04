import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";

// Changes (2026-10 patch): auth via shared helper; return_url built only from
// APP_BASE_URL (never the Origin header); no raw error messages to the client.

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return unauthorized();

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const baseUrlRaw = Deno.env.get("APP_BASE_URL") || "";
    if (!stripeSecret || !baseUrlRaw) {
      console.error("customer-portal: configuration error", { hasSecret: !!stripeSecret, hasBaseUrl: !!baseUrlRaw });
      return json({ error: "Billing portal is not configured", code: "config_error" }, 500);
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2025-08-27.basil" as any,
    });

    const { data: settings, error: settingsErr } = await supabaseClient
      .from("user_settings")
      .select("stripe_customer_id")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (settingsErr) console.error("customer-portal: user_settings lookup failed", settingsErr);

    let customerId: string | null = settings?.stripe_customer_id || null;
    if (!customerId && auth.email) {
      const customers = await stripe.customers.list({ email: auth.email, limit: 1 });
      if (customers.data.length > 0) customerId = customers.data[0].id;
    }
    if (!customerId) return json({ error: "No billing account found", code: "no_customer" }, 404);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${baseUrl}/dashboard`,
    });

    return json({ url: portalSession.url });
  } catch (error) {
    console.error("customer-portal error:", error);
    return json({ error: "Could not open billing portal" }, 500);
  }
});
