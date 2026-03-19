import { Check, Eye, ShieldCheck, Camera, UserPlus, MessageSquare, Clock, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface CampaignStepperProps {
  campaignStatus: string | null;
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
    description: 'GPT-5 writes a personalized connection note using profile data.',
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

export default function CampaignStepper(props: CampaignStepperProps) {
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
