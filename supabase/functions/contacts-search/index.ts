// contacts-search
// Asks the Chrome extension to look for the user's OWN connections (1st degree) that match
// a Growth campaign, using LinkedIn people search with network=[F] and the given keywords.
// Found people land in linkedin_connections and are scored by contacts-match.
// Auth: the user's JWT. Deployed with verify_jwt=false; auth is enforced here.
//
// Body: { campaign_id, keywords: string[], pages?: number (per keyword, 1-5, default 2), posted_recently?: boolean }
// With Sales Navigator, the search runs in Sales Navigator (1st degree + keyword) and can keep only
// people who posted on LinkedIn in the last 30 days (posted_recently), ideal for Growth comments.
// Keywords are searched one at a time (LinkedIn returns nothing for long OR chains).
// Each results page is one people search on the user's account, so it counts toward the
// monthly search budget shown in Network > Limits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, json, unauthorized } from "../_shared/auth.ts";
import { buildConnectionsSearchUrl, buildSalesNavConnectionsSearchUrl, salesNavEnabled } from "../_shared/network.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const auth = await authenticate(req, { allowService: false, allowUser: true });
  if (!auth || auth.kind !== "user") return unauthorized();
  const userId = auth.userId;

  try {
    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
    const keywords: string[] = Array.isArray(body.keywords)
      ? body.keywords.map((k: unknown) => String(k).replace(/["()]/g, "").trim()).filter((k: string) => k.length >= 2).slice(0, 8)
      : [];
    const maxPages = Math.max(1, Math.min(5, Math.round(Number(body.pages) || 2)));
    const postedRecently = body.posted_recently === true;
    if (!campaignId) return json({ error: "campaign_id required" }, 400);
    if (keywords.length === 0) return json({ error: "add at least one keyword" }, 400);

    const supabase: Supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: campaign } = await supabase.from("campaign_profiles")
      .select("id").eq("id", campaignId).eq("user_id", userId).maybeSingle();
    if (!campaign) return json({ error: "campaign not found" }, 404);

    const { data: ext } = await supabase.from("extension_status")
      .select("monthly_people_search_budget, searches_paused_until, last_heartbeat_at, linkedin_account_tier, sales_nav_failed_at")
      .eq("user_id", userId).maybeSingle();
    if (!ext) return json({ error: "Install and log in to the Chrome extension first." }, 409);
    if (ext.searches_paused_until && new Date(ext.searches_paused_until).getTime() > Date.now()) {
      return json({ error: "LinkedIn search limit reached this month. Use the LinkedIn export file instead." }, 429);
    }

    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const { count: used } = await supabase.from("network_search_runs").select("id", { count: "exact", head: true })
      .eq("user_id", userId).in("kind", ["people", "connections"]).gte("created_at", monthStart)
      .in("status", ["queued", "completed", "failed", "limit_reached"]);
    const budget = ext.monthly_people_search_budget ?? 250;
    const left = budget - (used || 0);
    if (left <= 0) return json({ error: "Monthly search budget used up. Use the LinkedIn export file instead." }, 429);

    // One search at a time per campaign.
    const { data: running } = await supabase.from("network_search_runs").select("id")
      .eq("user_id", userId).eq("campaign_profile_id", campaignId).eq("kind", "connections").eq("status", "queued").limit(1);
    if (running && running.length) return json({ ok: true, already_running: true });

    const totalSearches = Math.min(maxPages * keywords.length, left);
    const sn = salesNavEnabled(ext);
    const url = sn
      ? buildSalesNavConnectionsSearchUrl(keywords[0], 1, { postedRecently })
      : buildConnectionsSearchUrl(keywords[0], 1);
    const { data: run, error: runErr } = await supabase.from("network_search_runs").insert({
      user_id: userId, campaign_profile_id: campaignId, kind: "connections", page: 1, search_url: url,
      query: keywords[0].slice(0, 400), status: "queued",
    }).select("id").single();
    if (runErr) throw runErr;

    const { error: qErr } = await supabase.from("action_queue").insert({
      user_id: userId,
      action_type: "network_search_people",
      linkedin_url: url,
      priority: 3,
      status: "pending",
      scheduled_for: new Date(Date.now() + 15 * 1000).toISOString(),
      action_data: {
        module: "network", purpose: "connections", campaign_id: campaignId, search_run_id: run.id,
        search_url: url, page: 1, max_pages: maxPages, keywords, kw_index: 0, searches_left: totalSearches - 1,
        ...(sn ? { reader: "sales_navigator", posted_recently: postedRecently } : {}),
      },
    });
    if (qErr) throw qErr;

    const online = ext.last_heartbeat_at && Date.now() - new Date(ext.last_heartbeat_at).getTime() < 10 * 60 * 1000;
    return json({ ok: true, pages: totalSearches, extension_online: !!online, sales_navigator: sn });
  } catch (e) {
    console.error("contacts-search error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
