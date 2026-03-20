import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PRODUCT_MAP: Record<string, string> = {
  "prod_U4ofPIQHrgWbOL": "pro",
  "prod_U4ofkZH7UiU8Lk": "agency",
  "prod_U5YD8u29Z3hCLk": "agency",
};

const PLAN_LIMITS: Record<string, { max_leads_per_cycle: number; max_campaigns: number; linkedin_accounts_limit: number }> = {
  free: { max_leads_per_cycle: 50, max_campaigns: 1, linkedin_accounts_limit: 1 },
  pro: { max_leads_per_cycle: 1000, max_campaigns: -1, linkedin_accounts_limit: 1 },
  agency: { max_leads_per_cycle: 5000, max_campaigns: -1, linkedin_accounts_limit: 5 },
};

function resolvePlan(priceId?: string | null, productId?: string | null) {
  const pricePro = Deno.env.get("STRIPE_PRICE_PRO") || "";
  const priceAgency = Deno.env.get("STRIPE_PRICE_AGENCY") || "";
  const productPro = Deno.env.get("STRIPE_PRODUCT_PRO") || "";
  const productAgency = Deno.env.get("STRIPE_PRODUCT_AGENCY") || "";

  if (priceId && priceId === pricePro) return "pro";
  if (priceId && priceId === priceAgency) return "agency";
  if (productId && productId === productPro) return "pro";
  if (productId && productId === productAgency) return "agency";
  if (productId && PRODUCT_MAP[productId]) return PRODUCT_MAP[productId];
  return "free";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(userError.message);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const { data: settings } = await supabaseClient
      .from("user_settings")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = settings?.stripe_customer_id || null;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length === 0) {
        return new Response(JSON.stringify({ subscribed: false, plan: "free" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      customerId = customers.data[0].id;
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 5,
    });

    const activeSub = subscriptions.data.find(sub => sub.status === "active" || sub.status === "trialing") || null;
    if (!activeSub) {
      return new Response(JSON.stringify({ subscribed: false, plan: "free" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subscription = activeSub;
    const priceId = subscription.items.data[0].price.id;
    const productId = subscription.items.data[0].price.product as string;
    const plan = resolvePlan(priceId, productId);
    const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
    const subscriptionStart = new Date(subscription.current_period_start * 1000).toISOString();
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    // Update user_settings with the plan
    await supabaseClient
      .from("user_settings")
      .update({
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        max_leads_per_cycle: limits.max_leads_per_cycle,
        max_campaigns: limits.max_campaigns,
        linkedin_accounts_limit: limits.linkedin_accounts_limit,
        cycle_start_date: subscriptionStart.slice(0, 10),
        cycle_reset_date: subscriptionEnd.slice(0, 10),
      })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({
      subscribed: true,
      plan,
      product_id: productId,
      subscription_end: subscriptionEnd,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
