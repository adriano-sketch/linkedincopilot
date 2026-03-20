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
  {
    key: 'agency',
    name: 'Agency',
    price: 'Custom',
    period: '',
    subtitle: 'multi-account teams',
    features: [
      '5,000 leads/month',
      '5 LinkedIn accounts',
      'Unlimited campaigns',
      'Batch DM approval',
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
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { plan: planKey },
      });
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
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
          Need multiple LinkedIn accounts? <a href="mailto:sale@scantosell.io" className="text-primary hover:underline font-medium">Contact sales</a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
