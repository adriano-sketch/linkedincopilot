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
  business_opportunity: { label: 'Business opportunity', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  hiring: { label: 'Hiring', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  pain_point: { label: 'Pain point', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  launch: { label: 'Launch', className: 'bg-violet-100 text-violet-800 border-violet-200' },
  milestone: { label: 'Milestone', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  relationship: { label: 'Relationship', className: 'bg-slate-100 text-slate-700 border-slate-200' },
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

  return (
    <Card className={selected ? 'ring-2 ring-primary/40' : ''}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          {mode === 'pending' && <Checkbox checked={selected} onCheckedChange={onToggle} className="mt-1" aria-label="Select" />}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {post.author_profile_url ? (
                <a href={post.author_profile_url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                  {post.author_name || 'Unknown author'}
                </a>
              ) : <span className="font-medium">{post.author_name || 'Unknown author'}</span>}
              {post.author_degree && <span className="text-xs text-muted-foreground">• {post.author_degree}</span>}
              {post.posted_label && <span className="text-xs text-muted-foreground">• {post.posted_label}</span>}
              {signal && <Badge variant="outline" className={signal.className}>{signal.label}</Badge>}
            </div>
            {post.author_headline && <p className="text-xs text-muted-foreground line-clamp-1">{post.author_headline}</p>}
            {post.signal_reason && (post.signal_type === 'business_opportunity' || post.signal_type === 'hiring' || post.signal_type === 'pain_point') && (
              <p className="text-xs font-medium text-emerald-700">{post.signal_reason}</p>
            )}
          </div>
          {post.post_url && (
            <a href={post.post_url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open post">
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>

        <div className="rounded-md bg-muted/50 p-3 text-sm whitespace-pre-line">
          {shown}
          {longText && (
            <button className="block mt-1 text-xs text-primary hover:underline" onClick={() => setExpanded(e => !e)}>
              {expanded ? 'Show less' : 'Show full post'}
            </button>
          )}
        </div>

        {mode === 'pending' ? (
          <>
            <Textarea rows={3} value={text} onChange={e => onText(e.target.value)} className="text-sm" />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{text.length} characters</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={onDismiss} disabled={busy}><X className="w-4 h-4 mr-1" /> Skip</Button>
                <Button size="sm" onClick={onApprove} disabled={busy || !text.trim()}><Check className="w-4 h-4 mr-1" /> Approve</Button>
              </div>
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <p className="text-sm border-l-2 border-primary/40 pl-3">{post.final_comment || post.suggested_comment}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommentQueue() {
  const [filter, setFilter] = useState<PostFilter>('pending');
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
            <TabsTrigger value="pending">To approve</TabsTrigger>
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
        <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2 sticky top-2 z-10">
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
            <Button size="sm" disabled={selected.size === 0 || busy} onClick={() => approveIds(Array.from(selected))}>
              {approve.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Approve selected
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
        <div className="space-y-3">
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
