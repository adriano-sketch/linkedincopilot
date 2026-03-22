import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { CampaignLead } from '@/hooks/useCampaignLeads';
import { Check, Edit2, RefreshCw, ExternalLink, Loader2, Rocket, Lock, CheckCircle2, Send } from 'lucide-react';

const CONNECTION_SAMPLE_COUNT = 5;
const DM_SAMPLE_COUNT = 5;
const FOLLOWUP_SAMPLE_COUNT = 5;

interface StageFlags {
  stage_connection_approved: boolean;
  stage_dm_approved: boolean;
  stage_followup_approved: boolean;
}

interface DmApprovalQueueProps {
  leads: CampaignLead[];
  onRefresh: () => void;
  campaignProfileId?: string;
  stageFlags?: StageFlags;
  onEditCampaign?: () => void;
}

export default function DmApprovalQueue({ leads, onRefresh, campaignProfileId, stageFlags, onEditCampaign }: DmApprovalQueueProps) {
  const [approving, setApproving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [editingLead, setEditingLead] = useState<CampaignLead | null>(null);
  const [editField, setEditField] = useState<'connection_note' | 'dm' | 'followup'>('connection_note');
  const [editText, setEditText] = useState('');

  const connApproved = stageFlags?.stage_connection_approved ?? false;
  const dmApproved = stageFlags?.stage_dm_approved ?? false;
  const followupApproved = stageFlags?.stage_followup_approved ?? false;

  // ── Stage 1: Connection Notes ──
  // Leads with messages generated but stage not yet approved
  const connectionSamples = leads
    .filter(l => l.connection_note && (l.status === 'pending_approval' || l.status === 'dm_ready' || l.status === 'ready_for_dm' || l.status === 'ready'))
    .slice(0, CONNECTION_SAMPLE_COUNT);

  // ── Stage 2: DMs (individual approval required) ──
  // Leads waiting for individual DM approval
  const dmPendingApproval = leads
    .filter(l => l.status === 'dm_pending_approval' && (l.custom_dm || l.dm_text));

  // Also show connected leads with DMs for preview
  const dmPreviewSamples = leads
    .filter(l => (l.custom_dm || l.dm_text) && l.status === 'connected')
    .slice(0, DM_SAMPLE_COUNT);

  const dmSamples = [...dmPendingApproval, ...dmPreviewSamples].slice(0, 20);

  // ── Stage 3: Follow-ups ──
  const followupSamples = leads
    .filter(l => (l.custom_followup || l.follow_up_text) && (l.status === 'dm_sent' || l.status === 'waiting_reply'))
    .slice(0, FOLLOWUP_SAMPLE_COUNT);

  const displayName = (lead: CampaignLead) => {
    if (lead.full_name) return lead.full_name;
    if (lead.first_name && lead.last_name) return `${lead.first_name} ${lead.last_name}`;
    return lead.first_name || 'Unknown';
  };

  const handleApproveStage = async (stage: 'connection' | 'dm' | 'followup') => {
    if (!campaignProfileId) return;
    setApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke('approve-dms', {
        body: {
          action: 'approve_stage',
          stage,
          campaign_profile_id: campaignProfileId,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const stageLabels = { connection: 'Connection Notes', dm: 'DMs', followup: 'Follow-ups' };
      const remaining = data?.processing_remaining || 0;
      const msg = remaining > 0
        ? `${stageLabels[stage]} approved! ${remaining} more leads being processed automatically.`
        : `${stageLabels[stage]} approved! All messages in this stage will now be sent automatically.`;
      toast.success(msg);
      onRefresh();
    } catch (e) {
      toast.error('Approval failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async (leadId: string) => {
    setActionLoading(leadId);
    try {
      const { error } = await supabase.functions.invoke('approve-dms', {
        body: { lead_ids: [leadId], action: 'reject' },
      });
      if (error) throw error;
      toast.success('Messages will be regenerated');
      onRefresh();
    } catch (e) {
      toast.error('Failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegenerateAllNotes = async () => {
    if (!campaignProfileId) return;
    setApproving(true);
    try {
      const notesToRegen = leads
        .filter(l => l.connection_note && (l.status === 'pending_approval' || l.status === 'dm_ready' || l.status === 'ready_for_dm' || l.status === 'ready'))
        .map(l => l.id);

      if (notesToRegen.length === 0) {
        toast.info('No connection notes to regenerate.');
        return;
      }

      const BATCH_SIZE = 50;
      for (let i = 0; i < notesToRegen.length; i += BATCH_SIZE) {
        const batch = notesToRegen.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.functions.invoke('approve-dms', {
          body: { lead_ids: batch, action: 'reject' },
        });
        if (error) throw error;
      }

      toast.success(`Regenerating ${notesToRegen.length} connection notes...`);
      onRefresh();
    } catch (e) {
      toast.error('Failed to regenerate notes: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setApproving(false);
    }
  };

  const handleApproveSingleDm = async (leadId: string) => {
    setActionLoading(leadId);
    try {
      const { data, error } = await supabase.functions.invoke('approve-dms', {
        body: { lead_ids: [leadId], action: 'approve' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('DM approved — will be sent during next business hours');
      onRefresh();
    } catch (e) {
      toast.error('Failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSave = async () => {
    if (!editingLead || !campaignProfileId) return;
    setApproving(true);
    try {
      const editData: any = {};
      if (editField === 'connection_note') editData.connection_note = editText;
      if (editField === 'dm') { editData.custom_dm = editText; editData.dm_text = editText; }
      if (editField === 'followup') { editData.custom_followup = editText; editData.follow_up_text = editText; }

      const { error } = await supabase.functions.invoke('approve-dms', {
        body: {
          lead_ids: [editingLead.id],
          action: 'edit',
          edits: { [editingLead.id]: editData },
        },
      });
      if (error) throw error;
      toast.success('Message updated');
      setEditingLead(null);
      onRefresh();
    } catch (e) {
      toast.error('Failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setApproving(false);
    }
  };

  const maxLength = editField === 'connection_note' ? 200 : editField === 'dm' ? 350 : 280;

  // Determine default tab
  const defaultTab = !connApproved && connectionSamples.length > 0 ? 'connection'
    : dmPendingApproval.length > 0 ? 'dm'
    : !followupApproved && followupSamples.length > 0 ? 'followup'
    : 'connection';

  const renderStageHeader = (
    stage: 'connection' | 'dm' | 'followup',
    label: string,
    isApproved: boolean,
    samples: CampaignLead[],
    approveLabel: string,
  ) => (
    <div className="flex items-center justify-between pb-2">
      <div className="flex items-center gap-2">
        <CardTitle className="text-lg">{label}</CardTitle>
        {isApproved ? (
          <Badge variant="default" className="gap-1 bg-emerald-600"><CheckCircle2 className="w-3 h-3" /> Approved</Badge>
        ) : samples.length === 0 ? (
          <Badge variant="secondary" className="gap-1"><Lock className="w-3 h-3" /> Waiting for leads</Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">{samples.length} samples ready</Badge>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!isApproved && onEditCampaign && (
          <Button
            size="sm"
            variant="outline"
            onClick={onEditCampaign}
            className="gap-1"
          >
            <Edit2 className="w-3 h-3" /> Edit Wizard
          </Button>
        )}
        {stage === 'connection' && !isApproved && samples.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleRegenerateAllNotes}
            disabled={approving}
            className="gap-1"
          >
            {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Regenerate all notes
          </Button>
        )}
        {!isApproved && samples.length > 0 && (
          <Button
            size="sm"
            onClick={() => handleApproveStage(stage)}
            disabled={approving}
            className="gap-1"
          >
            {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
            {approveLabel}
          </Button>
        )}
      </div>
    </div>
  );

  const renderMessageCard = (
    lead: CampaignLead,
    messageField: 'connection_note' | 'dm' | 'followup',
    isApproved: boolean,
  ) => {
    const text = messageField === 'connection_note' ? lead.connection_note
      : messageField === 'dm' ? (lead.custom_dm || lead.dm_text)
      : (lead.custom_followup || lead.follow_up_text);

    const isDmPending = lead.status === 'dm_pending_approval' && messageField === 'dm';

    return (
      <div key={`${lead.id}-${messageField}`} className="p-4 hover:bg-muted/30 transition-colors">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm">{displayName(lead)}</span>
              {lead.title && <span className="text-xs text-muted-foreground">— {lead.title}</span>}
              {lead.company && <span className="text-xs text-muted-foreground">@ {lead.company}</span>}
              {isDmPending && (
                <Badge variant="outline" className="text-xs gap-1 text-amber-600 border-amber-300">
                  ⏳ Awaiting approval
                </Badge>
              )}
            </div>
            {text && (
              <div className="bg-muted/50 rounded-lg p-2.5 text-sm whitespace-pre-wrap mb-2">
                {text}
              </div>
            )}
            {(isDmPending || !isApproved) && (
              <div className="flex flex-wrap gap-1.5">
                {isDmPending && (
                  <Button size="sm" className="h-7 text-xs gap-1"
                    onClick={() => handleApproveSingleDm(lead.id)}
                    disabled={actionLoading === lead.id}
                  >
                    {actionLoading === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Approve & Send
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => {
                    setEditingLead(lead);
                    setEditField(messageField);
                    setEditText(text || '');
                  }}
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  onClick={() => handleReject(lead.id)}
                  disabled={actionLoading === lead.id}
                >
                  {actionLoading === lead.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Regenerate
                </Button>
                {lead.linkedin_url && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1"
                    onClick={() => window.open(lead.linkedin_url, '_blank')}
                  >
                    <ExternalLink className="w-3 h-3" /> Profile
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderEmptyState = (isApproved: boolean, label: string) => (
    <div className="py-12 text-center text-muted-foreground">
      {isApproved
        ? `✅ ${label} approved — all messages in this stage are sent automatically.`
        : `No ${label.toLowerCase()} samples available yet. Leads need to progress to this stage first.`
      }
    </div>
  );

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue={defaultTab}>
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent px-4 pt-3">
              <TabsTrigger value="connection" className="relative gap-1.5">
                🤝 Connection Notes
                {!connApproved && connectionSamples.length > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 text-[10px] px-1.5">{connectionSamples.length}</Badge>
                )}
                {connApproved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </TabsTrigger>
              <TabsTrigger value="dm" className="relative gap-1.5">
                💬 DMs
                {dmPendingApproval.length > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 text-[10px] px-1.5">{dmPendingApproval.length}</Badge>
                )}
                {dmPendingApproval.length === 0 && dmApproved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </TabsTrigger>
              <TabsTrigger value="followup" className="relative gap-1.5">
                🔄 Follow-ups
                {!followupApproved && followupSamples.length > 0 && (
                  <Badge variant="destructive" className="h-5 min-w-5 text-[10px] px-1.5">{followupSamples.length}</Badge>
                )}
                {followupApproved && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
              </TabsTrigger>
            </TabsList>

            {/* Connection Notes Tab */}
            <TabsContent value="connection" className="mt-0">
              <div className="p-4">
                {renderStageHeader('connection', 'Connection Notes', connApproved, connectionSamples, 'Approve first 5 & Auto-run')}
                {!connApproved && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Review the first 5 notes. Once approved, the rest will run automatically.
                  </p>
                )}
              </div>
              {connectionSamples.length > 0 ? (
                <div className="divide-y divide-border">
                  {connectionSamples.map(lead => renderMessageCard(lead, 'connection_note', connApproved))}
                </div>
              ) : renderEmptyState(connApproved, 'Connection Notes')}
            </TabsContent>

            {/* DMs Tab — Individual Approval */}
            <TabsContent value="dm" className="mt-0">
              <div className="p-4">
                <div className="flex items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">DMs</CardTitle>
                    {dmPendingApproval.length > 0 ? (
                      <Badge variant="outline" className="gap-1 text-amber-600 border-amber-300">
                        {dmPendingApproval.length} awaiting approval
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">No DMs pending</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!dmApproved && onEditCampaign && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onEditCampaign}
                        className="gap-1"
                      >
                        <Edit2 className="w-3 h-3" /> Edit Wizard
                      </Button>
                    )}
                    {!dmApproved && dmSamples.length > 0 && (
                      <Button
                        size="sm"
                        onClick={() => handleApproveStage('dm')}
                        disabled={approving}
                        className="gap-1"
                      >
                        {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
                        Approve DMs & Auto-run
                      </Button>
                    )}
                  </div>
                </div>
                {!dmApproved ? (
                  <p className="text-xs text-muted-foreground">
                    Approve the first DM to build confidence. When ready, enable auto-run for all future DMs.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">DMs are approved and will be sent automatically.</p>
                )}
              </div>
              {!connApproved ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Lock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p>Approve Connection Notes first to unlock this stage.</p>
                </div>
              ) : dmSamples.length > 0 ? (
                <div className="divide-y divide-border">
                  {dmSamples.map(lead => renderMessageCard(lead, 'dm', dmApproved))}
                </div>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  No DMs ready yet. Leads need to accept your connection request first.
                </div>
              )}
            </TabsContent>

            {/* Follow-ups Tab */}
            <TabsContent value="followup" className="mt-0">
              <div className="p-4">
                {renderStageHeader('followup', 'Follow-ups', followupApproved, followupSamples, 'Approve & Auto-run')}
                {!followupApproved && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Approve the first follow-up. After that, follow-ups run automatically.
                  </p>
                )}
              </div>
              {!dmApproved ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Lock className="w-8 h-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p>Approve DMs first to unlock this stage.</p>
                </div>
              ) : followupSamples.length > 0 ? (
                <div className="divide-y divide-border">
                  {followupSamples.map(lead => renderMessageCard(lead, 'followup', followupApproved))}
                </div>
              ) : renderEmptyState(followupApproved, 'Follow-ups')}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingLead} onOpenChange={open => { if (!open) setEditingLead(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Edit {editField === 'connection_note' ? 'Connection Note' : editField === 'dm' ? 'DM' : 'Follow-up'} for {editingLead ? displayName(editingLead) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Textarea
                value={editText}
                onChange={e => setEditText(e.target.value.slice(0, maxLength))}
                rows={editField === 'connection_note' ? 3 : 4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground text-right mt-1">{editText.length}/{maxLength}</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingLead(null)}>Cancel</Button>
              <Button onClick={handleEditSave} disabled={approving || !editText.trim()}>
                {approving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Check className="w-4 h-4 mr-1" />}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
