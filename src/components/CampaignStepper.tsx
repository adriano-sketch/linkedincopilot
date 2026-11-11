import { Check, Eye, ShieldCheck, Camera, UserPlus, MessageSquare, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CampaignStepperProps {
  campaignStatus: string | null;
  /** 'growth' shows the relationship flow; counts come from growthCounts. */
  mode?: 'outreach' | 'growth';
  growthCounts?: { visited: number; postFound: number; liked: number; toApprove: number; engaged: number };
  leadsCount: number;
  icpCheckedCount?: number;
  pipelineCounts: {
    connection_sent: number;
    connected: number;
    dm_ready: number;
    ready_for_dm: number;
    dm_sent: number;
    replied: number;
  };
}

const STEPS = [
  {
    key: 'capture',
    label: 'Enrich Profiles',
    description: 'LinkedIn profiles are enriched via our AI agents for full data.',
    icon: Camera,
  },
  {
    key: 'icp_check',
    label: 'ICP Validation',
    description: 'Leads validated against ICP using enriched profile data.',
    icon: ShieldCheck,
  },
  {
    key: 'visit_follow',
    label: 'Visit & Follow',
    description: 'Profile is visited and followed — warming the lead.',
    icon: Eye,
  },
  {
    key: 'connect',
    label: 'AI Connection Note',
    description: 'Claude writes a personalized connection note using profile data.',
    icon: UserPlus,
  },
  {
    key: 'accept',
    label: 'Accept',
    description: 'Lead accepts the connection request.',
    icon: CheckCircle,
  },
  {
    key: 'dm',
    label: 'AI Generates DM',
    description: 'A personalized DM is generated from the captured profile.',
    icon: MessageSquare,
  },
  {
    key: 'followup',
    label: 'AI Follow-up',
    description: 'If no response, a contextual follow-up is sent automatically.',
    icon: Clock,
  },
];

function getStepStatus(step: typeof STEPS[0], props: CampaignStepperProps): 'completed' | 'active' | 'pending' | 'warning' {
  const { campaignStatus, pipelineCounts, icpCheckedCount = 0 } = props;

  switch (step.key) {
    case 'capture':
      if (icpCheckedCount > 0 || pipelineCounts.connection_sent > 0) return 'completed';
      if (props.leadsCount > 0 && campaignStatus === 'active') return 'active';
      if (props.leadsCount > 0) return 'active';
      return 'pending';
    case 'icp_check':
      if (icpCheckedCount > 0 || pipelineCounts.connection_sent > 0) return 'completed';
      if (props.leadsCount > 0) return 'active';
      return 'pending';
    case 'visit_follow':
      if (pipelineCounts.connection_sent > 0 || pipelineCounts.connected > 0) return 'completed';
      if (campaignStatus === 'active') return 'active';
      return 'pending';
    case 'connect':
      if (pipelineCounts.connected > 0) return 'completed';
      if (pipelineCounts.connection_sent > 0) return 'active';
      if (campaignStatus === 'active') return 'active';
      return 'pending';
    case 'accept':
      if (pipelineCounts.connected > 0) return 'completed';
      if (pipelineCounts.connection_sent > 0) return 'active';
      return 'pending';
    case 'dm':
      if (pipelineCounts.dm_sent > 0 || pipelineCounts.replied > 0) return 'completed';
      if (pipelineCounts.dm_ready > 0 || pipelineCounts.ready_for_dm > 0) return 'active';
      if (pipelineCounts.connected > 0) return 'active';
      return 'pending';
    case 'followup':
      if (pipelineCounts.replied > 0) return 'completed';
      if (pipelineCounts.dm_sent > 0) return 'active';
      return 'pending';
    default:
      return 'pending';
  }
}

const GROWTH_STEPS = [
  { key: 'pick', label: 'Contacts chosen', description: 'People from your own network that match who you described.', icon: UserPlus },
  { key: 'post', label: 'Find their post', description: 'Their own latest post, from the last 30 days. No reposts. A few contacts a day.', icon: Camera },
  { key: 'like', label: 'Like', description: 'The post gets a like in the same visit.', icon: CheckCircle },
  { key: 'comment', label: 'You approve the comment', description: 'A comment is drafted only when the post is about your subjects. Nothing is posted until you approve it.', icon: MessageSquare },
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
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Campaign Flow</p>
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
                  waitingOnUser ? 'bg-orange-50 border-orange-400 text-orange-600'
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
  if (props.mode === 'growth') return <GrowthStepper {...props} />;
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Campaign Flow</p>
        <div className="flex items-start gap-0">
          {STEPS.map((step, i) => {
            const status = getStepStatus(step, props);
            const Icon = step.icon;
            const isLast = i === STEPS.length - 1;

            return (
              <div key={step.key} className="flex-1 flex flex-col items-center relative">
                {!isLast && (
                  <div className={cn(
                    'absolute top-4 left-[calc(50%+16px)] right-[calc(-50%+16px)] h-0.5',
                    status === 'completed' ? 'bg-primary' : 'bg-border'
                  )} />
                )}
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center z-10 border-2 transition-colors',
                  status === 'completed' && 'bg-primary border-primary text-primary-foreground',
                  status === 'active' && 'bg-primary/10 border-primary text-primary',
                  status === 'warning' && 'bg-destructive/10 border-destructive text-destructive',
                  status === 'pending' && 'bg-muted border-border text-muted-foreground',
                )}>
                  {status === 'completed' ? <Check className="w-4 h-4" /> :
                   status === 'warning' ? <AlertCircle className="w-4 h-4" /> :
                   <Icon className="w-4 h-4" />}
                </div>
                <p className={cn(
                  'text-xs font-medium text-center mt-1.5 leading-tight',
                  status === 'completed' && 'text-primary',
                  status === 'active' && 'text-foreground',
                  status === 'warning' && 'text-destructive',
                  status === 'pending' && 'text-muted-foreground',
                )}>{step.label}</p>
                <p className="text-[10px] text-muted-foreground text-center mt-0.5 max-w-[120px] leading-tight hidden sm:block">{step.description}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
