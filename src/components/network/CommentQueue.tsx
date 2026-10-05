import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, X, ExternalLink, Loader2, MessageSquareText, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMonitoredPosts, type MonitoredPost, type PostFilter } from '@/hooks/useNetwork';

const SIGNALS: Record<string, { label: string; className: string }> = {
  business_opportunity: { label: 'Business signal', className: 'bg-gold-bg text-[#7A4B00] border-transparent' },
  hiring: { label: 'Hiring', className: 'bg-gold-bg text-[#7A4B00] border-transparent' },
  pain_point: { label: 'Pain point', className: 'bg-gold-bg text-[#7A4B00] border-transparent' },
  launch: { label: 'Launch', className: 'bg-secondary text-foreground border-transparent' },
  milestone: { label: 'Milestone', className: 'bg-secondary text-foreground border-transparent' },
  relationship: { label: 'Relationship', className: 'bg-secondary text-foreground border-transparent' },
};

function PostCard({
  post, selected, onToggle, text, onText, onApprove, onDismiss, busy, mode, onUnschedule,
}: {
  post: MonitoredPost;
  selected: boolean;
  onToggle: () => void;
  text: string;
  onText: (t: string) => void;
  onApprove: () => void;
  onDismiss: () => void;
  onUnschedule: () => void;
  busy: boolean;
  mode: PostFilter;
}) {
  const [expanded, setExpanded] = useState(false);
  const signal = post.signal_type ? SIGNALS[post.signal_type] : undefined;
  const longText = (post.post_text || '').length > 420;
  const shown = expanded || !longText ? post.post_text : `${(post.post_text || '').slice(0, 420)}…`;

  const initials = (post.author_name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const isSignal = ['business_opportunity', 'hiring', 'pain_point'].includes(post.signal_type || '');

  return (
    <article className={`rounded-2xl bg-card border p-5 sm:p-6 transition-colors ${selected ? 'border-foreground' : 'border-border'}`}>
      <div className="grid lg:grid-cols-2 gap-5 lg:gap-6">
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-3">
            {mode === 'pending' && <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select post by ${post.author_name || 'author'}`} />}
            <div className="w-11 h-11 shrink-0 rounded-full bg-navy text-primary grid place-items-center font-semibold">{initials}</div>
            <div className="flex-1 min-w-0">
              {post.author_profile_url ? (
                <a href={post.author_profile_url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                  {post.author_name || 'Unknown author'}
                </a>
              ) : <span className="font-semibold">{post.author_name || 'Unknown author'}</span>}
              <div className="text-[13px] text-muted-foreground line-clamp-1">
                {[post.author_headline, post.author_degree, post.posted_label].filter(Boolean).join(' · ')}
              </div>
            </div>
            {post.post_url && (
              <a href={post.post_url} target="_blank" rel="noreferrer" className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary" aria-label="Open post on LinkedIn">
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
          {(signal || (isSignal && post.signal_reason)) && (
            <div className="flex flex-wrap items-center gap-2">
              {signal && <Badge variant="outline" className={`rounded-full font-semibold ${signal.className}`}>{signal.label}</Badge>}
              {isSignal && post.signal_reason && <span className="text-[13px] text-[#7A4B00]">{post.signal_reason}</span>}
            </div>
          )}
          <blockquote className="m-0 rounded-xl bg-background/70 p-4 text-[15px] leading-relaxed whitespace-pre-line">
            {shown}
            {longText && (
              <button className="block mt-2 text-[13px] font-medium text-gold-dark hover:underline" onClick={() => setExpanded(e => !e)}>
                {expanded ? 'Show less' : 'Show full post'}
              </button>
            )}
          </blockquote>
        </div>

        <div className="flex flex-col gap-2.5">
          {mode === 'pending' ? (
            <>
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
                Suggested comment
                <Textarea rows={6} value={text} onChange={e => onText(e.target.value)} className="text-[15px] leading-relaxed text-foreground rounded-xl border-[1.5px] bg-card resize-y" />
              </label>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground tabular-nums">{text.length} characters</span>
                <div className="flex gap-2">
                  <Button variant="outline" className="h-11" onClick={onDismiss} disabled={busy}><X className="w-4 h-4 mr-1" /> Skip</Button>
                  <Button className="h-11 bg-navy text-background hover:bg-navy-light" onClick={onApprove} disabled={busy || !text.trim()}><Check className="w-4 h-4 mr-1" /> Approve</Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <span className="text-[13px] font-medium text-muted-foreground">Comment</span>
              <p className="m-0 rounded-xl border border-border p-4 text-[15px] leading-relaxed">{post.final_comment || post.suggested_comment}</p>
              <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
                <span className={post.status === 'failed' ? 'text-destructive' : post.status === 'posted' ? 'text-success font-medium' : ''}>
                  {post.status === 'posted' && post.commented_at && `Commented ${new Date(post.commented_at).toLocaleString()}`}
                  {post.status === 'approved' && 'Approved, waiting for a slot in your active hours'}
                  {post.status === 'queued' && 'Scheduled in the extension queue'}
                  {post.status === 'failed' && `Failed: ${post.last_error || 'unknown error'}`}
                  {post.status === 'dismissed' && 'Skipped'}
                </span>
                {post.status === 'approved' && (
                  <Button size="sm" variant="ghost" onClick={onUnschedule}><Undo2 className="w-3 h-3 mr-1" /> Back to review</Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export default function CommentQueue({ initialFilter = 'pending', hidePending = false }: { initialFilter?: PostFilter; hidePending?: boolean } = {}) {
  const [filter, setFilter] = useState<PostFilter>(initialFilter);
  const { posts, isLoading, approve, dismiss, saveDraft, unschedule } = useMonitoredPosts(filter);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyOpportunities, setOnlyOpportunities] = useState(false);

  useEffect(() => {
    setTexts(prev => {
      const next = { ...prev };
      for (const p of posts) if (next[p.id] === undefined) next[p.id] = p.final_comment || p.suggested_comment || '';
      return next;
    });
  }, [posts]);
  useEffect(() => setSelected(new Set()), [filter]);

  const visible = useMemo(
    () => onlyOpportunities
      ? posts.filter(p => ['business_opportunity', 'hiring', 'pain_point'].includes(p.signal_type || ''))
      : posts,
    [posts, onlyOpportunities],
  );

  const editsFor = (ids: string[]) => {
    const edits: Record<string, string> = {};
    for (const id of ids) {
      const p = posts.find(x => x.id === id);
      const t = (texts[id] || '').trim();
      if (p && t && t !== (p.suggested_comment || '').trim()) edits[id] = t;
    }
    return edits;
  };

  const approveIds = async (ids: string[]) => {
    if (ids.length === 0) return;
    const empties = ids.filter(id => !(texts[id] || '').trim());
    if (empties.length) { toast.error('Some selected comments are empty'); return; }
    try {
      const n = await approve.mutateAsync({ ids, edits: editsFor(ids) });
      toast.success(`${n} comment${n === 1 ? '' : 's'} approved. They will be posted spaced out during your active hours.`);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not approve');
    }
  };

  const dismissIds = async (ids: string[]) => {
    try { await dismiss.mutateAsync(ids); setSelected(new Set()); } catch { toast.error('Could not skip'); }
  };

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSelected = visible.length > 0 && visible.every(p => selected.has(p.id));
  const busy = approve.isPending || dismiss.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Tabs value={filter} onValueChange={v => setFilter(v as PostFilter)}>
          <TabsList>
            {!hidePending && <TabsTrigger value="pending">To approve</TabsTrigger>}
            <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
            <TabsTrigger value="posted">Posted</TabsTrigger>
            <TabsTrigger value="dismissed">Skipped</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyOpportunities} onCheckedChange={v => setOnlyOpportunities(v === true)} />
          Only business signals
        </label>
      </div>

      {filter === 'pending' && visible.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2 rounded-xl border border-border bg-card/95 backdrop-blur px-4 py-2.5 sticky top-2 z-10 shadow-sm">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={v => setSelected(v === true ? new Set(visible.map(p => p.id)) : new Set())}
            />
            {selected.size > 0 ? `${selected.size} selected` : 'Select all'}
          </label>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={selected.size === 0 || busy} onClick={() => dismissIds(Array.from(selected))}>
              Skip selected
            </Button>
            <Button size="sm" className="h-10 font-semibold" disabled={selected.size === 0 || busy} onClick={() => approveIds(Array.from(selected))}>
              {approve.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {selected.size > 0 ? `Approve ${selected.size} selected` : 'Approve selected'}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <MessageSquareText className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filter === 'pending'
                ? 'Nothing to review right now. New posts from your ICPs are checked a few times a day.'
                : 'Nothing here yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {visible.map(p => (
            <PostCard
              key={p.id}
              post={p}
              mode={filter}
              selected={selected.has(p.id)}
              onToggle={() => toggle(p.id)}
              text={texts[p.id] ?? ''}
              onText={t => {
                setTexts(s => ({ ...s, [p.id]: t }));
              }}
              onApprove={() => approveIds([p.id])}
              onDismiss={() => dismissIds([p.id])}
              onUnschedule={() => unschedule.mutate(p.id)}
              busy={busy}
            />
          ))}
        </div>
      )}
      {filter === 'pending' && (
        <p className="text-xs text-muted-foreground">
          Nothing is posted without your approval. Approved comments go out spaced through your active hours, within your daily limit.
          {saveDraft.isPending ? ' Saving…' : ''}
        </p>
      )}
    </div>
  );
}
