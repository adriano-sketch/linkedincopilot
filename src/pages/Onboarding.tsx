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

const STEPS = ['Your Profile', 'Install Extension'];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, isLoading, updateProfile } = useProfile();
  const { extensionStatus } = useExtensionStatus();
  const [step, setStep] = useState(0);
  const [extensionDetected, setExtensionDetected] = useState(false);
  const [waitingForExtension, setWaitingForExtension] = useState(false);
  const [waitStarted, setWaitStarted] = useState<number | null>(null);

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

  const timedOut = waitStarted && Date.now() - waitStarted > 60000;

  if (isLoading) return null;

  const stepIndicator = (
    <div className="flex gap-2 mb-6">
      {STEPS.map((_, i) => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-border'}`} />
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {stepIndicator}
        <Card>
          <CardHeader>
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              {step === 0 && <User className="w-5 h-5 text-primary" />}
              {step === 1 && <Chrome className="w-5 h-5 text-primary" />}
            </div>
            <CardTitle>Step {step + 1} of 2 — {STEPS[step]}</CardTitle>
            <CardDescription>
              {step === 0 && "Tell us about you and your company."}
              {step === 1 && "Install the Chrome Extension to automate LinkedIn actions."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* STEP 0: Profile */}
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Name *</Label>
                    <Input placeholder="Your name" value={form.sender_name} onChange={e => setForm({ ...form, sender_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Title *</Label>
                    <Input placeholder="e.g. Founder, Sales Director" value={form.sender_title} onChange={e => setForm({ ...form, sender_title: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Company *</Label>
                  <Input placeholder="Your company name" value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    placeholder="What does your company do? This helps the AI write better messages."
                    value={form.company_description}
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
                        <li>Download the extension files from your dashboard</li>
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
                    <Button variant="ghost" onClick={handleComplete} disabled={updateProfile.isPending}>
                      Skip for now
                    </Button>
                  )}
                  <Button onClick={handleComplete} disabled={updateProfile.isPending}>
                    {extensionDetected ? 'Go to Dashboard →' : 'Continue →'}
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
