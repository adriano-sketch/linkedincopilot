import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  useCampaignMetrics,
  type BenchmarkTier,
  type CampaignMetricsRates,
  type CampaignMetricsFunnel,
} from '@/hooks/useCampaignMetrics';
import { AlertTriangle, Info, TrendingUp, CheckCircle2 } from 'lucide-react';

interface CampaignMetricsPanelProps {
  /** Optional campaign profile id to scope metrics to a single campaign. */
  campaignProfileId?: string;
  /** Defaults to 30 days. */
  windowDays?: number;
  /** If true, hides the header. Useful when embedding inside another card. */
  compact?: boolean;
}

const TIER_META: Record<
  BenchmarkTier,
  { label: string; className: string; barColor: string }
> = {
  poor: {
    label: 'Poor',
    className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    barColor: 'bg-red-500',
  },
  ok: {
    label: 'OK',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    barColor: 'bg-amber-500',
  },
  good: {
    label: 'Good',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    barColor: 'bg-emerald-500',
  },
  great: {
    label: 'Great',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    barColor: 'bg-sky-500',
  },
};

const SEVERITY_META = {
  info: { icon: Info, className: '' },
  warn: {
    icon: AlertTriangle,
    className: 'border-amber-300 bg-amber-50 dark:bg-amber-950/20',
  },
  critical: {
    icon: AlertTriangle,
    className: 'border-red-300 bg-red-50 dark:bg-red-950/20',
  },
} as const;

const STAGE_LABELS: Record<string, string> = {
  icp_filter: 'ICP filter',
  connection_request: 'Connection request',
  acceptance: 'Acceptance',
  dm_send: 'DM send',
  reply: 'Reply',
  positive_reply: 'Positive reply',
  meeting_booked: 'Meeting booked',
};

function fmtPct(rate: number): string {
  if (!isFinite(rate) || rate <= 0) return '0%';
  return `${(rate * 100).toFixed(1)}%`;
}

function TierBadge({ tier }: { tier: BenchmarkTier }) {
  const meta = TIER_META[tier];
  return (
    <Badge variant="secondary" className={`${meta.className} border-0 font-medium`}>
      {meta.label}
    </Badge>
  );
}

interface RateRowProps {
  label: string;
  rate: number;
  tier: BenchmarkTier;
  helper?: string;
}

