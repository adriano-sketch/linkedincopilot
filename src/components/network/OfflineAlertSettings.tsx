import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

// The offline-alert columns are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const ALERT_COLUMNS = 'offline_alerts_enabled, offline_alerts_snoozed_until';

type AlertSettings = { offline_alerts_enabled: boolean | null; offline_alerts_snoozed_until: string | null };

/** "Email me when the extension stops" switch, with a pause for trips and holidays. */
export default function OfflineAlertSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['offline-alert-settings', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<AlertSettings | null> => {
      const { data, error } = await db.from('extension_status').select(ALERT_COLUMNS).eq('user_id', user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const save = useMutation({
    mutationFn: async (patch: Partial<AlertSettings>) => {
      const { error } = await db.from('extension_status').update(patch).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['offline-alert-settings'] }),
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : 'Could not save'),
  });

  if (!data) return null;
  const enabled = data.offline_alerts_enabled !== false;
  const snoozedUntil = data.offline_alerts_snoozed_until && new Date(data.offline_alerts_snoozed_until) > new Date()
    ? new Date(data.offline_alerts_snoozed_until) : null;
  const snooze = (days: number) => save.mutate(
    { offline_alerts_snoozed_until: new Date(Date.now() + days * 24 * 3600 * 1000).toISOString() },
    { onSuccess: () => toast.success(`Alerts paused for ${days} days`) },
  );

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Label htmlFor="offline-alerts">Email me when the extension stops</Label>
          <p className="text-xs text-muted-foreground">
            One email when the extension has been silent for an hour during your active hours and actions are waiting.
            No second email until it has come back and stopped again.
          </p>
        </div>
        <Switch id="offline-alerts" checked={enabled} disabled={save.isPending}
          onCheckedChange={v => save.mutate({ offline_alerts_enabled: v })} />
      </div>
      {enabled && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {snoozedUntil ? (
            <>
              <span>Paused until {snoozedUntil.toLocaleDateString()}.</span>
              <Button variant="outline" size="sm" disabled={save.isPending}
                onClick={() => save.mutate({ offline_alerts_snoozed_until: null })}>Resume alerts</Button>
            </>
          ) : (
            <>
              <span>Away for a while?</span>
              <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => snooze(7)}>Pause 7 days</Button>
              <Button variant="outline" size="sm" disabled={save.isPending} onClick={() => snooze(14)}>Pause 14 days</Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
