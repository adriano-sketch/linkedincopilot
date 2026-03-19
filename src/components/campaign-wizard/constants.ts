// Industry-agnostic titles that match ALL industries
export const INDUSTRY_AGNOSTIC_TITLES = [
  "ceo", "coo", "cfo", "cto", "cio", "ciso",
  "owner", "co-owner", "co-founder", "founder", "partner", "managing partner", "principal",
  "president", "vice president", "vp", "director", "managing director", "executive director",
  "general manager", "operations manager", "office manager", "it manager", "it director",
  "board member", "chairman", "chairwoman",
];

export function isIndustryAgnostic(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return INDUSTRY_AGNOSTIC_TITLES.some(agnostic =>
    normalized === agnostic ||
    normalized.startsWith(agnostic + " ") ||
    normalized.endsWith(" " + agnostic) ||
    normalized.includes(" " + agnostic + " ")
  );
}

export const UNIVERSAL_TRAPS: Record<string, string> = {
  'practice owner': 'Apollo uses OR logic — this pulls owners from every industry (vet, medical, PT, dental, etc.), not just yours.',
  'owner': 'Matches every small business owner regardless of industry. Use a more specific title.',
  'founder': 'Every startup founder. This will add thousands of irrelevant leads.',
  'partner': 'Pulls partners from law, consulting, accounting, VC — all mixed together.',
  'doctor': 'Includes PhDs, academics, and non-clinical professionals. Use "physician" or a specific specialty.',
  'manager': 'Most generic title in existence. Always qualify: "hotel manager", "property manager", etc.',
  'general manager': 'Pulls GMs from every industry. Qualify with the industry name.',
  'agent': 'Without qualifier, pulls insurance, real estate, talent, travel agents.',
  'broker': 'Without qualifier, pulls mortgage, insurance, stock, real estate brokers.',
  'IT manager': 'Pulls internal IT staff at every company, not MSP owners. Use "IT director" or "managed services".',
  'marketing manager': 'Pulls in-house marketers at every company, not agency owners.',
  'consultant': 'Extremely broad — management, tech, HR, marketing consultants all mixed.',
};

export const CREDENTIAL_TRAPS = ['DDS', 'DMD', 'MD', 'DO', 'JD', 'Esq', 'CFA', 'EA', 'RN', 'LPN'];

export const CREDENTIAL_WARNING = 'Academic credentials and certifications are not used as job titles on LinkedIn. This will return near-zero results. Use the profession name instead (e.g., "dentist" instead of "DDS").';

export function getTrapWarning(title: string): string | null {
  const lower = title.toLowerCase().trim();
  if (UNIVERSAL_TRAPS[lower]) return UNIVERSAL_TRAPS[lower];
  const upper = title.trim().toUpperCase();
  if (CREDENTIAL_TRAPS.some(c => c.toUpperCase() === upper)) return CREDENTIAL_WARNING;
  return null;
}

export const CAMPAIGN_OBJECTIVES = [
  { value: 'book_call', icon: '📞', label: 'Book a Call', desc: 'Get them on a discovery call or demo' },
  { value: 'get_referral', icon: '🤝', label: 'Get Referrals', desc: 'Build a referral partnership' },
  { value: 'start_conversation', icon: '💬', label: 'Start a Conversation', desc: 'Open a dialogue, no hard sell' },
  { value: 'offer_audit', icon: '🔍', label: 'Offer a Free Audit', desc: 'Lead with value — free analysis' },
  { value: 'sell_direct', icon: '💰', label: 'Sell Directly', desc: 'Present your offer and close' },
  { value: 'build_relationship', icon: '🌱', label: 'Build Relationship', desc: 'Long-term networking' },
];

export const TONE_OPTIONS = [
  { value: 'casual_peer', icon: '😎', label: 'Casual Peer', desc: 'Like texting a colleague', sample: 'Hey {{name}}, saw you\'re doing cool stuff at {{company}}...' },
  { value: 'professional_warm', icon: '🤝', label: 'Professional Warm', desc: 'Friendly but businesslike', sample: 'Hi {{name}}, your work in {{industry}} caught my eye...' },
  { value: 'direct_bold', icon: '🎯', label: 'Direct & Bold', desc: 'Gets to the point fast', sample: '{{name}}, quick question — are your clients...' },
  { value: 'consultative', icon: '🧠', label: 'Consultative', desc: 'Expert/advisor positioning', sample: 'Hi {{name}}, I\'ve been working with companies like {{company}}...' },
];

export const EMPLOYEE_RANGES = [
  '1-10', '11-20', '21-50', '51-100', '101-200',
  '201-500', '501-1000', '1001-2000', '2001-5000', '5001-10000', '10001+',
];

export const PAIN_POINT_PLACEHOLDERS = [
  "e.g. 'Worried about data breaches but can't afford full-time security'",
  "e.g. 'Losing clients to competitors who offer more services'",
  "e.g. 'Compliance requirements getting more complex every year'",
  "e.g. 'Struggling to scale without increasing headcount'",
];

export const TIER_BADGES: Record<number, { icon: string; label: string }> = {
  1: { icon: '🔥', label: 'Priority Verticals' },
  2: { icon: '⭐', label: 'Strong Verticals' },
  3: { icon: '📋', label: 'Other Verticals' },
};

export const MESSAGE_LANGUAGES = [
  { value: 'English', flag: '🇺🇸' },
  { value: 'Portuguese', flag: '🇧🇷' },
  { value: 'Spanish', flag: '🇪🇸' },
  { value: 'French', flag: '🇫🇷' },
  { value: 'German', flag: '🇩🇪' },
  { value: 'Italian', flag: '🇮🇹' },
  { value: 'Dutch', flag: '🇳🇱' },
  { value: 'Polish', flag: '🇵🇱' },
  { value: 'Romanian', flag: '🇷🇴' },
  { value: 'Swedish', flag: '🇸🇪' },
  { value: 'Norwegian', flag: '🇳🇴' },
  { value: 'Danish', flag: '🇩🇰' },
  { value: 'Finnish', flag: '🇫🇮' },
  { value: 'Czech', flag: '🇨🇿' },
  { value: 'Hungarian', flag: '🇭🇺' },
  { value: 'Greek', flag: '🇬🇷' },
  { value: 'Turkish', flag: '🇹🇷' },
  { value: 'Arabic', flag: '🇸🇦' },
  { value: 'Hebrew', flag: '🇮🇱' },
  { value: 'Hindi', flag: '🇮🇳' },
  { value: 'Japanese', flag: '🇯🇵' },
  { value: 'Korean', flag: '🇰🇷' },
  { value: 'Chinese (Simplified)', flag: '🇨🇳' },
  { value: 'Chinese (Traditional)', flag: '🇹🇼' },
  { value: 'Thai', flag: '🇹🇭' },
  { value: 'Vietnamese', flag: '🇻🇳' },
  { value: 'Indonesian', flag: '🇮🇩' },
  { value: 'Malay', flag: '🇲🇾' },
  { value: 'Russian', flag: '🇷🇺' },
  { value: 'Ukrainian', flag: '🇺🇦' },
  { value: 'Croatian', flag: '🇭🇷' },
  { value: 'Serbian', flag: '🇷🇸' },
  { value: 'Bulgarian', flag: '🇧🇬' },
  { value: 'Slovak', flag: '🇸🇰' },
  { value: 'Slovenian', flag: '🇸🇮' },
  { value: 'Estonian', flag: '🇪🇪' },
  { value: 'Latvian', flag: '🇱🇻' },
  { value: 'Lithuanian', flag: '🇱🇹' },
];
