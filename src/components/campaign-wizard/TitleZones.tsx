import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, X, AlertTriangle, Info } from 'lucide-react';
import { Vertical } from '@/hooks/useVerticals';
import { getTrapWarning, isIndustryAgnostic } from './constants';

interface TitleZonesProps {
  vertical: Vertical | null;
  selectedTitles: string[];
  onTitlesChange: (titles: string[]) => void;
  customVertical: boolean;
  isSearchFlow?: boolean;
  industries?: string[];
  onIndustriesChange?: (industries: string[]) => void;
  companyKeywords?: string[];
  onCompanyKeywordsChange?: (keywords: string[]) => void;
  skipFilters?: boolean;
  onSkipFiltersChange?: (skip: boolean) => void;
}

export default function TitleZones({
  vertical, selectedTitles, onTitlesChange, customVertical, isSearchFlow = false,
  industries = [], onIndustriesChange, companyKeywords = [], onCompanyKeywordsChange,
  skipFilters = false, onSkipFiltersChange,
}: TitleZonesProps) {
  const [customInput, setCustomInput] = useState('');
  const [trapConfirm, setTrapConfirm] = useState<{ title: string; explanation: string } | null>(null);
  const [trapWarning, setTrapWarning] = useState<string | null>(null);
  const [industryInput, setIndustryInput] = useState('');
  const [keywordInput, setKeywordInput] = useState('');

  const toggleTitle = (title: string) => {
    if (selectedTitles.includes(title)) {
      onTitlesChange(selectedTitles.filter(t => t !== title));
    } else {
      onTitlesChange([...selectedTitles, title]);
    }
  };

  const handleTrapClick = (title: string) => {
    const explanation = vertical?.trap_explanations?.[title] || getTrapWarning(title) || 'This title may produce low-quality results.';
    setTrapConfirm({ title, explanation });
  };

  const confirmTrap = () => {
    if (trapConfirm && !selectedTitles.includes(trapConfirm.title)) {
      onTitlesChange([...selectedTitles, trapConfirm.title]);
    }
    setTrapConfirm(null);
  };

  const addCustomTitle = () => {
    const trimmed = customInput.trim();
    if (!trimmed || selectedTitles.includes(trimmed)) return;
    const warning = getTrapWarning(trimmed);
    if (warning) setTrapWarning(warning);
    onTitlesChange([...selectedTitles, trimmed]);
    setCustomInput('');
  };

  const removeTitle = (title: string) => {
    onTitlesChange(selectedTitles.filter(t => t !== title));
  };

  // Detect agnostic titles
  const agnosticTitles = selectedTitles.filter(t => isIndustryAgnostic(t));
  const hasAgnosticTitles = isSearchFlow && agnosticTitles.length > 0;
  const allTitlesAreGeneric = isSearchFlow && selectedTitles.length > 0 && selectedTitles.every(t => isIndustryAgnostic(t));

  const defaultTitles = vertical?.default_titles || [];
  const expansionTitles = vertical?.expansion_titles || [];
  const trapTitles = vertical?.trap_titles || [];
  const allCuratedTitles = [...defaultTitles, ...expansionTitles, ...trapTitles];
  const customTitles = selectedTitles.filter(t => !allCuratedTitles.includes(t));

  // Chip style based on title type
  const getChipStyle = (title: string, isSelected: boolean) => {
    if (!isSelected) return '';
    if (isSearchFlow && isIndustryAgnostic(title)) return 'bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-400';
    if (defaultTitles.includes(title)) return 'bg-green-600 hover:bg-green-700 text-white border-green-600';
    if (expansionTitles.includes(title)) return 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600';
    if (trapTitles.includes(title)) return 'bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-400';
    return '';
  };

  const addIndustry = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !industries.includes(trimmed)) onIndustriesChange?.([...industries, trimmed]);
    setIndustryInput('');
  };

  const addKeyword = (val: string) => {
    const trimmed = val.trim();
    if (trimmed && !companyKeywords.includes(trimmed)) onCompanyKeywordsChange?.([...companyKeywords, trimmed]);
    setKeywordInput('');
  };

  if (customVertical || !vertical) {
    return (
      <div>
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="Type a title and press Enter"
            value={customInput}
            onChange={e => { setCustomInput(e.target.value); setTrapWarning(null); }}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTitle(); } }}
          />
          <Button variant="outline" size="sm" onClick={addCustomTitle} disabled={selectedTitles.length >= 8}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {trapWarning && (
          <div className="flex items-start gap-2 mt-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-700 dark:text-yellow-400">{trapWarning}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-1">Suggestions: Owner, CEO, Founder, CTO, VP Sales, Marketing Director, Managing Partner</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selectedTitles.map(t => (
            <Badge key={t} variant="secondary" className={`gap-1 pr-1 ${isSearchFlow && isIndustryAgnostic(t) ? 'bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-400' : ''}`}>
              {isSearchFlow && isIndustryAgnostic(t) ? '⚠️ ' : ''}{t}<button onClick={() => removeTitle(t)}><X className="w-3 h-3" /></button>
            </Badge>
          ))}
        </div>

        {/* Agnostic warning for custom vertical */}
        {hasAgnosticTitles && !skipFilters && (
          <GenericTitleWarning
            agnosticTitles={agnosticTitles}
            verticalName={null}
            suggestedIndustries={[]}
            suggestedKeywords={[]}
            industries={industries}
            onIndustriesChange={onIndustriesChange}
            companyKeywords={companyKeywords}
            onCompanyKeywordsChange={onCompanyKeywordsChange}
            skipFilters={skipFilters}
            onSkipFiltersChange={onSkipFiltersChange}
            industryInput={industryInput}
            setIndustryInput={setIndustryInput}
            keywordInput={keywordInput}
            setKeywordInput={setKeywordInput}
            addIndustry={addIndustry}
            addKeyword={addKeyword}
            allTitlesAreGeneric={allTitlesAreGeneric}
            defaultTitles={[]}
            onTitlesChange={onTitlesChange}
            selectedTitles={selectedTitles}
          />
        )}
        {hasAgnosticTitles && skipFilters && (
          <div className="flex items-center gap-2 mt-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-400">Generic titles active without filters. Some leads may not match your ICP.</p>
            <button className="text-xs underline ml-auto shrink-0 text-yellow-700 dark:text-yellow-400" onClick={() => onSkipFiltersChange?.(false)}>Add filters</button>
          </div>
        )}
      </div>
    );
  }

  // Curated mode with zones
  return (
    <TooltipProvider>
      <div className="space-y-3">
        {/* Zone A: Recommended */}
        <div>
          <p className="text-xs font-medium mb-1.5">✅ Recommended Titles</p>
          <div className="flex flex-wrap gap-1.5">
            {defaultTitles.map(title => (
              <Badge
                key={title}
                variant={selectedTitles.includes(title) ? 'default' : 'outline'}
                className={`cursor-pointer transition-all ${
                  selectedTitles.includes(title)
                    ? getChipStyle(title, true)
                    : 'hover:border-green-500'
                }`}
                onClick={() => toggleTitle(title)}
              >
                {selectedTitles.includes(title) ? '✓ ' : ''}{title}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">These titles produce the cleanest results in Apollo for this vertical.</p>
        </div>

        {/* Zone B: Expansion */}
        {expansionTitles.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1.5">➕ Expand Your Reach</p>
            <div className="flex flex-wrap gap-1.5">
              {expansionTitles.map(title => (
                <Badge
                  key={title}
                  variant={selectedTitles.includes(title) ? 'default' : 'outline'}
                  className={`cursor-pointer transition-all ${
                    selectedTitles.includes(title)
                      ? getChipStyle(title, true)
                      : 'hover:border-blue-500 text-muted-foreground'
                  }`}
                  onClick={() => toggleTitle(title)}
                >
                  {selectedTitles.includes(title) ? '✓ ' : ''}{title}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Optional — adds more leads but may include less targeted results.</p>
          </div>
        )}

        {/* Zone C: Traps */}
        {trapTitles.length > 0 && (
          <div>
            <p className="text-xs font-medium mb-1.5">⚠️ Common Traps — Avoid These</p>
            <div className="flex flex-wrap gap-1.5">
              {trapTitles.map(title => {
                const isAdded = selectedTitles.includes(title);
                return (
                  <Tooltip key={title}>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`cursor-pointer transition-all ${
                          isAdded
                            ? 'bg-orange-500/20 border-orange-500 text-orange-700 dark:text-orange-400'
                            : 'border-orange-300 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10'
                        }`}
                        onClick={() => isAdded ? removeTitle(title) : handleTrapClick(title)}
                      >
                        {isAdded ? '⚠️ ' : '⚠️ '}{title}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">{vertical.trap_explanations?.[title] || getTrapWarning(title)}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        )}

        {/* Zone D: Custom */}
        <div>
          <p className="text-xs font-medium mb-1.5">🔍 Add Custom Title</p>
          <div className="flex gap-2">
            <Input
              placeholder="Type a custom title"
              value={customInput}
              onChange={e => { setCustomInput(e.target.value); setTrapWarning(null); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTitle(); } }}
              className="text-sm"
            />
            <Button variant="outline" size="sm" onClick={addCustomTitle}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {trapWarning && (
            <div className="flex items-start gap-2 mt-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
              <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 dark:text-yellow-400">{trapWarning}</p>
            </div>
          )}
          {customTitles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {customTitles.map(t => (
                <Badge key={t} variant="secondary" className={`gap-1 pr-1 ${isSearchFlow && isIndustryAgnostic(t) ? 'bg-yellow-500/20 border-yellow-500 text-yellow-700 dark:text-yellow-400' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'}`}>
                  {isSearchFlow && isIndustryAgnostic(t) ? '⚠️ ' : ''}{t}<button onClick={() => removeTitle(t)}><X className="w-3 h-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Smart Title Warning */}
        {hasAgnosticTitles && !skipFilters && (
          <GenericTitleWarning
            agnosticTitles={agnosticTitles}
            verticalName={vertical.name}
            suggestedIndustries={vertical.suggested_industries || []}
            suggestedKeywords={vertical.suggested_keywords || []}
            industries={industries}
            onIndustriesChange={onIndustriesChange}
            companyKeywords={companyKeywords}
            onCompanyKeywordsChange={onCompanyKeywordsChange}
            skipFilters={skipFilters}
            onSkipFiltersChange={onSkipFiltersChange}
            industryInput={industryInput}
            setIndustryInput={setIndustryInput}
            keywordInput={keywordInput}
            setKeywordInput={setKeywordInput}
            addIndustry={addIndustry}
            addKeyword={addKeyword}
            allTitlesAreGeneric={allTitlesAreGeneric}
            defaultTitles={defaultTitles}
            onTitlesChange={onTitlesChange}
            selectedTitles={selectedTitles}
          />
        )}
        {hasAgnosticTitles && skipFilters && (
          <div className="flex items-center gap-2 p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600 shrink-0" />
            <p className="text-xs text-yellow-700 dark:text-yellow-400">Generic titles active without filters. Some leads may not match your ICP.</p>
            <button className="text-xs underline ml-auto shrink-0 text-yellow-700 dark:text-yellow-400" onClick={() => onSkipFiltersChange?.(false)}>Add filters</button>
          </div>
        )}
      </div>

      {/* Trap confirmation dialog */}
      <Dialog open={!!trapConfirm} onOpenChange={() => setTrapConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" /> Are you sure?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{trapConfirm?.explanation}</p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setTrapConfirm(null)}>Skip</Button>
            <Button variant="outline" onClick={confirmTrap} className="border-orange-500 text-orange-600 hover:bg-orange-500/10">
              Add anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// Extracted warning component
function GenericTitleWarning({
  agnosticTitles, verticalName, suggestedIndustries, suggestedKeywords,
  industries, onIndustriesChange, companyKeywords, onCompanyKeywordsChange,
  skipFilters, onSkipFiltersChange,
  industryInput, setIndustryInput, keywordInput, setKeywordInput,
  addIndustry, addKeyword, allTitlesAreGeneric, defaultTitles, onTitlesChange, selectedTitles,
}: {
  agnosticTitles: string[];
  verticalName: string | null;
  suggestedIndustries: string[];
  suggestedKeywords: string[];
  industries?: string[];
  onIndustriesChange?: (v: string[]) => void;
  companyKeywords?: string[];
  onCompanyKeywordsChange?: (v: string[]) => void;
  skipFilters?: boolean;
  onSkipFiltersChange?: (v: boolean) => void;
  industryInput: string;
  setIndustryInput: (v: string) => void;
  keywordInput: string;
  setKeywordInput: (v: string) => void;
  addIndustry: (v: string) => void;
  addKeyword: (v: string) => void;
  allTitlesAreGeneric: boolean;
  defaultTitles: string[];
  onTitlesChange: (titles: string[]) => void;
  selectedTitles: string[];
}) {
  const titlesList = agnosticTitles.map(t => `"${t}"`).join(' and ');
  const verticalLabel = verticalName || 'your target market';

  return (
    <div className="mt-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <p className="font-medium text-yellow-700 dark:text-yellow-400">
            {allTitlesAreGeneric
              ? 'All your titles are industry-generic. Without filters, your search will return leads from every industry.'
              : `${titlesList} match${agnosticTitles.length === 1 ? 'es' : ''} ALL industries — not just ${verticalLabel}.`
            }
          </p>
          {!allTitlesAreGeneric && (
            <p className="text-yellow-700/80 dark:text-yellow-400/80">
              Without filters, you'll get {agnosticTitles[0]?.toLowerCase()}s of restaurants, retail stores, etc.
            </p>
          )}
          <p className="text-yellow-700/80 dark:text-yellow-400/80">
            {allTitlesAreGeneric
              ? 'We strongly recommend adding vertical-specific titles or Industry/Keyword filters below.'
              : 'We recommend adding filters to keep your leads on target:'
            }
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="w-4 h-4 text-yellow-600 shrink-0 cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-xs">
              <strong>Why this matters:</strong> Apollo credits are limited. Every lead that doesn't match your target industry is a wasted credit. 
              Vertical-specific titles naturally filter to your market. Generic titles need extra filters to stay on target.
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Add recommended titles button when all are generic */}
      {allTitlesAreGeneric && defaultTitles.length > 0 && (
        <Button
          variant="outline" size="sm" className="text-xs border-yellow-500/50 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10"
          onClick={() => {
            const newTitles = [...new Set([...selectedTitles, ...defaultTitles])];
            onTitlesChange(newTitles);
          }}
        >
          <Plus className="w-3 h-3 mr-1" /> Add recommended titles for {verticalLabel}
        </Button>
      )}

      {/* Industry filter */}
      <div>
        <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">Industry (optional)</p>
        {suggestedIndustries.length > 0 && (industries || []).length === 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {suggestedIndustries.map(ind => (
              <Badge key={ind} variant="outline" className="cursor-pointer text-[10px] border-yellow-500/40 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-500/10"
                onClick={() => addIndustry(ind)}>
                + {ind}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input placeholder={`Start typing to search industries...`} value={industryInput}
            onChange={e => setIndustryInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addIndustry(industryInput); } }}
            className="text-xs h-8" />
          <Button variant="outline" size="sm" className="h-8" onClick={() => addIndustry(industryInput)}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        {(industries || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {industries!.map(ind => (
              <Badge key={ind} variant="secondary" className="gap-1 pr-1 text-[10px]">
                {ind}<button onClick={() => onIndustriesChange?.(industries!.filter(x => x !== ind))}><X className="w-2.5 h-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Company keywords filter */}
      <div>
        <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400 mb-1">Company Keywords (optional)</p>
        <Input
          placeholder={suggestedKeywords.length > 0 ? `e.g. ${suggestedKeywords.slice(0, 4).join(', ')}` : 'e.g. keywords related to your target market'}
          value={keywordInput}
          onChange={e => setKeywordInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(keywordInput); } }}
          className="text-xs h-8"
        />
        <p className="text-[10px] text-yellow-700/60 dark:text-yellow-400/60 mt-0.5">Helps narrow results to companies in your target market.</p>
        {(companyKeywords || []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {companyKeywords!.map(kw => (
              <Badge key={kw} variant="secondary" className="gap-1 pr-1 text-[10px]">
                {kw}<button onClick={() => onCompanyKeywordsChange?.(companyKeywords!.filter(x => x !== kw))}><X className="w-2.5 h-2.5" /></button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Skip filters checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox checked={skipFilters} onCheckedChange={c => onSkipFiltersChange?.(!!c)} />
        <span className="text-xs text-yellow-700 dark:text-yellow-400">Skip filters — I'll review leads manually</span>
      </label>
    </div>
  );
}