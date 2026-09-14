// Local-only design review. This route is removed from production builds.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Plus, WifiOff } from 'lucide-react';
import AppShell from '@/components/AppShell';
import ProspectContext from '@/components/ProspectContext';
import PipelineStats from '@/components/PipelineStats';
import { CampaignLead } from '@/hooks/useCampaignLeads';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const sample = {
  id: 'design-sample', full_name: 'Sarah Chen', title: 'Founder', company: 'Northstar Studio',
  location: 'Austin, TX', profile_headline: 'Designing clear, useful experiences for B2B software teams.',
  profile_about: 'We help B2B software teams turn complex products into clear, useful experiences.',
  icp_match: true, icp_match_reason: 'The company is a design agency serving B2B software teams, matching this example campaign’s audience.',
  linkedin_url: '',
} as CampaignLead;
const draft = 'Sarah, thanks for connecting. With Northstar working on complex B2B products, I wondered how your team handles the transition from design to client delivery. We help studios simplify that handoff. Is that something you’re looking at?';

export default function DesignPreview() {
  const [tab, setTab] = useState('review');
  const [text, setText] = useState(draft);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  return <AppShell title="Design preview">
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 mb-6">Local design preview · Fictional prospects and counts. No campaign actions or messages are sent. <Link to="/" className="underline ml-2">View public site →</Link></div>
    <div className="workspace-heading"><div><p className="eyebrow">YOUR OUTREACH, IN FOCUS</p><h1>Campaigns</h1><p>Keep the context, conversations and next steps connected.</p></div><Link to="/auth?mode=signup"><Button className="gap-2"><Plus size={15} /> Create your workspace</Button></Link></div>
    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-5"><WifiOff size={15} /> Extension not connected in this preview</div>
    <div className="attention-banner mb-5"><div><strong>{reviewed ? 'Draft reviewed in this preview.' : 'Your messages are ready for a closer look.'}</strong><p>Review prospect context and drafts before enabling the next stage.</p></div><Button variant="outline" size="sm" onClick={() => setTab('review')}>Review messages →</Button></div>
    <div className="campaign-toolbar mb-5 flex items-center gap-3 justify-between"><div><p className="eyebrow mb-1">EXAMPLE CAMPAIGN</p><h2 className="text-sm font-semibold">B2B design studios</h2></div><span className="text-xs text-muted-foreground">Sample data</span></div>
    <PipelineStats counts={{ ready: 12, visiting_profile: 4, connection_sent: 9, connected: 6, dm_pending_approval: 3, dm_sent: 5, replied: 2, ghost: 1, icp_rejected: 4 }} onStageClick={() => setTab('prospects')} />
    <Tabs value={tab} onValueChange={setTab} className="mt-7"><TabsList><TabsTrigger value="review">Review messages</TabsTrigger><TabsTrigger value="prospects">Prospects</TabsTrigger></TabsList>
      <TabsContent value="review"><div className="mb-5"><h2 className="text-xl font-semibold tracking-tight">Make every message worth sending.</h2><p className="text-xs text-muted-foreground mt-2">Check the available context, read the draft and decide what happens next.</p></div>
        <div className="rounded-xl border bg-white"><div className="p-5 border-b flex justify-between items-center"><h3 className="font-semibold text-sm">Direct messages</h3><span className="text-xs text-amber-800">Illustrative draft</span></div><article className="approval-message-card"><ProspectContext lead={sample} /><div className="approval-draft"><p className="eyebrow">DIRECT MESSAGE · DRAFT</p>{editing ? <textarea aria-label="Edit sample message" className="approval-draft-text w-full min-h-44" value={text} onChange={e => setText(e.target.value)} /> : <div className="approval-draft-text">{text}</div>}<div className="flex gap-2 flex-wrap"><Button size="sm" onClick={() => { setReviewed(true); setEditing(false); }} disabled={!text.trim()}><Check size={14} className="mr-2" />{reviewed ? 'Reviewed in preview' : 'Mark sample reviewed'}</Button><Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? 'Save sample edit' : 'Edit sample'}</Button></div><p className="text-[10px] text-muted-foreground mt-4">Sample interaction only. In the app, “Approve this DM & send” queues the individual message for sending.</p></div></article></div>
      </TabsContent>
      <TabsContent value="prospects"><div className="rounded-xl border bg-white p-6"><h2 className="font-semibold mb-4">Example prospect</h2><div className="grid sm:grid-cols-4 gap-4 text-sm"><span>Sarah Chen</span><span>Northstar Studio</span><span>Austin, TX</span><Button variant="outline" size="sm" onClick={() => setTab('review')}>Review draft →</Button></div><p className="text-xs text-muted-foreground mt-5">The live workspace filters actual prospects when you select a stage. This local preview uses fictional data.</p></div></TabsContent>
    </Tabs>
  </AppShell>;
}
