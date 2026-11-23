import { Card, CardContent } from '@/components/ui/card';

interface PipelineStatsProps {
  counts: Record<string, number>;
  onStageClick?: (status: string | null) => void;
  activeFilter?: string | null;
}

// Where the people of a list are: waiting to be read, a post found, a comment being drafted, a draft
// waiting for the user, resting until the next cycle, or left out.
const STAGES = [
  // visiting_profile: contacts visited under an older flow; they wait for the post check like the rest.
  { key: 'g_waiting', label: 'Waiting', statuses: ['new', 'ready', 'imported', 'visiting_profile'] },
  { key: 'g_post_found', label: 'Post found', statuses: ['post_found'] },
  { key: 'g_drafting', label: 'Drafting comment', statuses: ['post_liked'] },
  { key: 'g_review', label: 'To post', statuses: ['comment_review'], highlight: true },
  { key: 'g_done', label: 'Resting', statuses: ['engagement_done'] },
  { key: 'excluded', label: 'Excluded', statuses: ['skipped', 'do_not_contact', 'error'] },
];

export default function PipelineStats({ counts, onStageClick, activeFilter }: PipelineStatsProps) {
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {STAGES.map(stage => {
        const count = stage.statuses.reduce((sum, s) => sum + (counts[s] || 0), 0);
        const isActive = activeFilter === stage.key;
        const shouldHighlight = !!stage.highlight && count > 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <Card
            key={stage.key}
            className={`cursor-pointer transition-all hover:shadow-md ${isActive ? 'ring-2 ring-primary' : ''} ${shouldHighlight ? 'border-2 border-attention' : ''}`}
            onClick={() => onStageClick?.(isActive ? null : stage.key)}
          >
            <CardContent className="p-4">
              <p className={`font-display text-3xl font-extrabold leading-none ${shouldHighlight ? 'text-attention' : 'text-foreground'}`}>{count}</p>
              <p className={`mt-1.5 text-xs ${shouldHighlight ? 'text-foreground font-semibold' : 'text-muted-foreground'}`}>{stage.label}</p>
              {pct > 0 && <p className="text-[11px] text-muted-foreground mt-0.5">{pct}%</p>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** Human label of a stage key, for headings ("To post" instead of "g review"). */
export function stageLabel(key: string): string {
  const stage = STAGES.find(s => s.key === key);
  return stage ? stage.label : key.replace(/_/g, ' ');
}

export const STAGE_STATUS_MAP: Record<string, string[]> = Object.fromEntries(STAGES.map(s => [s.key, s.statuses]));
