import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import AppShell from '@/components/app/AppShell';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useInbox, type InboxItem, type InboxKind } from '@/hooks/useInbox';
import { cn } from '@/lib/utils';

type Filter = 'all' | InboxKind | 'signal';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reply', label: 'Replies' },
  { key: 'comment', label: 'Comments' },
  { key: 'message', label: 'Messages' },
  { key: 'signal', label: 'Business signals' },
];
const KIND_LABEL: Record<InboxKind, string> = { reply: 'Reply', comment: 'Comment', message: 'Message' };
const APPROVE_LABEL: Record<InboxKind, string> = { reply: 'Mark as handled', comment: 'Approve comment', message: 'Approve message' };
const SECONDARY_LABEL: Record<InboxKind, string | null> = { reply: null, comment: 'Skip', message: 'Write a new draft' };
const EDITOR_LABEL: Record<InboxKind, string> = { reply: '', comment: 'Suggested comment', message: 'Suggested first message' };

const ago = (iso: string | null) => {
  if (!iso) return '';
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: false }).replace(/ (seconds?|minutes?)/, 'm').replace(/ hours?/, 'h').replace(/ days?/, 'd').replace(/ months?/, 'mo'); } catch { return ''; }
};

function Avatar({ text, size = 40 }: { text: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-full bg-navy text-primary grid place-items-center font-semibold" style={{ width: size, height: size, fontSize: size < 44 ? 13 : 15 }}>
      {text}
    </div>
  );
}

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { items, loading, approve, dismiss } = useInbox();

  const filter = (FILTERS.some(f => f.key === params.get('type')) ? params.get('type') : 'all') as Filter;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [mobileDetail, setMobileDetail] = useState(false);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!authLoading && !user) navigate('/'); }, [user, authLoading, navigate]);

  const open = useMemo(() => items.filter(i => !handled.has(i.key)), [items, handled]);
  const visible = useMemo(() => open.filter(i =>
    filter === 'all' ? true : filter === 'signal' ? !!i.signal : i.kind === filter), [open, filter]);
  const current = visible.find(i => i.key === selectedKey) || visible[0] || null;
  const busy = approve.isPending || dismiss.isPending;

  const countOf = (f: Filter) => open.filter(i => f === 'all' ? true : f === 'signal' ? !!i.signal : i.kind === f).length;
  const minutes = Math.max(1, Math.round(open.length * 0.4));
  const replies = countOf('reply');

  const textOf = (i: InboxItem) => edits[i.key] ?? i.draft;

  const advanceFrom = (key: string) => {
    const idx = visible.findIndex(i => i.key === key);
    const next = visible[idx + 1] || visible[idx - 1] || null;
    setSelectedKey(next ? next.key : null);
    if (!next) setMobileDetail(false);
  };
  const hide = (keys: string[]) => setHandled(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; });
  const unhide = (keys: string[]) => setHandled(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });

  const doApprove = async (item: InboxItem) => {
    if (item.kind === 'reply') return doSecondary(item);
    if (!textOf(item).trim()) { toast.error('The text is empty'); return; }
    advanceFrom(item.key);
    hide([item.key]);
    try {
      await approve.mutateAsync({ items: [item], edits });
      toast.success(item.kind === 'comment' ? 'Approved. It will be posted during your active hours.' : 'Approved. The message goes out in the next business hour.');
    } catch (e) {
      unhide([item.key]);
      toast.error(e instanceof Error ? e.message : 'Could not approve');
    }
  };

  const doSecondary = async (item: InboxItem) => {
    advanceFrom(item.key);
    hide([item.key]);
    try {
      await dismiss.mutateAsync(item);
      toast.success(item.kind === 'comment' ? 'Skipped' : item.kind === 'message' ? 'A new draft is being written' : 'Marked as handled');
    } catch (e) {
      unhide([item.key]);
      toast.error(e instanceof Error ? e.message : 'Something went wrong');
    }
  };

  const bulkItems = visible.filter(i => checked.has(i.key) && i.kind !== 'reply');
  const doBulkApprove = async () => {
    const empty = bulkItems.filter(i => !textOf(i).trim());
    if (empty.length) { toast.error('Some selected drafts are empty'); return; }
    const keys = bulkItems.map(i => i.key);
    hide(keys);
    setChecked(new Set());
    try {
      const n = await approve.mutateAsync({ items: bulkItems, edits });
      toast.success(`${n} approved. They go out spaced through your active hours.`);
    } catch (e) {
      unhide(keys);
      toast.error(e instanceof Error ? e.message : 'Could not approve');
    }
  };
  const selectable = visible.filter(i => i.kind !== 'reply');
  const allChecked = selectable.length > 0 && selectable.every(i => checked.has(i.key));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(selectable.map(i => i.key)));

  // Keyboard: J/K move, A approve, S skip / secondary, E edit, Cmd+Enter approve while editing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === 'TEXTAREA' || (e.target as HTMLElement)?.tagName === 'INPUT';
      if (!current) return;
      if (typing) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doApprove(current); }
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const idx = visible.findIndex(i => i.key === current.key);
      if (e.key === 'j') { e.preventDefault(); const n = visible[idx + 1]; if (n) setSelectedKey(n.key); }
      else if (e.key === 'k') { e.preventDefault(); const p = visible[idx - 1]; if (p) setSelectedKey(p.key); }
      else if (e.key === 'a' && !busy) { e.preventDefault(); doApprove(current); }
      else if (e.key === 's' && !busy && current.kind === 'comment') { e.preventDefault(); doSecondary(current); }
      else if (e.key === 'e' && current.kind !== 'reply') { e.preventDefault(); editorRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const setFilter = (f: Filter) => { setParams(f === 'all' ? {} : { type: f }, { replace: true }); setSelectedKey(null); setChecked(new Set()); };

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-bold uppercase text-4xl leading-none m-0">Inbox</h1>
            <p className="text-muted-foreground m-0 mt-1.5">
              {loading ? 'Loading…' : open.length === 0 ? 'You are all caught up.'
                : `${open.length} to review${replies ? `, ${replies} ${replies === 1 ? 'reply is' : 'replies are'} waiting on you` : ''}. About ${minutes} min.`}
            </p>
          </div>
          <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => {
              const active = filter === f.key;
              const n = countOf(f.key);
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={active}
                  className={cn('h-10 px-3.5 rounded-full border text-sm transition-colors',
                    active ? 'bg-navy text-background border-navy font-semibold' : 'bg-card border-border hover:border-foreground/30')}>
                  {f.label} <span className={cn('tabular-nums', active ? 'text-primary' : 'text-muted-foreground')}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden flex min-h-[620px]">
          {/* List */}
          <div className={cn('w-full lg:w-[380px] lg:shrink-0 lg:border-r border-border bg-[hsl(var(--section-white))] flex flex-col',
            mobileDetail ? 'hidden lg:flex' : 'flex')}>
            {selectable.length > 0 && (
              <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-border">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} aria-label="Select all drafts shown" />
                  {checked.size > 0 ? `${bulkItems.length} selected` : 'Select all'}
                </label>
                {bulkItems.length > 0 && (
                  <button onClick={doBulkApprove} disabled={busy}
                    className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-60">
                    Approve {bulkItems.length}
                  </button>
                )}
              </div>
            )}
            {loading ? (
              <div className="flex-1 grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : visible.length === 0 ? (
              <EmptyState filtered={open.length > 0} onShowAll={() => setFilter('all')} />
            ) : (
              <ul className="list-none m-0 p-0 overflow-y-auto flex-1">
                {visible.map(i => {
                  const active = current?.key === i.key;
                  return (
                    <li key={i.key} className={cn('flex items-start gap-2 border-b border-border/70 pl-3', active ? 'bg-card shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-card/70')}>
                      {i.kind !== 'reply' ? (
                        <Checkbox className="mt-[22px]" checked={checked.has(i.key)} aria-label={`Select ${i.name}`}
                          onCheckedChange={v => setChecked(prev => { const n = new Set(prev); if (v === true) n.add(i.key); else n.delete(i.key); return n; })} />
                      ) : <span className="w-4 shrink-0" />}
                      <button onClick={() => { setSelectedKey(i.key); setMobileDetail(true); }}
                        className="flex-1 min-w-0 flex gap-3 py-3.5 pr-4 text-left">
                        <Avatar text={i.initials} size={38} />
                        <span className="flex-1 min-w-0">
                          <span className="flex justify-between gap-2">
                            <span className="font-semibold truncate">{i.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground shrink-0">{ago(i.at)}</span>
                          </span>
                          <span className="flex items-center gap-1.5 my-0.5">
                            <span className={cn('text-[11px] font-semibold px-2 py-px rounded-full', i.kind === 'reply' ? 'bg-navy text-primary' : 'bg-secondary text-foreground/80')}>{KIND_LABEL[i.kind]}</span>
                            {i.signal && <span className="text-[11px] font-semibold text-[#7A4B00] truncate">● {i.signal}</span>}
                          </span>
                          <span className="block text-[13px] text-muted-foreground truncate">{i.preview}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          <section className={cn('flex-1 min-w-0 p-5 sm:p-7 flex-col gap-5', mobileDetail ? 'flex' : 'hidden lg:flex')}>
            {current ? (
              <>
                <button className="lg:hidden self-start inline-flex items-center gap-1.5 text-sm text-muted-foreground -mt-1" onClick={() => setMobileDetail(false)}>
                  <ArrowLeft className="w-4 h-4" />Back to list
                </button>
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar text={current.initials} size={48} />
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-semibold text-lg">{current.name}</div>
                    {current.headline && <div className="text-sm text-muted-foreground">{current.headline}</div>}
                  </div>
                  {current.campaign && <span className="text-xs font-medium bg-background border border-border rounded-full px-2.5 py-1">{current.campaign}</span>}
                  <div className="flex gap-3 text-sm">
                    {current.postUrl && <a href={current.postUrl} target="_blank" rel="noreferrer" className="text-gold-dark font-medium inline-flex items-center gap-1">Post<ExternalLink className="w-3.5 h-3.5" /></a>}
                    {current.profileUrl && <a href={current.profileUrl} target="_blank" rel="noreferrer" className="text-gold-dark font-medium inline-flex items-center gap-1">Profile<ExternalLink className="w-3.5 h-3.5" /></a>}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-4 flex flex-col gap-2.5">
                  <div className="font-mono-label text-[11px] text-muted-foreground">{current.contextLabel}</div>
                  <div className="text-[15px] leading-relaxed whitespace-pre-line">{current.context}</div>
                  {current.signal && (
                    <div className="text-[13px] font-semibold text-[#7A4B00] bg-gold-bg rounded-lg px-3 py-2">
                      {current.signal}{current.signalWhy ? `: ${current.signalWhy}` : ''}
                    </div>
                  )}
                </div>

                {current.kind !== 'reply' && (
                  <label className="flex flex-col gap-2 text-[13px] font-medium text-muted-foreground">
                    <span className="flex justify-between">{EDITOR_LABEL[current.kind]}<span className="tabular-nums font-normal">{textOf(current).length} characters</span></span>
                    <textarea ref={editorRef} rows={5} value={textOf(current)}
                      onChange={e => setEdits(prev => ({ ...prev, [current.key]: e.target.value }))}
                      className="w-full rounded-xl border-[1.5px] border-[#C99526] bg-card px-4 py-3 text-base leading-relaxed text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
                  </label>
                )}
                {current.why && <p className="text-[13px] text-muted-foreground m-0 flex gap-2"><Sparkles className="w-4 h-4 shrink-0 text-gold-dark" />{current.why}</p>}

                <div className="flex flex-wrap items-center gap-2.5">
                  {current.kind === 'reply' && current.profileUrl && (
                    <a href="https://www.linkedin.com/messaging/" target="_blank" rel="noreferrer"
                      className="h-12 px-5 rounded-xl bg-navy text-background font-semibold inline-flex items-center gap-2">
                      Answer on LinkedIn<ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  <button onClick={() => doApprove(current)} disabled={busy}
                    className={cn('h-12 px-5 rounded-xl font-semibold inline-flex items-center gap-2.5 disabled:opacity-60',
                      current.kind === 'reply' ? 'border border-border bg-card' : 'bg-navy text-background')}>
                    {current.kind === 'reply' && <CheckCircle2 className="w-4 h-4" />}
                    {APPROVE_LABEL[current.kind]}
                    <kbd className={cn('font-mono text-[11px] rounded px-1.5 py-0.5', current.kind === 'reply' ? 'bg-secondary' : 'bg-navy-light text-slate-300')}>A</kbd>
                  </button>
                  {SECONDARY_LABEL[current.kind] && (
                    <button onClick={() => doSecondary(current)} disabled={busy}
                      className="h-12 px-4 rounded-xl border border-border bg-card font-medium inline-flex items-center gap-2.5 disabled:opacity-60">
                      {current.kind === 'message' && <RefreshCw className="w-4 h-4" />}
                      {SECONDARY_LABEL[current.kind]}
                      {current.kind === 'comment' && <kbd className="font-mono text-[11px] bg-secondary rounded px-1.5 py-0.5">S</kbd>}
                    </button>
                  )}
                  <span className="ml-auto hidden md:inline text-xs text-muted-foreground">J / K to move · E to edit · ⌘↵ to approve</span>
                </div>
              </>
            ) : (
              <div className="m-auto text-center text-muted-foreground max-w-sm">
                {loading ? 'Loading…' : 'Nothing selected.'}
              </div>
            )}
          </section>
        </div>
        <p className="text-xs text-muted-foreground m-0">
          Nothing goes out without your approval. Approved comments and messages are sent spaced through your active hours, within your daily limits.
        </p>
      </div>
    </AppShell>
  );
}

function EmptyState({ filtered, onShowAll }: { filtered: boolean; onShowAll: () => void }) {
  if (filtered) {
    return (
      <div className="flex-1 grid place-items-center p-8 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="m-0 text-muted-foreground">Nothing in this view.</p>
          <button onClick={onShowAll} className="text-gold-dark font-medium">Show everything</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex-1 grid place-items-center p-8 text-center">
      <div className="flex flex-col items-center gap-2 max-w-xs">
        <CheckCircle2 className="w-10 h-10 text-success" />
        <div className="font-semibold text-lg">All clear</div>
        <p className="m-0 text-sm text-muted-foreground">
          Replies, comment drafts and first messages land here a few times a day while autopilot runs.
        </p>
        <div className="flex gap-4 text-sm mt-1">
          <Link to="/dashboard?new=1" className="text-gold-dark font-medium">New campaign</Link>
          <Link to="/network?tab=icps" className="text-gold-dark font-medium">Set up an ICP</Link>
        </div>
      </div>
    </div>
  );
}
