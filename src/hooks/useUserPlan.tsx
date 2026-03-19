import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export const PLAN_LIMITS = {
  free: {
    max_leads_per_cycle: 50,
    max_campaigns: 1,
    linkedin_accounts: 1,
    batch_approve: false,
    csv_upload: false,
    label: 'Free',
  },
  pro: {
    max_leads_per_cycle: 1000,
    max_campaigns: -1,
    linkedin_accounts: 1,
    batch_approve: true,
    csv_upload: true,
    label: 'Pro',
  },
  agency: {
    max_leads_per_cycle: 5000,
    max_campaigns: -1,
    linkedin_accounts: 5,
    batch_approve: true,
    csv_upload: true,
    label: 'Agency',
  },
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export interface UserSettings {
  id: string;
  user_id: string;
  plan: PlanType;
  max_leads_per_cycle: number;
  leads_used_this_cycle: number;
  linkedin_accounts_limit: number;
  max_campaigns: number;
  cycle_start_date: string;
  cycle_reset_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export function useUserPlan() {
  const { user } = useAuth();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['user_settings', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data as UserSettings | null;
    },
    enabled: !!user,
  });

  const plan = (settings?.plan || 'free') as PlanType;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  const leadsUsed = settings?.leads_used_this_cycle || 0;
  const leadsLimit = settings?.max_leads_per_cycle || limits.max_leads_per_cycle;
  const leadsRemaining = Math.max(0, leadsLimit - leadsUsed);
  const cycleResetDate = settings?.cycle_reset_date;

  return {
    settings,
    isLoading,
    plan,
    limits,
    leadsUsed,
    leadsLimit,
    leadsRemaining,
    cycleResetDate,
    isPro: plan === 'pro' || plan === 'agency',
    isAgency: plan === 'agency',
    isFree: plan === 'free',
  };
}
