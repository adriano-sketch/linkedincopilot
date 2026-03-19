import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-extension-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const extensionToken = req.headers.get("x-extension-token");
    if (!extensionToken) {
      return new Response(JSON.stringify({ error: "Missing extension token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { linkedin_url, name, headline, about, experience, raw_text } = await req.json();
    if (!name || !raw_text) {
      return new Response(JSON.stringify({ error: "name and raw_text are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find user by extension token
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("extension_token", extensionToken)
      .maybeSingle();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Invalid extension token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = profile.user_id;

    // Try to match an existing event
    let eventId: string | null = null;

    // Match by linkedin_url first
    if (linkedin_url) {
      const { data: urlMatch } = await supabase
        .from("linkedin_events")
        .select("id")
        .eq("user_id", userId)
        .eq("linkedin_url", linkedin_url)
        .eq("status", "NEEDS_SNAPSHOT")
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (urlMatch) eventId = urlMatch.id;
    }

    // Then match by name
    if (!eventId) {
      const { data: nameMatch } = await supabase
        .from("linkedin_events")
        .select("id")
        .eq("user_id", userId)
        .eq("name", name)
        .eq("status", "NEEDS_SNAPSHOT")
        .order("detected_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (nameMatch) eventId = nameMatch.id;
    }

    // If no match, create a new event
    if (!eventId) {
      const { data: newEvent, error: eventError } = await supabase
        .from("linkedin_events")
        .insert({
          user_id: userId,
          name,
          title: headline,
          linkedin_url,
          source: "extension",
          status: "NEEDS_SNAPSHOT",
        })
        .select("id")
        .single();
      if (eventError) throw eventError;
      eventId = newEvent.id;
    }

    // Save snapshot
    const { error: snapError } = await supabase.from("profile_snapshots").insert({
      event_id: eventId,
      user_id: userId,
      linkedin_url,
      raw_text,
      headline,
      about,
      experience: experience || null,
    });
    if (snapError) throw snapError;

    // Update event status and enrich with snapshot data
    await supabase
      .from("linkedin_events")
      .update({
        status: "SNAPSHOT_RECEIVED",
        linkedin_url: linkedin_url || undefined,
        title: headline || undefined,
      })
      .eq("id", eventId);

    // Remove duplicate NEEDS_SNAPSHOT events for the same person
    // Match by linkedin_url or by name (case-insensitive partial match)
    if (linkedin_url) {
      await supabase
        .from("linkedin_events")
        .delete()
        .eq("user_id", userId)
        .eq("status", "NEEDS_SNAPSHOT")
        .eq("linkedin_url", linkedin_url)
        .neq("id", eventId);
    }
    // Also remove NEEDS_SNAPSHOT events where the name is contained in the captured name
    // e.g., Gmail detects "James" but extension captures "James Meyers"
    const { data: needsSnapshotEvents } = await supabase
      .from("linkedin_events")
      .select("id, name")
      .eq("user_id", userId)
      .eq("status", "NEEDS_SNAPSHOT");

    if (needsSnapshotEvents && needsSnapshotEvents.length > 0) {
      const nameLower = name.toLowerCase();
      const dupeIds = needsSnapshotEvents
        .filter((e) => e.id !== eventId && (
          nameLower.includes(e.name.toLowerCase()) ||
          e.name.toLowerCase().includes(nameLower)
        ))
        .map((e) => e.id);

      if (dupeIds.length > 0) {
        await supabase
          .from("linkedin_events")
          .delete()
          .eq("user_id", userId)
          .in("id", dupeIds);
      }
    }

    // Trigger DM generation by calling generate-dm
    const generateUrl = `${supabaseUrl}/functions/v1/generate-dm`;
    fetch(generateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ event_id: eventId, user_id: userId }),
    }).catch(console.error);

    return new Response(JSON.stringify({ success: true, event_id: eventId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("snapshot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
