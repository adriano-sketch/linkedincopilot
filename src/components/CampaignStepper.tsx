import { Check, Camera, UserPlus, MessageSquare, Clock, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CampaignStepperProps {
  growthCounts?: { visited: number; postFound: number; liked: number; toApprove: number; engaged: number };
  leadsCount: number;
}

const GROWTH_STEPS = [
  { key: 'pick', label: 'Contacts chosen', description: 'People from your own network that match who you described.', icon: UserPlus },
  { key: 'post', label: 'Find their post', description: 'Their own latest post, from the last 10 days. No reposts. People who rarely post are checked less often.', icon: Camera },
  { key: 'like', label: 'Post read', description: 'Olanovo reads the post. Likes are yours to give.', icon: CheckCircle },
  { key: 'comment', label: 'You post the comment', description: 'A comment is drafted only when the post is about your subjects. You review it and post it yourself from the Inbox.', icon: MessageSquare },
  { key: 'rest', label: 'Back in 7 days', description: 'The contact rests, then the cycle repeats with a new post.', icon: Clock },
];

function GrowthStepper({ leadsCount, growthCounts }: CampaignStepperProps) {
  const g = growthCounts || { visited: 0, postFound: 0, liked: 0, toApprove: 0, engaged: 0 };
  const reached = (key: string) => {
    switch (key) {
      case 'pick': return leadsCount > 0;
      case 'post': return g.postFound + g.liked + g.toApprove + g.engaged > 0;
      case 'like': return g.liked + g.toApprove + g.engaged > 0;
      case 'comment': return g.toApprove + g.engaged > 0;
      case 'rest': return g.engaged > 0;
      default: return false;
    }
  };
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">How this list works</p>
        <div className="flex items-start gap-0">
          {GROWTH_STEPS.map((step, i) => {
            const done = reached(step.key);
            const waitingOnUser = step.key === 'comment' && g.toApprove > 0;
            const Icon = step.icon;
            const isLast = i === GROWTH_STEPS.length - 1;
            return (
              <div key={step.key} className="flex-1 flex flex-col items-center relative">
                {!isLast && <div className={cn('absolute top-4 left-[calc(50%+16px)] right-[calc(-50%+16px)] h-0.5', done ? 'bg-primary' : 'bg-border')} />}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center z-10 border-2 transition-colors',
                  waitingOnUser ? 'bg-attention/5 border-attention text-attention'
                    : done ? 'bg-primary border-primary text-primary-foreground'
                    : 'bg-muted border-border text-muted-foreground',
                )}>
                  {done && !waitingOnUser ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <p className={cn('text-xs font-medium text-center mt-1.5 leading-tight', done ? 'text-foreground' : 'text-muted-foreground')}>
                  {step.label}{waitingOnUser ? ` (${g.toApprove})` : ''}
                </p>
                <p className="text-[10px] text-muted-foreground text-center mt-0.5 leading-tight px-1 hidden sm:block">{step.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CampaignStepper(props: CampaignStepperProps) {
  return <GrowthStepper {...props} />;
}
