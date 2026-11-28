import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type InboxKind = 'comment';

/** Why a comment draft was skipped. Same keys as the check constraint on monitored_posts.dismiss_reason. */
export type DismissReason = 'off_topic' | 'not_my_voice' | 'too_generic' | 'dont_know_person';
export const DISMISS_REASONS: { key: DismissReason; label: string }[] = [
  { key: 'off_topic', label: 'Not my subject' },
  { key: 'not_my_voice', label: "I wouldn't say this" },
  { key: 'too_generic', label: 'Too generic' },
  { key: 'dont_know_person', label: "Don't know them well" },
];

export type InboxItem = {
  key: string;            // `${kind}:${id}`
  kind: InboxKind;
  id: string;
  name: string;
  initials: string;
  headline: string | null;
  campaign: string | null;
  at: string | null;      // when it entered the inbox
  preview: string;
  contextLabel: string;
  context: string;        // post text, conversation, or why this person
  draft: string;          // editable text ('' for replies)
  signal: string | null;  // business signal label
  signalWhy: string | null;
  why: string | null;
  profileUrl: string | null;
  postUrl: string | null;
  /** What the draft was built from. Shown only in diagnostics mode. */
  diagnostics: DraftDiagnostics | null;
};

/** Reads stored diagnostics field by field: anything that is not the expected shape is treated as absent. */
export function readDiagnostics(v: unknown): DraftDiagnostics | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const text = (x: unknown) => (typeof x === 'string' ? x : undefined);
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is string => typeof n === 'string') : undefined);
  return {
    subject: text(o.subject), intent: text(o.intent), detail: text(o.detail), plans: text(o.plans), why: text(o.why), outcome: text(o.outcome),
    notes_used: list(o.notes_used), notes_left: list(o.notes_left), voice_notes: list(o.voice_notes),
    attempts: typeof o.attempts === 'number' ? o.attempts : undefined,
    withoutNotes: typeof o.withoutNotes === 'boolean' ? o.withoutNotes : undefined,
  };
}

export type DraftDiagnostics = {
  subject?: string; intent?: string; detail?: string; plans?: string; why?: string;
  notes_used?: string[]; notes_left?: string[]; voice_notes?: string[]; attempts?: number; withoutNotes?: boolean; outcome?: string;
};

const SIGNAL_LABEL: Record<string, string> = {
  business_opportunity: 'Business signal',
  hiring: 'Hiring',
  pain_point: 'Pain point',
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export function useInbox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user;

  const comments = useQuery({
    queryKey: ['inbox-comments', user?.id],
    enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await supabase.from('monitored_posts').select('*')
        .eq('user_id', user!.id).eq('status', 'pending')
        .order('priority', { ascending: false }).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const items: InboxItem[] = useMemo(() => {
    const out: InboxItem[] = [];

    for (const p of comments.data || []) {
      const name = p.author_name || 'Unknown author';
      const sig = p.signal_type && SIGNAL_LABEL[p.signal_type] ? SIGNAL_LABEL[p.signal_type] : null;
      out.push({
        key: `comment:${p.id}`, kind: 'comment', id: p.id, name, initials: initialsOf(name),
        headline: [p.author_headline, p.author_degree].filter(Boolean).join(' · ') || null,
        campaign: null,
        at: p.created_at, preview: (p.post_text || '').slice(0, 140),
        contextLabel: ['Post', p.posted_label, p.reactions_count != null ? `${p.reactions_count} reactions` : null].filter(Boolean).join(' · '),
        context: p.post_text || '',
        draft: p.final_comment || p.suggested_comment || '',
        signal: sig, signalWhy: sig ? p.signal_reason : null,
        why: p.fit_reason || null,
        profileUrl: p.author_profile_url, postUrl: p.post_url,
        diagnostics: readDiagnostics(p.draft_notes),
      });
    }

    const rank = (i: InboxItem) => (i.signal ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || (b.at || '').localeCompare(a.at || ''));
  }, [comments.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inbox-comments'] });
    qc.invalidateQueries({ queryKey: ['monitored-posts'] });
    qc.invalidateQueries({ queryKey: ['network-stats'] });
    qc.invalidateQueries({ queryKey: ['campaign_leads'] });
    qc.invalidateQueries({ queryKey: ['inbox-count'] });
  };

  /** Records the comments the person posted. `edits` maps item key → edited text. */
  const approve = useMutation({
    mutationFn: async ({ items: list, edits }: { items: InboxItem[]; edits: Record<string, string> }) => {
      const commentIds = list.filter(i => i.kind === 'comment').map(i => i.id);
      if (!commentIds.length) return 0;
      const p_edits: Record<string, string> = {};
      for (const i of list) if (i.kind === 'comment' && edits[i.key] != null && edits[i.key].trim() !== i.draft.trim()) p_edits[i.id] = edits[i.key].trim();
      // The person posted it on LinkedIn; this only records it.
      const { data, error } = await db.rpc('mark_post_comments_posted', { p_ids: commentIds, p_edits });
      if (error) throw error;
      return Number(data) || 0;
    },
    onSuccess: invalidate,
  });

  /** Skips a comment draft, optionally saying why. */
  const dismiss = useMutation({
    mutationFn: async (arg: InboxItem | { item: InboxItem; reason?: DismissReason | null }) => {
      const item = 'item' in arg ? arg.item : arg;
      const reason = 'item' in arg ? arg.reason || null : null;
      const now = new Date().toISOString();
      const { error } = await db.from('monitored_posts')
        .update({ status: 'dismissed', updated_at: now, ...(reason ? { dismiss_reason: reason } : {}) })
        .eq('id', item.id).eq('status', 'pending');
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const loading = comments.isLoading;
  // A failed load with nothing cached must not look like an empty Inbox.
  // Offline with nothing loaded is the same case: the query waits ("paused") and is neither loading
  // nor in error, which would otherwise show "all caught up" for an Inbox that was never read.
  const failed = !loading && !comments.data && (comments.isError || comments.fetchStatus === 'paused');
  return { items, loading, failed, retrying: failed && comments.isFetching, retry: comments.refetch, approve, dismiss };
}

/** Lightweight count for the sidebar badge. */
export function useInboxCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['inbox-count', user?.id],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      const c = await supabase.from('monitored_posts').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'pending');
      // On a failure keep the last count instead of showing zero.
      if (c.error) throw c.error;
      return c.count || 0;
    },
  });
}
