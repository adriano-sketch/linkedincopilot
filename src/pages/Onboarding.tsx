import Brand from '@/components/Brand';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { useExtensionStatus } from '@/hooks/useExtensionStatus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import {
  User, ArrowRight, ArrowLeft, Chrome, Check, Loader2, AlertTriangle, RefreshCw
} from 'lucide-react';

const STEPS = ['Your perspective', 'Connect your browser'];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const { extensionStatus } = useExtensionStatus();
  const [step, setStep] = useState(0);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [waitingForExtension, setWaitingForExtension] = useState(false);
  const [waitStarted, setWaitStarted] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const [form, setForm] = useState({
    sender_name: '',
    sender_title: '',
    company_name: '',
    company_description: '',
  });

  useEffect(() => {
    if (!authLoading && !user) navigate('/');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile) {
      setForm({
        sender_name: profile.sender_name || '',
        sender_title: profile.sender_title || '',
        company_name: profile.company_name || '',
        company_description: profile.company_description || '',
      });
      if (profile.onboarding_completed) navigate('/dashboard');
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (extensionStatus?.is_connected) {
      setExtensionDetected(true);
      setWaitingForExtension(false);
    }
  }, [extensionStatus]);

  const handleNext = async () => {
    if (step === 0) {
      if (!form.sender_name || !form.sender_title || !form.company_name) {
        toast.error('Please fill all required fields');
        return;
      }
      try {
        await updateProfile.mutateAsync({
          sender_name: form.sender_name,
          sender_title: form.sender_title,
          company_name: form.company_name,
          company_description: form.company_description,
          master_onboarding_completed: true,
        });
        setStep(1);
      } catch {
        toast.error('Failed to save');
      }
    }
  };

  const handleStartWaiting = () => {
    setWaitingForExtension(true);
    setWaitStarted(Date.now());
  };

  const handleComplete = async () => {
    try {
      await updateProfile.mutateAsync({
        sender_name: form.sender_name,
        sender_title: form.sender_title,
        company_name: form.company_name,
        company_description: form.company_description,
        onboarding_completed: true,
      });
      toast.success('Setup complete! 🚀');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to complete setup');
    }
  };

  useEffect(() => {
    setTimedOut(false);
    if (!waitingForExtension || !waitStarted) return;
    const timer = window.setTimeout(() => setTimedOut(true), Math.max(0, 60000 - (Date.now() - waitStarted)));
    return () => window.clearTimeout(timer);
  }, [waitStarted, waitingForExtension]);

  if (authLoading || isLoading) return <div className="min-h-screen flex items-center justify-center" role="status"><Loader2 className="animate-spin mr-2" /> Loading your workspace…</div>;

  const stepIndicator = (
    <ol className="wizard-steps" aria-label="Setup progress">{STEPS.map((label, i) => <li key={label} aria-current={i === step ? 'step' : undefined} className={i < step ? 'completed' : ''}><span>0{i + 1}</span>{label}</li>)}</ol>
  );

  return (
    <div className="onboarding-page"><header><Brand /><Link to="/help">Need a hand? ↗</Link></header>
      <div className="onboarding-content"><div className="onboarding-intro"><p className="eyebrow">MAKE COPILOT YOUR OWN</p><h1>Good outreach starts with you.</h1><p>A little context about your business helps shape every message.</p></div>
        {stepIndicator}
        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              {step === 0 && <User className="w-5 h-5 text-primary" />}
              {step === 1 && <Chrome className="w-5 h-5 text-primary" />}
            </div>
            <CardTitle>Step {step + 1} of 2 — {STEPS[step]}</CardTitle>
            <CardDescription>
              {step === 0 && "Give Copilot the perspective behind your outreach. You can update this later."}
              {step === 1 && "Connect the extension that runs campaign actions in your browser."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* STEP 0: Profile */}
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="sender_name">Name *</Label>
                    <Input placeholder="Your name" id="sender_name" value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="sender_title">Title *</Label>
                    <Input placeholder="e.g. Founder, Sales Director" id="sender_title" value={form.sender_title} onChange={e => setForm({ ...form, sender_title: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="company_name">Company *</Label>
                  <Input placeholder="Your company name" id="company_name" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="company_description">Description</Label>
                  <Textarea
                    placeholder="What does your company do? This helps the AI write better messages."
                    id="company_description" value={form.company_description}
                    onChange={e => setForm({ ...form, company_description: e.target.value.slice(0, 1000) })}
                    rows={4}
                  />
                  <p className={`text-xs mt-1 text-right ${(form.company_description?.length || 0) > 1000 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {form.company_description?.length || 0}/1000
                  </p>
                </div>
              </>
            )}

            {/* STEP 1: Extension */}
            {step === 1 && (
              <>
                {extensionDetected ? (
                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 text-center space-y-2">
                    <Check className="w-8 h-8 text-primary mx-auto" />
                    <p className="font-medium text-primary">Extension Connected!</p>
                    <p className="text-sm text-muted-foreground">Your Chrome Extension is active and ready.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium">How to install:</p>
                      <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-4">
                        <li><a className="underline text-foreground" href="/linkedincopilot-extension.zip" download>Download the extension ZIP</a> and extract it</li>
                        <li>Open <code className="bg-muted px-1 rounded">chrome://extensions</code></li>
                        <li>Enable "Developer mode" (top right)</li>
                        <li>Click "Load unpacked" and select the extension folder</li>
                        <li>Log in to LinkedIn in the same browser</li>
                      </ol>
                    </div>

                    {!waitingForExtension ? (
                      <Button onClick={handleStartWaiting} className="w-full">
                        <RefreshCw className="w-4 h-4 mr-2" /> I've installed it — detect now
                      </Button>
                    ) : (
                      <div className="text-center space-y-2">
                        {timedOut ? (
                          <>
                            <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
                            <p className="text-sm text-muted-foreground">
                              Extension not detected yet. Make sure it's installed and LinkedIn is open.
                            </p>
                            <Button variant="outline" size="sm" onClick={() => { setWaitStarted(Date.now()); }}>
                              <RefreshCw className="w-4 h-4 mr-1" /> Try Again
                            </Button>
                          </>
                        ) : (
                          <>
                            <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
                            <p className="text-sm text-muted-foreground">Waiting for extension connection...</p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-4">
              {step > 0 ? (
                <Button variant="ghost" onClick={() => setStep(0)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
              ) : <div />}

              {step === 0 && (
                <Button onClick={handleNext} disabled={updateProfile.isPending}>
                  Next <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}

              {step === 1 && (
                <div className="flex gap-2">
                  {!extensionDetected && (
                    <p className="max-w-40 text-xs text-muted-foreground">You can finish setup later. Execution needs a connected extension.</p>
                  )}
                  <Button onClick={handleComplete} disabled={updateProfile.isPending}>
                    {extensionDetected ? 'Open workspace →' : 'Set up later →'}
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
