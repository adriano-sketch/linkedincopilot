import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Save, Trash2 } from 'lucide-react';
import { CampaignProfile } from '@/hooks/useCampaignProfiles';
import { isLegacyDescription } from '@/lib/addPeople';

function DeleteCampaignConfirm({ campaignName, onDelete, isDeleting }: { campaignName: string; onDelete: () => void; isDeleting?: boolean }) {
  const [confirmText, setConfirmText] = useState('');
  const canDelete = confirmText === 'DELETE';

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="w-full text-destructive hover:text-destructive hover:bg-destructive/10" disabled={isDeleting}>
          <Trash2 className="w-4 h-4 mr-1" /> Delete list
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete "{campaignName}"?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <span>This permanently deletes the list and the people in it. It cannot be undone.</span>
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

const TONE_OPTIONS = [
  { value: 'casual_peer', label: 'Casual' },
  { value: 'professional_warm', label: 'Warm and professional' },
  { value: 'direct_bold', label: 'Direct' },
  { value: 'consultative', label: 'Advisory' },
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
  useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name,
        // Lists made before the description was asked carry a placeholder: show it empty.
        icp_description: isLegacyDescription(campaign.icp_description) ? '' : (campaign.icp_description || ''),
        dm_tone: campaign.dm_tone,
      });
    }
  }, [campaign]);

  if (!campaign) return null;

  const handleSave = () => {
    if (!form.name?.trim()) {
      toast.error('The list needs a name');
      return;
    }
    // The description is sent only when it was edited, so opening and saving never erases what is stored.
    const shown = isLegacyDescription(campaign.icp_description) ? '' : (campaign.icp_description || '');
    const description = (form.icp_description || '') !== shown ? { icp_description: form.icp_description || '' } : {};
    onSave(campaign.id, { name: form.name.trim(), dm_tone: form.dm_tone, ...description });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit list</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div><Label>Name</Label><Input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          <div>
            <Label htmlFor="list-description">Who belongs in this list</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Used when you look for more people among your contacts.</p>
            <Textarea id="list-description" value={form.icp_description || ''} onChange={e => setForm({ ...form, icp_description: e.target.value.slice(0, 500) })} rows={3} className="mt-1" />
          </div>
          <div>
            <Label>Comment tone</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {TONE_OPTIONS.map(t => (
                <button key={t.value} type="button" onClick={() => setForm({ ...form, dm_tone: t.value })}
                  className={`p-2 rounded-lg border text-xs text-left transition-all ${form.dm_tone === t.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                  {t.label}
                </button>
              ))}
            </div>
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
            <p className="text-xs text-muted-foreground text-center">A default list cannot be deleted. Remove the default status first.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
