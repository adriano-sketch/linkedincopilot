export const OBJECTIVE_DESCRIPTIONS: Record<string, string> = {
  book_call: "Create curiosity about a specific problem relevant to their role → suggest a brief chat. Don't over-explain.",
  get_referral: "Frame a win-win. Easy for them, good for their clients/network. Not asking a favor.",
  start_conversation: "Genuine observation or question inviting a reply. Zero selling pressure.",
  offer_audit: "Mention ONE specific, concrete thing you noticed (not a vague 'free audit'). Make them curious.",
  sell_direct: "Present the offer clearly with a specific value prop and CTA. Be confident but not pushy.",
  build_relationship: "No ask whatsoever. Just connect on a genuine shared interest or observation. Leave the door open naturally.",
};

export function detectCompanyName(name: string): boolean {
  if (!name) return false;
  const companyIndicators = [
    /\b(solutions|consulting|services|technologies|group|inc|llc|ltd|corp|agency|partners|associates|holdings|enterprises|healthcare|capital|ventures|labs|studio|media|digital|systems|network|global|international|foundation|institute)\b/i,
    /\b(co\.|company|gmbh|s\.a\.|s\.r\.l|pvt|pty)\b/i,
  ];
  return companyIndicators.some((regex) => regex.test(name));
}

export function truncateText(text: string, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + "...";
}

type PromptInputs = {
  sender: {
    name?: string;
    title?: string;
    company?: string;
    companyDescription?: string;
  };
  campaign: {
    name?: string;
    objective?: string;
    tone?: string;
    angle?: string;
    painPoints?: string[];
    valueProposition?: string;
    proofPoints?: string;
    icpDescription?: string;
    icpTitles?: string[];
    dmExample?: string;
    messageLanguage?: string;
  };
  lead: {
    fullName?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    company?: string;
    headline?: string;
    about?: string;
    industry?: string;
    location?: string;
    currentTitle?: string;
    currentCompany?: string;
    currentDescription?: string;
    previousTitle?: string;
    previousCompany?: string;
    educationSchool?: string;
    educationDegree?: string;
    educationField?: string;
    skills?: string;
    fullProfileText?: string;
  };
  vertical?: {
    name?: string;
    primary_compliance?: string;
    fear_trigger?: string;
    default_pain_points?: string[];
  } | null;
};

