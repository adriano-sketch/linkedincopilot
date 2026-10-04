import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authenticate, corsHeaders, unauthorized } from "../_shared/auth.ts";

const MAX_PER_RUN = 10;
// A lead touched in the last RETRY_COOLDOWN_MIN minutes that still has no note
// is skipped this run, so one failing lead cannot block the head of the queue.
const RETRY_COOLDOWN_MIN = 30;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal / cron only.
  const auth = await authenticate(req, { allowService: true, allowUser: false });
  if (!auth) return unauthorized();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Only leads from active campaigns.
    const { data: activeCampaigns, error: campErr } = await supabase
      .from("campaign_profiles")
      .select("id")
      .eq("status", "active");
    if (campErr) throw campErr;

    const activeIds = (activeCampaigns || []).map((c: any) => c.id);
    if (activeIds.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active campaigns", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cooldownCutoff = new Date(Date.now() - RETRY_COOLDOWN_MIN * 60000).toISOString();

    // Find ICP-matched leads that don't have messages generated yet.
    // - error_message is null: leads whose last generate attempt failed with an error are excluded
    // - updated_at older than the cooldown (or null): recently attempted leads wait their turn
    // - ordered by updated_at asc: least recently touched first (round-robin, no starvation)
    const { data: leads, error } = await supabase
      .from("campaign_leads")
      .select("id, user_id, campaign_profile_id")
      .eq("icp_match", true)
      .is("connection_note", null)
      .is("error_message", null)
      .not("profile_enriched_at", "is", null)
      .in("campaign_profile_id", activeIds)
      .or(`updated_at.is.null,updated_at.lt.${cooldownCutoff}`)
      .order("updated_at", { ascending: true, nullsFirst: true })
      .limit(MAX_PER_RUN);

    if (error) throw error;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No leads pending message generation", generated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`generate-dm-cron: Found ${leads.length} leads needing messages`);

    let generated = 0;
    let errors = 0;

    // NOTE: this cron does not write to the lead on failure (that would hide it
    // from the watchdog's "enriched but no message after 2h" alert). It relies on
    // generate-dm setting error_message (excluded above) and/or updated_at when
    // an attempt fails.

    for (const lead of leads) {
      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/generate-dm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            user_id: lead.user_id,
            campaign_lead_id: lead.id,
          }),
        });

        if (!resp.ok) {
          const errText = await resp.text();
          console.error(`generate-dm failed for ${lead.id}: ${errText}`);
          errors++;
        } else {
          await resp.body?.cancel();
          generated++;
          console.log(`Generated messages for lead ${lead.id}`);
        }

        // Delay between calls to avoid rate limits
        await new Promise(r => setTimeout(r, 800));
      } catch (err) {
        console.error(`generate-dm error for ${lead.id}:`, err);
        errors++;
      }
    }

    console.log(`generate-dm-cron complete: ${generated} generated, ${errors} errors`);

    return new Response(JSON.stringify({
      success: true,
      generated,
      errors,
      total_found: leads.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-dm-cron error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
