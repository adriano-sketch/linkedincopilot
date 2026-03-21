import { useAuth } from '@/hooks/useAuth';
import SplitFlapText from '@/components/SplitFlapText';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Zap, ArrowRight, Target, Eye, UserPlus, MessageSquare, Clock,
  Upload, Bot, BarChart3, RefreshCw, ShieldCheck, Shield,
  Check, ChevronRight, Star, Sparkles, Globe, Lock, Quote,
  Ghost,
} from 'lucide-react';
import logoImg from '@/assets/logo.png';
import { motion } from 'framer-motion';
import '@/styles/campaign-flow.css';

const fadeUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.6, ease: 'easeOut' as const },
};

const stagger = (i: number) => ({
  ...fadeUp,
  transition: { duration: 0.5, delay: i * 0.1, ease: 'easeOut' as const },
});

export default function Landing() {
  const { user, loading, signInWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const howRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && user) navigate('/dashboard');
  }, [user, loading, navigate]);

  useEffect(() => {
    if (location.pathname === '/pricing' || location.hash === '#pricing') {
      setTimeout(() => scrollTo(pricingRef), 50);
    }
  }, [location.pathname, location.hash]);

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCTA = () => navigate('/auth');

  // -- Data --

  const howSteps = [
    { num: '\u2460', title: 'Define Your Target', desc: 'Pick your industry, job titles, and location. Our vertical presets guide you to the right audience.' },
    { num: '\u2461', title: 'Import Your Leads', desc: 'Upload a CSV with LinkedIn URLs from any source — Sales Navigator, Instantly, or your own list. We handle the rest.' },
    { num: '\u2462', title: 'AI Validates Your ICP', desc: 'Gemini 2.5 Pro cross-checks every lead against your ideal customer profile. Only qualified leads move forward.' },
    { num: '\u2463', title: 'Launch Campaign', desc: 'Our Chrome Extension visits profiles on autopilot.' },
    { num: '\u2464', title: 'AI Writes Your DMs', desc: 'When they accept, GPT-5 reads their full profile and crafts a unique message. You approve, then send.' },
  ];

  const painPoints = [
    { emoji: '\uD83C\uDFAF', title: 'GENERIC MESSAGES', desc: '"Hi {firstName}, I\'d love to connect..." Sound familiar? Your prospects get 20 of these a day. Yours gets deleted with the rest. GPT-5 writes messages that reference their actual career, company, and background, so they know you actually looked.' },
    { emoji: '\uD83E\uDD16', title: 'WRONG PEOPLE', desc: 'You\'re sending connection requests to people who will never buy from you. Generic titles like "CEO" match every industry. Our Gemini 2.5 Pro ICP check filters out mismatches before a single request is sent, so every connection counts.' },
    { emoji: '\uD83D\uDCC9', title: 'WASTED TIME', desc: 'Hours spent writing messages one by one, or blasting the same template to 1,000 people and wondering why nobody replies. LinkedIn Copilot automates the entire sequence while you focus on closing the replies that come back.' },
  ];

  const solutionFeatures = [
    { icon: Upload, title: 'Import From Anywhere', desc: 'Bring leads from any source — Sales Navigator, Instantly SuperSearch, Apollo, Lusha, or your own research. Just upload a CSV with LinkedIn URLs. Our AI agents handle enrichment, ICP validation, and personalization.' },
    { icon: Bot, title: 'Profile-Based Messages', desc: 'Our AI agents capture full LinkedIn profile data, experience, education, skills, without touching your account. Then GPT-5 crafts a message that proves you did your homework.' },
    { icon: Globe, title: '30+ Languages', desc: 'Your prospect speaks Portuguese? GPT-5 writes in Portuguese. French? German? Japanese? 30+ languages, automatically detected from their profile.' },
    { icon: RefreshCw, title: 'Automated Sequences', desc: 'Visit profile \u2192 follow \u2192 like a post \u2192 send connection request \u2192 DM \u2192 follow-up. The entire sequence runs on autopilot with human-like delays. Set it once, leads flow in daily.' },
    { icon: Check, title: 'AI-Powered ICP Check', desc: 'Before any outreach starts, Gemini 2.5 Pro compares each lead against your ideal customer profile using real LinkedIn data. Mismatches get filtered out automatically.' },
    { icon: Eye, title: 'Ghost Profile Detection', desc: 'Not everyone on LinkedIn is actually active. Our AI detects ghost profiles \u2014 accounts with minimal data, no skills, no about section, few connections \u2014 and automatically skips them. Zero credits wasted on people who will never see your message.' },
    { icon: BarChart3, title: 'One Dashboard', desc: 'Leads, messages, follow-ups, replies, your entire pipeline on one screen. Approve DMs one by one or in batch. Nothing sends without your say-so.' },
  ];

  const trustCards = [
    { emoji: '\uD83D\uDEE1\uFE0F', title: 'Daily Limits', desc: 'Max 80 profile visits and 40 connection requests per day. These limits are enforced automatically, you can\'t accidentally exceed them.' },
    { emoji: '\u23F1\uFE0F', title: 'Human Delays', desc: 'Random pauses between every action, just like a real person browsing LinkedIn. No robotic patterns that trigger alerts.' },
    { emoji: '\uD83D\uDD25', title: 'Warm-Up Built In', desc: 'New accounts start with lower daily limits and gradually ramp up over weeks, exactly how a real person would naturally grow their activity.' },
    { emoji: '\uD83E\uDDD1\u200D\uD83D\uDCBB', title: 'Runs In Your Browser', desc: 'Our Chrome Extension acts as you, from your own browser and IP address. No cloud servers, no proxy farms. LinkedIn sees you, not a bot.' },
  ];

  const testimonials = [
    { name: 'Marcus W.', role: 'VP Sales', company: 'B2B SaaS Startup', quote: 'LinkedIn Copilot replaced 3 hours of daily manual outreach. The AI messages actually reference what my prospects do \u2014 the reply rate jumped from 4% to 18%.' },
    { name: 'Sarah L.', role: 'Founder', company: 'Digital Agency', quote: 'I was skeptical about LinkedIn automation, but the ICP validation is a game-changer. No more wasting connections on people who will never buy.' },
    { name: 'David K.', role: 'Head of Growth', company: 'FinTech Scale-up', quote: 'We tested 5 LinkedIn tools. Copilot is the only one where messages don\'t look automated. Our prospects actually think we wrote them personally.' },
  ];

  const faqs = [
    { q: 'What is LinkedIn automation?', a: 'LinkedIn automation is the practice of using software to automate repetitive LinkedIn tasks such as sending connection requests, follow-ups, and direct messages. LinkedIn Copilot is an AI-powered LinkedIn automation tool that goes beyond simple templates \u2014 it reads each prospect\'s full profile and generates personalized messages using GPT-5, while validating leads against your Ideal Customer Profile using Gemini 2.5 Pro.' },
    { q: 'Is LinkedIn automation safe? Will I get banned?', a: 'LinkedIn Copilot is designed with safety as the top priority. It runs as a Chrome Extension in your own browser (no cloud servers or proxy farms), enforces strict daily limits (80 profile visits, 40 connection requests), uses random human-like delays between actions, and includes automatic warm-up for new accounts. These measures keep your activity well within LinkedIn\'s safe thresholds.' },
    { q: 'How does LinkedIn Copilot validate leads against my ICP?', a: 'LinkedIn Copilot uses Gemini 2.5 Pro to automatically enrich every lead with full LinkedIn profile data, then validates them against your Ideal Customer Profile using real headlines, titles, career history, and company data. Leads that don\'t match your ICP are filtered out before any outreach begins.' },
    { q: 'How are the messages personalized?', a: 'Our AI agents capture full public LinkedIn profile data \u2014 experience, education, skills, about section \u2014 without using your account. GPT-5 then writes a unique message for each prospect, referencing their actual background. No templates, no {firstName} placeholders.' },
    { q: 'How many connection requests can I send per day?', a: 'LinkedIn Copilot enforces a maximum of 40 connection requests and 80 profile visits per day. These limits are well within LinkedIn\'s safe thresholds and cannot be overridden. New accounts start with lower limits that gradually ramp up over weeks.' },
    { q: 'Where do I get leads?', a: 'LinkedIn Copilot works with leads from any source. Export from Sales Navigator, Instantly SuperSearch, Apollo, Lusha, or build your own list. Just upload a CSV with LinkedIn profile URLs and we handle the rest \u2014 enrichment, ICP validation, and personalized messaging.' },
    { q: 'What\'s the difference between LinkedIn Copilot and other automation tools?', a: 'Most LinkedIn automation tools use simple templates with {firstName} and {companyName} placeholders. LinkedIn Copilot reads the full LinkedIn profile \u2014 about section, career history, education, skills \u2014 and generates truly personalized messages using GPT-5. It also includes AI-powered ICP validation, which filters out bad-fit leads before any outreach begins.' },
    { q: 'How long does it take to set up a campaign?', a: 'You can go from zero to personalized LinkedIn conversations in under 10 minutes. Upload a CSV with LinkedIn URLs, define your ICP criteria, set your message tone, and launch. The Chrome Extension handles everything automatically.' },
    { q: 'What happens after the free 50 outreach credits?', a: 'Your existing leads continue processing through the full outreach sequence. You just can\'t add new leads until you upgrade to Pro ($97/month for 1,000 outreach credits). No data is lost.' },
    { q: 'Can I run campaigns in other languages?', a: 'Yes. GPT-5 detects your prospect\'s language from their LinkedIn profile and writes in that language automatically. Over 30 languages are supported, including Portuguese, French, German, Spanish, and Japanese.' },
    { q: 'Can I edit the AI messages before sending?', a: 'Always. You maintain full control \u2014 you can approve, edit, regenerate, or reject any message. Nothing is ever sent without your explicit approval. You can review messages one by one or use batch approval.' },
    { q: 'How does LinkedIn Copilot compare to manual outreach?', a: 'Manual LinkedIn outreach typically allows 15-20 personalized messages per day and takes 2-3 hours. LinkedIn Copilot automates the entire sequence \u2014 profile visits, follows, connection requests, and personalized DMs \u2014 processing up to 40 leads per day with AI-written messages that reference each prospect\'s actual background.' },
    { q: 'What are Ghost Profiles and why does LinkedIn Copilot skip them?', a: 'Ghost profiles are LinkedIn accounts with minimal activity \u2014 no about section, few skills, no education, barely any connections. These users rarely check LinkedIn and will never see your connection request or message. LinkedIn Copilot automatically detects and skips ghost profiles so you don\'t waste credits or daily limits on people who aren\'t actually active on the platform.' },
  ];

  const pricing = [
    {
      name: 'Free',
      price: '$0',
      period: '/mo',
      subtitle: '',
      leads: '50 outreach credits',
      campaigns: 'Process up to 150 leads',
      campaignsAlt: '1 campaign',
      features: [
        'AI-powered personalized DMs',
        'CSV import (up to 150 leads)',
        'Smart filtering: ghost detection + ICP validation',
        'Only outreach-ready leads count as credits',
        'Chrome extension included',
        'Full automation sequence',
        'Manual DM approval only',
      ],
      cta: 'Start Free',
      sub: 'No credit card required.',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$97',
      period: '/mo',
      subtitle: 'per LinkedIn account',
      leads: '1,000 outreach credits/month',
      campaigns: 'Process up to 3,000 leads',
      campaignsAlt: 'Unlimited campaigns',
      features: [
        'AI-powered personalized DMs',
        'Upload up to 3,000 leads/month',
        'Smart filtering: ghost detection + ICP validation',
        'Only outreach-ready leads count as credits',
        'Chrome extension with smart limits',
        'Batch DM approval',
        'Auto-capture LinkedIn profiles',
        'Priority support',
      ],
      cta: 'Start 7-day trial',
      sub: 'Cancel anytime.',
      highlighted: true,
    },
  ];
  const pricingCompare = [
    { feature: 'Outreach credits', free: '50 total', pro: '1,000 / mo' },
    { feature: 'Lead processing limit', free: '150 total', pro: '3,000 / mo' },
    { feature: 'Campaigns', free: '1', pro: 'Unlimited' },
    { feature: 'CSV imports', free: 'Basic', pro: 'Unlimited' },
    { feature: 'Lead enrichment', free: 'Included', pro: 'Included' },
    { feature: 'ICP validation', free: 'Included', pro: 'Included' },
    { feature: 'Ghost profile detection', free: 'Included', pro: 'Included' },
    { feature: 'Approval flow', free: 'Manual only', pro: 'Batch + auto-run' },
    { feature: 'Chrome extension limits', free: 'Standard', pro: 'Smart limits' },
    { feature: 'Support', free: 'Community', pro: 'Priority' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* -- NAVBAR -- */}
      <nav className="fixed top-0 w-full z-50 glass">
        <div className="container mx-auto flex items-center justify-between h-20 px-4">
          <div className="flex items-center">
            <img src={logoImg} alt="LinkedIn Copilot \u2014 AI-powered LinkedIn automation tool for B2B outreach" className="h-16 w-auto" />
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-display font-semibold uppercase tracking-wider text-sidebar-foreground">
            <button onClick={() => scrollTo(howRef)} className="hover:text-primary transition-colors">How it Works</button>
            <button onClick={() => scrollTo(featuresRef)} className="hover:text-primary transition-colors">Features</button>
            <button onClick={() => scrollTo(pricingRef)} className="hover:text-primary transition-colors">Pricing</button>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm font-display font-semibold uppercase tracking-wider text-sidebar-foreground hover:text-primary transition-colors">
              Login
            </Link>
            <Button onClick={handleCTA} size="sm" className="bg-primary text-primary-foreground hover:bg-gold-light font-display font-bold uppercase tracking-wider rounded-md shine-effect">
              Get Started <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </nav>

      {/* SECTION 1: HERO (dark) */}
      <section className="px-4 sm:px-6 relative overflow-hidden hero-topgun">
        <svg className="target-reticle hidden md:block" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <circle cx="60" cy="60" r="55" stroke="hsl(var(--gold))" strokeWidth="1.5" strokeDasharray="8 4"/>
          <circle cx="60" cy="60" r="35" stroke="hsl(var(--gold))" strokeWidth="1"/>
          <circle cx="60" cy="60" r="8" stroke="hsl(var(--gold))" strokeWidth="1.5"/>
          <line x1="60" y1="0" x2="60" y2="20" stroke="hsl(var(--gold))" strokeWidth="1.5"/>
          <line x1="60" y1="100" x2="60" y2="120" stroke="hsl(var(--gold))" strokeWidth="1.5"/>
          <line x1="0" y1="60" x2="20" y2="60" stroke="hsl(var(--gold))" strokeWidth="1.5"/>
          <line x1="100" y1="60" x2="120" y2="60" stroke="hsl(var(--gold))" strokeWidth="1.5"/>
        </svg>

        <div className="container mx-auto max-w-[900px] text-center relative z-[2]">
          <h1 className="sr-only">LinkedIn Copilot: AI-Powered LinkedIn Automation for B2B Sales Outreach</h1>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' as const }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/[0.12] text-gold-light text-[11px] font-display font-bold uppercase tracking-[0.12em] mb-7 border border-primary/50"
          >
            <span className="badge-dot" />
            Powered by GPT-5 &middot; Gemini ICP Validation &middot; 30+ Languages
          </motion.div>
          <SplitFlapText
            className="font-display uppercase tracking-tight mb-5 leading-[0.95] text-white"
            style={{ fontSize: 'clamp(28px, 6.5vw, 86px)', fontWeight: 900, textShadow: '0 2px 40px rgba(0,0,0,0.8)' }}
            lines={[
              { text: 'Lock on Target.', className: 'block' },
              { text: 'Deploy Precision', className: 'text-primary block whitespace-nowrap' },
              { text: 'Messages.', className: 'text-primary block' },
              { text: 'Close Deals.', className: 'block' },
            ]}
          />
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' as const }}
            className="text-[15px] sm:text-[17px] leading-relaxed max-w-[640px] mx-auto mb-10 px-2"
            style={{ color: 'rgba(255,255,255,0.75)', textShadow: '0 1px 8px rgba(0,0,0,0.6)' }}
          >
            An AI-powered LinkedIn automation tool that reads your prospect's actual profile and crafts B2B outreach messages they can't ignore. Not templates. Not spam. Precision.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' as const }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button
              onClick={handleCTA}
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-gold-light px-8 sm:px-10 py-[18px] text-sm sm:text-base font-display font-extrabold uppercase tracking-[0.12em] rounded-lg transition-all shine-effect"
              style={{ boxShadow: '0 0 30px rgba(201,162,39,0.4), 0 4px 20px rgba(0,0,0,0.4)' }}
            >
              Start Free &mdash; 50 Outreach Credits
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <button
              onClick={() => scrollTo(howRef)}
              className="text-sm font-display font-semibold uppercase tracking-wider text-white/60 hover:text-white transition-colors flex items-center gap-1.5"
            >
              See How It Works <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="text-xs mt-4"
            style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}
          >
            No credit card required. Chrome Extension installs in 30 seconds.
          </motion.p>
        </div>

        <div className="scroll-hint">
          <span>Scroll</span>
          <div className="scroll-arrow" />
        </div>
      </section>

      {/* SECTION: WHAT IS LINKEDIN AUTOMATION? (AEO) */}
      <section className="py-16 px-4 section-cream section-textured relative">
        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-display font-bold text-2xl md:text-3xl uppercase tracking-tight mb-6">
              What Is <span className="text-gradient-gold">LinkedIn Automation?</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              LinkedIn automation is the practice of using software to automate repetitive LinkedIn tasks &mdash; sending connection requests, follow-ups, and personalized direct messages at scale. Unlike basic tools that rely on {'{firstName}'} templates, <strong>LinkedIn Copilot</strong> is an AI-powered B2B LinkedIn automation platform that reads each prospect's full profile (about section, career history, education, skills) and generates truly personalized messages using GPT-5. Every lead is validated against your Ideal Customer Profile using Gemini 2.5 Pro before any outreach begins, ensuring you only connect with qualified prospects.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION 2: HOW IT WORKS (light) */}
      <section ref={howRef} className="py-24 px-4 section-white section-textured relative">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tight">
              How It <span className="text-gradient-gold">Works</span>
            </h2>
            <p className="text-muted-foreground mt-2 text-sm md:text-base">5 steps. 10 minutes to set up. Then it runs on autopilot.</p>
          </motion.div>

          {/* Desktop: horizontal */}
          <div className="hidden md:block">
            <div className="grid grid-cols-5 gap-6 relative">
              <div className="absolute top-[40px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-primary/20 via-primary/60 to-primary/20 z-0" />
              {howSteps.map((s, i) => (
                <motion.div key={i} {...stagger(i)} className="flex flex-col items-center text-center relative z-10">
                  <div className="w-20 h-20 rounded-full bg-gold-bg border-2 border-primary flex items-center justify-center text-2xl font-display font-extrabold text-primary mb-4">
                    {s.num}
                  </div>
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider mb-1.5">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-snug max-w-[150px]">{s.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Mobile: vertical */}
          <div className="md:hidden space-y-0">
            {howSteps.map((s, i) => (
              <motion.div key={i} {...stagger(i)} className="relative">
                <div className="flex items-center gap-4 py-4">
                  <div className="w-14 h-14 rounded-full bg-gold-bg border-2 border-primary flex items-center justify-center text-lg font-display font-extrabold text-primary shrink-0">
                    {s.num}
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm uppercase tracking-wider">{s.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                  </div>
                </div>
                {i < howSteps.length - 1 && (
                  <div className="ml-7 w-[2px] h-3 bg-gradient-to-b from-primary/40 to-transparent" />
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 3: PAIN POINTS (light) */}
      <section className="py-24 px-4 section-cream section-textured relative">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">
              Your LinkedIn Outreach Is Broken.
            </h2>
            <p className="text-lg sm:text-xl font-display font-semibold uppercase tracking-wide text-muted-foreground">Here's Why.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {painPoints.map((p, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="hover-float h-full border-border">
                  <CardContent className="p-6 sm:p-8 text-center">
                    <span className="text-5xl mb-5 block">{p.emoji}</span>
                    <h3 className="font-display font-bold uppercase tracking-wide mb-3 text-base sm:text-lg">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: SOLUTION + FEATURES (dark) */}
      <section ref={featuresRef} className="py-24 px-4 bg-navy relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[200px] pointer-events-none" />
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">
              This Is How Precision Outreach <span className="text-gradient-gold text-glow">Works.</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {solutionFeatures.map((f, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="bg-navy-light border-border/30 hover-float h-full">
                  <CardContent className="p-6 sm:p-7">
                    <div className="w-11 h-11 rounded-lg bg-primary/10 flex items-center justify-center mb-4 border border-primary/30">
                      <f.icon className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="font-display font-bold uppercase tracking-wide mb-2 text-white text-sm">{f.title}</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: CAMPAIGN SEQUENCE (light) */}
      <section className="py-24 px-4 section-white section-textured relative">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">
              The Sequence That Gets You <span className="text-gradient-gold">Accepted.</span>
            </h2>
          </motion.div>

          <motion.div {...fadeUp}>
            {/* Desktop: horizontal timeline */}
            <div className="hidden md:block">
              <div className="relative">
                <div className="absolute top-[60px] left-[8%] right-[8%] h-[2px] bg-gradient-to-r from-primary/20 via-primary/50 to-primary/20" />
                <div className="grid grid-cols-5 gap-4">
                  {[
                    { day: 'Day 0', emoji: '\uD83D\uDC41\uFE0F', label: 'View Profile', sub: '' },
                    { day: 'Day 1', emoji: '\u2B50', label: 'Follow Profile', sub: 'natural warm-up' },
                    { day: 'Day 2', emoji: '\uD83E\uDD1D', label: 'Connection Request', sub: 'with personalized note' },
                    { day: 'If Accepted', emoji: '\u2709\uFE0F', label: 'AI DM', sub: 'within 24h of accept' },
                    { day: 'Day +4', emoji: '\uD83D\uDCE9', label: 'Follow-up', sub: 'if no reply' },
                  ].map((step, i) => (
                    <motion.div key={i} {...stagger(i)} className="flex flex-col items-center text-center relative z-10">
                      <p className="text-xs font-display font-semibold uppercase tracking-wider text-muted-foreground mb-3">{step.day}</p>
                      <div className="w-[80px] h-[80px] rounded-full bg-gold-bg border-2 border-primary flex items-center justify-center text-3xl mb-3">
                        {step.emoji}
                      </div>
                      <p className="font-display font-bold text-xs uppercase tracking-wider">{step.label}</p>
                      {step.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{step.sub}</p>}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile: vertical */}
            <div className="md:hidden space-y-0">
              {[
                { day: 'Day 0', emoji: '\uD83D\uDC41\uFE0F', label: 'View Profile', sub: '' },
                { day: 'Day 1', emoji: '\u2B50', label: 'Follow Profile', sub: 'natural warm-up' },
                { day: 'Day 2', emoji: '\uD83E\uDD1D', label: 'Connection Request', sub: 'with personalized note' },
                { day: 'If Accepted', emoji: '\u2709\uFE0F', label: 'AI DM', sub: 'within 24h of accept' },
                { day: 'Day +4', emoji: '\uD83D\uDCE9', label: 'Follow-up', sub: 'if no reply' },
              ].map((step, i) => (
                <div key={i} className="relative">
                  <div className="flex items-center gap-4 py-3">
                    <div className="w-14 h-14 rounded-full bg-gold-bg border-2 border-primary flex items-center justify-center text-2xl shrink-0">
                      {step.emoji}
                    </div>
                    <div>
                      <p className="text-[10px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{step.day}</p>
                      <p className="font-display font-bold text-sm uppercase tracking-wider">{step.label}</p>
                      {step.sub && <p className="text-[10px] text-muted-foreground">{step.sub}</p>}
                    </div>
                  </div>
                  {i < 4 && <div className="ml-7 w-[2px] h-3 bg-gradient-to-b from-primary/40 to-transparent" />}
                </div>
              ))}
            </div>
          </motion.div>

          <motion.p {...fadeUp} className="text-center text-sm text-muted-foreground mt-10 max-w-lg mx-auto">
            Every action is spaced with random delays, simulating natural human behavior. Max 80 profile visits and 40 connection requests per day, well within LinkedIn's safe thresholds.
          </motion.p>
        </div>
      </section>

      {/* SECTION 6: SAFETY & TRUST (dark) */}
      <section className="py-24 px-4 bg-navy relative overflow-hidden">
        <div className="absolute bottom-0 right-10 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">
              Your Account Is Safe. <span className="text-gradient-gold text-glow">Period.</span>
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-2xl mx-auto">
              LinkedIn Copilot uses browser-based automation with human-like behavior patterns, strict daily limits, and automatic warm-up. Your account stays safe because we follow the same rules a careful human would.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            {trustCards.map((card, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="bg-navy-light border-border/30 hover-float h-full">
                  <CardContent className="p-4 sm:p-6 text-center">
                    <span className="text-3xl sm:text-4xl mb-3 sm:mb-4 block">{card.emoji}</span>
                    <h3 className="font-display font-bold uppercase tracking-wide mb-2 text-white text-xs sm:text-sm">{card.title}</h3>
                    <p className="text-[11px] sm:text-xs text-slate-400 leading-relaxed">{card.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <motion.p {...fadeUp} className="text-center text-sm text-slate-400 mt-10 max-w-xl mx-auto italic">
            "We built LinkedIn Copilot for our own outreach first. If it wasn't safe, we wouldn't use it ourselves."
          </motion.p>
        </div>
      </section>

      {/* SECTION: TESTIMONIALS / SOCIAL PROOF */}
      <section className="py-24 px-4 section-white section-textured relative">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">
              What Sales Teams <span className="text-gradient-gold">Say</span>
            </h2>
            <p className="text-muted-foreground text-sm">Real feedback from B2B professionals using LinkedIn Copilot.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="hover-float h-full border-border">
                  <CardContent className="p-6 sm:p-8 flex flex-col h-full">
                    <Quote className="w-8 h-8 text-primary/30 mb-4" />
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1 italic">"{t.quote}"</p>
                    <div className="mt-5 pt-4 border-t border-border">
                      <p className="font-display font-bold text-sm">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}, {t.company}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 7: PRICING (light) */}
      <section ref={pricingRef} className="py-24 px-4 section-cream section-textured relative">
        <div className="container mx-auto max-w-5xl text-center relative z-10">
          <motion.h2 {...fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">Pricing built for real outreach.</motion.h2>
          <motion.p {...fadeUp} className="text-muted-foreground mb-12">Start free, validate results, then scale with confidence.</motion.p>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {pricing.map((plan, i) => (
              <motion.div key={plan.name} {...stagger(i)}>
                <Card className={`relative hover-float h-full ${plan.highlighted ? 'border-primary border-2 shadow-gold glow-subtle ring-2 ring-primary/20 bg-white/95' : 'bg-white/80'}`}>
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-display font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3" /> Most Popular
                    </div>
                  )}
                  <CardContent className="p-6 pt-8 flex flex-col h-full">
                    <h3 className="text-lg font-display font-bold uppercase tracking-wide">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-4xl font-numbers font-bold">{plan.price}</span>
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
                    </div>
                    {plan.subtitle && <p className="text-xs text-muted-foreground mt-1">{plan.subtitle}</p>}

                    <div className="mt-4 mb-2 space-y-1 text-left">
                      <p className="font-semibold text-sm">{plan.leads}</p>
                      <p className="text-sm text-muted-foreground">{plan.campaigns}</p>
                      {plan.campaignsAlt && (
                        <p className="text-sm text-muted-foreground">{plan.campaignsAlt}</p>
                      )}
                    </div>

                    <ul className="space-y-3 text-sm text-left flex-1 mt-4">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={handleCTA}
                      className={`mt-6 w-full font-display font-bold uppercase tracking-wider rounded-md shine-effect ${plan.highlighted ? 'bg-primary text-primary-foreground hover:bg-gold-light' : ''}`}
                      variant={plan.highlighted ? 'default' : 'outline'}
                    >
                      {plan.cta}
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">{plan.sub}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="max-w-5xl mx-auto mt-10 grid md:grid-cols-3 gap-6 text-left">
            <Card className="bg-white/90">
              <CardContent className="p-6">
                <h3 className="font-bold text-sm mb-2">Everything included</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> AI message generation (notes, DMs, follow-ups)</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> Smart lead filtering: ICP validation + ghost detection</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> Extension-based, safe automation</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-primary mt-0.5" /> You only spend credits on qualified leads</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-white/90">
              <CardContent className="p-6">
                <h3 className="font-bold text-sm mb-2">Safety limits</h3>
                <p className="text-sm text-muted-foreground">Hard caps are enforced to keep accounts safe. New accounts ramp up automatically.</p>
                <div className="mt-3 text-sm text-muted-foreground space-y-1">
                  <p><span className="font-semibold text-foreground">40</span> connection requests/day</p>
                  <p><span className="font-semibold text-foreground">80</span> profile visits/day</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/90">
              <CardContent className="p-6">
                <h3 className="font-bold text-sm mb-2">Team-ready</h3>
                <p className="text-sm text-muted-foreground">Run multiple campaigns, validate messages once, then switch to auto-run.</p>
                <p className="text-xs text-muted-foreground mt-3">Custom plans available for agencies and large teams.</p>
              </CardContent>
            </Card>
          </div>

          <div className="max-w-4xl mx-auto mt-10">
            <Card className="bg-white/95 border-border">
              <CardContent className="p-6">
                <h3 className="text-lg font-bold mb-4 text-left">Plan comparison</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border/60">
                        <th className="py-2 pr-2 font-semibold">Feature</th>
                        <th className="py-2 px-2 font-semibold">Free</th>
                        <th className="py-2 pl-2 font-semibold">Pro</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {pricingCompare.map(row => (
                        <tr key={row.feature}>
                          <td className="py-2 pr-2 text-muted-foreground">{row.feature}</td>
                          <td className="py-2 px-2">{row.free}</td>
                          <td className="py-2 pl-2">{row.pro}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="max-w-3xl mx-auto mt-8">
            <Card className="border-dashed border-2 border-border bg-white/80">
              <CardContent className="p-6 flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Zap className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-sm">Need higher volumes?</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    For larger teams or higher limits, contact us and we'll build a custom plan.
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

          <div className="max-w-3xl mx-auto mt-8">
            <Card className="bg-white/90">
              <CardContent className="p-8 text-left">
                <h3 className="text-xl font-bold mb-3">Why 1,000 outreach credits?</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Not every lead in your CSV is worth reaching out to. Some are ghost profiles with no real LinkedIn activity. Others don't match your ideal customer profile. Sending messages to these leads wastes your time and hurts your reply rates.</p>
                  <p>That's why we built a smart filtering pipeline. Upload up to 3,000 leads per month — our system enriches each one, validates them against your ICP using Gemini 2.5 Pro, and automatically detects ghost profiles. Only the leads that pass every check become outreach-ready and count against your 1,000 credits.</p>
                  <p>The result: every message you send goes to a real, qualified prospect. Higher acceptance rates, better conversations, more deals.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* SECTION 8: FAQ (light) */}
      <section className="py-24 px-4 section-white section-textured relative">
        <div className="container mx-auto max-w-2xl relative z-10">
          <motion.h2 {...fadeUp} className="text-2xl sm:text-3xl md:text-4xl font-display font-bold uppercase tracking-tight text-center mb-4">
            Frequently Asked <span className="text-gradient-gold">Questions</span>
          </motion.h2>
          <motion.p {...fadeUp} className="text-center text-muted-foreground text-sm mb-10">
            Everything you need to know about LinkedIn automation and LinkedIn Copilot.
          </motion.p>
          <motion.div {...fadeUp}>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`faq-${i}`} className="bg-card border rounded-lg px-4 hover-lift">
                  <AccordionTrigger className="text-sm font-medium text-left">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* SECTION: ABOUT / E-E-A-T */}
      <section className="py-20 px-4 section-cream section-textured relative">
        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-display font-bold text-2xl md:text-3xl uppercase tracking-tight mb-6">
              Built by a <span className="text-gradient-gold">Practitioner</span>
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-4">
              LinkedIn Copilot was created by a B2B sales professional who sends over 1,000 personalized LinkedIn messages every month. After testing every major LinkedIn automation tool on the market, the gaps were clear: generic templates, no ICP validation, and messages that sounded like bots.
            </p>
            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-2xl mx-auto">
              So we built the tool we wanted to use ourselves &mdash; one that reads full profiles, writes messages that prove you actually looked, and only reaches out to people who match your ideal customer profile. LinkedIn Copilot is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-gold-light transition-colors font-semibold">scan<em>to</em>sell.io</a>, a B2B sales technology company focused on AI-powered outreach and lead generation.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION 9: FINAL CTA (dark) */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-3xl text-center">
          <motion.div
            {...fadeUp}
            className="bg-navy rounded-2xl p-8 sm:p-12 md:p-16 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-extrabold uppercase tracking-tight text-white mb-4">
                Ready to Fly?
              </h2>
              <p className="text-slate-400 text-sm mb-8 max-w-lg mx-auto">
                Stop sending LinkedIn messages that sound like everyone else's. Start sending ones that prove you actually looked, powered by GPT-5, validated by Gemini 2.5 Pro, delivered with military precision.
              </p>
              <Button
                onClick={handleCTA}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-gold-light px-8 py-6 text-sm sm:text-base font-display font-bold uppercase tracking-wider rounded-lg animate-pulse-glow shine-effect"
              >
                Start Free &mdash; 50 Outreach Credits
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-slate-500 text-xs mt-4">
                Free plan includes GPT-5 powered DMs, Gemini 2.5 Pro ICP validation, ghost profile detection, Chrome Extension, and 50 outreach credits with smart lead filtering.
              </p>
              <p className="text-gold-light text-xs font-display font-semibold uppercase tracking-widest mt-6 text-glow">
                Lock On Target. Deploy Precision Messages. Close Deals.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* -- FOOTER -- */}
      <footer className="bg-navy py-16 px-4">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="md:w-2/5">
              <img src={logoImg} alt="LinkedIn Copilot \u2014 AI-powered B2B LinkedIn automation platform" className="h-20 w-auto mb-5" />
              <p className="text-sm text-sidebar-foreground/70 leading-relaxed max-w-xs">LinkedIn Copilot: AI-powered LinkedIn automation built by a practitioner who sends 1,000+ personalized messages a month. Safe, profile-based B2B outreach at scale.</p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-gold-light mb-4">Product</h4>
                <ul className="space-y-2.5 text-sm text-sidebar-foreground">
                  <li><button onClick={() => scrollTo(howRef)} className="hover:text-gold-light transition-colors">How it Works</button></li>
                  <li><button onClick={() => scrollTo(featuresRef)} className="hover:text-gold-light transition-colors">Features</button></li>
                  <li><button onClick={() => scrollTo(pricingRef)} className="hover:text-gold-light transition-colors">Pricing</button></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-gold-light mb-4">Resources</h4>
                <ul className="space-y-2.5 text-sm text-sidebar-foreground">
                  <li><Link to="/help" className="hover:text-gold-light transition-colors">Help Center</Link></li>
                  <li><Link to="/setup-guide" className="hover:text-gold-light transition-colors">Setup Guide</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-gold-light mb-4">Legal</h4>
                <ul className="space-y-2.5 text-sm text-sidebar-foreground">
                  <li><span className="cursor-default">Privacy Policy</span></li>
                  <li><span className="cursor-default">Terms of Service</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-primary mt-10 pt-6 text-center">
            <p className="text-sm text-sidebar-foreground/50 mb-2">
              LinkedIn Copilot is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-gold-light hover:text-primary transition-colors font-medium">scan<em>to</em>sell.io</a>
            </p>
            <p className="text-xs text-muted-foreground">&copy; 2026 scan<em>to</em>sell.io &middot; All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
