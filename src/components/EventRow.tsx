import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Copy, ExternalLink, Loader2, Camera, Check, Send, MessageCircle, Ban, Reply, Clock, CalendarClock, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, addDays } from 'date-fns';
import { CampaignProfile } from '@/hooks/useCampaignProfiles';

const FOLLOWUP_DELAY_DAYS = 4;

interface EventRowProps {
  event: {
    id: string;
    name: string;
    title: string | null;
    company: string | null;
    linkedin_url: string | null;
    detected_at: string | null;
    status: string;
    dm_status: string | null;
    dm_sent_at: string | null;
    last_followup_at: string | null;
    campaign_profile_id?: string | null;
    generated_messages: Array<{ dm1: string | null; followup1: string | null }>;
    profile_snapshots: Array<{ id: string }>;
  };
  onUpdateDmStatus: (eventId: string, dmStatus: string, extras?: Record<string, unknown>) => void;
  isUpdating: boolean;
  campaigns?: CampaignProfile[];
  onReassign?: (eventId: string, campaignId: string) => void;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

const DM_STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon?: React.ReactNode }> = {
  NEEDS_SNAPSHOT: { label: 'Needs Snapshot', variant: 'outline', icon: <Camera className="w-3 h-3 mr-1" /> },
  READY_TO_SEND: { label: 'Ready to Send', variant: 'default', icon: <Send className="w-3 h-3 mr-1" /> },
  SENT: { label: 'DM Sent', variant: 'secondary', icon: <Check className="w-3 h-3 mr-1" /> },
  REPLIED: { label: 'Replied ✅', variant: 'default', icon: <Reply className="w-3 h-3 mr-1" /> },
  NO_REPLY: { label: 'No Reply', variant: 'outline', icon: <Clock className="w-3 h-3 mr-1" /> },
  DO_NOT_CONTACT: { label: 'Do Not Contact', variant: 'destructive', icon: <Ban className="w-3 h-3 mr-1" /> },
  SKIPPED: { label: 'Skipped', variant: 'outline', icon: <Ban className="w-3 h-3 mr-1" /> },
};

