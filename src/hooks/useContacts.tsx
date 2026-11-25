import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { ExportedConnection } from '@/lib/linkedinExport';

// New tables (linkedin_connections, connection_matches) are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Embedded join (match → its connection). Kept in a constant: the schema audit script reads
// literal select strings and would mistake the embedded table for a column.
const MATCH_SELECT = 'id, score, reason, selected, connection:linkedin_connections(id, linkedin_url, full_name, headline, position, company)';

export type ContactMatch = {
  id: string;
  score: number;
  reason: string | null;
  selected: boolean;
  connection: {
    id: string;
    linkedin_url: string;
    full_name: string | null;
    headline: string | null;
    position: string | null;
    company: string | null;
  };
};

export function useConnectionsCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['linkedin_connections_count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await db.from('linkedin_connections').select('id', { count: 'exact', head: true }).eq('user_id', user!.id);
      if (error) throw error;
      return (count as number) || 0;
    },
  });
}

/** Matches for a campaign, best first. Polls while a LinkedIn search is running. */
/**
 * How the list's contacts were sorted: how many were analyzed, and how many fit (score 60 or more,
 * the same line as the picker's default filter). Null while nothing was analyzed.
 */
export const FIT_SCORE = 60;

export type RelevantContacts = { contacts: number; analyzed: number; relevant: number };
/** Of everyone in the person's network, how many fit what they described (rpc relevant_contacts). */
export function useRelevantContacts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['relevant_contacts', user?.id],
    enabled: !!user,
    staleTime: 60000,
    queryFn: async (): Promise<RelevantContacts> => {
      const { data, error } = await db.rpc('relevant_contacts');
      if (error) throw error;
      return {
        contacts: Number(data?.contacts) || 0,
        analyzed: Number(data?.analyzed) || 0,
        relevant: Number(data?.relevant) || 0,
      };
    },
  });
}
export function useMatchSummary(campaignId: string | null, polling = false) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['connection_matches_summary', campaignId],
    enabled: !!user && !!campaignId,
    refetchInterval: polling ? 8000 : false,
    queryFn: async (): Promise<{ analyzed: number; fit: number } | null> => {
      const count = async (min: number | null) => {
        let q = db.from('connection_matches').select('id', { count: 'exact', head: true }).eq('campaign_profile_id', campaignId);
        if (min != null) q = q.gte('score', min);
        const { count: n, error } = await q;
        if (error) throw error;
        return n || 0;
      };
      const [analyzed, fit] = await Promise.all([count(null), count(FIT_SCORE)]);
      return analyzed > 0 ? { analyzed, fit } : null;
    },
  });
}

export function useContactMatches(campaignId: string | null, minScore: number, polling: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['connection_matches', campaignId, minScore],
    enabled: !!user && !!campaignId,
    refetchInterval: polling ? 8000 : false,
    queryFn: async (): Promise<ContactMatch[]> => {
      const { data, error } = await db.from('connection_matches')
        .select(MATCH_SELECT)
        .eq('campaign_profile_id', campaignId)
        .gte('score', minScore)
        .order('score', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data || []).filter((m: ContactMatch) => m.connection);
    },
  });
}

/** Latest LinkedIn search run for this campaign (to show progress). */
export function useContactSearchStatus(campaignId: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['connection_search_runs', campaignId],
    enabled: !!user && !!campaignId,
    refetchInterval: (q) => {
      const runs = q.state.data as { status: string }[] | undefined;
      return runs?.some(r => r.status === 'queued') ? 8000 : false;
    },
    queryFn: async () => {
      const { data, error } = await db.from('network_search_runs')
        .select('id, status, page, query, results_count, new_count, created_at')
        .eq('campaign_profile_id', campaignId).eq('kind', 'connections')
        .order('created_at', { ascending: false }).limit(10);
      if (error) throw error;
      return (data || []) as { id: string; status: string; page: number; query: string | null; results_count: number | null; new_count: number | null; created_at: string }[];
    },
  });
}

