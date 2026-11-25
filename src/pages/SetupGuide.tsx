import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Chrome, Monitor, CheckCircle2, ShieldAlert, Moon } from 'lucide-react';
import { EXTENSION_STORE_URL } from '@/lib/extensionStore';
import ConnectExtensionButton from '@/components/ConnectExtensionButton';

const Step = ({ number, title, children }: { number: number; title: string; children: React.ReactNode }) => (
  <div className="flex gap-3">
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">
      {number}
    </div>
    <div className="flex-1 space-y-2">
      <h3 className="font-medium text-sm">{title}</h3>
      <div className="text-sm text-muted-foreground space-y-2">{children}</div>
    </div>
  </div>
);

export default function SetupGuide() {
  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link to="/today"><Button variant="ghost" size="sm" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">Setup guide</h1>
            <p className="text-sm text-muted-foreground">From the Chrome Web Store to your first draft. About ten minutes.</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Chrome className="w-4 h-4 text-primary" /> Install and connect
            </CardTitle>
            <CardDescription>Works in Chrome on a computer, with a free LinkedIn account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Step number={1} title="Add the extension to Chrome">
              <p>
                Open <a href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">the Olanovo extension on the Chrome Web Store</a> and
                click <strong>Add to Chrome</strong>. Chrome keeps it up to date on its own.
              </p>
              <p>Keep one copy only. If you installed the extension from a .zip file in the past, remove that copy first.</p>
            </Step>

            <Step number={2} title="Connect the extension to your account">
              <p>If you are signed in to Olanovo in this browser, a "Connect the extension" button appears here once the extension is installed (version 0.6.8 or later). Or click the puzzle icon in the Chrome toolbar, pin the Olanovo extension, click its icon and sign in with the email and password you use on this site. No password? Open Settings on this site and click "Connect the extension".</p>
              <ConnectExtensionButton className="mt-3" />
            </Step>

            <Step number={3} title="Be signed in to LinkedIn in the same Chrome">
              <p>The extension reads LinkedIn through your own session. It never sees or stores your LinkedIn password.</p>
            </Step>

            <Step number={4} title="Tell Olanovo your subjects and search terms">
              <p>
                In <Link to="/settings" className="text-primary font-medium hover:underline">Settings</Link>, list the subjects you want to be known for and, for each one, what you think and what you
                have seen in your work. Then add a few search terms: the words Olanovo looks for in the posts of your
                connections. Click <strong>Save</strong>. Until your subjects are saved, no draft is written; without search terms,
                Olanovo does not search the posts of your connections (contacts you put in a list are still checked).
              </p>
            </Step>

            <Step number={5} title="Choose your days and hours">
              <p>Also in Settings. The extension works only inside them. Pick the hours when your computer is normally on.</p>
            </Step>

            <Step number={6} title="Bring your connections and pick who matters">
              <p>
                In <Link to="/dashboard" className="text-primary font-medium hover:underline">Lists</Link>, create a list and upload the connections file LinkedIn
                emails you (the screen shows where to ask for it). Describe who matters to you and Olanovo keeps that shortlist.
                Run one list at a time: the daily ceiling is shared, so a second list only slows the first.
              </p>
            </Step>

            <Step number={7} title="Optional: describe an audience">
              <p>
                In <Link to="/network" className="text-primary font-medium hover:underline">Network</Link>, describe the people you would like to meet and write the note that goes with the invitation.
                Sales Navigator is not required; it only makes the search more precise.
              </p>
            </Step>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" /> What to expect
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              On the first day the extension reads your list of connections and starts looking at recent posts, a few contacts at a time.
              Drafts appear in the <Link to="/inbox" className="text-primary font-medium hover:underline">Inbox</Link> when a post is about one of your subjects; other posts are skipped on purpose.
            </p>
            <p>
              The pace is low by design: every profile page counts toward one daily ceiling that starts at 15 and grows by 5 a week, up to 40.
              A large network is covered over weeks, not days.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Moon className="w-4 h-4 text-primary" /> It works while you work
            </CardTitle>
            <CardDescription>You do not need to leave the computer on all day or change any system setting.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>
              The extension runs while Chrome is open and the computer is awake, inside your active hours. When the computer sleeps, it
              pauses. When it wakes up, it waits a few minutes and continues at the normal pace. It never rushes to catch up.
            </p>
            <p>
              If your computer goes to sleep quickly while you are away from the keyboard and you would like it to keep working during
              your active hours, you can lengthen the sleep time in the system settings. This is optional.
            </p>
            <Tabs defaultValue="macos">
              <TabsList className="w-full">
                <TabsTrigger value="macos" className="flex-1 gap-1.5"><Monitor className="w-3.5 h-3.5" /> macOS</TabsTrigger>
                <TabsTrigger value="windows" className="flex-1 gap-1.5"><Monitor className="w-3.5 h-3.5" /> Windows</TabsTrigger>
              </TabsList>
              <TabsContent value="macos" className="mt-3 space-y-1.5">
                <p>Open <strong>System Settings</strong> and look under <strong>Battery</strong> (laptops) or <strong>Energy</strong> (desktops) for the option that prevents automatic sleeping while plugged in.</p>
                <p className="text-xs">The exact name of the option changes between macOS versions. A laptop still sleeps when the lid is closed.</p>
              </TabsContent>
              <TabsContent value="windows" className="mt-3 space-y-1.5">
                <p>Open <strong>Settings</strong>, then <strong>System</strong>, then <strong>Power &amp; battery</strong>, and under screen and sleep choose a longer time, or Never, for when the device is plugged in.</p>
                <p className="text-xs">The exact wording changes between Windows versions.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-primary" /> If it stops
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-2">
            <p>
              If LinkedIn shows a verification page or signs you out, the extension pauses everything. Sign in to LinkedIn again, check
              that all is normal, and resume from the button in the sidebar. Nothing restarts by itself.
            </p>
            <p>
              The sidebar shows whether the extension is on, paused or offline. Offline usually means Chrome is closed, the computer is
              asleep, or the extension needs you to sign in again. If it stays stopped for a long time, you get an email.
            </p>
            <p>
              More answers in the <Link to="/help" className="text-primary font-medium hover:underline">Help center</Link>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
