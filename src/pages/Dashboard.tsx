import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCampaignProfiles } from '@/hooks/useCampaignProfiles';
import { useCampaignLeads } from '@/hooks/useCampaignLeads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LeadRow from '@/components/LeadRow';
import PipelineStats, { STAGE_STATUS_MAP } from '@/components/PipelineStats';
import CampaignSelector from '@/components/CampaignSelector';
import CampaignWizard, { CampaignFormData } from '@/components/CampaignWizard';
import CampaignEditDialog from '@/components/CampaignEditDialog';
import CampaignStepper from '@/components/CampaignStepper';
import DmApprovalQueue from '@/components/DmApprovalQueue';
import ExtensionStatusBar from '@/components/ExtensionStatusBar';
import LeadSequenceView from '@/components/LeadSequenceView';
import ProcessingProgressCard from '@/components/ProcessingProgressCard';
import { Settings, LogOut, RefreshCw, Users, Loader2, Rocket, Plus, Upload, Pause, Play, HelpCircle, Search, ShieldCheck } from 'lucide-react';
import logoImg from '@/assets/logo.png';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const { user, loading: authLoading, signOut } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { campaigns, createCampaign, updateCampaign, deleteCampaign } = useCampaignProfiles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(searchParams.get('campaign'));
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<typeof campaigns[0] | null>(null);
  const [activeTab, setActiveTab] = useState<string>('sequence');
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [verificationFilter, setVerificationFilter] = useState<'all' | 'verified' | 'unverified'>('all');
  const [qualityFilter, setQualityFilter] = useState<'all' | 'ghost' | 'pending' | 'ok'>('all');
  const [verifying, setVerifying] = useState(false);
  const [resettingVerification, setResettingVerification] = useState(false);
  const launchOnce = useRef(false);
  const checkoutStatus = searchParams.get('checkout');

  // Auto-select first active campaign
  useEffect(() => {
    if (!selectedCampaignId && campaigns.length > 0) {
      const firstActive = campaigns.find(c => c.status === 'active' || c.status === 'paused');
      if (firstActive) setSelectedCampaignId(firstActive.id);
    }
  }, [campaigns, selectedCampaignId]);

  const { leads, pipelineCounts, updateLeadStatus, refresh: refreshLeads } = useCampaignLeads(selectedCampaignId);

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!profileLoading && profile && !profile.onboarding_completed) {
      navigate('/onboarding');
    }
  }, [profile, profileLoading, navigate]);

  // Auto-launch if requested
  useEffect(() => {
    if (searchParams.get('launch') === 'true' && selectedCampaignId && !launchOnce.current) {
      launchOnce.current = true;
      handleLaunchCampaign();
    }
  }, [searchParams, selectedCampaignId]);

  useEffect(() => {
    if (!checkoutStatus || !user) return;
    if (checkoutStatus === 'success') {
      supabase.functions.invoke('check-subscription')
        .then(() => {
          toast.success('Payment confirmed! Your plan will update shortly.');
        })
        .catch((error) => {
          toast.error(`We could not verify your plan yet. ${error?.message || ''}`.trim());
        })
        .finally(() => {
          navigate('/dashboard', { replace: true });
        });
    } else if (checkoutStatus === 'cancel') {
      toast.message('Checkout canceled. You can try again anytime.');
      navigate('/dashboard', { replace: true });
    }
  }, [checkoutStatus, user, navigate]);

  const handleLaunchCampaign = async () => {
    if (!selectedCampaignId) { toast.error('Select a campaign'); return; }
    setLaunching(true);
    try {
      // Update campaign status to active and set next_action_at on leads
      await updateCampaign.mutateAsync({ id: selectedCampaignId, status: 'active' } as any);
      toast.success('Campaign launched! Leads will be processed by the extension.');
      refreshLeads();
    } catch (e) {
      toast.error('Launch failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setLaunching(false);
    }
  };

  const handlePauseResume = async (action: 'pause' | 'resume') => {
    if (!selectedCampaignId) return;
    setTogglingPause(true);
    try {
      const newStatus = action === 'pause' ? 'paused' : 'active';
      await updateCampaign.mutateAsync({ id: selectedCampaignId, status: newStatus } as any);
      toast.success(`Campaign ${action === 'pause' ? 'paused' : 'resumed'}!`);
    } catch (e) {
      toast.error(`Failed to ${action}: ` + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setTogglingPause(false);
    }
  };

  const handleNewCampaignComplete = async (data: CampaignFormData, campaignId?: string) => {
    if (campaignId) {
      setShowNewCampaign(false);
      setSelectedCampaignId(campaignId);
      refreshLeads();
      toast.success('Campaign launched! 🚀');
    } else {
      try {
        await createCampaign.mutateAsync({
          name: data.name,
          campaign_objective: data.campaign_objective,
          value_proposition: data.value_proposition,
          proof_points: data.proof_points,
          icp_description: data.icp_description,
          icp_titles: data.icp_titles,
          icp_locations: data.icp_locations,
          icp_industries: data.icp_industries,
          icp_employee_ranges: data.icp_employee_ranges,
          pain_points: data.pain_points.filter(p => p.trim()),
          dm_tone: data.dm_tone,
          dm_example: data.dm_example,
          is_default: data.is_default,
          is_template: false,
          vertical_id: data.vertical_id,
          custom_vertical: data.custom_vertical,
        });
        setShowNewCampaign(false);
        toast.success('Campaign created!');
      } catch {
        toast.error('Failed to create campaign');
      }
    }
  };

  if (authLoading || profileLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  const hasVerificationData = leads.some(l => l.connection_verified !== null && l.connection_verified !== undefined)
    || leads.some(l => ['connection_sent', 'connected', 'connection_accepted'].includes(l.status));
  const verificationEligible = leads.filter(l => ['connection_sent', 'connected', 'connection_accepted'].includes(l.status));
  const verifiedAcceptedCount = verificationEligible.filter(l => l.connection_verified === true).length;
  const verificationStaleMs = 12 * 60 * 60 * 1000;
  const nowMs = Date.now();
  const verificationNeedsRefresh = verificationEligible.filter(l => {
    if (l.connection_verified_at) {
      return nowMs - new Date(l.connection_verified_at).getTime() > verificationStaleMs;
    }
    return l.connection_verified !== true;
  });
  const acceptedDisplayCount = hasVerificationData
    ? verifiedAcceptedCount
    : pipelineCounts.connected + pipelineCounts.connection_accepted;

  const stageFilteredLeads = pipelineStageFilter
    ? leads.filter(l => {
      if (pipelineStageFilter === 'connected' && hasVerificationData) {
        return l.connection_verified === true;
      }
      if (pipelineStageFilter === 'ghost') {
        return l.profile_quality_status === 'ghost';
      }
      return (STAGE_STATUS_MAP[pipelineStageFilter] || []).includes(l.status);
    })
    : pipelineFilter ? leads.filter(l => l.status === pipelineFilter) : leads;

  const searchTerm = leadSearch.trim().toLowerCase();
  const filteredLeads = stageFilteredLeads.filter(l => {
    if (verificationFilter === 'verified') {
      if (l.connection_verified !== true) return false;
    } else if (verificationFilter === 'unverified') {
      if (!['connection_sent', 'connected', 'connection_accepted'].includes(l.status)) return false;
      if (l.connection_verified === true) return false;
    }

    if (qualityFilter === 'ghost' && l.profile_quality_status !== 'ghost') return false;
    if (qualityFilter === 'pending' && l.profile_quality_status !== 'pending') return false;
    if (qualityFilter === 'ok' && l.profile_quality_status !== 'ok') return false;

    if (!searchTerm) return true;
    const name = l.full_name || `${l.first_name || ''} ${l.last_name || ''}`.trim();
    const haystack = [
      name,
      l.first_name,
      l.last_name,
      l.title,
      l.company,
      l.location,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  });

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId);
  const effectiveStatus = selectedCampaign?.status;
  const campaignIsActive = effectiveStatus === 'active';
  const campaignIsPaused = effectiveStatus === 'paused';

  const pendingApprovalCount = pipelineCounts.dm_ready + pipelineCounts.ready_for_dm;
  const stageFlags = selectedCampaign ? {
    stage_connection_approved: (selectedCampaign as any).stage_connection_approved ?? false,
    stage_dm_approved: (selectedCampaign as any).stage_dm_approved ?? false,
    stage_followup_approved: (selectedCampaign as any).stage_followup_approved ?? false,
  } : undefined;

  // Count unapproved stages needing attention
  const needsApproval = stageFlags ? (
    (!stageFlags.stage_connection_approved && leads.some(l => l.connection_note && ['pending_approval', 'dm_ready', 'ready_for_dm', 'ready'].includes(l.status))) ||
    (!stageFlags.stage_dm_approved && leads.some(l => (l.custom_dm || l.dm_text) && ['connected', 'dm_pending_approval'].includes(l.status))) ||
    (!stageFlags.stage_followup_approved && leads.some(l => (l.custom_followup || l.follow_up_text) && ['dm_sent', 'waiting_reply'].includes(l.status)))
  ) : pendingApprovalCount > 0;

  if (showNewCampaign) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-lg mx-auto">
          <Button variant="ghost" onClick={() => setShowNewCampaign(false)} className="mb-4">← Back to Dashboard</Button>
          <CampaignWizard onComplete={handleNewCampaignComplete} onCancel={() => setShowNewCampaign(false)} isPending={createCampaign.isPending} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 via-background to-slate-50/60">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="LinkedIn Copilot" className="h-9 w-auto" />
          </div>
          <div className="flex items-center gap-2">
            <Link to="/leads"><Button variant="outline" size="sm" className="gap-1"><Plus className="w-3 h-3" /> Add Leads</Button></Link>
            <Link to="/help"><Button variant="ghost" size="sm"><HelpCircle className="w-4 h-4" /></Button></Link>
            <Link to="/settings"><Button variant="ghost" size="sm"><Settings className="w-4 h-4" /></Button></Link>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4 mt-2">
        {/* Extension Status Bar */}
        <ExtensionStatusBar />

        {/* Campaign Selector */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CampaignSelector
            campaigns={campaigns}
            selectedCampaignId={selectedCampaignId}
            onSelect={v => { setSelectedCampaignId(v); setPipelineFilter(null); setPipelineStageFilter(null); }}
            onNewCampaign={() => setShowNewCampaign(true)}
            onEditCampaign={() => {
              const c = campaigns.find(c => c.id === selectedCampaignId);
              if (c) setEditingCampaign(c);
            }}
            showDrafts={showDrafts}
            onToggleDrafts={() => setShowDrafts(d => !d)}
          />
          <div className="flex gap-2 items-center">
            {selectedCampaignId && !campaignIsActive && !campaignIsPaused && leads.length > 0 && (
              <Button onClick={handleLaunchCampaign} disabled={launching}>
                {launching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Launching...</> : <><Rocket className="w-4 h-4 mr-1" /> Launch Campaign</>}
              </Button>
            )}
            {campaignIsActive && (
              <>
                <Badge variant="default" className="text-xs bg-emerald-600">🟢 Active</Badge>
                <Button variant="outline" size="sm" onClick={() => handlePauseResume('pause')} disabled={togglingPause}>
                  {togglingPause ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Pause className="w-3 h-3 mr-1" /> Pause</>}
                </Button>
                <Link to="/leads"><Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" /> Add Leads</Button></Link>
              </>
            )}
            {campaignIsPaused && (
              <>
                <Badge variant="secondary" className="text-xs">⏸ Paused</Badge>
                <Button variant="outline" size="sm" onClick={() => handlePauseResume('resume')} disabled={togglingPause}>
                  {togglingPause ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Play className="w-3 h-3 mr-1" /> Resume</>}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Campaign Stepper */}
        {selectedCampaignId && (
          <CampaignStepper
            campaignStatus={selectedCampaign?.status || null}
            leadsCount={leads.length}
              pipelineCounts={{
                connection_sent: pipelineCounts.connection_sent,
                connected: acceptedDisplayCount,
                dm_ready: pipelineCounts.dm_ready + pipelineCounts.ready_for_dm,
                ready_for_dm: pipelineCounts.ready_for_dm,
                dm_sent: pipelineCounts.dm_sent,
              replied: pipelineCounts.replied,
            }}
          />
        )}

        {/* Processing Progress */}
        {selectedCampaignId && (
          <ProcessingProgressCard
            leads={leads}
            campaignProfileId={selectedCampaignId}
            onRetryEnrichment={async (cpId) => {
              let done = false;
              let consecutiveFailures = 0;
              const MAX_FAILURES = 10;
              while (!done && consecutiveFailures < MAX_FAILURES) {
                try {
                  const { data: enrichResult, error: enrichError } = await supabase.functions.invoke('enrich-leads-batch', {
                    body: { campaign_profile_id: cpId },
                  });
                  if (enrichError) throw enrichError;
                  if (enrichResult && typeof enrichResult.done !== 'undefined') {
                    done = enrichResult.done;
                    consecutiveFailures = 0;
                    refreshLeads();
                    if (!done) await new Promise(r => setTimeout(r, 1500));
                  } else {
                    consecutiveFailures++;
                    await new Promise(r => setTimeout(r, Math.min(2000 * Math.pow(1.5, consecutiveFailures), 15000)));
                  }
                } catch {
                  consecutiveFailures++;
                  await new Promise(r => setTimeout(r, Math.min(3000 * Math.pow(1.5, consecutiveFailures), 20000)));
                }
              }
              // Then run ICP check
              if (done) {
                await supabase.functions.invoke('icp-check', {
                  body: { campaign_profile_id: cpId },
                });
              }
              refreshLeads();
            }}
            onRetryIcpCheck={async (cpId) => {
              await supabase.functions.invoke('icp-check', {
                body: { campaign_profile_id: cpId },
              });
              refreshLeads();
            }}
          />
        )}

        {/* Connection Verification */}
        {selectedCampaignId && verificationEligible.length > 0 && (
          <Card className="border border-border/80">
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Connection Verification
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Verified accepts are checked directly on LinkedIn. Refresh every 12h to stay accurate.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (!selectedCampaignId || !user) return;
                    if (verificationNeedsRefresh.length === 0) {
                      toast('All connections are already verified.');
                      return;
                    }
                    setVerifying(true);
                    try {
                      const leadIds = verificationNeedsRefresh.map(l => l.id);
                      const { data: existing } = await supabase
                        .from('action_queue')
                        .select('campaign_lead_id')
                        .in('campaign_lead_id', leadIds)
                        .eq('action_type', 'check_connection_status')
                        .eq('status', 'pending');
                      const existingIds = new Set((existing || []).map(e => e.campaign_lead_id));
                      const MAX_BATCH = 80;
                      const toQueue = verificationNeedsRefresh
                        .filter(l => !existingIds.has(l.id))
                        .slice(0, MAX_BATCH);
                      if (toQueue.length === 0) {
                        toast('Verification already queued.');
                        return;
                      }
                      const scheduledFor = new Date().toISOString();
                      const { error } = await supabase.from('action_queue').insert(
                        toQueue.map(lead => ({
                          user_id: user.id,
                          campaign_lead_id: lead.id,
                          action_type: 'check_connection_status',
                          linkedin_url: lead.linkedin_url,
                          scheduled_for: scheduledFor,
                          priority: 1,
                        }))
                      );
                      if (error) throw error;
                      toast.success(`Queued ${toQueue.length} verification checks`);
                      refreshLeads();
                    } catch (e) {
                      toast.error('Failed to queue verification checks');
                    } finally {
                      setVerifying(false);
                    }
                  }}
                  disabled={verifying}
                >
                  {verifying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                  Re-verify now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!selectedCampaignId || !user) return;
                    const ok = window.confirm('Reset verification status for this campaign? This only clears local verification flags.');
                    if (!ok) return;
                    setResettingVerification(true);
                    try {
                      const { error } = await supabase
                        .from('campaign_leads')
                        .update({
                          connection_verified: null,
                          connection_verified_at: null,
                          connection_verification_note: null,
                        })
                        .eq('campaign_profile_id', selectedCampaignId)
                        .eq('user_id', user.id);
                      if (error) throw error;
                      toast.success('Verification flags cleared');
                      refreshLeads();
                    } catch {
                      toast.error('Failed to reset verification flags');
                    } finally {
                      setResettingVerification(false);
                    }
                  }}
                  disabled={resettingVerification}
                >
                  Reset
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verified accepts</p>
                <p className="text-xl font-semibold text-emerald-700">{verifiedAcceptedCount}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Needs verification</p>
                <p className="text-xl font-semibold text-amber-600">{verificationNeedsRefresh.length}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total invites sent</p>
                <p className="text-xl font-semibold text-slate-700">{verificationEligible.length}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Verification rate</p>
                <p className="text-xl font-semibold text-slate-700">
                  {verificationEligible.length > 0 ? Math.round((verifiedAcceptedCount / verificationEligible.length) * 100) : 0}%
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pipeline Stats */}
        {selectedCampaignId && (
          <PipelineStats
            counts={{
              ...pipelineCounts,
              connected: acceptedDisplayCount,
              connection_accepted: 0,
            }}
            onStageClick={s => { setPipelineStageFilter(s); setPipelineFilter(null); }}
            activeFilter={pipelineStageFilter}
            qualifiedTotal={leads.filter(l => l.icp_match === true).length}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="sequence">📊 Sequence View</TabsTrigger>
            <TabsTrigger value="pipeline">📋 Lead Table</TabsTrigger>
            <TabsTrigger value="approval" className="relative">
              📬 Approval Queue
              {needsApproval && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 text-[10px] px-1.5">!</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Sequence View Tab */}
          <TabsContent value="sequence">
            {!selectedCampaignId ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  Select a campaign to view its sequence pipeline.
                </CardContent>
              </Card>
            ) : (
              <LeadSequenceView leads={leads} onRefresh={refreshLeads} />
            )}
          </TabsContent>

          {/* Lead Table Tab */}
          <TabsContent value="pipeline">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">
                  {pipelineStageFilter
                    ? `${pipelineStageFilter.replace(/_/g, ' ')} (${filteredLeads.length})`
                    : `All Leads (${leads.length})`}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Search leads"
                      className="h-8 pl-8 text-xs w-48"
                    />
                  </div>
                  {hasVerificationData && (
                    <Select value={verificationFilter} onValueChange={(v) => setVerificationFilter(v as any)}>
                      <SelectTrigger className="h-8 text-xs w-[150px]">
                        <SelectValue placeholder="Verification" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All leads</SelectItem>
                        <SelectItem value="verified">Verified accepts</SelectItem>
                        <SelectItem value="unverified">Needs verification</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Select value={qualityFilter} onValueChange={(v) => setQualityFilter(v as any)}>
                    <SelectTrigger className="h-8 text-xs w-[150px]">
                      <SelectValue placeholder="Quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All quality</SelectItem>
                      <SelectItem value="ok">Quality OK</SelectItem>
                      <SelectItem value="pending">Quality pending</SelectItem>
                      <SelectItem value="ghost">Ghost profiles</SelectItem>
                    </SelectContent>
                  </Select>
                  {(pipelineFilter || pipelineStageFilter) && (
                    <Button variant="ghost" size="sm" onClick={() => { setPipelineFilter(null); setPipelineStageFilter(null); }} className="text-xs">
                      Show All
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={refreshLeads} className="text-xs gap-1">
                    <RefreshCw className="w-3 h-3" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {!selectedCampaignId ? (
                  <div className="text-center py-12 text-muted-foreground">Select a campaign to view its leads.</div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-4">
                      <Users className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <h3 className="font-semibold mb-1">No leads yet</h3>
                    <p className="text-sm text-muted-foreground mb-3">Upload a CSV with LinkedIn profile URLs to get started.</p>
                    <Link to="/leads"><Button><Upload className="w-4 h-4 mr-1" /> Add Leads</Button></Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                        <tr className="border-b-2 border-border/80">
                          <th className="px-3 py-3 w-10"></th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Location</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Invite Note</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                          {hasVerificationData && (
                            <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Verification</th>
                          )}
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredLeads.map(lead => (
                          <LeadRow
                            key={lead.id}
                            lead={lead}
                            onUpdateStatus={(id, status, extras) => updateLeadStatus.mutate({ leadId: id, status, extras })}
                            isUpdating={updateLeadStatus.isPending}
                            showVerification={hasVerificationData}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Approval Queue Tab */}
          <TabsContent value="approval">
            <DmApprovalQueue
              leads={leads}
              onRefresh={refreshLeads}
              campaignProfileId={selectedCampaignId || undefined}
              stageFlags={stageFlags}
              onEditCampaign={() => {
                const c = campaigns.find(c => c.id === selectedCampaignId);
                if (c) setEditingCampaign(c);
              }}
            />
          </TabsContent>
        </Tabs>
      </main>

      <CampaignEditDialog
        campaign={editingCampaign}
        open={!!editingCampaign}
        onOpenChange={open => { if (!open) setEditingCampaign(null); }}
        onSave={(id, data) => {
          updateCampaign.mutate({ id, ...data } as any);
          toast.success('Campaign updated');
        }}
        onDelete={(id) => {
          deleteCampaign.mutate(id, {
            onSuccess: () => {
              toast.success('Campaign deleted');
              if (selectedCampaignId === id) setSelectedCampaignId(null);
            },
            onError: () => toast.error('Failed to delete campaign'),
          });
        }}
        isPending={updateCampaign.isPending}
        isDeleting={deleteCampaign.isPending}
      />
    </div>
  );
}