function RateRow({ label, rate, tier, helper }: RateRowProps) {
  const meta = TIER_META[tier];
  // Cap the progress bar at the "great" threshold so visual comparison stays meaningful.
  const pctOfGreat = Math.min(100, Math.round((rate / 0.4) * 100));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">{label}</span>
          {helper && <span className="text-xs text-muted-foreground">{helper}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{fmtPct(rate)}</span>
          <TierBadge tier={tier} />
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full ${meta.barColor} transition-all`}
          style={{ width: `${pctOfGreat}%` }}
        />
      </div>
    </div>
  );
}

function FunnelTable({ funnel }: { funnel: CampaignMetricsFunnel }) {
  const rows: Array<{ label: string; value: number; emoji: string }> = [
    { label: 'Total leads', value: funnel.total_leads, emoji: '👥' },
    { label: 'ICP approved', value: funnel.icp_approved, emoji: '✅' },
    { label: 'Connection sent', value: funnel.connection_requested, emoji: '📤' },
    { label: 'Connected', value: funnel.connected, emoji: '🤝' },
    { label: 'DMs sent', value: funnel.dm_sent, emoji: '💬' },
    { label: 'Replies', value: funnel.replied, emoji: '🎉' },
    { label: 'Meetings', value: funnel.meetings_booked, emoji: '📅' },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-sm">
          <span className="w-5 text-center text-base leading-none">{r.emoji}</span>
          <span className="w-32 text-muted-foreground">{r.label}</span>
          <div className="relative flex-1 h-5 rounded bg-muted overflow-hidden">
            <div
              className="h-full bg-primary/80 transition-all"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
          <span className="w-10 text-right tabular-nums font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function RatesGrid({ rates }: { rates: CampaignMetricsRates }) {
  return (
    <div className="space-y-3">
      <RateRow
        label="Acceptance rate"
        helper="connected / requests"
        rate={rates.acceptance_rate}
        tier={rates.acceptance_tier}
      />
      <RateRow
        label="Reply rate"
        helper="replies / DMs"
        rate={rates.reply_rate}
        tier={rates.reply_tier}
      />
      <RateRow
        label="Positive replies"
        helper="positive / replies"
        rate={rates.positive_reply_rate}
        tier={rates.positive_reply_tier}
      />
      <RateRow
        label="DM → meeting"
        helper="meetings / DMs"
        rate={rates.dm_to_meeting_rate}
        tier={rates.dm_to_meeting_tier}
      />
      <RateRow
        label="ICP pass rate"
        helper="approved / decided"
        rate={rates.icp_pass_rate}
        tier={rates.icp_pass_tier}
      />
    </div>
  );
}

export default function CampaignMetricsPanel({
  campaignProfileId,
  windowDays = 30,
  compact = false,
}: CampaignMetricsPanelProps) {
  const { metrics, isLoading, error } = useCampaignMetrics({
    campaignProfileId,
    windowDays,
  });

  if (isLoading) {
    return (
      <Card>
        {!compact && (
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingUp className="h-5 w-5" />
              Pipeline health
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !metrics) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn't load metrics</AlertTitle>
        <AlertDescription>
          {error?.message || 'The campaign-metrics function returned no data. Try again in a moment.'}
        </AlertDescription>
      </Alert>
    );
  }

  const { lifetime, window, diagnosis, top_blockers, credits, messages_generated_total } = metrics;

  return (
    <div className="space-y-4">
      {!compact && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Pipeline health
            </h3>
            <p className="text-sm text-muted-foreground">
              Last {window.days} days vs lifetime, compared to industry benchmarks.
            </p>
          </div>
          {credits && (
            <div className="text-right text-xs text-muted-foreground">
              <div>
                Credits: <span className="font-medium tabular-nums">{credits.used}</span> / {credits.max}
              </div>
              <div>{credits.remaining} remaining</div>
            </div>
          )}
        </div>
      )}

      {/* Diagnosis cards */}
      {diagnosis.length > 0 && (
        <div className="space-y-2">
          {diagnosis.map((d, i) => {
            const meta = SEVERITY_META[d.severity];
            const Icon = d.code === 'healthy' ? CheckCircle2 : meta.icon;
            return (
              <Alert key={`${d.code}-${i}`} className={meta.className}>
                <Icon className="h-4 w-4" />
                <AlertTitle className="capitalize">{d.code.replace(/_/g, ' ')}</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>{d.message}</p>
                  <p className="text-xs italic text-muted-foreground">
                    <span className="font-semibold not-italic">What to do: </span>
                    {d.recommendation}
                  </p>
                </AlertDescription>
              </Alert>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Funnel — last {window.days} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelTable funnel={window.funnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Conversion rates — lifetime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RatesGrid rates={lifetime.rates} />
          </CardContent>
        </Card>
      </div>

      {top_blockers.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Top blockers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top_blockers.map((b) => (
              <div key={b.stage} className="flex items-center justify-between text-sm">
                <span>{STAGE_LABELS[b.stage] ?? b.stage}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-xs">
                    {fmtPct(b.conversion)} pass
                  </span>
                  <Badge variant="destructive" className="font-medium">
                    -{b.lost}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {credits && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              This cycle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Leads used</span>
              <span className="tabular-nums font-medium">
                {credits.used} / {credits.max}
              </span>
            </div>
            <Progress value={credits.max > 0 ? (credits.used / credits.max) * 100 : 0} />
            <div className="text-xs text-muted-foreground">
              {messages_generated_total.toLocaleString()} messages generated total
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
