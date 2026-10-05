import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { ArrowRight, Check, Circle, ExternalLink, Sparkles } from 'lucide-react';
import AppShell from '@/components/app/AppShell';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExtensionStatus } from '@/hooks/useExtensionStatus';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type Summary = {
  timezone: string;
  inbox: { replies: number; comments: number; messages: number; signals: number };
  top_reply: { name: string; text: string | null; intent: string | null; at: string | null } | null;
  opportunities: { id: string; name: string | null; headline: string | null; signal: string; why: string | null; post_url: string | null; status: string; at: string }[];
  plan: { type: string; count: number; next_at: string }[];
  limits: { invites_week: number; invite_limit: number; comments_today: number; comment_limit: number; searches_month: number; search_budget: number };
  week: { new_connections: number; invites: number; replies: number; positive_replies: number; comments_posted: number; opportunities: number };
  campaigns: { id: string; name: string; mode: string; status: string; people: number; connected: number; replied: number; engaged: number }[];
  network_active: boolean;
  contacts: number;
};

const PLAN_LABEL: Record<string, string> = {
  send_connection_request: 'Send connection requests',
  send_dm: 'Send approved first messages',
  send_followup: 'Send follow-ups',
  post_comment: 'Post approved comments',
  like_post: 'Like posts',
  find_latest_post: 'Check people for new posts',
  visit_profile: 'Visit profiles',
  follow_profile: 'Follow profiles',
  check_connection_status: 'Check who accepted',
  check_reply_status: 'Check for replies',
  network_search_people: 'Search LinkedIn for people who fit',
  network_search_posts: 'Look for fresh posts in your ICPs',
  network_sync_connections: 'Sync accepted invites',
  network_withdraw_invites: 'Withdraw stale invites',
};
const SIGNAL_LABEL: Record<string, string> = { business_opportunity: 'Business signal', hiring: 'Hiring', pain_point: 'Pain point' };
const MODE_LABEL: Record<string, string> = { growth: 'Stay top of mind', outreach: 'Start conversations', network: 'Grow my network' };

function useTodaySummary() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['today-summary', user?.id],
    enabled: !!user,
    refetchInterval: 60000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('today_summary');
      if (error) throw error;
      return data as Summary;
    },
  });
}

const timeIn = (iso: string, tz: string) => {
  try { return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(new Date(iso)); }
  catch { return ''; }
};
const ago = (iso: string | null) => { if (!iso) return ''; try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true }); } catch { return ''; } };

