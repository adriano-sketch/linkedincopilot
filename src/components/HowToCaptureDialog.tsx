import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, Chrome, MousePointerClick, Send, CheckCircle } from 'lucide-react';

export default function HowToCaptureDialog() {
  const steps = [
    { icon: Chrome, title: 'Install Extension', desc: 'Load the Chrome extension from Settings → Extension Token → Download' },
    { icon: MousePointerClick, title: 'Open LinkedIn Profile', desc: 'Navigate to the connection\'s LinkedIn profile page' },
    { icon: Send, title: 'Click "Capture"', desc: 'Click the extension popup and hit "Capture this profile"' },
    { icon: CheckCircle, title: 'Done!', desc: 'The snapshot is sent. AI generates your DM in seconds.' },
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs gap-1">
          <HelpCircle className="w-3 h-3" /> How to Capture
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>How to Capture a Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          {steps.map((s, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">{s.title}</p>
                <p className="text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
