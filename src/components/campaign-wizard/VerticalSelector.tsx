import { Vertical } from '@/hooks/useVerticals';
import { Badge } from '@/components/ui/badge';
import { TIER_BADGES } from './constants';
import { Skeleton } from '@/components/ui/skeleton';
import { Check } from 'lucide-react';

interface VerticalSelectorProps {
  verticals: Vertical[];
  isLoading: boolean;
  selectedVerticalIds: string[];
  customVertical: boolean;
  onToggleVertical: (vertical: Vertical) => void;
  onSelectCustom: () => void;
  maxSelections?: number;
}

export default function VerticalSelector({
  verticals, isLoading, selectedVerticalIds, customVertical,
  onToggleVertical, onSelectCustom, maxSelections = 2,
}: VerticalSelectorProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
      </div>
    );
  }

  const tiers = [1, 2, 3];
  const grouped = tiers.map(tier => ({
    tier,
    badge: TIER_BADGES[tier],
    items: verticals.filter(v => v.tier === tier),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{maxSelections > 1 ? `Select up to ${maxSelections} related verticals to combine their target titles` : 'Select the vertical that best describes your target market'}</p>
      {grouped.map(group => (
        <div key={group.tier}>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            {group.badge.icon} {group.badge.label}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {group.items.map(v => {
              const isSelected = selectedVerticalIds.includes(v.id) && !customVertical;
              const isDisabled = !isSelected && selectedVerticalIds.length >= maxSelections && !customVertical;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onToggleVertical(v)}
                  disabled={isDisabled}
                  className={`p-3 rounded-lg border text-left transition-all relative ${
                    isSelected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : isDisabled
                        ? 'border-border opacity-50 cursor-not-allowed'
                        : 'border-border hover:border-primary/50'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                  )}
                  <span className="text-lg">{v.icon}</span>
                  <p className="font-medium text-sm mt-1">{v.name}</p>
                  {v.primary_compliance && (
                    <p className="text-[10px] text-muted-foreground mt-0.5">{v.primary_compliance}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <button
          type="button"
          onClick={onSelectCustom}
          className={`w-full p-3 rounded-lg border text-left transition-all ${
            customVertical
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-border hover:border-primary/50'
          }`}
        >
          <span className="text-lg">✏️</span>
          <p className="font-medium text-sm mt-1">Custom / Other</p>
          <p className="text-xs text-muted-foreground">I'll set up my own job titles manually</p>
        </button>
      </div>
    </div>
  );
}
