import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, campaign_profile_id, type } = await req.json();
    // type: 'connection_notes_ready' | 'dms_ready'

    if (!user_id || !campaign_profile_id) throw new Error("user_id and campaign_profile_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured, skipping notification");
      return new Response(JSON.stringify({ success: false, reason: "no_resend_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user email
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(user_id);
    if (userError || !user?.email) throw new Error("Could not find user email");

    // Get campaign name
    const { data: campaign } = await supabase
      .from("campaign_profiles")
      .select("name")
      .eq("id", campaign_profile_id)
      .single();

    const campaignName = campaign?.name || "Your campaign";

    // Count pending approvals
    const { count } = await supabase
      .from("campaign_leads")
      .select("id", { count: "exact", head: true })
      .eq("campaign_profile_id", campaign_profile_id)
      .eq("status", "pending_approval");

    const pendingCount = count || 0;

    const appUrl = Deno.env.get("APP_URL") || "http://localhost:3000";

    const typeLabel = type === "dms_ready" ? "DMs" : "connection requests";
    const subject = `✅ ${pendingCount} ${typeLabel} ready for review — ${campaignName}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 16px;">Messages ready for your review</h2>
        <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
          <strong>${pendingCount} ${typeLabel}</strong> have been generated for <strong>${campaignName}</strong> and are waiting for your approval.
        </p>
        <p style="color: #4a4a4a; font-size: 15px; line-height: 1.6;">
          Review a few samples, edit if needed, then approve to start the outreach sequence for all leads.
        </p>
        <div style="margin: 28px 0;">
          <a href="${appUrl}/dashboard" 
             style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;">
            Review & Approve
          </a>
        </div>
        <p style="color: #9a9a9a; font-size: 12px;">
          No action will be taken until you approve. Your leads are safe.
        </p>
      </div>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LinkedIn Copilot <notifications@linkedincopilot.io>",
        to: [user.email],
        subject,
        html,
      }),
    });

    if (!emailResponse.ok) {
      const errText = await emailResponse.text();
      console.error("Resend error:", errText);
      // Don't throw - notification failure shouldn't block the flow
      return new Response(JSON.stringify({ success: false, reason: "resend_error", detail: errText }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Notification email sent to ${user.email} for campaign ${campaignName} (${pendingCount} pending)`);

    return new Response(JSON.stringify({ success: true, sent_to: user.email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-approval-ready error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
