import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function nextBusinessHour(): string {
  const date = new Date();
  const hour = date.getHours();
  if (hour >= 8 && hour < 17) {
    date.setMinutes(date.getMinutes() + 30 + Math.floor(Math.random() * 60));
  } else {
    date.setDate(date.getDate() + (hour >= 17 ? 1 : 0));
    date.setHours(8 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0, 0);
  }
  return date.toISOString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { lead_ids, action, edits, campaign_profile_id, stage } = body;
    // action: 'approve' | 'approve_stage' | 'approve_all_campaign' | 'reject' | 'edit' | 'approve_with_edit'
    // stage: 'connection' | 'dm' | 'followup' (used with approve_stage)

    const results = { approved: 0, rejected: 0, edited: 0, errors: [] as string[] };
    const now = new Date().toISOString();

    // ── STAGE-LEVEL APPROVAL ──
    if (action === "approve_stage") {
      const cpId = campaign_profile_id;
      if (!cpId || !stage) throw new Error("campaign_profile_id and stage required");

      const stageColumn = {
        connection: "stage_connection_approved",
        dm: "stage_dm_approved",
        followup: "stage_followup_approved",
      }[stage as string];

      if (!stageColumn) throw new Error("Invalid stage: must be connection, dm, or followup");

      // Set stage flag on campaign
      await supabase.from("campaign_profiles")
        .update({ [stageColumn]: true, updated_at: now } as any)
        .eq("id", cpId)
        .eq("user_id", user.id);

      // Apply edits to sample leads if provided
      if (edits) {
        for (const [leadId, edit] of Object.entries(edits)) {
          const editData: any = { updated_at: now, dm_edited_by_user: true };
          const e = edit as any;
          if (e.connection_note !== undefined) editData.connection_note = e.connection_note;
          if (e.custom_dm !== undefined) {
            editData.custom_dm = e.custom_dm;
            editData.dm_text = e.custom_dm;
          }
          if (e.custom_followup !== undefined) {
            editData.custom_followup = e.custom_followup;
            editData.follow_up_text = e.custom_followup;
          }
          await supabase.from("campaign_leads")
            .update(editData)
            .eq("id", leadId)
            .eq("user_id", user.id);
          results.edited++;
        }
      }

      // For connection stage: set all pending_approval leads to ready with next_action_at
      if (stage === "connection") {
        const { data: pendingLeads } = await supabase
          .from("campaign_leads")
          .select("id")
          .eq("campaign_profile_id", cpId)
          .eq("user_id", user.id)
          .in("status", ["pending_approval", "dm_ready", "ready_for_dm"]);

        if (pendingLeads && pendingLeads.length > 0) {
          for (const pl of pendingLeads) {
            await supabase.from("campaign_leads")
              .update({
                dm_approved: true,
                dm_approved_at: now,
                approved_at: now,
                status: "ready",
                next_action_at: nextBusinessHour(),
                updated_at: now,
              } as any)
              .eq("id", pl.id);
            results.approved++;
          }
        }

        // Also approve imported/enriched leads that haven't been processed yet
        const { data: unprocessedLeads } = await supabase
          .from("campaign_leads")
          .select("id")
          .eq("campaign_profile_id", cpId)
          .eq("user_id", user.id)
          .in("status", ["imported", "enriched"]);

        if (unprocessedLeads && unprocessedLeads.length > 0) {
          await supabase.from("campaign_leads")
            .update({ dm_approved: true, dm_approved_at: now, updated_at: now } as any)
            .in("id", unprocessedLeads.map(l => l.id));

          // Process in batches (fire-and-forget)
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const BATCH_SIZE = 10;
          for (let i = 0; i < unprocessedLeads.length; i += BATCH_SIZE) {
            const batch = unprocessedLeads.slice(i, i + BATCH_SIZE);
            fetch(`${supabaseUrl}/functions/v1/process-new-lead`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                lead_ids: batch.map(l => l.id),
                campaign_profile_id: cpId,
                auto_approved: true,
              }),
            }).catch(err => console.error("process-new-lead batch error:", err));
          }
          (results as any).processing_remaining = unprocessedLeads.length;
        }
      }

      // Log
      await supabase.from("activity_log").insert({
        user_id: user.id,
        action: `stage_${stage}_approved`,
        details: { campaign_profile_id: cpId },
      });

      return new Response(JSON.stringify({ ...results, stage_approved: stage }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REJECT ──
    if (!lead_ids || lead_ids.length === 0) throw new Error("lead_ids required");

    if (action === "reject") {
      // Check if these are dm_pending_approval leads (post-connection DM reject)
      const { data: rejectLeads } = await supabase.from("campaign_leads")
        .select("id, status")
        .in("id", lead_ids)
        .eq("user_id", user.id);

      const dmPendingIds = (rejectLeads || []).filter(l => l.status === "dm_pending_approval").map(l => l.id);
      const otherIds = (rejectLeads || []).filter(l => l.status !== "dm_pending_approval").map(l => l.id);

      // For dm_pending_approval leads: clear DM text only, reset to connected so it regenerates
      if (dmPendingIds.length > 0) {
        await supabase.from("campaign_leads")
          .update({
            status: "connected",
            custom_dm: null,
            dm_text: null,
            custom_followup: null,
            follow_up_text: null,
            messages_generated_at: null,
            dm_approved: false,
            next_action_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            updated_at: now,
          } as any)
          .in("id", dmPendingIds);
      }

      // For other leads: full reset
      if (otherIds.length > 0) {
        await supabase.from("campaign_leads")
          .update({
            status: "generating_messages",
            connection_note: null,
            custom_dm: null,
            custom_followup: null,
            dm_text: null,
            follow_up_text: null,
            messages_generated_at: null,
            dm_approved: false,
            updated_at: now,
          } as any)
          .in("id", otherIds);
      }

      results.rejected = lead_ids.length;

      for (const id of lead_ids) {
        await supabase.from("activity_log").insert({
          user_id: user.id,
          campaign_lead_id: id,
          action: "dm_rejected",
        });
      }

      return new Response(JSON.stringify(results), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── EDIT ──
    if ((action === "edit" || action === "approve_with_edit") && edits) {
      for (const [leadId, edit] of Object.entries(edits)) {
        const editData: any = { updated_at: now, dm_edited_by_user: true };
        const e = edit as any;
        if (e.connection_note !== undefined) editData.connection_note = e.connection_note;
        if (e.custom_dm !== undefined) {
          editData.custom_dm = e.custom_dm;
          editData.dm_text = e.custom_dm;
        }
        if (e.custom_followup !== undefined) {
          editData.custom_followup = e.custom_followup;
          editData.follow_up_text = e.custom_followup;
        }
        if (e.dm_text !== undefined) {
          editData.dm_text = e.dm_text;
          editData.custom_dm = e.dm_text;
        }
        await supabase.from("campaign_leads")
          .update(editData)
          .eq("id", leadId)
          .eq("user_id", user.id);
        results.edited++;
      }
      if (action === "edit") {
        return new Response(JSON.stringify(results), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── APPROVE (individual leads) ──
    const { data: leads } = await supabase
      .from("campaign_leads")
      .select("id, first_name, campaign_profile_id, status")
      .in("id", lead_ids)
      .eq("user_id", user.id)
      .in("status", ["pending_approval", "dm_ready", "ready_for_dm", "dm_pending_approval"]);

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ ...results, error: "No leads found in pending_approval status" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    for (const lead of leads) {
      try {
        // Per-lead DM approval: move back to liking_post so scheduler queues send_dm
        if (lead.status === "dm_pending_approval") {
          await supabase.from("campaign_leads")
            .update({
              dm_approved: true,
              dm_approved_at: now,
              status: "liking_post",
              next_action_at: nextBusinessHour(),
              updated_at: now,
            } as any)
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action: "dm_individually_approved",
          });
          results.approved++;
        } else {
          // Legacy: connection stage approval
          await supabase.from("campaign_leads")
            .update({
              dm_approved: true,
              dm_approved_at: now,
              approved_at: now,
              status: "ready",
              next_action_at: nextBusinessHour(),
              updated_at: now,
            } as any)
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action: "dm_approved",
          });
          results.approved++;
        }
      } catch (err) {
        results.errors.push(`${lead.first_name || "Unknown"}: ${err instanceof Error ? err.message : "Unknown"}`);
      }
    }

    // ── "Approve & Process All" mode (legacy) ──
    if (action === "approve_all_campaign") {
      const campaignId = campaign_profile_id || leads[0]?.campaign_profile_id;
      if (campaignId) {
        const { data: otherPending } = await supabase
          .from("campaign_leads")
          .select("id")
          .eq("campaign_profile_id", campaignId)
          .eq("user_id", user.id)
          .in("status", ["pending_approval", "dm_ready", "ready_for_dm"])
          .not("id", "in", `(${lead_ids.join(",")})`);

        if (otherPending && otherPending.length > 0) {
          for (const ol of otherPending) {
            await supabase.from("campaign_leads")
              .update({
                dm_approved: true,
                dm_approved_at: now,
                approved_at: now,
                status: "ready",
                next_action_at: nextBusinessHour(),
                updated_at: now,
              } as any)
              .eq("id", ol.id);
            results.approved++;
          }
        }

        const { data: unprocessedLeads } = await supabase
          .from("campaign_leads")
          .select("id")
          .eq("campaign_profile_id", campaignId)
          .eq("user_id", user.id)
          .in("status", ["imported", "enriched"]);

        if (unprocessedLeads && unprocessedLeads.length > 0) {
          await supabase.from("campaign_leads")
            .update({ dm_approved: true, dm_approved_at: now, updated_at: now } as any)
            .in("id", unprocessedLeads.map(l => l.id));

          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const BATCH_SIZE = 10;
          for (let i = 0; i < unprocessedLeads.length; i += BATCH_SIZE) {
            const batch = unprocessedLeads.slice(i, i + BATCH_SIZE);
            fetch(`${supabaseUrl}/functions/v1/process-new-lead`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                lead_ids: batch.map(l => l.id),
                campaign_profile_id: campaignId,
                auto_approved: true,
              }),
            }).catch(err => console.error("process-new-lead batch error:", err));
          }
          (results as any).processing_remaining = unprocessedLeads.length;
        }

        // Enable all stage flags + auto_approve
        await supabase.from("campaign_profiles")
          .update({
            auto_approve_dms: true,
            stage_connection_approved: true,
            stage_dm_approved: true,
            stage_followup_approved: true,
            updated_at: now,
          } as any)
          .eq("id", campaignId);

        (results as any).auto_approve_enabled = true;
      }
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("approve-dms error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