function Gauge({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="font-display text-[28px] font-semibold leading-tight tabular-nums">{value}<span className="text-slate-500 text-lg">/{max}</span></div>
      <div className="h-1 rounded bg-[#22304A]"><div className={cn('h-1 rounded', pct >= 90 ? 'bg-amber-400' : 'bg-primary')} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function NeedCard({ to, chip, chipStrong, title, body, cta, minutes }: { to: string; chip: string; chipStrong?: boolean; title: string; body: string; cta: string; minutes?: string }) {
  return (
    <Link to={to} className="group rounded-2xl border border-border bg-card p-5 flex flex-col gap-2.5 hover:border-foreground/30 hover:shadow-elevated transition-all">
      <div className="flex justify-between items-center">
        <span className={cn('text-[13px] font-semibold px-2.5 py-1 rounded-full', chipStrong ? 'bg-gold-bg text-[#7A4B00]' : 'bg-secondary')}>{chip}</span>
        {minutes && <span className="font-mono-label text-[11px] text-muted-foreground">{minutes}</span>}
      </div>
      <div className="font-semibold text-[17px] leading-snug">{title}</div>
      <div className="text-sm text-muted-foreground line-clamp-3">{body}</div>
      <div className="mt-auto pt-1 font-semibold text-gold-dark inline-flex items-center gap-1.5">{cta}<ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" /></div>
    </Link>
  );
}

export default function Today() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { extensionStatus } = useExtensionStatus();
  const { data: s, isLoading, isError } = useTodaySummary();

  useEffect(() => { if (!authLoading && !user) navigate('/'); }, [user, authLoading, navigate]);

  const tz = s?.timezone || 'America/New_York';
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(now));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = ((profile as any)?.sender_name || user?.email?.split('@')[0] || '').split(/[\s._]/)[0];
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz }).format(now);

  const needs = s ? s.inbox.replies + s.inbox.comments + s.inbox.messages : 0;
  const minutes = Math.max(1, Math.round(needs * 0.4));
  const groupsNeeding = s ? [s.inbox.replies, s.inbox.comments, s.inbox.messages].filter(n => n > 0).length : 0;

  const extensionReady = !!extensionStatus && !!extensionStatus.last_heartbeat_at;
  const hasRunningCampaign = !!s?.campaigns.some(c => c.status === 'active');
  const steps = [
    { done: extensionReady, label: 'Install the Chrome extension and log in', to: '/setup-guide' },
    { done: hasRunningCampaign, label: 'Launch your first campaign', to: '/dashboard?new=1' },
    { done: !!s?.network_active, label: 'Describe an ICP so Copilot can grow your network', to: '/network?tab=icps' },
    { done: (s?.contacts || 0) > 0, label: 'Import your LinkedIn contacts', to: '/dashboard?new=1' },
  ];
  const setupDone = steps.filter(x => x.done).length;
  const showSetup = !!s && setupDone < steps.length;

  return (
    <AppShell>
      <div className="flex flex-col gap-7 max-w-[1180px]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="font-mono-label text-xs text-gold-dark">{dateLabel}</div>
            <h1 className="font-display font-bold uppercase text-4xl sm:text-[44px] leading-none m-0 mt-1">{greeting}{name ? `, ${name}` : ''}</h1>
            <p className="text-muted-foreground text-[17px] m-0 mt-2">
              {isLoading ? 'Getting your briefing…'
                : needs > 0 ? <><strong className="text-foreground">{groupsNeeding === 1 ? '1 thing needs' : `${groupsNeeding} things need`} you</strong>, about {minutes} min.</>
                : showSetup ? 'A few steps and your copilot is flying.'
                : 'Nothing needs you right now. Autopilot keeps working.'}
            </p>
          </div>
          {needs > 0 && (
            <Link to="/inbox" className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground font-semibold h-12 px-5 hover:bg-gold-light">
              Start review<ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        {isError && <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">Could not load your briefing. It refreshes every minute.</div>}

        {isLoading ? (
          <div className="grid gap-3.5 md:grid-cols-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-44 rounded-2xl" />)}</div>
        ) : s && (
          <>
            {showSetup && (
              <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="m-0 text-lg font-semibold">Get set up</h2>
                  <span className="text-sm text-muted-foreground tabular-nums">{setupDone} of {steps.length} done</span>
                </div>
                <div className="h-1.5 rounded bg-secondary"><div className="h-1.5 rounded bg-primary" style={{ width: `${(setupDone / steps.length) * 100}%` }} /></div>
                <ol className="list-none m-0 p-0 grid sm:grid-cols-2 gap-2">
                  {steps.map(step => (
                    <li key={step.label}>
                      <Link to={step.to} className={cn('flex items-center gap-3 rounded-xl px-3 py-3 border', step.done ? 'border-transparent text-muted-foreground' : 'border-border hover:border-foreground/30 bg-background/50')}>
                        {step.done ? <Check className="w-5 h-5 text-success shrink-0" /> : <Circle className="w-5 h-5 text-muted-foreground shrink-0" />}
                        <span className={cn('flex-1', step.done && 'line-through')}>{step.label}</span>
                        {!step.done && <ArrowRight className="w-4 h-4 text-gold-dark" />}
                      </Link>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {needs > 0 && (
              <section aria-label="Needs you" className="grid gap-3.5 md:grid-cols-3">
                {s.inbox.replies > 0 && (
                  <NeedCard to="/inbox?type=reply" chipStrong chip={`${s.inbox.replies} ${s.inbox.replies === 1 ? 'reply' : 'replies'}`} minutes="Priority"
                    title={s.top_reply ? `${s.top_reply.name || 'Someone'} wrote back` : 'People wrote back'}
                    body={s.top_reply?.text ? `"${s.top_reply.text}"` : 'Open the conversation and answer while it is warm.'}
                    cta="Reply now" />
                )}
                {s.inbox.comments > 0 && (
                  <NeedCard to="/inbox?type=comment" chip={`${s.inbox.comments} ${s.inbox.comments === 1 ? 'comment' : 'comments'}`} minutes={`~${Math.max(1, Math.round(s.inbox.comments * 0.4))} min`}
                    title="Comments drafted on fresh posts"
                    body={s.inbox.signals > 0 ? `${s.inbox.signals} of them show a business signal. Fresh posts are the best window to be seen.` : 'Fresh posts are the best window to be seen.'}
                    cta="Review comments" />
                )}
                {s.inbox.messages > 0 && (
                  <NeedCard to="/inbox?type=message" chip={`${s.inbox.messages} ${s.inbox.messages === 1 ? 'message' : 'messages'}`} minutes={`~${Math.max(1, Math.round(s.inbox.messages * 0.4))} min`}
                    title="New connections ready for a first message"
                    body="They accepted your invite. Each draft references their profile."
                    cta="Review messages" />
                )}
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2 items-start">
              <section className="rounded-2xl border border-border bg-card p-5 sm:p-6 flex flex-col">
                <div className="flex justify-between items-baseline mb-2">
                  <h2 className="m-0 text-lg font-semibold">Opportunities spotted</h2>
                  <span className="text-xs text-muted-foreground">Last 7 days</span>
                </div>
                {s.opportunities.length === 0 ? (
                  <p className="m-0 py-6 text-sm text-muted-foreground">
                    No buying signals yet. When someone in your ICPs posts about hiring, a problem or a vendor search, it shows up here.
                    {!s.network_active && <> <Link to="/network?tab=icps" className="text-gold-dark font-medium">Set up an ICP</Link> to start.</>}
                  </p>
                ) : s.opportunities.map(o => (
                  <div key={o.id} className="flex gap-3 py-3 border-t border-border/70 first-of-type:border-t-0">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-navy text-primary grid place-items-center text-sm font-semibold">
                      {(o.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{o.name || 'Unknown'}{o.headline && <span className="font-normal text-muted-foreground"> · {o.headline}</span>}</div>
                      {o.why && <div className="text-sm text-foreground/80">{o.why}</div>}
                      <div className="text-xs font-semibold text-[#7A4B00] mt-1">{(SIGNAL_LABEL[o.signal] || 'Signal').toUpperCase()} · {ago(o.at)}</div>
                    </div>
                    {o.status === 'pending' ? (
                      <Link to="/inbox?type=signal" className="self-center text-sm font-semibold text-gold-dark whitespace-nowrap">Comment</Link>
                    ) : o.post_url ? (
                      <a href={o.post_url} target="_blank" rel="noreferrer" aria-label="Open post" className="self-center text-muted-foreground hover:text-foreground"><ExternalLink className="w-4 h-4" /></a>
                    ) : null}
                  </div>
                ))}
              </section>

              <section className="rounded-2xl bg-navy text-slate-200 p-5 sm:p-6 flex flex-col gap-4">
                <div className="flex justify-between items-baseline">
                  <h2 className="m-0 text-lg font-semibold text-white">Next 24 hours</h2>
                  <span className="font-mono-label text-[11px] text-slate-400">{(tz.split('/').pop() || tz).replace(/_/g, ' ')} time</span>
                </div>
                {s.plan.length === 0 ? (
                  <p className="m-0 text-sm text-slate-400">Nothing scheduled yet. Autopilot plans the next actions every 20 minutes inside your active hours.</p>
                ) : (
                  <ol className="list-none m-0 p-0">
                    {s.plan.slice(0, 6).map(p => (
                      <li key={p.type} className="grid grid-cols-[64px_1fr] gap-3 py-2.5 border-b border-[#22304A] last:border-b-0">
                        <span className="font-mono text-[13px] text-slate-400">{timeIn(p.next_at, tz)}</span>
                        <span>{PLAN_LABEL[p.type] || p.type.replace(/_/g, ' ')} <span className="text-slate-400">· {p.count}</span></span>
                      </li>
                    ))}
                  </ol>
                )}
                <div className="grid grid-cols-3 gap-3 pt-1">
                  <Gauge label="Invites this week" value={s.limits.invites_week} max={s.limits.invite_limit} />
                  <Gauge label="Comments today" value={s.limits.comments_today} max={s.limits.comment_limit} />
                  <Gauge label="Searches this month" value={s.limits.searches_month} max={s.limits.search_budget} />
                </div>
              </section>
            </div>

            <section className="flex flex-col gap-3.5">
              <h2 className="m-0 text-lg font-semibold">Last 7 days</h2>
              <div className="grid gap-3.5 grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'New connections', value: s.week.new_connections, note: s.week.invites > 0 ? `${Math.round((s.week.new_connections / s.week.invites) * 100)}% of ${s.week.invites} invites` : 'from invites sent' },
                  { label: 'Replies', value: s.week.replies, note: s.week.positive_replies > 0 ? `${s.week.positive_replies} positive` : 'to your messages' },
                  { label: 'Comments posted', value: s.week.comments_posted, note: 'on posts of people you follow' },
                  { label: 'Opportunities spotted', value: s.week.opportunities, note: 'buying signals in posts' },
                ].map(k => (
                  <div key={k.label} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                    <div className="text-[13px] text-muted-foreground">{k.label}</div>
                    <div className="font-display text-[44px] font-semibold leading-[1.1] tabular-nums">{k.value}</div>
                    <div className="text-[13px] text-muted-foreground">{k.note}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
              <div className="flex justify-between items-baseline mb-1">
                <h2 className="m-0 text-lg font-semibold">Campaigns</h2>
                <Link to="/dashboard" className="text-sm font-medium text-gold-dark">All campaigns</Link>
              </div>
              {s.campaigns.length === 0 ? (
                <div className="py-6 flex flex-wrap items-center justify-between gap-3">
                  <p className="m-0 text-sm text-muted-foreground">No campaign running yet.</p>
                  <Link to="/dashboard?new=1" className="inline-flex items-center gap-2 rounded-lg bg-navy text-background font-semibold h-10 px-4 text-sm">Create your first campaign</Link>
                </div>
              ) : s.campaigns.map(c => {
                const result = c.mode === 'growth'
                  ? `${c.engaged} engaged · ${c.replied} conversations`
                  : `${c.connected} connected · ${c.replied} replies`;
                return (
                  <Link key={c.id} to={`/dashboard?campaign=${c.id}`}
                    className="grid grid-cols-[minmax(0,2fr)_auto] sm:grid-cols-[minmax(0,2fr)_110px_minmax(0,2fr)_60px] gap-x-4 gap-y-1 items-center py-3.5 border-t border-border/70 first-of-type:border-t-0 hover:bg-background/50 -mx-2 px-2 rounded-lg">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{c.name}</div>
                      <div className="text-[13px] text-muted-foreground">{MODE_LABEL[c.mode] || c.mode} · {c.people} people</div>
                    </div>
                    <span className={cn('justify-self-start text-xs font-semibold px-2.5 py-1 rounded-full', c.status === 'active' ? 'bg-[#E3F3EA] text-success' : 'bg-secondary')}>
                      {c.status === 'active' ? 'Running' : 'Paused'}
                    </span>
                    <div className="hidden sm:block text-sm text-foreground/80">{result}</div>
                    <div className="hidden sm:block text-right text-sm font-semibold text-gold-dark">Open</div>
                  </Link>
                );
              })}
            </section>

            <p className="m-0 text-xs text-muted-foreground flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Updates every minute while this page is open.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}
