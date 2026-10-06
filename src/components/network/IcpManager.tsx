import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Target, Loader2, Radar } from 'lucide-react';
import { toast } from 'sonner';
import { useIcps, useNetworkSettings, type Icp } from '@/hooks/useNetwork';

const SENIORITIES: { key: string; label: string }[] = [
  { key: 'entry', label: 'Entry level' },
  { key: 'senior', label: 'Senior' },
  { key: 'manager', label: 'Manager' },
  { key: 'director', label: 'Director' },
  { key: 'vp', label: 'VP' },
  { key: 'cxo', label: 'C-level' },
  { key: 'owner', label: 'Owner / Partner' },
];

const toList = (s: string) => s.split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
const fromList = (l?: string[] | null) => (l || []).join(', ');

type Form = {
  id?: string;
  name: string;
  description: string;
  titles: string;
  keywords: string;
  exclude_keywords: string;
  locations: string;
  location_geo_ids: string;
  industries: string;
  post_topics: string;
  min_fit_score: number;
  seniorities: string[];
  company_size_min: string;
  company_size_max: string;
  recently_posted: boolean;
  changed_jobs: boolean;
  prospecting_enabled: boolean;
  engagement_enabled: boolean;
  is_active: boolean;
};

const empty: Form = {
  name: '', description: '', titles: '', keywords: '', exclude_keywords: '', locations: '', location_geo_ids: '',
  industries: '', post_topics: '', min_fit_score: 70, seniorities: [], company_size_min: '', company_size_max: '',
  recently_posted: false, changed_jobs: false, prospecting_enabled: true, engagement_enabled: true, is_active: true,
};

function toForm(i: Icp): Form {
  return {
    id: i.id, name: i.name, description: i.description || '', titles: fromList(i.titles), keywords: fromList(i.keywords),
    exclude_keywords: fromList(i.exclude_keywords), locations: fromList(i.locations), location_geo_ids: fromList(i.location_geo_ids),
    industries: fromList(i.industries), post_topics: fromList(i.post_topics), min_fit_score: i.min_fit_score,
    seniorities: i.seniorities || [], company_size_min: i.company_size_min ? String(i.company_size_min) : '',
    company_size_max: i.company_size_max ? String(i.company_size_max) : '',
    recently_posted: !!i.recently_posted, changed_jobs: !!i.changed_jobs,
    prospecting_enabled: i.prospecting_enabled, engagement_enabled: i.engagement_enabled, is_active: i.is_active,
  };
}

