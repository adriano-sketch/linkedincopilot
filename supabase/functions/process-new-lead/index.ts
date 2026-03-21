import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildMessagePrompts } from "../_shared/ai-prompts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function validateICP(lead: any, campaign: any): { pass: boolean; reasons: string[] } {
  const failures: string[] = [];
  const mismatches: string[] = [];
  let hasChecks = false;

  if (campaign.icp_job_titles?.length > 0 || campaign.icp_titles?.length > 0) {
    hasChecks = true;
    const titles = [...(campaign.icp_job_titles || []), ...(campaign.icp_titles || [])];
    const match = titles.some((t: string) =>
      (lead.title || "").toLowerCase().includes(t.toLowerCase())
    );
    if (!match) mismatches.push(`Title "${lead.title || "N/A"}" doesn't match ICP titles`);
  }

  if (campaign.icp_industries?.length > 0) {
    hasChecks = true;
    const match = campaign.icp_industries.some((i: string) =>
      (lead.industry || "").toLowerCase().includes(i.toLowerCase())
    );
    if (!match) mismatches.push(`Industry "${lead.industry || "N/A"}" doesn't match ICP industries`);
  }

  if (campaign.icp_locations?.length > 0) {
    hasChecks = true;
    const match = campaign.icp_locations.some((l: string) =>
      (lead.location || "").toLowerCase().includes(l.toLowerCase())
    );
    if (!match) mismatches.push(`Location "${lead.location || "N/A"}" doesn't match ICP locations`);
  }

  if (campaign.icp_company_size_min || campaign.icp_company_size_max) {
    hasChecks = true;
    // We don't have company size on leads typically, so skip if not available
  }

  if (campaign.icp_exclude_keywords?.length > 0) {
    const text = `${lead.title || ""} ${lead.company || ""}`.toLowerCase();
    const excluded = campaign.icp_exclude_keywords.some((kw: string) =>
      text.includes(kw.toLowerCase())
    );
    if (excluded) {
      hasChecks = true;
      failures.push("Contains excluded keyword");
    }
  }

  if (!hasChecks) return { pass: true, reasons: [] };
  if (failures.length > 0) return { pass: false, reasons: failures };
  if (mismatches.length >= 2) return { pass: false, reasons: mismatches };
  return { pass: true, reasons: [] };
}

