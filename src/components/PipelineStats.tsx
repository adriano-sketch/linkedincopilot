import { Card, CardContent } from '@/components/ui/card';

interface PipelineStatsProps {
  counts: Record<string, number>;
  onStageClick?: (status: string | null) => void;
  activeFilter?: string | null;
  qualifiedTotal?: number;
  /** 'growth' shows the relationship stages (visit → post → comment) instead of the outreach funnel. */
  mode?: 'outreach' | 'growth';
}

const PIPELINE_STAGES = [
  {
    key: 'queued',
    label: 'Ready',
    color: 'text-blue-600',
    statuses: ['new', 'ready', 'imported'],
    emoji: '🚀',
  },
  {
    key: 'warming',
    label: 'Warming',
    color: 'text-amber-500',
    statuses: ['visiting_profile', 'following', 'queued_for_connection'],
    emoji: '🔥',
  },
  {
    key: 'connection_sent',
    label: 'Invite Sent',
    color: 'text-indigo-600',
    statuses: ['connection_sent'],
    emoji: '📤',
  },
  {
    key: 'connected',
    label: 'Accepted',
    color: 'text-green-600',
    statuses: ['connected', 'connection_accepted'],
    emoji: '✅',
  },
  {
    key: 'pending_approval',
    label: 'Pending',
    color: 'text-orange-500',
    statuses: ['dm_ready', 'ready_for_dm'],
    highlight: true,
    emoji: '📬',
  },
  {
    key: 'dm_sent',
    label: 'DM Sent',
    color: 'text-purple-600',
    statuses: ['dm_queued', 'dm_sent', 'waiting_reply', 'follow_up_due', 'follow_up_sent', 'followup_sent'],
    emoji: '💬',
  },
  {
    key: 'replied',
    label: 'Replied',
    color: 'text-emerald-700',
    statuses: ['replied'],
    emoji: '🎉',
  },
  {
    key: 'ghost',
    label: 'Ghosts',
    color: 'text-slate-500',
    statuses: ['ghost'],
    emoji: '👻',
  },
  {
    key: 'excluded',
    label: 'Excluded',
    color: 'text-red-500',
    statuses: ['icp_rejected', 'skipped', 'skipped_inmail', 'do_not_contact', 'connection_rejected', 'error'],
    emoji: '🚫',
  },
];

// Growth campaigns (existing contacts): no enrichment, invites or DMs. A contact is visited, their
// latest own post is found and liked, a comment is drafted for approval, then they rest for 7 days.
const GROWTH_STAGES = [
  { key: 'g_waiting', label: 'Waiting', color: 'text-blue-600', statuses: ['new', 'ready', 'imported'], emoji: '🕒' },
  { key: 'g_visited', label: 'Profile visited', color: 'text-amber-500', statuses: ['visiting_profile'], emoji: '👀' },
  { key: 'g_post_found', label: 'Post found', color: 'text-indigo-600', statuses: ['post_found'], emoji: '📰' },
  { key: 'g_drafting', label: 'Liked, drafting', color: 'text-purple-600', statuses: ['post_liked'], emoji: '👍' },
  { key: 'g_review', label: 'To approve', color: 'text-orange-500', statuses: ['comment_review'], highlight: true, emoji: '📬' },
  { key: 'g_done', label: 'Resting', color: 'text-emerald-700', statuses: ['engagement_done'], emoji: '✅' },
  { key: 'excluded', label: 'Excluded', color: 'text-red-500', statuses: ['skipped', 'do_not_contact', 'error'], emoji: '🚫' },
];

export default function PipelineStats({ counts, onStageClick, activeFilter, qualifiedTotal, mode }: PipelineStatsProps) {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const pctBase = qualifiedTotal != null && qualifiedTotal > 0 ? qualifiedTotal : total;
  const stages = mode === 'growth' ? GROWTH_STAGES : PIPELINE_STAGES;

  return (
    <div className={mode === 'growth' ? 'grid grid-cols-4 sm:grid-cols-7 gap-2' : 'grid grid-cols-4 sm:grid-cols-8 gap-2'}>
      {stages.map(stage => {
        const count = stage.statuses.reduce((sum, s) => sum + (counts[s as keyof typeof counts] || 0), 0);
        const isActive = activeFilter === stage.key;
        const shouldHighlight = (stage as any).highlight && count > 0;
        const pct = pctBase > 0 ? Math.round((count / pctBase) * 100) : 0;
        return (
          <Card
            key={stage.key}
            className={`cursor-pointer transition-all hover:shadow-md ${isActive ? 'ring-2 ring-primary' : ''} ${shouldHighlight ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : ''}`}
            onClick={() => onStageClick?.(isActive ? null : stage.key)}
          >
            <CardContent className="p-3 text-center">
              <p className="text-lg mb-0.5">{stage.emoji}</p>
              <p className={`text-xl font-bold ${stage.color}`}>{count}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{stage.label}</p>
              {pct > 0 && <p className="text-[9px] text-muted-foreground mt-0.5">{pct}%</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Human label of a stage key, for headings ("To approve" instead of "g review"). */
export function stageLabel(key: string): string {
  const stage = [...GROWTH_STAGES, ...PIPELINE_STAGES].find(s => s.key === key);
  return stage ? stage.label : key.replace(/_/g, ' ');
}

export const STAGE_STATUS_MAP: Record<string, string[]> = {
  queued: ['new', 'ready', 'imported'],
  warming: ['visiting_profile', 'following', 'queued_for_connection'],
  connection_sent: ['connection_sent'],
  connected: ['connected', 'connection_accepted'],
  pending_approval: ['dm_ready', 'ready_for_dm'],
  dm_sent: ['dm_queued', 'dm_sent', 'waiting_reply', 'follow_up_due', 'follow_up_sent', 'followup_sent'],
  replied: ['replied'],
  ghost: ['ghost'],
  g_waiting: ['new', 'ready', 'imported'],
  g_visited: ['visiting_profile'],
  g_post_found: ['post_found'],
  g_drafting: ['post_liked'],
  g_review: ['comment_review'],
  g_done: ['engagement_done'],
  excluded: ['icp_rejected', 'skipped', 'skipped_inmail', 'do_not_contact', 'connection_rejected', 'error'],
};
