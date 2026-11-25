import AppShell from '@/components/app/AppShell';
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
  PenLine, BookOpen, Inbox, Send, ChevronRight, Monitor,
  MessageCircle, Radar, Lightbulb, Gauge, ShieldAlert,
} from 'lucide-react';

// Keep these in step with the landing page (src/pages/Landing.tsx): same steps, same numbers.
const flowSteps = [
  { label: 'You', icon: PenLine, desc: 'You list your subjects and, for each one, what you think and what you have seen in your work. This is what makes the drafts sound like you.' },
  { label: 'Olanovo', icon: BookOpen, desc: 'A few times a day, inside the days and hours you chose, the extension opens LinkedIn pages in your own browser and reads recent posts by people you know.' },
  { label: 'Inbox', icon: Inbox, desc: 'When a post is about one of your subjects, or a contact announces a milestone, a draft comment waits in your Inbox next to the post. Other posts are skipped: no draft, and nothing is liked for you.' },
  { label: 'You', icon: Send, desc: 'You read the draft, change what you want, copy it, open the post and press Comment on LinkedIn. The extension has no function that posts a comment.' },
];

const quickGuides = [
  {
    title: 'Post a comment',
    icon: MessageCircle,
    steps: [
      'Open the Inbox and pick a draft',
      'Read the post, then edit the draft in the box. Edits made here teach Olanovo; edits made on LinkedIn are not seen',
      'Click "Copy and open post", paste the text on LinkedIn and press Comment',
      'Back in the Inbox, click "I posted it"',
      'Not for you? Click Skip and pick a reason in one click',
      'Keys: J and K move, A is the main button, S skips, E edits',
    ],
  },
  {
    title: 'Teach Olanovo your subjects',
    icon: Lightbulb,
    steps: [
      'Open Settings and find the card about your subjects',
      'List the subjects you want to be known for',
      'For each one, write what you believe and what you have seen in practice',
      'Add a few search terms: the words Olanovo looks for in the posts of your connections',
      'Add what you never want to say',
      'Click Save. Without subjects no draft is written; without search terms Olanovo does not search the posts of your connections',
      'After that, the comments you post and the drafts you skip keep refining it',
    ],
  },
  {
    title: 'Meet new people',
    icon: Radar,
    steps: [
      'Open Network and describe an audience: job titles, region, kind of company',
      'Write the short note that goes with the invitation',
      'Set how many invitations a week you want',
      'Olanovo looks for people who fit, checks each one against your description and invites the best matches first',
      'Invitations still unanswered after 21 days are withdrawn',
      'Sales Navigator is optional and makes the search more precise',
    ],
  },
];

const faqs = [
  { q: 'Does Olanovo post comments for me?', a: 'No. Olanovo finds the post and writes a draft. You read it, change what you want, open the post and publish the comment yourself on LinkedIn.' },
  { q: 'What does the extension do by itself?', a: 'It opens LinkedIn pages in your own browser to read them: posts by your connections, search results for the audiences you define, your list of connections. It also sends connection invitations to people who match an audience you set up, with the note you wrote. It does not send messages, and it does not like or comment on posts.' },
  { q: 'Is this allowed by LinkedIn? Can my account be restricted?', a: 'LinkedIn\'s User Agreement restricts third-party tools that automate activity, and no tool can honestly promise zero risk. Olanovo raises the activity gradually and stops when LinkedIn objects: one daily ceiling for profile pages that starts at 20, your own days and hours, and an automatic pause on any verification or warning page. Using it is your decision.' },
  { q: 'Why did I get no draft today?', a: 'The usual reasons: none of the posts found were about your subjects (those are skipped on purpose), your subjects or search terms are not saved yet, Chrome was closed or the computer asleep during your active hours, or the day\'s ceiling of profile pages was already used. The Today page shows how many posts were read and how many were left alone.' },
  { q: 'Do I need to keep my computer on all day?', a: 'No. The extension works while Chrome is open and the computer is awake, inside the hours you chose. When the computer sleeps it simply pauses. When it wakes up, it waits a few minutes and continues at the normal pace; it does not rush to make up for lost time.' },
  { q: 'How long does it take to go through my whole network?', a: 'It depends on its size and on how long you have been using Olanovo. Every profile page counts toward the daily ceiling (20 a day at first, growing by 20 a week up to 100), and a contact rests for 7 days after you comment on their post. The gradual start is deliberate: a sudden jump in activity is what gets an account noticed.' },
  { q: 'How many invitations does it send?', a: 'You set a weekly number in Network and Olanovo spreads it over the week. Each invitation also counts toward the daily ceiling of profile pages, so in the first days they share a small ceiling with the contact checks.' },
  { q: 'Can I install the extension on two computers?', a: 'Use one copy per LinkedIn account. If you installed the extension from a .zip file in the past, remove that copy before installing from the Chrome Web Store.' },
  { q: 'What happens when my free trial ends?', a: 'Nothing is charged. If you have not subscribed, Olanovo stops looking for posts, writing drafts and sending invitations. What is already in your Inbox stays there, and everything resumes when you subscribe.' },
  { q: 'What data does it read, and where does it go?', a: 'The extension reads the LinkedIn pages it opens in your session: names, headlines, companies and post text of your connections and of people who match your audiences. It never reads or stores your LinkedIn password. The privacy policy has the full list.' },
];