export function buildMessagePrompts(inputs: PromptInputs) {
  const messageLanguage = inputs.campaign.messageLanguage || "English";
  const senderFirstName = (inputs.sender.name || "").split(" ")[0] || "Unknown";
  const leadFullName =
    inputs.lead.fullName ||
    `${inputs.lead.firstName || ""} ${inputs.lead.lastName || ""}`.trim() ||
    "Unknown";
  const isCompanyName = detectCompanyName(leadFullName);
  const leadFirstName = isCompanyName ? "" : (leadFullName.split(" ")[0] || "Unknown");
  const objective = inputs.campaign.objective || "start_conversation";
  const objectiveGuide = OBJECTIVE_DESCRIPTIONS[objective] || OBJECTIVE_DESCRIPTIONS.start_conversation;

  const systemPrompt = `You are a world-class LinkedIn outreach strategist in 2026. Your job is to generate 3 hyper-personalized messages for B2B LinkedIn outreach: a connection note, a first DM, and a follow-up DM.

CRITICAL REQUIREMENTS (2026 BEST PRACTICES):
- Use ONLY the data provided in the lead profile/enrichment. Do not invent facts or fabricate achievements.
- Prioritize enrichment data (about/summary, experience, company details, education, skills). If it is missing, fall back to title/company/industry.
- The messages must feel written by a real person who actually read the profile.
- Avoid 2024-era clichés and automation fingerprints.
- Keep messages short, specific, and easy to reply to.
- Return ONLY valid JSON: {"connection_note": "...", "custom_dm": "...", "custom_followup": "..."} (no markdown, no extra text).
- Write ALL messages entirely in ${messageLanguage}. Do not mix languages.

═══════════════════════════════════════════════════════
MESSAGE 1: CONNECTION NOTE (connection_note)
═══════════════════════════════════════════════════════
Purpose: Get the connection accepted. Zero selling.
Rules:
1) MAX 200 characters (hard platform limit).
2) Reference ONE specific detail from their profile (role change, company focus, specialization, or a real detail from about/experience).
3) Explain WHY you want to connect (shared domain, adjacent work, or genuine curiosity).
4) No pitch, no CTA, no links, no "I'd love to connect".
5) Do NOT start with "Hi [Name]" (wastes characters).
6) End naturally. No question, no push.

═══════════════════════════════════════════════════════
MESSAGE 2: FIRST DM (custom_dm)
═══════════════════════════════════════════════════════
Purpose: Start a conversation aligned to campaign objective.
Rules:
1) Target 200–300 chars (max 350). Short wins in 2026.
2) Must use a DIFFERENT hook than the connection note.
3) Use first name once at start ONLY if it's a real person; skip if company/organization name.
4) End with a low-friction question or observation.
5) No links, no attachments, no buzzwords.
6) Sign with sender’s FIRST NAME only.
7) Must address at least ONE campaign pain point using the campaign angle.

═══════════════════════════════════════════════════════
MESSAGE 3: FOLLOW-UP (custom_followup)
═══════════════════════════════════════════════════════
Purpose: Re-engage with a NEW angle. Zero pressure.
Rules:
1) Target 150–250 chars (max 280).
2) Completely different angle from DM1.
3) NEVER say “following up”, “circling back”, “bumping”, “just checking”.
4) No guilt, no apology.
5) Sign with sender’s FIRST NAME only.

ANTI-SPAM / ANTI-AI:
- Avoid: “I noticed…”, “I came across…”, “I was impressed…”.
- No emoji unless the tone is casual and it reads natural.
- Vary sentence length. Write natural, human sentences.
- If the message could be sent to anyone by swapping name/company, it’s too generic — rewrite.
`;

  let verticalPromptSection = "";
  if (inputs.vertical) {
    verticalPromptSection = `
══════ VERTICAL CONTEXT ══════
Industry: ${inputs.vertical.name || "N/A"}
Primary compliance framework: ${inputs.vertical.primary_compliance || "None specific"}
Key fear trigger: ${inputs.vertical.fear_trigger || "N/A"}
Known pain points: ${Array.isArray(inputs.vertical.default_pain_points) ? inputs.vertical.default_pain_points.join(" | ") : "N/A"}

Use vertical context to make the DM relevant to real business challenges.
Do NOT mention compliance frameworks directly; translate into business impact.
`;
  }

  const userPrompt = `Generate 3 LinkedIn messages for this lead.

══════ SENDER (WIZARD DATA) ══════
Name: ${inputs.sender.name || "Unknown"}
Role: ${inputs.sender.title || ""}
Company: ${inputs.sender.company || ""}
Company description: ${inputs.sender.companyDescription || ""}
Value proposition: ${inputs.campaign.valueProposition || "Not provided"}

══════ CAMPAIGN (WIZARD DATA) ══════
Campaign: ${inputs.campaign.name || "Default"}
Objective: ${objective}
Tone: ${inputs.campaign.tone || "professional_warm"}
Campaign Angle (core strategy): ${inputs.campaign.angle || "Not provided"}
Pain Points (must address at least ONE in DM): ${Array.isArray(inputs.campaign.painPoints) && inputs.campaign.painPoints.length > 0 ? inputs.campaign.painPoints.join(" | ") : "Not provided"}
Proof points: ${inputs.campaign.proofPoints || "None provided"}
ICP description: ${inputs.campaign.icpDescription || "Not provided"}
Target titles: ${Array.isArray(inputs.campaign.icpTitles) && inputs.campaign.icpTitles.length > 0 ? inputs.campaign.icpTitles.join(", ") : "Not provided"}
${inputs.campaign.dmExample ? `Example DM (study APPROACH, don't copy): ${inputs.campaign.dmExample}` : ""}
${verticalPromptSection}

══════ LEAD PROFILE (ENRICHMENT FIRST) ══════
First Name: ${leadFirstName || "N/A (company/organization — do NOT use a name greeting)"}
Full Name: ${leadFullName}${isCompanyName ? " ⚠️ This appears to be a COMPANY name, not a person. Do NOT greet by name." : ""}
Headline: ${inputs.lead.headline || "N/A"}
Company: ${inputs.lead.company || "N/A"}
Title: ${inputs.lead.title || "N/A"}
About / Summary: ${truncateText(inputs.lead.about || "N/A", 800)}

Current Position:
- Title: ${inputs.lead.currentTitle || "N/A"}
- Company: ${inputs.lead.currentCompany || "N/A"}
- Description: ${truncateText(inputs.lead.currentDescription || "", 400)}

Previous Position:
- Title: ${inputs.lead.previousTitle || "N/A"}
- Company: ${inputs.lead.previousCompany || "N/A"}

Education:
- School: ${inputs.lead.educationSchool || "N/A"}
- Degree: ${inputs.lead.educationDegree || "N/A"}
- Field: ${inputs.lead.educationField || "N/A"}

Skills: ${inputs.lead.skills || "N/A"}
Industry: ${inputs.lead.industry || "N/A"}
Location: ${inputs.lead.location || "N/A"}

Full profile text (extra context): ${truncateText(inputs.lead.fullProfileText || "", 1500)}

══════ OBJECTIVE GUIDE ══════
${objectiveGuide}

══════ OUTPUT INSTRUCTIONS ══════
1) Return ONLY valid JSON (no markdown).
2) connection_note <= 200 chars.
3) custom_dm 200–300 chars (max 350).
4) custom_followup 150–250 chars (max 280).
5) Use DIFFERENT personalization hooks across the 3 messages.
6) Sign DMs with just "${senderFirstName}".
`;

  return {
    systemPrompt,
    userPrompt,
  };
}
