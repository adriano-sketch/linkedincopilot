import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, ListPlus, Loader2, MessageCircle, Plus, Rocket, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import ContactPicker, { type PickedContact } from '@/components/contacts/ContactPicker';
import { addPeopleToList, profileUrlFrom } from '@/lib/addPeople';

/** How the drafts for this list should sound. Stored in campaign_profiles.dm_tone. */
const TONES = [
  { value: 'casual_peer', icon: '😎', label: 'Casual', desc: 'Like talking to a colleague' },
  { value: 'professional_warm', icon: '🤝', label: 'Warm and professional', desc: 'Friendly but businesslike' },
  { value: 'direct_bold', icon: '🎯', label: 'Direct', desc: 'Gets to the point fast' },
  { value: 'consultative', icon: '🧠', label: 'Advisory', desc: 'Speaks from experience' },
];

interface CampaignWizardProps {
  /** Called with the id of the list once it has people and is running. */
  onComplete: (listId: string) => void;
  onCancel?: () => void;
}

/**
 * Creates a list in two steps: name and tone, then the people. A list is a set of people whose posts
 * Olanovo reads; nothing is sent to them.
 */
export default function CampaignWizard({ onComplete, onCancel }: CampaignWizardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();

  const [step, setStep] = useState(0);
  const [listId, setListId] = useState('');
  const [name, setName] = useState('');
  const [tone, setTone] = useState<string>(profile?.dm_tone || '');
  const [creating, setCreating] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  // A launch that finishes after this wizard was closed must not touch the page.
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const [source, setSource] = useState<'contacts' | 'urls'>('contacts');
  const [picked, setPicked] = useState<PickedContact[]>([]);
  const onPickedChange = useCallback((p: PickedContact[]) => setPicked(p), []);
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);

  const addUrl = () => {
    if (!urlInput.trim()) return;
    const url = profileUrlFrom(urlInput);
    if (!url) { toast.error('Enter a valid LinkedIn profile URL (e.g. linkedin.com/in/username)'); return; }
    if (urls.includes(url)) { toast.error('Profile already added'); return; }
    setUrls(prev => [...prev, url]);
    setUrlInput('');
  };

  const handleNext = async () => {
    if (!name.trim()) { toast.error('Give the list a name'); return; }
    if (!tone) { toast.error('Select a comment tone'); return; }
    if (!listId && user) {
      setCreating(true);
      try {
        const { data, error } = await supabase.from('campaign_profiles').insert({
          user_id: user.id,
          name: name.trim(),
          campaign_mode: 'growth',
          campaign_objective: 'build_relationship',
          dm_tone: tone,
          is_default: false,
          is_template: false,
          lead_source: 'manual',
          status: 'draft',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any).select('id').single();
        if (error) throw error;
        setListId(data.id);
        queryClient.invalidateQueries({ queryKey: ['campaign_profiles'] });
        toast.success('List created. Now choose the people.');
      } catch {
        toast.error('Could not create the list');
        return;
      } finally { setCreating(false); }
    }
    setStep(1);
  };

  /** Saves the chosen people. Returns how many entered the list, or -1 on failure. */
  const savePeople = async (): Promise<number> => {
    if (!listId || !user) return 0;
    if (picked.length + urls.length === 0) return 0;
    setImporting(true);
    try {
      const { inserted, skipped, rejected } = await addPeopleToList(user.id, listId, picked, urls);
      setImportedCount(c => c + inserted);
      if (skipped > 0) toast.info(`${skipped} of them are already in another list and were skipped.`);
      if (rejected > 0) toast.error(`${rejected} not added: the profile address is not a valid LinkedIn profile.`);
      return inserted;
    } catch (e) {
      toast.error('Could not add them: ' + (e instanceof Error ? e.message : 'unknown error'));
      return -1;
    } finally { setImporting(false); }
  };

  const handleLaunch = async () => {
    if (!listId || !user) return;
    setLaunching(true);
    try {
      // Whatever is selected now is saved, also on a retry: people already in the list are ignored by the
      // insert, so nothing is duplicated.
      if (picked.length + urls.length > 0) {
        const n = await savePeople();
        if (n < 0) return;
      }
      // The list starts when it has people, counted in the list itself (not from this screen's memory).
      const { count, error: countErr } = await supabase.from('campaign_leads')
        .select('id', { count: 'exact', head: true }).eq('campaign_profile_id', listId);
      if (countErr) throw countErr;
      if (!count) { toast.error('Pick at least 1 contact or add a profile URL'); return; }
      // The row was created at step 0: write what may have changed there since.
      const { error } = await supabase.from('campaign_profiles')
        .update({ status: 'active', name: name.trim(), dm_tone: tone }).eq('id', listId);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['campaign_leads'] });
      queryClient.invalidateQueries({ queryKey: ['campaign_profiles'] });
      toast.success('List started.');
      if (mounted.current) onComplete(listId);
    } catch {
      toast.error('Could not start the list');
    } finally { setLaunching(false); }
  };

  const StepIcon = step === 0 ? ListPlus : Users;

  return (
    <div className={`w-full mx-auto ${step === 1 ? 'max-w-3xl' : 'max-w-lg'}`}>
      <div className="flex gap-2 mb-6">
        {[0, 1].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-border'}`} />)}
      </div>
      <Card>
        <CardHeader>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-2 bg-primary/10">
            <StepIcon className="w-5 h-5 text-primary" />
          </div>
          <CardTitle>Step {step + 1} of 2: {step === 0 ? 'Name and tone' : 'Choose the people'}</CardTitle>
          <CardDescription>
            {step === 0 ? 'Name the list and choose how the drafts should sound.' : 'Choose the people whose posts you want to follow.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div>
                <Label htmlFor="list-name">List name *</Label>
                <Input id="list-name" placeholder="e.g. Operations leaders I know" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div>
                <Label className="mb-2 block">Comment tone *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TONES.map(t => (
                    <button key={t.value} type="button" onClick={() => setTone(t.value)} aria-pressed={tone === t.value}
                      className={`p-3 rounded-lg border text-left transition-all ${tone === t.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                      <span className="text-lg">{t.icon}</span>
                      <p className="text-sm font-medium mt-1">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.desc}</p>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">Each draft is written in the language of the post it answers.</p>
              </div>
              <div className="bg-secondary/60 border border-border rounded-lg p-3 text-sm flex items-start gap-2">
                <MessageCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium m-0">How a list works</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-0">
                    Pick people from your own LinkedIn contacts (or paste profile URLs). From time to time Olanovo reads their latest post. When it is about one of your subjects, a comment draft waits in your Inbox next to the post. You publish it yourself; nothing is posted or liked for you.
                  </p>
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            // While people are being saved the selection is frozen: a change made then would be left out.
            <fieldset disabled={launching || importing} aria-busy={launching || importing}
              className={`space-y-4 border-0 p-0 m-0 min-w-0 ${launching || importing ? 'opacity-60 pointer-events-none' : ''}`}>
              {importedCount > 0 && (
                <div className="bg-gold-bg border border-border rounded-lg p-3">
                  <p className="text-sm font-medium m-0">{importedCount} people added</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-0">Olanovo checks their latest post from time to time. Comment drafts wait for you in the Inbox.</p>
                </div>
              )}
              <Tabs value={source} onValueChange={v => setSource(v as 'contacts' | 'urls')}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="contacts">From my contacts</TabsTrigger>
                  <TabsTrigger value="urls">Paste profile URLs</TabsTrigger>
                </TabsList>
              </Tabs>
              {/* The picker stays mounted while the other tab shows, so what was ticked is kept. */}
              <div className={source === 'contacts' ? '' : 'hidden'}>
                <ContactPicker campaignId={listId} onChange={onPickedChange} />
              </div>
              {source === 'urls' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground m-0">Add the LinkedIn profile URLs of the people you want in this list.</p>
                  <div className="flex gap-2">
                    <Input placeholder="https://www.linkedin.com/in/username" value={urlInput} className="flex-1"
                      onChange={e => setUrlInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }} />
                    <Button variant="outline" size="sm" onClick={addUrl} className="shrink-0 h-10"><Plus className="w-4 h-4 mr-1" /> Add</Button>
                  </div>
                  {urls.length > 0 && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {urls.map(url => {
                        const vanity = url.split('/in/')[1] || url;
                        return (
                          <div key={url} className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-2">
                            <span className="text-sm flex-1 truncate">{vanity}</span>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Remove ${vanity}`} onClick={() => setUrls(prev => prev.filter(u => u !== url))}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground m-0">{urls.length} profile{urls.length !== 1 ? 's' : ''} added</p>
                </div>
              )}
              <p className="text-sm text-muted-foreground border-t border-border pt-3 m-0">
                {picked.length + urls.length > 0
                  ? `${picked.length + urls.length} ${picked.length + urls.length === 1 ? 'person' : 'people'} will be added when you start the list.`
                  : 'Pick contacts or paste URLs, then start the list.'}
              </p>
            </fieldset>
          )}

          <div className="flex justify-between pt-4">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(0)} disabled={launching || importing}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            ) : onCancel ? (
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : <div />}
            {step === 1 ? (
              <Button size="lg" disabled={launching || importing}
                onClick={handleLaunch}>
                {launching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Starting...</> : <><Rocket className="w-4 h-4 mr-1" /> Start this list</>}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}Next <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