export default function EventRow({ event, onUpdateDmStatus, isUpdating, campaigns, onReassign, isSelected, onToggleSelect }: EventRowProps) {
  const dmStatus = event.dm_status || 'NEEDS_SNAPSHOT';
  const statusConfig = DM_STATUS_CONFIG[dmStatus] || DM_STATUS_CONFIG.NEEDS_SNAPSHOT;
  const msg = event.generated_messages?.[0];

  const copyToClipboard = (text: string | null, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const handleMarkDmSent = () => {
    onUpdateDmStatus(event.id, 'SENT', { dm_sent_at: new Date().toISOString() });
    toast.success('DM marked as sent');
  };

  const handleUndoDmSent = () => {
    onUpdateDmStatus(event.id, 'READY_TO_SEND', { dm_sent_at: null, last_followup_at: null });
    toast.info('DM status reverted');
  };

  const handleMarkFollowupSent = () => {
    onUpdateDmStatus(event.id, 'SENT', { last_followup_at: new Date().toISOString() });
    toast.success('Follow-up marked as sent');
  };

  const handleMarkReplied = () => { onUpdateDmStatus(event.id, 'REPLIED'); toast.success('Marked as replied'); };
  const handleMarkNoReply = () => { onUpdateDmStatus(event.id, 'NO_REPLY'); };
  const handleDoNotContact = () => { onUpdateDmStatus(event.id, 'DO_NOT_CONTACT'); toast.info('Contact blocked'); };

  const dmSentAt = event.dm_sent_at ? new Date(event.dm_sent_at) : null;
  const followupSentAt = event.last_followup_at ? new Date(event.last_followup_at) : null;
  const followupDate = dmSentAt ? addDays(dmSentAt, FOLLOWUP_DELAY_DAYS) : null;
  const now = new Date();
  const daysUntilFollowup = followupDate ? differenceInDays(followupDate, now) : null;
  const followupReady = daysUntilFollowup !== null && daysUntilFollowup <= 0;

  const currentCampaign = campaigns?.find(c => c.id === (event as any).campaign_profile_id);

  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      <td className="px-2 py-3">
        {onToggleSelect && <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />}
      </td>
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-sm">{event.name}</p>
          {event.title && <p className="text-xs text-muted-foreground">{event.title}</p>}
          {event.linkedin_url && (
            <a href={event.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-1">
              Profile <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{event.company || '—'}</td>
      <td className="px-4 py-3">
        {campaigns && onReassign ? (
          <Select value={(event as any).campaign_profile_id || ''} onValueChange={v => onReassign(event.id, v)}>
            <SelectTrigger className="h-7 text-xs w-[140px]">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">{currentCampaign?.name || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={statusConfig.variant} className="text-xs">
          {event.status === 'GENERATING' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          {event.status !== 'GENERATING' && statusConfig.icon}
          {statusConfig.label}
        </Badge>
        {dmSentAt && dmStatus === 'SENT' && <p className="text-[10px] text-muted-foreground mt-0.5">DM sent {format(dmSentAt, 'MMM d')}</p>}
        {followupSentAt && dmStatus === 'SENT' && <p className="text-[10px] text-muted-foreground">Follow-up sent {format(followupSentAt, 'MMM d')}</p>}
        {dmSentAt && !followupSentAt && dmStatus === 'SENT' && !followupReady && daysUntilFollowup !== null && (
          <p className="text-[10px] text-amber-500 flex items-center gap-0.5 mt-0.5"><CalendarClock className="w-3 h-3" /> Follow-up in {daysUntilFollowup}d</p>
        )}
        {dmSentAt && !followupSentAt && dmStatus === 'SENT' && followupReady && (
          <p className="text-[10px] text-primary font-medium flex items-center gap-0.5 mt-0.5"><Send className="w-3 h-3" /> Follow-up ready!</p>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {dmStatus === 'READY_TO_SEND' && msg && (
            <>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyToClipboard(msg.dm1, 'DM')}><Copy className="w-3 h-3 mr-1" /> DM</Button></TooltipTrigger>
                <TooltipContent className="max-w-xs"><p className="text-xs">{msg.dm1}</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyToClipboard(msg.followup1, 'Follow-up')}><Copy className="w-3 h-3 mr-1" /> FU</Button></TooltipTrigger>
                <TooltipContent className="max-w-xs"><p className="text-xs">{msg.followup1}</p></TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger><Button size="sm" variant="default" className="h-7 text-xs" onClick={handleMarkDmSent} disabled={isUpdating}><Send className="w-3 h-3 mr-1" /> Sent</Button></TooltipTrigger>
                <TooltipContent><p className="text-xs">Mark DM as sent</p></TooltipContent></Tooltip>
            </>
          )}
          {dmStatus === 'SENT' && msg && (
            <>
              {!followupSentAt && (followupReady ? (
                <>
                  <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyToClipboard(msg.followup1, 'Follow-up')}><Copy className="w-3 h-3 mr-1" /> FU</Button></TooltipTrigger>
                    <TooltipContent className="max-w-xs"><p className="text-xs">{msg.followup1}</p></TooltipContent></Tooltip>
                  <Button size="sm" variant="default" className="h-7 text-xs" onClick={handleMarkFollowupSent} disabled={isUpdating}><Send className="w-3 h-3 mr-1" /> FU Sent</Button>
                </>
              ) : (
                <Tooltip><TooltipTrigger asChild><Button size="sm" variant="ghost" className="h-7 text-xs cursor-default opacity-50" disabled><CalendarClock className="w-3 h-3 mr-1" /> Pending</Button></TooltipTrigger>
                  <TooltipContent><p className="text-xs">Available {followupDate ? format(followupDate, 'MMM d') : '—'}</p></TooltipContent></Tooltip>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleMarkReplied} disabled={isUpdating}><Reply className="w-3 h-3 mr-1" /> Replied</Button>
              <Tooltip><TooltipTrigger asChild><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleUndoDmSent} disabled={isUpdating}><Undo2 className="w-3 h-3" /></Button></TooltipTrigger>
                <TooltipContent><p className="text-xs">Undo</p></TooltipContent></Tooltip>
              {followupSentAt && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleMarkNoReply} disabled={isUpdating}><Clock className="w-3 h-3 mr-1" /> No Reply</Button>}
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDoNotContact} disabled={isUpdating}><Ban className="w-3 h-3 mr-1" /> Block</Button>
            </>
          )}
          {dmStatus === 'NO_REPLY' && msg && (
            <>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleMarkReplied} disabled={isUpdating}><Reply className="w-3 h-3 mr-1" /> Replied</Button>
              <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleDoNotContact} disabled={isUpdating}><Ban className="w-3 h-3 mr-1" /> Block</Button>
            </>
          )}
          {dmStatus === 'NEEDS_SNAPSHOT' && event.status !== 'GENERATING' && (
            <>
              <span className="text-xs text-muted-foreground">Use extension</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { onUpdateDmStatus(event.id, 'SKIPPED'); toast.info('Skipped'); }} disabled={isUpdating}><Ban className="w-3 h-3 mr-1" /> Skip</Button>
            </>
          )}
          {event.status === 'GENERATING' && <span className="text-xs text-muted-foreground">AI writing…</span>}
          {dmStatus === 'REPLIED' && <span className="text-xs text-muted-foreground italic">Conversation started</span>}
          {dmStatus === 'DO_NOT_CONTACT' && <span className="text-xs text-destructive font-medium">Blocked</span>}
          {dmStatus === 'SKIPPED' && <span className="text-xs text-muted-foreground italic">Skipped</span>}
        </div>
      </td>
    </tr>
  );
}
