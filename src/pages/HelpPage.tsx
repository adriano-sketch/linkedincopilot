import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ArrowLeft, Search, Camera, ShieldCheck, Eye, UserPlus,
  MessageSquare, RefreshCw, ChevronRight, Monitor, Rocket,
  CheckSquare, Upload, Star,
} from 'lucide-react';
import logoImg from '@/assets/logo.png';

const flowSteps = [
  { label: 'Find Leads', icon: Search, desc: 'Search via Apollo or upload a CSV with LinkedIn URLs.' },
  { label: 'Enrich Profiles', icon: Camera, desc: 'Each lead\'s full LinkedIn profile is scraped automatically — headline, about, experience, skills.' },
  { label: 'Validate ICP', icon: ShieldCheck, desc: 'Leads are matched against your ICP criteria using enriched data (real titles & headlines, not just CSV fields). Bad fits are filtered out.' },
  { label: 'Warm Up', icon: Eye, desc: 'The Chrome extension visits the lead\'s profile and follows them — so your connection request feels natural.' },
  { label: 'Connect', icon: UserPlus, desc: 'A personalized connection request with an AI-written note is sent automatically.' },
  { label: 'DM', icon: MessageSquare, desc: 'Once accepted, a custom DM referencing their profile is generated and queued for your approval.' },
  { label: 'Follow-up', icon: RefreshCw, desc: 'If no reply after 4 days, a follow-up with a different angle is sent automatically.' },
];

const faqs = [
  { q: 'What is ICP validation?', a: 'ICP stands for Ideal Customer Profile. When you set up a campaign, you define exactly who you want to reach — job titles, industries, company sizes, locations. Copilot first enriches every lead by pulling their full LinkedIn profile (headline, current title, about section), then validates them against your ICP criteria using that enriched data — not just the original CSV fields. If a lead doesn\'t match, it\'s filtered out automatically before any connection request is sent.' },
  { q: 'How does the AI personalize messages?', a: 'When a lead is imported, our AI reads their full LinkedIn profile — about section, work experience, education, skills, and career trajectory. It then writes 3 unique messages (connection note, first DM, and follow-up) that reference specific details from their profile. Every message is different because every profile is different.' },
  { q: 'What happens after someone accepts my connection?', a: 'The moment someone accepts your connection request, the extension automatically detects it, captures their full LinkedIn profile, and our AI generates a personalized DM queued for your approval. Once approved, the extension sends the DM with natural timing. If they don\'t reply within 4 days, a follow-up with a different angle is sent automatically.' },
  { q: 'Do I need any third-party tools?', a: 'No. LinkedIn Copilot is completely self-contained. Our Chrome extension handles all LinkedIn automation directly from your browser — no external tools, no extra subscriptions. Just install the extension, set up your campaign, and go.' },
  { q: 'Is there a risk of LinkedIn banning my account?', a: 'Our extension is designed around LinkedIn\'s safety limits — maximum ~40 connection requests per day, spread across business hours, with warm-up steps (profile views, follows) before each request. This mimics natural human behavior. The 1,000 leads/month limit exists specifically to keep your account safe.' },
  { q: 'How many leads can I send per month?', a: '1,000 leads per LinkedIn account per month. This aligns with LinkedIn\'s natural daily limits (~40 requests on business days = ~880/month). We cap at 1,000 to give buffer for invalid URLs and duplicates. Quality over quantity — 1,000 well-targeted decision makers will outperform 10,000 random contacts.' },
  { q: 'Can the same lead be in multiple campaigns?', a: 'No. Each lead (identified by their LinkedIn URL) can only exist in one campaign at a time. This prevents duplicate outreach and ensures each prospect receives a single, coherent sequence. If you try to import a lead that already exists in another campaign, it will be automatically skipped.' },
];

