import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, MessageSquare, Copy, Check, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface MessagesTabProps {
  campaignProfileId: string | null;
}

interface MessageWithLead {
  id: string;
  dm1: string | null;
  followup1: string | null;
  reasoning_short: string | null;
  created_at: string;
  event_id: string | null;
  lead_name: string;
  lead_company: string | null;
  lead_title: string | null;
  dm_status: string | null;
}

export default function MessagesTab({ campaignProfileId }: MessagesTabProps) {
  const { user } = useAuth();
  const [previewMessage, setPreviewMessage] = useState<MessageWithLead | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: messages, isLoading, refetch } = useQuery({
    queryKey: ['campaign_messages', user?.id, campaignProfileId],
    queryFn: async () => {
      if (!user || !campaignProfileId) return [];

      // Get generated messages joined with linkedin_events for this campaign
      const { data, error } = await supabase
        .from('generated_messages')
        .select(`
          *,
          linkedin_events!generated_messages_event_id_fkey (
            name,
            company,
            title,
            dm_status,
            campaign_profile_id
          )
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter to campaign and map
      return (data || [])
        .filter((m: any) => m.linkedin_events?.campaign_profile_id === campaignProfileId)
        .map((m: any) => ({
          id: m.id,
          dm1: m.dm1,
          followup1: m.followup1,
          reasoning_short: m.reasoning_short,
          created_at: m.created_at,
          event_id: m.event_id,
          lead_name: m.linkedin_events?.name || 'Unknown',
          lead_company: m.linkedin_events?.company,
          lead_title: m.linkedin_events?.title,
          dm_status: m.linkedin_events?.dm_status,
        })) as MessageWithLead[];
    },
    enabled: !!user && !!campaignProfileId,
  });

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copiado!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const statusLabel = (status: string | null) => {
    switch (status) {
      case 'READY_TO_SEND': return { label: 'Pronto', variant: 'default' as const, color: 'text-green-600' };
      case 'SENT': return { label: 'Enviado', variant: 'secondary' as const, color: 'text-blue-600' };
      case 'REPLIED': return { label: 'Respondeu', variant: 'default' as const, color: 'text-green-700' };
      case 'DO_NOT_CONTACT': return { label: 'Bloqueado', variant: 'destructive' as const, color: 'text-destructive' };
      default: return { label: 'Pendente', variant: 'outline' as const, color: 'text-muted-foreground' };
    }
  };

  if (!campaignProfileId) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Selecione uma campanha para ver as mensagens.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <MessageSquare className="w-5 h-5" /> Mensagens Geradas ({messages?.length || 0})
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="text-xs gap-1">
            <RefreshCw className="w-3 h-3" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
            </div>
          ) : !messages || messages.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold mb-1">No messages generated</h3>
              <p className="text-sm text-muted-foreground">
                Messages are automatically generated when a lead accepts the connection request. 
                You'll be able to review and approve each DM before it's sent.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {messages.map(msg => {
                const status = statusLabel(msg.dm_status);
                return (
                  <div key={msg.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{msg.lead_name}</p>
                          {msg.lead_title && <span className="text-xs text-muted-foreground">• {msg.lead_title}</span>}
                          {msg.lead_company && <span className="text-xs text-muted-foreground">@ {msg.lead_company}</span>}
                        </div>
                        <p className="text-sm text-foreground/80 line-clamp-2">{msg.dm1}</p>
                        {msg.reasoning_short && (
                          <p className="text-xs text-muted-foreground mt-1 italic">💡 {msg.reasoning_short}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant={status.variant} className={`text-xs ${status.color}`}>{status.label}</Badge>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setPreviewMessage(msg)}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {msg.dm1 && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleCopy(msg.dm1!, msg.id + '-dm')}>
                            {copiedId === msg.id + '-dm' ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Message Preview Dialog */}
      <Dialog open={!!previewMessage} onOpenChange={(open) => { if (!open) setPreviewMessage(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              DM para {previewMessage?.lead_name}
            </DialogTitle>
          </DialogHeader>
          {previewMessage && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Mensagem Inicial</p>
                  {previewMessage.dm1 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleCopy(previewMessage.dm1!, previewMessage.id + '-dm-preview')}>
                      {copiedId === previewMessage.id + '-dm-preview' ? <><Check className="w-3 h-3 mr-1" /> Copiado</> : <><Copy className="w-3 h-3 mr-1" /> Copiar</>}
                    </Button>
                  )}
                </div>
                <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">{previewMessage.dm1 || '—'}</div>
                <p className="text-xs text-muted-foreground mt-1">{previewMessage.dm1?.length || 0} caracteres</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">Follow-up (4 dias depois)</p>
                  {previewMessage.followup1 && (
                    <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => handleCopy(previewMessage.followup1!, previewMessage.id + '-fu-preview')}>
                      {copiedId === previewMessage.id + '-fu-preview' ? <><Check className="w-3 h-3 mr-1" /> Copiado</> : <><Copy className="w-3 h-3 mr-1" /> Copiar</>}
                    </Button>
                  )}
                </div>
                <div className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap">{previewMessage.followup1 || '—'}</div>
                <p className="text-xs text-muted-foreground mt-1">{previewMessage.followup1?.length || 0} caracteres</p>
              </div>

              {previewMessage.reasoning_short && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase mb-1">Raciocínio da IA</p>
                  <p className="text-sm text-muted-foreground italic">{previewMessage.reasoning_short}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {previewMessage.lead_title && <span>{previewMessage.lead_title}</span>}
                {previewMessage.lead_company && <span>@ {previewMessage.lead_company}</span>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
