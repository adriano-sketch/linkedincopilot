import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMessagePrompts } from "../_shared/ai-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Shared prompt + helpers live in _shared/ai-prompts.ts

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const requestBody = await req.json();
    const { user_id, campaign_lead_id } = requestBody;
    if (!user_id) throw new Error("user_id required");
    if (!campaign_lead_id) throw new Error("campaign_lead_id required");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20240620";
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch lead with enrichment data from Scrapin
    const { data: lead, error: leadError } = await supabase
      .from("campaign_leads")
      .select("*")
      .eq("id", campaign_lead_id)
      .single();

    if (leadError || !lead) throw new Error("Campaign lead not found");

    const leadName = lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown";
    const leadTitle = lead.title || lead.profile_current_title || "N/A";
    const leadCompany = lead.company || lead.profile_current_company || "N/A";
    const leadHeadline = lead.profile_headline || leadTitle;
    const leadAbout = lead.profile_about || "N/A";
    const currentPositionTitle = lead.profile_current_title || leadTitle;
    const currentPositionCompany = lead.profile_current_company || leadCompany;
    const currentPositionDescription = "";
    const previousPositionTitle = lead.profile_previous_title || "N/A";
    const previousPositionCompany = lead.profile_previous_company || "N/A";
    const educationSchool = lead.profile_education || "N/A";
    const skillsList = Array.isArray(lead.profile_skills) ? lead.profile_skills.slice(0, 5).join(", ") : "N/A";
    const fullProfileText = [leadHeadline, leadAbout, currentPositionTitle, currentPositionCompany].filter(Boolean).join(" | ");
    const campaignProfileId = lead.campaign_profile_id;

    console.log(`Generating messages for lead ${campaign_lead_id}: ${leadName} at ${leadCompany}`);

    const { data: job } = await supabase
      .from("jobs")
      .insert({ user_id, type: "generate_dm", status: "running" })
      .select("id")
      .single();

    // Get master profile
    const { data: masterProfile } = await supabase
      .from("profiles")
      .select("sender_name, sender_title, company_name, company_description")
      .eq("user_id", user_id)
      .maybeSingle();

    if (!masterProfile) throw new Error("User profile not found");

    // Get campaign profile — prefer lead/event's campaign, fallback to default
    let campaignProfile: any = null;

    if (campaignProfileId) {
      const { data } = await supabase
        .from("campaign_profiles")
        .select("*")
        .eq("id", campaignProfileId)
        .single();
      campaignProfile = data;
    }

    if (!campaignProfile) {
      const { data } = await supabase
        .from("campaign_profiles")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      campaignProfile = data;
    }

    if (!campaignProfile) {
      const { data: oldProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();
      
      if (!oldProfile) throw new Error("Complete your campaign setup first");
      
      campaignProfile = {
        name: "Default",
        campaign_objective: oldProfile.campaign_objective || "start_conversation",
        value_proposition: oldProfile.value_proposition || oldProfile.offer_focus || "",
        proof_points: oldProfile.proof_points || "",
        icp_description: oldProfile.icp_description || oldProfile.icp || "",
        icp_titles: oldProfile.icp_titles || [],
        pain_points: oldProfile.pain_points || [],
        dm_tone: oldProfile.dm_tone || "professional_warm",
        dm_example: oldProfile.dm_example || "",
      };
    }

    // Fetch vertical context if available
    let verticalContext: any = null;
    if (campaignProfile.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("name, primary_compliance, fear_trigger, default_pain_points")
        .eq("id", campaignProfile.vertical_id)
        .single();
      verticalContext = vertical;
    }

    // Parse structured snapshot data from profile_snapshot on lead
    const snapshot = (lead.profile_snapshot && typeof lead.profile_snapshot === "object") ? lead.profile_snapshot as Record<string, any> : {};
    const experience = snapshot.experience || snapshot.positions;
    const currentPosition = Array.isArray(experience) ? experience[0] : null;
    const previousPosition = Array.isArray(experience) ? experience[1] : null;
    const education = snapshot.education || snapshot.educations;
    const firstEducation = Array.isArray(education) ? education[0] : (typeof education === "object" && education ? education : null);
    const skills = snapshot.skills;
    const educationDegree = firstEducation?.degreeName || firstEducation?.degree || "N/A";
    const educationField = firstEducation?.fieldOfStudy || firstEducation?.field || "N/A";

    const { systemPrompt, userPrompt } = buildMessagePrompts({
      sender: {
        name: masterProfile.sender_name || "Unknown",
        title: masterProfile.sender_title || "",
        company: masterProfile.company_name || "",
        companyDescription: masterProfile.company_description || "",
      },
      campaign: {
        name: campaignProfile.name,
        objective: campaignProfile.campaign_objective,
        tone: campaignProfile.dm_tone,
        angle: campaignProfile.campaign_angle,
        painPoints: Array.isArray(campaignProfile.pain_points) ? campaignProfile.pain_points : [],
        valueProposition: campaignProfile.value_proposition || "",
        proofPoints: campaignProfile.proof_points || "",
        icpDescription: campaignProfile.icp_description || "",
        icpTitles: Array.isArray(campaignProfile.icp_titles) ? campaignProfile.icp_titles : [],
        dmExample: campaignProfile.dm_example || "",
        messageLanguage: campaignProfile.message_language || "English",
      },
      lead: {
        fullName: leadName,
        title: leadTitle,
        company: leadCompany,
        headline: leadHeadline,
        about: leadAbout,
        currentTitle: currentPositionTitle,
        currentCompany: currentPositionCompany,
        currentDescription: currentPositionDescription,
        previousTitle: previousPositionTitle,
        previousCompany: previousPositionCompany,
        educationSchool,
        educationDegree,
        educationField,
        skills: skillsList,
        industry: lead.industry || "N/A",
        location: lead.location || "N/A",
        fullProfileText,
      },
      vertical: verticalContext,
    });


    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 800,
        temperature: 0.7,
        system: systemPrompt,
        messages: [
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic error:", response.status, errorText);
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const aiData = await response.json();
    const contentBlocks = Array.isArray(aiData.content) ? aiData.content : [];
    const content = contentBlocks
      .filter((b: any) => b && b.type === "text")
      .map((b: any) => b.text || "")
      .join("")
      .trim();
    if (!content) throw new Error("No text in AI response");

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    }
    if (!jsonStr.startsWith("{")) {
      const start = jsonStr.indexOf("{");
      const end = jsonStr.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        jsonStr = jsonStr.slice(start, end + 1);
      }
    }
    if (!jsonStr.startsWith("{")) throw new Error("No JSON in AI response");
    const args = JSON.parse(jsonStr);

    // Validation — log warnings but don't block
    const noteLen = (args.connection_note || "").length;
    const dmLen = (args.custom_dm || "").length;
    const fuLen = (args.custom_followup || "").length;
    if (noteLen > 200) console.warn(`connection_note over limit: ${noteLen} chars`);
    if (dmLen > 350) console.warn(`custom_dm over limit: ${dmLen} chars`);
    if (fuLen > 280) console.warn(`custom_followup over limit: ${fuLen} chars`);

    // Save to generated_messages
    await supabase.from("generated_messages").insert({
      user_id,
      connection_note: args.connection_note,
      dm1: args.custom_dm,
      followup1: args.custom_followup,
      reasoning_short: `${args.personalization_hook || ""} | ${args.reasoning || ""}`.substring(0, 500),
    });

    if (job) {
      await supabase.from("jobs").update({ status: "success" }).eq("id", job.id);
    }

    // Update campaign_lead with generated messages
    await supabase.from("campaign_leads")
      .update({
        connection_note: args.connection_note || null,
        custom_dm: args.custom_dm,
        dm_text: args.custom_dm,
        custom_followup: args.custom_followup || null,
        follow_up_text: args.custom_followup || null,
        dm_generated_at: new Date().toISOString(),
        messages_generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", campaign_lead_id);

    return new Response(JSON.stringify({
      success: true,
      connection_note: args.connection_note,
      dm1: args.custom_dm,
      followup1: args.custom_followup,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-dm error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
