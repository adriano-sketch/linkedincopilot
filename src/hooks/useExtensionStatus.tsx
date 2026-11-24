import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { browserTimezone } from '@/lib/timezones';

export function useExtensionStatus() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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

  // The extension creates this row with the column default for the time zone. The first time the
  // app sees it, the zone becomes the one this browser is in, so the active hours are the person's
  // own. Done once: the update only matches a row that is still unconfirmed, so a choice saved in
  // Settings is never replaced, and several pages or tabs doing this at once write a single time.
  // When the browser gives no usable zone the row stays unconfirmed, for another device to set.
  const statusId = extensionStatus?.id;
  const zoneUnset = (extensionStatus as { timezone_confirmed?: boolean } | null | undefined)?.timezone_confirmed === false;
  useEffect(() => {
    if (!statusId || !zoneUnset) return;
    const tz = browserTimezone();
    if (!tz) return;
    void supabase.from('extension_status')
      .update({ timezone: tz, timezone_confirmed: true } as never)
      .eq('id', statusId).eq('timezone_confirmed' as never, false as never)
      .then(({ error }) => {
        if (error) { console.error('useExtensionStatus: could not set the time zone', error); return; }
        void queryClient.invalidateQueries({ queryKey: ['extension-status'] });
        void queryClient.invalidateQueries({ queryKey: ['today-summary'] });
      });
  }, [statusId, zoneUnset, queryClient]);

  return { extensionStatus, isLoading, refetch };
}
