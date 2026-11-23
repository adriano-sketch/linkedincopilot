import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useEffect, useRef, useState } from 'react';

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
  leads_processed_this_cycle?: number;
  leads_used_this_cycle: number;
  linkedin_accounts_limit: number;
  max_campaigns: number;
  cycle_start_date: string;
  cycle_reset_date: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at?: string | null;
}

export function useUserPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const syncedRef = useRef(false);

  const { data: settings, isLoading, isError } = useQuery({
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

  useEffect(() => {
    if (!user || !settings || syncedRef.current) return;
    if (settings.plan === 'free' || (settings.max_leads_per_cycle || 0) <= 50) {
      syncedRef.current = true;
      supabase.functions.invoke('check-subscription')
        .then(() => queryClient.invalidateQueries({ queryKey: ['user_settings', user.id] }))
        .catch(() => {
          syncedRef.current = false;
        });
    }
  }, [user, settings, queryClient]);

  // Free trial: 14 days from sign-up, no card. Paid plans ignore it.
  const isPaid = plan === 'pro' || plan === 'agency';
  const trialEndsAt = settings?.trial_ends_at ? new Date(settings.trial_ends_at) : null;
  // The clock is state so an open page notices the day changing and the trial ending.
  const [now, setNow] = useState(() => Date.now());
  const trialEndMs = trialEndsAt ? trialEndsAt.getTime() : 0;
  useEffect(() => {
    // Refresh first: settings can arrive after the deadline passed, and the mount-time clock would
    // otherwise keep saying the trial is running.
    setNow(Date.now());
    if (isPaid || !trialEndMs || trialEndMs <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [isPaid, trialEndMs]);
  const trialMsLeft = trialEndsAt ? trialEndMs - now : 0;
  const trialDaysLeft = Math.max(0, Math.ceil(trialMsLeft / 86400000));
  const onTrial = !isPaid && trialMsLeft > 0;
  // While settings load we do not know yet: never flash "trial ended" at a paying customer.
  const hasAccess = !settings || isPaid || onTrial;

  return {
    settings,
    isLoading,
    /** The plan could not be read (and nothing is cached). */
    loadFailed: isError && !settings,
    onTrial,
    trialDaysLeft,
    hasAccess,
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