export default function HelpPage() {
  return (
    <AppShell>
      <h1 className="font-display font-bold text-4xl leading-none m-0 mb-6">Help center</h1>
      <div className="max-w-4xl space-y-8">
        {/* How it works */}
        <section>
          <h2 className="text-xl font-display font-bold tracking-tight mb-1">How it works</h2>
          <p className="text-sm text-muted-foreground mb-4">Four steps. The last one is always yours.</p>
          <Card>
            <CardContent className="p-4">
              <div className="space-y-0">
                {flowSteps.map((step, i) => (
                  <div key={i} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                    <div className="flex flex-col items-center gap-1 shrink-0 w-16">
                      <div className="w-9 h-9 rounded-full bg-gold-bg border-2 border-primary text-primary flex items-center justify-center">
                        <step.icon className="w-4 h-4" />
                      </div>
                      <span className="text-xs font-semibold text-muted-foreground text-center leading-tight">{step.label}</span>
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

        {/* Quick guides */}
        <section>
          <h2 className="text-xl font-display font-bold tracking-tight mb-1">Quick guides</h2>
          <p className="text-sm text-muted-foreground mb-4">The three things you will do most.</p>
          <div className="grid md:grid-cols-3 gap-4">
            {quickGuides.map((guide) => (
              <Card key={guide.title} className="hover:shadow-card transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
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

        {/* Setup guide link */}
        <section>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Monitor className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="font-semibold text-sm">Installing the extension</p>
                  <p className="text-xs text-muted-foreground">From the Chrome Web Store to your first draft, and what to do when it stops.</p>
                </div>
              </div>
              <Link to="/setup-guide">
                <Button size="sm" variant="outline" className="border-primary/30 text-primary hover:bg-primary/10 gap-1">
                  Setup guide <ChevronRight className="w-3 h-3" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </section>

        {/* Limits */}
        <section>
          <h2 className="text-xl font-display font-bold tracking-tight mb-1">Limits and safety</h2>
          <p className="text-sm text-muted-foreground mb-4">The same limits for everyone. They exist to keep the activity on your account low.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <Gauge className="w-4 h-4 text-primary" /> Daily pace
                </h3>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• One ceiling for every profile page the extension opens: 20 a day at first, growing by 20 a week, up to 100</li>
                  <li>• Contact checks and invitations share that ceiling</li>
                  <li>• Work happens only inside the days and hours you set, with irregular gaps between actions</li>
                  <li>• After you comment on someone's post, that contact rests for 7 days</li>
                </ul>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 space-y-2">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary" /> When it stops
                </h3>
                <ul className="text-xs text-muted-foreground space-y-1.5">
                  <li>• If LinkedIn shows a verification page or logs you out, everything pauses</li>
                  <li>• Nothing restarts by itself: you resume it</li>
                  <li>• The button in the sidebar pauses and resumes the extension at any time</li>
                  <li>• If the extension has been stopped for a long time, you get an email</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section>
          <h2 className="text-xl font-display font-bold tracking-tight mb-1">Frequently asked questions</h2>
          <p className="text-sm text-muted-foreground mb-4">What people ask first.</p>
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

        {/* Campaigns */}
        <section className="pb-8">
          <h2 className="text-xl font-display font-bold tracking-tight mb-1">Your list of contacts</h2>
          <p className="text-sm text-muted-foreground mb-4">Where it starts: the people you already know, narrowed to the ones who matter.</p>
          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
              <p>
                In Lists, upload the connections file LinkedIn emails you (Settings &amp; Privacy, Data privacy, Get a copy of
                your data, Connections) and describe who matters to you. Olanovo keeps that shortlist: out of a few thousand
                connections, usually a few hundred. It then opens each profile from time to time, reads their latest post, and
                writes a comment draft when the post is about your subjects.
              </p>
              <p>
                The drafts arrive in the Inbox like any other, and you publish the ones you want. No message is sent to the people
                in a list. Each profile opened counts toward the same daily ceiling.
              </p>
              <p>
                Run one list at a time. The ceiling starts at 20 profile pages a day, shared with invitations, so in the first weeks a list of a few
                hundred people takes a while to go through once. Two lists would only split the same ceiling.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}
