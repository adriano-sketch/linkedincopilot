import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Save, X, Plus, Trash2 } from 'lucide-react';
import { CampaignProfile } from '@/hooks/useCampaignProfiles';
import LocationAutocomplete from '@/components/LocationAutocomplete';

function DeleteCampaignConfirm({ campaignName, onDelete, isDeleting }: { campaignName: string; onDelete: () => void; isDeleting?: boolean }) {
  const [confirmText, setConfirmText] = useState('');
  const canDelete = confirmText === 'DELETE';

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isDeleting}>
          <Trash2 className="w-4 h-4 mr-1" /> Delete Campaign
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{campaignName}"?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span>This will permanently delete the campaign and all its associated leads. This action cannot be undone.</span>
            <span className="block">
              Type <strong className="text-foreground">DELETE</strong> to confirm:
            </span>
            <Input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value.toUpperCase())}
              placeholder="Type DELETE"
              className="mt-1"
            />
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { setConfirmText(''); onDelete(); }}
            disabled={!canDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const CAMPAIGN_OBJECTIVES = [
  { value: 'book_call', label: 'Book a Call' },
  { value: 'get_referral', label: 'Get Referrals' },
  { value: 'start_conversation', label: 'Start a Conversation' },
  { value: 'offer_audit', label: 'Offer a Free Audit' },
  { value: 'sell_direct', label: 'Sell Directly' },
  { value: 'build_relationship', label: 'Build Relationship' },
];

const TONE_OPTIONS = [
  { value: 'casual_peer', label: 'Casual Peer' },
  { value: 'professional_warm', label: 'Professional Warm' },
  { value: 'direct_bold', label: 'Direct & Bold' },
  { value: 'consultative', label: 'Consultative' },
];

interface CampaignEditDialogProps {
  campaign: CampaignProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, data: Partial<CampaignProfile>) => void;
  onDelete?: (id: string) => void;
  isPending?: boolean;
  isDeleting?: boolean;
}

