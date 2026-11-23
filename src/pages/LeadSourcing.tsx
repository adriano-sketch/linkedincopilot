import AppShell from '@/components/app/AppShell';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useCampaignProfiles } from '@/hooks/useCampaignProfiles';
import { useCampaignLeads } from '@/hooks/useCampaignLeads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ContactPicker, { type PickedContact } from '@/components/contacts/ContactPicker';
import { addPeopleToList, isLegacyDescription, profileUrlFrom } from '@/lib/addPeople';

/**
 * Add people to a list that already exists. Same two sources as when the list is created:
 * the user's own LinkedIn connections, or profile URLs pasted by hand.
 */
export default function LeadSourcing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { campaigns } = useCampaignProfiles();
  const lists = campaigns.filter(c => !c.is_template);
  const [listId, setListId] = useState<string>(params.get('list') || '');
  const [source, setSource] = useState<'contacts' | 'urls'>('contacts');
  const [picked, setPicked] = useState<PickedContact[]>([]);
  const onPicked = useCallback((p: PickedContact[]) => setPicked(p), []);
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!authLoading && !user) navigate('/'); }, [user, authLoading, navigate]);
  // With a single list there is nothing to choose.
  useEffect(() => { if (!listId && lists.length === 1) setListId(lists[0].id); }, [listId, lists]);

  const { leads } = useCampaignLeads(listId || undefined);
  const list = lists.find(c => c.id === listId);
  // People already in this list stay ticked in the picker: they are not counted or sent again.
  const already = new Set(leads.map(l => profileUrlFrom(l.linkedin_url) || l.linkedin_url));
  const newPicked = picked.filter(p => !already.has(profileUrlFrom(p.linkedin_url) || p.linkedin_url));
  const newUrls = urls.filter(u => !already.has(u));
  // One person picked and also pasted counts once.
  const total = new Set([...newPicked.map(p => profileUrlFrom(p.linkedin_url) || p.linkedin_url), ...newUrls]).size;
  // Lists made before the description was asked carry a placeholder: do not prefill the picker with it.
  const description = list?.icp_description && !isLegacyDescription(list.icp_description) ? list.icp_description : undefined;

  const addUrl = () => {
    const url = profileUrlFrom(urlInput);
    if (!url) { toast.error('Enter a LinkedIn profile URL, for example linkedin.com/in/username'); return; }
    if (urls.includes(url)) { toast.error('That profile is already in the box'); return; }
    setUrls(prev => [...prev, url]);
    setUrlInput('');
  };

  const save = async () => {
    if (!user || !listId) return;
    if (total === 0) { toast.error('Pick at least one contact or add a profile URL'); return; }
    setSaving(true);
    try {
      const { inserted, skipped, rejected } = await addPeopleToList(user.id, listId, newPicked, newUrls);
      queryClient.invalidateQueries({ queryKey: ['campaign_leads'] });
      if (inserted > 0) toast.success(`${inserted} ${inserted === 1 ? 'person' : 'people'} added to ${list?.name || 'the list'}.`);
      if (skipped > 0) toast.info(`${skipped} already in one of your lists and skipped.`);
      if (rejected > 0) toast.error(`${rejected} not added: the profile address is not a valid LinkedIn profile.`);
      if (inserted > 0) { setUrls([]); navigate(`/dashboard?campaign=${listId}`); }
    } catch (e) {
      toast.error('Could not add them: ' + (e instanceof Error ? e.message : 'unknown error'));
    } finally { setSaving(false); }
  };

  return (
    <AppShell>
      <div className="max-w-4xl space-y-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display font-bold text-4xl leading-none m-0">Add people</h1>
          <p className="text-muted-foreground m-0">Put more people in a list you already have. Olanovo starts reading their posts in the next cycle.</p>
        </div>

        {lists.length === 0 ? (
          <Card><CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground m-0">You have no list yet. People are chosen when you create one.</p>
            <Link to="/dashboard?new=1"><Button><Plus className="w-4 h-4 mr-1" /> New list</Button></Link>
          </CardContent></Card>
        ) : (
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <Label>List:</Label>
              <Select value={listId} onValueChange={v => { setListId(v); setPicked([]); setUrls([]); }}>
                <SelectTrigger className="w-[280px]"><SelectValue placeholder="Select a list" /></SelectTrigger>
                <SelectContent>
                  {lists.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              {listId && <Badge variant="outline">{leads.length} {leads.length === 1 ? 'person' : 'people'} in it</Badge>}
            </div>

            {!listId ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">Select a list to add people to.</CardContent></Card>
            ) : (
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <Tabs value={source} onValueChange={v => setSource(v as 'contacts' | 'urls')}>
                    <TabsList className="w-full grid grid-cols-2">
                      <TabsTrigger value="contacts">From my contacts</TabsTrigger>
                      <TabsTrigger value="urls">Paste profile URLs</TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {/* The picker stays mounted while the other tab shows, so what was ticked is kept. */}
                  <div className={source === 'contacts' ? '' : 'hidden'}>
                    <ContactPicker key={listId} campaignId={listId} initialDescription={description} onChange={onPicked} />
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
                            const vanity = url.split('/in/')[1]?.replace(/\/$/, '') || url;
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
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 flex-wrap border-t border-border pt-4">
                    <p className="text-sm text-muted-foreground m-0">
                      {total > 0 ? `${total} ${total === 1 ? 'person' : 'people'} ready to add.` : 'Pick contacts or paste URLs.'}
                      {' '}Someone already in one of your lists is skipped.
                    </p>
                    <Button onClick={save} disabled={saving || total === 0}>
                      {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Adding...</> : <><UserPlus className="w-4 h-4 mr-1" /> Add {total > 0 ? total : ''} {total === 1 ? 'person' : 'people'}</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
