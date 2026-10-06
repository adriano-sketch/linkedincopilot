import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Download, ExternalLink, FileUp, Loader2, Radar, Search, Sparkles, Users, X } from 'lucide-react';
import { readConnectionsFile } from '@/lib/linkedinExport';
import { supabase } from '@/integrations/supabase/client';
import { useNetworkSettings } from '@/hooks/useNetwork';
import {
  useConnectionsCount, useContactActions, useContactMatches, useContactSearchStatus, type ContactMatch,
} from '@/hooks/useContacts';

export type PickedContact = {
  linkedin_url: string;
  full_name: string | null;
  title: string | null;
  company: string | null;
};

const SCORE_FILTERS = [
  { value: '80', label: 'Strong fit (80+): clearly matches' },
  { value: '60', label: 'Likely fit (60+): probably matches' },
  { value: '30', label: 'Possible fit (30+): worth a look' },
];

function ScorePill({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-navy text-primary' : score >= 60 ? 'bg-gold-bg text-[#7A4B00]' : 'bg-secondary text-muted-foreground';
  return <span className={`shrink-0 font-mono text-xs font-semibold px-2 py-1 rounded-md tabular-nums ${cls}`}>{score}</span>;
}

/**
 * Finds the people who fit a Growth campaign among the user's own LinkedIn connections.
 * Contacts come from LinkedIn's official export (all of them, instantly) or from a search the
 * extension runs on LinkedIn (1st-degree only). Claude scores each one against the description.
 */
export default function ContactPicker({
  campaignId, initialDescription, onChange,
}: {
  campaignId: string | null;
  initialDescription?: string;
  onChange: (picked: PickedContact[]) => void;
}) {
  const [description, setDescription] = useState(initialDescription || '');
  const [minScore, setMinScore] = useState('60');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [picked, setPicked] = useState<Map<string, ContactMatch>>(new Map());
  const fileRef = useRef<HTMLInputElement>(null);
  const { settings: netSettings } = useNetworkSettings();
  const salesNav = netSettings?.linkedin_account_tier === 'sales_navigator';
  const [postedRecently, setPostedRecently] = useState(true);

  const { data: contactCount = 0 } = useConnectionsCount();
  const { data: runs = [] } = useContactSearchStatus(campaignId);
  const searching = runs.some(r => r.status === 'queued');
  const { data: matches = [], isLoading } = useContactMatches(campaignId, Number(minScore), searching);
  const { importConnections, suggestKeywords, score, searchLinkedIn, setSelected } = useContactActions(campaignId);

  // Keep previously saved selections when the list loads.
  useEffect(() => {
    setPicked(prev => {
      const next = new Map(prev);
      for (const m of matches) if (m.selected && !next.has(m.id)) next.set(m.id, m);
      return next;
    });
  }, [matches]);

  useEffect(() => {
    onChange(Array.from(picked.values()).map(m => ({
      linkedin_url: m.connection.linkedin_url,
      full_name: m.connection.full_name,
      title: m.connection.position || m.connection.headline,
      company: m.connection.company,
    })));
  }, [picked, onChange]);

  const toggle = (m: ContactMatch, on: boolean) => {
    setPicked(prev => {
      const next = new Map(prev);
      if (on) next.set(m.id, m); else next.delete(m.id);
      return next;
    });
    setSelected.mutate({ ids: [m.id], selected: on });
  };
  const allShownPicked = matches.length > 0 && matches.every(m => picked.has(m.id));
  const toggleAll = () => {
    const on = !allShownPicked;
    setPicked(prev => {
      const next = new Map(prev);
      for (const m of matches) { if (on) next.set(m.id, m); else next.delete(m.id); }
      return next;
    });
    setSelected.mutate({ ids: matches.map(m => m.id), selected: on });
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    try {
      const { connections } = await readConnectionsFile(file);
      if (connections.length === 0) { toast.error('No contacts with a LinkedIn URL in this file'); return; }
      const n = await importConnections.mutateAsync(connections);
      toast.success(`${n.toLocaleString()} contacts imported. Now click "Find matches".`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read the file');
    }
  };

  const runScoring = async () => {
    if (description.trim().length < 8) { toast.error('Describe who you are looking for first'); return; }
    if (contactCount === 0) { toast.error('Import your contacts or run a LinkedIn search first'); return; }
    setScoring(true);
    setProgress({ done: 0, total: contactCount });
    try {
      await score(description.trim(), (done, total) => setProgress({ done, total }));
      toast.success('Done. Pick who you want to engage with.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Matching failed, try again');
    } finally {
      setScoring(false);
      setProgress(null);
    }
  };

  const suggest = async () => {
    if (description.trim().length < 8) { toast.error('Describe who you are looking for first'); return; }
    try {
      const k = await suggestKeywords.mutateAsync(description.trim());
      setKeywords(k);
    } catch {
      toast.error('Could not suggest keywords');
    }
  };
  const addKeyword = () => {
    const k = keywordInput.trim();
    if (k && !keywords.includes(k)) setKeywords([...keywords, k].slice(0, 8));
    setKeywordInput('');
  };
  const startSearch = async () => {
    if (description.trim().length < 8) { toast.error('Describe who you are looking for first'); return; }
    let terms = keywords;
    if (terms.length === 0) {
      // No keywords yet: derive them from the description so one click is enough.
      try {
        terms = await suggestKeywords.mutateAsync(description.trim());
        setKeywords(terms);
      } catch {
        toast.error('Could not suggest keywords. Add one and try again.');
        return;
      }
      if (terms.length === 0) { toast.error('Add at least one keyword'); return; }
    }
    try {
      // Saved first: people found by the extension are scored against it automatically.
      if (campaignId) await supabase.from('campaign_profiles').update({ icp_description: description.trim() }).eq('id', campaignId);
      const r = await searchLinkedIn.mutateAsync({ keywords: terms, pages: 2, postedRecently: salesNav && postedRecently });
      if (r.already_running) toast.info('A search is already running for this campaign.');
      else if (r.extension_online === false) toast.warning('Search queued. It starts when the Chrome extension is online, during your active hours.');
      else toast.success('Search started. Matches appear here in a few minutes.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the search');
    }
  };

  const lastRun = runs[0];
  const foundBySearch = useMemo(() => runs.reduce((s, r) => s + (r.new_count || 0), 0), [runs]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="contact-target">Who are you looking for among your contacts?</Label>
        <Textarea
          id="contact-target"
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Maintenance managers, reliability engineers and people responsible for energy efficiency in industrial plants"
        />
      </div>

      <div className="rounded-xl border border-border bg-background/60 p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 font-medium">
            <Users className="w-4 h-4 text-gold-dark" />
            {contactCount > 0 ? `${contactCount.toLocaleString()} contacts loaded` : 'No contacts loaded yet'}
          </div>
          {foundBySearch > 0 && <span className="text-xs text-muted-foreground">{foundBySearch} found by the extension</span>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2.5">
            <div className="font-semibold text-sm flex items-center gap-2"><Download className="w-4 h-4" />All contacts, from LinkedIn's export</div>
            <ol className="text-xs text-muted-foreground list-decimal pl-4 space-y-1 m-0">
              <li>
                Open <a className="text-gold-dark font-medium underline inline-flex items-center gap-0.5" href="https://www.linkedin.com/mypreferences/d/download-my-data" target="_blank" rel="noreferrer">Get a copy of your data<ExternalLink className="w-3 h-3" /></a>
              </li>
              <li>Choose only <strong>Connections</strong> and request the archive</li>
              <li>LinkedIn emails it, usually within an hour (it says up to 24h). Upload the .zip or Connections.csv here. Contacts stay saved for all your campaigns</li>
            </ol>
            <input ref={fileRef} type="file" accept=".csv,.zip,text/csv,application/zip" className="hidden" onChange={onFile} />
            <Button variant="outline" className="mt-auto h-10" onClick={() => fileRef.current?.click()} disabled={importConnections.isPending}>
              {importConnections.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <FileUp className="w-4 h-4 mr-1.5" />}
              Upload file
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2.5">
            <div className="font-semibold text-sm flex items-center gap-2">
              {salesNav ? <Radar className="w-4 h-4 text-gold-dark" /> : <Search className="w-4 h-4" />}
              {salesNav ? 'Search with Sales Navigator' : 'Let the extension search LinkedIn'}
            </div>
            <p className="text-xs text-muted-foreground m-0">
              {salesNav
                ? 'Searches your 1st-degree connections in Sales Navigator, one keyword at a time (up to 25 people per page). Faster than waiting for the export.'
                : 'Searches only your 1st-degree connections, one keyword at a time (up to 20 people each). Each page uses 1 search from your monthly budget. For all your contacts, the export file is better.'}
            </p>
            {salesNav && (
              <label className="flex items-start gap-2 text-xs cursor-pointer rounded-md bg-secondary/60 p-2">
                <Checkbox checked={postedRecently} onCheckedChange={v => setPostedRecently(v === true)} className="mt-0.5" />
                <span><strong>Only people who posted in the last 30 days.</strong> They have recent posts for you to comment on, which is what Growth needs.</span>
              </label>
            )}
            <div className="flex flex-wrap gap-1.5">
              {keywords.map(k => (
                <span key={k} className="inline-flex items-center gap-1 text-xs bg-secondary rounded-full pl-2.5 pr-1 py-0.5">
                  {k}
                  <button aria-label={`Remove ${k}`} className="p-0.5 rounded-full hover:bg-border" onClick={() => setKeywords(keywords.filter(x => x !== k))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <Input value={keywordInput} onChange={e => setKeywordInput(e.target.value)} placeholder="Add a keyword and press Enter"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }} className="h-9 text-sm" />
            <Button variant="ghost" size="sm" className="h-9 self-start px-2 text-gold-dark" onClick={suggest} disabled={suggestKeywords.isPending}>
              {suggestKeywords.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span className="ml-1">Suggest keywords from my description</span>
            </Button>
            <Button variant="outline" className="mt-auto h-10" onClick={startSearch} disabled={searchLinkedIn.isPending || suggestKeywords.isPending || searching}>
              {searching || searchLinkedIn.isPending ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Search className="w-4 h-4 mr-1.5" />}
              {searching ? `Searching "${(lastRun?.query || '').slice(0, 24)}"…` : salesNav ? 'Search in Sales Navigator' : 'Search my connections'}
            </Button>
          </div>
        </div>

        <Button onClick={runScoring} disabled={scoring || contactCount === 0} className="h-11 font-semibold">
          {scoring ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
          {scoring ? 'Analyzing your contacts…' : 'Find matches'}
        </Button>
        {contactCount === 0 && !scoring && (
          <p className="text-xs text-muted-foreground text-center -mt-2 m-0">
            {searching ? 'Waiting for the extension to bring the first contacts…' : 'Load contacts first: upload the file or run the search above.'}
          </p>
        )}
        {progress && (
          <div className="flex flex-col gap-1.5">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            <span className="text-xs text-muted-foreground tabular-nums">{progress.done.toLocaleString()} of {progress.total.toLocaleString()} contacts analyzed</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm cursor-pointer min-h-[40px]">
            <Checkbox checked={allShownPicked} onCheckedChange={toggleAll} disabled={matches.length === 0} />
            Select all shown ({matches.length})
          </label>
          <Select value={minScore} onValueChange={setMinScore}>
            <SelectTrigger className="w-[260px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{SCORE_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div className="rounded-xl border border-border bg-card max-h-[420px] overflow-y-auto">
          {isLoading ? (
            <p className="text-sm text-muted-foreground p-6 text-center">Loading…</p>
          ) : matches.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6 text-center">
              {contactCount === 0 ? 'Load your contacts above, then click "Find matches".' : 'No matches yet at this level. Click "Find matches" or lower the filter.'}
            </p>
          ) : (
            <ul className="list-none m-0 p-0 divide-y divide-border">
              {matches.map(m => {
                const on = picked.has(m.id);
                const role = [m.connection.position || m.connection.headline, m.connection.company].filter(Boolean).join(' · ');
                return (
                  <li key={m.id}>
                    <label className={`flex items-start gap-3 px-4 py-3 cursor-pointer ${on ? 'bg-gold-bg/40' : 'hover:bg-background/60'}`}>
                      <Checkbox className="mt-1" checked={on} onCheckedChange={v => toggle(m, v === true)} aria-label={`Select ${m.connection.full_name || 'contact'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium truncate">{m.connection.full_name || m.connection.linkedin_url.replace('https://www.linkedin.com/in/', '')}</span>
                          <a href={m.connection.linkedin_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                            className="text-muted-foreground hover:text-foreground" aria-label="Open profile"><ExternalLink className="w-3.5 h-3.5" /></a>
                        </div>
                        {role && <div className="text-[13px] text-muted-foreground truncate">{role}</div>}
                        {m.reason && <div className="text-xs text-gold-dark mt-0.5">{m.reason}</div>}
                      </div>
                      <ScorePill score={m.score} />
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="text-sm font-medium m-0">{picked.size} contact{picked.size === 1 ? '' : 's'} selected</p>
      </div>
    </div>
  );
}
