import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import {
  ArrowRight, ArrowLeft, Rocket, Target, Upload,
  X, Plus, ChevronDown, Check, Loader2, AlertTriangle, Shield, Info, FileSpreadsheet
} from 'lucide-react';
import { useProfile } from '@/hooks/useProfile';
import { useUserPlan } from '@/hooks/useUserPlan';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useVerticals, Vertical } from '@/hooks/useVerticals';
import { parseLeadCsv } from '@/lib/csv';
import VerticalSelector from '@/components/campaign-wizard/VerticalSelector';
import TitleZones from '@/components/campaign-wizard/TitleZones';
import IcpFitPreview from '@/components/IcpFitPreview';
import {
  CAMPAIGN_OBJECTIVES, TONE_OPTIONS,
  PAIN_POINT_PLACEHOLDERS, MESSAGE_LANGUAGES,
} from '@/components/campaign-wizard/constants';

export interface CampaignFormData {
  name: string;
  campaign_objective: string;
  value_proposition: string;
  proof_points: string;
  icp_description: string;
  icp_titles: string[];
  icp_locations: string[];
  icp_industries: string[];
  icp_employee_ranges: string[];
  icp_keywords: string[];
  pain_points: string[];
  dm_tone: string;
  dm_example: string;
  is_default: boolean;
  is_template: boolean;
  vertical_id: string | null;
  custom_vertical: boolean;
  campaign_angle: string;
  lead_source: 'csv';
  generic_titles_no_filter: boolean;
  message_language: string;
}

interface CampaignWizardProps {
  onComplete: (data: CampaignFormData, campaignId?: string) => void;
  onCancel?: () => void;
  initialData?: Partial<CampaignFormData>;
  isFirstCampaign?: boolean;
  isPending?: boolean;
  existingCampaignId?: string;
}

