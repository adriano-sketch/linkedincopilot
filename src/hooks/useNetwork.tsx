import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import type { Database } from '@/integrations/supabase/types';

export type Icp = Database['public']['Tables']['icps']['Row'];
export type IcpInsert = Database['public']['Tables']['icps']['Insert'];
export type NetworkProspect = Database['public']['Tables']['network_prospects']['Row'];
export type MonitoredPost = Database['public']['Tables']['monitored_posts']['Row'];

export type NetworkStats = {
  period_days: number;
  invited: number;
  accepted: number;
  pending_invites: number;
  qualified_waiting: number;
  invited_last_7d: number;
  people_searches_this_month: number;
  comments_pending_approval: number;
  comments_posted: number;
  opportunities_open: number;
  by_icp: {
    icp_id: string;
    name: string;
    invited: number;
    accepted: number;
    acceptance_rate: number | null;
    pending: number;
    ready_to_invite: number;
  }[];
};

export function useIcps() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['icps', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icps')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as Icp[];
    },
  });

  const save = useMutation({
    mutationFn: async (icp: Partial<Icp> & { name: string }) => {
      const { id, created_at, updated_at, user_id, ...fields } = icp as Icp;
      if (id) {
        const { error } = await supabase.from('icps').update(fields).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('icps').insert({ ...fields, user_id: user!.id } as IcpInsert);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['icps'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('icps').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['icps'] }),
  });

  return { icps: query.data || [], isLoading: query.isLoading, save, remove };
}

export function useNetworkStats(days: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['network-stats', user?.id, days],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('network_stats', { p_days: days });
      if (error) throw error;
      return data as unknown as NetworkStats;
    },
  });
}

export function useNetworkProspects(status: 'accepted' | 'invited' | 'qualified', limit = 100) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['network-prospects', user?.id, status, limit],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      const orderCol = status === 'accepted' ? 'accepted_at' : status === 'invited' ? 'invited_at' : 'fit_score';
      const { data, error } = await supabase
        .from('network_prospects')
        .select('id, icp_id, linkedin_url, full_name, headline, location, mutual_connections, fit_score, fit_reason, status, invited_at, accepted_at')
        .eq('user_id', user!.id)
        .eq('status', status)
        .order(orderCol, { ascending: false, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return data as NetworkProspect[];
    },
  });
}

export type PostFilter = 'pending' | 'scheduled' | 'posted' | 'dismissed';

export function useMonitoredPosts(filter: PostFilter) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const statuses: Record<PostFilter, string[]> = {
    pending: ['pending'],
    scheduled: ['approved', 'queued'],
    posted: ['posted'],
    dismissed: ['dismissed', 'failed'],
  };

  const query = useQuery({
    queryKey: ['monitored-posts', user?.id, filter],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      let q = supabase
        .from('monitored_posts')
        .select('*')
        .eq('user_id', user!.id)
        .in('status', statuses[filter]);
      q = filter === 'pending'
        ? q.order('priority', { ascending: false }).order('created_at', { ascending: false })
        : q.order('updated_at', { ascending: false });
      const { data, error } = await q.limit(100);
      if (error) throw error;
      return data as MonitoredPost[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['monitored-posts'] });
    qc.invalidateQueries({ queryKey: ['network-stats'] });
  };

  const approve = useMutation({
    mutationFn: async ({ ids, edits }: { ids: string[]; edits: Record<string, string> }) => {
      const { data, error } = await supabase.rpc('approve_post_comments', { p_ids: ids, p_edits: edits });
      if (error) throw error;
      return data as number;
    },
    onSuccess: invalidate,
  });

  const dismiss = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('monitored_posts')
        .update({ status: 'dismissed', updated_at: new Date().toISOString() })
        .in('id', ids)
        .eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const saveDraft = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const { error } = await supabase
        .from('monitored_posts')
        .update({ final_comment: text, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending');
      if (error) throw error;
    },
  });

  const unschedule = useMutation({
    mutationFn: async (id: string) => {
      // Only possible while still 'approved' (not yet handed to the extension)
      const { error } = await supabase
        .from('monitored_posts')
        .update({ status: 'pending', approved_at: null, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'approved');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { posts: query.data || [], isLoading: query.isLoading, approve, dismiss, saveDraft, unschedule };
}

export type NetworkSettings = {
  linkedin_account_tier: 'free' | 'premium' | 'sales_navigator';
  weekly_invite_limit: number;
  daily_comment_limit: number;
  monthly_people_search_budget: number;
};

export function useNetworkSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['network-settings', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extension_status')
        .select('linkedin_account_tier, linkedin_tier_detected_at, sales_nav_failed_at, weekly_invite_limit, daily_comment_limit, monthly_people_search_budget, invites_paused_until, searches_paused_until, is_connected')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (s: NetworkSettings) => {
      const { error } = await supabase.from('extension_status').update(s).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['network-settings'] }),
  });
  return { settings: query.data, isLoading: query.isLoading, save };
}
