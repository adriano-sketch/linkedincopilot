import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Check, Zap, ArrowRight, ArrowDown } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    subtitle: '',
    leads: '50 leads total',
    campaigns: '1 campaign',
    features: [
      'AI-powered personalized DMs',
      'CSV import',
      'Lead enrichment included',
      'Chrome extension included',
      'Full automation sequence',
      'Manual DM approval only',
    ],
    cta: 'Start Free',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$97',
    period: '/mo',
    subtitle: 'per LinkedIn account',
    leads: '1,000 leads/month',
    campaigns: 'Unlimited campaigns',
    features: [
      'AI-powered personalized DMs',
      'Unlimited CSV imports',
      'Lead enrichment included',
      'Chrome extension with smart limits',
      'Batch DM approval',
      'Auto-capture LinkedIn profiles',
      'Priority support',
    ],
    cta: 'Start 7-day trial',
    highlighted: true,
  },
];

const funnelSteps = [
  { label: '1,000 connection requests sent', sub: '~30% acceptance rate' },
  { label: '300 new connections', sub: 'AI generates personalized DM for each' },
  { label: '300 DMs sent (after your approval)', sub: '~12% reply rate' },
  { label: '36 conversations started', sub: '~45% positive' },
  { label: '16 interested prospects', sub: '~50% book a call' },
  { label: '5-8 meetings booked', sub: null },
];

const faqs = [
  { q: 'Do I need any third-party tools?', a: 'No. LinkedIn Copilot is completely self-contained. Our Chrome extension handles all LinkedIn automation directly from your browser — no external tools, no extra subscriptions. Just install the extension, set up your campaign, and go.' },
  { q: 'Where do I get leads?', a: 'LinkedIn Copilot works with leads from any source. Export from Sales Navigator, Instantly SuperSearch, Apollo, Lusha, or build your own list. Just upload a CSV with LinkedIn profile URLs and we handle the rest — enrichment, ICP validation, and personalized messaging.' },
  { q: 'Can I import more than 1,000 leads per month?', a: "No — and that's by design. LinkedIn limits daily connection requests to protect your account. Importing more leads doesn't speed up outreach, it just wastes credits. We enforce this limit to keep your costs predictable and your account safe." },
  { q: 'What happens to unused leads at the end of the month?', a: 'Leads carry over. If you import 1,000 leads and only 700 get processed in month 1, the remaining 300 continue in month 2. But you can only import 1,000 NEW leads per billing cycle.' },
  { q: "What counts as a \"lead\"?", a: "One enriched contact with a LinkedIn URL = one lead credit. If we can't enrich a profile (invalid URL, ghost profile), no credit is consumed." },
  { q: 'What if I need multiple LinkedIn accounts?', a: 'For agencies or sales teams managing multiple reps, we offer custom plans. Contact sale@scantosell.io for volume pricing and team features.' },
  { q: 'Is there a contract?', a: 'No. All plans are month-to-month. Cancel anytime.' },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleCTA = (plan: string) => {
    if (!user) {
      navigate('/auth');
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-hero flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">LinkedIn Copilot</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm" variant="outline">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Login</Link>
                <Button onClick={() => navigate('/auth')} size="sm">Get Started <ArrowRight className="w-3.5 h-3.5 ml-1" /></Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Simple pricing. Aligned with LinkedIn's limits.
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            LinkedIn allows ~40 connection requests per day. That's ~880/month.
            We give you 1,000 leads/month per account — the natural maximum you can actually reach. No wasted credits.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-8 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {plans.map((plan) => (
              <Card key={plan.name} className={`relative ${plan.highlighted ? 'border-primary shadow-glow ring-2 ring-primary/20' : ''}`}>
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-hero text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                )}
                <CardContent className="p-6 pt-8 flex flex-col h-full">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-4xl font-extrabold">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{plan.period}</span>
                  </div>
                  {plan.subtitle && <p className="text-xs text-muted-foreground mt-1">{plan.subtitle}</p>}
                  
                  <div className="mt-4 mb-2 space-y-1">
                    <p className="font-semibold text-sm">{plan.leads}</p>
                    <p className="text-sm text-muted-foreground">{plan.campaigns}</p>
                  </div>

                  <ul className="space-y-2.5 text-sm text-left flex-1 mt-4">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => handleCTA(plan.name.toLowerCase())}
                    className={`mt-6 w-full ${plan.highlighted ? 'bg-gradient-hero text-primary-foreground' : ''}`}
                    variant={plan.highlighted ? 'default' : 'outline'}
                  >
                    {plan.cta}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Enterprise / Multi-account card */}
          <div className="max-w-3xl mx-auto mt-8">
            <Card className="border-dashed border-2 border-border">
              <CardContent className="p-6 flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm">Need multiple LinkedIn accounts?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Agencies and sales teams managing multiple reps — we offer custom plans with dedicated support, volume pricing, and team collaboration features.
                  </p>
                </div>
                <a href="mailto:sale@scantosell.io">
                  <Button variant="outline" className="shrink-0">
                    Contact Sales
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Why 1,000 leads explainer */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <Card>
            <CardContent className="p-8">
              <h2 className="text-2xl font-bold mb-4">💡 Why 1,000 leads per month?</h2>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>LinkedIn limits connection requests to ~40 per day to keep accounts safe. On business days, that's roughly 880 requests per month.</p>
                <p>We round up to 1,000 to give you a buffer for:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Invalid LinkedIn URLs (~5% of any lead list)</li>
                  <li>Leads you're already connected with (skipped automatically)</li>
                  <li>Duplicate profiles across campaigns</li>
                </ul>
                <p>Importing more than 1,000 leads won't make your campaign faster — it just means leads sit idle in a queue. Focus on quality: 1,000 well-targeted decision makers will outperform 10,000 random contacts every single time.</p>
              </div>

              {/* Funnel */}
              <div className="mt-8 p-6 rounded-lg bg-muted/50 border">
                <h3 className="font-semibold mb-4">📊 What to expect from 1,000 leads/month</h3>
                <div className="space-y-2">
                  {funnelSteps.map((step, i) => (
                    <div key={i}>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{step.label}</span>
                      </div>
                      {step.sub && (
                        <div className="flex items-center gap-2 ml-4 mt-1">
                          <ArrowDown className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">~{step.sub}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-sm font-medium text-primary mt-4 pt-3 border-t">
                  One closed deal pays for your entire stack for the year.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="container mx-auto max-w-2xl">
          <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="bg-card border rounded-lg px-4">
                <AccordionTrigger className="text-sm font-medium text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <div className="bg-gradient-hero rounded-2xl p-12">
            <h2 className="text-3xl font-bold text-primary-foreground mb-4">
              Ready to fill your calendar with qualified meetings?
            </h2>
            <Button
              onClick={() => navigate('/auth')}
              size="lg"
              className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 px-8 py-6 text-base font-semibold rounded-xl mt-4"
            >
              Get Started Free <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <p className="text-primary-foreground/70 text-sm mt-4">
              Free plan includes 50 leads + AI-powered DMs. No credit card required.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4 text-center">
        <p className="text-sm text-muted-foreground mb-2">
          LinkedIn Copilot is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">ScanToSell.io</a> — AI-powered sales intelligence for personalized LinkedIn outreach.
        </p>
        <p className="text-xs text-muted-foreground">© 2026 ScanToSell.io · All rights reserved.</p>
      </footer>
    </div>
  );
}
