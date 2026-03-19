import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Lead {
  id: string;
  title?: string | null;
  industry?: string | null;
  company?: string | null;
  location?: string | null;
  source?: string | null;
  profile_headline?: string | null;
  profile_current_title?: string | null;
  profile_current_company?: string | null;
  profile_previous_title?: string | null;
  profile_previous_company?: string | null;
  profile_about?: string | null;
  profile_education?: string | null;
  full_name?: string | null;
  error_message?: string | null;
}

interface Campaign {
  name: string;
  campaign_objective: string;
  icp_description: string | null;
  icp_titles: string[] | null;
  icp_industries: string[] | null;
  pain_points: string[] | null;
  value_proposition: string | null;
}

async function checkLeadsWithAI(leads: Lead[], campaign: Campaign, verticalName: string | null): Promise<{ id: string; pass: boolean; reason: string }[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const model = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20240620";
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  // Build lead summaries for the prompt
  const leadSummaries = leads.map((l, i) => {
    const parts = [`[${i}] ID: ${l.id}`];
    if (l.full_name) parts.push(`Name: ${l.full_name}`);
    if (l.profile_headline) parts.push(`Headline: ${l.profile_headline}`);
    if (l.profile_current_title) parts.push(`Current Title: ${l.profile_current_title}`);
    if (l.profile_current_company) parts.push(`Current Company: ${l.profile_current_company}`);
    if (l.profile_previous_title) parts.push(`Previous Title: ${l.profile_previous_title}`);
    if (l.profile_previous_company) parts.push(`Previous Company: ${l.profile_previous_company}`);
    if (l.title) parts.push(`CSV Title: ${l.title}`);
    if (l.company) parts.push(`CSV Company: ${l.company}`);
    if (l.industry) parts.push(`Industry: ${l.industry}`);
    if (l.profile_about) parts.push(`About: ${l.profile_about.substring(0, 300)}`);
    if (l.profile_education) parts.push(`Education: ${l.profile_education.substring(0, 200)}`);
    if (l.location) parts.push(`Location: ${l.location}`);
    return parts.join("\n");
  }).join("\n---\n");

  const verticalContext = verticalName ? `Target Vertical: ${verticalName}` : "";
  const icpTitlesHint = campaign.icp_titles?.length 
    ? `Example target titles (NOT exhaustive — use as guidance): ${campaign.icp_titles.join(", ")}` 
    : "";
  const painPointsContext = campaign.pain_points?.length 
    ? `Pain points we solve: ${campaign.pain_points.join("; ")}` 
    : "";

  const systemPrompt = `You are an ICP (Ideal Customer Profile) qualification analyst. Your job is to determine if LinkedIn profiles belong to the target market for a B2B campaign.

CAMPAIGN CONTEXT:
- Campaign: ${campaign.name}
- ICP Description: ${campaign.icp_description || "Not specified"}
${verticalContext}
${icpTitlesHint}
${painPointsContext}
- Value Proposition: ${campaign.value_proposition || "Not specified"}

QUALIFICATION RULES — COMPANY-FIRST APPROACH:
1. The PRIMARY filter is the lead's COMPANY/EMPLOYER, NOT their job title. We already filtered by title — what we need YOU to verify is whether the company they work at is relevant to the Target Vertical described above.
2. PASS if the company operates within or closely adjacent to the Target Vertical. Be BROAD and INCLUSIVE about what counts as related to "${verticalName || campaign.icp_description || 'the target vertical'}".
3. REJECT if the company is clearly OUTSIDE the vertical. For example, if the Target Vertical is about medical practices, reject someone working at a hotel chain or car manufacturer even if they have a healthcare-related title. The company must be in the vertical's industry.
4. When the company name is ambiguous or you can't determine the industry from the available data, PASS (benefit of the doubt).
5. Solo practitioners, freelancers, or self-employed professionals in the vertical should PASS.
6. Do NOT reject solely because the job title is a weak match. The company fit is the deciding factor.
7. Do NOT be overly restrictive — if there's a reasonable chance the company is related to the vertical, PASS them.

RESPOND with a JSON array. Each element: {"index": <number>, "pass": <boolean>, "reason": "<brief 1-line reason>"}
Only output the JSON array, nothing else.`;

  const aiUrl = "https://api.anthropic.com/v1/messages";
  console.log("Calling Anthropic:", aiUrl, "with model", model, "batch size:", leads.length);
  const response = await fetch(aiUrl, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      temperature: 0.1,
      system: systemPrompt,
      messages: [
        { role: "user", content: `Evaluate these ${leads.length} leads:\n\n${leadSummaries}` },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AI API error:", response.status, errText, "URL:", aiUrl);
    throw new Error(`AI API error: ${response.status} - ${errText.substring(0, 200)}`);
  }
  console.log("AI response OK for batch of", leads.length);

  const data = await response.json();
  const contentBlocks = Array.isArray(data.content) ? data.content : [];
  const content = contentBlocks
    .filter((b: any) => b && b.type === "text")
    .map((b: any) => b.text || "")
    .join("")
    .trim();
  
  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
  }
  if (!jsonStr.startsWith("[")) {
    const start = jsonStr.indexOf("[");
    const end = jsonStr.lastIndexOf("]");
    if (start !== -1 && end !== -1) {
      jsonStr = jsonStr.slice(start, end + 1);
    }
  }
  
  const results: { index: number; pass: boolean; reason: string }[] = JSON.parse(jsonStr);
  
  return results.map(r => ({
    id: leads[r.index].id,
    pass: r.pass,
    reason: r.reason,
  }));
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Support both user-auth and service-role (cron) calls
    const body = await req.json();
    const { campaign_profile_id, lead_ids, user_id: cronUserId } = body;
    if (!campaign_profile_id) throw new Error("campaign_profile_id is required");

    let userId: string;
    const internalKey = req.headers.get("x-internal-key");
    if (internalKey === supabaseKey && cronUserId) {
      // Called from enrichment-cron with service role
      userId = cronUserId;
      console.log("ICP check called from cron for user:", userId);
    } else {
      // Called from frontend with user auth
      const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
      if (userError || !user) throw new Error("Unauthorized");
      userId = user.id;
    }

    // Get campaign ICP criteria + vertical
    const { data: campaign, error: campError } = await supabase
      .from("campaign_profiles")
      .select("name, campaign_objective, icp_description, icp_titles, icp_industries, pain_points, value_proposition, vertical_id")
      .eq("id", campaign_profile_id)
      .eq("user_id", userId)
      .single();

    if (campError || !campaign) throw new Error("Campaign not found");

    // Get vertical name if available
    let verticalName: string | null = null;
    if (campaign.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("name, description")
        .eq("id", campaign.vertical_id)
        .single();
      if (vertical) verticalName = `${vertical.name}${vertical.description ? ` — ${vertical.description}` : ""}`;
    }

    // Get leads to check
    let query = supabase
      .from("campaign_leads")
      .select("id, title, industry, company, location, source, full_name, profile_headline, profile_current_title, profile_current_company, profile_previous_title, profile_previous_company, profile_about, profile_education, error_message")
      .eq("campaign_profile_id", campaign_profile_id)
      .is("error_message", null) // Skip leads with errors
      .not("profile_enriched_at", "is", null); // Only check enriched leads

    if (lead_ids && lead_ids.length > 0) {
      query = query.in("id", lead_ids);
    } else {
      query = query.is("icp_checked_at", null).limit(60); // Max 60 per call to avoid timeout
    }

    const { data: leads, error: leadsError } = await query;
    if (leadsError) throw leadsError;
    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ message: "No leads to check", passed: 0, rejected: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();
    const allPassed: string[] = [];
    const allRejected: { id: string; reason: string }[] = [];

    // Process in batches of 15 for AI
    const BATCH_SIZE = 15;
    for (let i = 0; i < leads.length; i += BATCH_SIZE) {
      const batch = leads.slice(i, i + BATCH_SIZE);
      try {
        const results = await checkLeadsWithAI(batch, campaign, verticalName);
        for (const r of results) {
          if (r.pass) {
            allPassed.push(r.id);
          } else {
            allRejected.push({ id: r.id, reason: r.reason });
          }
        }
      } catch (aiError) {
        console.error(`AI batch error at offset ${i}:`, aiError);
        // On AI failure, pass all leads in this batch (benefit of the doubt)
        for (const lead of batch) {
          allPassed.push(lead.id);
        }
      }
    }

    // Update passed leads
    if (allPassed.length > 0) {
      await supabase
        .from("campaign_leads")
        .update({
          status: "ready",
          icp_match: true,
          icp_checked_at: now,
          icp_match_reason: "Matches target vertical/industry profile",
          updated_at: now,
        } as any)
        .in("id", allPassed);
    }

    // Update rejected leads
    if (allRejected.length > 0) {
      for (const r of allRejected) {
        await supabase
          .from("campaign_leads")
          .update({
            status: "icp_rejected",
            icp_match: false,
            icp_checked_at: now,
            icp_match_reason: r.reason,
            updated_at: now,
          } as any)
          .eq("id", r.id);
      }
    }

    // Message generation is now handled by generate-dm-cron (runs every 2 minutes)
    // This avoids timeout issues when processing large batches of ICP-matched leads
    console.log(`${allPassed.length} leads marked as ICP-matched, messages will be generated by cron`);

    console.log(`ICP check done: ${allPassed.length} passed, ${allRejected.length} rejected out of ${leads.length}`);

    return new Response(JSON.stringify({
      success: true,
      total_checked: leads.length,
      passed: allPassed.length,
      rejected: allRejected.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("icp-check error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
