import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Settings, HelpCircle, LogOut } from 'lucide-react';
import logoImg from '@/assets/logo.png';
import { useAuth } from '@/hooks/useAuth';
import ExtensionStatusBar from '@/components/ExtensionStatusBar';
import IcpManager from '@/components/network/IcpManager';
import CommentQueue from '@/components/network/CommentQueue';
import NewConnections from '@/components/network/NewConnections';
import NetworkSettingsCard from '@/components/network/NetworkSettingsCard';
import { useNetworkSettings, useNetworkStats } from '@/hooks/useNetwork';

const TABS = ['connections', 'comments', 'icps', 'limits'] as const;
type Tab = typeof TABS[number];

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50/40 via-background to-slate-50/60">
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-1" /> Campaigns</Button></Link>
            <img src={logoImg} alt="LinkedIn Copilot" className="h-9 w-auto hidden sm:block" />
          </div>
          <div className="flex items-center gap-2">
            <Link to="/help"><Button variant="ghost" size="sm"><HelpCircle className="w-4 h-4" /></Button></Link>
            <Link to="/settings"><Button variant="ghost" size="sm"><Settings className="w-4 h-4" /></Button></Link>
            <Button variant="ghost" size="sm" onClick={signOut}><LogOut className="w-4 h-4" /></Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-4 mt-2">
        <ExtensionStatusBar />
        <div>
          <h1 className="text-xl font-semibold">Network</h1>
          <p className="text-sm text-muted-foreground">
            Grow your network with people who fit your ICPs, and stay present on their posts with comments you approve.
          </p>
        </div>

        <Tabs value={tab} onValueChange={v => setParams({ tab: v }, { replace: true })}>
          <TabsList>
            <TabsTrigger value="connections">New connections</TabsTrigger>
            <TabsTrigger value="comments" className="gap-1">
              Comments
              {pending > 0 && <Badge className="h-5 px-1.5">{pending}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="icps">ICPs</TabsTrigger>
            <TabsTrigger value="limits">Limits</TabsTrigger>
          </TabsList>
          <TabsContent value="connections" className="mt-4">
            <NewConnections searchBudget={settings?.monthly_people_search_budget} />
          </TabsContent>
          <TabsContent value="comments" className="mt-4"><CommentQueue /></TabsContent>
          <TabsContent value="icps" className="mt-4"><IcpManager /></TabsContent>
          <TabsContent value="limits" className="mt-4"><NetworkSettingsCard /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
