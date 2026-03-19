import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Settings } from 'lucide-react';
import { CampaignProfile } from '@/hooks/useCampaignProfiles';
import { useVerticals } from '@/hooks/useVerticals';

interface CampaignSelectorProps {
  campaigns: CampaignProfile[];
  selectedCampaignId: string | null;
  onSelect: (id: string | null) => void;
  onNewCampaign: () => void;
  onEditCampaign: () => void;
  showDrafts?: boolean;
  onToggleDrafts?: () => void;
}

export default function CampaignSelector({ campaigns, selectedCampaignId, onSelect, onNewCampaign, onEditCampaign, showDrafts, onToggleDrafts }: CampaignSelectorProps) {
  const { verticals } = useVerticals();

  const getVerticalIcon = (verticalId: string | null) => {
    if (!verticalId) return '';
    const v = verticals.find(v => v.id === verticalId);
    return v ? `${v.icon} ` : '';
  };

  const activeCampaigns = campaigns.filter(c => c.status === 'active' || c.status === 'paused');
  const draftCampaigns = campaigns.filter(c => !c.status || c.status === 'draft');

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-muted-foreground">Campaign:</span>
      <Select value={selectedCampaignId || 'all'} onValueChange={v => onSelect(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[260px]">
          <SelectValue placeholder="All Active Campaigns" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Active Campaigns</SelectItem>
          {activeCampaigns.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">Active / Paused</SelectLabel>
              {activeCampaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {getVerticalIcon(c.vertical_id)}{c.name} {c.status === 'paused' ? '⏸' : '🟢'} {c.is_default && '⭐'}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {showDrafts && draftCampaigns.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-xs text-muted-foreground">Drafts</SelectLabel>
              {draftCampaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {getVerticalIcon(c.vertical_id)}{c.name} 📝 {c.is_default && '⭐'}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <Button variant="outline" size="sm" onClick={onNewCampaign} className="gap-1">
        <Plus className="w-3 h-3" /> New Campaign
      </Button>
      {onToggleDrafts && (
        <Button variant="ghost" size="sm" onClick={onToggleDrafts} className="text-xs text-muted-foreground">
          {showDrafts ? 'Hide Drafts' : 'Show Drafts'}
        </Button>
      )}
      {selectedCampaignId && (
        <Button variant="ghost" size="sm" onClick={onEditCampaign}>
          <Settings className="w-3 h-3" />
        </Button>
      )}
    </div>
  );
}
