// Retired. Olanovo does not send profile addresses to outside data providers.
//
// What it knows about a person comes from the LinkedIn pages opened in the user's own session and from
// the connections file the user uploads. Older callers (the watchdog) may still call this endpoint; it
// answers without doing anything, so no profile address leaves the system by this path.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, json } from "../_shared/auth.ts";

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  return json({ success: true, retired: true, done: true, enriched: 0, processed: 0 });
});
