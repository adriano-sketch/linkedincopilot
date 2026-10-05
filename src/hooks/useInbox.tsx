import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type InboxKind = 'reply' | 'comment' | 'message';

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
};

const SIGNAL_LABEL: Record<string, string> = {
  business_opportunity: 'Business signal',
  hiring: 'Hiring',
  pain_point: 'Pain point',
};

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

const leadName = (l: { full_name?: string | null; first_name?: string | null; last_name?: string | null; linkedin_url?: string | null }) =>
  l.full_name || [l.first_name, l.last_name].filter(Boolean).join(' ') || (l.linkedin_url || '').split('/in/')[1]?.replace(/\/$/, '') || 'Unknown';

export function useInbox() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const enabled = !!user;

  const campaigns = useQuery({
    queryKey: ['inbox-campaign-names', user?.id],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('campaign_profiles').select('id, name').eq('user_id', user!.id);
      if (error) throw error;
      return new Map((data || []).map(c => [c.id, c.name as string]));
    },
  });

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

  const messages = useQuery({
    queryKey: ['inbox-messages', user?.id],
    enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await db.from('campaign_leads')
        .select('id, full_name, first_name, last_name, title, company, profile_headline, profile_about, linkedin_url, custom_dm, dm_text, icp_match_reason, connected_at, connection_accepted_at, updated_at, campaign_profile_id')
        .eq('user_id', user!.id).eq('status', 'dm_pending_approval')
        .order('updated_at', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const replies = useQuery({
    queryKey: ['inbox-replies', user?.id],
    enabled,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data, error } = await db.from('campaign_leads')
        .select('id, full_name, first_name, last_name, title, company, profile_headline, linkedin_url, custom_dm, dm_text, follow_up_text, reply_text, reply_sentiment, reply_intent, replied_at, campaign_profile_id')
        .eq('user_id', user!.id).eq('status', 'replied').is('reply_handled_at', null)
        .order('replied_at', { ascending: false, nullsFirst: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  const items: InboxItem[] = useMemo(() => {
    const names = campaigns.data || new Map<string, string>();
    const out: InboxItem[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (replies.data || []) as any[]) {
      const name = leadName(r);
      const ours = r.follow_up_text || r.custom_dm || r.dm_text;
      const intent = r.reply_intent === 'meeting' ? 'Wants to meet' : r.reply_intent === 'ask_more' ? 'Asked for more' : null;
      out.push({
        key: `reply:${r.id}`, kind: 'reply', id: r.id, name, initials: initialsOf(name),
        headline: [r.title || r.profile_headline, r.company].filter(Boolean).join(' · ') || null,
        campaign: names.get(r.campaign_profile_id) || null,
        at: r.replied_at, preview: r.reply_text || 'Replied to your message',
        contextLabel: 'Conversation',
        context: [ours ? `You: ${ours}` : null, `${name.split(' ')[0]}: ${r.reply_text || '(reply detected, open LinkedIn to read it)'}`].filter(Boolean).join('\n\n'),
        draft: '',
        signal: intent, signalWhy: intent ? (r.reply_intent === 'meeting' ? 'they asked for a call or meeting' : 'they want to know more') : null,
        why: r.reply_sentiment === 'positive' ? 'Positive reply. Answering within the hour makes a meeting far more likely.' : 'Answer on LinkedIn, then mark it as handled.',
        profileUrl: r.linkedin_url, postUrl: null,
      });
    }

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
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const l of (messages.data || []) as any[]) {
      const name = leadName(l);
      const about = [l.icp_match_reason, l.profile_about ? String(l.profile_about).slice(0, 400) : null].filter(Boolean).join('\n\n');
      out.push({
        key: `message:${l.id}`, kind: 'message', id: l.id, name, initials: initialsOf(name),
        headline: [l.title || l.profile_headline, l.company].filter(Boolean).join(' · ') || null,
        campaign: names.get(l.campaign_profile_id) || null,
        at: l.connection_accepted_at || l.connected_at || l.updated_at,
        preview: 'Accepted your invite. First message ready.',
        contextLabel: 'Why this person',
        context: about || 'Accepted your connection request.',
        draft: l.custom_dm || l.dm_text || '',
        signal: null, signalWhy: null,
        why: 'First messages sent the same day get noticeably more replies.',
        profileUrl: l.linkedin_url, postUrl: null,
      });
    }

    const rank = (i: InboxItem) => (i.kind === 'reply' ? 0 : i.signal ? 1 : i.kind === 'comment' ? 2 : 3);
    return out.sort((a, b) => rank(a) - rank(b) || (b.at || '').localeCompare(a.at || ''));
  }, [replies.data, comments.data, messages.data, campaigns.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inbox-comments'] });
    qc.invalidateQueries({ queryKey: ['inbox-messages'] });
    qc.invalidateQueries({ queryKey: ['inbox-replies'] });
    qc.invalidateQueries({ queryKey: ['monitored-posts'] });
    qc.invalidateQueries({ queryKey: ['network-stats'] });
    qc.invalidateQueries({ queryKey: ['campaign_leads'] });
    qc.invalidateQueries({ queryKey: ['inbox-count'] });
  };

  /** Approves items of one or more kinds. `edits` maps item key → edited text. */
  const approve = useMutation({
    mutationFn: async ({ items: list, edits }: { items: InboxItem[]; edits: Record<string, string> }) => {
      const commentIds = list.filter(i => i.kind === 'comment').map(i => i.id);
      const messageItems = list.filter(i => i.kind === 'message');
      let done = 0;
      if (commentIds.length) {
        const p_edits: Record<string, string> = {};
        for (const i of list) if (i.kind === 'comment' && edits[i.key] != null && edits[i.key].trim() !== i.draft.trim()) p_edits[i.id] = edits[i.key].trim();
        const { data, error } = await supabase.rpc('approve_post_comments', { p_ids: commentIds, p_edits });
        if (error) throw error;
        done += Number(data) || 0;
      }
      if (messageItems.length) {
        const editsBody: Record<string, { custom_dm: string }> = {};
        for (const i of messageItems) if (edits[i.key] != null && edits[i.key].trim() !== i.draft.trim()) editsBody[i.id] = { custom_dm: edits[i.key].trim() };
        const hasEdits = Object.keys(editsBody).length > 0;
        const { data, error } = await supabase.functions.invoke('approve-dms', {
          body: { lead_ids: messageItems.map(i => i.id), action: hasEdits ? 'approve_with_edit' : 'approve', ...(hasEdits ? { edits: editsBody } : {}) },
        });
        if (error) throw error;
        done += Number(data?.approved) || 0;
      }
      return done;
    },
    onSuccess: invalidate,
  });

  /** Comment: skip it. Message: write a new draft. Reply: mark as handled. */
  const dismiss = useMutation({
    mutationFn: async (item: InboxItem) => {
      const now = new Date().toISOString();
      if (item.kind === 'comment') {
        const { error } = await supabase.from('monitored_posts').update({ status: 'dismissed', updated_at: now }).eq('id', item.id).eq('status', 'pending');
        if (error) throw error;
      } else if (item.kind === 'message') {
        const { error } = await supabase.functions.invoke('approve-dms', { body: { lead_ids: [item.id], action: 'reject' } });
        if (error) throw error;
      } else {
        const { error } = await db.from('campaign_leads').update({ reply_handled_at: now }).eq('id', item.id);
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });

  const loading = comments.isLoading || messages.isLoading || replies.isLoading;
  return { items, loading, approve, dismiss };
}

/** Lightweight count for the sidebar badge. */
export function useInboxCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['inbox-count', user?.id],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      const [c, m, r] = await Promise.all([
        supabase.from('monitored_posts').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'pending'),
        db.from('campaign_leads').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'dm_pending_approval'),
        db.from('campaign_leads').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'replied').is('reply_handled_at', null),
      ]);
      return (c.count || 0) + (m.count || 0) + (r.count || 0);
    },
  });
}