const quickGuides = [
  { title: 'Create a Campaign', icon: Rocket, steps: ['Click "+ New Campaign" on the dashboard', 'Choose a vertical or create a custom campaign', 'Define your ICP (titles, industries, locations)', 'Set your message tone and value proposition', 'Add leads via Apollo search or CSV upload', 'Launch — the extension handles the rest'] },
  { title: 'Add Leads', icon: Upload, steps: ['Click "+ Add Leads" on the dashboard', 'Choose Apollo Search or CSV Upload', 'For Apollo: set filters and search', 'For CSV: upload a file with LinkedIn URLs', 'Leads are automatically enriched with full profile data', 'ICP validation filters out bad fits before outreach'] },
  { title: 'Approve Messages', icon: CheckSquare, steps: ['Go to the "Approval Queue" tab on the dashboard', 'Review AI-generated DMs for each lead', 'Edit inline if you want to tweak the message', 'Approve individually, select multiple, or approve all', 'Approved messages are sent by the extension with natural timing'] },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button>
            </Link>
            <img src={logoImg} alt="LinkedIn Copilot" className="h-8 w-auto" />
            <h1 className="text-lg font-display font-bold uppercase tracking-wide">Help Center</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-8 mt-4">
        {/* Campaign Flow */}
        <section>
          <h2 className="text-xl font-display font-bold uppercase tracking-tight mb-1">How it Works</h2>
          <p className="text-sm text-muted-foreground mb-4">The full automated pipeline — from finding leads to follow-up messages.</p>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-0">
                {flowSteps.map((step, i) => (
                  <div key={step.label} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                    <div className="flex flex-col items-center gap-1 shrink-0 w-16">
                      <div className="w-9 h-9 rounded-full bg-gold-bg border-2 border-primary text-primary flex items-center justify-center">
                        <step.icon className="w-4 h-4" />
                      </div>
                      <span className="text-[10px] font-display font-semibold uppercase tracking-wider text-muted-foreground text-center leading-tight">{step.label}</span>
                    </div>
                    <div className="pt-1.5">
                      <p className="text-sm text-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Quick Guides */}
        <section>
          <h2 className="text-xl font-display font-bold uppercase tracking-tight mb-1">Quick Guides</h2>
          <p className="text-sm text-muted-foreground mb-4">Step-by-step instructions for common tasks.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {quickGuides.map((guide) => (
              <Card key={guide.title} className="hover:shadow-card transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-display font-semibold uppercase tracking-wide flex items-center gap-2">
                    <guide.icon className="w-4 h-4 text-primary" />
                    {guide.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <ol className="space-y-1.5">
                    {guide.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                        <span className="w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-[10px] font-bold mt-0.5">{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Setup Guide Link */}
        <section>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-display font-semibold text-sm uppercase tracking-wide">Keep Your Computer Awake</p>
                  <p className="text-xs text-muted-foreground">The Chrome extension needs your computer awake to run 24/7. Follow our setup guide for macOS & Windows.</p>
                </div>
              </div>
              <Link to="/setup-guide">
                <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 gap-1">
                  Setup Guide <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-display font-bold uppercase tracking-tight mb-1">Frequently Asked Questions</h2>
          <p className="text-sm text-muted-foreground mb-4">Common questions about LinkedIn Copilot.</p>
          <Card>
            <CardContent className="p-4">
              <Accordion type="single" collapsible className="w-full">
                {faqs.map((faq, i) => (
                  <AccordionItem key={i} value={`faq-${i}`}>
                    <AccordionTrigger className="text-sm font-medium text-left">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Key Info */}
        <section className="pb-8">
          <h2 className="text-xl font-display font-bold uppercase tracking-tight mb-1">Key Information</h2>
          <p className="text-sm text-muted-foreground mb-4">Important limits and safety features.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-display font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" /> Daily Limits
                </h3>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• ~40 connection requests per day (LinkedIn safe limit)</li>
                  <li>• ~100 messages per day</li>
                  <li>• Actions spread across business hours with natural delays</li>
                  <li>• Warm-up steps (view + follow) before every connection request</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-display font-semibold text-sm uppercase tracking-wide flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary" /> ICP Enrichment Flow
                </h3>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• Profiles are enriched with full LinkedIn data before ICP check</li>
                  <li>• Validation uses real headline, title, and about section</li>
                  <li>• Apollo leads bypass ICP check (already pre-filtered)</li>
                  <li>• If no data available after enrichment, leads are auto-approved</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  );
}
