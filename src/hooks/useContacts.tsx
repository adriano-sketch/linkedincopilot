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
    let first = true;
    for (let guard = 0; guard < 200; guard++) {
      const { data, error } = await supabase.functions.invoke('contacts-match', {
        body: { op: 'score', campaign_id: campaignId, ...(first ? { description } : {}) },
      });
      first = false;
      if (error) throw error;
      const total = Number(data?.total) || 0;
      const remaining = Number(data?.remaining) || 0;
      onProgress(total - remaining, total);
      qc.invalidateQueries({ queryKey: ['connection_matches', campaignId] });
      if (remaining <= 0 || !data?.scored) break;
    }
    refresh();
  };

  const searchLinkedIn = useMutation({
    mutationFn: async ({ keywords, pages }: { keywords: string[]; pages: number }) => {
      const { data, error } = await supabase.functions.invoke('contacts-search', { body: { campaign_id: campaignId, keywords, pages } });
      if (error) {
        // supabase-js wraps non-2xx answers; surface the function's own message.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = (error as any).context;
        const msg = ctx && typeof ctx.json === 'function' ? (await ctx.json().catch(() => null))?.error : null;
        throw new Error(msg || error.message);
      }
      return data as { ok: boolean; pages?: number; extension_online?: boolean; already_running?: boolean };
    },
    onSuccess: refresh,
  });

  const setSelected = useMutation({
    mutationFn: async ({ ids, selected }: { ids: string[]; selected: boolean }) => {
      for (let i = 0; i < ids.length; i += 200) {
        const { error } = await db.from('connection_matches').update({ selected }).in('id', ids.slice(i, i + 200));
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connection_matches', campaignId] }),
  });

  return { importConnections, suggestKeywords, score, searchLinkedIn, setSelected };
}
