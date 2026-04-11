import { useIcpFit, type IcpFitInput, type IcpVerdict, type IcpTier } from '@/hooks/useIcpFit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, AlertTriangle, Sparkles, XCircle, HelpCircle } from 'lucide-react';

interface IcpFitPreviewProps {
  input: IcpFitInput;
  /** Set false to disable auto-analyze-on-change. */
  auto?: boolean;
}

const VERDICT_META: Record<
  IcpVerdict,
  { label: string; className: string; emoji: string }
> = {
  broken: {
    label: 'Broken',
    className: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
    emoji: '🚨',
  },
  needs_work: {
    label: 'Needs work',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300',
    emoji: '⚠️',
  },
  ok: {
    label: 'OK',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    emoji: '🟡',
  },
  good: {
    label: 'Good',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    emoji: '✅',
  },
  great: {
    label: 'Great',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    emoji: '🎯',
  },
};

const TIER_COLORS: Record<IcpTier, string> = {
  poor: 'text-red-600',
  ok: 'text-amber-600',
  good: 'text-emerald-600',
  great: 'text-sky-600',
};

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

function ScoreRing({ score, verdict }: { score: number; verdict: IcpVerdict }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.max(0, Math.min(100, score)) / 100) * circumference;
  const meta = VERDICT_META[verdict];
  const strokeColor =
    verdict === 'broken'
      ? '#dc2626'
      : verdict === 'needs_work'
      ? '#ea580c'
      : verdict === 'ok'
      ? '#d97706'
      : verdict === 'good'
      ? '#059669'
      : '#0284c7';

  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums">{score}</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">score</span>
      </div>
      <div className="sr-only">{meta.label}</div>
    </div>
  );
}

function PersonaRow({ persona }: { persona: { name: string; role: string; expected: string; verdict: string; reasoning: string } }) {
  const mismatch = persona.expected !== persona.verdict;
  const Icon =
    persona.verdict === 'yes'
      ? CheckCircle2
      : persona.verdict === 'no'
      ? XCircle
      : HelpCircle;
  const iconColor =
    persona.verdict === 'yes'
      ? 'text-emerald-600'
      : persona.verdict === 'no'
      ? 'text-red-600'
      : 'text-amber-600';
  return (
    <div className={`flex items-start gap-2 rounded-md p-2 text-xs ${mismatch ? 'bg-red-50 dark:bg-red-950/20' : 'bg-muted/30'}`}>
      <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium">{persona.name}</span>
          <span className="text-muted-foreground truncate">— {persona.role}</span>
          {mismatch && (
            <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
              mismatch
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 leading-snug">{persona.reasoning}</p>
      </div>
    </div>
  );
}

export default function IcpFitPreview({ input, auto = true }: IcpFitPreviewProps) {
  const { result, isLoading, error, run } = useIcpFit(input, { auto });

  // Empty state — before the user has typed anything meaningful.
  const hasContent =
    (input.icp_description?.trim()?.length || 0) > 0 ||
    (input.icp_titles?.length || 0) > 0 ||
    (input.pain_points || []).some((p) => p && p.trim().length > 0) ||
    (input.value_proposition?.trim()?.length || 0) > 0;

  if (!hasContent) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-4 text-center text-xs text-muted-foreground">
          <Sparkles className="mx-auto h-4 w-4 mb-1 opacity-60" />
          Fill in pain points, value proposition and titles — we'll analyze your ICP quality in real time.
        </CardContent>
      </Card>
    );
  }

  if (isLoading && !result) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Analyzing your ICP…
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (error && !result) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn't analyze ICP</AlertTitle>
        <AlertDescription className="flex items-center justify-between gap-2">
          <span className="text-xs">{error.message}</span>
          <button
            type="button"
            onClick={() => run()}
            className="text-xs font-medium underline underline-offset-2"
          >
            Retry
          </button>
        </AlertDescription>
      </Alert>
    );
  }

  if (!result) return null;

  const verdictMeta = VERDICT_META[result.verdict];
  const personas = result.simulation?.personas ?? [];
  const sortedSuggestions = [...(result.suggestions ?? [])].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
  );

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <ScoreRing score={result.score} verdict={result.verdict} />
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                ICP quality
                <Badge variant="secondary" className={`${verdictMeta.className} border-0 font-medium`}>
                  {verdictMeta.emoji} {verdictMeta.label}
                </Badge>
              </CardTitle>
              {result.projected && (
                <p className="text-xs text-muted-foreground mt-1">
                  Projected:{' '}
                  <span className={`font-medium ${TIER_COLORS[result.projected.acceptance_tier]}`}>
                    {result.projected.acceptance_tier} acceptance
                  </span>
                  {' · '}
                  <span className={`font-medium ${TIER_COLORS[result.projected.reply_tier]}`}>
                    {result.projected.reply_tier} reply rate
                  </span>
                </p>
              )}
            </div>
          </div>
          {isLoading && (
            <span className="text-[10px] text-muted-foreground animate-pulse">re-analyzing…</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {result.projected?.notes && (
          <p className="text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">
            {result.projected.notes}
          </p>
        )}

        {(result.strengths.length > 0 || result.weaknesses.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {result.strengths.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                  Strengths
                </p>
                <ul className="space-y-1">
                  {result.strengths.slice(0, 4).map((s, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.weaknesses.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-400">
                  Weaknesses
                </p>
                <ul className="space-y-1">
                  {result.weaknesses.slice(0, 4).map((w, i) => (
                    <li key={i} className="text-xs flex items-start gap-1.5">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-orange-600" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {sortedSuggestions.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Top suggestions
            </p>
            <ul className="space-y-1.5">
              {sortedSuggestions.slice(0, 3).map((s, i) => (
                <li key={i} className="text-xs rounded-md border border-border/60 bg-muted/20 p-2">
                  <div className="flex items-start gap-1.5">
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 h-4 uppercase ${
                        s.priority === 'high'
                          ? 'border-red-400 text-red-700'
                          : s.priority === 'medium'
                          ? 'border-amber-400 text-amber-700'
                          : 'border-muted-foreground/40'
                      }`}
                    >
                      {s.priority}
                    </Badge>
                    <div className="flex-1">
                      <p>{s.message}</p>
                      {s.example && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground italic">e.g. {s.example}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {personas.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Persona simulation
            </p>
            <div className="space-y-1">
              {personas.map((p, i) => (
                <PersonaRow key={`${p.name}-${i}`} persona={p} />
              ))}
            </div>
          </div>
        )}

        {!result.ai_available && (
          <p className="text-[10px] text-muted-foreground italic">
            AI critique unavailable — showing heuristic score only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
