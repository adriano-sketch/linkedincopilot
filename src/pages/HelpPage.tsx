import { Link } from 'react-router-dom';
import { ArrowRight, FileUp, MessageSquare, SlidersHorizontal, Unplug } from 'lucide-react';
import Brand from '@/components/Brand';

const guides = [
  { title: 'Create a campaign', icon: SlidersHorizontal, steps: ['Open Campaigns and select New campaign.', 'Define your approach, message tone and target audience.', 'Import prospects with LinkedIn profile URLs.', 'Launch processing, then review the available message samples.'], to: '/dashboard', action: 'Open campaigns' },
  { title: 'Import prospects', icon: FileUp, steps: ['Choose the campaign that should receive the prospects.', 'Download the CSV template if you need a starting point.', 'Choose a CSV file and check valid rows and duplicates.', 'Import the list, then monitor processing in your campaign.'], to: '/leads', action: 'Import a list' },
  { title: 'Review messages', icon: MessageSquare, steps: ['Open a campaign and choose Review messages.', 'Read the available profile context and qualification explanation beside the draft.', 'Edit or regenerate a draft when the approach needs work.', 'Approve an individual pending DM, or enable an entire messaging stage. Stage approval includes subsequent messages.'], to: '/dashboard', action: 'Open your workspace' },
  { title: 'Connect your extension', icon: Unplug, steps: ['Download and extract the extension ZIP.', 'Install it in Chrome and sign in using your Copilot account.', 'Keep LinkedIn open and logged in in the same browser.', 'Check the connection status in your workspace before running a campaign.'], to: '/setup-guide', action: 'View setup instructions' },
];
export default function HelpPage() {
  return <div className="marketing-site min-h-screen"><header className="marketing-header"><div className="site-container marketing-nav"><Brand /><Link className="site-button site-button-small" to="/dashboard">Open workspace <ArrowRight size={14} /></Link></div></header>
    <main className="site-container py-14"><div className="section-heading mb-10"><p className="eyebrow">HELP & RESOURCES</p><h1 className="text-4xl tracking-tight font-medium mb-4">A clear next step.</h1><p>Guides to help you go from your first campaign to a considered conversation.</p></div>
      <div className="grid md:grid-cols-2 gap-6">{guides.map(guide => <section key={guide.title} className="rounded-xl border border-border bg-white p-7"><guide.icon size={23} className="text-muted-foreground mb-5" /><h2 className="text-lg font-semibold mb-5">{guide.title}</h2><ol className="list-decimal pl-5 space-y-3 text-sm text-muted-foreground leading-relaxed">{guide.steps.map(step => <li key={step}>{step}</li>)}</ol><Link to={guide.to} className="text-link">{guide.action} <ArrowRight size={14} /></Link></section>)}</div>
      <section className="mt-10 rounded-xl border border-border bg-muted/40 p-7"><h2 className="font-semibold mb-3">About account automation</h2><p className="text-sm text-muted-foreground leading-relaxed">Copilot uses a Chrome extension to execute actions. LinkedIn restricts unauthorized automation and extensions; pacing controls do not guarantee account safety. <a href="https://www.linkedin.com/help/linkedin/answer/a1341387" className="underline" target="_blank" rel="noopener noreferrer">Review LinkedIn’s policy</a> when deciding whether to use this workflow.</p></section>
      <div className="flex justify-between mt-10 text-xs text-muted-foreground"><Link to="/">← Back to website</Link><Link to="/privacy">Privacy policy</Link></div>
    </main></div>;
}
