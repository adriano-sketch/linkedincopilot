import { useState } from 'react';
import { ArrowUpRight, Check, FileText, MessageSquare, SlidersHorizontal } from 'lucide-react';
const examples = [
  { name: 'Sarah Chen', initials: 'SC', title: 'Founder', company: 'Northstar Studio', sector: 'Design agency', location: 'Austin, TX', about: 'We help B2B software teams turn complex products into clear, useful experiences.', offer: 'A lightweight client handoff process for design agencies.', signal: 'Runs a studio serving B2B software teams', connection: 'Sarah, your studio’s focus on making complex B2B products easier to use caught my eye. I work with design teams on client handoffs. Would be good to connect.', message: 'Sarah, thanks for connecting. With Northstar working on complex B2B products, I wondered how your team handles the transition from design to client delivery. We help studios simplify that handoff. Is that something you’re looking at?' },
  { name: 'Alex Morgan', initials: 'AM', title: 'Managing Partner', company: 'Summit Advisory', sector: 'Business consulting', location: 'Denver, CO', about: 'Our team helps founder-led businesses build repeatable operations as they grow.', offer: 'A shared workspace for consultants and their clients.', signal: 'Advises founder-led businesses on operations', connection: 'Alex, I noticed Summit works with founders on repeatable operations. I’m working on how consulting teams keep client delivery organized. Would enjoy connecting.', message: 'Alex, thanks for connecting. Since Summit helps founders build repeatable operations, I’m curious how you keep recommendations and client actions in sync between sessions. We build a shared workspace for that. Would it be useful to compare approaches?' },
];
export default function ContextDemo() {
  const [selected, setSelected] = useState(0);
  const [stage, setStage] = useState<'connection' | 'message'>('message');
  const prospect = examples[selected];
  return <div className="context-demo" id="product-demo">
    <div className="demo-toolbar"><span><span className="status-dot" /> From context to conversation</span><span className="demo-label">Interactive example · fictional data</span></div>
    <div className="demo-layout">
      <aside className="demo-prospects">
        <p className="eyebrow">Choose a prospect</p>
        {examples.map((example, index) => <button key={example.name} onClick={() => setSelected(index)} aria-pressed={selected === index} className={`prospect-option ${selected === index ? 'selected' : ''}`}>
          <span className={`avatar avatar-${index}`}>{example.initials}</span><span><strong>{example.name}</strong><small>{example.company}</small></span><ArrowUpRight size={14} />
        </button>)}
        <div className="demo-offer"><SlidersHorizontal size={16} /><p className="eyebrow">Your offer</p><p>{prospect.offer}</p></div>
      </aside>
      <section className="demo-context" aria-label="Prospect context" aria-live="polite">
        <div className="demo-panel-title"><FileText size={15} /><span>01 / Understand the person</span></div>
        <h3>{prospect.name}</h3><p className="prospect-role">{prospect.title} at {prospect.company}</p>
        <div className="context-tags"><span>{prospect.sector}</span><span>{prospect.location}</span></div>
        <p className="eyebrow">Profile context</p><blockquote>“{prospect.about}”</blockquote>
        <div className="fit-insight"><Check size={16} /><div><strong>A relevant starting point</strong><p>{prospect.signal}</p></div></div>
      </section>
      <section className="demo-message" aria-label="Example message" aria-live="polite">
        <div className="demo-panel-title"><MessageSquare size={15} /><span>02 / Make the connection</span></div>
        <div className="demo-stage-switch" aria-label="Message type">{(['connection', 'message'] as const).map(value => <button key={value} aria-pressed={stage === value} onClick={() => setStage(value)}>{value === 'connection' ? 'Connection note' : 'First message'}</button>)}</div>
        <div className="message-paper"><p>{stage === 'connection' ? prospect.connection : prospect.message}</p><span>Illustrative draft</span></div>
        <div className="demo-review-note"><span className="review-dot" /><span>Context gives you a reason to reach out.<br /><strong>Your judgment makes it worth sending.</strong></span></div>
      </section>
    </div>
  </div>;
}
