import { useAuth } from '@/hooks/useAuth';
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
  Ghost, TrendingUp, Heart, MessageCircle, Repeat, Radar,
} from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import Logo from '@/components/Logo';
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
  const modesRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<HTMLDivElement>(null);

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
    { num: '\u2462', title: 'AI Validates Your ICP', desc: 'Claude Haiku cross-checks every lead against your ideal customer profile. Only qualified leads move forward.' },
    { num: '\u2463', title: 'Launch Campaign', desc: 'Our Chrome Extension visits profiles on autopilot.' },
    { num: '\u2464', title: 'AI Writes Your DMs', desc: 'When they accept, Claude Sonnet reads their full profile and crafts a unique message. You approve, then send.' },
  ];

  const growthSteps = [
    { num: '\u2460', title: 'Pick Target Profiles', desc: 'Add LinkedIn URLs of thought leaders or ICP profiles in your niche. These are the accounts whose audience you want to tap into.' },
    { num: '\u2461', title: 'AI Finds Their Posts', desc: 'The extension visits each profile and finds their latest content automatically — articles, posts, shared content.' },
    { num: '\u2462', title: 'Smart Engagement', desc: 'Likes are sent first, then Claude Haiku generates a thoughtful comment referencing specific points in the post. Never generic, always relevant.' },
    { num: '\u2463', title: 'Weekly Cycles', desc: 'Every 7 days, the cycle repeats with fresh content. Your account stays active and visible in your niche without manual effort.' },
  ];

  const painPoints = [
    { emoji: '\uD83C\uDFAF', title: 'GENERIC MESSAGES', desc: '"Hi {firstName}, I\'d love to connect..." Sound familiar? Your prospects get 20 of these a day. Yours gets deleted with the rest. Claude Sonnet writes messages that reference their actual career, company, and background, so they know you actually looked.' },
    { emoji: '\uD83E\uDD16', title: 'WRONG PEOPLE', desc: 'You\'re sending connection requests to people who will never buy from you. Generic titles like "CEO" match every industry. Our Claude Haiku ICP check filters out mismatches before a single request is sent, so every connection counts.' },
    { emoji: '\uD83D\uDCC9', title: 'WASTED TIME', desc: 'Hours spent writing messages one by one, or blasting the same template to 1,000 people and wondering why nobody replies. LinkedIn Copilot automates the entire sequence while you focus on closing the replies that come back.' },
  ];

  const solutionFeatures = [
    { icon: Upload, title: 'Import From Anywhere', desc: 'Bring leads from any source — Sales Navigator, Instantly SuperSearch, Apollo, Lusha, or your own research. Just upload a CSV with LinkedIn URLs. Our AI agents handle enrichment, ICP validation, and personalization.' },
    { icon: Bot, title: 'Profile-Based Messages', desc: 'Our AI agents capture full LinkedIn profile data, experience, education, skills, without touching your account. Then Claude Sonnet crafts a message that proves you did your homework.' },
    { icon: Globe, title: '30+ Languages', desc: 'Your prospect speaks Portuguese? Claude Sonnet writes in Portuguese. French? German? Japanese? 30+ languages, automatically detected from their profile.' },
    { icon: RefreshCw, title: 'Automated Sequences', desc: 'Visit profile \u2192 follow \u2192 like a post \u2192 send connection request \u2192 DM \u2192 follow-up. The entire sequence runs on autopilot with human-like delays. Set it once, leads flow in daily.' },
    { icon: Check, title: 'AI-Powered ICP Check', desc: 'Before any outreach starts, Claude Haiku compares each lead against your ideal customer profile using real LinkedIn data. Mismatches get filtered out automatically.' },
    { icon: Eye, title: 'Ghost Profile Detection', desc: 'Not everyone on LinkedIn is actually active. Our AI detects ghost profiles \u2014 accounts with minimal data, no skills, no about section, few connections \u2014 and automatically skips them. Zero credits wasted on people who will never see your message.' },
    { icon: BarChart3, title: 'One Dashboard', desc: 'Leads, messages, follow-ups, replies, your entire pipeline on one screen. Approve DMs one by one or in batch. Nothing sends without your say-so.' },
    { icon: TrendingUp, title: 'Growth Mode', desc: 'Build your LinkedIn presence on autopilot. The extension engages with target profiles\' content — likes, AI-generated comments — making you visible to their audience. Perfect for new accounts or expanding your reach.' },
    { icon: MessageCircle, title: 'AI Comments', desc: 'Claude Haiku writes contextual comments that reference specific points in the post. Five style variants rotate automatically — questions, experiences, challenges — so you never sound repetitive.' },
  ];

  const trustCards = [
    { emoji: '\uD83D\uDEE1\uFE0F', title: 'Daily Limits', desc: 'Max 80 profile visits and 40 connection requests per day. These limits are enforced automatically, you can\'t accidentally exceed them.' },
    { emoji: '\u23F1\uFE0F', title: 'Human Delays', desc: 'Random pauses between every action, just like a real person browsing LinkedIn. No robotic patterns that trigger alerts.' },
    { emoji: '\uD83D\uDD25', title: 'Warm-Up Built In', desc: 'New accounts start with lower daily limits and gradually ramp up over weeks, exactly how a real person would naturally grow their activity.' },
    { emoji: '\uD83E\uDDD1\u200D\uD83D\uDCBB', title: 'Runs In Your Browser', desc: 'Our Chrome Extension acts as you, from your own browser and IP address. No cloud servers, no proxy farms. LinkedIn sees you, not a bot.' },
  ];


  const faqs = [
    { q: 'What is LinkedIn automation?', a: 'LinkedIn automation is the practice of using software to automate repetitive LinkedIn tasks such as sending connection requests, follow-ups, and direct messages. LinkedIn Copilot is an AI-powered LinkedIn automation tool that goes beyond simple templates \u2014 it reads each prospect\'s full profile and generates personalized messages using Claude Sonnet, while validating leads against your Ideal Customer Profile using Claude Haiku.' },
    { q: 'Is LinkedIn automation safe? Will I get banned?', a: 'LinkedIn Copilot is designed with safety as the top priority. It runs as a Chrome Extension in your own browser (no cloud servers or proxy farms), enforces strict daily limits (80 profile visits, 40 connection requests), uses random human-like delays between actions, and includes automatic warm-up for new accounts. These measures keep your activity well within LinkedIn\'s safe thresholds.' },
    { q: 'How does LinkedIn Copilot validate leads against my ICP?', a: 'LinkedIn Copilot uses Claude Haiku to automatically enrich every lead with full LinkedIn profile data, then validates them against your Ideal Customer Profile using real headlines, titles, career history, and company data. Leads that don\'t match your ICP are filtered out before any outreach begins.' },
    { q: 'How are the messages personalized?', a: 'Our AI agents capture full public LinkedIn profile data \u2014 experience, education, skills, about section \u2014 without using your account. Claude Sonnet then writes a unique message for each prospect, referencing their actual background. No templates, no {firstName} placeholders.' },
    { q: 'How many connection requests can I send per day?', a: 'LinkedIn Copilot enforces a maximum of 40 connection requests and 80 profile visits per day. These limits are well within LinkedIn\'s safe thresholds and cannot be overridden. New accounts start with lower limits that gradually ramp up over weeks.' },
    { q: 'Where do I get leads?', a: 'LinkedIn Copilot works with leads from any source. Export from Sales Navigator, Instantly SuperSearch, Apollo, Lusha, or build your own list. Just upload a CSV with LinkedIn profile URLs and we handle the rest \u2014 enrichment, ICP validation, and personalized messaging.' },
    { q: 'What\'s the difference between LinkedIn Copilot and other automation tools?', a: 'Most LinkedIn automation tools use simple templates with {firstName} and {companyName} placeholders. LinkedIn Copilot reads the full LinkedIn profile \u2014 about section, career history, education, skills \u2014 and generates truly personalized messages using Claude Sonnet. It also includes AI-powered ICP validation, which filters out bad-fit leads before any outreach begins.' },
    { q: 'How long does it take to set up a campaign?', a: 'You can go from zero to personalized LinkedIn conversations in under 10 minutes. Upload a CSV with LinkedIn URLs, define your ICP criteria, set your message tone, and launch. The Chrome Extension handles everything automatically.' },
    { q: 'What happens after the free 50 outreach credits?', a: 'Your existing leads continue processing through the full outreach sequence. You just can\'t add new leads until you upgrade to Pro ($147/month for 1,000 outreach credits). No data is lost.' },
    { q: 'Can I run campaigns in other languages?', a: 'Yes. Claude Sonnet detects your prospect\'s language from their LinkedIn profile and writes in that language automatically. Over 30 languages are supported, including Portuguese, French, German, Spanish, and Japanese.' },
    { q: 'Can I edit the AI messages before sending?', a: 'Always. You maintain full control \u2014 you can approve, edit, regenerate, or reject any message. Nothing is ever sent without your explicit approval. You can review messages one by one or use batch approval.' },
    { q: 'How does LinkedIn Copilot compare to manual outreach?', a: 'Manual LinkedIn outreach typically allows 15-20 personalized messages per day and takes 2-3 hours. LinkedIn Copilot automates the entire sequence \u2014 profile visits, follows, connection requests, and personalized DMs \u2014 processing up to 40 leads per day with AI-written messages that reference each prospect\'s actual background.' },
    { q: 'What are Ghost Profiles and why does LinkedIn Copilot skip them?', a: 'Ghost profiles are LinkedIn accounts with minimal activity \u2014 no about section, few skills, no education, barely any connections. These users rarely check LinkedIn and will never see your connection request or message. LinkedIn Copilot automatically detects and skips ghost profiles so you don\'t waste credits or daily limits on people who aren\'t actually active on the platform.' },
    { q: 'What is Growth Mode?', a: 'Growth Mode is a separate campaign type designed to build your LinkedIn authority over time. Instead of sending connection requests and DMs, Growth Mode engages with content posted by thought leaders in your niche. It visits their profiles, finds their latest posts, likes them, and posts AI-generated contextual comments. This makes your profile visible to their audience and helps grow your follower count, connection quality, and overall LinkedIn presence organically.' },
    { q: 'How does AI comment generation work?', a: 'When Growth Mode finds a post from one of your target profiles, Claude Haiku reads the full post content and generates a contextual comment. The AI rotates between five distinct comment styles \u2014 observation with a question, personal experience, expanding on a point, respectful challenge, and data-backed insight \u2014 so your engagement always looks natural and varied. Comments reference specific details from the post and never use generic phrases like "Great post!" or "Love this!".' },
    { q: 'What is the Network module?', a: 'Network grows your LinkedIn network with people who match your Ideal Customer Profiles, without importing any list. You describe one or more ICPs, and the Chrome extension runs LinkedIn people searches from your own account (no Sales Navigator needed), favoring 2nd-degree contacts you share connections with. Claude Haiku scores each person for fit, and qualified people receive a connection request without a note, inside your weekly limit. Network also watches posts from people in your ICPs and drafts a comment for each, shown next to the original post so you can spot business opportunities, edit, and approve one by one or in bulk.' },
    { q: 'Can I use Outreach and Growth modes together?', a: 'Yes. You can run Outreach campaigns and Growth campaigns simultaneously from the same LinkedIn account. They operate independently \u2014 Growth Mode engages with content from thought leaders in your niche, while Outreach Mode handles connection requests and personalized DMs to your leads. Using both together is a powerful strategy: Growth Mode warms up your profile and builds credibility, while Outreach Mode converts that credibility into conversations.' },
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
        'Growth Mode: 10 target profiles',
        'Network: ICP prospecting + comment queue',
        'Manual DM approval only',
      ],
      cta: 'Start Free',
      sub: 'No credit card required.',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$147',
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
        'Growth Mode: unlimited target profiles',
        'AI-generated comments with 5 style variants',
        'Network: ICP prospecting + comment queue',
        'Batch DM and comment approval',
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
    { feature: 'Growth Mode profiles', free: '10', pro: 'Unlimited' },
    { feature: 'AI comments', free: 'Included', pro: 'Included (5 style variants)' },
    { feature: 'Approval flow', free: 'Manual only', pro: 'Batch + auto-run' },
    { feature: 'Chrome extension limits', free: 'Standard', pro: 'Smart limits' },
    { feature: 'Support', free: 'Community', pro: 'Priority' },
  ];

  return (
    <div className="min-h-screen bg-background" itemScope itemType="https://schema.org/WebPage">
      {/* -- NAVBAR -- */}
      <nav className="fixed top-0 w-full z-50 bg-navy/95 backdrop-blur border-b border-white/[0.06]" aria-label="Main navigation" role="navigation">
        <div className="max-w-[1240px] mx-auto flex items-center justify-between h-[72px] px-4 sm:px-6 gap-4">
          <Link to="/" className="flex items-center gap-3 text-white" aria-label="LinkedIn Copilot home">
            <BrandMark className="w-8 h-8" />
            <span className="font-display font-bold text-lg sm:text-xl tracking-[0.06em] uppercase whitespace-nowrap"><span className="hidden sm:inline">LinkedIn </span>Copilot</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-[15px] text-slate-300">
            <button onClick={() => scrollTo(modesRef)} className="hover:text-white transition-colors">Modes</button>
            <button onClick={() => scrollTo(networkRef)} className="hover:text-white transition-colors">Network</button>
            <button onClick={() => scrollTo(howRef)} className="hover:text-white transition-colors">How it works</button>
            <button onClick={() => scrollTo(pricingRef)} className="hover:text-white transition-colors">Pricing</button>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-[15px] text-white px-3 py-2.5 whitespace-nowrap hover:text-primary transition-colors">Log in</Link>
            <Button onClick={handleCTA} className="bg-primary text-primary-foreground hover:bg-gold-light font-semibold rounded-lg h-11 px-5">
              Start free
            </Button>
          </div>
        </div>
      </nav>

      {/* SECTION 1: HERO */}
      <main>
      <section className="bg-navy text-white pt-[72px] relative overflow-hidden" aria-label="Hero">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-16 md:py-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-7">
            <h1 className="sr-only">LinkedIn Copilot: AI-Powered LinkedIn Automation for B2B Sales Outreach</h1>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="font-mono-label text-xs text-primary">
              Outreach · Growth · Network <span className="text-slate-500">//</span> powered by Claude
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' as const }}
              aria-hidden="true"
              className="font-display font-bold uppercase leading-[0.92] tracking-tight m-0"
              style={{ fontSize: 'clamp(48px, 6.3vw, 92px)' }}
            >
              You set the course.<br /><span className="text-primary">Copilot flies it.</span>
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }} className="text-lg sm:text-xl text-slate-300 max-w-[34ch] m-0">
              Define your ideal customer once. Copilot finds them on LinkedIn, connects, writes the messages and drafts the comments. Nothing goes out that you would not have sent yourself.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="flex flex-wrap items-center gap-4">
              <Button onClick={handleCTA} size="lg" className="bg-primary text-primary-foreground hover:bg-gold-light font-semibold text-base rounded-xl h-14 px-6">
                Start free · 50 outreach credits <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <button onClick={() => scrollTo(networkRef)} className="text-base text-white py-3 border-b border-slate-600 hover:border-primary transition-colors">
                See the Network module
              </button>
            </motion.div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400 list-none p-0 m-0">
              {['No credit card', 'Works with free LinkedIn', 'Chrome extension, 30-second setup'].map(t => (
                <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{t}</li>
              ))}
            </ul>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="bg-navy-light/60 border border-[#22304A] rounded-[20px] p-5 sm:p-6 flex flex-col gap-5 shadow-hero"
            aria-hidden="true"
          >
            <div className="flex justify-between items-center font-mono-label text-[11px] text-slate-400">
              <span>ICP radar · Ops leaders, Florida</span>
              <span className="flex items-center gap-2 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Scanning</span>
            </div>
            <div className="relative aspect-[1.6/1] rounded-2xl bg-navy border border-[#1C2740] overflow-hidden">
              <svg viewBox="0 0 480 300" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <radialGradient id="lc-sweep" cx="240" cy="150" r="200" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stopColor="#E0A82E" stopOpacity="0.35" />
                    <stop offset="1" stopColor="#E0A82E" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <g fill="none" stroke="#22304A">
                  <circle cx="240" cy="150" r="50" /><circle cx="240" cy="150" r="100" /><circle cx="240" cy="150" r="150" /><circle cx="240" cy="150" r="200" />
                  <path d="M40 150h400M240 -50v400" />
                </g>
                <g className="lc-radar-sweep" style={{ transformOrigin: '240px 150px' }}>
                  <path d="M240 150 L 418 60 A 200 200 0 0 1 440 150 Z" fill="url(#lc-sweep)" />
                </g>
                <g fill="#E0A82E"><circle cx="330" cy="102" r="6" /><circle cx="182" cy="96" r="4" /><circle cx="300" cy="214" r="5" /><circle cx="140" cy="190" r="3.5" /><circle cx="378" cy="168" r="4.5" /></g>
                <g fill="#4A5A7A"><circle cx="210" cy="230" r="3" /><circle cx="120" cy="120" r="3" /><circle cx="268" cy="70" r="3" /><circle cx="350" cy="240" r="3" /></g>
                <circle cx="330" cy="102" r="14" fill="none" stroke="#E0A82E" strokeOpacity="0.6" />
                <circle cx="240" cy="150" r="5" fill="#E8ECF4" />
              </svg>
              <div className="absolute left-[60%] top-[12%] bg-navy-light border border-[#3A4A6B] rounded-xl px-3 py-2.5 text-[13px] leading-snug min-w-[160px]">
                <div className="font-semibold">Marina Alves</div>
                <div className="text-slate-400">VP Operations · 14 mutual</div>
                <div className="font-mono text-[11px] text-primary mt-1">FIT 92 · QUALIFIED</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-navy-light rounded-xl p-3.5">
                <div className="font-mono-label text-[10px] text-slate-400">Invites / week</div>
                <div className="font-display text-[32px] font-semibold leading-tight">64<span className="text-slate-500 text-xl">/100</span></div>
                <div className="h-1 bg-[#22304A] rounded"><div className="h-1 w-[64%] bg-primary rounded" /></div>
              </div>
              <div className="bg-navy-light rounded-xl p-3.5">
                <div className="font-mono-label text-[10px] text-slate-400">Accepted</div>
                <div className="font-display text-[32px] font-semibold leading-tight">41%</div>
                <div className="text-[13px] text-emerald-400">+26 contacts</div>
              </div>
              <div className="bg-navy-light rounded-xl p-3.5">
                <div className="font-mono-label text-[10px] text-slate-400">To approve</div>
                <div className="font-display text-[32px] font-semibold leading-tight">7</div>
                <div className="text-[13px] text-amber-300">2 signals</div>
              </div>
            </div>
          </motion.div>
        </div>
        <div className="border-t border-white/[0.06] bg-[#0D1322]">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-5 flex flex-wrap justify-between gap-4 font-mono-label text-[11px] text-slate-400">
            <span>Claude Sonnet writes · Claude Haiku qualifies</span>
            <span>No Sales Navigator required</span>
            <span>Human approval on every comment</span>
            <span>30+ languages</span>
          </div>
        </div>
      </section>

      {/* SECTION: WHAT IS LINKEDIN AUTOMATION? (AEO) */}
      <section id="what-is-linkedin-automation" className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tight mb-6">
              What Is <span className="text-gradient-gold">LinkedIn Automation?</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
              LinkedIn automation is the practice of using software to automate repetitive LinkedIn tasks &mdash; sending connection requests, follow-ups, and personalized direct messages at scale. Unlike basic tools that rely on {'{firstName}'} templates, <strong>LinkedIn Copilot</strong> is an AI-powered B2B LinkedIn automation platform with two distinct modes: <strong>Outreach Mode</strong> reads each prospect's full profile and generates truly personalized messages using Claude Sonnet, while <strong>Growth Mode</strong> builds your LinkedIn authority by engaging with thought leaders' content through AI-generated comments. Every lead is validated against your Ideal Customer Profile using Claude Haiku before any outreach begins, ensuring you only connect with qualified prospects.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION: THREE MODES */}
      <section ref={modesRef} id="modes" className="py-20 md:py-28 px-4 sm:px-6 section-white border-t border-border/60">
        <div className="max-w-[1240px] mx-auto flex flex-col gap-12">
          <motion.div {...fadeUp} className="flex flex-col gap-3 max-w-3xl">
            <div className="font-mono-label text-xs text-gold-dark">01 // Three modes</div>
            <h2 className="font-display font-bold uppercase leading-[0.98] m-0" style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}>
              One cockpit for every way you sell on LinkedIn
            </h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { icon: Target, title: 'Outreach', isNew: false, desc: 'Bring a lead list. Copilot validates each person against your ICP, skips ghost profiles and writes a DM from their actual career.', bullets: ['Visit, follow, connect, DM, follow up', 'Only outreach-ready leads use credits', 'Batch DM approval'] },
              { icon: TrendingUp, title: 'Growth', isNew: false, desc: 'Stay visible next to the voices your buyers follow. Copilot finds their newest posts and drafts comments worth reading.', bullets: ['Five comment styles, never "Great post!"', 'Weekly engagement cycles', 'Your profile in front of their audience'] },
              { icon: Radar, title: 'Network', isNew: true, desc: 'No spreadsheet. Describe who you want to know, and Copilot prospects LinkedIn itself, favoring people you share connections with.', bullets: ['Invites without a note, inside weekly limits', 'A dashboard of new contacts by ICP', 'Comment queue with the original post'] },
            ].map((m, i) => (
              <motion.article key={m.title} {...stagger(i)}
                className={`relative rounded-[18px] p-8 flex flex-col gap-4 border ${m.isNew ? 'bg-navy text-white border-primary' : 'bg-card border-border'}`}
              >
                {m.isNew && <span className="absolute top-6 right-6 font-mono-label text-[11px] bg-primary text-primary-foreground px-2 py-1 rounded-md">New</span>}
                <m.icon className={`w-9 h-9 ${m.isNew ? 'text-primary' : 'text-gold-dark'}`} strokeWidth={1.5} />
                <h3 className="font-display font-semibold text-[32px] uppercase leading-none m-0">{m.title}</h3>
                <p className={`m-0 ${m.isNew ? 'text-slate-300' : 'text-muted-foreground'}`}>{m.desc}</p>
                <ul className="list-none p-0 m-0 flex flex-col gap-2.5 text-[15px]">
                  {m.bullets.map(b => (
                    <li key={b} className="flex gap-2.5 items-start"><Check className={`w-4 h-4 mt-1 shrink-0 ${m.isNew ? 'text-primary' : 'text-gold-dark'}`} />{b}</li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION: NETWORK SPOTLIGHT */}
      <section ref={networkRef} id="network" className="py-20 md:py-28 px-4 sm:px-6 bg-navy text-white">
        <div className="max-w-[1240px] mx-auto grid lg:grid-cols-2 gap-14 items-center">
          <motion.div {...fadeUp} className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <div className="font-mono-label text-xs text-primary">02 // Network module</div>
              <h2 className="font-display font-bold uppercase leading-[0.98] m-0" style={{ fontSize: 'clamp(40px, 5vw, 64px)' }}>
                Read the post. Spot the deal. Approve in one click.
              </h2>
              <p className="text-lg text-slate-300 m-0">
                Copilot watches what people in your ICP are posting and drafts a comment for each. You see their words next to the suggestion, so a buying signal never slips by.
              </p>
            </div>
            <ol className="list-none p-0 m-0 border-t border-[#22304A]">
              {[
                ['Define one or more ICPs.', 'Titles, locations, keywords, topics they post about.'],
                ['Copilot prospects.', 'People search on your own account, scored for fit by Claude.'],
                ['It connects.', 'No note, spaced through your active hours, withdrawn after 21 days.'],
                ['You approve the comments.', 'Edit inline or approve the whole queue at once.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-5 py-4 border-b border-[#22304A]">
                  <span className="font-mono text-sm text-primary pt-0.5">0{i + 1}</span>
                  <span><strong className="font-semibold">{t}</strong> <span className="text-slate-400">{d}</span></span>
                </li>
              ))}
            </ol>
          </motion.div>

          <motion.div {...stagger(1)} aria-hidden="true" className="bg-background text-foreground rounded-[20px] p-6 flex flex-col gap-4 shadow-hero">
            <div className="flex gap-3 items-center">
              <div className="w-11 h-11 rounded-full bg-navy text-primary grid place-items-center font-semibold">RT</div>
              <div className="flex-1">
                <div className="font-semibold">Rafael Teixeira</div>
                <div className="text-sm text-muted-foreground">Director of Facilities · 2nd · 3h</div>
              </div>
              <span className="text-xs font-semibold bg-gold-bg text-[#7A4B00] px-2.5 py-1 rounded-full">Business signal</span>
            </div>
            <p className="m-0 text-[15px] leading-relaxed p-4 bg-card border border-border rounded-xl">
              We are consolidating three sites into one control room next quarter. Still looking for a partner who has done this in a 24/7 operation, not just on paper.
            </p>
            <div className="text-[13px] text-[#7A4B00] flex gap-2 items-center"><Sparkles className="w-3.5 h-3.5" />Actively looking for a vendor</div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Suggested comment</span>
              <p className="m-0 text-[15px] leading-relaxed p-4 bg-card border-[1.5px] border-[#C99526] rounded-xl">
                The hardest part we have seen is the cutover week, when both sites still need eyes on them. Are you planning a parallel run or a hard switch?
              </p>
            </div>
            <div className="flex gap-2.5 justify-end">
              <span className="px-4 py-2.5 rounded-lg border border-border font-medium">Skip</span>
              <span className="px-5 py-2.5 rounded-lg bg-navy text-background font-semibold">Approve</span>
            </div>
          </motion.div>
        </div>
      </section>

      {/* SECTION 2: HOW IT WORKS (light) */}
      <section ref={howRef} id="how-it-works" className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-16">
            <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tight">
              How It <span className="text-gradient-gold">Works</span>
            </h2>
            <p className="text-lg text-gray-600 mt-3 max-w-2xl mx-auto">Two modes, same simplicity. Set up in minutes, then it runs on autopilot.</p>
          </motion.div>

          <motion.div {...fadeUp} className="mb-8">
            <h3 className="text-xl font-display font-bold uppercase tracking-wide text-center mb-2">
              <Target className="w-5 h-5 inline-block mr-2 text-primary" />
              Outreach Mode
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6">5 steps to precision outreach</p>
          </motion.div>

          {/* Desktop: horizontal */}
          <div className="hidden md:block">
            <div className="grid grid-cols-5 gap-8 relative">
              <div className="absolute top-[40px] left-[10%] right-[10%] h-[2px] bg-gradient-to-r from-primary/20 via-primary/60 to-primary/20 z-0" />
              {howSteps.map((s, i) => (
                <motion.div key={i} {...stagger(i)} className="flex flex-col items-center text-center relative z-10">
                  <div className="w-20 h-20 rounded-full bg-gold-bg border-2 border-primary flex items-center justify-center text-2xl font-display font-extrabold text-primary mb-4 shadow-soft">
                    {s.num}
                  </div>
                  <h3 className="font-display font-bold text-xs uppercase tracking-wider mb-1.5">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-snug max-w-[160px]">{s.desc}</p>
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

          {/* Growth Mode Steps */}
          <div className="mt-16 pt-16 border-t border-border/40">
            <motion.div {...fadeUp} className="mb-8">
              <h3 className="text-xl font-display font-bold uppercase tracking-wide text-center mb-2">
                <TrendingUp className="w-5 h-5 inline-block mr-2 text-emerald-600" />
                Growth Mode
              </h3>
              <p className="text-sm text-gray-500 text-center mb-6">4 steps to build your LinkedIn authority</p>
            </motion.div>

            {/* Desktop: horizontal */}
            <div className="hidden md:block">
              <div className="grid grid-cols-4 gap-8 relative">
                <div className="absolute top-[40px] left-[12%] right-[12%] h-[2px] bg-gradient-to-r from-emerald-400/20 via-emerald-400/60 to-emerald-400/20 z-0" />
                {growthSteps.map((s, i) => (
                  <motion.div key={i} {...stagger(i)} className="flex flex-col items-center text-center relative z-10">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-400 flex items-center justify-center text-2xl font-display font-extrabold text-emerald-600 mb-4 shadow-soft">
                      {s.num}
                    </div>
                    <h3 className="font-display font-bold text-xs uppercase tracking-wider mb-1.5">{s.title}</h3>
                    <p className="text-xs text-muted-foreground leading-snug max-w-[180px]">{s.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Mobile: vertical */}
            <div className="md:hidden space-y-0">
              {growthSteps.map((s, i) => (
                <motion.div key={i} {...stagger(i)} className="relative">
                  <div className="flex items-center gap-4 py-4">
                    <div className="w-14 h-14 rounded-full bg-emerald-50 border-2 border-emerald-400 flex items-center justify-center text-lg font-display font-extrabold text-emerald-600 shrink-0">
                      {s.num}
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-sm uppercase tracking-wider">{s.title}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                    </div>
                  </div>
                  {i < growthSteps.length - 1 && (
                    <div className="ml-7 w-[2px] h-3 bg-gradient-to-b from-emerald-400/40 to-transparent" />
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: PAIN POINTS (light) */}
      <section className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">
              Your LinkedIn Outreach Is Broken.
            </h2>
            <p className="text-lg sm:text-xl font-display font-semibold uppercase tracking-wide text-muted-foreground">Here's Why.</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {painPoints.map((p, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="hover-float h-full border-amber-200 bg-amber-50 rounded-2xl shadow-sm border-l-4 border-l-amber-400">
                  <CardContent className="p-6 sm:p-8 text-center">
                    <span className="text-5xl mb-5 block text-amber-600">{p.emoji}</span>
                    <h3 className="font-display font-bold uppercase tracking-wide mb-3 text-base sm:text-lg">{p.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{p.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4: SOLUTION + FEATURES (dark) */}
      <section ref={featuresRef} id="features" className="py-20 md:py-28 px-4 bg-navy relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[200px] pointer-events-none" />
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">
              This Is How Precision Outreach <span className="text-gradient-gold text-glow">Works.</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {solutionFeatures.map((f, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="bg-navy-light border-border/30 hover-float h-full rounded-2xl shadow-sm">
                  <CardContent className="p-6 sm:p-8">
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

      {/* SECTION: COMPETITOR COMPARISON */}
      <section className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-3">
              Not Another <span className="text-gradient-gold">Template Tool</span>
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Real personalization beats merge tags every time. Here’s the difference.
            </p>
          </motion.div>

          <Card className="bg-white/95 border-border rounded-2xl shadow-sm">
            <CardContent className="p-6 md:p-8">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="py-3 pr-3 font-semibold">Feature</th>
                      <th className="py-3 px-3 font-semibold">Dripify / Expandi / Waalaxy</th>
                      <th className="py-3 pl-3 font-semibold bg-amber-50/60 rounded-tr-xl">LinkedIn Copilot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">Message Personalization</td>
                      <td className="py-3 px-3">Template with {'{firstName}'} merge tags</td>
                      <td className="py-3 pl-3 bg-amber-50/60">AI reads full profile, writes unique message per lead</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">ICP Filtering</td>
                      <td className="py-3 px-3">Manual list building, filter by title only</td>
                      <td className="py-3 pl-3 bg-amber-50/60">AI analyzes employer company to validate fit</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">Campaign Setup</td>
                      <td className="py-3 px-3">Complex sequence builder with 10+ steps</td>
                      <td className="py-3 pl-3 bg-amber-50/60">Simple wizard — set ICP, tone, and go</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">Warm-up</td>
                      <td className="py-3 px-3">Basic or none</td>
                      <td className="py-3 pl-3 bg-amber-50/60">3-day warm-up: visit → follow → personalized note</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">Message Quality</td>
                      <td className="py-3 px-3">"Hi {'{firstName}'}, I noticed you work at {'{company}'}..."</td>
                      <td className="py-3 pl-3 bg-amber-50/60">Mentions specific details from their profile, role, and company context</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">Account Growth</td>
                      <td className="py-3 px-3">Not available</td>
                      <td className="py-3 pl-3 bg-amber-50/60">Growth Mode: AI engages with target profiles' content weekly</td>
                    </tr>
                    <tr>
                      <td className="py-3 pr-3 text-muted-foreground">Pricing</td>
                      <td className="py-3 px-3">$59-$99/mo for templates</td>
                      <td className="py-3 pl-3 bg-amber-50/60">Similar price, real AI personalization included</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                We don't just automate — we make every message worth reading.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* SECTION 5: CAMPAIGN SEQUENCE (light) */}
      <section className="py-20 md:py-28 px-4 section-white section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">
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

          <motion.p {...fadeUp} className="text-center text-base text-gray-600 mt-10 max-w-lg mx-auto">
            Every action is spaced with random delays, simulating natural human behavior. Max 80 profile visits and 40 connection requests per day, well within LinkedIn's safe thresholds.
          </motion.p>
        </div>
      </section>

      {/* SECTION 6: SAFETY & TRUST (dark) */}
      <section className="py-20 md:py-28 px-4 bg-navy relative overflow-hidden">
        <div className="absolute bottom-0 right-10 w-80 h-80 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight text-white mb-2">
              Your Account Is Safe. <span className="text-gradient-gold text-glow">Period.</span>
            </h2>
            <p className="text-base text-slate-300 mt-3 max-w-2xl mx-auto">
              LinkedIn Copilot uses browser-based automation with human-like behavior patterns, strict daily limits, and automatic warm-up. Your account stays safe because we follow the same rules a careful human would.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {trustCards.map((card, i) => (
              <motion.div key={i} {...stagger(i)}>
                <Card className="bg-navy-light border-border/30 hover-float h-full rounded-2xl shadow-sm">
                  <CardContent className="p-5 sm:p-6 text-center">
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

      {/* SECTION 7: PRICING (light) */}
      <section ref={pricingRef} id="pricing" className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl text-center relative z-10">
          <motion.h2 {...fadeUp} className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight mb-2">Pricing built for real outreach.</motion.h2>
          <motion.p {...fadeUp} className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">Start free, validate results, then scale with confidence.</motion.p>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {pricing.map((plan, i) => (
              <motion.div key={plan.name} {...stagger(i)}>
                <Card className={`relative hover-float h-full rounded-2xl shadow-sm ${plan.highlighted ? 'border-2 border-amber-400 bg-amber-50/40 ring-2 ring-amber-200/40' : 'bg-white/85 border border-gray-100'}`}>
                  {plan.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-display font-bold uppercase tracking-wider px-3 py-1 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3" /> Most Popular
                    </div>
                  )}
                  <CardContent className="p-6 md:p-8 pt-10 flex flex-col h-full">
                    <h3 className="text-lg font-display font-bold uppercase tracking-wide">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-5xl font-numbers font-extrabold">{plan.price}</span>
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
                          <Check className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={handleCTA}
                      className={`mt-6 w-full font-display font-bold uppercase tracking-wider rounded-xl shine-effect ${plan.highlighted ? 'bg-amber-500 text-black hover:bg-amber-400' : ''}`}
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

          <div className="max-w-5xl mx-auto mt-10 grid md:grid-cols-3 gap-8 text-left">
            <Card className="bg-white/90 rounded-2xl shadow-sm border border-gray-100">
              <CardContent className="p-6 md:p-8">
                <h3 className="font-bold text-sm mb-2">Everything included</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-amber-500 mt-0.5" /> AI message generation (notes, DMs, follow-ups)</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-amber-500 mt-0.5" /> Smart lead filtering: ICP validation + ghost detection</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-amber-500 mt-0.5" /> Extension-based, safe automation</li>
                  <li className="flex items-start gap-2"><Check className="w-4 h-4 text-amber-500 mt-0.5" /> You only spend credits on qualified leads</li>
                </ul>
              </CardContent>
            </Card>
            <Card className="bg-white/90 rounded-2xl shadow-sm border border-gray-100">
              <CardContent className="p-6 md:p-8">
                <h3 className="font-bold text-sm mb-2">Safety limits</h3>
                <p className="text-sm text-muted-foreground">Hard caps are enforced to keep accounts safe. New accounts ramp up automatically.</p>
                <div className="mt-3 text-sm text-muted-foreground space-y-1">
                  <p><span className="font-semibold text-foreground">40</span> connection requests/day</p>
                  <p><span className="font-semibold text-foreground">80</span> profile visits/day</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-white/90 rounded-2xl shadow-sm border border-gray-100">
              <CardContent className="p-6 md:p-8">
                <h3 className="font-bold text-sm mb-2">Team-ready</h3>
                <p className="text-sm text-muted-foreground">Run multiple campaigns, validate messages once, then switch to auto-run.</p>
                <p className="text-xs text-muted-foreground mt-3">Custom plans available for agencies and large teams.</p>
              </CardContent>
            </Card>
          </div>

          <div className="max-w-4xl mx-auto mt-10">
            <Card className="bg-white/95 border-border rounded-2xl shadow-sm">
              <CardContent className="p-6 md:p-8">
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
            <Card className="border-dashed border-2 border-border bg-white/80 rounded-2xl shadow-sm">
              <CardContent className="p-6 md:p-8 flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
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
            <Card className="bg-white/90 rounded-2xl shadow-sm border border-gray-100">
              <CardContent className="p-8 text-left">
                <h3 className="text-xl font-bold mb-3">Why 1,000 outreach credits?</h3>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>Not every lead in your CSV is worth reaching out to. Some are ghost profiles with no real LinkedIn activity. Others don't match your ideal customer profile. Sending messages to these leads wastes your time and hurts your reply rates.</p>
                  <p>That's why we built a smart filtering pipeline. Upload up to 3,000 leads per month — our system enriches each one, validates them against your ICP using Claude Haiku, and automatically detects ghost profiles. Only the leads that pass every check become outreach-ready and count against your 1,000 credits.</p>
                  <p>The result: every message you send goes to a real, qualified prospect. Higher acceptance rates, better conversations, more deals.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* SECTION 8: FAQ (light) */}
      <section id="faq" className="py-20 md:py-28 px-4 section-white section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-2xl relative z-10">
          <motion.h2 {...fadeUp} className="text-3xl md:text-4xl font-display font-bold uppercase tracking-tight text-center mb-4">
            Frequently Asked <span className="text-gradient-gold">Questions</span>
          </motion.h2>
          <motion.p {...fadeUp} className="text-center text-lg text-gray-600 mb-10">
            Everything you need to know about LinkedIn automation and LinkedIn Copilot.
          </motion.p>
          <motion.div {...fadeUp}>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-white/90 border border-border/60 rounded-xl px-4 hover-lift transition-all duration-300 data-[state=open]:bg-muted/40"
                >
                  <AccordionTrigger className="text-base font-semibold text-left">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm text-gray-600 transition-all duration-300">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* SECTION: ABOUT / E-E-A-T */}
      <section className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div {...fadeUp} className="text-center">
            <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tight mb-6">
              Built by a <span className="text-gradient-gold">Practitioner</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto mb-4">
              LinkedIn Copilot was created by a B2B sales professional who sends over 1,000 personalized LinkedIn messages every month. After testing every major LinkedIn automation tool on the market, the gaps were clear: generic templates, no ICP validation, and messages that sounded like bots.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
              So we built the tool we wanted to use ourselves &mdash; one that reads full profiles, writes messages that prove you actually looked, and only reaches out to people who match your ideal customer profile. LinkedIn Copilot is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-primary hover:text-gold-light transition-colors font-semibold">scan<em>to</em>sell.io</a>, a B2B sales technology company focused on AI-powered outreach and lead generation.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SECTION 9: FINAL CTA (dark) */}
      <section className="py-20 md:py-28 px-4 bg-navy relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b1325] via-[#0a1020] to-[#060a16] opacity-90" />
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <motion.div
            {...fadeUp}
            className="rounded-2xl p-8 sm:p-12 md:p-16 relative overflow-hidden border border-white/10 shadow-deep"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[80px] pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl md:text-5xl font-display font-extrabold uppercase tracking-tight text-white mb-4">
                Ready to Fly?
              </h2>
              <p className="text-slate-300 text-sm mb-8 max-w-lg mx-auto">
                Stop sending LinkedIn messages that sound like everyone else's. Outreach Mode sends messages that prove you actually looked. Growth Mode builds your authority on autopilot. Powered by Claude AI, delivered with precision.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button
                  onClick={handleCTA}
                  size="lg"
                  className="bg-amber-500 text-black hover:bg-amber-400 px-8 py-6 text-sm sm:text-base font-display font-bold uppercase tracking-wider rounded-xl shine-effect"
                >
                  Start Free &mdash; 50 Outreach Credits
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => scrollTo(featuresRef)}
                  className="border-white/30 text-white hover:bg-white/10 px-8 py-6 text-sm sm:text-base font-display font-bold uppercase tracking-wider rounded-xl"
                >
                  See Demo
                </Button>
              </div>
              <p className="text-slate-500 text-xs mt-4">
                Free plan includes Claude Sonnet powered DMs, Claude Haiku ICP validation, ghost profile detection, Chrome Extension, and 50 outreach credits with smart lead filtering.
              </p>
              <p className="text-gold-light text-xs font-display font-semibold uppercase tracking-widest mt-6 text-glow">
                Lock On Target. Deploy Precision Messages. Close Deals.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      </main>
      {/* -- FOOTER -- */}
      <footer role="contentinfo" className="bg-navy py-16 px-4 border-t border-white/5">
        <div className="container mx-auto max-w-5xl">
          <div className="flex flex-col md:flex-row gap-12">
            <div className="md:w-2/5">
              <Logo tone="dark" className="text-xl mb-5" markClassName="w-9 h-9" />
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">LinkedIn Copilot: AI-powered LinkedIn automation built by a practitioner who sends 1,000+ personalized messages a month. Safe, profile-based B2B outreach at scale.</p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-gold-light mb-4">Product</h4>
                <ul className="space-y-2.5 text-sm text-gray-400">
                  <li><button onClick={() => scrollTo(howRef)} className="hover:text-white transition-colors">How it Works</button></li>
                  <li><button onClick={() => scrollTo(featuresRef)} className="hover:text-white transition-colors">Features</button></li>
                  <li><button onClick={() => scrollTo(pricingRef)} className="hover:text-white transition-colors">Pricing</button></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-gold-light mb-4">Resources</h4>
                <ul className="space-y-2.5 text-sm text-gray-400">
                  <li><Link to="/help" className="hover:text-white transition-colors">Help Center</Link></li>
                  <li><Link to="/setup-guide" className="hover:text-white transition-colors">Setup Guide</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-display font-semibold text-sm uppercase tracking-wider text-gold-light mb-4">Legal</h4>
                <ul className="space-y-2.5 text-sm text-gray-400">
                  <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                  <li><span className="cursor-default">Terms of Service</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-10 pt-6 text-center">
            <p className="text-sm text-gray-500 mb-2">
              LinkedIn Copilot is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-gold-light hover:text-primary transition-colors font-medium">scan<em>to</em>sell.io</a>
            </p>
            <p className="text-xs text-gray-500">&copy; 2026 scan<em>to</em>sell.io &middot; All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
