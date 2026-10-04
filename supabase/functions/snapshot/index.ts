import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/auth.ts";

// Chrome extension endpoint. Auth: x-extension-token -> profiles.extension_token.
//
// Changes (2026-10 patch):
//  - Dedupe of NEEDS_SNAPSHOT events now only removes events whose name
//    matches EXACTLY (case-insensitive, trimmed, whitespace-collapsed) or
//    whose linkedin_url matches. The old substring match deleted unrelated
//    people (e.g. capturing "Ana Paula Souza" deleted pending "Ana", "Paula").
//  - Critical writes are error-checked; raw errors are not returned.
//  - Inputs are type-checked and size-capped.

const MAX_TEXT = 100_000;
const MAX_SHORT = 2_000;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function normName(s: unknown): string {
  return typeof s === "string" ? s.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

function normUrl(s: unknown): string {
  return typeof s === "string" ? s.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase() : "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const extensionToken = req.headers.get("x-extension-token");
    if (!extensionToken) return json({ error: "Missing extension token" }, 401);

    const body = await req.json().catch(() => ({}));
    const name = str(body.name, 300);
    const raw_text = str(body.raw_text, MAX_TEXT);
    const linkedin_url = str(body.linkedin_url, MAX_SHORT);
    const headline = str(body.headline, MAX_SHORT);
    const about = str(body.about, MAX_TEXT);
    const experience = str(body.experience, MAX_TEXT);
    if (!name || !raw_text) return json({ error: "name and raw_text are required" }, 400);

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
      if (profileError) console.error("snapshot: token lookup failed", profileError);
      return json({ error: "Invalid extension token" }, 401);
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
      if (eventError || !newEvent) {
        console.error("snapshot: event insert failed", eventError);
        return json({ error: "Failed to save snapshot" }, 500);
      }
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
    if (snapError) {
      console.error("snapshot: profile_snapshots insert failed", snapError);
      return json({ error: "Failed to save snapshot" }, 500);
    }

    // Update event status and enrich with snapshot data
    const eventUpdate: Record<string, unknown> = { status: "SNAPSHOT_RECEIVED" };
    if (linkedin_url) eventUpdate.linkedin_url = linkedin_url;
    if (headline) eventUpdate.title = headline;
    const { error: evUpdErr } = await supabase
      .from("linkedin_events")
      .update(eventUpdate)
      .eq("id", eventId)
      .eq("user_id", userId);
    if (evUpdErr) {
      console.error("snapshot: event status update failed", evUpdErr);
      return json({ error: "Failed to save snapshot" }, 500);
    }

    // Remove duplicate NEEDS_SNAPSHOT events for the SAME person only:
    // exact name match (case-insensitive, trimmed) or same linkedin_url.
    const { data: pending, error: pendingErr } = await supabase
      .from("linkedin_events")
      .select("id, name, linkedin_url")
      .eq("user_id", userId)
      .eq("status", "NEEDS_SNAPSHOT")
      .neq("id", eventId);
    if (pendingErr) {
      console.error("snapshot: dedupe lookup failed", pendingErr);
    } else if (pending && pending.length > 0) {
      const nameKey = normName(name);
      const urlKey = normUrl(linkedin_url);
      const dupeIds = pending
        .filter((e: any) =>
          (nameKey && normName(e.name) === nameKey) ||
          (urlKey && e.linkedin_url && normUrl(e.linkedin_url) === urlKey)
        )
        .map((e: any) => e.id);

      if (dupeIds.length > 0) {
        const { error: delErr } = await supabase
          .from("linkedin_events")
          .delete()
          .eq("user_id", userId)
          .eq("status", "NEEDS_SNAPSHOT")
          .in("id", dupeIds);
        if (delErr) console.error("snapshot: dedupe delete failed", delErr);
      }
    }

    // Trigger DM generation by calling generate-dm (fire-and-forget, internal call)
    const generateUrl = `${supabaseUrl}/functions/v1/generate-dm`;
    fetch(generateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ event_id: eventId, user_id: userId }),
    }).catch((err) => console.error("snapshot: generate-dm trigger failed", err));

    return json({ success: true, event_id: eventId });
  } catch (e) {
    console.error("snapshot error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
