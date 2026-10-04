import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";

// Changes (2026-10 patch):
//  - Auth via shared helper (user only).
//  - Unknown price/product no longer coerced to "pro": keep the user's current
//    plan and log a warning.
//  - Users with no active/trialing subscription who were on a paid plan
//    *through Stripe* (stripe_subscription_id set) are downgraded to free.
//    Users with a paid plan and stripe_subscription_id NULL were granted
//    manually by an admin and are left untouched.
//  - Stripe customer looked up by user_settings.stripe_customer_id first,
//    email only as a fallback.
//  - Writes are error-checked; raw errors are not returned to the client.

type PlanKey = "free" | "pro" | "agency";

const PRODUCT_MAP: Record<string, PlanKey> = {
  "prod_U4ofPIQHrgWbOL": "pro",
  "prod_UBunqngiwwsM77": "pro",
  "prod_U4ofkZH7UiU8Lk": "agency",
  "prod_U5YD8u29Z3hCLk": "agency",
};

const PLAN_LIMITS: Record<PlanKey, { max_leads_per_cycle: number; max_campaigns: number; linkedin_accounts_limit: number }> = {
  free: { max_leads_per_cycle: 50, max_campaigns: 1, linkedin_accounts_limit: 1 },
  pro: { max_leads_per_cycle: 1000, max_campaigns: -1, linkedin_accounts_limit: 1 },
  agency: { max_leads_per_cycle: 5000, max_campaigns: -1, linkedin_accounts_limit: 5 },
};

/** Returns the plan for a price/product, or null when it is not recognised. */
function resolvePlan(priceId?: string | null, productId?: string | null): PlanKey | null {
  const pricePro = Deno.env.get("STRIPE_PRICE_PRO") || "";
  const priceAgency = Deno.env.get("STRIPE_PRICE_AGENCY") || "";
  const productPro = Deno.env.get("STRIPE_PRODUCT_PRO") || "";
  const productAgency = Deno.env.get("STRIPE_PRODUCT_AGENCY") || "";

  if (priceId && pricePro && priceId === pricePro) return "pro";
  if (priceId && priceAgency && priceId === priceAgency) return "agency";
  if (productId && productPro && productId === productPro) return "pro";
  if (productId && productAgency && productId === productAgency) return "agency";
  if (productId && PRODUCT_MAP[productId]) return PRODUCT_MAP[productId];
  return null;
}

function toIsoFromUnix(sec: unknown): string | null {
  return typeof sec === "number" && Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : null;
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
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return unauthorized();
    const userId = auth.userId;

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
    if (!stripeSecret) {
      console.error("check-subscription: STRIPE_SECRET_KEY not configured");
      return json({ error: "Billing is not configured" }, 500);
    }
    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2025-08-27.basil" as any,
    });

    const { data: settings, error: settingsErr } = await supabaseClient
      .from("user_settings")
      .select("plan, stripe_customer_id, stripe_subscription_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (settingsErr) {
      console.error("check-subscription: user_settings lookup failed", settingsErr);
      return json({ error: "Failed to load subscription" }, 500);
    }

    const currentPlan: string = (settings?.plan as string) || "free";
    const hadStripeSub = !!settings?.stripe_subscription_id;

    /** No active Stripe subscription: downgrade only Stripe-managed paid plans. */
    const handleNoActiveSub = async (): Promise<Response> => {
      if (settings && currentPlan !== "free" && hadStripeSub) {
        const limits = PLAN_LIMITS.free;
        const { error: downErr } = await supabaseClient
          .from("user_settings")
          .update({
            plan: "free",
            stripe_subscription_id: null,
            max_leads_per_cycle: limits.max_leads_per_cycle,
            max_campaigns: limits.max_campaigns,
            linkedin_accounts_limit: limits.linkedin_accounts_limit,
          })
          .eq("user_id", userId);
        if (downErr) {
          console.error("check-subscription: downgrade failed", downErr);
          return json({ error: "Failed to update subscription" }, 500);
        }
        console.log(`check-subscription: downgraded user ${userId} from ${currentPlan} to free (no active subscription)`);
        return json({ subscribed: false, plan: "free", downgraded: true });
      }
      // plan != free with no stripe_subscription_id => manually granted by admin; keep it.
      return json({
        subscribed: false,
        plan: currentPlan,
        manual_grant: currentPlan !== "free" && !hadStripeSub,
      });
    };

    let customerId: string | null = settings?.stripe_customer_id || null;
    if (!customerId) {
      if (!auth.email) return handleNoActiveSub();
      const customers = await stripe.customers.list({ email: auth.email, limit: 1 });
      if (customers.data.length === 0) return handleNoActiveSub();
      customerId = customers.data[0].id;
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });

    const active = subscriptions.data.filter((s: any) => s.status === "active" || s.status === "trialing");
    // Prefer the subscription we already know about, if it is still active.
    const activeSub: any =
      active.find((s: any) => s.id === settings?.stripe_subscription_id) || active[0] || null;
    if (!activeSub) return handleNoActiveSub();

    const item: any = activeSub.items?.data?.[0];
    const priceId: string | null = item?.price?.id ?? null;
    const rawProduct = item?.price?.product;
    const productId: string | null = typeof rawProduct === "string" ? rawProduct : rawProduct?.id ?? null;

    const resolved = resolvePlan(priceId, productId);
    let plan: string;
    if (resolved) {
      plan = resolved;
    } else {
      console.warn(
        `check-subscription: unknown price/product for user ${userId} (price=${priceId}, product=${productId}); keeping current plan "${currentPlan}"`,
      );
      plan = currentPlan;
    }

    // In API 2025-08-27.basil the billing period lives on the subscription item.
    const subscriptionEnd = toIsoFromUnix(item?.current_period_end ?? activeSub.current_period_end);
    const subscriptionStart = toIsoFromUnix(item?.current_period_start ?? activeSub.current_period_start);

    const update: Record<string, unknown> = {
      stripe_customer_id: customerId,
      stripe_subscription_id: activeSub.id,
    };
    if (resolved) {
      const limits = PLAN_LIMITS[resolved];
      update.plan = resolved;
      update.max_leads_per_cycle = limits.max_leads_per_cycle;
      update.max_campaigns = limits.max_campaigns;
      update.linkedin_accounts_limit = limits.linkedin_accounts_limit;
    }
    if (subscriptionStart) update.cycle_start_date = subscriptionStart.slice(0, 10);
    if (subscriptionEnd) update.cycle_reset_date = subscriptionEnd.slice(0, 10);

    const { error: updErr } = await supabaseClient
      .from("user_settings")
      .update(update)
      .eq("user_id", userId);
    if (updErr) {
      console.error("check-subscription: user_settings update failed", updErr);
      return json({ error: "Failed to update subscription" }, 500);
    }

    return json({
      subscribed: true,
      plan,
      product_id: productId,
      subscription_end: subscriptionEnd,
    });
  } catch (error) {
    console.error("check-subscription error:", error);
    return json({ error: "Failed to check subscription" }, 500);
  }
});
