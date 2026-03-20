import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Check, Crown, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const PLANS = [
  {
    key: 'pro',
    name: 'Pro',
    price: '$97',
    period: '/mo',
    subtitle: 'per LinkedIn account',
    features: [
      '1,000 leads/month',
      'Unlimited campaigns',
      'Batch DM approval',
      'CSV upload',
      'Priority support',
    ],
  },
];

interface UpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UpgradeModal({ open, onOpenChange }: UpgradeModalProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleCheckout = async (planKey: string) => {
    setLoading(planKey);
    try {
      const getAccessToken = async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.access_token) return sessionData.session.access_token;
        const { data: refreshed } = await supabase.auth.refreshSession();
        return refreshed.session?.access_token || null;
      };
      let token = await getAccessToken();
      if (!token) throw new Error('Your session expired. Please log in again.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnon) {
        throw new Error('Supabase env vars missing. Please refresh and try again.');
      }

      const decodeJwt = (jwt: string) => {
        try {
          const base64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const json = decodeURIComponent(atob(base64).split('').map(c => `%${('00' + c.charCodeAt(0).toString(16)).slice(-2)}`).join(''));
          return JSON.parse(json);
        } catch {
          return null;
        }
      };

      const expectedHost = new URL(supabaseUrl).host;
      const payload = token ? decodeJwt(token) : null;
      if (payload?.iss && !String(payload.iss).includes(expectedHost)) {
        throw new Error('Supabase URL/ANON do not match the session token. Check Vercel env vars.');
      }

      const doRequest = async (accessToken: string) => fetch(`${supabaseUrl}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ plan: planKey }),
      });

      let resp = await doRequest(token);
      if (resp.status === 401) {
        const refreshedToken = await getAccessToken();
        if (refreshedToken) {
          token = refreshedToken;
          resp = await doRequest(token);
        }
      }

      const responseBody = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const message = responseBody?.error || (resp.status === 401
          ? 'Checkout failed (401). Please log out and log in again.'
          : `Checkout failed (${resp.status})`);
        throw new Error(message);
      }

      if (responseBody?.url) {
        window.open(responseBody.url, '_blank');
      } else {
        throw new Error('Checkout URL not returned. Please try again.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-primary" /> Upgrade Your Plan
          </DialogTitle>
          <DialogDescription>
            Choose a plan to unlock more leads and features.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 max-w-sm mx-auto">
          {PLANS.map((plan) => (
            <Card key={plan.key} className="border-primary ring-1 ring-primary/20">
              <CardContent className="p-5 flex flex-col h-full">
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <div className="mt-1">
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  <span className="text-muted-foreground text-sm">{plan.period}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.subtitle}</p>
                <ul className="space-y-2 text-sm mt-4 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4 w-full"
                  disabled={loading !== null}
                  onClick={() => handleCheckout(plan.key)}
                >
                  {loading === plan.key ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Processing...</>
                  ) : (
                    `Subscribe to ${plan.name}`
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-center text-muted-foreground mt-4">
          Need higher volume? <a href="mailto:sale@scantosell.io" className="text-primary hover:underline font-medium">Contact sales</a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
