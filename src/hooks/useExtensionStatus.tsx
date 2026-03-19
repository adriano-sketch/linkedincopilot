import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useExtensionStatus() {
  const { user } = useAuth();

  const { data: extensionStatus, isLoading, refetch } = useQuery({
    queryKey: ['extension-status', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('extension_status')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
    refetchInterval: 5000, // poll every 5s for extension detection
  });

  return { extensionStatus, isLoading, refetch };
}
