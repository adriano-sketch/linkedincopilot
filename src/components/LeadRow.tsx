import { ExternalLink, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { CampaignLead } from '@/hooks/useCampaignLeads';

// Where a person of a list is in the reading cycle.
const STATUS: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  waiting:         { label: 'Waiting',          bg: 'bg-slate-100',  text: 'text-slate-600',   dot: 'bg-slate-400' },
  post_found:      { label: 'Post found',       bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  post_liked:      { label: 'Drafting comment', bg: 'bg-amber-50',   text: 'text-amber-700',   dot: 'bg-amber-400' },
  comment_review:  { label: 'To post',          bg: 'bg-orange-50',  text: 'text-orange-700',  dot: 'bg-orange-400' },
  engagement_done: { label: 'Resting',          bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  do_not_contact:  { label: 'Excluded',         bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
  skipped:         { label: 'Skipped',          bg: 'bg-slate-100',  text: 'text-slate-500',   dot: 'bg-slate-400' },
  error:           { label: 'Error',            bg: 'bg-red-50',     text: 'text-red-700',     dot: 'bg-red-500' },
};

interface LeadRowProps {
  lead: CampaignLead;
  onReview?: () => void;
}

function displayName(lead: CampaignLead): string {
  if (lead.full_name) return lead.full_name;
  if (lead.first_name && lead.last_name) {
    if (lead.last_name.includes('*')) return `${lead.first_name} ${lead.last_name.charAt(0)}.`;
    return `${lead.first_name} ${lead.last_name}`;
  }
  return lead.first_name || 'Unknown';
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

const INITIALS_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
];

function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

// Why a contact finished a cycle without a comment, in plain words.
const GROWTH_NOTES: Record<string, string> = {
  no_recent_posts: 'No post in the last 30 days',
  no_own_posts: 'Only reposts lately',
  no_posts_found: 'No posts yet',
  cards_not_recognized: 'Could not read their activity page',
};

export default function LeadRow({ lead, onReview }: LeadRowProps) {
  // Post and comment fields are not on the CampaignLead type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = lead as any;
  const note = lead.status === 'engagement_done'
    ? (g.comment_posted_at ? `Commented ${format(new Date(g.comment_posted_at), 'MMM d')}`
      : Object.entries(GROWTH_NOTES).find(([k]) => String(g.error_message || '').includes(k))?.[1] || null)
    : null;
  const config = STATUS[lead.status] || STATUS.waiting;
  const name = displayName(lead);

  return (
    <tr className="group border-b border-border/60 hover:bg-accent/5 transition-all duration-150">
      <td className="px-3 py-3.5 w-10" />

      {/* Name */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getInitialsColor(name)}`}>
            {getInitials(name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm text-foreground truncate m-0">{name}</p>
            {lead.title && <p className="text-xs text-muted-foreground truncate max-w-[200px] m-0">{lead.title}</p>}
            {lead.linkedin_url && (
              <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 text-[11px] font-medium inline-flex items-center gap-0.5 mt-0.5 transition-colors">
                Profile <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        </div>
      </td>

      {/* Company */}
      <td className="px-4 py-3.5">
        <span className="text-sm text-foreground/80">{lead.company || <span className="text-muted-foreground/50">—</span>}</span>
      </td>

      {/* Their post */}
      <td className="px-4 py-3.5 min-w-[240px] max-w-[320px]">
        {g.post_content ? (
          <div className="space-y-1">
            <p className="text-xs leading-relaxed text-foreground/80 whitespace-normal break-words line-clamp-3 m-0">{String(g.post_content)}</p>
            {g.post_url && (
              <a href={String(g.post_url).split('#')[0]} target="_blank" rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 text-[11px] font-medium inline-flex items-center gap-0.5">
                Open on LinkedIn <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        ) : <span className="text-muted-foreground/50 text-sm">—</span>}
      </td>

      {/* Your comment */}
      <td className="px-4 py-3.5 min-w-[240px] max-w-[320px]">
        {g.comment_text ? (
          <p className="text-xs leading-relaxed text-muted-foreground whitespace-normal break-words italic line-clamp-3 m-0">
            "{String(g.comment_text)}"
          </p>
        ) : <span className="text-muted-foreground/50 text-sm">—</span>}
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <div className="space-y-1">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap ${config.bg} ${config.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
            {config.label}
          </span>
          {note && <p className="text-[10px] text-muted-foreground m-0">{note}</p>}
        </div>
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5">
        {lead.status === 'comment_review' && onReview && (
          <Button size="sm" className="h-7 text-xs rounded-full" onClick={onReview}>
            <MessageSquare className="w-3 h-3 mr-1" /> Review comment
          </Button>
        )}
      </td>
    </tr>
  );
}
