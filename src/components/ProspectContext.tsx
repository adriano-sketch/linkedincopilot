import { CampaignLead } from '@/hooks/useCampaignLeads';

export default function ProspectContext({ lead }: { lead: CampaignLead }) {
  const name = lead.full_name || [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unnamed prospect';
  const title = lead.profile_current_title || lead.title;
  const company = lead.profile_current_company || lead.company;
  const capturedAt = lead.profile_enriched_at && !Number.isNaN(Date.parse(lead.profile_enriched_at))
    ? new Date(lead.profile_enriched_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null;
  return <aside className="approval-context" aria-label={`Context for ${name}`}>
    <p className="eyebrow">AVAILABLE PROSPECT CONTEXT</p><strong>{name}</strong>
    <p>{[title, company].filter(Boolean).join(' · ') || 'Role and company not available'}</p>
    {lead.location && <p>{lead.location}</p>}
    {lead.profile_headline && <blockquote>{lead.profile_headline}</blockquote>}
    {lead.profile_about ? <details className="mt-4"><summary className="cursor-pointer font-medium">About this prospect</summary><p className="mt-2 whitespace-pre-wrap">{lead.profile_about}</p></details> : !lead.profile_headline && <p className="mt-4">No profile summary available. Check the profile before relying on the draft.</p>}
    <dl><dt>{lead.icp_match === true ? 'Matches campaign criteria' : lead.icp_match === false ? 'Outside campaign criteria' : 'Audience fit not confirmed'}</dt><dd>{lead.icp_match_reason || 'No qualification explanation available.'}</dd></dl>
    {capturedAt && <p className="mt-3 text-[10px]">Profile context updated {capturedAt}</p>}
    {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer">Open LinkedIn profile ↗</a>}
  </aside>;
}