export function useContactActions(campaignId: string | null) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['connection_matches', campaignId] });
    qc.invalidateQueries({ queryKey: ['linkedin_connections_count'] });
    qc.invalidateQueries({ queryKey: ['connection_search_runs', campaignId] });
    qc.invalidateQueries({ queryKey: ['connection_matches_summary', campaignId] });
    qc.invalidateQueries({ queryKey: ['relevant_contacts'] });
  };

  const importConnections = useMutation({
    mutationFn: async (rows: ExportedConnection[]) => {
      if (!user) throw new Error('Not signed in');
      let saved = 0;
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500).map(r => ({ ...r, user_id: user.id, source: 'linkedin_export', updated_at: new Date().toISOString() }));
        // The export has the exact position and company: it wins over what a search found.
        const { error } = await db.from('linkedin_connections').upsert(chunk, { onConflict: 'user_id,linkedin_url' });
        if (error) throw error;
        saved += chunk.length;
      }
      return saved;
    },
    onSuccess: refresh,
  });

  const suggestKeywords = useMutation({
    mutationFn: async (description: string) => {
      const { data, error } = await supabase.functions.invoke('contacts-match', { body: { op: 'keywords', description } });
      if (error) throw error;
      return (data?.keywords || []) as string[];
    },
  });

  /** Scores every connection not yet scored for this campaign, calling the function in a loop. */
  const score = async (description: string, onProgress: (done: number, total: number) => void) => {
    if (!campaignId) throw new Error('Campaign not created yet');
    // The function's own error message (its JSON body) instead of supabase-js's generic
    // "Edge Function returned a non-2xx status code"; also tells us whether to retry.
    const readError = async (error: unknown): Promise<{ message: string; status: number }> => {
      const ctx = (error as { context?: Response })?.context;
      const status = ctx?.status ?? 0;
      try {
        const body = ctx ? await ctx.clone().json() : null;
        if (body?.error) return { message: String(body.error), status };
      } catch { /* not JSON */ }
      return { message: error instanceof Error ? error.message : 'Matching failed, try again', status };
    };
    let first = true;
    let transientRetries = 0;
    // Also after a failure: the batches that went through before it changed the counts.
    try {
    for (let guard = 0; guard < 200; guard++) {
      const { data, error } = await supabase.functions.invoke('contacts-match', {
        body: { op: 'score', campaign_id: campaignId, ...(first ? { description } : {}) },
      });
      first = false;
      if (error) {
        const { message, status } = await readError(error);
        // A busy model API (503) or a gateway hiccup: wait and resume from where it stopped.
        if ((status === 503 || status === 502 || status === 504 || status === 0) && transientRetries < 3) {
          transientRetries++;
          await new Promise((r) => setTimeout(r, 3000 * transientRetries));
          continue;
        }
        throw new Error(message);
      }
      transientRetries = 0;
      const total = Number(data?.total) || 0;
      const remaining = Number(data?.remaining) || 0;
      onProgress(total - remaining, total);
      qc.invalidateQueries({ queryKey: ['connection_matches', campaignId] });
      if (remaining <= 0 || !data?.scored) break;
    }
    } finally {
      refresh();
    }
  };

  const searchLinkedIn = useMutation({
    mutationFn: async ({ keywords, pages, postedRecently }: { keywords: string[]; pages: number; postedRecently?: boolean }) => {
      const { data, error } = await supabase.functions.invoke('contacts-search', {
        body: { campaign_id: campaignId, keywords, pages, posted_recently: !!postedRecently },
      });
      if (error) {
        // supabase-js wraps non-2xx answers; surface the function's own message.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        const msg = ctx && typeof ctx.json === 'function' ? (await ctx.json().catch(() => null))?.error : null;
        throw new Error(msg || error.message);
      }
      return data as { ok: boolean; pages?: number; extension_online?: boolean; already_running?: boolean; sales_navigator?: boolean };
    },
    onSuccess: refresh,
  });

  const setSelected = useMutation({
    // One at a time, in the order clicked: "untick all" then "tick one" must end with that one ticked.
    scope: { id: `contact-selected-${campaignId}` },
    mutationFn: async ({ ids, selected }: { ids: string[]; selected: boolean }) => {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await db.from('connection_matches').update({ selected }).in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connection_matches', campaignId] }),
    onError: () => { toast.error('Could not save your selection. Check your connection and try again.'); },
  });

  return { importConnections, suggestKeywords, score, searchLinkedIn, setSelected };
}
