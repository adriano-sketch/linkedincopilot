import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface CampaignLead {
  id: string;
  user_id: string;
  campaign_profile_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string;
  location: string | null;
  industry: string | null;
  source: string | null;
  apollo_person_id: string | null;
  status: string;
  connection_sent_at: string | null;
  connected_at: string | null;
  connection_accepted_at: string | null;
  connection_verified?: boolean | null;
  connection_verified_at?: string | null;
  connection_verification_note?: string | null;
  dm_generated_at: string | null;
  dm_sent_at: string | null;
  followup_due_at: string | null;
  followup_sent_at: string | null;
  replied_at: string | null;
  snapshot_id: string | null;
  linkedin_event_id: string | null;
  dm_text: string | null;
  follow_up_text: string | null;
  connection_note: string | null;
  custom_dm: string | null;
  custom_followup: string | null;
  approved_at: string | null;
  icp_match: boolean | null;
  icp_match_reason: string | null;
  icp_checked_at: string | null;
  profile_snapshot: any | null;
  profile_headline: string | null;
  profile_about: string | null;
  profile_current_title: string | null;
  profile_current_company: string | null;
  profile_enriched_at: string | null;
  profile_quality_status?: string | null;
  profile_quality_checked_at?: string | null;
  profile_quality_note?: string | null;
  messages_generated_at: string | null;
  dm_approved: boolean;
  dm_approved_at: string | null;
  dm_edited_by_user: boolean;
  sequence_step: number;
  next_action_at: string | null;
  profile_visited_at: string | null;
  followed_at: string | null;
  post_liked_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export function useCampaignLeads(campaignProfileId?: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: leads, isLoading } = useQuery({
    queryKey: ['campaign_leads', user?.id, campaignProfileId],
    queryFn: async () => {
      if (!user) return [];

      const PAGE_SIZE = 1000;
      const allLeads: CampaignLead[] = [];
      let from = 0;

      while (true) {
        let query = supabase
          .from('campaign_leads')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (campaignProfileId) {
          query = query.eq('campaign_profile_id', campaignProfileId);
        }

        const { data, error } = await query;
        if (error) throw error;

        const page = (data ?? []) as CampaignLead[];
        allLeads.push(...page);

        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return allLeads;
    },
    enabled: !!user,
    refetchInterval: campaignProfileId ? 10000 : 20000,
    refetchIntervalInBackground: true,
  });

  const updateLeadStatus = useMutation({
    mutationFn: async ({ leadId, status, extras }: { leadId: string; status: string; extras?: Record<string, unknown> }) => {
      const updateData: Record<string, unknown> = { status, ...extras };
      const { error } = await supabase
        .from('campaign_leads')
        .update(updateData)
        .eq('id', leadId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_leads', user?.id] });
    },
    onError: (error) => {
      toast.error('Failed to update lead: ' + error.message);
    },
  });

  const importLeads = useMutation({
    mutationFn: async (newLeads: Array<Partial<CampaignLead>>) => {
      if (!user) throw new Error('Not authenticated');
      const leadsWithUser = newLeads.map(l => ({ ...l, user_id: user.id }));
      const { data, error } = await supabase
        .from('campaign_leads')
        .insert(leadsWithUser as any)
        .select();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_leads', user?.id] });
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['campaign_leads', user?.id] });
  };

  // Realtime subscription for live updates (after all hooks)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('campaign-leads-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'campaign_leads',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['campaign_leads', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const pipelineCounts = {
    new: 0,
    ready: 0,
    imported: 0,
    queued_for_connection: 0,
    visiting_profile: 0,
    following: 0,
    connection_sent: 0,
    connected: 0,
    connection_accepted: 0,
    dm_ready: 0,
    dm_queued: 0,
    ready_for_dm: 0,
    dm_sent: 0,
    waiting_reply: 0,
    follow_up_due: 0,
    follow_up_sent: 0,
    replied: 0,
    no_reply: 0,
    skipped: 0,
    ghost: 0,
    do_not_contact: 0,
    icp_rejected: 0,
    connection_rejected: 0,
    dm_pending_approval: 0,
    error: 0,
  };

  (leads || []).forEach(l => {
    const key = l.status as keyof typeof pipelineCounts;
    if (key in pipelineCounts) pipelineCounts[key]++;
    if (l.profile_quality_status === 'ghost') pipelineCounts.ghost++;
  });

  return {
    leads: leads || [],
    isLoading,
    pipelineCounts,
    updateLeadStatus,
    importLeads,
    refresh,
  };
}