export default function IcpManager() {
  const { icps, isLoading, save, remove } = useIcps();
  const { settings } = useNetworkSettings();
  const salesNav = settings?.linkedin_account_tier === 'sales_navigator';
  const toSize = (v: string) => { const n = parseInt(v.replace(/\D/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };
  const [form, setForm] = useState<Form | null>(null);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm(f => (f ? { ...f, [k]: v } : f));

  const submit = async () => {
    if (!form) return;
    if (!form.name.trim()) { toast.error('Give this ICP a name'); return; }
    if (toList(form.titles).length === 0 && !form.description.trim()) {
      toast.error('Add at least one target title or a description');
      return;
    }
    try {
      await save.mutateAsync({
        id: form.id,
        name: form.name.trim(),
        description: form.description.trim() || null,
        titles: toList(form.titles),
        keywords: toList(form.keywords),
        exclude_keywords: toList(form.exclude_keywords),
        locations: toList(form.locations),
        location_geo_ids: toList(form.location_geo_ids).filter(x => /^\d+$/.test(x)),
        industries: toList(form.industries),
        post_topics: toList(form.post_topics),
        min_fit_score: form.min_fit_score,
        seniorities: form.seniorities,
        company_size_min: toSize(form.company_size_min),
        company_size_max: toSize(form.company_size_max),
        recently_posted: form.recently_posted,
        changed_jobs: form.changed_jobs,
        prospecting_enabled: form.prospecting_enabled,
        engagement_enabled: form.engagement_enabled,
        is_active: form.is_active,
        // reset search pagination when the targeting changes
        ...(form.id ? { people_search_page: 0, people_search_exhausted_at: null } : {}),
      } as Partial<Icp> & { name: string });
      toast.success(form.id ? 'ICP updated' : 'ICP created. The extension starts working on it in the next cycle.');
      setForm(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save ICP');
    }
  };

  const del = async (i: Icp) => {
    if (!window.confirm(`Delete ICP "${i.name}"? People and posts already found are kept.`)) return;
    try { await remove.mutateAsync(i.id); toast.success('ICP deleted'); } catch { toast.error('Could not delete'); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ideal customer profiles</h2>
          <p className="text-sm text-muted-foreground">
            Each ICP drives both features: finding people to connect with, and finding their posts to comment on.
          </p>
        </div>
        <Button onClick={() => setForm({ ...empty })}><Plus className="w-4 h-4 mr-1" /> New ICP</Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : icps.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-3">
            <Target className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No ICP yet. Describe who you want in your network and the extension does the rest.</p>
            <Button onClick={() => setForm({ ...empty })}><Plus className="w-4 h-4 mr-1" /> Create your first ICP</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {icps.map(i => (
            <Card key={i.id} className={i.is_active ? '' : 'opacity-60'}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{i.name}</CardTitle>
                    {i.description && <CardDescription className="line-clamp-2">{i.description}</CardDescription>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => setForm(toForm(i))} aria-label="Edit"><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(i)} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {i.titles.length > 0 && <p><span className="text-muted-foreground">Titles:</span> {i.titles.join(', ')}</p>}
                {i.locations.length > 0 && <p><span className="text-muted-foreground">Locations:</span> {i.locations.join(', ')}</p>}
                <div className="flex flex-wrap gap-1 pt-1">
                  {!i.is_active && <Badge variant="outline">Paused</Badge>}
                  {i.prospecting_enabled && <Badge variant="secondary">Grows network</Badge>}
                  {i.engagement_enabled && <Badge variant="secondary">Monitors posts</Badge>}
                  {salesNav && (i.seniorities.length > 0 || i.recently_posted || i.changed_jobs || i.company_size_min || i.company_size_max) && (
                    <Badge variant="outline" className="border-primary/40 text-primary">Sales Navigator filters</Badge>
                  )}
                  <Badge variant="outline">Fit ≥ {i.min_fit_score}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={o => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? 'Edit ICP' : 'New ICP'}</DialogTitle>
            <DialogDescription>Separate multiple values with commas.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Marketing agency owners in Florida" />
              </div>
              <div className="space-y-1">
                <Label>Who are they? (the AI reads this)</Label>
                <Textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)}
                  placeholder="Founders and CEOs of small B2B marketing agencies (5-50 people) that sell outbound or lead generation services." />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Target titles</Label>
                  <Input value={form.titles} onChange={e => set('titles', e.target.value)} placeholder="CEO, Founder, Head of Sales" />
                </div>
                <div className="space-y-1">
                  <Label>Extra search keywords</Label>
                  <Input value={form.keywords} onChange={e => set('keywords', e.target.value)} placeholder="agency, outbound" />
                </div>
                <div className="space-y-1">
                  <Label>Exclude if headline contains</Label>
                  <Input value={form.exclude_keywords} onChange={e => set('exclude_keywords', e.target.value)} placeholder="student, intern, recruiter" />
                </div>
                <div className="space-y-1">
                  <Label>Industries</Label>
                  <Input value={form.industries} onChange={e => set('industries', e.target.value)} placeholder="Marketing services, SaaS" />
                </div>
                <div className="space-y-1">
                  <Label>Locations</Label>
                  <Input value={form.locations} onChange={e => set('locations', e.target.value)} placeholder="Florida, Texas" />
                </div>
                <div className="space-y-1">
                  <Label>LinkedIn location IDs (optional)</Label>
                  <Input value={form.location_geo_ids} onChange={e => set('location_geo_ids', e.target.value)} placeholder="101318387" />
                  <p className="text-xs text-muted-foreground">The number after geoUrn in a LinkedIn search URL. Makes the search stricter.</p>
                </div>
              </div>
              <div className={`space-y-3 rounded-lg border p-3 ${salesNav ? 'border-primary/30 bg-primary/5' : 'border-dashed'}`}>
                <div className="flex items-start gap-2">
                  <Radar className={`w-4 h-4 mt-0.5 shrink-0 ${salesNav ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <p className="text-sm font-medium">Sales Navigator filters</p>
                    <p className="text-xs text-muted-foreground">
                      {salesNav
                        ? 'Your account has Sales Navigator, so these filters go straight into the search.'
                        : 'Used only when your LinkedIn account has Sales Navigator. Without it, the AI still uses them to score people.'}
                    </p>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Seniority</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {SENIORITIES.map(sn => {
                      const on = form.seniorities.includes(sn.key);
                      return (
                        <button key={sn.key} type="button" aria-pressed={on}
                          onClick={() => set('seniorities', on ? form.seniorities.filter(x => x !== sn.key) : [...form.seniorities, sn.key])}
                          className={`rounded-full border px-3 py-1 text-xs transition-colors ${on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                          {sn.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid gap-3 grid-cols-2">
                  <div className="space-y-1">
                    <Label>Company size, from</Label>
                    <Input inputMode="numeric" value={form.company_size_min} onChange={e => set('company_size_min', e.target.value)} placeholder="50" />
                  </div>
                  <div className="space-y-1">
                    <Label>to (employees)</Label>
                    <Input inputMode="numeric" value={form.company_size_max} onChange={e => set('company_size_max', e.target.value)} placeholder="5000" />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm">
                    <span>Posted on LinkedIn in the last 30 days<span className="block text-xs text-muted-foreground">Active people accept more and have posts to comment on.</span></span>
                    <Switch checked={form.recently_posted} onCheckedChange={v => set('recently_posted', v)} />
                  </label>
                  <label className="flex items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm">
                    <span>Changed jobs in the last 90 days<span className="block text-xs text-muted-foreground">New in the role, more open to new suppliers.</span></span>
                    <Switch checked={form.changed_jobs} onCheckedChange={v => set('changed_jobs', v)} />
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Post topics to watch</Label>
                <Input value={form.post_topics} onChange={e => set('post_topics', e.target.value)} placeholder="cold outreach, lead generation, hiring SDR" />
                <p className="text-xs text-muted-foreground">Used to find recent posts from people in this ICP. If empty, the keywords are used.</p>
              </div>
              <div className="space-y-2">
                <Label>Minimum fit score to send an invite: {form.min_fit_score}</Label>
                <Slider value={[form.min_fit_score]} min={40} max={95} step={5} onValueChange={v => set('min_fit_score', v[0])} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  Grow my network
                  <Switch checked={form.prospecting_enabled} onCheckedChange={v => set('prospecting_enabled', v)} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  Monitor posts
                  <Switch checked={form.engagement_enabled} onCheckedChange={v => set('engagement_enabled', v)} />
                </label>
                <label className="flex items-center justify-between gap-2 rounded-md border p-3 text-sm">
                  Active
                  <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
                </label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
