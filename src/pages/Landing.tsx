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
  ArrowRight, Check, MessageCircle, VolumeX, Users, MousePointerClick, Radar, Handshake,
  Gauge, Clock, ShieldAlert, Hand,
} from 'lucide-react';
import BrandMark from '@/components/BrandMark';
import Logo from '@/components/Logo';
import { motion } from 'framer-motion';

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

// Every claim on this page has to match what the product does today. When behaviour changes
// (limits, what the extension sends, what the person does by hand), change the copy with it.

export default function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const productRef = useRef<HTMLDivElement>(null);
  const howRef = useRef<HTMLDivElement>(null);
  const limitsRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && user) navigate('/today');
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

  const parts = [
    {
      icon: MessageCircle,
      title: 'Stay close',
      desc: 'Olanovo finds recent posts by people you already know, about the subjects you care about, and drafts a comment from your point of view.',
      bullets: ['You tell it once what you think about each subject', 'A draft waits for you in the Inbox', 'You open the post and publish the comment yourself'],
    },
    {
      icon: Radar,
      title: 'Meet new people',
      desc: 'Describe the audience you want to know. Olanovo looks for people who fit and sends them a connection invitation with the note you wrote.',
      bullets: ['Each person is checked against your audience first', 'A few invitations a day, never a burst', 'Sales Navigator is optional and makes the search more precise'],
    },
    {
      icon: Handshake,
      title: 'No scripted messages',
      desc: 'No compliment from a stranger, no pitch in the second message. When someone accepts your invitation, Olanovo does not send them anything.',
      bullets: ['New connections become part of the network Olanovo reads', 'Their posts about your subjects can come up with a comment draft', 'The conversation starts from something they actually said'],
    },
  ];

  const differences = [
    { icon: VolumeX, title: 'It knows when to stay quiet', desc: 'If a post is not about your subjects, there is no draft. Olanovo would rather skip a post than put a generic comment under your name. A contact\'s new role or anniversary still gets a short congratulation.' },
    { icon: Users, title: 'Your network, one price', desc: 'Bring every connection that matters to you, hundreds of them, and Olanovo also searches recent posts from the rest of your network for your subjects. One plan, with no charge per contact.' },
    { icon: MousePointerClick, title: 'You press Comment', desc: 'Olanovo writes the draft and opens the post. You adjust it and publish it yourself: the extension has no function that posts a comment. The edits you make in the Inbox, and the drafts you reject, shape the next ones.' },
  ];

  const howSteps = [
    { num: '1', title: 'Bring your connections', desc: 'Download your connections from LinkedIn (it emails you the file) and upload it. Describe who matters to you, and Olanovo keeps that shortlist: often a few hundred people out of a few thousand.' },
    { num: '2', title: 'Say what you think', desc: 'List your subjects and, for each one, what you believe and what you have seen in practice. Every draft is written from that, and from nothing else.' },
    { num: '3', title: 'Olanovo reads their posts', desc: 'A few people a day, inside the hours you set. A post about your subjects gets a draft. When a contact describes a problem you work on, it goes to the top of your Inbox.' },
    { num: '4', title: 'You publish', desc: 'One click copies the draft and opens the post. You paste it and press Comment on LinkedIn. It is your comment, posted by you.' },
  ];

  const limitCards = [
    { icon: Gauge, title: 'One daily ceiling', desc: 'Every profile page the extension opens counts toward a single daily ceiling: contact checks and invitations together. It starts at 15 pages a day and grows by 5 a week, up to 40. At that pace a list of a few hundred people takes weeks, so we recommend one list at a time.' },
    { icon: Clock, title: 'Your days and hours', desc: 'It works only inside the days and hours you choose. After your computer sleeps, it waits a few minutes and resumes at the normal pace instead of catching up in a burst.' },
    { icon: ShieldAlert, title: 'Stops on a warning', desc: 'If LinkedIn shows a verification page or logs you out, everything pauses. Nothing restarts by itself: only you resume.' },
    { icon: Hand, title: 'You are in charge', desc: 'Comments are always posted by you. Invitations go out with the note you wrote. One pause button stops everything.' },
  ];

  const faqs = [
    { q: 'Does Olanovo post comments for me?', a: 'No. Olanovo finds the post and writes a draft. You read it, change what you want, open the post and publish the comment yourself on LinkedIn. The extension has no function that posts a comment.' },
    { q: 'What does the extension do by itself, then?', a: 'It opens LinkedIn pages in your own browser to read them: posts by your connections, search results for the audiences you define, your list of connections. It also sends connection invitations to people who match an audience you set up, with the note you wrote. It does not send messages. All of it inside daily limits and inside the hours you choose.' },
    { q: 'Is this allowed by LinkedIn? Can my account be restricted?', a: 'LinkedIn\'s User Agreement restricts third-party tools that automate activity, and no tool can honestly promise zero risk. What Olanovo does is keep the activity low and stop when LinkedIn objects: a single daily ceiling for profile pages that starts at 15, your own days and hours, and an automatic pause on any verification or warning page. Using it is your decision. If you want no risk at all, do not use any tool of this kind.' },
    { q: 'Why are the limits so low?', a: 'Because LinkedIn does not publish its limits, and the numbers other tools advertise are their own guesses. We run every limit on our own account first. When LinkedIn objected to the volume of profile pages on that account, we lowered the ceiling for everyone and made it a single budget shared by all features.' },
    { q: 'How does it know what I would say?', a: 'You write it down once: your subjects, what you think about each one, what you have seen in your work, and what you never want to say. Drafts are built from that and from the post. If a post is not about your subjects, there is no draft.' },
    { q: 'Do I need Sales Navigator?', a: 'No. Finding posts by your own connections and drafting comments works with a free LinkedIn account. Sales Navigator is recommended only if you want to find new people by audience, because its filters (job title, seniority, region, company size) make that search much more precise.' },
    { q: 'How many invitations does it send?', a: 'You set a weekly number and Olanovo spreads it over the week. Each invitation also counts toward the daily ceiling of profile pages, so in the first weeks that means a handful a day. The best matches for your audience go first.' },
    { q: 'What data does it read, and where does it go?', a: 'The extension reads the LinkedIn pages it opens in your session: names, headlines, companies and post text of your connections and of people who match your audiences. It never reads or stores your LinkedIn password. Drafts are written with AI. The data is not sold and is not used to train AI models. The privacy policy explains what is processed and why.' },
    { q: 'Can I edit or reject what it writes?', a: 'Every comment is a draft you post yourself: edit it, skip it or ignore it. Invitation notes are written by you. Olanovo does not write or send messages.' },
    { q: 'What does it cost?', a: 'You try everything free for 14 days, with no credit card. After that there is one plan: Pro, $69 a month per LinkedIn account, or $690 a year. If you do not subscribe when the trial ends, Olanovo stops looking for posts, writing drafts and sending invitations; what is already in your Inbox stays there.' },
  ];

  const pricing = [
    {
      name: 'Free trial',
      price: '$0',
      period: ' for 14 days',
      subtitle: '',
      leads: 'Everything in Pro',
      features: [
        'No credit card',
        'See drafts for real posts from your network on day one',
        'When it ends, nothing is charged: Olanovo just pauses',
      ],
      cta: 'Start free',
      sub: 'No credit card required.',
      highlighted: false,
    },
    {
      name: 'Pro',
      price: '$69',
      period: '/mo',
      subtitle: 'per LinkedIn account, or $690 a year',
      leads: 'One plan, everything included',
      features: [
        'Posts from your network, picked by your subjects',
        'Comment drafts from what you think, posted by you',
        'New people in your target audience, with invitations and your note',
        'Low daily limits, inside the hours you choose',
      ],
      cta: 'Start free',
      sub: 'Cancel anytime.',
      highlighted: true,
    },
  ];

  return (
    <div className="min-h-screen bg-background" itemScope itemType="https://schema.org/WebPage">
      {/* -- NAVBAR -- */}
      <nav className="fixed top-0 w-full z-50 bg-navy/95 backdrop-blur border-b border-white/[0.06]" aria-label="Main navigation" role="navigation">
        <div className="max-w-[1240px] mx-auto flex items-center justify-between h-[72px] px-4 sm:px-6 gap-4">
          <Link to="/" className="flex items-center gap-1.5 text-white" aria-label="Olanovo home">
            <BrandMark className="w-8 h-8" />
            <span className="font-display font-bold text-xl sm:text-2xl tracking-tight whitespace-nowrap">Olanovo</span>
          </Link>
          <div className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <button onClick={() => scrollTo(productRef)} className="hover:text-white transition-colors">What it does</button>
            <button onClick={() => scrollTo(howRef)} className="hover:text-white transition-colors">How it works</button>
            <button onClick={() => scrollTo(limitsRef)} className="hover:text-white transition-colors">Limits</button>
            <button onClick={() => scrollTo(pricingRef)} className="hover:text-white transition-colors">Pricing</button>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="text-sm font-medium text-white px-3 py-2.5 whitespace-nowrap hover:text-primary transition-colors">Log in</Link>
            <Button onClick={handleCTA} className="bg-primary text-primary-foreground hover:bg-gold-dark font-semibold rounded-lg h-11 px-5">
              Start free
            </Button>
          </div>
        </div>
      </nav>

      <main>
      {/* HERO */}
      <section className="bg-navy text-white pt-[72px] relative overflow-hidden" aria-label="Hero">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-16 md:py-24 grid lg:grid-cols-[1.05fr_1fr] gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-7">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="font-mono-label text-xs text-primary">
              For people who sell through relationships
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' as const }}
              className="font-display font-bold leading-[1] tracking-tight m-0 [text-wrap:balance]"
              style={{ fontSize: 'clamp(40px, 4.8vw, 68px)' }}
            >
              Say <span className="text-primary">hello again</span> to the people who already know you.
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }} className="text-lg sm:text-xl text-slate-300 max-w-[38ch] m-0">
              Olanovo finds their recent LinkedIn posts and drafts a comment from what you actually think. You read it, edit it and post it yourself.
            </motion.p>
            <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.22 }} className="text-base font-medium text-white max-w-[44ch] m-0">
              No automated DMs. No fake compliments. No pretending you know someone.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="flex flex-wrap items-center gap-4">
              <Button onClick={handleCTA} size="lg" className="bg-primary text-primary-foreground hover:bg-gold-dark font-semibold text-base rounded-xl h-14 px-6">
                Start free <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <button onClick={() => scrollTo(howRef)} className="text-base text-white py-3 border-b border-slate-600 hover:border-primary transition-colors">
                See how it works
              </button>
            </motion.div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400 list-none p-0 m-0">
              {['No credit card', 'Works with a free LinkedIn account', 'Chrome extension'].map(t => (
                <li key={t} className="flex items-center gap-2"><Check className="w-4 h-4 text-emerald-400" />{t}</li>
              ))}
            </ul>
          </div>

          {/* Illustration of an Inbox draft. The post and the comment are an invented example. */}
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
            className="bg-navy-light/60 border border-[#2E2643] rounded-[20px] p-5 sm:p-6 flex flex-col gap-4 shadow-hero"
            aria-hidden="true"
          >
            <div className="flex justify-between items-center font-mono-label text-[11px] text-slate-400">
              <span>Inbox · comment draft</span>
              <span>Example</span>
            </div>
            <div className="rounded-2xl bg-navy border border-[#241D36] p-4">
              <div className="font-mono-label text-[11px] text-slate-500 mb-2">Post by one of your connections</div>
              <p className="text-base text-slate-300 leading-relaxed m-0">
                After two years on our water-loss program, the hard part was never the technology. It was getting field crews and the control room to look at the same data.
              </p>
            </div>
            <div className="rounded-2xl bg-white text-[#15111F] border-2 border-primary p-4">
              <div className="font-mono-label text-[11px] text-slate-500 mb-2">Draft comment (edit it freely)</div>
              <p className="text-base leading-relaxed m-0">
                That matches what I see. The sensor finds the leak, but the result depends on how fast the repair order reaches the crew. Shared data between field and control room is where most programs stall.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="bg-primary text-primary-foreground font-semibold text-sm rounded-full px-5 py-2.5">Copy and open post</span>
              <span className="border border-slate-600 text-slate-200 font-semibold text-sm rounded-full px-5 py-2.5">Skip</span>
              <span className="text-sm text-slate-400">Your subject: water loss</span>
            </div>
          </motion.div>
        </div>
        <div className="border-t border-white/[0.06] bg-[#15111F]">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-6 py-5 flex flex-wrap justify-between gap-4 font-mono-label text-xs text-slate-400">
            <span>Drafts in the language of the post</span>
            <span>You post every comment</span>
            <span>Low daily limits</span>
            <span>Sales Navigator optional</span>
          </div>
        </div>
      </section>

      {/* THE POINT: business. Staying in touch is the means. */}
      <section className="py-16 md:py-24 px-4 section-white border-t border-border/60" aria-label="What it is for">
        <motion.div {...fadeUp} className="container mx-auto max-w-4xl text-center">
          <h2 className="font-display font-bold tracking-tight !leading-[1.05] [text-wrap:balance] text-4xl sm:text-5xl md:text-6xl m-0">
            Keeping in touch is nice. <span className="text-gradient-gold">Doing business is the point.</span>
          </h2>
          <p className="font-display font-bold tracking-tight text-2xl sm:text-3xl mt-8 mb-0 max-w-3xl mx-auto [text-wrap:balance]">
            Show up when they post. Be the name they think of when they need what you sell.
          </p>
          <p className="text-lg text-muted-foreground mt-4 mb-0 max-w-2xl mx-auto">
            Most deals start with people who already know you. Olanovo keeps you in front of them, and of a few new
            people you want to meet, with comments worth reading.
          </p>
        </motion.div>
      </section>

      {/* WHY IT IS DIFFERENT */}
      <section id="why" className="py-20 md:py-28 px-4 section-cream border-t border-border/40">
        <div className="container mx-auto max-w-5xl">
          <motion.div {...fadeUp} className="text-center mb-12">
            <div className="font-mono-label text-xs text-gold-dark mb-3">01 // Why it is different</div>
            <h2 className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl">
              Three things it does <span className="text-gradient-gold">on purpose</span>
            </h2>
            <p className="text-lg text-muted-foreground mt-4 mb-0 max-w-2xl mx-auto">
              You can do all of that and still not sound like everyone else in the inbox.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-5">
            {differences.map((d, i) => (
              <motion.article key={d.title} {...stagger(i)} className="rounded-2xl bg-card border border-border p-6 flex flex-col gap-3">
                <d.icon className="w-7 h-7 text-gold-dark" strokeWidth={1.5} />
                <h3 className="font-display font-bold text-lg m-0">{d.title}</h3>
                <p className="text-sm text-muted-foreground m-0">{d.desc}</p>
              </motion.article>
            ))}
          </div>

          {/* The contrast: what a scripted message looks like, next to a comment on something the person said. */}
          <motion.div {...fadeUp} className="grid md:grid-cols-2 gap-5 mt-5">
            <figure className="rounded-2xl border border-border bg-muted/40 p-6 m-0 flex flex-col gap-3">
              <figcaption className="font-mono-label text-xs text-muted-foreground">What everyone gets · illustrative example</figcaption>
              <blockquote className="m-0 text-base text-muted-foreground leading-relaxed">
                Hi, thanks for connecting! Your work in your industry is impressive. We help companies like yours with AI, data
                and custom software. Happy to stay connected and exchange ideas.
              </blockquote>
              <p className="text-sm text-muted-foreground m-0">Written once, sent to hundreds, read by nobody before it left. It could be for anyone.</p>
            </figure>
            <figure className="rounded-2xl border-2 border-primary bg-card p-6 m-0 flex flex-col gap-3">
              <figcaption className="font-mono-label text-xs text-gold-dark">What you post with Olanovo · illustrative example</figcaption>
              <blockquote className="m-0 text-base leading-relaxed">
                Same here on night flow: the alert was never the hard part. What moved our numbers was how many days passed
                between the alert and the crew on site.
              </blockquote>
              <p className="text-sm text-muted-foreground m-0">Under a post the person wrote, about a subject you work on, read and edited by you before it went out.</p>
            </figure>
          </motion.div>
        </div>
      </section>

      {/* WHAT IT DOES */}
      <section ref={productRef} id="product" className="py-20 md:py-28 section-white border-t border-border/60">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-6 flex flex-col gap-12">
          <motion.div {...fadeUp} className="flex flex-col items-center text-center gap-3 max-w-3xl mx-auto">
            <div className="font-mono-label text-xs text-gold-dark">02 // What it does</div>
            <h2 className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl m-0">
              Be present when the people you know speak
            </h2>
            <p className="text-lg text-muted-foreground m-0 max-w-2xl mx-auto">
              Most business on LinkedIn comes from people who already know you. Olanovo keeps you in front of them with comments worth reading, and helps you meet a few new people the same way.
            </p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-5">
            {parts.map((m, i) => (
              <motion.article key={m.title} {...stagger(i)}
                className="relative rounded-[18px] p-8 flex flex-col gap-4 border bg-card border-border"
              >
                <m.icon className="w-9 h-9 text-gold-dark" strokeWidth={1.5} />
                <h3 className="font-display font-bold text-2xl leading-tight m-0">{m.title}</h3>
                <p className="m-0 text-muted-foreground">{m.desc}</p>
                <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
                  {m.bullets.map(b => (
                    <li key={b} className="flex gap-2.5 items-start"><Check className="w-4 h-4 mt-1 shrink-0 text-gold-dark" />{b}</li>
                  ))}
                </ul>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section ref={howRef} id="how-it-works" className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-12">
            <div className="font-mono-label text-xs text-gold-dark mb-3">03 // How it works</div>
            <h2 className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl">
              Four steps. <span className="text-gradient-gold">The last one is yours.</span>
            </h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {howSteps.map((s, i) => (
              <motion.div key={s.num} {...stagger(i)}>
                <Card className="h-full bg-white/90 rounded-2xl shadow-sm border border-gray-100">
                  <CardContent className="p-6">
                    <div className="font-display font-bold text-4xl text-primary leading-none mb-4">{s.num}</div>
                    <h3 className="font-display font-bold text-lg mb-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground m-0">{s.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* LIMITS AND HONESTY */}
      <section ref={limitsRef} id="limits" className="py-20 md:py-28 px-4 bg-navy relative overflow-hidden">
        <div className="container mx-auto max-w-5xl relative z-10">
          <motion.div {...fadeUp} className="text-center mb-12">
            <div className="font-mono-label text-xs text-primary mb-3">04 // Limits</div>
            <h2 className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl text-white mb-4">
              Built to do less, <span className="text-gradient-gold">on purpose.</span>
            </h2>
            <p className="text-slate-300 text-lg max-w-2xl mx-auto m-0">
              LinkedIn's User Agreement restricts third-party tools that automate activity, and no tool can honestly promise zero risk. What we can do is keep the activity low, keep you in charge, and stop the moment LinkedIn objects.
            </p>
          </motion.div>
          <div className="grid sm:grid-cols-2 gap-5">
            {limitCards.map((card, i) => (
              <motion.div key={card.title} {...stagger(i)} className="rounded-2xl border border-white/10 bg-navy-light/60 p-6 flex gap-4">
                <card.icon className="w-8 h-8 text-primary shrink-0" strokeWidth={1.5} />
                <div>
                  <h3 className="font-display font-bold text-white text-lg mb-1.5">{card.title}</h3>
                  <p className="text-sm text-slate-300 m-0">{card.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.p {...fadeUp} className="text-center text-slate-400 text-sm mt-10 max-w-2xl mx-auto">
            We run every limit on our own account before it reaches yours. Olanovo is not affiliated with or endorsed by LinkedIn.
          </motion.p>
        </div>
      </section>

      {/* PRICING */}
      <section ref={pricingRef} id="pricing" className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-5xl text-center relative z-10">
          <motion.div {...fadeUp} className="font-mono-label text-xs text-gold-dark mb-3">05 // Plans</motion.div>
          <motion.h2 {...fadeUp} className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl mb-3">Pricing</motion.h2>
          <motion.p {...fadeUp} className="text-lg text-gray-600 mb-12 max-w-2xl mx-auto">Try it for 14 days. Pay when it is part of your week.</motion.p>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {pricing.map((plan, i) => (
              <motion.div key={plan.name} {...stagger(i)}>
                <Card className={`relative h-full rounded-2xl shadow-sm ${plan.highlighted ? 'border-2 border-primary bg-gold-bg ring-2 ring-primary/15' : 'bg-white/85 border border-gray-100'}`}>
                  <CardContent className="p-6 md:p-8 pt-10 flex flex-col h-full">
                    <h3 className="text-lg font-display font-bold">{plan.name}</h3>
                    <div className="mt-2">
                      <span className="text-5xl font-numbers font-bold">{plan.price}</span>
                      <span className="text-muted-foreground text-sm">{plan.period}</span>
                    </div>
                    {plan.subtitle && <p className="text-xs text-muted-foreground mt-1">{plan.subtitle}</p>}
                    <p className="font-semibold text-sm mt-4 mb-2 text-left">{plan.leads}</p>
                    <ul className="space-y-3 text-sm text-left flex-1 mt-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      onClick={handleCTA}
                      className={`mt-6 w-full font-semibold rounded-xl ${plan.highlighted ? 'bg-primary text-primary-foreground hover:bg-gold-dark' : ''}`}
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
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20 md:py-28 px-4 section-white section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-2xl relative z-10">
          <motion.div {...fadeUp} className="font-mono-label text-xs text-gold-dark text-center mb-3">06 // Questions</motion.div>
          <motion.h2 {...fadeUp} className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl text-center mb-10">
            Questions people <span className="text-gradient-gold">ask first</span>
          </motion.h2>
          <motion.div {...fadeUp}>
            <Accordion type="single" collapsible className="space-y-2">
              {faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="bg-white/90 border border-border/60 rounded-xl px-4 transition-all duration-300 data-[state=open]:bg-muted/40"
                >
                  <AccordionTrigger className="text-base font-semibold text-left">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-base leading-relaxed text-gray-600">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </motion.div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="py-20 md:py-28 px-4 section-cream section-textured relative border-t border-border/40">
        <div className="container mx-auto max-w-3xl relative z-10">
          <motion.div {...fadeUp} className="text-center">
            <div className="font-mono-label text-xs text-gold-dark mb-3">07 // About</div>
            <h2 className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl mb-6">
              Built by someone who <span className="text-gradient-gold">uses it</span>
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto mb-4">
              Olanovo is made by a B2B professional who runs it every day on his own LinkedIn account. The idea is simple: the people who already know you are worth more than a thousand strangers, and a comment from someone who understands the subject is how you stay in their mind.
            </p>
            <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
              Olanovo is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">scan<em>to</em>sell.io</a>.
            </p>
          </motion.div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-20 md:py-28 px-4 bg-navy relative overflow-hidden">
        <div className="container mx-auto max-w-4xl text-center relative z-10">
          <motion.div {...fadeUp} className="rounded-2xl p-8 sm:p-12 md:p-16 relative overflow-hidden border border-white/10">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/15 rounded-full blur-[80px] pointer-events-none" />
            <div className="relative z-10">
              <h2 className="font-display font-bold tracking-tight !leading-[1.08] [text-wrap:balance] text-3xl sm:text-4xl md:text-5xl text-white mb-4">
                A few minutes a day with the people who matter.
              </h2>
              <p className="text-slate-300 text-lg mb-8 max-w-lg mx-auto">
                Tell Olanovo what you think once. Open your Inbox, read the drafts, and post the ones you would sign.
              </p>
              <Button
                onClick={handleCTA}
                size="lg"
                className="bg-primary text-primary-foreground hover:bg-gold-dark px-8 py-6 text-base font-semibold rounded-xl"
              >
                Start free
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <p className="text-slate-500 text-xs mt-4">No credit card required.</p>
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
              <p className="text-sm text-gray-400 leading-relaxed max-w-xs">
                Olanovo helps you stay close to your professional network: it finds LinkedIn posts by people you know and drafts comments from your point of view, for you to post.
              </p>
            </div>
            <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-8">
              <div>
                <h4 className="font-semibold text-sm text-gold-light mb-4">Product</h4>
                <ul className="space-y-2.5 text-sm text-gray-400">
                  <li><button onClick={() => scrollTo(productRef)} className="hover:text-white transition-colors">What it does</button></li>
                  <li><button onClick={() => scrollTo(howRef)} className="hover:text-white transition-colors">How it works</button></li>
                  <li><button onClick={() => scrollTo(limitsRef)} className="hover:text-white transition-colors">Limits</button></li>
                  <li><button onClick={() => scrollTo(pricingRef)} className="hover:text-white transition-colors">Pricing</button></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-gold-light mb-4">Resources</h4>
                <ul className="space-y-2.5 text-sm text-gray-400">
                  <li><Link to="/help" className="hover:text-white transition-colors">Help Center</Link></li>
                  <li><Link to="/setup-guide" className="hover:text-white transition-colors">Setup Guide</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-gold-light mb-4">Legal</h4>
                <ul className="space-y-2.5 text-sm text-gray-400">
                  <li><Link to="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                  <li><span className="cursor-default">Terms of Service</span></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-10 pt-6 text-center">
            <p className="text-sm text-gray-500 mb-2">
              Olanovo is part of <a href="https://scantosell.io" target="_blank" rel="noopener noreferrer" className="text-gold-light hover:text-primary transition-colors font-medium">scan<em>to</em>sell.io</a>. Not affiliated with or endorsed by LinkedIn.
            </p>
            <p className="text-xs text-gray-500">&copy; 2026 scan<em>to</em>sell.io &middot; All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
