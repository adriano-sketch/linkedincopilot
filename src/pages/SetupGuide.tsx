import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Monitor, Terminal, CheckCircle2, AlertTriangle, Copy } from 'lucide-react';
import { toast } from 'sonner';

const CodeBlock = ({ code, label }: { code: string; label?: string }) => (
  <div className="relative group">
    {label && <p className="text-xs text-muted-foreground mb-1">{label}</p>}
    <div className="bg-muted/70 border border-border rounded-lg p-3 font-mono text-sm overflow-x-auto">
      <code className="text-foreground">{code}</code>
      <button
        onClick={() => { navigator.clipboard.writeText(code); toast.success('Copied!'); }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md bg-background/80 hover:bg-background border border-border"
      >
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      </button>
    </div>
  </div>
);

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
          <Link to="/settings"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-bold">Setup Guide</h1>
            <p className="text-sm text-muted-foreground">Keep your computer awake so the Copilot runs 24/7</p>
          </div>
        </div>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex items-start gap-3 pt-4">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">Why is this needed?</p>
              <p className="text-muted-foreground mt-1">
                The Chrome Extension needs Chrome running to execute LinkedIn actions. If your computer sleeps, 
                actions stop. These settings prevent sleep while still letting your monitor turn off to save energy.
              </p>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="macos">
          <TabsList className="w-full">
            <TabsTrigger value="macos" className="flex-1 gap-1.5">
              <Monitor className="w-3.5 h-3.5" /> macOS
            </TabsTrigger>
            <TabsTrigger value="windows" className="flex-1 gap-1.5">
              <Monitor className="w-3.5 h-3.5" /> Windows
            </TabsTrigger>
          </TabsList>

          <TabsContent value="macos" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" /> Quick Setup (Recommended)
                </CardTitle>
                <CardDescription>One command to configure everything</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Step number={1} title="Open Terminal">
                  <p>Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono">⌘ + Space</kbd>, type <strong>Terminal</strong>, and press Enter.</p>
                </Step>

                <Step number={2} title="Run this command">
                  <CodeBlock code="sudo pmset -a sleep 0 disksleep 0 displaysleep 10 womp 1 powernap 0" />
                  <p>You'll be asked for your Mac password — type it and press Enter (it won't show characters).</p>
                </Step>

                <Step number={3} title="Keep awake with caffeinate">
                  <p>Run this in Terminal to <strong>prevent sleep even with the lid closed</strong> (if connected to a monitor/power):</p>
                  <CodeBlock code="caffeinate -s &" />
                  <p>This keeps your Mac awake as long as it's plugged in. To make it persist after reboots, add it to your login items.</p>
                  <div className="bg-muted/30 rounded-lg p-2 mt-1">
                    <p className="text-xs text-muted-foreground">💡 <strong>To auto-start caffeinate on login:</strong> Open <strong>System Settings → General → Login Items</strong>, click <strong>+</strong>, press <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px] font-mono">⌘ + Shift + G</kbd>, type <strong>/usr/bin/caffeinate</strong> and add it.</p>
                  </div>
                </Step>

                <Step number={4} title="Verify the settings">
                  <CodeBlock code="pmset -g" />
                  <p>Check that the output shows:</p>
                  <div className="space-y-1 pl-2 border-l-2 border-primary/30">
                    <p className="font-mono text-xs"><CheckCircle2 className="w-3 h-3 text-primary inline mr-1" /> sleep = 0 (never sleep)</p>
                    <p className="font-mono text-xs"><CheckCircle2 className="w-3 h-3 text-primary inline mr-1" /> disksleep = 0 (disk stays awake)</p>
                    <p className="font-mono text-xs"><CheckCircle2 className="w-3 h-3 text-primary inline mr-1" /> displaysleep = 10 (monitor off after 10 min)</p>
                    <p className="font-mono text-xs"><CheckCircle2 className="w-3 h-3 text-primary inline mr-1" /> womp = 1 (wake on network access)</p>
                  </div>
                </Step>

                <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">What each parameter does:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                    <li><strong>sleep 0</strong> — Prevents the Mac from entering system sleep</li>
                    <li><strong>disksleep 0</strong> — Keeps the hard disk spinning (prevents disk sleep)</li>
                    <li><strong>displaysleep 10</strong> — Turns off the display after 10 minutes (saves energy)</li>
                    <li><strong>womp 1</strong> — Enables Wake on LAN so network access can wake it up</li>
                    <li><strong>powernap 0</strong> — Disables Power Nap (prevents micro-sleeps)</li>
                    <li><strong>caffeinate -s</strong> — Prevents system sleep while on AC power</li>
                  </ul>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-foreground">⚙️ Also check these System Settings:</p>
                  <ul className="text-xs text-muted-foreground space-y-1.5">
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span><strong>System Settings → Battery → Options</strong> → Turn OFF <strong>"Put hard disks to sleep when possible"</strong></span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span><strong>System Settings → Battery → Options</strong> → Turn OFF <strong>"Enable Power Nap"</strong></span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span><strong>System Settings → Battery</strong> → Set <strong>"Turn display off after"</strong> to a low value (not Never)</span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      <span><strong>System Settings → Lock Screen</strong> → Set <strong>"Require password after screen saver"</strong> to <strong>a longer interval</strong> (prevents login screen blocking Chrome)</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" /> Laptop with Lid Closed
                </CardTitle>
                <CardDescription>MacBooks sleep when you close the lid — here's how to prevent it</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3">
                  <p className="text-xs text-foreground"><strong>⚠️ Important:</strong> macOS <strong>always</strong> sleeps when you close the lid, even with <code className="bg-muted px-1 rounded text-[10px]">pmset sleep 0</code>. The commands above only work with the lid open.</p>
                </div>

                <div className="space-y-3">
                  <div className="border border-border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" /> Option 1: Keep the lid open (simplest)
                    </p>
                    <p className="text-xs text-muted-foreground">Just leave the MacBook open. The screen will turn off after 10 minutes to save energy, but Chrome keeps running.</p>
                  </div>

                  <div className="border border-border rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" /> Option 2: Clamshell Mode (lid closed)
                    </p>
                    <p className="text-xs text-muted-foreground">macOS supports running with the lid closed <strong>if</strong> you connect:</p>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      <li>An external monitor (or HDMI dummy plug ~$8)</li>
                      <li>A power adapter</li>
                      <li>An external keyboard + mouse (or Bluetooth)</li>
                    </ul>
                    <p className="text-xs text-muted-foreground mt-1">With these connected, close the lid and the Mac stays awake.</p>
                  </div>

                  <div className="border border-primary/30 rounded-lg p-3 space-y-3 bg-primary/5">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-primary" /> Option 3: Amphetamine (recommended)
                    </p>
                    <p className="text-xs text-muted-foreground">Free app from the Mac App Store that can keep your Mac awake even with the lid closed — <strong>no external monitor needed</strong>.</p>
                    
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">1. Install & General Settings:</p>
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                        <li>Download <strong>Amphetamine</strong> from the Mac App Store</li>
                        <li>Open Preferences → <strong>General</strong></li>
                        <li>Check <strong>"Launch Amphetamine at login"</strong></li>
                        <li>Check <strong>"Start session when Amphetamine launches"</strong></li>
                        <li>Check <strong>"Hide Amphetamine in the Dock"</strong> (optional, keeps it clean)</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">2. Session Defaults:</p>
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                        <li>Set <strong>Default Duration</strong> to <strong>"Indefinitely"</strong></li>
                        <li>Uncheck <strong>"Allow display sleep"</strong> (or leave checked if you want the screen to turn off)</li>
                        <li><strong>Closed-Display Mode</strong> → Uncheck <strong>"Allow system sleep when display is closed"</strong> ← this is the key setting!</li>
                        <li>Screen Saver → check <strong>"Allow screen saver"</strong> (saves energy)</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-medium text-foreground">3. System Control:</p>
                      <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                        <li>Uncheck <strong>"Lock screen after X of inactivity"</strong> (prevents login screen from blocking Chrome)</li>
                        <li>Uncheck <strong>"Lock screen immediately after display is closed"</strong></li>
                        <li>Cursor movement is <strong>not needed</strong> — leave unchecked</li>
                      </ul>
                    </div>

                    <div className="bg-primary/10 rounded p-2">
                      <p className="text-xs text-primary font-medium">✅ With these settings, your Mac stays awake 24/7 — even with the lid closed — and Amphetamine starts automatically on boot. No external monitor needed.</p>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-foreground mb-1">↩️ To revert pmset to default settings:</p>
                  <CodeBlock code="sudo pmset -a sleep 1 disksleep 10 displaysleep 10 womp 0" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="windows" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-primary" /> Quick Setup (Recommended)
                </CardTitle>
                <CardDescription>Run these commands in Command Prompt as Administrator</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Step number={1} title="Open Command Prompt as Admin">
                  <p>Press <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-xs font-mono">Win + X</kbd>, then select <strong>"Terminal (Admin)"</strong> or <strong>"Command Prompt (Admin)"</strong>.</p>
                </Step>

                <Step number={2} title="Disable sleep (plugged in)">
                  <CodeBlock code="powercfg -change -standby-timeout-ac 0" label="Disable sleep on AC power" />
                  <CodeBlock code="powercfg -change -hibernate-timeout-ac 0" label="Disable hibernation on AC power" />
                  <CodeBlock code="powercfg -change -monitor-timeout-ac 10" label="Turn off monitor after 10 minutes" />
                </Step>

                <Step number={3} title="Disable sleep (on battery — optional)">
                  <CodeBlock code="powercfg -change -standby-timeout-dc 0" label="Disable sleep on battery" />
                  <CodeBlock code="powercfg -change -hibernate-timeout-dc 0" label="Disable hibernation on battery" />
                  <p className="text-xs text-destructive">⚠️ Only do this if your laptop stays plugged in. This will drain your battery.</p>
                </Step>

                <Step number={4} title="Enable Wake on LAN">
                  <p>This is usually configured in BIOS/UEFI or in Device Manager:</p>
                  <ol className="list-decimal pl-4 space-y-1 text-xs">
                    <li>Open <strong>Device Manager</strong> (Win + X → Device Manager)</li>
                    <li>Expand <strong>Network adapters</strong></li>
                    <li>Right-click your network adapter → <strong>Properties</strong></li>
                    <li>Go to <strong>Power Management</strong> tab</li>
                    <li>Check <strong>"Allow this device to wake the computer"</strong></li>
                  </ol>
                </Step>

                <Step number={5} title="Verify the settings">
                  <CodeBlock code="powercfg /query" />
                  <p>Look for "Sleep after" values showing <strong>0x00000000</strong> (never).</p>
                </Step>

                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-medium text-foreground mb-1">↩️ To revert to defaults:</p>
                  <CodeBlock code="powercfg -change -standby-timeout-ac 30" label="Sleep after 30 min" />
                  <CodeBlock code="powercfg -change -hibernate-timeout-ac 60" label="Hibernate after 60 min" />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Card>
          <CardContent className="flex items-start gap-3 pt-4">
            <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-foreground">You're all set!</p>
              <p className="text-muted-foreground mt-1">
                With these settings, your computer will stay awake and Chrome will keep running the LinkedIn Copilot
                extension — even with the monitor off. Just make sure Chrome is open with a LinkedIn tab.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
