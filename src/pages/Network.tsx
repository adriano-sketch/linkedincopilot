import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Send, Radar, MessageSquareText, UserRound, ShieldCheck, Settings, HelpCircle, LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import ExtensionStatusBar from '@/components/ExtensionStatusBar';
import IcpManager from '@/components/network/IcpManager';
import CommentQueue from '@/components/network/CommentQueue';
import NewConnections from '@/components/network/NewConnections';
import NetworkSettingsCard from '@/components/network/NetworkSettingsCard';
import { useNetworkSettings, useNetworkStats } from '@/hooks/useNetwork';
import BrandMark from '@/components/BrandMark';
import { cn } from '@/lib/utils';

const TABS = ['connections', 'comments', 'icps', 'limits'] as const;
type Tab = typeof TABS[number];

const TITLES: Record<Tab, { title: string; sub: string }> = {
  connections: { title: 'New connections from Copilot', sub: 'People who fit your ICPs and accepted your invite.' },
  comments: { title: 'Comments to approve', sub: 'Posts from people in your ICPs, with a suggested comment for each. Edit in place, approve one by one or all at once.' },
  icps: { title: 'Ideal customer profiles', sub: 'Describe who you want to meet. Copilot searches LinkedIn for them and watches what they post.' },
  limits: { title: 'Safety limits', sub: 'Copilot stays inside these limits and pauses itself if LinkedIn pushes back.' },
};

export default function Network() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (TABS as readonly string[]).includes(params.get('tab') || '') ? (params.get('tab') as Tab) : 'connections';
  const { data: stats } = useNetworkStats(30);
  const { settings } = useNetworkSettings();

  useEffect(() => {
    if (!loading && !user) navigate('/');
  }, [user, loading, navigate]);

  const pending = stats?.comments_pending_approval ?? 0;
  const items: { key: Tab; label: string; icon: typeof Radar; badge?: number }[] = [
    { key: 'connections', label: 'New connections', icon: Radar },
    { key: 'comments', label: 'Comments', icon: MessageSquareText, badge: pending },
    { key: 'icps', label: 'ICPs', icon: UserRound },
    { key: 'limits', label: 'Limits', icon: ShieldCheck },
  ];
  const go = (t: Tab) => setParams({ tab: t }, { replace: true });

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      <aside className="bg-navy text-slate-200 lg:w-64 lg:min-h-screen shrink-0 px-4 py-5 lg:py-6 flex flex-col gap-6">
        <div className="flex items-center justify-between lg:justify-start gap-2.5 px-2">
          <Link to="/dashboard" className="flex items-center gap-2.5 text-white">
            <BrandMark className="w-7 h-7" />
            <span className="font-display font-bold text-lg tracking-[0.06em] uppercase">Copilot</span>
          </Link>
          <div className="flex lg:hidden gap-1">
            <Link to="/settings" aria-label="Settings" className="p-2.5 rounded-lg hover:bg-white/5"><Settings className="w-5 h-5" /></Link>
            <button onClick={signOut} aria-label="Sign out" className="p-2.5 rounded-lg hover:bg-white/5"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
        <nav aria-label="Network" className="flex lg:flex-col gap-1 overflow-x-auto -mx-1 px-1 text-[15px]">
          <Link to="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-white/5 hover:text-white whitespace-nowrap">
            <Send className="w-[18px] h-[18px]" />Campaigns
          </Link>
          {items.map(it => {
            const active = tab === it.key;
            return (
              <button
                key={it.key}
                onClick={() => go(it.key)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg whitespace-nowrap text-left transition-colors',
                  active ? 'bg-primary text-primary-foreground font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white',
                )}
              >
                <it.icon className="w-[18px] h-[18px]" />
                <span className="flex-1">{it.label}</span>
                {!!it.badge && it.badge > 0 && (
                  <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', active ? 'bg-navy text-primary' : 'bg-[#2A3654] text-amber-300')}>
                    {it.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="hidden lg:flex mt-auto flex-col gap-1 text-[15px]">
          <Link to="/help" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"><HelpCircle className="w-[18px] h-[18px]" />Help</Link>
          <Link to="/settings" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white"><Settings className="w-[18px] h-[18px]" />Settings</Link>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:bg-white/5 hover:text-white text-left"><LogOut className="w-[18px] h-[18px]" />Sign out</button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 flex flex-col gap-6">
        <ExtensionStatusBar />
        <div className="flex flex-col gap-1">
          <div className="font-mono-label text-xs text-gold-dark">Network</div>
          <h1 className="font-display font-bold uppercase text-4xl leading-none m-0">{TITLES[tab].title}</h1>
          <p className="text-muted-foreground max-w-[64ch] m-0 mt-1">{TITLES[tab].sub}</p>
        </div>
        {tab === 'connections' && <NewConnections searchBudget={settings?.monthly_people_search_budget} />}
        {tab === 'comments' && <CommentQueue />}
        {tab === 'icps' && <IcpManager />}
        {tab === 'limits' && <NetworkSettingsCard />}
      </main>
    </div>
  );
}
