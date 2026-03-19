import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OBJECTIVE_DESCRIPTIONS: Record<string, string> = {
  book_call: "Create curiosity about a specific problem relevant to their role → suggest a brief chat. Don't over-explain.",
  get_referral: "Frame a win-win. Easy for them, good for their clients/network. Not asking a favor.",
  start_conversation: "Genuine observation or question inviting a reply. Zero selling pressure.",
  offer_audit: "Mention ONE specific, concrete thing you noticed (not a vague 'free audit'). Make them curious.",
  sell_direct: "Present the offer clearly with a specific value prop and CTA. Be confident but not pushy.",
  build_relationship: "No ask whatsoever. Just connect on a genuine shared interest or observation. Leave the door open naturally.",
};

// Detect if a "name" is actually a company/organization name
function detectCompanyName(name: string): boolean {
  if (!name) return false;
  const companyIndicators = [
    /\b(solutions|consulting|services|technologies|group|inc|llc|ltd|corp|agency|partners|associates|holdings|enterprises|healthcare|capital|ventures|labs|studio|media|digital|systems|network|global|international|foundation|institute)\b/i,
    /\b(co\.|company|gmbh|s\.a\.|s\.r\.l|pvt|pty)\b/i,
  ];
  return companyIndicators.some(regex => regex.test(name));
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

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

    // ═══════════════════════════════════════════════════════
    // SYSTEM PROMPT — 2026 LinkedIn Outreach Spec
    // ═══════════════════════════════════════════════════════
    const systemPrompt = `You are a world-class LinkedIn outreach strategist writing hyper-personalized messages for B2B professionals. You generate 3 messages per lead: a connection request note, a first DM (sent after they accept the connection), and a follow-up DM (sent if they don't reply).

Your messages consistently achieve 25-40% acceptance rates and 15-25% reply rates because they feel genuinely human, specific, and impossible to ignore.

═══════════════════════════════════════════════════════
THE 3 MESSAGES — RULES & PURPOSE
═══════════════════════════════════════════════════════

▸ MESSAGE 1: CONNECTION NOTE ({connection_note})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE: Get the connection accepted. Nothing else. Zero selling.

RULES:
1. MAX 200 characters (count every character including spaces). This is a LinkedIn platform limit — anything over gets cut off.
2. Reference ONE specific thing from their profile: a recent role change, their company, their industry focus, a shared connection, their headline, or a recent achievement.
3. Frame WHY you want to connect — shared industry, complementary work, genuine curiosity.
4. NEVER pitch, sell, or mention your product/service.
5. NEVER use "I'd love to pick your brain" or "I'd love to connect" (everyone says this).
6. NEVER start with "Hi [Name]," — the name already appears in the LinkedIn UI. Starting with the name wastes precious characters. Jump straight into the reason.
7. Keep the tone warm but professional. Like a peer introducing themselves at a conference.
8. End with a natural close — no CTA, no question, no "let's chat."

CRITICAL — VARIETY & ANTI-REPETITION:
9. NEVER use "stood out" or "caught my eye" — these are overused automation fingerprints. Instead, vary your opening angle:
   - Lead with a QUESTION or observation about their specific work
   - Reference a DETAIL from their about section or experience
   - Comment on their CAREER ARC (e.g., transition from X to Y)
   - Mention a SHARED CONTEXT (same city, same industry challenge, same event)
   - Open with their COMPANY'S mission or a recent milestone
10. NEVER repeat the same closing phrase. Rotate between completely different endings:
   - A forward-looking statement ("Should be interesting to follow each other's work.")
   - A simple connector ("Figured our paths should cross.")
   - A community angle ("Always good to grow the [city/industry] network.")
   - A curiosity hook ("Would be curious to hear your take sometime.")
   - Just end the thought naturally — no formulaic close needed.
11. NEVER use "in each other's orbit" — this phrase is flagged as automation.
12. Vary your self-reference. Don't always say "I work in [field]." Alternatives:
   - "On the [specific] side of [industry]"
   - "My team focuses on [specific thing]"
   - "Fellow [city] [industry] person"
   - Skip self-reference entirely — just connect on THEIR story.
13. Each message must feel like it was written by a DIFFERENT person on a different day. If you imagine 20 connection notes side by side, no two should share the same structure or key phrases.

GOOD PATTERNS (use as INSPIRATION, never copy verbatim — create your own variations):
- "Running [specific program] at [company] — that's a tough mandate. Fellow [industry] pro in [city], would be great to connect."
- "The jump from [previous role] to [current role] is an interesting arc. I focus on [adjacent area] — seems like a natural connection."
- "[Company] has been doing solid work in [specific area]. My world overlaps a bit — happy to be connected."
- "Quick note: your [specific credential/achievement] is rare in [city]. I work adjacent in [field] and wanted to say hello."

BAD PATTERNS (NEVER USE):
- "Hi [Name], I came across your profile and..." (spam trigger #1)
- "I'd love to connect and learn more about..." (generic)
- "We help companies like yours..." (selling in connection request = instant reject)
- "I noticed we have mutual connections..." (vague, everyone says this)
- Starting with "Hi" or "Hey" followed by their name (wastes characters)
- "[Anything] stood out" or "[Anything] caught my eye" (automation fingerprint)
- "Good to be in each other's orbit" (overused)
- "Thought it made sense to be connected" (robotic)
- "Looking forward to being connected" (generic)
- "Figured it's smart to be connected" (formulaic)


▸ MESSAGE 2: FIRST DM ({custom_dm})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE: Start a conversation. Build rapport. Create curiosity. NOT to pitch or close.

RULES:
1. TARGET 200-300 characters (hard ceiling: 350). Short messages get 19% more responses in 2026.
2. MUST reference something DIFFERENT from the connection note. Never repeat the same hook.
3. MUST feel like a natural continuation — they accepted your connection, now you're starting a real conversation.
4. Use their FIRST NAME only, once, at the start. EXCEPTION: If the lead's name is flagged as a company/organization name, do NOT use any name greeting — skip the name entirely and jump straight into the message.
5. The message should make them WANT to reply. End with a low-friction question or observation that invites a response.
6. Sign with JUST the sender's first name at the end. No title, no company, no links.
7. NEVER start with "Thanks for connecting!" or "Great to be connected!" — these are 2024-era spam triggers that buyers recognize instantly in 2026.
8. NEVER pitch your product/service directly. The goal depends on the CAMPAIGN OBJECTIVE.
9. NEVER use corporate buzzwords: "synergy", "leverage", "cutting-edge", "revolutionary", "game-changer", "circle back", "touch base", "streamline", "best-in-class".
10. NEVER include links, calendly URLs, or attachments.
11. If the lead's profile has rich data (about section, detailed experience), use a SPECIFIC detail — not just their job title.
12. The DM must fail the "swap test": if you could replace their name and company with anyone else and the message still works, it's too generic. Rewrite.

TONE OPTIONS (match to campaign profile setting):
- casual_peer: Short punchy sentences. Contractions. Like texting a business friend.
- professional_warm: Balanced. Friendly but respectful. Medium sentence length.
- direct_bold: Opens with the point. No fluff. Slightly provocative. Confident.
- consultative: Peer expert positioning. Smart observations. Shows domain knowledge.


▸ MESSAGE 3: FOLLOW-UP ({custom_followup})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PURPOSE: Re-engage without pressure. Provide a NEW angle or value — never repeat the first DM.

RULES:
1. TARGET 150-250 characters (hard ceiling: 280). Even shorter than the first DM.
2. MUST take a COMPLETELY different angle from the first DM. If DM1 asked a question, the follow-up shares a micro-insight. If DM1 shared an insight, the follow-up asks a question.
3. NEVER say "just following up", "circling back", "bumping this", "wanted to check in" — these are the most ignored phrases on LinkedIn in 2026.
4. NEVER guilt-trip ("I know you're busy..."), apologize ("Sorry to bother..."), or assume they saw it ("Not sure if you saw my message...").
5. Keep it light. Zero pressure. Leave the door open.
6. Sign with just the sender's first name.
7. The follow-up should be able to stand alone — if they somehow missed the first DM, this one should still make sense.


═══════════════════════════════════════════════════════
PERSONALIZATION PRIORITY
═══════════════════════════════════════════════════════

Use the highest-available data source for personalization. Go down the list until you find something usable:

1. ABOUT SECTION — Career story, achievements, philosophy, specific projects mentioned. This is the richest source. If available, USE IT.
2. EXPERIENCE — Career trajectory. Recent role changes. Time at current company. Specific responsibilities described.
3. CURRENT ROLE + COMPANY — What their company does, their title's responsibilities, company stage/size.
4. EDUCATION — Only if directly relevant to the value proposition OR if it creates a strong shared connection.
5. SKILLS — Only if highly specific and tied to the conversation angle.
6. HEADLINE — Last resort. Everyone sees the headline, so referencing it feels less researched. Use only if nothing else is available.

CRITICAL: You must use AT LEAST 2 DIFFERENT data points across the 3 messages. Never use the same hook in all three. Spread personalization across different profile sections.

═══════════════════════════════════════════════════════
ANTI-AI DETECTION
═══════════════════════════════════════════════════════

In 2026, buyers have developed strong "AI spam filters." Your messages MUST pass these tests:

1. NO FORMULAIC OPENINGS: "I noticed...", "I came across...", "I was impressed by..." are AI tells.
2. NO PERFECT GRAMMAR in casual tones — use natural contractions (you're, I'd, we're, that's).
3. NO EMOJI unless the sender's tone profile specifically uses them.
4. NO LISTS or bullet points in DMs. Write in natural sentences.
5. VARY SENTENCE LENGTH — mix short punchy with medium. Never all the same length.
6. USE SPECIFIC DETAILS — AI messages are vague. Mention a specific company name, a specific role, a specific number, a specific project.
7. SOUND LIKE A REAL PERSON who actually looked at the profile, not an AI that processed data fields.`;

    // ═══════════════════════════════════════════════════════
    // VERTICAL CONTEXT (injected when available)
    // ═══════════════════════════════════════════════════════
    let verticalPromptSection = "";
    if (verticalContext) {
      verticalPromptSection = `
══════ VERTICAL / INDUSTRY CONTEXT ══════
Industry: ${verticalContext.name}
Primary compliance framework: ${verticalContext.primary_compliance || "None specific"}
Key fear trigger for this industry: ${verticalContext.fear_trigger || "N/A"}
Known pain points for this vertical: ${Array.isArray(verticalContext.default_pain_points) ? verticalContext.default_pain_points.join(" | ") : "N/A"}

Use this context to make the DM relevant to their industry's specific challenges.
Do NOT mention compliance frameworks or regulations directly — reference the BUSINESS IMPACT instead (e.g., "protecting client trust" instead of "HIPAA compliance").
The fear trigger is for your context only — weave the concern naturally, never copy it verbatim.
`;
    }

    // ═══════════════════════════════════════════════════════
    // USER MESSAGE — Dynamic per lead
    // ═══════════════════════════════════════════════════════
    const senderFirstName = (masterProfile.sender_name || "").split(" ")[0] || "Unknown";
    const isCompanyName = detectCompanyName(leadName);
    const leadFirstName = isCompanyName ? "" : ((leadName || "").split(" ")[0] || "Unknown");

    const userPrompt = `Generate 3 LinkedIn messages for this lead.

══════ SENDER INFO ══════
Name: ${masterProfile.sender_name || "Unknown"}
Company: ${masterProfile.company_name || ""}
Role: ${masterProfile.sender_title || ""}
What they do: ${masterProfile.company_description || ""}
Value Proposition: ${campaignProfile.value_proposition || "Not provided"}

══════ CAMPAIGN SETTINGS ══════
Campaign: ${campaignProfile.name}
Objective: ${campaignProfile.campaign_objective}
Tone: ${campaignProfile.dm_tone}
${campaignProfile.campaign_angle ? `Campaign Angle (THIS IS YOUR CORE STRATEGY — every DM must align with this): ${campaignProfile.campaign_angle}` : ""}
Pain Points to Address (YOU MUST reference at least ONE of these in the DM): ${Array.isArray(campaignProfile.pain_points) ? campaignProfile.pain_points.join(" | ") : "Not provided"}
Value Proposition (weave this naturally — don't copy verbatim): ${campaignProfile.value_proposition || "Not provided"}
Proof points: ${campaignProfile.proof_points || "None provided"}
ICP description: ${campaignProfile.icp_description || "Not provided"}
Target titles: ${Array.isArray(campaignProfile.icp_titles) ? campaignProfile.icp_titles.join(", ") : "Not provided"}
${campaignProfile.dm_example ? `DM Example (study the APPROACH and STRUCTURE, don't copy words): ${campaignProfile.dm_example}` : ""}
${verticalPromptSection}
══════ LEAD PROFILE ══════
First Name: ${leadFirstName || "N/A (this is a company/organization page — do NOT use a personal name greeting, skip name entirely)"}
Full Name: ${leadName}${isCompanyName ? " ⚠️ This appears to be a COMPANY name, not a person. Do NOT greet by name. Write messages without any name greeting." : ""}
Headline: ${leadHeadline}
Company: ${leadCompany}
About: ${truncateText(leadAbout || "N/A", 800)}

Current Position:
- Title: ${currentPositionTitle}
- Company: ${currentPositionCompany}
- Description: ${truncateText(currentPositionDescription || "", 400)}

Previous Position:
- Title: ${previousPositionTitle}
- Company: ${previousPositionCompany}

Education:
- School: ${educationSchool}
- Degree: ${educationDegree}
- Field: ${educationField}

Skills: ${skillsList}

Full profile text (for additional context): ${truncateText(fullProfileText || "", 1500)}

══════ OBJECTIVE GUIDE ══════
Based on the campaign objective "${campaignProfile.campaign_objective}":
${OBJECTIVE_DESCRIPTIONS[campaignProfile.campaign_objective] || OBJECTIVE_DESCRIPTIONS.start_conversation}

══════ INSTRUCTIONS ══════
1. Write connection_note (max 200 chars), custom_dm (target 200-300 chars, max 350), custom_followup (target 150-250 chars, max 280).
2. Use DIFFERENT personalization hooks across the 3 messages.
3. Match the tone to: ${campaignProfile.dm_tone}.
4. Align with the campaign objective: ${campaignProfile.campaign_objective}.
5. Sign DMs with just "${senderFirstName}".
6. Return ONLY valid JSON (no markdown).
7. CRITICAL — PITCH ALIGNMENT: The custom_dm MUST address one of the listed pain points using the campaign angle. Do NOT write generic industry observations. The DM should make the recipient think "this person understands MY specific challenge." If the DM example is provided, study its APPROACH (how it raises a pain point, how it phrases the question) — then write something with the SAME strategic intent but different words.
8. The connection_note should be pitch-free (just profile-based), but the custom_dm must clearly connect the lead's situation to the campaign's value proposition.`;


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
