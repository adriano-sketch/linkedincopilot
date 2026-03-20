import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  return "free";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
    if (!webhookSecret) throw new Error("Missing STRIPE_WEBHOOK_SECRET");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
      apiVersion: "2025-08-27.basil",
    });

    const signature = req.headers.get("stripe-signature") || "";
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const updateByUserId = async (userId: string, updates: Record<string, unknown>) => {
      await supabase.from("user_settings").update(updates).eq("user_id", userId);
    };

    const updateByCustomerId = async (customerId: string, updates: Record<string, unknown>) => {
      await supabase.from("user_settings").update(updates).eq("stripe_customer_id", customerId);
    };

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = session.customer as string | null;
      const subscriptionId = session.subscription as string | null;
      const userId = (session.client_reference_id || session.metadata?.user_id) as string | undefined;
      const plan = (session.metadata?.plan || "") as string;

      if (userId) {
        await updateByUserId(userId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        });
        if (plan) {
          const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
          await updateByUserId(userId, {
            plan,
            max_leads_per_cycle: limits.max_leads_per_cycle,
            max_campaigns: limits.max_campaigns,
            linkedin_accounts_limit: limits.linkedin_accounts_limit,
          });
        }
      } else if (customerId) {
        await updateByCustomerId(customerId, {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
        });
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const priceId = subscription.items.data[0]?.price?.id;
      const productId = subscription.items.data[0]?.price?.product as string | undefined;
      const plan = resolvePlan(priceId, productId);
      const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
      const cycleStart = new Date(subscription.current_period_start * 1000).toISOString().slice(0, 10);
      const cycleEnd = new Date(subscription.current_period_end * 1000).toISOString().slice(0, 10);

      await updateByCustomerId(customerId, {
        plan,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        max_leads_per_cycle: limits.max_leads_per_cycle,
        max_campaigns: limits.max_campaigns,
        linkedin_accounts_limit: limits.linkedin_accounts_limit,
        cycle_start_date: cycleStart,
        cycle_reset_date: cycleEnd,
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;
      const limits = PLAN_LIMITS.free;
      await updateByCustomerId(customerId, {
        plan: "free",
        stripe_subscription_id: null,
        max_leads_per_cycle: limits.max_leads_per_cycle,
        max_campaigns: limits.max_campaigns,
        linkedin_accounts_limit: limits.linkedin_accounts_limit,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message || "Webhook error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
