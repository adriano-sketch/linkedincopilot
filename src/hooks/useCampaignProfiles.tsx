import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface CampaignProfile {
  id: string;
  user_id: string;
  name: string;
  is_default: boolean;
  is_template: boolean;
  campaign_objective: string;
  value_proposition: string | null;
  proof_points: string | null;
  icp_description: string | null;
  icp_titles: string[] | null;
  icp_locations: string[] | null;
  icp_industries: string[] | null;
  icp_employee_ranges: string[] | null;
  icp_job_titles: string[] | null;
  icp_company_size_min: number | null;
  icp_company_size_max: number | null;
  icp_keywords: string[] | null;
  icp_exclude_keywords: string[] | null;
  campaign_angle: string | null;
  pain_points: string[] | null;
  dm_tone: string;
  dm_example: string | null;
  status: string | null;
  vertical_id: string | null;
  custom_vertical: boolean | null;
  stage_connection_approved: boolean;
  stage_dm_approved: boolean;
  stage_followup_approved: boolean;
  created_at: string;
  updated_at: string;
}

export type CampaignProfileInsert = Omit<CampaignProfile, 'id' | 'created_at' | 'updated_at'>;

export function useCampaignProfiles() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaign_profiles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('campaign_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_template', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CampaignProfile[];
    },
    enabled: !!user,
  });

  const { data: templates } = useQuery({
    queryKey: ['campaign_templates', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('campaign_profiles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_template', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CampaignProfile[];
    },
    enabled: !!user,
  });

  const defaultCampaign = campaigns?.find(c => c.is_default) || campaigns?.[0] || null;

  const createCampaign = useMutation({
    mutationFn: async (campaign: Partial<CampaignProfileInsert>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('campaign_profiles')
        .insert({ ...campaign, user_id: user.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as CampaignProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_profiles', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['campaign_templates', user?.id] });
    },
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<CampaignProfile>) => {
      const { error } = await supabase
        .from('campaign_profiles')
        .update(updates as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_profiles', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['campaign_templates', user?.id] });
    },
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('campaign_profiles')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_profiles', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['campaign_templates', user?.id] });
    },
  });

  const duplicateCampaign = useMutation({
    mutationFn: async (campaign: CampaignProfile) => {
      if (!user) throw new Error('Not authenticated');
      const { id, created_at, updated_at, ...rest } = campaign;
      const { data, error } = await supabase
        .from('campaign_profiles')
        .insert({ ...rest, user_id: user.id, name: `${rest.name} (copy)`, is_default: false } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_profiles', user?.id] });
    },
  });

  const saveAsTemplate = useMutation({
    mutationFn: async (campaign: CampaignProfile) => {
      if (!user) throw new Error('Not authenticated');
      const { id, created_at, updated_at, ...rest } = campaign;
      const { error } = await supabase
        .from('campaign_profiles')
        .insert({ ...rest, user_id: user.id, name: `${rest.name} (template)`, is_template: true, is_default: false } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign_templates', user?.id] });
      toast.success('Saved as template');
    },
  });

  return {
    campaigns: campaigns || [],
    templates: templates || [],
    defaultCampaign,
    isLoading,
    createCampaign,
    updateCampaign,
    deleteCampaign,
    duplicateCampaign,
    saveAsTemplate,
  };
}
