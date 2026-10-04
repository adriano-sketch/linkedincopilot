import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json } from "../_shared/auth.ts";

// Security notes (2026-10 patch):
//  - Only the two configured prices (STRIPE_PRICE_PRO / STRIPE_PRICE_AGENCY)
//    can be purchased. Anything else -> 400.
//  - The plan written to Stripe metadata is derived from the chosen price,
//    never from client input.
//  - Redirect URLs come only from APP_BASE_URL (no Origin fallback).

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await authenticate(req, { allowService: false, allowUser: true });
    if (!auth || auth.kind !== "user") return json({ error: "Unauthorized", code: "checkout_failed" }, 401);
    if (!auth.email) return json({ error: "User has no email", code: "checkout_failed" }, 400);

    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const pricePro = Deno.env.get("STRIPE_PRICE_PRO") || "";
    const priceAgency = Deno.env.get("STRIPE_PRICE_AGENCY") || "";
    const baseUrlRaw = Deno.env.get("APP_BASE_URL") || "";
    if (!stripeSecret.startsWith("sk_") || (!pricePro && !priceAgency) || !baseUrlRaw) {
      console.error("create-checkout: configuration error", {
        hasSecret: stripeSecret.startsWith("sk_"),
        hasPricePro: !!pricePro,
        hasPriceAgency: !!priceAgency,
        hasBaseUrl: !!baseUrlRaw,
      });
      return json({ error: "Checkout is not configured", code: "config_error" }, 500);
    }
    const baseUrl = baseUrlRaw.replace(/\/+$/, "");

    // Whitelist: price -> plan. Built only from server config.
    const PRICE_TO_PLAN: Record<string, "pro" | "agency"> = {};
    if (pricePro) PRICE_TO_PLAN[pricePro] = "pro";
    if (priceAgency) PRICE_TO_PLAN[priceAgency] = "agency";
    const PLAN_TO_PRICE: Record<string, string> = { pro: pricePro, agency: priceAgency };

    const body = await req.json().catch(() => ({}));
    const priceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
    const planKey = typeof body.plan === "string" ? body.plan.trim().toLowerCase() : "";

    let resolvedPriceId = "";
    if (priceId) {
      if (!PRICE_TO_PLAN[priceId]) return json({ error: "Invalid price", code: "invalid_price" }, 400);
      resolvedPriceId = priceId;
      // If the client also sent a plan, it must agree with the price.
      if (planKey && PRICE_TO_PLAN[priceId] !== planKey) {
        return json({ error: "plan does not match price", code: "invalid_price" }, 400);
      }
    } else if (planKey) {
      resolvedPriceId = PLAN_TO_PRICE[planKey] || "";
      if (!resolvedPriceId) return json({ error: "Invalid plan", code: "invalid_price" }, 400);
    } else {
      return json({ error: "priceId or plan is required", code: "invalid_price" }, 400);
    }
    const finalPlan = PRICE_TO_PLAN[resolvedPriceId]; // derived from price only

    const stripe = new Stripe(stripeSecret, {
      apiVersion: "2023-10-16" as any,
    });

    // Prefer the customer already linked to this user, then email, then create.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { data: settings, error: settingsErr } = await admin
      .from("user_settings")
      .select("stripe_customer_id")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (settingsErr) console.error("create-checkout: user_settings lookup failed", settingsErr);

    let customerId: string | null = settings?.stripe_customer_id || null;
    if (!customerId) {
      const customers = await stripe.customers.list({ email: auth.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      } else {
        const created = await stripe.customers.create({
          email: auth.email,
          metadata: { user_id: auth.userId },
        });
        customerId = created.id;
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: resolvedPriceId, quantity: 1 }],
      mode: "subscription",
      allow_promotion_codes: true,
      client_reference_id: auth.userId,
      metadata: {
        user_id: auth.userId,
        plan: finalPlan,
      },
      subscription_data: {
        metadata: {
          user_id: auth.userId,
          plan: finalPlan,
        },
      },
      success_url: `${baseUrl}/dashboard?checkout=success&plan=${finalPlan}`,
      cancel_url: `${baseUrl}/dashboard?checkout=cancel`,
    });

    return json({ url: session.url });
  } catch (error) {
    console.error("create-checkout error:", error);
    return json({ error: "Could not start checkout", code: "checkout_failed" }, 500);
  }
});