export default function CampaignWizard({ onComplete, onCancel, initialData, isFirstCampaign = false, isPending = false, existingCampaignId }: CampaignWizardProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { profile } = useProfile();
  const { leadsRemaining } = useUserPlan();
  const { verticals, isLoading: verticalsLoading } = useVerticals();

  const [step, setStep] = useState(existingCampaignId ? 2 : 0);
  const [selectedVerticals, setSelectedVerticals] = useState<Vertical[]>([]);
  const [createdCampaignId, setCreatedCampaignId] = useState(existingCampaignId || '');

  const [form, setForm] = useState<CampaignFormData>({
    name: initialData?.name || '',
    campaign_objective: initialData?.campaign_objective || '',
    value_proposition: initialData?.value_proposition || '',
    proof_points: initialData?.proof_points || '',
    icp_description: initialData?.icp_description || profile?.icp_description || '',
    icp_titles: initialData?.icp_titles || profile?.icp_titles || [],
    icp_locations: initialData?.icp_locations || [],
    icp_industries: initialData?.icp_industries || [],
    icp_employee_ranges: initialData?.icp_employee_ranges || [],
    icp_keywords: (initialData as any)?.icp_keywords || [],
    pain_points: initialData?.pain_points?.length ? initialData.pain_points : profile?.pain_points?.length ? [...profile.pain_points] : ['', ''],
    dm_tone: initialData?.dm_tone || profile?.dm_tone || '',
    dm_example: initialData?.dm_example || profile?.dm_example || '',
    is_default: initialData?.is_default ?? isFirstCampaign,
    is_template: initialData?.is_template ?? false,
    vertical_id: initialData?.vertical_id || null,
    custom_vertical: initialData?.custom_vertical || false,
    campaign_angle: (initialData as any)?.campaign_angle || '',
    lead_source: 'csv',
    generic_titles_no_filter: (initialData as any)?.generic_titles_no_filter || false,
    message_language: (initialData as any)?.message_language || 'English',
  });

  // Lead import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvParsed, setCsvParsed] = useState<any[]>([]);
  const [csvStats, setCsvStats] = useState({ total: 0, valid: 0, invalid: 0, duplicate: 0, trimmed: 0 });
  const [csvImporting, setCsvImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [launching, setLaunching] = useState(false);

  const handleToggleVertical = (vertical: Vertical) => {
    setSelectedVerticals(prev => {
      const alreadySelected = prev.find(v => v.id === vertical.id);
      let next: Vertical[];
      if (alreadySelected) {
        next = prev.filter(v => v.id !== vertical.id);
      } else {
        if (prev.length >= 1) return prev;
        next = [...prev, vertical];
      }
      const mergedPainPoints = [...new Set(next.flatMap(v => v.default_pain_points || []))].filter(Boolean);
      const description = next.map(v => v.name).join(' + ') + ' professionals';
      setForm(f => ({
        ...f,
        vertical_id: next[0]?.id || null,
        custom_vertical: false,
        pain_points: mergedPainPoints.length >= 2 ? mergedPainPoints : f.pain_points,
        icp_description: next.length > 0 ? description : f.icp_description,
      }));
      return next;
    });
  };

  const handleSelectCustom = () => {
    setSelectedVerticals([]);
    setForm(prev => ({ ...prev, vertical_id: null, custom_vertical: true }));
  };

  const validateStep = (): boolean => {
    switch (step) {
      case 0:
        if (!form.name || !form.campaign_objective) { toast.error('Fill campaign name and objective'); return false; }
        if (!form.dm_tone) { toast.error('Select a message tone'); return false; }
        return true;
      case 1:
        if (!form.vertical_id && !form.custom_vertical) { toast.error('Select a target vertical'); return false; }
        return true;
      default: return true;
    }
  };

  const handleNext = async () => {
    if (!validateStep()) return;

    if (step === 1 && !createdCampaignId && user) {
      try {
        const { data, error } = await supabase.from('campaign_profiles').insert({
          user_id: user.id,
          name: form.name,
          campaign_objective: form.campaign_objective,
          value_proposition: form.value_proposition,
          proof_points: form.proof_points,
          icp_description: form.icp_description,
          icp_titles: form.icp_titles,
          icp_locations: form.icp_locations,
          icp_industries: form.icp_industries,
          icp_employee_ranges: form.icp_employee_ranges,
          icp_keywords: form.icp_keywords.length > 0 ? form.icp_keywords : null,
          pain_points: form.pain_points.filter(p => p.trim()),
          dm_tone: form.dm_tone,
          dm_example: form.dm_example,
          is_default: form.is_default,
          is_template: false,
          vertical_id: form.vertical_id,
          custom_vertical: form.custom_vertical,
          campaign_angle: form.campaign_angle || null,
          lead_source: 'csv',
          generic_titles_no_filter: form.generic_titles_no_filter,
          message_language: form.message_language,
          status: 'draft',
        }).select('id').single();
        if (error) throw error;
        setCreatedCampaignId(data.id);
        queryClient.invalidateQueries({ queryKey: ['campaign_profiles'] });
        toast.success('Campaign created — now import leads');
      } catch (e) {
        toast.error('Failed to create campaign');
        return;
      }
    }

    setStep(step + 1);
  };

  const removeTag = (key: keyof CampaignFormData, value: string) => {
    setForm({ ...form, [key]: (form[key] as string[]).filter(x => x !== value) });
  };

  const CharCounter = ({ value, max }: { value: string; max: number }) => (
    <p className={`text-xs mt-1 text-right ${value.length > max ? 'text-destructive' : 'text-muted-foreground'}`}>{value.length}/{max}</p>
  );

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, invalidRows, duplicateRows, totalRows } = parseLeadCsv(text);
      if (totalRows === 0) {
        toast.error('CSV is empty');
        return;
      }
      if (rows.length === 0) {
        toast.error('No valid LinkedIn URLs found in the CSV');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      let usableRows = rows;
      const trimmed = 0;
      if (leadsRemaining <= 0) {
        toast.warning('You have 0 lead credits remaining. Leads will be filtered by ICP but not counted until next cycle.');
      }

      setCsvParsed(usableRows);
      setCsvStats({
        total: totalRows,
        valid: usableRows.length,
        invalid: invalidRows,
        duplicate: duplicateRows,
        trimmed,
      });

      toast.success(`${usableRows.length} leads ready to import`);
    };
    reader.readAsText(file);
  };

  const importCsv = async () => {
    if (!createdCampaignId || !user) { toast.error('Campaign not created yet'); return; }
    if (csvParsed.length === 0) { toast.error('No leads ready to import'); return; }
    setCsvImporting(true);
    try {
      const batchSize = 200;
      let totalInserted = 0;
      const totalRows = csvParsed.length;

      for (let i = 0; i < csvParsed.length; i += batchSize) {
        const batch = csvParsed.slice(i, i + batchSize);
        const payload = batch.map(r => ({
          user_id: user.id,
          campaign_profile_id: createdCampaignId,
          first_name: r.first_name || null,
          last_name: r.last_name || null,
          full_name: r.full_name || (r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : null),
          title: r.title || null,
          company: r.company || null,
          linkedin_url: r.linkedin_url,
          location: r.location || null,
          source: 'csv',
          status: 'imported',
          profile_quality_status: null,
          profile_quality_checked_at: null,
          profile_quality_note: null,
        }));

        const { data: inserted, error } = await supabase
          .from('campaign_leads')
          .upsert(payload, { onConflict: 'user_id,linkedin_url', ignoreDuplicates: true })
          .select('id, linkedin_url');
        if (error) throw error;

        const insertedRows = inserted || [];
        totalInserted += insertedRows.length;
        setImportedCount(totalInserted);
      }

      if (totalInserted > 0) {
        toast.info('Leads imported. Enrichment will validate profiles and skip ghosts as needed.', { duration: 8000 });
      }
      setCsvParsed([]);
      toast.success(`Imported ${totalInserted} of ${totalRows} leads — click Launch to start enrichment & outreach`);
    } catch (e) {
      const message = e instanceof Error
        ? e.message
        : (typeof e === 'string' ? e : (e as any)?.message || (e as any)?.details || 'Unknown');
      toast.error('Import failed: ' + message);
    } finally { setCsvImporting(false); }
  };

  const downloadCsvTemplate = () => {
    const template = 'linkedin_url,first_name,last_name,title,company,location,email\nhttps://www.linkedin.com/in/example,John,Doe,CPA,"Smith & Associates","Orlando FL",john@smithcpa.com\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkedin-copilot-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Launch campaign
  const handleLaunch = async () => {
    if (!createdCampaignId || !user) return;
    setLaunching(true);
    try {
      await supabase.from('campaign_profiles').update({ status: 'active' }).eq('id', createdCampaignId);
      
      const { data: allLeads } = await supabase.from('campaign_leads')
        .select('id')
        .eq('campaign_profile_id', createdCampaignId)
        .in('status', ['imported', 'enriched']);

      if (allLeads && allLeads.length > 0) {
        const SAMPLE_SIZE = 5;
        const sampleLeads = allLeads.slice(0, SAMPLE_SIZE);
        
        await supabase.functions.invoke('process-new-lead', {
          body: {
            lead_ids: sampleLeads.map(l => l.id),
            campaign_profile_id: createdCampaignId,
          },
        });
      }

      queryClient.invalidateQueries({ queryKey: ['campaign_leads'] });
      queryClient.invalidateQueries({ queryKey: ['campaign_profiles'] });
      toast.success('🚀 Campaign launched!');
      onComplete(form, createdCampaignId);
    } catch (e) {
      toast.error('Launch failed');
    } finally { setLaunching(false); }
  };

  const STEP_TITLES = ['Name & Strategy', 'Select Vertical', 'Import CSV'];
  const STEP_ICONS = [Rocket, Target, Upload];
  const StepIcon = STEP_ICONS[step] || Upload;

  return (
    <div className="w-full max-w-lg mx-auto">
      <StepBar current={step} total={3} />
      <Card>
        <CardHeader>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <StepIcon className="w-5 h-5 text-primary" />
          </div>
          <CardTitle>Step {step + 1} of 3 — {STEP_TITLES[step]}</CardTitle>
          <CardDescription>
            {step === 0 && "What's this campaign about?"}
            {step === 1 && "Select your target vertical so our AI can validate leads."}
            {step === 2 && "Upload your CSV file with LinkedIn profile URLs."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* STEP 0: Name & Strategy */}
          {step === 0 && (
            <>
              <div>
                <Label>Campaign Name *</Label>
                <Input placeholder="e.g. Dental Practices - Orlando" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>

              <div>
                <Label className="mb-2 block">Campaign Objective *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {CAMPAIGN_OBJECTIVES.map(obj => (
                    <button key={obj.value} type="button" onClick={() => setForm({ ...form, campaign_objective: obj.value })}
                      className={`p-3 rounded-lg border text-left transition-all ${form.campaign_objective === obj.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                      <span className="text-lg">{obj.icon}</span>
                      <p className="font-medium text-sm mt-1">{obj.label}</p>
                      <p className="text-xs text-muted-foreground">{obj.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Message Tone *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TONE_OPTIONS.map(tone => (
                    <button key={tone.value} type="button" onClick={() => setForm({ ...form, dm_tone: tone.value })}
                      className={`p-3 rounded-lg border text-left transition-all ${form.dm_tone === tone.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/50'}`}>
                      <span className="text-lg">{tone.icon}</span>
                      <p className="font-medium text-sm mt-1">{tone.label}</p>
                      <p className="text-xs text-muted-foreground">{tone.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="mb-2 block">Message Language *</Label>
                <Select value={form.message_language} onValueChange={v => setForm({ ...form, message_language: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {MESSAGE_LANGUAGES.map(lang => (
                      <SelectItem key={lang.value} value={lang.value}>
                        <span className="flex items-center gap-2">
                          <span>{lang.flag}</span>
                          <span>{lang.value}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">GPT-5 will write all 3 messages natively in this language.</p>
              </div>
              <div>
                <Label>Value Proposition</Label>
                <Textarea placeholder="Why should they care? Focus on benefit to the lead." value={form.value_proposition} onChange={e => setForm({ ...form, value_proposition: e.target.value.slice(0, 300) })} rows={2} />
                <CharCounter value={form.value_proposition} max={300} />
              </div>
              <div>
                <Label>Campaign Angle (optional)</Label>
                <Input placeholder="e.g. HIPAA compliance for dental" value={form.campaign_angle} onChange={e => setForm({ ...form, campaign_angle: e.target.value })} />
              </div>
              <div>
                <Label>Example DM (optional)</Label>
                <Textarea placeholder="Paste a DM that worked well. The AI learns your style." value={form.dm_example} onChange={e => setForm({ ...form, dm_example: e.target.value.slice(0, 500) })} rows={3} />
                <CharCounter value={form.dm_example} max={500} />
              </div>
            </>
          )}

          {/* STEP 1: Select Vertical */}
          {step === 1 && (
            <>
              <div>
                <Label className="mb-2 block">Select Your Target Vertical</Label>
                <VerticalSelector
                  verticals={verticals} isLoading={verticalsLoading}
                  selectedVerticalIds={selectedVerticals.map(v => v.id)} customVertical={form.custom_vertical}
                  onToggleVertical={handleToggleVertical} onSelectCustom={handleSelectCustom}
                  maxSelections={1}
                />
              </div>

              {(selectedVerticals.length > 0 || form.custom_vertical) && (
                <>
                  <div className="bg-muted/50 border border-border rounded-lg p-3 text-sm space-y-2">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-foreground">How this works</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Our AI will analyze each lead's LinkedIn profile and intelligently determine if they match your target vertical. 
                          No need to specify titles or locations — just upload your CSV and we'll handle the rest.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Pain Points */}
                  <div>
                    <Label>Pain Points (min 2)</Label>
                    <div className="space-y-2 mt-1">
                      {form.pain_points.map((p, i) => (
                        <div key={i} className="flex gap-2">
                          <Input placeholder={PAIN_POINT_PLACEHOLDERS[i % PAIN_POINT_PLACEHOLDERS.length]} value={p}
                            onChange={e => { const u = [...form.pain_points]; u[i] = e.target.value.slice(0, 100); setForm({ ...form, pain_points: u }); }} />
                          {form.pain_points.length > 2 && <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, pain_points: form.pain_points.filter((_, j) => j !== i) })}><X className="w-4 h-4" /></Button>}
                        </div>
                      ))}
                    </div>
                    {form.pain_points.length < 4 && <Button variant="ghost" size="sm" className="text-xs mt-1" onClick={() => setForm({ ...form, pain_points: [...form.pain_points, ''] })}><Plus className="w-3 h-3 mr-1" /> Add</Button>}
                  </div>

                  {/* Pitch Context Card */}
                  {selectedVerticals.length > 0 && selectedVerticals[0].primary_compliance && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left">
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-sm font-medium flex-1">Pitch Context</span>
                        <span className="text-[10px] text-muted-foreground">Used by AI for message generation</span>
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 p-3 rounded-lg border border-border bg-muted/20 space-y-2 text-xs">
                        {selectedVerticals.map(v => (
                          <div key={v.id} className="space-y-1.5">
                            {v.primary_compliance && (
                              <div className="flex items-start gap-1.5">
                                <span className="font-medium text-muted-foreground shrink-0">Compliance:</span>
                                <span className="text-foreground">{v.primary_compliance}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Live ICP quality analysis. Runs analyze-icp-fit as the
                      user edits pain points + value prop + titles, so they
                      can fix a weak ICP BEFORE burning enrichment credits. */}
                  <IcpFitPreview
                    input={{
                      icp_description: form.icp_description,
                      icp_titles: form.icp_titles,
                      icp_industries: form.icp_industries,
                      pain_points: form.pain_points,
                      value_proposition: form.value_proposition,
                      proof_points: form.proof_points,
                      campaign_objective: form.campaign_objective,
                      campaign_angle: form.campaign_angle,
                    }}
                  />
                </>
              )}
            </>
          )}

          {/* STEP 2: Import CSV */}
          {step === 2 && (
            <>
              {importedCount > 0 && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                  <p className="text-sm font-medium">✅ {importedCount} leads imported</p>
                  <p className="text-xs text-muted-foreground mt-1">Enrichment and ICP validation will run after launch.</p>
                </div>
              )}

              {csvParsed.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Valid leads</p>
                    <p className="text-sm font-semibold">{csvStats.valid}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Invalid rows</p>
                    <p className="text-sm font-semibold">{csvStats.invalid}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Duplicates</p>
                    <p className="text-sm font-semibold">{csvStats.duplicate}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">Credits left</p>
                    <p className="text-sm font-semibold">{leadsRemaining}</p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Upload a CSV with LinkedIn profile URLs. We'll enrich each profile, validate against your ICP, and generate personalized messages automatically.</p>
                </div>

                {/* Where to find leads - collapsed */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium flex-1">Where to find leads with LinkedIn URLs</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-3 rounded-lg border border-border bg-muted/20 space-y-3 text-xs">
                    <div className="flex items-start gap-2">
                      <span>🔍</span>
                      <div><p className="font-medium">LinkedIn Sales Navigator</p><p className="text-muted-foreground">The gold standard. Use advanced filters, then export with Evaboot or Dripify.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>⚡</span>
                      <div><p className="font-medium">Instantly SuperSearch</p><p className="text-muted-foreground">450M+ B2B contacts with waterfall enrichment. Exports include LinkedIn URLs.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>🔎</span>
                      <div><p className="font-medium">Apollo.io</p><p className="text-muted-foreground">Large database with job title and location filters. Export leads with LinkedIn URLs as CSV.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>👤</span>
                      <div><p className="font-medium">Lusha</p><p className="text-muted-foreground">Chrome extension for quick LinkedIn profile data capture.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>📝</span>
                      <div><p className="font-medium">Manual Research</p><p className="text-muted-foreground">Search LinkedIn directly, copy profile URLs into a spreadsheet.</p></div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvFile} className="hidden" />
                {csvParsed.length === 0 ? (
                  <>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                      <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm font-medium">Drag & drop your CSV here</p>
                      <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-2">Required column: LinkedIn URL</p>
                    </button>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                        <FileSpreadsheet className="w-3 h-3 mr-1" /> Download CSV Template
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{fileInputRef.current?.files?.[0]?.name || 'file.csv'}</p>
                        <p className="text-xs text-muted-foreground">{csvParsed.length} leads found</p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setCsvParsed([]); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="overflow-x-auto max-h-36 border rounded-lg">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-muted"><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-left">Title</th><th className="px-2 py-1 text-left">LinkedIn</th></tr></thead>
                        <tbody>{csvParsed.slice(0, 5).map((r, i) => <tr key={i} className="border-t"><td className="px-2 py-1">{r.first_name} {r.last_name}</td><td className="px-2 py-1">{r.title}</td><td className="px-2 py-1 truncate max-w-[150px]">{r.linkedin_url}</td></tr>)}</tbody>
                      </table>
                    </div>
                    {csvParsed.length > 5 && <p className="text-xs text-muted-foreground">...and {csvParsed.length - 5} more</p>}
                    <Button onClick={importCsv} disabled={csvImporting} className="w-full">
                      {csvImporting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing...</> : `Import ${csvParsed.length} leads`}
                    </Button>
                  </>
                )}
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex justify-between pt-4">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            ) : onCancel ? (
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            ) : <div />}
            {step === 2 ? (
              <Button onClick={() => { if (importedCount > 0) handleLaunch(); else toast.error('Import at least 1 lead first'); }} disabled={launching} size="lg">
                {launching ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Launching...</> : <><Rocket className="w-4 h-4 mr-1" /> Launch Campaign</>}
              </Button>
            ) : (
              <Button onClick={handleNext}>Next <ArrowRight className="w-4 h-4 ml-1" /></Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= current ? 'bg-primary' : 'bg-border'}`} />
      ))}
    </div>
  );
}
