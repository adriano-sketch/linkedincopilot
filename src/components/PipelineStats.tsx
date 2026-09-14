
interface PipelineStatsProps {
  counts: Record<string, number>;
  onStageClick?: (status: string | null) => void;
  activeFilter?: string | null;
  qualifiedTotal?: number;
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
    label: 'Review',
    color: 'text-orange-500',
    statuses: ['pending_approval', 'dm_ready', 'ready_for_dm', 'dm_pending_approval'],
    highlight: true,
    emoji: '📬',
  },
  {
    key: 'dm_sent',
    label: 'DM stage',
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
    label: 'Limited data',
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

export default function PipelineStats({ counts, onStageClick, activeFilter, qualifiedTotal }: PipelineStatsProps) {

  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 xl:grid-cols-9 gap-2">
      {PIPELINE_STAGES.map(stage => {
        const count = stage.statuses.reduce((sum, s) => sum + (counts[s as keyof typeof counts] || 0), 0);
        const isActive = activeFilter === stage.key;
        const shouldHighlight = stage.highlight && count > 0;
        return (
          <button
            type="button"
            aria-pressed={isActive}
            aria-label={`${stage.label}: ${count} prospects. Filter prospects.`}
            key={stage.key}
            className={`rounded-lg border border-border bg-white text-left transition-all hover:border-primary ${isActive ? 'ring-2 ring-primary' : ''} ${shouldHighlight ? 'border-orange-400 bg-orange-50 dark:bg-orange-950/20' : ''}`}
            onClick={() => onStageClick?.(isActive ? null : stage.key)}
          >
            <div className="p-3">

              <p className="text-2xl font-medium tracking-tight text-foreground">{count}</p>
              <p className="text-[10px] text-muted-foreground mt-2">{stage.label}</p>

            </div>
          </button>
        );
      })}
    </div>
  );
}

export const STAGE_STATUS_MAP: Record<string, string[]> = {
  queued: ['new', 'ready', 'imported'],
  warming: ['visiting_profile', 'following', 'queued_for_connection'],
  connection_sent: ['connection_sent'],
  connected: ['connected', 'connection_accepted'],
  pending_approval: ['pending_approval', 'dm_ready', 'ready_for_dm', 'dm_pending_approval'],
  dm_sent: ['dm_queued', 'dm_sent', 'waiting_reply', 'follow_up_due', 'follow_up_sent', 'followup_sent'],
  replied: ['replied'],
  ghost: ['ghost'],
  excluded: ['icp_rejected', 'skipped', 'skipped_inmail', 'do_not_contact', 'connection_rejected', 'error'],
};
