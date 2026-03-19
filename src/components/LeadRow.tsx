import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ExternalLink, Camera, Send, Ban, Reply, Loader2, Clock, CheckCircle2, AlertTriangle, XCircle, Zap, Eye, UserPlus, MessageSquare, MailCheck, ShieldCheck, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, addDays, differenceInSeconds } from 'date-fns';
import { CampaignLead } from '@/hooks/useCampaignLeads';

const FOLLOWUP_DELAY_DAYS = 4;

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; bg: string; text: string; dot: string }> = {
  new:                    { label: 'New',               icon: <Zap className="w-3 h-3" />,            bg: 'bg-slate-100',    text: 'text-slate-600',   dot: 'bg-slate-400' },
  imported:               { label: 'Imported',          icon: <Zap className="w-3 h-3" />,            bg: 'bg-slate-100',    text: 'text-slate-600',   dot: 'bg-slate-400' },
  queued_for_connection:  { label: 'Queued',            icon: <Clock className="w-3 h-3" />,          bg: 'bg-slate-100',    text: 'text-slate-600',   dot: 'bg-slate-400' },
  visiting_profile:       { label: 'Visiting',          icon: <Eye className="w-3 h-3" />,            bg: 'bg-amber-50',     text: 'text-amber-700',   dot: 'bg-amber-400' },
  following:              { label: 'Following',         icon: <UserPlus className="w-3 h-3" />,       bg: 'bg-amber-50',     text: 'text-amber-700',   dot: 'bg-amber-400' },
  connection_sent:        { label: 'Invite Sent',       icon: <Send className="w-3 h-3" />,           bg: 'bg-blue-50',      text: 'text-blue-700',    dot: 'bg-blue-400' },
  connected:              { label: 'Connected',         icon: <CheckCircle2 className="w-3 h-3" />,   bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500' },
  dm_ready:               { label: 'Awaiting Approval', icon: <MessageSquare className="w-3 h-3" />,  bg: 'bg-orange-50',    text: 'text-orange-700',  dot: 'bg-orange-400' },
  ready_for_dm:           { label: 'DM Ready',          icon: <MailCheck className="w-3 h-3" />,      bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500' },
  dm_queued:              { label: 'DM Queued',         icon: <MailCheck className="w-3 h-3" />,      bg: 'bg-green-50',     text: 'text-green-700',   dot: 'bg-green-500' },
  dm_sent:                { label: 'DM Sent',           icon: <Send className="w-3 h-3" />,           bg: 'bg-sky-50',       text: 'text-sky-700',     dot: 'bg-sky-500' },
  follow_up_due:          { label: 'Follow-up Due',     icon: <Clock className="w-3 h-3" />,          bg: 'bg-orange-50',    text: 'text-orange-700',  dot: 'bg-orange-400' },
  follow_up_sent:         { label: 'FU Sent',           icon: <Send className="w-3 h-3" />,           bg: 'bg-sky-50',       text: 'text-sky-700',     dot: 'bg-sky-500' },
  replied:                { label: 'Replied',           icon: <Reply className="w-3 h-3" />,          bg: 'bg-emerald-50',   text: 'text-emerald-700', dot: 'bg-emerald-500' },
  no_reply:               { label: 'No Reply',          icon: <XCircle className="w-3 h-3" />,        bg: 'bg-red-50',       text: 'text-red-600',     dot: 'bg-red-400' },
  do_not_contact:         { label: 'Blocked',           icon: <Ban className="w-3 h-3" />,            bg: 'bg-red-50',       text: 'text-red-700',     dot: 'bg-red-500' },
  icp_rejected:           { label: 'ICP Rejected',      icon: <XCircle className="w-3 h-3" />,        bg: 'bg-red-50',       text: 'text-red-700',     dot: 'bg-red-500' },
  skipped:                { label: 'Skipped',           icon: <XCircle className="w-3 h-3" />,        bg: 'bg-slate-100',    text: 'text-slate-500',   dot: 'bg-slate-400' },
  error:                  { label: 'Error',             icon: <AlertTriangle className="w-3 h-3" />,  bg: 'bg-red-50',       text: 'text-red-700',     dot: 'bg-red-500' },
};

interface LeadRowProps {
  lead: CampaignLead;
  onUpdateStatus: (leadId: string, status: string, extras?: Record<string, unknown>) => void;
  isUpdating: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  showVerification?: boolean;
}

function displayName(lead: CampaignLead): string {
  if (lead.full_name) return lead.full_name;
  if (lead.first_name && lead.last_name) {
    if (lead.last_name.includes('*')) return `${lead.first_name} ${lead.last_name.charAt(0)}.`;
    return `${lead.first_name} ${lead.last_name}`;
  }
  return lead.first_name || 'Unknown';
}

function getInitials(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

const INITIALS_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-orange-100 text-orange-700',
  'bg-indigo-100 text-indigo-700',
];

function getInitialsColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

export default function LeadRow({ lead, onUpdateStatus, isUpdating, isSelected, onToggleSelect, showVerification }: LeadRowProps) {
  const config = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
  const name = displayName(lead);

  const dmSentAt = lead.dm_sent_at ? new Date(lead.dm_sent_at) : null;
  const followupDate = dmSentAt ? addDays(dmSentAt, FOLLOWUP_DELAY_DAYS) : null;
  const daysUntilFollowup = followupDate ? differenceInDays(followupDate, new Date()) : null;
  const followupReady = daysUntilFollowup !== null && daysUntilFollowup <= 0;

  const isAutoCapturing = lead.status === 'connected' && !lead.snapshot_id &&
    lead.connected_at && differenceInSeconds(new Date(), new Date(lead.connected_at)) < 120;
  const needsManualCapture = lead.status === 'connected' && !lead.snapshot_id &&
    lead.connected_at && differenceInSeconds(new Date(), new Date(lead.connected_at)) >= 120;

  const verificationLabel = (() => {
    if (!showVerification) return null;
    if (lead.connection_verified === true) return { text: 'Verified', tone: 'text-emerald-700 bg-emerald-50', icon: <ShieldCheck className="w-3 h-3" /> };
    if (lead.connection_verified === false) return { text: 'Not connected', tone: 'text-red-700 bg-red-50', icon: <ShieldAlert className="w-3 h-3" /> };
    if (['connection_sent', 'connected', 'connection_accepted'].includes(lead.status)) return { text: 'Pending', tone: 'text-amber-700 bg-amber-50', icon: <Clock className="w-3 h-3" /> };
    return { text: '—', tone: 'text-muted-foreground bg-muted/50', icon: null };
  })();
  const verificationAge = lead.connection_verified_at ? format(new Date(lead.connection_verified_at), 'MMM d') : null;

  return (
    <TooltipProvider delayDuration={300}>
      <tr className="group border-b border-border/60 hover:bg-accent/5 transition-all duration-150">
        {/* Checkbox */}
        <td className="px-3 py-3.5 w-10">
          {onToggleSelect && <Checkbox checked={isSelected} onCheckedChange={onToggleSelect} />}
        </td>

        {/* Name + Avatar */}
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${getInitialsColor(name)}`}>
              {getInitials(name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-foreground truncate">{name}</p>
                {lead.profile_quality_status === 'ghost' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                    👻 Ghost
                  </span>
                )}
              </div>
              {lead.title && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{lead.title}</p>}
              {lead.linkedin_url && (
                <a href={lead.linkedin_url} target="_blank" rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 text-[11px] font-medium inline-flex items-center gap-0.5 mt-0.5 transition-colors">
                  Profile <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          </div>
        </td>

        {/* Company */}
        <td className="px-4 py-3.5">
          <span className="text-sm text-foreground/80">{lead.company || <span className="text-muted-foreground/50">—</span>}</span>
        </td>

        {/* Location */}
        <td className="px-4 py-3.5">
          <span className="text-sm text-foreground/80">{lead.location || <span className="text-muted-foreground/50">—</span>}</span>
        </td>

        {/* Invite Note */}
        <td className="px-4 py-3.5 min-w-[260px] max-w-[340px]">
          {lead.connection_note ? (
            <p className="text-xs leading-relaxed text-muted-foreground whitespace-normal break-words italic">
              "{lead.connection_note}"
            </p>
          ) : <span className="text-muted-foreground/50 text-sm">—</span>}
        </td>

        {/* Status */}
        <td className="px-4 py-3.5">
          <div className="space-y-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${config.bg} ${config.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
              {config.label}
            </span>

            {isAutoCapturing && (
              <p className="text-[10px] text-primary flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Capturing...
              </p>
            )}
            {needsManualCapture && (
              <p className="text-[10px] text-amber-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Manual capture needed
              </p>
            )}
            {lead.status === 'dm_ready' && lead.dm_text && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[180px] cursor-help">
                    "{lead.dm_text.slice(0, 50)}..."
                  </p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="text-xs">{lead.dm_text}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {lead.status === 'dm_queued' && lead.dm_approved && (
              <p className="text-[10px] text-green-600 font-medium">✓ Approved & queued</p>
            )}
            {lead.profile_quality_status === 'pending' && (
              <p className="text-[10px] text-amber-600 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Quality scan pending
              </p>
            )}
            {dmSentAt && lead.status === 'dm_sent' && (
              <p className="text-[10px] text-muted-foreground">Sent {format(dmSentAt, 'MMM d')}</p>
            )}
            {dmSentAt && lead.status === 'dm_sent' && !followupReady && daysUntilFollowup !== null && (
              <p className="text-[10px] text-amber-600">Follow-up in {daysUntilFollowup}d</p>
            )}
            {followupReady && lead.status === 'dm_sent' && (
              <p className="text-[10px] text-primary font-semibold animate-pulse">Follow-up ready!</p>
            )}
          </div>
        </td>

        {/* Verification */}
        {showVerification && verificationLabel && (
          <td className="px-4 py-3.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${verificationLabel.tone}`}>
                  {verificationLabel.icon}
                  {verificationLabel.text}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <div className="text-xs space-y-1">
                  <p className="font-medium">Connection verification</p>
                  {lead.connection_verification_note && (
                    <p className="text-muted-foreground">{lead.connection_verification_note}</p>
                  )}
                  {verificationAge && (
                    <p className="text-muted-foreground">Checked {verificationAge}</p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          </td>
        )}

        {/* Actions */}
        <td className="px-4 py-3.5">
          <div className="flex flex-wrap gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {lead.status === 'connected' && needsManualCapture && (
              <Button size="sm" variant="outline" className="h-7 text-xs rounded-full" onClick={() => window.open(lead.linkedin_url, '_blank')}>
                <Camera className="w-3 h-3 mr-1" /> Capture
              </Button>
            )}
            {lead.status === 'connected' && isAutoCapturing && (
              <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" /> Processing...
              </span>
            )}
            {lead.status === 'dm_ready' && (
              <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-1 rounded-full">Review in Approval tab</span>
            )}
            {lead.status === 'ready_for_dm' && (
              <Button size="sm" className="h-7 text-xs rounded-full" onClick={() => onUpdateStatus(lead.id, 'dm_sent', { dm_sent_at: new Date().toISOString(), followup_due_at: addDays(new Date(), FOLLOWUP_DELAY_DAYS).toISOString() })} disabled={isUpdating}>
                <Send className="w-3 h-3 mr-1" /> Mark Sent
              </Button>
            )}
            {lead.status === 'dm_queued' && (
              <span className="text-xs text-green-600 italic bg-green-50 px-2 py-1 rounded-full">Queued for delivery</span>
            )}
            {lead.status === 'dm_sent' && followupReady && (
              <Button size="sm" className="h-7 text-xs rounded-full" onClick={() => onUpdateStatus(lead.id, 'follow_up_sent', { followup_sent_at: new Date().toISOString() })} disabled={isUpdating}>
                <Send className="w-3 h-3 mr-1" /> FU Sent
              </Button>
            )}
            {['dm_sent', 'follow_up_sent'].includes(lead.status) && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-full" onClick={() => onUpdateStatus(lead.id, 'replied', { replied_at: new Date().toISOString() })} disabled={isUpdating}>
                  <Reply className="w-3 h-3 mr-1" /> Replied
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onUpdateStatus(lead.id, 'do_not_contact')} disabled={isUpdating}>
                  <Ban className="w-3 h-3" />
                </Button>
              </>
            )}
            {lead.status === 'no_reply' && (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-full" onClick={() => onUpdateStatus(lead.id, 'replied', { replied_at: new Date().toISOString() })} disabled={isUpdating}>
                  <Reply className="w-3 h-3 mr-1" /> Replied
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => onUpdateStatus(lead.id, 'do_not_contact')} disabled={isUpdating}>
                  <Ban className="w-3 h-3" />
                </Button>
              </>
            )}
            {['new', 'queued_for_connection', 'connection_sent'].includes(lead.status) && (
              <span className="text-xs text-muted-foreground/70 italic flex items-center gap-1">
                <Clock className="w-3 h-3" /> Waiting...
              </span>
            )}
          </div>
        </td>
      </tr>
    </TooltipProvider>
  );
}
