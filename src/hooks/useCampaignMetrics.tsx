import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type BenchmarkTier = 'poor' | 'ok' | 'good' | 'great';

export interface CampaignMetricsFunnel {
  total_leads: number;
  icp_approved: number;
  icp_rejected: number;
  visited: number;
  connection_requested: number;
  connected: number;
  dm_sent: number;
  replied: number;
  positive_replies: number;
  meetings_booked: number;
}

export interface CampaignMetricsRates {
  icp_pass_rate: number;
  icp_pass_tier: BenchmarkTier;
  connection_send_rate: number;
  connection_send_tier: BenchmarkTier;
  acceptance_rate: number;
  acceptance_tier: BenchmarkTier;
  dm_send_rate: number;
  dm_send_tier: BenchmarkTier;
  reply_rate: number;
  reply_tier: BenchmarkTier;
  positive_reply_rate: number;
  positive_reply_tier: BenchmarkTier;
  dm_to_meeting_rate: number;
  dm_to_meeting_tier: BenchmarkTier;
}

export interface CampaignMetricsDiagnosis {
  severity: 'info' | 'warn' | 'critical';
  code: string;
  message: string;
  recommendation: string;
}

export interface CampaignMetricsBlocker {
  stage: string;
  lost: number;
  conversion: number;
}

export interface CampaignMetricsResponse {
  user_id: string;
  campaign_profile_id: string | null;
  lifetime: {
    funnel: CampaignMetricsFunnel;
    rates: CampaignMetricsRates;
  };
  window: {
    days: number;
    funnel: CampaignMetricsFunnel;
    rates: CampaignMetricsRates;
  };
  benchmarks: Record<string, { poor: number; ok: number; good: number; great: number }>;
  diagnosis: CampaignMetricsDiagnosis[];
  top_blockers: CampaignMetricsBlocker[];
  credits: {
    used: number;
    max: number;
    remaining: number;
    cycle_start_at: string | null;
  } | null;
  messages_generated_total: number;
  updated_at: string;
}

interface UseCampaignMetricsOptions {
  campaignProfileId?: string;
  windowDays?: number;
  /** How often (ms) to refetch. Defaults to 60_000 (1 min). Pass 0 to disable. */
  refetchIntervalMs?: number;
}

/**
 * Calls the `campaign-metrics` edge function and returns the full funnel +
 * benchmark tiers + diagnosis + top blockers for the signed-in user.
 *
 * Used by the dashboard to render the pipeline health panel and by the
 * campaign detail view to show a per-campaign funnel.
 */
export function useCampaignMetrics(options: UseCampaignMetricsOptions = {}) {
  const { user } = useAuth();
  const { campaignProfileId, windowDays = 30, refetchIntervalMs = 60_000 } = options;

  const query = useQuery({
    queryKey: ['campaign_metrics', user?.id, campaignProfileId ?? null, windowDays],
    queryFn: async (): Promise<CampaignMetricsResponse | null> => {
      if (!user) return null;
      const { data, error } = await supabase.functions.invoke('campaign-metrics', {
        body: {
          user_id: user.id,
          campaign_profile_id: campaignProfileId,
          window_days: windowDays,
        },
      });
      if (error) throw error;
      return data as CampaignMetricsResponse;
    },
    enabled: !!user,
    refetchInterval: refetchIntervalMs > 0 ? refetchIntervalMs : false,
    staleTime: 30_000,
  });

  return {
    metrics: query.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error as Error | null,
    refetch: query.refetch,
  };
}
