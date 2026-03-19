import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PER_RUN = 10;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find ICP-matched leads that don't have messages generated yet
    const { data: leads, error } = await supabase
      .from("campaign_leads")
      .select("id, user_id, campaign_profile_id")
      .eq("icp_match", true)
      .is("connection_note", null)
      .is("error_message", null)
      .not("profile_enriched_at", "is", null)
      .order("created_at", { ascending: true })
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
