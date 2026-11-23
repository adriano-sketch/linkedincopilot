// Retired. Olanovo no longer writes or sends direct messages (see #53).
//
// Older functions (enrichment-cron, enrich-leads-batch, action-completed, snapshot, schedule-actions)
// still call this endpoint fire-and-forget after enriching a lead. It answers without doing anything,
// so those calls stay harmless until each caller is cleaned up. No model is called, nothing is written.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/auth.ts";

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return json({ success: false, retired: true, reason: "direct messages are not written any more" });
});
