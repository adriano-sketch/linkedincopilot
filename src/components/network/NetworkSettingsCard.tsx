import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNetworkSettings, type NetworkSettings } from '@/hooks/useNetwork';

const BUDGET_BY_TIER: Record<NetworkSettings['linkedin_account_tier'], number> = {
  free: 250,
  premium: 250,
  sales_navigator: 2000,
};

export default function NetworkSettingsCard() {
  const { settings, isLoading, save } = useNetworkSettings();
  const [form, setForm] = useState<NetworkSettings | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        linkedin_account_tier: (settings.linkedin_account_tier as NetworkSettings['linkedin_account_tier']) || 'free',
        weekly_invite_limit: settings.weekly_invite_limit ?? 100,
        daily_comment_limit: settings.daily_comment_limit ?? 20,
        monthly_people_search_budget: settings.monthly_people_search_budget ?? 250,
      });
    }
  }, [settings]);

  if (isLoading) return null;
  if (!settings || !form) {
    return (
      <Alert>
        <AlertDescription>Install and log in to the Chrome extension first. Limits are saved per LinkedIn account.</AlertDescription>
      </Alert>
    );
  }

  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n || 0)));
  const pausedUntil = (iso?: string | null) => (iso && new Date(iso) > new Date() ? new Date(iso).toLocaleString() : null);
  const invitesPaused = pausedUntil(settings.invites_paused_until);
  const searchesPaused = pausedUntil(settings.searches_paused_until);

  const submit = async () => {
    try {
      await save.mutateAsync({
        ...form,
        weekly_invite_limit: clamp(form.weekly_invite_limit, 0, 200),
        daily_comment_limit: clamp(form.daily_comment_limit, 0, 40),
        monthly_people_search_budget: clamp(form.monthly_people_search_budget, 0, 3000),
      });
      toast.success('Limits saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Safety limits</CardTitle>
        <CardDescription>
          LinkedIn limits invitations per week and, on free accounts, people searches per month. Staying under them protects your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(invitesPaused || searchesPaused) && (
          <Alert>
            <AlertDescription>
              {invitesPaused && <div>Invites paused until {invitesPaused} (LinkedIn showed a limit warning).</div>}
              {searchesPaused && <div>People search paused until {searchesPaused} (monthly search limit reached).</div>}
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>LinkedIn account</Label>
            <Select
              value={form.linkedin_account_tier}
              onValueChange={v => {
                const tier = v as NetworkSettings['linkedin_account_tier'];
                setForm({ ...form, linkedin_account_tier: tier, monthly_people_search_budget: BUDGET_BY_TIER[tier] });
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="premium">Premium (Career / Business)</SelectItem>
                <SelectItem value="sales_navigator">Sales Navigator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Invites per week (max 200)</Label>
            <Input type="number" min={0} max={200} value={form.weekly_invite_limit}
              onChange={e => setForm({ ...form, weekly_invite_limit: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">100 is a safe default for most accounts.</p>
          </div>
          <div className="space-y-1">
            <Label>Comments per day (max 40)</Label>
            <Input type="number" min={0} max={40} value={form.daily_comment_limit}
              onChange={e => setForm({ ...form, daily_comment_limit: Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label>People searches per month</Label>
            <Input type="number" min={0} max={3000} value={form.monthly_people_search_budget}
              onChange={e => setForm({ ...form, monthly_people_search_budget: Number(e.target.value) })} />
            <p className="text-xs text-muted-foreground">Free accounts get roughly 300 per month. We keep a margin.</p>
          </div>
        </div>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save limits
        </Button>
      </CardContent>
    </Card>
  );
}
