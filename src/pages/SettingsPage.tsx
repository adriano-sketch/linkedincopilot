import { hasUnsavedChanges, okToLeavePage, registerUnsavedCheck } from '@/lib/unsavedChanges';
import CommentKnowledgeBase from '@/components/CommentKnowledgeBase';
import { EXTENSION_STORE_URL } from '@/lib/extensionStore';
import AppShell from '@/components/app/AppShell';
import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExtensionStatus } from '@/hooks/useExtensionStatus';
import { timezoneLabel, timezoneOptions } from '@/lib/timezones';
import { useUserPlan } from '@/hooks/useUserPlan';
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
import { UpgradeModal } from '@/components/UpgradeModal';
import { toast } from 'sonner';
import { ArrowLeft, Save, ChevronDown, User, Building2, Rocket, Trash2, Star, CopyPlus, BookmarkPlus, Chrome, Pause, Play, Wifi, WifiOff, Download, Loader2, CreditCard } from 'lucide-react';
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

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const { extensionStatus } = useExtensionStatus();
  const { isFree, isAgency, onTrial, trialDaysLeft, isLoading: planLoading, settings: planSettings, loadFailed: planFailed } = useUserPlan();
  // Until the plan is known nothing is claimed about it.
  const planUnknown = planLoading || !planSettings;
  const { campaigns, templates, updateCampaign, deleteCampaign, duplicateCampaign, saveAsTemplate } = useCampaignProfiles();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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

  const zoneOptions = useMemo(() => timezoneOptions(extensionLimits.timezone), [extensionLimits.timezone]);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    profile: true, billing: true, extension: true, campaigns: false, templates: false,
  });

  const [editingCampaign, setEditingCampaign] = useState<CampaignProfile | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [syncingPlan, setSyncingPlan] = useState(false);

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

  // Fields the person has changed and not saved yet. The row is refetched every few seconds (and
  // changes on each heartbeat), so the form must not be rebuilt over what is being typed.
  const dirtyLimits = useRef(new Set<string>());
  // Checkout and the billing portal leave this page: they ask first when something here is not saved.
  // (Limits can only be saved once the extension has connected, so before that they do not count.)
  // A limit counts when its value differs from the stored one, not merely because it was touched:
  // 40 changed to 41 and back to 40 is not an unsaved change.
  const storedLimits = useRef<Record<string, unknown> | null>(null);
  const sameValue = (a: unknown, b: unknown) => Array.isArray(a) && Array.isArray(b)
    ? JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
    : JSON.stringify(a) === JSON.stringify(b);
  const unsavedRef = useRef<() => boolean>(() => false);
  // Kept current after each render (not during it), for the check registered once below.
  useEffect(() => {
    unsavedRef.current = () => {
      const stored = storedLimits.current;
      const limitsChanged = !!extensionStatus && !!stored && [...dirtyLimits.current]
        .some(k => !sameValue((extensionLimits as Record<string, unknown>)[k], stored[k]));
      return limitsChanged || (!!profile && (
        masterForm.sender_name !== (profile.sender_name || '') || masterForm.sender_title !== (profile.sender_title || '')
        || masterForm.company_name !== (profile.company_name || '') || masterForm.company_description !== (profile.company_description || '')));
    };
  });
  useEffect(() => registerUnsavedCheck(() => unsavedRef.current()), []);

  const latestLimits = useRef(extensionLimits);
  latestLimits.current = extensionLimits;
  const saveInFlight = useRef(false);
  const editLimits = (patch: Partial<typeof extensionLimits>) => {
    // A field put back to its stored value is no longer "changed": it follows the server again.
    // Not while a save is on its way, though: "stored" is about to become what that save sent, so
    // an edit made now stays pending until the save is done and compared with what it carried.
    Object.entries(patch).forEach(([k, v]) => {
      if (!saveInFlight.current && storedLimits.current && sameValue(v, storedLimits.current[k])) dirtyLimits.current.delete(k);
      else dirtyLimits.current.add(k);
    });
    setExtensionLimits(prev => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    if (!extensionStatus) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ext = extensionStatus as any;
    const fromServer = {
      daily_limit_connection_requests: ext.daily_limit_connection_requests ?? 40,
      daily_limit_messages: ext.daily_limit_messages ?? 100,
      timezone: ext.timezone ?? 'America/New_York',
      active_days: ext.active_days ?? ['mon', 'tue', 'wed', 'thu', 'fri'],
      active_hours_start: ext.active_hours_start ?? '08:00',
      active_hours_end: ext.active_hours_end ?? '18:00',
    };
    storedLimits.current = fromServer;
    setExtensionLimits(prev => {
      const next = { ...fromServer } as typeof prev;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      dirtyLimits.current.forEach(k => { (next as any)[k] = (prev as any)[k]; });
      return next;
    });
  }, [extensionStatus]);

  const handleSaveMaster = async () => {
    try {
      await updateProfile.mutateAsync(masterForm);
      toast.success('Profile saved');
    } catch { toast.error('Failed to save'); }
  };

  const [savingLimits, setSavingLimits] = useState(false);
  const handleSaveExtension = async () => {
    // One save at a time: a second request on its way would confuse which fields are still unsaved.
    if (!user || !extensionStatus || savingLimits || saveInFlight.current) return;
    setSavingLimits(true);
    saveInFlight.current = true;
    const sent = extensionLimits;
    try {
      // A zone saved here is the person's choice: it is never replaced by the browser's.
      let { error } = await supabase.from('extension_status')
        .update({ ...extensionLimits, timezone_confirmed: true } as never).eq('user_id', user.id);
      // The column arrives with a migration; if this page is live before it, save without the flag.
      if (error && /timezone_confirmed/.test(error.message || '')) {
        ({ error } = await supabase.from('extension_status').update(extensionLimits).eq('user_id', user.id));
      }
      if (error) throw error;
      // Saved fields are no longer pending. A field changed again while the request was on its way
      // was not in it, so it stays pending.
      (Object.keys(sent) as (keyof typeof sent)[]).forEach(k => {
        if (sameValue(latestLimits.current[k], sent[k])) dirtyLimits.current.delete(k);
      });
      // What was sent is what is stored now, even if the fetch below fails or is slow: a later edit
      // is compared with it, not with the values from before this save.
      storedLimits.current = { ...(storedLimits.current || {}), ...sent };
      // Drop any fetch that read the row before this save, so it cannot put the old values back.
      await queryClient.invalidateQueries({ queryKey: ['extension-status'] });
      toast.success('Extension settings saved');
    } catch { toast.error('Failed to save extension settings'); }
    finally { saveInFlight.current = false; setSavingLimits(false); }
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

  const handleBillingPortal = async () => {
    const asked = hasUnsavedChanges();
    if (!okToLeavePage()) return;
    setBillingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        // Something typed while the server was answering is asked about too (once: not again if the
        // person already agreed to leave).
        if (!asked && !okToLeavePage()) return;
        // Same tab: a tab opened after waiting for the server is blocked by some browsers.
        window.location.assign(data.url);
      }
    } catch {
      toast.error('Failed to open billing portal');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleSyncPlan = async () => {
    setSyncingPlan(true);
    try {
      const { error } = await supabase.functions.invoke('check-subscription');
      if (error) {
        const details = (error as any)?.context?.body?.error;
        throw new Error(details || error.message);
      }
      await queryClient.invalidateQueries({ queryKey: ['user_settings', user?.id] });
      toast.success('Plan synced successfully');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Try again in a moment.';
      toast.error(`Failed to sync plan. ${message}`.trim());
    } finally {
      setSyncingPlan(false);
    }
  };

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
    <AppShell>
      <div className="max-w-3xl space-y-4">
        <h1 className="font-display font-bold text-4xl leading-none m-0 mb-2">Settings</h1>

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

        <CommentKnowledgeBase />

        {/* Billing */}
        <Card>
          <Collapsible open={openSections.billing}>
            <CardHeader className="pb-2"><SectionHeader id="billing" icon={CreditCard} title="Billing & Plan" /></CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Current plan</p>
                    <p className="text-xs text-muted-foreground" role="status">
                      {planFailed ? 'Your plan could not be loaded. Use Sync Plan, or reload the page.'
                        : planUnknown ? 'Checking your plan…'
                        : !isFree ? 'Pro: everything included.'
                        : onTrial ? `Free trial: everything included. ${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left, no card on file.`
                        : 'Your free trial ended. Olanovo is paused until you subscribe.'}
                    </p>
                  </div>
                  {!planUnknown && <Badge variant={isFree && !onTrial ? 'secondary' : 'default'}>{!isFree ? (isAgency ? 'Agency' : 'Pro') : onTrial ? 'Free trial' : 'Paused'}</Badge>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {isFree && !planUnknown && (
                    <Button size="sm" onClick={() => setUpgradeOpen(true)}>Subscribe</Button>
                  )}
                  {!isFree && !planUnknown && (
                    <Button size="sm" variant="outline" onClick={handleBillingPortal} disabled={billingLoading}>
                      {billingLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Loading...</> : 'Manage Billing'}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={handleSyncPlan} disabled={syncingPlan}>
                    {syncingPlan ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Syncing...</> : 'Sync Plan'}
                  </Button>
                </div>
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
                  <Input type="number" value={extensionLimits.daily_limit_connection_requests} onChange={e => editLimits({ daily_limit_connection_requests: parseInt(e.target.value) || 0 })} />
                </div>

                {/* Schedule */}
                <div className="space-y-3 border border-border rounded-lg p-3">
                  <p className="text-xs font-medium text-foreground">Active days and hours</p>
                  
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
                              editLimits({ active_days: newDays });
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
                        onChange={e => editLimits({ active_hours_start: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">End Time</Label>
                      <Input
                        type="time"
                        value={extensionLimits.active_hours_end}
                        onChange={e => editLimits({ active_hours_end: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Timezone */}
                  <div>
                    <Label className="text-xs">Timezone</Label>
                    <Select value={extensionLimits.timezone} onValueChange={v => editLimits({ timezone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {zoneOptions.map(tz => <SelectItem key={tz} value={tz}>{timezoneLabel(tz)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-[10px] text-muted-foreground">Actions will only execute during these hours in the selected timezone.</p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveExtension} disabled={savingLimits}><Save className="w-3 h-3 mr-1" /> {savingLimits ? 'Saving…' : 'Save Limits'}</Button>
                  {extensionStatus && (
                    <Button size="sm" variant={extensionStatus.is_paused ? 'default' : 'secondary'} onClick={handleTogglePause}>
                      {extensionStatus.is_paused ? <><Play className="w-3 h-3 mr-1" /> Resume</> : <><Pause className="w-3 h-3 mr-1" /> Pause</>}
                    </Button>
                  )}
                </div>

                {/* Install the extension */}
                <div className="border border-primary/20 bg-primary/5 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2">
                    <Chrome className="w-4 h-4 text-primary" />
                    Chrome extension
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Install it from the Chrome Web Store. Chrome keeps it up to date on its own. Then click the extension icon and sign in with the same email and password you use here. If you installed it from a .zip file before, remove that copy first: keep only one.
                  </p>
                  <Button size="sm" className="gap-1.5 mt-1" asChild>
                    <a href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer">
                      <Chrome className="w-3 h-3" />Get it on the Chrome Web Store
                    </a>
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
            <CardHeader className="pb-2"><SectionHeader id="campaigns" icon={Rocket} title={`Lists (${campaigns.length})`} /></CardHeader>
            <CollapsibleContent>
              <CardContent className="space-y-3 pt-0">
                {campaigns.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lists yet.</p>
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
                        <Button variant="destructive" size="sm" className="h-6 text-xs" onClick={() => { if (confirm('Delete this list?')) { deleteCampaign.mutate(c.id); toast.success('Deleted'); } }}><Trash2 className="w-3 h-3" /></Button>
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

      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />

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
    </AppShell>
  );
}
