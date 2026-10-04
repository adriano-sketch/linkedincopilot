// LinkedIn Copilot — enrichment-cron (v2: Scrapin-free)
// Instead of calling Scrapin API, this cron now pushes un-enriched leads
// directly into the pipeline (status=ready). The Chrome extension will
// scrape profile data from LinkedIn DOM during the visit_profile step.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, unauthorized } from "../_shared/auth.ts";

const PUSHABLE_SOURCES = ["csv", "search", "sales_nav"];
const PUSHABLE_STATUSES = ["new", "imported", "enriching"];
const MAX_LEADS_PER_RUN = 50;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal / cron only.
  const auth = await authenticate(req, { allowService: true, allowUser: false });
  if (!auth) return unauthorized();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find active campaigns
    const { data: activeCampaigns, error: campErr } = await supabase
      .from("campaign_profiles")
      .select("id, name, user_id")
      .eq("status", "active");
    if (campErr) throw campErr;

    if (!activeCampaigns || activeCampaigns.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active campaigns" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalPushed = 0;
    const campaignResults: Record<string, any> = {};
    const now = new Date().toISOString();

    for (const campaign of activeCampaigns) {
      // Find leads that are stuck in pre-pipeline statuses without enrichment
      const { data: pendingLeads, error: pendingErr } = await supabase
        .from("campaign_leads")
        .select("id, linkedin_url, full_name, first_name, last_name, title, company, status, source")
        .eq("campaign_profile_id", campaign.id)
        .eq("user_id", campaign.user_id)
        .is("profile_enriched_at", null)
        .in("source", PUSHABLE_SOURCES)
        .in("status", PUSHABLE_STATUSES)
        .or("profile_quality_status.is.null,profile_quality_status.eq.ok")
        .limit(MAX_LEADS_PER_RUN);
      if (pendingErr) console.error(`enrichment-cron: lead fetch failed for campaign ${campaign.id}:`, pendingErr);

      if (!pendingLeads || pendingLeads.length === 0) {
        campaignResults[campaign.name] = { pushed: 0, pending: 0 };
        continue;
      }

      // Check for ghost blacklist before pushing
      let pushed = 0;
      for (const lead of pendingLeads) {
        // Normalize URL
        let linkedinUrl = lead.linkedin_url;
        if (linkedinUrl) {
          try {
            const parsed = new URL(linkedinUrl.startsWith("http") ? linkedinUrl : `https://${linkedinUrl}`);
            parsed.protocol = "https:";
            if (!parsed.hostname.startsWith("www.")) parsed.hostname = `www.${parsed.hostname}`;
            parsed.hash = "";
            parsed.search = "";
            linkedinUrl = parsed.toString().replace(/\/+$/, "");
          } catch { /* keep original */ }
        }

        if (!linkedinUrl || !linkedinUrl.includes("linkedin.com/in/")) {
          // Invalid URL — skip
          const { error: invErr } = await supabase.from("campaign_leads").update({
            status: "skipped",
            error_message: "Invalid LinkedIn URL",
            profile_enriched_at: now,
            updated_at: now,
          } as any).eq("id", lead.id);
          if (invErr) console.error(`enrichment-cron: skip (invalid URL) update failed for ${lead.id}:`, invErr);
          continue;
        }

        // Ghost blacklist check
        const { data: ghostEntry } = await supabase
          .from("ghost_profiles")
          .select("id, reason")
          .eq("linkedin_url", linkedinUrl)
          .maybeSingle();

        if (ghostEntry) {
          const { error: ghostErr } = await supabase.from("campaign_leads").update({
            status: "skipped",
            error_message: `Blacklisted: ${ghostEntry.reason}`,
            profile_quality_status: "ghost",
            profile_enriched_at: now,
            updated_at: now,
          } as any).eq("id", lead.id);
          if (ghostErr) console.error(`enrichment-cron: ghost skip update failed for ${lead.id}:`, ghostErr);
          continue;
        }

        // Check for existing snapshot (another lead already scraped this profile)
        const { data: existingSnapshot } = await supabase
          .from("profile_snapshots")
          .select("id, headline, about, experience, raw_text")
          .eq("linkedin_url", linkedinUrl)
          .limit(1)
          .maybeSingle();

        if (existingSnapshot) {
          // Use existing snapshot — no need to visit profile for scraping
          const { error: snapErr } = await supabase.from("campaign_leads").update({
            snapshot_id: existingSnapshot.id,
            profile_enriched_at: now,
            profile_headline: existingSnapshot.headline || null,
            profile_about: existingSnapshot.about || null,
            enrichment_source: "existing_snapshot",
            status: "ready",
            next_action_at: now,
            updated_at: now,
          } as any).eq("id", lead.id);
          if (snapErr) {
            // Do not fire generate-dm for a lead whose enrichment did not persist.
            console.error(`enrichment-cron: snapshot update failed for ${lead.id}:`, snapErr);
            continue;
          }

          // Fire generate-dm for this lead
          fetch(`${supabaseUrl}/functions/v1/generate-dm`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({
              campaign_lead_id: lead.id,
              user_id: campaign.user_id,
            }),
          }).catch(err => console.error(`generate-dm fire-and-forget error for ${lead.id}:`, err));

          pushed++;
          continue;
        }

        // Push to ready — extension will scrape during visit_profile
        const { error: pushErr } = await supabase.from("campaign_leads").update({
          status: "ready",
          enrichment_source: "pending_extension_scrape",
          next_action_at: now,
          linkedin_url: linkedinUrl,
          updated_at: now,
        } as any).eq("id", lead.id);
        if (pushErr) {
          console.error(`enrichment-cron: push-to-ready update failed for ${lead.id}:`, pushErr);
          continue;
        }

        pushed++;
      }

      totalPushed += pushed;
      campaignResults[campaign.name] = {
        pushed,
        pending_before: pendingLeads.length,
      };

      // Also kick ICP check for any leads that were enriched but not ICP-checked
      const { count: pendingIcp } = await supabase
        .from("campaign_leads")
        .select("id", { count: "exact", head: true })
        .eq("campaign_profile_id", campaign.id)
        .is("error_message", null)
        .not("profile_enriched_at", "is", null)
        .is("icp_checked_at", null);

      if (pendingIcp && pendingIcp > 0) {
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

    console.log(`Enrichment cron (Scrapin-free): ${totalPushed} leads pushed to pipeline`);

    return new Response(JSON.stringify({
      success: true,
      total_pushed: totalPushed,
      mode: "extension_scrape",
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
