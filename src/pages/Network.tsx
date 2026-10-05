import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Inbox as InboxIcon } from 'lucide-react';
import AppShell from '@/components/app/AppShell';
import { useAuth } from '@/hooks/useAuth';
import IcpManager from '@/components/network/IcpManager';
import CommentQueue from '@/components/network/CommentQueue';
import NewConnections from '@/components/network/NewConnections';
import NetworkSettingsCard from '@/components/network/NetworkSettingsCard';
import { useNetworkSettings, useNetworkStats } from '@/hooks/useNetwork';
import { cn } from '@/lib/utils';

const TABS = ['connections', 'icps', 'history', 'limits'] as const;
type Tab = typeof TABS[number];
const LABELS: Record<Tab, string> = {
  connections: 'New connections',
  icps: 'ICPs',
  history: 'Comment history',
  limits: 'Safety limits',
};
const SUBTITLES: Record<Tab, string> = {
  connections: 'People who fit your ICPs and accepted your invite.',
  icps: 'Describe who you want to meet. Copilot searches LinkedIn for them and watches what they post.',
  history: 'Comments that are scheduled, posted or skipped. New drafts wait for you in the Inbox.',
  limits: 'Copilot stays inside these limits and pauses itself if LinkedIn pushes back.',
};

export default function Network() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const { data: stats } = useNetworkStats(30);
  const { settings } = useNetworkSettings();

  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [user, loading, navigate]);

  // Old links to the comment queue now open the Inbox.
  useEffect(() => {
    if (raw === 'comments') navigate('/inbox?type=comment', { replace: true });
  }, [raw, navigate]);

  const tab: Tab = (TABS as readonly string[]).includes(raw || '') ? (raw as Tab) : 'connections';
  const pending = stats?.comments_pending_approval ?? 0;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="font-display font-bold uppercase text-4xl leading-none m-0">Network</h1>
            <p className="text-muted-foreground max-w-[64ch] m-0">{SUBTITLES[tab]}</p>
          </div>
          {pending > 0 && (
            <Link to="/inbox?type=comment" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 h-10 text-sm font-medium hover:border-foreground/30">
              <InboxIcon className="w-4 h-4" />{pending} comment{pending === 1 ? '' : 's'} to approve
            </Link>
          )}
        </div>

        <div role="tablist" aria-label="Network" className="flex gap-1 border-b border-border overflow-x-auto">
          {TABS.map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setParams({ tab: t }, { replace: true })}
              className={cn('px-3.5 py-2.5 -mb-px border-b-2 text-[15px] whitespace-nowrap transition-colors',
                tab === t ? 'border-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground')}>
              {LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'connections' && <NewConnections searchBudget={settings?.monthly_people_search_budget} />}
        {tab === 'icps' && <IcpManager />}
        {tab === 'history' && <CommentQueue initialFilter="scheduled" hidePending />}
        {tab === 'limits' && <NetworkSettingsCard />}
      </div>
    </AppShell>
  );
}
