import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExtensionStatus } from '@/hooks/useExtensionStatus';
import { useCampaignProfiles, CampaignProfile } from '@/hooks/useCampaignProfiles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CampaignEditDialog from '@/components/CampaignEditDialog';
import { toast } from 'sonner';
import { ArrowLeft, Save, ChevronDown, User, Building2, Rocket, Trash2, Star, CopyPlus, BookmarkPlus, Chrome, Pause, Play, Wifi, WifiOff, Download, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const OBJECTIVE_LABELS: Record<string, string> = {
  book_call: 'Book a Call', get_referral: 'Get Referrals', start_conversation: 'Start Conversation',
  offer_audit: 'Free Audit', sell_direct: 'Sell Direct', build_relationship: 'Build Relationship',
};
const TONE_LABELS: Record<string, string> = {
  casual_peer: 'Casual', professional_warm: 'Professional', direct_bold: 'Direct', consultative: 'Consultative',
};
const STATUS_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft: { label: 'Draft', variant: 'outline' },
  active: { label: 'Active', variant: 'default' },
  paused: { label: 'Paused', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'secondary' },
};

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney',
];

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const { extensionStatus } = useExtensionStatus();
  const { campaigns, templates, updateCampaign, deleteCampaign, duplicateCampaign, saveAsTemplate } = useCampaignProfiles();
  const navigate = useNavigate();

  const [masterForm, setMasterForm] = useState({
    sender_name: '', sender_title: '', company_name: '', company_description: '',
  });

  const [extensionLimits, setExtensionLimits] = useState({
    daily_limit_connection_requests: 40,
    daily_limit_messages: 100,
    timezone: 'America/New_York',
    active_days: ['mon', 'tue', 'wed', 'thu', 'fri'] as string[],
    active_hours_start: '08:00',
    active_hours_end: '18:00',
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true, extension: true, campaigns: false, templates: false,
  });

  const [editingCampaign, setEditingCampaign] = useState<CampaignProfile | null>(null);
  const [downloading, setDownloading] = useState(false);

  const handleDownloadExtension = async () => {
    setDownloading(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const folder = zip.folder('chrome-extension')!;
      const files = [
        'manifest.json', 'background.js', 'content.js',
        'popup.html', 'popup.js', 'popup.css',
      ];
      const iconFiles = [
        'icons/icon16.png', 'icons/icon24.png', 'icons/icon32.png',
        'icons/icon48.png', 'icons/icon128.png',
      ];
      await Promise.all([...files, ...iconFiles].map(async (name) => {
        const res = await fetch(`/chrome-extension/${name}`);
        const blob = await res.blob();
        folder.file(name, blob);
      }));
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'linkedin-copilot-extension.zip';
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Download iniciado!');
    } catch {
      toast.error('Falha ao gerar o ZIP');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (profile) {
      setMasterForm({
        sender_name: profile.sender_name || '',
        sender_title: profile.sender_title || '',
        company_name: profile.company_name || '',
        company_description: profile.company_description || '',
      });
    }
  }, [profile]);

  useEffect(() => {
    if (extensionStatus) {
      setExtensionLimits({
        daily_limit_connection_requests: extensionStatus.daily_limit_connection_requests ?? 40,
        daily_limit_messages: extensionStatus.daily_limit_messages ?? 100,
        timezone: (extensionStatus as any).timezone ?? 'America/New_York',
        active_days: (extensionStatus as any).active_days ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
        active_hours_start: (extensionStatus as any).active_hours_start ?? '08:00',
        active_hours_end: (extensionStatus as any).active_hours_end ?? '18:00',
      });
    }
  }, [extensionStatus]);

  const handleSaveMaster = async () => {
    try {
      await updateProfile.mutateAsync(masterForm);
      toast.success('Profile saved');
    } catch { toast.error('Failed to save'); }
  };

  const handleSaveExtension = async () => {
    if (!user || !extensionStatus) return;
    try {
      const { error } = await supabase.from('extension_status').update(extensionLimits).eq('user_id', user.id);
      if (error) throw error;
      toast.success('Extension settings saved');
    } catch { toast.error('Failed to save extension settings'); }
  };

  const handleTogglePause = async () => {
    if (!user || !extensionStatus) return;
    try {
      const { error } = await supabase.from('extension_status').update({ is_paused: !extensionStatus.is_paused }).eq('user_id', user.id);
      if (error) throw error;
      toast.success(extensionStatus.is_paused ? 'Extension resumed' : 'Extension paused');
    } catch { toast.error('Failed to toggle pause'); }
  };

  const toggle = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  if (isLoading) return null;

  const SectionHeader = ({ id, icon: Icon, title }: { id: string; icon: React.ElementType; title: string }) => (
    <CollapsibleTrigger className="flex items-center justify-between w-full py-2" onClick={() => toggle(id)}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary" />
        <span className="font-medium text-sm">{title}</span>
      </div>
      <ChevronDown className={`w-4 h-4 transition-transform ${openSections[id] ? 'rotate-180' : ''}`} />
    </CollapsibleTrigger>
  );

  const isConnected = extensionStatus?.is_connected && extensionStatus.last_heartbeat_at &&
    (Date.now() - new Date(extensionStatus.last_heartbeat_at).getTime() < 120000);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>

        {/* Master Profile */}
        <Card>
          <Collapsible open={openSections.profile}>
            <CardHeader className="pb-2"><SectionHeader id="profile" icon={User} title="Your Profile" /></CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Name</Label><Input value={masterForm.sender_name} onChange={e => setMasterForm({ ...masterForm, sender_name: e.target.value })} /></div>
                  <div><Label>Title</Label><Input value={masterForm.sender_title} onChange={e => setMasterForm({ ...masterForm, sender_title: e.target.value })} /></div>
                </div>
                <div><Label>Company</Label><Input value={masterForm.company_name} onChange={e => setMasterForm({ ...masterForm, company_name: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea value={masterForm.company_description} onChange={e => setMasterForm({ ...masterForm, company_description: e.target.value.slice(0, 1000) })} rows={3} />
                  <p className="text-xs text-muted-foreground text-right">{masterForm.company_description.length}/1000</p>
                </div>
                <Button size="sm" onClick={handleSaveMaster} disabled={updateProfile.isPending}><Save className="w-3 h-3 mr-1" /> Save</Button>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Extension */}
        <Card>
          <Collapsible open={openSections.extension}>
            <CardHeader className="pb-2"><SectionHeader id="extension" icon={Chrome} title="Chrome Extension" /></CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {/* Connection Status */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    {isConnected ? <Wifi className="w-4 h-4 text-primary" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
                    <div>
                      <p className="text-sm font-medium">{isConnected ? 'Connected' : 'Disconnected'}</p>
                      {extensionStatus?.last_heartbeat_at && (
                        <p className="text-xs text-muted-foreground">Last seen: {new Date(extensionStatus.last_heartbeat_at).toLocaleString()}</p>
                      )}
                    </div>
                  </div>
                  {extensionStatus?.is_paused ? (
                    <Badge variant="secondary">Paused</Badge>
                  ) : isConnected ? (
                    <Badge variant="default">Active</Badge>
                  ) : null}
                </div>

                {extensionStatus?.linkedin_logged_in !== undefined && (
                  <p className="text-xs text-muted-foreground">LinkedIn: {extensionStatus.linkedin_logged_in ? '✅ Logged in' : '⚠️ Not logged in'}</p>
                )}

                {/* Today's Usage */}
                {extensionStatus && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <p className="text-lg font-bold">{extensionStatus.connection_requests_today ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Connections</p>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-muted/30">
                      <p className="text-lg font-bold">{extensionStatus.actions_today ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Actions</p>
                    </div>
                  </div>
                )}

                {/* Daily Limits */}
                <div>
                  <Label className="text-xs">Connection Requests / Day</Label>
                  <Input type="number" value={extensionLimits.daily_limit_connection_requests} onChange={e => setExtensionLimits({ ...extensionLimits, daily_limit_connection_requests: parseInt(e.target.value) || 0 })} />
                </div>

                {/* Schedule */}
                <div className="space-y-3 border border-border rounded-lg p-3">
                  <p className="text-xs font-medium text-foreground">Campaign Schedule</p>
                  
                  {/* Active Days */}
                  <div>
                    <Label className="text-xs">Active Days</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {([
                        { key: 'mon', label: 'Mon' },
                        { key: 'tue', label: 'Tue' },
                        { key: 'wed', label: 'Wed' },
                        { key: 'thu', label: 'Thu' },
                        { key: 'fri', label: 'Fri' },
                        { key: 'sat', label: 'Sat' },
                        { key: 'sun', label: 'Sun' },
                      ]).map(day => {
                        const isActive = extensionLimits.active_days.includes(day.key);
                        return (
                          <button
                            key={day.key}
                            type="button"
                            className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                              isActive
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                            }`}
                            onClick={() => {
                              const newDays = isActive
                                ? extensionLimits.active_days.filter(d => d !== day.key)
                                : [...extensionLimits.active_days, day.key];
                              setExtensionLimits({ ...extensionLimits, active_days: newDays });
                            }}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Hours */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Start Time</Label>
                      <Input
                        type="time"
                        value={extensionLimits.active_hours_start}
                        onChange={e => setExtensionLimits({ ...extensionLimits, active_hours_start: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End Time</Label>
                      <Input
                        type="time"
                        value={extensionLimits.active_hours_end}
                        onChange={e => setExtensionLimits({ ...extensionLimits, active_hours_end: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Timezone */}
                  <div>
                    <Label className="text-xs">Timezone</Label>
                    <Select value={extensionLimits.timezone} onValueChange={v => setExtensionLimits({ ...extensionLimits, timezone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz.replace('_', ' ')}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-[10px] text-muted-foreground">Actions will only execute during these hours in the selected timezone.</p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveExtension}><Save className="w-3 h-3 mr-1" /> Save Limits</Button>
                  {extensionStatus && (
                    <Button size="sm" variant={extensionStatus.is_paused ? 'default' : 'secondary'} onClick={handleTogglePause}>
                      {extensionStatus.is_paused ? <><Play className="w-3 h-3 mr-1" /> Resume</> : <><Pause className="w-3 h-3 mr-1" /> Pause</>}
                    </Button>
                  )}
                </div>

                {/* Download Extension */}
                <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Chrome className="w-4 h-4 text-primary" />
                    Download Chrome Extension
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Download the .zip file, extract it, then go to <code className="bg-muted px-1 py-0.5 rounded text-[11px]">chrome://extensions</code>, enable <strong>Developer Mode</strong>, and click <strong>"Load unpacked"</strong> to select the extracted folder.
                  </p>
                  <Button
                    size="sm"
                    className="gap-1.5 mt-1"
                    disabled={downloading}
                    onClick={handleDownloadExtension}
                  >
                    {downloading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                    {downloading ? 'Generating ZIP...' : 'Download Extension (.zip)'}
                  </Button>
                </div>

                {!extensionStatus && (
                  <p className="text-xs text-muted-foreground">Extension not detected yet. Install it and connect to see status here.</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Campaigns */}
        <Card>
          <Collapsible open={openSections.campaigns}>
            <CardHeader className="pb-2"><SectionHeader id="campaigns" icon={Rocket} title={`Campaigns (${campaigns.length})`} /></CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No campaigns yet.</p>
                ) : campaigns.map(c => {
                  const statusInfo = STATUS_LABELS[(c as any).status || 'draft'] || STATUS_LABELS.draft;
                  return (
                    <div key={c.id} className="border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">{c.name}</p>
                          {c.is_default && <Badge variant="default" className="text-[10px]">Default</Badge>}
                          <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                        </div>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]">{OBJECTIVE_LABELS[c.campaign_objective] || c.campaign_objective}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{TONE_LABELS[c.dm_tone] || c.dm_tone}</Badge>
                        </div>
                      </div>
                      {c.icp_description && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.icp_description}</p>}
                      <div className="flex gap-1 mt-2 flex-wrap">
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setEditingCampaign(c)}>Edit</Button>
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => { duplicateCampaign.mutate(c); toast.success('Duplicated'); }}><CopyPlus className="w-3 h-3" /></Button>
                        {!c.is_default && <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => { updateCampaign.mutate({ id: c.id, is_default: true } as any); toast.success('Set as default'); }}><Star className="w-3 h-3" /></Button>}
                        <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => saveAsTemplate.mutate(c)}><BookmarkPlus className="w-3 h-3" /></Button>
                        <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => { if (confirm('Delete this campaign?')) { deleteCampaign.mutate(c.id); toast.success('Deleted'); } }}><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>

        {/* Templates */}
        <Card>
          <Collapsible open={openSections.templates}>
            <CardHeader className="pb-2"><SectionHeader id="templates" icon={Building2} title={`Templates (${templates.length})`} /></CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No templates saved yet.</p>
                ) : templates.map(t => (
                  <div key={t.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{OBJECTIVE_LABELS[t.campaign_objective] || t.campaign_objective}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => setEditingCampaign(t)}>Edit</Button>
                      <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => { if (confirm('Delete template?')) { deleteCampaign.mutate(t.id); toast.success('Deleted'); } }}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      </div>

      <CampaignEditDialog
        campaign={editingCampaign}
        open={!!editingCampaign}
        onOpenChange={open => { if (!open) setEditingCampaign(null); }}
        onSave={(id, data) => {
          updateCampaign.mutate({ id, ...data } as any);
          toast.success('Saved');
        }}
        isPending={updateCampaign.isPending}
      />
    </div>
  );
}