// Prompt building lives in _shared/ai-prompts.ts

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const SCRAPIN_API_KEY = Deno.env.get("SCRAPIN_API_KEY");
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") || "claude-3-5-sonnet-20240620";

    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) throw new Error("Unauthorized");

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { lead_ids, campaign_profile_id } = await req.json();
    if (!campaign_profile_id) throw new Error("campaign_profile_id required");
    if (!lead_ids || lead_ids.length === 0) throw new Error("lead_ids required");

    // Get campaign
    const { data: campaign } = await supabase
      .from("campaign_profiles")
      .select("*")
      .eq("id", campaign_profile_id)
      .eq("user_id", user.id)
      .single();

    if (!campaign) throw new Error("Campaign not found");

    // Fetch vertical context if available (for better personalization)
    let verticalContext: any = null;
    if (campaign.vertical_id) {
      const { data: vertical } = await supabase
        .from("verticals")
        .select("name, primary_compliance, fear_trigger, default_pain_points")
        .eq("id", campaign.vertical_id)
        .single();
      verticalContext = vertical;
    }

    // Get sender profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("sender_name, sender_title, company_name, company_description, value_proposition")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profile) throw new Error("Profile not found");

    // Get leads
    const { data: leads } = await supabase
      .from("campaign_leads")
      .select("*")
      .in("id", lead_ids)
      .eq("user_id", user.id);

    if (!leads || leads.length === 0) throw new Error("No leads found");

    const results = { processed: 0, icp_rejected: 0, enriched: 0, messages_generated: 0, errors: [] as string[] };

    // Lead credit accounting: count only ICP-passed leads
    const { data: settings } = await supabase
      .from("user_settings")
      .select("leads_used_this_cycle, max_leads_per_cycle")
      .eq("user_id", user.id)
      .maybeSingle();
    const currentUsed = settings?.leads_used_this_cycle || 0;
    const maxLeads = settings?.max_leads_per_cycle || 0;
    let remainingCredits = maxLeads > 0 ? Math.max(0, maxLeads - currentUsed) : 0;
    let creditsToAdd = 0;

    for (const lead of leads) {
      try {
        if (lead.profile_quality_status === "pending") {
          results.errors.push(`${lead.first_name || "Unknown"}: quality scan pending`);
          continue;
        }
        if (lead.profile_quality_status === "ghost") {
          await supabase.from("campaign_leads")
            .update({
              status: "skipped",
              profile_enriched_at: new Date().toISOString(),
              error_message: "Ghost profile (LinkedIn)",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);
          results.processed++;
          continue;
        }

        // Step 0: ICP Validation
        const icpResult = validateICP(lead, campaign);
        if (!icpResult.pass) {
          await supabase.from("campaign_leads")
            .update({
              status: "icp_rejected",
              icp_match: false,
              icp_match_reason: icpResult.reasons.join("; "),
              icp_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action: "icp_rejected",
            details: { reasons: icpResult.reasons },
          });

          results.icp_rejected++;
          continue;
        }

        if (remainingCredits <= 0) {
          await supabase.from("campaign_leads")
            .update({
              status: "icp_rejected",
              icp_match: false,
              icp_match_reason: "Lead credits exhausted",
              icp_checked_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);
          results.icp_rejected++;
          continue;
        }

        await supabase.from("campaign_leads")
          .update({
            icp_match: true,
            icp_checked_at: new Date().toISOString(),
            status: "enriching",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", lead.id);

        remainingCredits -= 1;
        creditsToAdd += 1;

        // Step 1: Enrich via Scrapin.io
        let profileData: any = null;
        if (SCRAPIN_API_KEY && lead.linkedin_url) {
          try {
            const scrapinUrl = `https://api.scrapin.io/v1/enrichment/profile?apikey=${SCRAPIN_API_KEY}&linkedInUrl=${encodeURIComponent(lead.linkedin_url)}`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 25000);
            const scrapinResponse = await fetch(scrapinUrl, { signal: controller.signal });
            clearTimeout(timeout);
            if (scrapinResponse.ok) {
              const payload = await scrapinResponse.json();
              if (payload?.success && payload?.person) {
                profileData = payload.person;
              }
            } else {
              await scrapinResponse.text();
            }
          } catch (e) {
            console.error(`Scrapin enrichment failed for ${lead.id}:`, e);
          }
        }

        // Save enrichment data
        const enrichUpdate: any = {
          updated_at: new Date().toISOString(),
        };

        if (profileData) {
          enrichUpdate.profile_snapshot = profileData;
          enrichUpdate.profile_headline = profileData.headline || null;
          enrichUpdate.profile_about = profileData.summary || profileData.about || null;
          const positions = profileData.positionHistory || profileData.positions || [];
          enrichUpdate.profile_current_title = positions?.[0]?.title || null;
          enrichUpdate.profile_current_company = positions?.[0]?.companyName || positions?.[0]?.company || null;
          enrichUpdate.profile_previous_title = positions?.[1]?.title || null;
          enrichUpdate.profile_previous_company = positions?.[1]?.companyName || positions?.[1]?.company || null;
          const educations = profileData.educationHistory || profileData.educations || [];
          enrichUpdate.profile_education = Array.isArray(educations)
            ? educations.map((e: any) => `${e.degreeName || e.degree || ""} ${e.schoolName || e.school || ""}`).join("; ").trim() || null
            : null;
          const skills = profileData.skills || [];
          enrichUpdate.profile_skills = Array.isArray(skills)
            ? skills.map((s: any) => typeof s === "string" ? s : s.name || "").filter(Boolean)
            : null;
          enrichUpdate.profile_enriched_at = new Date().toISOString();
          enrichUpdate.status = "enriched";

          // Also update name fields if missing
          const fullName = profileData.fullName || `${profileData.firstName || ""} ${profileData.lastName || ""}`.trim();
          if (!lead.full_name && fullName) {
            enrichUpdate.full_name = fullName;
            enrichUpdate.first_name = profileData.firstName || fullName.split(" ")[0] || null;
            enrichUpdate.last_name = profileData.lastName || null;
          }

          results.enriched++;
        } else {
          enrichUpdate.status = "enriched"; // Continue even without enrichment
        }

        await supabase.from("campaign_leads")
          .update(enrichUpdate)
          .eq("id", lead.id);

        // Step 2: Generate messages with AI
        if (!ANTHROPIC_API_KEY) {
          await supabase.from("campaign_leads")
            .update({ status: "enriched", updated_at: new Date().toISOString() } as any)
            .eq("id", lead.id);
          results.processed++;
          continue;
        }

        await supabase.from("campaign_leads")
          .update({ status: "generating_messages", updated_at: new Date().toISOString() } as any)
          .eq("id", lead.id);

        const fullName = lead.full_name || `${lead.first_name || ""} ${lead.last_name || ""}`.trim();

        const { systemPrompt, userPrompt } = buildMessagePrompts({
          sender: {
            name: profile.sender_name || "Unknown",
            title: profile.sender_title || "",
            company: profile.company_name || "",
            companyDescription: profile.company_description || "",
          },
          campaign: {
            name: campaign.name,
            objective: campaign.campaign_objective || "start_conversation",
            tone: campaign.dm_tone || "professional_warm",
            angle: campaign.campaign_angle,
            painPoints: Array.isArray(campaign.pain_points) ? campaign.pain_points : [],
            valueProposition: campaign.value_proposition || profile.value_proposition || "",
            proofPoints: campaign.proof_points || "",
            icpDescription: campaign.icp_description || "",
            icpTitles: Array.isArray(campaign.icp_titles) ? campaign.icp_titles : [],
            dmExample: campaign.dm_example || "",
            messageLanguage: campaign.message_language || "English",
          },
          lead: {
            fullName: fullName,
            firstName: lead.first_name || "",
            lastName: lead.last_name || "",
            title: enrichUpdate.profile_current_title || lead.title || "N/A",
            company: enrichUpdate.profile_current_company || lead.company || "N/A",
            headline: enrichUpdate.profile_headline || lead.profile_headline || "N/A",
            about: enrichUpdate.profile_about || lead.profile_about || "",
            industry: lead.industry || "N/A",
            location: lead.location || "N/A",
            currentTitle: enrichUpdate.profile_current_title || lead.profile_current_title || lead.title || "N/A",
            currentCompany: enrichUpdate.profile_current_company || lead.profile_current_company || lead.company || "N/A",
            previousTitle: enrichUpdate.profile_previous_title || lead.profile_previous_title || "N/A",
            previousCompany: enrichUpdate.profile_previous_company || lead.profile_previous_company || "N/A",
            educationSchool: lead.profile_education || "N/A",
            educationDegree: "",
            educationField: "",
            skills: Array.isArray(enrichUpdate.profile_skills) ? enrichUpdate.profile_skills.join(", ") : (Array.isArray(lead.profile_skills) ? lead.profile_skills.join(", ") : "N/A"),
            fullProfileText: `${enrichUpdate.profile_headline || ""} | ${enrichUpdate.profile_about || ""} | ${enrichUpdate.profile_current_title || ""} | ${enrichUpdate.profile_current_company || ""}`.trim(),
          },
          vertical: verticalContext,
        });

        try {
          const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": ANTHROPIC_API_KEY,
              "anthropic-version": "2023-06-01",
              "content-type": "application/json",
            },
            body: JSON.stringify({
              model: ANTHROPIC_MODEL,
              max_tokens: 700,
              temperature: 0.75,
              system: systemPrompt,
              messages: [
                { role: "user", content: userPrompt },
              ],
            }),
          });

          if (!aiResponse.ok) {
            const errText = await aiResponse.text();
            throw new Error(`Anthropic API error: ${aiResponse.status} ${errText}`);
          }

          const aiData = await aiResponse.json();
          const contentBlocks = Array.isArray(aiData.content) ? aiData.content : [];
          const content = contentBlocks
            .filter((b: any) => b && b.type === "text")
            .map((b: any) => b.text || "")
            .join("")
            .trim();

          // Parse JSON from response
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
          const messages = JSON.parse(jsonStr);

          // Validate lengths
          let connectionNote = messages.connection_note || "";
          let customDm = messages.custom_dm || "";
          let customFollowup = messages.custom_followup || "";

          if (connectionNote.length > 200) connectionNote = connectionNote.substring(0, 197) + "...";
          if (customDm.length > 350) customDm = customDm.substring(0, 347) + "...";
          if (customFollowup.length > 280) customFollowup = customFollowup.substring(0, 277) + "...";

          await supabase.from("campaign_leads")
            .update({
              connection_note: connectionNote,
              custom_dm: customDm,
              custom_followup: customFollowup,
              dm_text: customDm, // Keep dm_text for backward compat
              follow_up_text: customFollowup,
              messages_generated_at: new Date().toISOString(),
              status: "pending_approval",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action: "messages_generated",
            details: { connection_note_length: connectionNote.length, dm_length: customDm.length },
          });

          results.messages_generated++;
        } catch (aiError) {
          console.error(`AI generation failed for ${lead.id}:`, aiError);
          await supabase.from("campaign_leads")
            .update({
              status: "enriched",
              error_message: aiError instanceof Error ? aiError.message : "AI generation failed",
              updated_at: new Date().toISOString(),
            } as any)
            .eq("id", lead.id);
          results.errors.push(`${lead.first_name || "Unknown"}: AI generation failed`);
        }

        results.processed++;
      } catch (leadError) {
        console.error(`Processing failed for lead ${lead.id}:`, leadError);
        results.errors.push(`${lead.first_name || "Unknown"}: ${leadError instanceof Error ? leadError.message : "Unknown"}`);

        await supabase.from("campaign_leads")
          .update({
            status: "error",
            error_message: leadError instanceof Error ? leadError.message : "Processing failed",
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", lead.id);
      }
    }

    // Send notification email if we generated messages
    if (results.messages_generated > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      fetch(`${supabaseUrl}/functions/v1/notify-approval-ready`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          campaign_profile_id,
          type: "connection_notes_ready",
        }),
      }).catch(err => console.error("notify-approval-ready error:", err));
    }

    if (creditsToAdd > 0) {
      await supabase
        .from("user_settings")
        .update({ leads_used_this_cycle: currentUsed + creditsToAdd })
        .eq("user_id", user.id);
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("process-new-lead error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
