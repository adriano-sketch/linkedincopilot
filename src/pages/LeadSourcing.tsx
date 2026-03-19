import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useCampaignProfiles } from '@/hooks/useCampaignProfiles';
import { useCampaignLeads } from '@/hooks/useCampaignLeads';
import { useUserPlan } from '@/hooks/useUserPlan';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Upload, Loader2, Rocket, Crown, Info, ChevronDown, FileSpreadsheet } from 'lucide-react';
import { UpgradeModal } from '@/components/UpgradeModal';
import { parseLeadCsv, normalizeLinkedInUrl } from '@/lib/csv';

export default function LeadSourcing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile } = useProfile();
  const queryClient = useQueryClient();
  const { campaigns } = useCampaignProfiles();
  const { plan, isFree, leadsUsed, leadsLimit, leadsRemaining, cycleResetDate } = useUserPlan();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  // CSV state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvParsed, setCsvParsed] = useState<any[]>([]);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvStats, setCsvStats] = useState<{ invalidRows: number; duplicateRows: number; ghostRows: number; totalRows: number } | null>(null);

  const { leads } = useCampaignLeads(selectedCampaignId || undefined);
  const campaign = campaigns.find(c => c.id === selectedCampaignId);

  // CSV parsing
  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { rows, invalidRows, duplicateRows, ghostRows, totalRows, headers } = parseLeadCsv(text);
      if (!headers.includes('linkedin_url')) {
        toast.error('CSV must include a linkedin_url column (or similar)');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (rows.length === 0) {
        toast.error('No valid LinkedIn URLs found in the CSV');
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      if (rows.length > leadsRemaining) {
        toast.error(`Your CSV has ${rows.length} leads but you only have ${leadsRemaining} credits remaining. Please reduce your CSV.`);
        return;
      }

      setCsvParsed(rows);
      setCsvStats({ invalidRows, duplicateRows, ghostRows, totalRows });
      const extra = invalidRows > 0 || duplicateRows > 0 || ghostRows > 0
        ? ` (${invalidRows} invalid, ${duplicateRows} duplicates, ${ghostRows} ghosts skipped)`
        : '';
      toast.success(`Parsed ${rows.length} leads from CSV${extra}`);
    };
    reader.readAsText(file);
  };

  const importCsv = async () => {
    if (!selectedCampaignId || !user) { toast.error('Select a campaign first'); return; }
    setCsvImporting(true);
    try {
      const existingUrls = new Set(
        leads.map(l => normalizeLinkedInUrl(l.linkedin_url)).filter(Boolean) as string[]
      );
      const newLeads = csvParsed.filter(r => !existingUrls.has(r.linkedin_url));
      const dupes = csvParsed.length - newLeads.length;

      if (newLeads.length > leadsRemaining) {
        toast.error(`You only have ${leadsRemaining} credits remaining. Please reduce your import.`);
        setCsvImporting(false);
        return;
      }

      if (newLeads.length > 0) {
        const { data: inserted, error } = await supabase.from('campaign_leads')
          .insert(newLeads.map(r => ({
            user_id: user.id,
            campaign_profile_id: selectedCampaignId,
            first_name: r.first_name || null,
            last_name: r.last_name || null,
            full_name: r.full_name || (r.first_name && r.last_name ? `${r.first_name} ${r.last_name}` : null),
            title: r.title || null,
            company: r.company || null,
            linkedin_url: r.linkedin_url,
            location: r.location || null,
            source: 'csv',
            status: 'new',
            profile_quality_status: 'pending',
          })))
          .select('id, linkedin_url');
        if (error) throw error;

        await supabase.functions.invoke('increment-leads-used', { body: { count: newLeads.length } });
        queryClient.invalidateQueries({ queryKey: ['user_settings'] });

        if (inserted && inserted.length > 0) {
          const now = new Date();
          const queued = inserted.map((lead, index) => ({
            user_id: user.id,
            campaign_lead_id: lead.id,
            action_type: 'check_profile_quality',
            linkedin_url: lead.linkedin_url,
            scheduled_for: new Date(now.getTime() + index * 15000).toISOString(),
            priority: 1,
          }));
          await supabase.from('action_queue').insert(queued);
          toast.info(`Queued ${queued.length} LinkedIn quality checks. Keep the extension open.`, { duration: 8000 });
        }
      }
      toast.success(`Imported ${newLeads.length} leads. ${dupes} duplicates skipped.`);
      queryClient.invalidateQueries({ queryKey: ['campaign_leads'] });
      setCsvParsed([]);
      setCsvStats(null);
    } catch (e) {
      toast.error('Import failed: ' + (e instanceof Error ? e.message : 'Unknown'));
    } finally {
      setCsvImporting(false);
    }
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

  const creditsPercentage = leadsLimit > 0 ? Math.min(100, (leadsUsed / leadsLimit) * 100) : 0;
  const isLow = leadsRemaining > 0 && leadsRemaining < 100;
  const isExhausted = leadsRemaining <= 0;
  const resetDateFormatted = cycleResetDate ? new Date(cycleResetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <h1 className="text-2xl font-bold">Add Leads</h1>
        </div>

        {/* Lead Credits Banner */}
        <Card className={isExhausted ? 'border-destructive/50 bg-destructive/5' : isLow ? 'border-warning/50 bg-warning/5' : ''}>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium flex items-center gap-2">
                {isExhausted ? '🚫' : isLow ? '⚠️' : '📊'} Lead Credits {isFree ? '(Lifetime)' : 'This Month'}
              </span>
              <span className="text-xs text-muted-foreground">
                {leadsUsed.toLocaleString()} / {leadsLimit.toLocaleString()} used
              </span>
            </div>
            <Progress value={creditsPercentage} className="h-2" />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-muted-foreground">
                {leadsRemaining.toLocaleString()} leads remaining
                {resetDateFormatted && !isFree && ` · Resets ${resetDateFormatted}`}
              </span>
              {isFree && (
                <Button variant="link" size="sm" className="text-xs h-auto p-0" onClick={() => setUpgradeOpen(true)}>
                  <Crown className="w-3 h-3 mr-1" /> Upgrade for 1,000/month
                </Button>
              )}
            </div>
            {isExhausted && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-sm">
                <p className="font-medium">Monthly Lead Limit Reached</p>
                <p className="text-muted-foreground text-xs mt-1">
                  Your leads are still being processed — check the Pipeline tab.
                  {resetDateFormatted && ` New lead imports reset on ${resetDateFormatted}.`}
                </p>
                {isFree && (
                  <Button size="sm" className="mt-2" onClick={() => setUpgradeOpen(true)}>
                    Upgrade Plan
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Campaign selector */}
        <div className="flex items-center gap-2">
          <Label>Campaign:</Label>
          <Select value={selectedCampaignId} onValueChange={v => { setSelectedCampaignId(v); setCsvParsed([]); }}>
            <SelectTrigger className="w-[250px]"><SelectValue placeholder="Select campaign" /></SelectTrigger>
            <SelectContent>
              {campaigns.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {selectedCampaignId && <Badge variant="outline">{leads.length} existing leads</Badge>}
        </div>

        {!selectedCampaignId ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Select a campaign to add leads.</CardContent></Card>
        ) : (
          <>
            {/* CSV Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">📄 Import Your Leads</CardTitle>
                <CardDescription>Upload a CSV with LinkedIn profile URLs. We'll enrich each profile, validate against your ICP, and generate personalized messages.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Where to find leads */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left">
                    <Info className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium flex-1">Where to find leads with LinkedIn URLs</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 p-3 rounded-lg border border-border bg-muted/20 space-y-3 text-xs">
                    <div className="flex items-start gap-2">
                      <span>🔍</span>
                      <div><p className="font-medium">LinkedIn Sales Navigator</p><p className="text-muted-foreground">The gold standard. Export with Evaboot or Dripify.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>⚡</span>
                      <div><p className="font-medium">Instantly SuperSearch</p><p className="text-muted-foreground">450M+ B2B contacts. Exports include LinkedIn URLs.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>🔎</span>
                      <div><p className="font-medium">Apollo.io</p><p className="text-muted-foreground">Export leads with LinkedIn URLs as CSV.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>👤</span>
                      <div><p className="font-medium">Lusha</p><p className="text-muted-foreground">Chrome extension for quick profile capture.</p></div>
                    </div>
                    <div className="flex items-start gap-2">
                      <span>📝</span>
                      <div><p className="font-medium">Manual Research</p><p className="text-muted-foreground">Search LinkedIn directly, copy URLs into a spreadsheet.</p></div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleCsvFile} className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-medium file:cursor-pointer" />

                {csvStats && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Total rows</p>
                      <p className="text-sm font-semibold">{csvStats.totalRows}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Invalid</p>
                      <p className="text-sm font-semibold">{csvStats.invalidRows}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Duplicates</p>
                      <p className="text-sm font-semibold">{csvStats.duplicateRows}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
                      <p className="text-[10px] uppercase text-muted-foreground">Ghosts</p>
                      <p className="text-sm font-semibold">{csvStats.ghostRows}</p>
                    </div>
                  </div>
                )}

                <Button variant="outline" size="sm" onClick={downloadCsvTemplate}>
                  <FileSpreadsheet className="w-3 h-3 mr-1" /> Download CSV Template
                </Button>

                {csvParsed.length > 0 && (
                  <>
                    <p className="text-sm font-medium">Preview ({csvParsed.length} leads):</p>
                    <div className="overflow-x-auto max-h-48 border rounded-lg">
                      <table className="w-full text-xs">
                        <thead><tr className="bg-muted">
                          <th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-left">Title</th><th className="px-2 py-1 text-left">Company</th><th className="px-2 py-1 text-left">LinkedIn</th>
                        </tr></thead>
                        <tbody>
                          {csvParsed.slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t"><td className="px-2 py-1">{r.first_name} {r.last_name}</td><td className="px-2 py-1">{r.title}</td><td className="px-2 py-1">{r.company}</td><td className="px-2 py-1 truncate max-w-[200px]">{r.linkedin_url}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button onClick={importCsv} disabled={csvImporting || isExhausted}>
                      {csvImporting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importing...</> : `Import ${csvParsed.length} leads`}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Summary */}
            {leads.length > 0 && (
              <Card>
                <CardContent className="py-6 text-center space-y-3">
                  <p className="text-lg font-semibold">You have {leads.length} leads in {campaign?.name}</p>
                  <div className="flex gap-3 justify-center">
                    <Button size="lg" onClick={() => navigate(`/dashboard?campaign=${selectedCampaignId}&launch=true`)}>
                      <Rocket className="w-4 h-4 mr-1" /> Launch Campaign
                    </Button>
                    <Button variant="outline" onClick={() => { setCsvParsed([]); }}>Add more leads</Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
      <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
    </div>
  );
}
