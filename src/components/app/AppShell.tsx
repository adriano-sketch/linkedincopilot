import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Sun, Inbox, Send, Radar, Upload, Settings, HelpCircle, LogOut, Menu, Plus, Search, Pause, Play, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from '@/components/ui/command';
import BrandMark from '@/components/BrandMark';
import { useAuth } from '@/hooks/useAuth';
import { useExtensionStatus } from '@/hooks/useExtensionStatus';
import { useInboxCount } from '@/hooks/useInbox';
import { useCampaignProfiles } from '@/hooks/useCampaignProfiles';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type NavItem = { to: string; label: string; icon: typeof Inbox; match: (path: string) => boolean; badge?: number };

function useNav(): NavItem[] {
  const { data: inboxCount } = useInboxCount();
  return [
    { to: '/today', label: 'Today', icon: Sun, match: p => p.startsWith('/today') },
    { to: '/inbox', label: 'Inbox', icon: Inbox, match: p => p.startsWith('/inbox'), badge: inboxCount || 0 },
    { to: '/dashboard', label: 'Campaigns', icon: Send, match: p => p.startsWith('/dashboard') || p.startsWith('/leads') },
    { to: '/network', label: 'Network', icon: Radar, match: p => p.startsWith('/network') },
  ];
}

/** Autopilot = the Chrome extension. Online when it sent a heartbeat in the last 3 minutes. */
function AutopilotCard() {
  const { extensionStatus, isLoading } = useExtensionStatus();
  const [toggling, setToggling] = useState(false);
  if (isLoading) return null;

  if (!extensionStatus) {
    return (
      <Link to="/setup-guide" className="block rounded-xl border border-[#22304A] bg-navy-light p-3.5 text-[13px] hover:border-primary/60">
        <div className="font-mono-label text-[11px] text-slate-400">Autopilot</div>
        <div className="mt-1 font-semibold text-white">Not set up yet</div>
        <div className="text-slate-400">Install the Chrome extension to start.</div>
      </Link>
    );
  }

  const online = !!extensionStatus.last_heartbeat_at && Date.now() - new Date(extensionStatus.last_heartbeat_at).getTime() < 3 * 60 * 1000;
  const paused = !!extensionStatus.is_paused;
  const state = paused ? { label: 'Paused', dot: 'bg-amber-400', text: 'text-amber-300' }
    : online ? { label: 'On', dot: 'bg-emerald-400', text: 'text-emerald-400' }
    : { label: 'Offline', dot: 'bg-slate-500', text: 'text-slate-400' };
  const note = paused ? 'Nothing runs until you resume.'
    : online ? (extensionStatus.linkedin_logged_in === false ? 'Log in to LinkedIn in Chrome.' : 'Working inside your active hours.')
    : 'Open Chrome with LinkedIn to resume.';

  const toggle = async () => {
    setToggling(true);
    const { error } = await supabase.from('extension_status').update({ is_paused: !paused }).eq('id', extensionStatus.id);
    setToggling(false);
    if (error) toast.error('Could not change autopilot');
    else toast.success(paused ? 'Autopilot resumed' : 'Autopilot paused');
  };

  return (
    <div className="rounded-xl border border-[#22304A] bg-navy-light p-3.5 text-[13px] flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="font-mono-label text-[11px] text-slate-400">Autopilot</span>
        <span className={cn('flex items-center gap-1.5 font-semibold', state.text)}><span className={cn('w-2 h-2 rounded-full', state.dot)} />{state.label}</span>
      </div>
      <div className="text-slate-300">{note}</div>
      <button onClick={toggle} disabled={toggling}
        className="mt-1 self-start inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-slate-300 hover:bg-white/5 hover:text-white">
        {toggling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
        {paused ? 'Resume' : 'Pause'}
      </button>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const nav = useNav();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const email = user?.email || '';
  const linkCls = (active: boolean) => cn(
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[15px] transition-colors',
    active ? 'bg-primary text-primary-foreground font-semibold' : 'text-slate-300 hover:bg-white/5 hover:text-white',
  );

  return (
    <div className="flex h-full flex-col gap-6 px-3.5 py-5">
      <Link to="/today" onClick={onNavigate} className="flex items-center gap-2.5 px-2 text-white">
        <BrandMark className="w-7 h-7" />
        <span className="font-display font-bold text-lg tracking-[0.06em] uppercase">Copilot</span>
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {nav.map(item => {
          const active = item.match(pathname);
          return (
            <Link key={item.to} to={item.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={linkCls(active)}>
              <item.icon className="w-[18px] h-[18px]" />
              <span className="flex-1">{item.label}</span>
              {!!item.badge && (
                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full tabular-nums', active ? 'bg-navy text-primary' : 'bg-primary text-primary-foreground')}>
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Link>
          );
        })}
        <Link to="/leads" onClick={onNavigate} className={linkCls(false)}><Upload className="w-[18px] h-[18px]" />Add leads</Link>
      </nav>
      <div className="mt-auto flex flex-col gap-1">
        <AutopilotCard />
        <Link to="/help" onClick={onNavigate} className={cn(linkCls(pathname.startsWith('/help')), 'text-sm mt-2')}><HelpCircle className="w-[18px] h-[18px]" />Help</Link>
        <Link to="/settings" onClick={onNavigate} className={cn(linkCls(pathname.startsWith('/settings')), 'text-sm')}><Settings className="w-[18px] h-[18px]" />Settings</Link>
        <div className="mt-2 flex items-center gap-2.5 border-t border-white/[0.06] pt-3 px-2">
          <div className="w-8 h-8 shrink-0 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
            {(email[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 text-[13px] text-slate-300 truncate" title={email}>{email}</div>
          <button onClick={signOut} aria-label="Sign out" className="p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/5"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const { campaigns } = useCampaignProfiles();
  const go = (to: string) => { onOpenChange(false); navigate(to); };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page or campaign…" />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go('/today')}><Sun className="mr-2 h-4 w-4" />Today</CommandItem>
          <CommandItem onSelect={() => go('/inbox')}><Inbox className="mr-2 h-4 w-4" />Inbox</CommandItem>
          <CommandItem onSelect={() => go('/dashboard')}><Send className="mr-2 h-4 w-4" />Campaigns</CommandItem>
          <CommandItem onSelect={() => go('/dashboard?new=1')}><Plus className="mr-2 h-4 w-4" />New campaign</CommandItem>
          <CommandItem onSelect={() => go('/network')}><Radar className="mr-2 h-4 w-4" />Network · new connections</CommandItem>
          <CommandItem onSelect={() => go('/network?tab=icps')}><Radar className="mr-2 h-4 w-4" />Network · ICPs</CommandItem>
          <CommandItem onSelect={() => go('/leads')}><Upload className="mr-2 h-4 w-4" />Add leads</CommandItem>
          <CommandItem onSelect={() => go('/settings')}><Settings className="mr-2 h-4 w-4" />Settings</CommandItem>
          <CommandItem onSelect={() => go('/help')}><HelpCircle className="mr-2 h-4 w-4" />Help</CommandItem>
        </CommandGroup>
        {campaigns.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Campaigns">
              {campaigns.map(c => (
                <CommandItem key={c.id} value={`campaign ${c.name} ${c.id}`} onSelect={() => go(`/dashboard?campaign=${c.id}`)}>
                  <Send className="mr-2 h-4 w-4" />{c.name}
                  <span className="ml-auto text-xs text-muted-foreground capitalize">{c.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Shared frame for every logged-in page: sidebar navigation, top bar, ⌘K palette. */
export default function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(o => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden lg:block w-60 shrink-0 bg-navy sticky top-0 h-screen overflow-y-auto">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-navy border-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/90 backdrop-blur px-4 sm:px-6 lg:px-10 h-16">
          <button className="lg:hidden p-2 -ml-2 rounded-md hover:bg-secondary" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <Menu className="w-5 h-5" />
          </button>
          <button onClick={() => setPaletteOpen(true)}
            className="flex flex-1 max-w-md items-center gap-2.5 rounded-lg border border-border bg-card px-3 h-10 text-sm text-muted-foreground hover:border-foreground/30">
            <Search className="w-4 h-4" />
            <span className="flex-1 text-left">Jump to…</span>
            <kbd className="hidden sm:inline font-mono text-[11px] border border-border rounded px-1.5 py-0.5">⌘K</kbd>
          </button>
          <button onClick={() => navigate('/dashboard?new=1')}
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-navy text-background font-semibold px-4 h-10 text-sm hover:bg-navy-light">
            <Plus className="w-4 h-4" /><span className="hidden sm:inline">New campaign</span>
          </button>
        </header>
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-8">{children}</main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
