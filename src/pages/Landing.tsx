import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Check, ChevronDown, FileUp, Fingerprint, Menu, MessageSquare, MousePointer2, ScanLine, SlidersHorizontal, X } from 'lucide-react';
import Brand from '@/components/Brand';
import ContextDemo from '@/components/ContextDemo';
import { useAuth } from '@/hooks/useAuth';

const faqs = [
  ['What makes the messages personal?', 'Copilot combines available prospect profile information with your campaign’s audience, offer and tone. The goal is to connect your offer to something relevant about the person or company. The quality of the available data matters, so review the context and the draft before approving a stage.'],
  ['Is this just an AI opening line about a post?', 'Outreach is built around profile context and your campaign strategy. A recent post may be useful context, but mentioning a post is not, by itself, a reason to reach out. The example above shows how a person’s work can connect to a specific offer.'],
  ['Where do I get my prospects?', 'Bring a CSV with LinkedIn profile URLs from your existing research or lead sourcing workflow. Copilot processes those profiles and checks them against your campaign criteria. It is not a searchable contact database.'],
  ['What do I approve?', 'You can review and edit available message samples. Connection notes and follow-ups use stage approval: approving a stage enables automatic sending for that stage, including subsequent messages. Pending DMs can also be approved individually. The app labels the scope of each action.'],
  ['Does my browser need to be open?', 'Yes. Execution relies on the Chrome extension in your browser and an active LinkedIn session. The dashboard shows the extension’s connection status. Review the setup guide before launching a campaign.'],
  ['Can using automation affect my LinkedIn account?', 'Yes. LinkedIn restricts unauthorized automation and extensions. Pacing controls do not guarantee account safety or compliance with LinkedIn’s rules. Review LinkedIn’s policies and decide whether this workflow is appropriate for your account.'],
  ['How do the plans work?', 'Free includes 50 total outreach credits, up to 150 total processed leads and one campaign. Pro is $147 per month per LinkedIn account, with 1,000 monthly outreach credits and up to 3,000 monthly processed leads. Processing a lead and using an outreach credit are separate allowances.'],
];
export default function Landing() {
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  }, [location.hash]);
  const signup = user ? '/dashboard' : '/auth?mode=signup';
  const cta = user ? 'Open workspace' : 'Start free';
  return <div className="marketing-site">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <header className="marketing-header"><div className="site-container marketing-nav">
      <Brand />
      <nav id="mobile-navigation" className={menuOpen ? 'marketing-links is-open' : 'marketing-links'} aria-label="Main navigation">
        <a href="#product" onClick={() => setMenuOpen(false)}>Product</a><a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a><a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a><Link to="/help">Resources <ArrowUpRight size={12} /></Link>
      </nav>
      <div className="nav-actions"><Link className="nav-signin" to={user ? '/dashboard' : '/auth?mode=signin'}>{user ? 'Workspace' : 'Sign in'}</Link><Link className="site-button site-button-small" to={signup}>{cta}<ArrowUpRight size={15} /></Link><button className="mobile-menu-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button></div>
    </div></header>
    <main id="main-content">
      <section className="hero-section site-container">
        <div className="hero-eyebrow"><span className="status-dot" /> LINKEDIN OUTREACH, WITH CONTEXT</div>
        <h1>Every good conversation<br />starts with <span>relevance.<svg viewBox="0 0 450 20" aria-hidden="true"><path d="M5 13 Q210 -4 444 10" /></svg></span></h1>
        <p className="hero-description">Know who you’re reaching out to. Understand why your offer matters.<br className="desktop-break" /> Turn prospect context into thoughtful LinkedIn messages you can review.</p>
        <div className="hero-actions"><Link className="site-button" to={signup}>{cta}<ArrowRight size={17} /></Link><a className="site-button site-button-quiet" href="#product-demo"><MousePointer2 size={16} /> Explore an example</a></div>
        <p className="hero-footnote">50 outreach credits to get started <span>·</span> No credit card required</p>
        <ContextDemo />
        <div className="hero-bottomline"><span>Built for thoughtful outbound</span><span><Fingerprint size={17} /> Prospect context</span><span><ScanLine size={17} /> Audience fit</span><span><SlidersHorizontal size={17} /> Human oversight</span></div>
      </section>
      <section id="product" className="section-paper"><div className="site-container product-section">
        <div className="section-heading"><p className="eyebrow">THE REASON BEHIND THE MESSAGE</p><h2>“Loved your post”<br />is only the beginning.</h2><p>A familiar opening can still lead to an irrelevant pitch. Good outreach connects what you know about someone to something that could matter to them.</p><a href="#product-demo" className="text-link">See context become a conversation <ArrowRight size={16} /></a></div>
        <div className="reason-stack">
          <article><span className="reason-number">01</span><div><h3>Start with the person</h3><p>Use their role, company and available profile details to find a meaningful starting point.</p></div><Fingerprint /></article>
          <article><span className="reason-number">02</span><div><h3>Connect it to your offer</h3><p>Your ideal customer, value proposition and campaign objective give the message a purpose.</p></div><ScanLine /></article>
          <article><span className="reason-number">03</span><div><h3>Keep your judgment in the loop</h3><p>Review context alongside drafts, edit the wording and choose when to enable sending.</p></div><MessageSquare /></article>
        </div>
      </div></section>
      <section id="how-it-works" className="site-container workflow-section">
        <div className="section-heading centered"><p className="eyebrow">A CLEAR PATH FROM LIST TO CONVERSATION</p><h2>Your strategy. A more considered workflow.</h2><p>Keep the research, writing and next steps connected.</p></div>
        <div className="workflow-grid">{[
          { icon: SlidersHorizontal, title: 'Define the fit', text: 'Tell Copilot who you help, what you offer and how you want to sound.', detail: 'Your audience + your point of view' },
          { icon: FileUp, title: 'Bring your prospects', text: 'Import LinkedIn profile URLs. Process available context and check audience fit.', detail: 'Profile context + qualification' },
          { icon: MessageSquare, title: 'Review the approach', text: 'Read the drafts, check the supporting context and edit before approving.', detail: 'Connection notes + DMs + follow-ups' },
          { icon: SlidersHorizontal, title: 'Stay in control', text: 'Monitor the campaign, pause execution and see which conversations need attention.', detail: 'Visible status + clear next steps' },
        ].map((step, index) => <article key={step.title}><div className="workflow-step-top"><step.icon size={22} /><span>0{index + 1}</span></div><h3>{step.title}</h3><p>{step.text}</p><small>{step.detail}</small></article>)}</div>
      </section>
      <section className="site-container"><div className="control-section"><div className="section-heading"><p className="eyebrow">AUTOMATION WITH VISIBILITY</p><h2>Your reputation.<br />Your call.</h2><p>Sending on your behalf should come with a clear view of what happens next.</p><Link className="site-button site-button-light" to={signup}>Build your first campaign <ArrowRight size={17} /></Link></div><div className="control-list">{[
        ['Review before you enable sending', 'See available samples and edit messages with prospect context in view.'],
        ['Know what your approval means', 'Individual DM approval and automatic stage sending are clearly distinguished.'],
        ['See the state of your campaign', 'Track leads, approvals and extension status. Pause when you need to.'],
      ].map(([title, body]) => <div key={title}><Check size={18} /><div><h3>{title}</h3><p>{body}</p></div></div>)}</div></div></section>
      <section id="pricing" className="site-container pricing-section"><div className="section-heading centered"><p className="eyebrow">START SMALL. BUILD A REPEATABLE PROCESS.</p><h2>Room to find your approach.</h2><p>Try the workflow with your prospects. Upgrade when you’re ready.</p></div>
        <div className="pricing-grid"><article className="price-card"><div><p className="eyebrow">FREE</p><h3>Find your first conversations.</h3><p className="price">$0 <span>to get started</span></p><p className="plan-description">Explore a complete outreach campaign.</p></div><Link className="site-button site-button-outline" to={signup}>{cta}<ArrowRight size={16} /></Link><ul>{['50 total outreach credits', 'Up to 150 total processed leads', '1 campaign', 'Profile context and message generation', 'Connection notes, DMs and follow-ups'].map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul><p className="plan-note">Free allowances are totals, not monthly renewals.</p></article>
        <article className="price-card price-card-pro"><div className="plan-badge">FOR CONSISTENT OUTREACH</div><div><p className="eyebrow">PRO</p><h3>Make relevance a habit.</h3><p className="price">$147 <span>/ month</span></p><p className="plan-description">Per LinkedIn account. Billed monthly.</p></div><Link className="site-button" to={user ? '/settings' : '/auth?mode=signup'}>{user ? 'Manage your plan' : 'Start free, upgrade in the app'}<ArrowRight size={16} /></Link><ul>{['1,000 outreach credits per month', 'Up to 3,000 processed leads per month', 'Unlimited campaigns', 'Profile context and message generation', 'Batch approval and campaign controls'].map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul><p className="plan-note">Review your plan and billing details in Settings.</p></article></div>
        <p className="pricing-explainer">Processed leads and outreach credits are separate allowances.<br />The app shows your current usage and available balance.</p>
      </section>
      <section className="section-paper"><div className="site-container faq-section"><div className="section-heading"><p className="eyebrow">A FEW GOOD QUESTIONS</p><h2>Clarity before<br />you connect.</h2><Link to="/setup-guide" className="text-link">Read the setup guide <ArrowUpRight size={15} /></Link></div><div className="faq-list">{faqs.map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}{question.includes('affect my LinkedIn') && <> <a href="https://www.linkedin.com/help/linkedin/answer/a1341387" target="_blank" rel="noopener noreferrer">Read LinkedIn’s policy ↗</a></>}</p></details>)}</div></div></section>
      <section className="site-container closing-section"><p className="eyebrow">LESS GUESSWORK. MORE CONTEXT.</p><h2>Give your next conversation<br />a better starting point.</h2><Link className="site-button" to={signup}>{cta}<ArrowRight size={17} /></Link><p>Bring your prospects. We’ll help you find the words.</p></section>
    </main>
    <footer className="marketing-footer"><div className="site-container"><div className="footer-top"><Brand /><p>Thoughtful outreach starts with understanding.</p><nav aria-label="Footer"><a href="#pricing">Pricing</a><Link to="/help">Help</Link><Link to="/privacy">Privacy</Link></nav></div><div className="footer-bottom"><span>© {new Date().getFullYear()} LinkedIn Copilot</span><span>Independent product. Not affiliated with or endorsed by LinkedIn.</span></div></div></footer>
  </div>;
}
