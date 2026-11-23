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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LeadRow from '@/components/LeadRow';
import PipelineStats, { STAGE_STATUS_MAP, stageLabel } from '@/components/PipelineStats';
import CommentQueue from '@/components/network/CommentQueue';
import CampaignSelector from '@/components/CampaignSelector';
import CampaignWizard, { CampaignFormData } from '@/components/CampaignWizard';
import CampaignEditDialog from '@/components/CampaignEditDialog';
import CampaignStepper from '@/components/CampaignStepper';
import AppShell from '@/components/app/AppShell';
import { RefreshCw, Loader2, Rocket, Plus, Pause, Play, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { campaigns, createCampaign, updateCampaign, deleteCampaign } = useCampaignProfiles();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(searchParams.get('campaign'));
  const [showNewCampaign, setShowNewCampaign] = useState(searchParams.get('new') === '1');
  const [editingCampaign, setEditingCampaign] = useState<typeof campaigns[0] | null>(null);
  const [activeTab, setActiveTab] = useState<string>('auto');
  const [pipelineFilter, setPipelineFilter] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const launchOnce = useRef(false);
  const checkoutStatus = searchParams.get('checkout');

  // Auto-select first active campaign
  useEffect(() => {
    if (!selectedCampaignId && campaigns.length > 0) {
      const firstActive = campaigns.find(c => c.status === 'active' || c.status === 'paused');
      if (firstActive) setSelectedCampaignId(firstActive.id);
    }
  }, [campaigns, selectedCampaignId]);

  const { leads, updateLeadStatus, refresh: refreshLeads } = useCampaignLeads(selectedCampaignId);

  // Two views: the comments waiting for approval and the people. Opens on the comments when there are any.
  const hasCommentsToApprove = leads.some(l => l.status === 'comment_review');
  useEffect(() => {
    setActiveTab(t => (t === 'auto' && leads.length > 0) ? (hasCommentsToApprove ? 'approval' : 'pipeline') : t);
  }, [leads.length, hasCommentsToApprove]);


  // Top bar "New campaign" and the ⌘K palette navigate here with ?new=1 / ?campaign=<id>.
  useEffect(() => {
    if (searchParams.get('new') === '1') setShowNewCampaign(true);
    const c = searchParams.get('campaign');
    if (c) setSelectedCampaignId(c);
  }, [searchParams]);

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
        .then(({ error }) => {
          if (error) {
            const details = (error as any)?.context?.body?.error;
            throw new Error(details || error.message);
          }
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
    if (!selectedCampaignId) { toast.error('Select a list'); return; }
    setLaunching(true);
    try {
      // Update campaign status to active and set next_action_at on leads
      await updateCampaign.mutateAsync({ id: selectedCampaignId, status: 'active' } as any);
      toast.success('List started. Olanovo will read these people\'s posts inside your active hours.');
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
      toast.success(`List ${action === 'pause' ? 'paused' : 'resumed'}.`);
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
      toast.success('List started.');
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
        toast.success('List created.');
      } catch {
        toast.error('Could not create the list');
      }
    }
  };

  if (authLoading || profileLoading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppShell>
    );
  }

  const stageFilteredLeads = pipelineStageFilter
    ? leads.filter(l => {
      return (STAGE_STATUS_MAP[pipelineStageFilter] || []).includes(l.status);
    })
    : pipelineFilter ? leads.filter(l => l.status === pipelineFilter) : leads;

  const searchTerm = leadSearch.trim().toLowerCase();
  const filteredLeads = stageFilteredLeads.filter(l => {
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
  const growthCount = (st: string) => leads.filter(l => l.status === st).length;
  const growthCounts = {
    visited: growthCount('visiting_profile'),
    postFound: growthCount('post_found'),
    liked: growthCount('post_liked'),
    toApprove: growthCount('comment_review'),
    engaged: growthCount('engagement_done'),
  };
  const growthStatusCounts = leads.reduce((acc, l) => { acc[l.status] = (acc[l.status] || 0) + 1; return acc; }, {} as Record<string, number>);
  const campaignIsActive = effectiveStatus === 'active';
  const campaignIsPaused = effectiveStatus === 'paused';


  if (showNewCampaign) {
    const closeWizard = () => { setShowNewCampaign(false); if (searchParams.get('new')) navigate('/dashboard', { replace: true }); };
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={closeWizard} className="mb-4">← Back to lists</Button>
          <CampaignWizard onComplete={(...a: Parameters<typeof handleNewCampaignComplete>) => { closeWizard(); return handleNewCampaignComplete(...a); }} onCancel={closeWizard} isPending={createCampaign.isPending} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display font-bold text-4xl leading-none m-0">Lists</h1>
          <p className="text-muted-foreground m-0">Pick a list to see its people and the comments waiting for you.</p>
        </div>
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
                {launching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Launching...</> : <><Rocket className="w-4 h-4 mr-1" /> Start this list</>}
              </Button>
            )}
            {campaignIsActive && (
              <>
                <Badge variant="default" className="text-xs bg-emerald-600">Running</Badge>
                <Button variant="outline" size="sm" onClick={() => handlePauseResume('pause')} disabled={togglingPause}>
                  {togglingPause ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Pause className="w-3 h-3 mr-1" /> Pause</>}
                </Button>
                <Link to="/leads"><Button variant="outline" size="sm"><Plus className="w-3 h-3 mr-1" /> Add people</Button></Link>
              </>
            )}
            {campaignIsPaused && (
              <>
                <Badge variant="secondary" className="text-xs">Paused</Badge>
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
            mode="growth"
            growthCounts={growthCounts}
            leadsCount={leads.length}
            pipelineCounts={{ connection_sent: 0, connected: 0, dm_ready: 0, ready_for_dm: 0, dm_sent: 0, replied: 0 }}
          />
        )}

        {/* Pipeline Stats */}
        {selectedCampaignId && (
          <PipelineStats
            mode="growth"
            counts={growthStatusCounts}
            onStageClick={s => {
              setPipelineFilter(null);
              // "To approve" opens the approval queue itself, not a list of names.
              if (s === 'g_review') { setPipelineStageFilter(null); setActiveTab('approval'); return; }
              setPipelineStageFilter(s);
              if (s) setActiveTab('pipeline');
            }}
            activeFilter={pipelineStageFilter}
          />
        )}

        {/* Until the list has loaded (or when it is empty) the People view shows, with its empty-list guidance. */}
        <Tabs value={activeTab === 'auto' ? 'pipeline' : activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="approval" className="relative">
              Comments to post
              {growthCounts.toApprove > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-5 text-[10px] px-1.5">{growthCounts.toApprove}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pipeline">People</TabsTrigger>
          </TabsList>

          {/* Lead Table Tab */}
          <TabsContent value="pipeline">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">
                  {pipelineStageFilter
                    ? `${stageLabel(pipelineStageFilter)} (${filteredLeads.length})`
                    : `Everyone (${leads.length})`}
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <Input
                      value={leadSearch}
                      onChange={(e) => setLeadSearch(e.target.value)}
                      placeholder="Search people"
                      className="h-8 pl-8 text-xs w-48"
                    />
                  </div>
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
                  <div className="text-center py-12 text-muted-foreground">Select a list to see its people.</div>
                ) : filteredLeads.length === 0 ? (
                  <div className="text-center py-12 px-4 text-sm text-muted-foreground">No one here right now.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                        <tr className="border-b-2 border-border/80">
                          <th className="px-3 py-3 w-10"></th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Company</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Their post</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Your comment</th>
                          <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
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
                            mode="growth"
                            onReview={() => { setPipelineStageFilter(null); setActiveTab('approval'); }}
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
            {selectedCampaignId && (
              <div className="space-y-4">
                {!String((profile as { comment_topics?: string | null } | null)?.comment_topics || '').trim() && (
                  <Card className="border-attention/40 bg-attention/5">
                    <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
                      <p className="text-sm m-0">
                        <span className="font-semibold">Tell the AI what you comment on.</span>{' '}
                        Until you list your subjects, contacts' posts get a like and no comment is drafted.
                      </p>
                      <Link to="/settings#comment-knowledge-base"><Button size="sm">Add your subjects</Button></Link>
                    </CardContent>
                  </Card>
                )}
                <CommentQueue campaignId={selectedCampaignId} />
              </div>
            )}
          </TabsContent>

        </Tabs>
      </div>

      <CampaignEditDialog
        campaign={editingCampaign}
        open={!!editingCampaign}
        onOpenChange={open => { if (!open) setEditingCampaign(null); }}
        onSave={(id, data) => {
          updateCampaign.mutate({ id, ...data } as any);
          toast.success('List updated');
        }}
        onDelete={(id) => {
          deleteCampaign.mutate(id, {
            onSuccess: () => {
              toast.success('List deleted');
              if (selectedCampaignId === id) setSelectedCampaignId(null);
            },
            onError: () => toast.error('Could not delete the list'),
          });
        }}
        isPending={updateCampaign.isPending}
        isDeleting={deleteCampaign.isPending}
      />
    </AppShell>
  );
}
