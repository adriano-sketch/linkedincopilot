import { ReactNode, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { ArrowUpRight, HelpCircle, LayoutDashboard, LogOut, Menu, Settings, Upload, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import Brand from './Brand';

export default function AppShell({ children, title = 'Campaigns' }: { children: ReactNode; title?: string }) {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const name = user?.email?.split('@')[0] || 'Your workspace';
  return <div className="app-shell">
    <a className="skip-link" href="#workspace-content">Skip to workspace</a>
    {open && <button className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} />}
    <aside id="workspace-navigation" className={`app-sidebar ${open ? 'is-open' : ''}`}>
      <Brand /><button className="sidebar-dismiss" aria-label="Close navigation" onClick={() => setOpen(false)}><X size={17} /></button>
      <p className="app-nav-label">WORKSPACE</p>
      <nav aria-label="Workspace navigation">
        <NavLink to="/dashboard" onClick={() => setOpen(false)}><LayoutDashboard size={16} /> Campaigns</NavLink>
        <NavLink to="/leads" onClick={() => setOpen(false)}><Upload size={16} /> Import prospects</NavLink>
      </nav>
      <div className="sidebar-bottom"><nav aria-label="Workspace support">
        <NavLink to="/settings" onClick={() => setOpen(false)}><Settings size={16} /> Settings & billing</NavLink>
        <NavLink to="/help" onClick={() => setOpen(false)}><HelpCircle size={16} /> Help & resources</NavLink>
      </nav><div className="sidebar-profile"><span className="avatar">{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>Personal workspace</small></div><button aria-label="Sign out" title="Sign out" onClick={signOut}><LogOut size={15} /></button></div></div>
    </aside>
    <div className="workspace-area"><header className="workspace-topbar"><button className="app-mobile-toggle" aria-label="Open navigation" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(true)}><Menu size={19} /></button><div className="app-mobile-brand"><Brand /></div><span>Workspace</span><span>/</span><strong>{title}</strong><Link to="/setup-guide">Setup guide <ArrowUpRight size={13} /></Link></header>
      <main id="workspace-content" className="workspace-body">{children}</main>
    </div>
  </div>;
}
