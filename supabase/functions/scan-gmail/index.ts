import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAccessToken(refreshToken: string): Promise<string> {
  const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    body?: { data?: string };
    parts?: Array<{ mimeType: string; body?: { data?: string } }>;
  };
  snippet: string;
  internalDate: string;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

function extractLinkedInUrl(htmlBody: string): string | null {
  // Decode HTML entities that might be in URLs
  const decoded = htmlBody
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/g, "/")
    .replace(/&#47;/g, "/")
    .replace(/&#x3A;/g, ":")
    .replace(/&#58;/g, ":");

  // Look for LinkedIn profile URLs in the email body
  const patterns = [
    /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%\.~]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/comm\/in\/[a-zA-Z0-9\-_%\.~]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/pub\/[a-zA-Z0-9\-_%\.~\/]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/profile\/view\?id=[a-zA-Z0-9\-_%\.~&=]+/gi,
    /https?:\/\/(?:www\.)?linkedin\.com\/comm\/profile\/view\?id=[a-zA-Z0-9\-_%\.~&=]+/gi,
    // LinkedIn tracking URLs that contain /in/ path
    /https?:\/\/[a-z0-9\-]*\.?linkedin\.com\/[a-zA-Z0-9\/_\-]*\/in\/[a-zA-Z0-9\-_%\.~]+/gi,
  ];
  for (const pattern of patterns) {
    const match = decoded.match(pattern);
    if (match) {
      let url = match[0];
      // Normalize various paths to /in/
      url = url.replace("/comm/in/", "/in/");
      // Extract /in/slug from longer paths
      const inMatch = url.match(/linkedin\.com\/(.*\/)?in\/([a-zA-Z0-9\-_%\.~]+)/i);
      if (inMatch) {
        url = `https://www.linkedin.com/in/${inMatch[2]}`;
      }
      // Remove tracking parameters
      url = url.split("?")[0];
      // Remove trailing slashes
      url = url.replace(/\/+$/, "");
      return url;
    }
  }

  // Debug: log any linkedin.com URLs found that we didn't match
  const anyLinkedInUrl = decoded.match(/https?:\/\/[a-z0-9\-]*\.?linkedin\.com\/[^\s"'<>]{5,80}/gi);
  if (anyLinkedInUrl) {
    const unique = [...new Set(anyLinkedInUrl.slice(0, 5))];
    console.log(`LinkedIn URLs found but not matched as profile: ${JSON.stringify(unique)}`);
  }

  return null;
}

function extractNameFromSubject(subject: string): string | null {
  // LinkedIn subject: "FirstName LastName accepted your invitation"
  // or "FirstName LastName aceitou seu convite" (Portuguese)
  const patterns = [
    /^(.+?)\s+accepted your invitation/i,
    /^(.+?)\s+aceitou seu convite/i,
    /^(.+?)\s+a accepté votre invitation/i,
    /^(.+?)\s+ha aceptado tu invitación/i,
  ];
  for (const pattern of patterns) {
    const match = subject.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function findPartByMimeType(parts: any[], mimeType: string): string | null {
  for (const part of parts) {
    if (part.mimeType === mimeType && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
    // Recurse into nested multipart structures
    if (part.parts) {
      const found = findPartByMimeType(part.parts, mimeType);
      if (found) return found;
    }
  }
  return null;
}

function getMessageBody(msg: GmailMessageDetail): string {
  if (msg.payload.parts) {
    // Try HTML first, then plain text, recursively
    const html = findPartByMimeType(msg.payload.parts, "text/html");
    if (html) return html;
    const plain = findPartByMimeType(msg.payload.parts, "text/plain");
    if (plain) return plain;
  }
  if (msg.payload.body?.data) {
    return decodeBase64Url(msg.payload.body.data);
  }
  return msg.snippet || "";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not configured");
    if (!GOOGLE_CLIENT_SECRET) throw new Error("GOOGLE_CLIENT_SECRET is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate user
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userError || !user) throw new Error("Unauthorized");

    const { since_date } = await req.json();
    if (!since_date) throw new Error("since_date is required (YYYY-MM-DD)");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get stored refresh token
    const { data: connection } = await supabase
      .from("google_connections")
      .select("google_refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!connection?.google_refresh_token) {
      throw new Error("Gmail not connected. Please connect Gmail first.");
    }

    // Get fresh access token
    const accessToken = await getAccessToken(connection.google_refresh_token);

    // Search Gmail for LinkedIn invitation accepted emails
    const sinceEpoch = Math.floor(new Date(since_date).getTime() / 1000);
    const query = `from:invitations@linkedin.com subject:"accepted your invitation" after:${sinceEpoch}`;

    console.log("Gmail search query:", query);

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=100`;
    const searchResponse = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error("Gmail search failed:", searchResponse.status, errorText);
      throw new Error(`Gmail API error [${searchResponse.status}]: ${errorText}`);
    }

    const searchData = await searchResponse.json();
    const messages: GmailMessage[] = searchData.messages || [];

    console.log(`Found ${messages.length} LinkedIn invitation emails`);

    // Get existing email_message_ids to avoid duplicates
    const { data: existingEvents } = await supabase
      .from("linkedin_events")
      .select("email_message_id")
      .eq("user_id", user.id)
      .not("email_message_id", "is", null);

    const existingMessageIds = new Set(
      (existingEvents || []).map((e) => e.email_message_id)
    );

    let newCount = 0;
    let skippedCount = 0;

    // Process each message
    for (const msg of messages) {
      if (existingMessageIds.has(msg.id)) {
        skippedCount++;
        continue;
      }

      // Fetch full message
      const msgUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`;
      const msgResponse = await fetch(msgUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!msgResponse.ok) {
        console.error(`Failed to fetch message ${msg.id}`);
        continue;
      }

      const msgDetail: GmailMessageDetail = await msgResponse.json();
      const subject = msgDetail.payload.headers.find(
        (h) => h.name.toLowerCase() === "subject"
      )?.value || "";

      const name = extractNameFromSubject(subject);
      if (!name) {
        console.log(`Could not extract name from subject: "${subject}"`);
        continue;
      }

      const body = getMessageBody(msgDetail);
      const linkedinUrl = extractLinkedInUrl(body);
      const detectedAt = new Date(parseInt(msgDetail.internalDate)).toISOString();

      if (!linkedinUrl) {
        console.log(`No LinkedIn URL found for "${name}" (msg ${msg.id}), body length: ${body.length}`);
      }

      // Check if this LinkedIn URL already exists for this user (avoid duplicates by URL)
      if (linkedinUrl) {
        const { data: urlExisting } = await supabase
          .from("linkedin_events")
          .select("id")
          .eq("user_id", user.id)
          .eq("linkedin_url", linkedinUrl)
          .maybeSingle();

        if (urlExisting) {
          skippedCount++;
          continue;
        }
      }

      // Insert new event
      const { error: insertError } = await supabase.from("linkedin_events").insert({
        user_id: user.id,
        name,
        linkedin_url: linkedinUrl,
        email_message_id: msg.id,
        detected_at: detectedAt,
        source: "gmail",
        status: "NEEDS_SNAPSHOT",
        dm_status: "NEEDS_SNAPSHOT",
      });

      if (insertError) {
        console.error(`Failed to insert event for ${name}:`, insertError);
      } else {
        newCount++;
      }
    }

    console.log(`Scan complete: ${newCount} new, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        total_found: messages.length,
        new_connections: newCount,
        skipped: skippedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("scan-gmail error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