export default function CampaignEditDialog({ campaign, open, onOpenChange, onSave, onDelete, isPending, isDeleting }: CampaignEditDialogProps) {
  const [form, setForm] = useState<Partial<CampaignProfile>>({});
  const [titleInput, setTitleInput] = useState('');
  const [industryInput, setIndustryInput] = useState('');
  useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name,
        campaign_objective: campaign.campaign_objective,
        value_proposition: campaign.value_proposition || '',
        proof_points: campaign.proof_points || '',
        icp_description: campaign.icp_description || '',
        icp_titles: campaign.icp_titles || [],
        icp_locations: campaign.icp_locations || [],
        icp_industries: campaign.icp_industries || [],
        pain_points: campaign.pain_points || ['', ''],
        dm_tone: campaign.dm_tone,
        dm_example: campaign.dm_example || '',
        campaign_angle: campaign.campaign_angle || '',
      });
    }
  }, [campaign]);

  if (!campaign) return null;

  const addTitle = () => {
    const trimmed = titleInput.trim();
    const titles = form.icp_titles || [];
    if (!trimmed || titles.length >= 6 || titles.includes(trimmed)) return;
    setForm({ ...form, icp_titles: [...titles, trimmed] });
    setTitleInput('');
  };

  const handleSave = () => {
    if (!form.name || !form.campaign_objective) {
      toast.error('Name and objective are required');
      return;
    }
    const painPoints = (form.pain_points || []).filter((p: string) => p.trim());
    onSave(campaign.id, { ...form, pain_points: painPoints });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label>Objective</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {CAMPAIGN_OBJECTIVES.map(obj => (
                <button key={obj.value} type="button" onClick={() => setForm({ ...form, campaign_objective: obj.value })}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${form.campaign_objective === obj.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                  {obj.label}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Value Proposition</Label><Textarea value={form.value_proposition || ''} onChange={e => setForm({ ...form, value_proposition: e.target.value.slice(0, 300) })} rows={2} /></div>
          <div><Label>Proof Points</Label><Textarea value={form.proof_points || ''} onChange={e => setForm({ ...form, proof_points: e.target.value.slice(0, 200) })} rows={2} /></div>
          <div><Label>ICP Description</Label><Textarea value={form.icp_description || ''} onChange={e => setForm({ ...form, icp_description: e.target.value.slice(0, 300) })} rows={2} /></div>
          <div>
            <Label>Target Titles</Label>
            <div className="flex gap-2 mt-1">
              <Input placeholder="Type and press Enter" value={titleInput} onChange={e => setTitleInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTitle(); } }} />
              <Button variant="outline" size="sm" onClick={addTitle}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {(form.icp_titles || []).map((t: string) => (
                <Badge key={t} variant="secondary" className="gap-1 pr-1">
                  {t}<button onClick={() => setForm({ ...form, icp_titles: (form.icp_titles || []).filter((x: string) => x !== t) })}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label>Target Locations</Label>
            <LocationAutocomplete
              selected={(form.icp_locations as string[]) || []}
              onAdd={(loc) => { const locs = (form.icp_locations as string[]) || []; if (!locs.includes(loc)) setForm({ ...form, icp_locations: [...locs, loc] }); }}
              onRemove={(loc) => setForm({ ...form, icp_locations: ((form.icp_locations as string[]) || []).filter(x => x !== loc) })}
            />
          </div>
          <div>
            <Label>Target Industries (optional)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">⚠️ Adding industries may significantly reduce results.</p>
            <div className="flex gap-2 mt-1">
              <Input placeholder="e.g. Healthcare, IT Services" value={industryInput} onChange={e => setIndustryInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const trimmed = industryInput.trim(); const inds = (form.icp_industries as string[]) || []; if (trimmed && !inds.includes(trimmed)) setForm({ ...form, icp_industries: [...inds, trimmed] }); setIndustryInput(''); } }} />
              <Button variant="outline" size="sm" onClick={() => { const trimmed = industryInput.trim(); const inds = (form.icp_industries as string[]) || []; if (trimmed && !inds.includes(trimmed)) setForm({ ...form, icp_industries: [...inds, trimmed] }); setIndustryInput(''); }}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {((form.icp_industries as string[]) || []).map((ind: string) => (
                <Badge key={ind} variant="secondary" className="gap-1 pr-1">
                  {ind}<button onClick={() => setForm({ ...form, icp_industries: ((form.icp_industries as string[]) || []).filter(x => x !== ind) })}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <Label>Pain Points</Label>
            <div className="space-y-2 mt-1">
              {(form.pain_points || []).map((p: string, i: number) => (
                <div key={i} className="flex gap-2">
                  <Input value={p} onChange={e => { const u = [...(form.pain_points || [])]; u[i] = e.target.value.slice(0, 100); setForm({ ...form, pain_points: u }); }} />
                  {(form.pain_points || []).length > 2 && <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, pain_points: (form.pain_points || []).filter((_: string, j: number) => j !== i) })}><X className="w-4 h-4" /></Button>}
                </div>
              ))}
            </div>
            {(form.pain_points || []).length < 4 && <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => setForm({ ...form, pain_points: [...(form.pain_points || []), ''] })}><Plus className="w-3 h-3 mr-1" /> Add</Button>}
          </div>
          <div>
            <Label>Tone</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {TONE_OPTIONS.map(t => (
                <button key={t.value} type="button" onClick={() => setForm({ ...form, dm_tone: t.value })}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${form.dm_tone === t.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div><Label>Example DM</Label><Textarea value={form.dm_example || ''} onChange={e => setForm({ ...form, dm_example: e.target.value.slice(0, 500) })} rows={3} /></div>
          <div>
            <Label>Campaign Angle</Label>
            <p className="text-xs text-muted-foreground mt-0.5">The specific angle or hook for this campaign.</p>
            <Input value={form.campaign_angle || ''} onChange={e => setForm({ ...form, campaign_angle: e.target.value })} placeholder="e.g., HIPAA compliance for multi-location dental groups" className="mt-1" />
          </div>
          <Button onClick={handleSave} disabled={isPending} className="w-full">
            <Save className="w-4 h-4 mr-1" /> Save Changes
          </Button>

          {onDelete && !campaign.is_default && (
            <DeleteCampaignConfirm
              campaignName={campaign.name}
              onDelete={() => { onDelete(campaign.id); onOpenChange(false); }}
              isDeleting={isDeleting}
            />
          )}
          {campaign.is_default && (
            <p className="text-xs text-muted-foreground text-center">Default campaigns cannot be deleted. Remove default status first.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
