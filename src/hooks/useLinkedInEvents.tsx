import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export function useLinkedInEvents() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: events, isLoading } = useQuery({
    queryKey: ['linkedin_events', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('linkedin_events')
        .select(`
          *,
          generated_messages(*),
          profile_snapshots(*)
        `)
        .eq('user_id', user.id)
        .order('detected_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const updateDmStatus = useMutation({
    mutationFn: async ({ eventId, dmStatus, extras }: { 
      eventId: string; 
      dmStatus: string; 
      extras?: Record<string, unknown>;
    }) => {
      const updateData: Record<string, unknown> = { dm_status: dmStatus, ...extras };
      const { error } = await supabase
        .from('linkedin_events')
        .update(updateData)
        .eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['linkedin_events', user?.id] });
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['linkedin_events', user?.id] });
  };

  return { events: events || [], isLoading, refresh, updateDmStatus };
}
