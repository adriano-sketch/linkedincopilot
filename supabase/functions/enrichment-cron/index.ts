import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ENRICHABLE_SOURCES = ["csv", "search"];
const ENRICHABLE_STATUSES = ["new", "imported", "ready", "icp_rejected", "icp_matched"];
const MAX_BATCHES_PER_RUN = 3; // Process up to 3 batches (9 leads) per cron tick

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find active campaigns with pending enrichment
    const { data: activeCampaigns } = await supabase
      .from("campaign_profiles")
      .select("id, name, user_id")
      .eq("status", "active");

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active campaigns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalEnriched = 0;
    let totalErrors = 0;
    const campaignResults: Record<string, any> = {};

    for (const campaign of activeCampaigns) {
      // Check if this campaign has pending enrichment
      const { count: pendingCount } = await supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_profile_id", campaign.id)
        .eq("user_id", campaign.user_id)
        .is("profile_enriched_at", null)
        .in("source", ENRICHABLE_SOURCES)
        .in("status", ENRICHABLE_STATUSES)
        .or("profile_quality_status.is.null,profile_quality_status.eq.ok");

      if (pendingCount && pendingCount > 0) {
        // Run multiple batches for this campaign
        let batchesRun = 0;
        let campaignEnriched = 0;
        let done = false;

        while (batchesRun < MAX_BATCHES_PER_RUN && !done) {
          try {
            const resp = await fetch(`${supabaseUrl}/functions/v1/enrich-leads-batch`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseKey}`,
                "x-internal-key": supabaseKey,
              },
              body: JSON.stringify({
                campaign_profile_id: campaign.id,
                user_id: campaign.user_id,
              }),
            });

            if (!resp.ok) {
              const errText = await resp.text();
              console.error(`Enrichment batch failed for ${campaign.name}: ${errText}`);
              totalErrors++;
              break;
            }

            const result = await resp.json();
            campaignEnriched += result.enriched || 0;
            done = result.done === true;
            batchesRun++;

            if (!done) await new Promise(r => setTimeout(r, 1500));
          } catch (err) {
            console.error(`Enrichment batch error for ${campaign.name}:`, err);
            totalErrors++;
            break;
          }
        }

        totalEnriched += campaignEnriched;
        campaignResults[campaign.name] = {
          enriched: campaignEnriched,
          batches: batchesRun,
          pending_before: pendingCount,
          done,
        };
      }

      // Kick ICP check progressively — run whenever there are enriched leads pending ICP
      const { count: pendingIcp } = await supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_profile_id", campaign.id)
        .is("error_message", null)
        .not("profile_enriched_at", "is", null)
        .is("icp_checked_at", null);

      console.log(`Campaign ${campaign.name}: pendingIcp=${pendingIcp}`);

      if (pendingIcp && pendingIcp > 0) {
        console.log(`Kicking ICP check for ${campaign.name} (${pendingIcp} pending)`);
        // Fire-and-forget — ICP check handles its own batching
        fetch(`${supabaseUrl}/functions/v1/icp-check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
            "x-internal-key": supabaseKey,
          },
          body: JSON.stringify({ campaign_profile_id: campaign.id, user_id: campaign.user_id }),
        }).catch(err => console.error(`ICP check kick error for ${campaign.name}:`, err));
      }
    }

    console.log(`Enrichment cron: ${totalEnriched} enriched, ${totalErrors} errors`);

    return new Response(JSON.stringify({
      success: true,
      total_enriched: totalEnriched,
      total_errors: totalErrors,
      campaigns: campaignResults,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("enrichment-cron error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
