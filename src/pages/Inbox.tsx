import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { formatDistanceToNowStrict } from 'date-fns';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import AppShell from '@/components/app/AppShell';
import { useAuth } from '@/hooks/useAuth';
import { DISMISS_REASONS, useInbox, type DismissReason, type InboxItem } from '@/hooks/useInbox';
import { cn } from '@/lib/utils';
import { cleanPostUrl, isActivityUrl, openPostWithDraft } from '@/lib/commentHandoff';

type Filter = 'all' | 'signal';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'signal', label: 'Business signals' },
];

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

// Database errors are plain objects, not Error instances: show a readable line either way.
const errText = (e: unknown, fallback: string) => {
  const m = e instanceof Error ? e.message : (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '');
  return m && !/permission denied|violates|JWT/i.test(m) ? m : fallback;
};

export default function InboxPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { items, loading, failed, retry, approve, dismiss } = useInbox();

  const filter = (FILTERS.some(f => f.key === params.get('type')) ? params.get('type') : 'all') as Filter;
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [handled, setHandled] = useState<Set<string>>(new Set());
  // Comments whose post was already opened: the next step is to confirm it was posted.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [mobileDetail, setMobileDetail] = useState(false);
  // The comment whose skip reasons are showing. Skip opens them; a reason, or Skip again, closes the item.
  const [reasonsFor, setReasonsFor] = useState<string | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (!authLoading && !user) navigate('/'); }, [user, authLoading, navigate]);

  const open = useMemo(() => items.filter(i => !handled.has(i.key)), [items, handled]);
  const visible = useMemo(() => open.filter(i =>
    filter === 'signal' ? !!i.signal : true), [open, filter]);
  const current = visible.find(i => i.key === selectedKey) || visible[0] || null;
  const busy = approve.isPending || dismiss.isPending;

  const countOf = (f: Filter) => open.filter(i => f === 'signal' ? !!i.signal : true).length;
  const minutes = Math.max(1, Math.round(open.length * 0.4));

  const textOf = (i: InboxItem) => edits[i.key] ?? i.draft;

  const advanceFrom = (key: string) => {
    const idx = visible.findIndex(i => i.key === key);
    const next = visible[idx + 1] || visible[idx - 1] || null;
    setSelectedKey(next ? next.key : null);
    if (!next) setMobileDetail(false);
  };
  const hide = (keys: string[]) => setHandled(prev => { const n = new Set(prev); keys.forEach(k => n.add(k)); return n; });
  const unhide = (keys: string[]) => setHandled(prev => { const n = new Set(prev); keys.forEach(k => n.delete(k)); return n; });

  // Comments are posted by the person on LinkedIn. Olanovo copies the draft and opens the post.
  const doOpenPost = async (item: InboxItem) => {
    if (!textOf(item).trim()) { toast.error('The text is empty'); return; }
    const { copied } = await openPostWithDraft(item.postUrl, textOf(item));
    setOpened(prev => new Set(prev).add(item.key));
    if (copied) toast.success('Comment copied. Paste it on the post, click Comment on LinkedIn, then confirm here.');
    else toast.error('Could not copy automatically. Select the draft and copy it, then paste it on the post.');
  };

  const doApprove = async (item: InboxItem) => {
    if (!textOf(item).trim()) { toast.error('The text is empty'); return; }
    if (!opened.has(item.key)) return doOpenPost(item);
    advanceFrom(item.key);
    hide([item.key]);
    try {
      await approve.mutateAsync({ items: [item], edits });
      toast.success('Recorded as posted.');
    } catch (e) {
      unhide([item.key]);
      toast.error(errText(e, 'Could not record it. Try again.'));
    }
  };

  // Skip on a comment first offers the reasons (one click each). Skip again skips without a reason.
  const doSkip = (item: InboxItem) => {
    if (reasonsFor !== item.key) { setReasonsFor(item.key); return; }
    return doSecondary(item);
  };

  const doSecondary = async (item: InboxItem, reason: DismissReason | null = null) => {
    setReasonsFor(null);
    advanceFrom(item.key);
    hide([item.key]);
    try {
      await dismiss.mutateAsync({ item, reason });
      toast.success(reason ? 'Skipped. Olanovo will take that into account.' : 'Skipped');
    } catch (e) {
      unhide([item.key]);
      toast.error(errText(e, 'Something went wrong. Try again.'));
    }
  };

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
      const showing = reasonsFor === current.key;
      if (showing && e.key === 'Escape') { e.preventDefault(); setReasonsFor(null); return; }
      if (showing && !busy && /^[1-4]$/.test(e.key)) { e.preventDefault(); doSecondary(current, DISMISS_REASONS[Number(e.key) - 1].key); return; }
      const idx = visible.findIndex(i => i.key === current.key);
      if (e.key === 'j') { e.preventDefault(); const n = visible[idx + 1]; if (n) setSelectedKey(n.key); }
      else if (e.key === 'k') { e.preventDefault(); const p = visible[idx - 1]; if (p) setSelectedKey(p.key); }
      else if (e.key === 'a' && !busy) { e.preventDefault(); doApprove(current); }
      else if (e.key === 's' && !busy) { e.preventDefault(); doSkip(current); }
      else if (e.key === 'e') { e.preventDefault(); editorRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const setFilter = (f: Filter) => { setParams(f === 'all' ? {} : { type: f }, { replace: true }); setSelectedKey(null); };

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display font-extrabold text-4xl leading-none m-0">Inbox{countOf('all') > 0 && <span className="text-attention"> {countOf('all')}</span>}</h1>
            <p className="text-muted-foreground m-0 mt-1.5">
              {loading ? 'Loading…' : failed ? 'Your Inbox could not be loaded.' : open.length === 0 ? 'You are all caught up.'
                : `${open.length} to review. About ${minutes} min.`}
            </p>
          </div>
          <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => {
              const active = filter === f.key;
              const n = countOf(f.key);
              return (
                <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={active}
                  className={cn('h-10 px-3.5 rounded-full border text-sm transition-colors',
                    active ? 'bg-primary text-primary-foreground border-primary font-semibold' : 'bg-card border-border hover:border-foreground/30')}>
                  {f.label} <span className={cn('tabular-nums', active ? 'text-primary-foreground/80' : n > 0 ? 'text-attention font-semibold' : 'text-muted-foreground')}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden flex min-h-[620px]">
          {/* List */}
          <div className={cn('w-full lg:w-[380px] lg:shrink-0 lg:border-r border-border bg-[hsl(var(--section-white))] flex flex-col',
            mobileDetail ? 'hidden lg:flex' : 'flex')}>
            {loading ? (
              <div className="flex-1 grid place-items-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : failed ? (
              <div className="flex-1 grid place-items-center p-8 text-center" role="alert">
                <div className="flex flex-col items-center gap-2 max-w-xs">
                  <div className="font-semibold text-lg">Could not load your Inbox</div>
                  <p className="m-0 text-sm text-muted-foreground">Nothing was lost. Check your connection and try again.</p>
                  <button onClick={() => retry()} className="text-gold-dark font-medium mt-1">Try again</button>
                </div>
              </div>
            ) : visible.length === 0 ? (
              <EmptyState filtered={open.length > 0} onShowAll={() => setFilter('all')} />
            ) : (
              <ul className="list-none m-0 p-0 overflow-y-auto flex-1">
                {visible.map(i => {
                  const active = current?.key === i.key;
                  return (
                    <li key={i.key} className={cn('flex items-start gap-2 border-b border-border/70 pl-3', active ? 'bg-card shadow-[inset_3px_0_0_hsl(var(--primary))]' : 'hover:bg-card/70')}>
                      <button onClick={() => { setSelectedKey(i.key); setMobileDetail(true); }}
                        className="flex-1 min-w-0 flex gap-3 py-3.5 pl-1 pr-4 text-left">
                        <Avatar text={i.initials} size={38} />
                        <span className="flex-1 min-w-0">
                          <span className="flex justify-between gap-2">
                            <span className="font-semibold truncate">{i.name}</span>
                            <span className="font-mono text-[11px] text-muted-foreground shrink-0">{ago(i.at)}</span>
                          </span>
                          <span className="flex items-center gap-1.5 my-0.5">
                            <span className="text-[11px] font-semibold px-2 py-px rounded-full bg-secondary text-foreground/80">Comment</span>
                            {i.signal && <span className="text-[11px] font-semibold text-[#A01268] truncate">● {i.signal}</span>}
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
                  <div className="flex gap-3 text-sm">
                    {current.postUrl && <a href={cleanPostUrl(current.postUrl)} target="_blank" rel="noreferrer" className="text-gold-dark font-medium inline-flex items-center gap-1">Post<ExternalLink className="w-3.5 h-3.5" /></a>}
                    {current.profileUrl && <a href={current.profileUrl} target="_blank" rel="noreferrer" className="text-gold-dark font-medium inline-flex items-center gap-1">Profile<ExternalLink className="w-3.5 h-3.5" /></a>}
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-4 flex flex-col gap-2.5">
                  <div className="font-mono-label text-[11px] text-muted-foreground">{current.contextLabel}</div>
                  <div className="text-[15px] leading-relaxed whitespace-pre-line">{current.context}</div>
                  {current.signal && (
                    <div className="text-[13px] font-semibold text-[#A01268] bg-gold-bg rounded-lg px-3 py-2">
                      {current.signal}{current.signalWhy ? `: ${current.signalWhy}` : ''}
                    </div>
                  )}
                </div>

                <label className="flex flex-col gap-2 text-[13px] font-medium text-muted-foreground">
                  <span className="flex justify-between">Draft comment<span className="tabular-nums font-normal">{textOf(current).length} characters</span></span>
                  <textarea ref={editorRef} rows={5} value={textOf(current)}
                    onChange={e => setEdits(prev => ({ ...prev, [current.key]: e.target.value }))}
                    className="w-full rounded-xl border-2 border-primary bg-card px-4 py-3 text-base leading-relaxed text-foreground resize-y focus:outline-none focus:ring-2 focus:ring-ring" />
                  <span className="font-normal">Change it here, before copying. Olanovo learns from your edits; changes made on LinkedIn are not seen.</span>
                </label>
                {current.why && <p className="text-[13px] text-muted-foreground m-0 flex gap-2"><Sparkles className="w-4 h-4 shrink-0 text-gold-dark" />{current.why}</p>}

                <div className="flex flex-wrap items-center gap-2.5">
                  <button onClick={() => doApprove(current)} disabled={busy}
                    className="h-12 px-5 rounded-full font-semibold inline-flex items-center gap-2.5 disabled:opacity-60 bg-primary text-primary-foreground hover:bg-gold-dark">
                    {opened.has(current.key) ? 'I posted it' : 'Copy and open post'}
                    <kbd className="font-mono text-[11px] rounded px-1.5 py-0.5 bg-white/20 text-white">A</kbd>
                  </button>
                  {opened.has(current.key) && (
                    <button onClick={() => doOpenPost(current)} disabled={busy}
                      className="h-12 px-5 rounded-full border border-foreground/70 bg-card font-semibold inline-flex items-center gap-2 disabled:opacity-60">
                      Copy and open again<ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => doSkip(current)} disabled={busy}
                    aria-expanded={reasonsFor === current.key}
                    className="h-12 px-5 rounded-full border border-foreground/70 bg-card font-semibold inline-flex items-center gap-2.5 disabled:opacity-60">
                    {reasonsFor === current.key ? 'Skip without a reason' : 'Skip'}
                    <kbd className="font-mono text-[11px] bg-secondary rounded px-1.5 py-0.5">S</kbd>
                  </button>
                  <span className="ml-auto hidden md:inline text-xs text-muted-foreground">J / K to move · E to edit · A for the main action</span>
                </div>
                {reasonsFor === current.key && (
                  <div role="group" aria-label="Why are you skipping this draft?" className="rounded-xl border border-border bg-background/60 p-3.5 flex flex-col gap-2.5">
                    <div className="text-[13px] font-medium">Why are you skipping it? One click, and Olanovo writes fewer drafts like this.</div>
                    <div className="flex flex-wrap gap-2">
                      {DISMISS_REASONS.map((r, n) => (
                        <button key={r.key} onClick={() => doSecondary(current, r.key)} disabled={busy}
                          className="h-10 px-3.5 rounded-full border border-border bg-card text-sm font-medium inline-flex items-center gap-2 hover:border-foreground/40 disabled:opacity-60">
                          {r.label}<kbd className="font-mono text-[11px] bg-secondary rounded px-1.5 py-0.5">{n + 1}</kbd>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <p className="m-0 text-[13px] text-muted-foreground">
                  {opened.has(current.key)
                    ? 'Paste the comment on the post and click Comment on LinkedIn. Then confirm here with "I posted it".'
                    : 'You post every comment yourself: Olanovo copies the draft and opens the post, you paste it and click Comment on LinkedIn.'}
                  {isActivityUrl(current.postUrl) && ` The link opens ${current.name.split(' ')[0]}'s recent activity; the post is the one shown above.`}
                </p>
              </>
            ) : (
              <div className="m-auto text-center text-muted-foreground max-w-sm">
                {loading ? 'Loading…' : 'Nothing selected.'}
              </div>
            )}
          </section>
        </div>
        <p className="text-xs text-muted-foreground m-0">
          You post each comment yourself on LinkedIn. Olanovo never posts or sends a message for you.
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
          Comment drafts land here a few times a day while autopilot runs.
        </p>
        <div className="flex gap-4 text-sm mt-1">
          <Link to="/dashboard?new=1" className="text-gold-dark font-medium">New list</Link>
          <Link to="/network?tab=icps" className="text-gold-dark font-medium">Describe an audience</Link>
        </div>
      </div>
    </div>
  );
}
