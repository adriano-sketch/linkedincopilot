import { CampaignLead } from '@/hooks/useCampaignLeads';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useState } from 'react';

interface LeadSequenceViewProps {
  leads: CampaignLead[];
  onRefresh: () => void;
}

const SEQUENCE_GROUPS = [
  { key: 'ready', label: 'Ready to Start', statuses: ['ready', 'new', 'imported'], color: 'bg-blue-500', icon: '🚀' },
  { key: 'warming', label: 'Warming Up', statuses: ['visiting_profile', 'following'], color: 'bg-amber-500', icon: '🔥' },
  { key: 'connecting', label: 'Connecting', statuses: ['queued_for_connection', 'connection_sent'], color: 'bg-indigo-500', icon: '🤝' },
  { key: 'connected', label: 'Accepted', statuses: ['connected', 'connection_accepted'], color: 'bg-green-500', icon: '✅' },
  { key: 'messaging', label: 'DM Pipeline', statuses: ['dm_ready', 'ready_for_dm', 'dm_queued'], color: 'bg-purple-500', icon: '💬' },
  { key: 'sent', label: 'DM Sent', statuses: ['dm_sent', 'waiting_reply'], color: 'bg-yellow-500', icon: '📨' },
  { key: 'followup', label: 'Follow-up', statuses: ['follow_up_due', 'follow_up_sent'], color: 'bg-orange-500', icon: '🔄' },
  { key: 'replied', label: 'Replied!', statuses: ['replied'], color: 'bg-emerald-600', icon: '🎉' },
  { key: 'stopped', label: 'Stopped', statuses: ['do_not_contact', 'icp_rejected', 'no_reply', 'error', 'connection_rejected', 'skipped'], color: 'bg-muted', icon: '⛔' },
];

function displayName(lead: CampaignLead): string {
  if (lead.full_name) return lead.full_name;
  if (lead.first_name && lead.last_name) return `${lead.first_name} ${lead.last_name}`;
  return lead.first_name || 'Unknown';
}

export default function LeadSequenceView({ leads }: LeadSequenceViewProps) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const groups = SEQUENCE_GROUPS.map(group => ({
    ...group,
    leads: leads.filter(l => group.statuses.includes(l.status)),
  })).filter(g => g.leads.length > 0);

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No leads in this campaign yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {groups.map(group => {
        const isExpanded = expandedGroup === group.key;
        const previewLeads = isExpanded ? group.leads : group.leads.slice(0, 3);

        return (
          <Card key={group.key} className="overflow-hidden">
            <CardHeader
              className="flex flex-row items-center justify-between py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
            >
              <CardTitle className="text-sm flex items-center gap-2">
                <span>{group.icon}</span>
                <span>{group.label}</span>
                <Badge variant="secondary" className="text-[10px] h-5">{group.leads.length}</Badge>
              </CardTitle>
              {group.leads.length > 3 && (
                isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {previewLeads.map(lead => (
                  <div key={lead.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-muted/20 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${group.color} shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{displayName(lead)}</span>
                        {lead.title && <span className="text-xs text-muted-foreground truncate hidden sm:inline">— {lead.title}</span>}
                      </div>
                      {lead.company && <p className="text-xs text-muted-foreground">@ {lead.company}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.next_action_at && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDistanceToNow(new Date(lead.next_action_at), { addSuffix: true })}
                        </span>
                      )}
                      {lead.sequence_step > 0 && (
                        <Badge variant="outline" className="text-[10px] h-5">Step {lead.sequence_step}</Badge>
                      )}
                      {lead.linkedin_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={e => { e.stopPropagation(); window.open(lead.linkedin_url, '_blank'); }}
                        >
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!isExpanded && group.leads.length > 3 && (
                <button
                  className="w-full py-2 text-xs text-primary hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedGroup(group.key)}
                >
                  Show {group.leads.length - 3} more...
                </button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
