import { useState, useEffect, useRef, useCallback } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, ShieldCheck, Sparkles, RotateCcw, AlertTriangle, Play, UserCheck, UserX, AlertCircle } from 'lucide-react';

interface ProcessingProgressCardProps {
  leads: Array<{
    status: string;
    profile_enriched_at: string | null;
    icp_checked_at: string | null;
    icp_match: boolean | null;
    profile_quality_status?: string | null;
    profile_quality_checked_at?: string | null;
    error_message: string | null;
  }>;
  campaignProfileId?: string | null;
  onRetryEnrichment?: (campaignProfileId: string) => Promise<void>;
  onRetryIcpCheck?: (campaignProfileId: string) => Promise<void>;
}

export default function ProcessingProgressCard({ leads, campaignProfileId, onRetryEnrichment, onRetryIcpCheck }: ProcessingProgressCardProps) {
  const [retrying, setRetrying] = useState(false);
  const autoStartedRef = useRef<string | null>(null);

  const total = leads.length;
  const enriched = leads.filter(l => l.profile_enriched_at && !l.error_message).length;
  const errors = leads.filter(l => !!l.error_message).length;
  const processed = enriched + errors;
  const enrichable = total - errors;
  const icpChecked = leads.filter(l => l.icp_checked_at).length;
  const icpMatched = leads.filter(l => l.icp_match === true).length;
  const icpRejected = leads.filter(l => l.icp_match === false).length;
  const enrichmentDone = (enriched + errors) >= total && total > 0;
  const icpDone = icpChecked >= enrichable && enrichable > 0;
  const allDone = enrichmentDone && icpDone;
  const enrichPct = total > 0 ? Math.round(((enriched + errors) / total) * 100) : 0;
  const icpPct = enrichable > 0 ? Math.round((icpChecked / enrichable) * 100) : 0;
  const nonGhostErrors = leads.filter(l => !!l.error_message && l.profile_quality_status !== 'ghost').length;
  const nonGhostEnriched = leads.filter(l => l.profile_enriched_at && !l.error_message && l.profile_quality_status !== 'ghost').length;
  const nonGhostTotal = leads.filter(l => l.profile_quality_status !== 'ghost').length;
  const notStarted = nonGhostTotal > 0 && nonGhostEnriched === 0 && nonGhostErrors === 0;

  const nowMs = Date.now();
  const ENRICHMENT_STALL_MS = 45 * 60 * 1000;
  const ICP_STALL_MS = 30 * 60 * 1000;

  const latestEnrichmentAtMs = leads.reduce((max, lead) => {
    if (!lead.profile_enriched_at) return max;
    const ts = Date.parse(lead.profile_enriched_at);
    return Number.isNaN(ts) ? max : Math.max(max, ts);
  }, 0);

  const latestIcpAtMs = leads.reduce((max, lead) => {
    if (!lead.icp_checked_at) return max;
    const ts = Date.parse(lead.icp_checked_at);
    return Number.isNaN(ts) ? max : Math.max(max, ts);
  }, 0);

  const enrichmentInProgress = !notStarted && !enrichmentDone && (enriched + errors) > 0;
  const icpInProgress = enrichmentDone && !icpDone;

  const enrichmentStuck =
    enrichmentInProgress &&
    latestEnrichmentAtMs > 0 &&
    nowMs - latestEnrichmentAtMs > ENRICHMENT_STALL_MS;

  const icpStuck =
    icpInProgress &&
    latestIcpAtMs > 0 &&
    nowMs - latestIcpAtMs > ICP_STALL_MS;

  const isStuck = enrichmentStuck || icpStuck;
  const canActEnrichment = !retrying && !!campaignProfileId && !!onRetryEnrichment && (enrichmentStuck || notStarted);
  const canActIcp = !retrying && !!campaignProfileId && !!onRetryIcpCheck && icpStuck;
  const canAct = canActEnrichment || canActIcp;

  const handleRetry = useCallback(async () => {
    if (!campaignProfileId || retrying) return;
    setRetrying(true);
    try {
      if (!enrichmentDone && onRetryEnrichment) {
        await onRetryEnrichment(campaignProfileId);
      } else if (enrichmentDone && !icpDone && onRetryIcpCheck) {
        await onRetryIcpCheck(campaignProfileId);
      }
    } finally {
      setRetrying(false);
    }
  }, [campaignProfileId, onRetryEnrichment, onRetryIcpCheck, retrying, enrichmentDone, icpDone]);

  // Auto-start enrichment once per campaign
  useEffect(() => {
    if (
      notStarted &&
      campaignProfileId &&
      onRetryEnrichment &&
      !retrying &&
      autoStartedRef.current !== campaignProfileId
    ) {
      autoStartedRef.current = campaignProfileId;
      const timer = setTimeout(() => {
        handleRetry();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [notStarted, campaignProfileId, handleRetry]);

  if (total === 0) return null;

  // Show completion summary
  if (allDone) {
    return (
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Processing Complete</p>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center gap-2 bg-background rounded-lg p-2.5">
              <UserCheck className="w-4 h-4 text-primary shrink-0" />
              <div>
                <p className="text-lg font-bold leading-none">{icpMatched}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">ICP Match</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background rounded-lg p-2.5">
              <UserX className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-lg font-bold leading-none">{icpRejected}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Rejected</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-background rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              <div>
                <p className="text-lg font-bold leading-none">{errors}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Not Found</p>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            {enriched} of {total} profiles enriched · {icpMatched} qualified leads ready for outreach
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Processing Leads</p>
          {canAct && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5"
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : notStarted ? (
                <Play className="w-3 h-3" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              {retrying ? 'Processing…' : notStarted ? 'Start' : 'Retry'}
            </Button>
          )}
          {retrying && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Processing…
            </span>
          )}
        </div>

        {/* Enrichment progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              {enrichmentDone ? (
                <CheckCircle2 className="w-4 h-4 text-primary" />
              ) : retrying || (enrichmentInProgress && !enrichmentStuck) ? (
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
              <Sparkles className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">Enrich Profiles</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {processed} / {total}
              <span className="ml-1">
                ({enriched} enriched{errors > 0 ? ` · ${errors} not found` : ''})
              </span>
            </span>
          </div>
          <Progress value={enrichPct} className="h-2" />
        </div>

        {/* ICP Validation progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5">
              {icpDone ? (
                <CheckCircle2 className="w-4 h-4 text-primary" />
              ) : enrichmentDone ? (
                retrying || (icpInProgress && !icpStuck) ? (
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                )
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-border" />
              )}
              <ShieldCheck className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="font-medium">ICP Validation</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {icpChecked} / {enrichable}
            </span>
          </div>
          <Progress value={icpPct} className="h-2" />
        </div>

        {retrying && (
          <p className="text-[11px] text-muted-foreground">
            Enriching profiles via our magic AI agents — processing 3 leads per batch…
          </p>
        )}
        {!retrying && notStarted && qualityDone && (
          <p className="text-[11px] text-amber-600">
            Enrichment starting automatically…
          </p>
        )}
        {!retrying && !notStarted && !allDone && !isStuck && (
          <p className="text-[11px] text-muted-foreground">
            Processing in background — progress updates automatically.
          </p>
        )}
        {!retrying && isStuck && (
          <p className="text-[11px] text-amber-600">
            Processing stalled — click Retry to resume.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
