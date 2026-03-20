import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth failed: ${userError.message}`);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated");

    const { priceId, plan } = await req.json();
    const planKey = (plan || "").toLowerCase();
    const pricePro = Deno.env.get("STRIPE_PRICE_PRO") || "";
    const priceAgency = Deno.env.get("STRIPE_PRICE_AGENCY") || "";
    const resolvedPriceId =
      priceId ||
      (planKey === "pro" ? pricePro : planKey === "agency" ? priceAgency : "");
    if (!resolvedPriceId) throw new Error("priceId or plan is required");
    const finalPlan = planKey || (resolvedPriceId === pricePro ? "pro" : resolvedPriceId === priceAgency ? "agency" : "pro");

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeSecret || !stripeSecret.startsWith("sk_")) {
      throw new Error("Stripe secret key is missing or invalid (expected sk_*)");
    }
    if (!pricePro && !priceAgency) {
      throw new Error("Stripe price IDs not configured");
    }

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2023-10-16",
    });

    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    } else {
      const created = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });
      customerId = created.id;
    }

    const baseUrl = Deno.env.get("APP_BASE_URL") || req.headers.get("origin") || "https://linkedincopilot.io";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          user_id: user.id,
          plan: finalPlan,
        },
      },
      success_url: `${baseUrl}/dashboard?checkout=success&plan=${finalPlan}`,
      cancel_url: `${baseUrl}/dashboard?checkout=cancel`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message, code: "checkout_failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
