import { useState, useEffect } from 'react';
import { EXTENSION_STORE_URL } from '@/lib/extensionStore';
import ConnectExtensionButton from '@/components/ConnectExtensionButton';
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
import { User, ArrowRight, ArrowLeft, Chrome, Check, Loader2, AlertTriangle, RefreshCw, Users } from 'lucide-react';

const STEPS = ['Your Profile', 'Who matters to your business', 'Install Extension'];
/** Short of this, the description is a job title and nothing else: not enough to tell contacts apart. */
const MIN_AUDIENCE_CHARS = 30;

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
    icp_description: '',
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
        icp_description: profile.icp_description || '',
      });
      if (profile.onboarding_completed) navigate('/today');
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
    } else if (step === 1) {
      const description = form.icp_description.trim();
      if (description.length < MIN_AUDIENCE_CHARS) {
        toast.error('Add a little more: their role, the kind of company, and where they are');
        return;
      }
      try {
        await updateProfile.mutateAsync({ icp_description: description });
        setStep(2);
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
      toast.success('Setup complete');
      // Straight to the step that makes the rest work: finding, among their contacts, the people
      // who fit what they just described.
      navigate('/dashboard?new=1');
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
              {step === 1 && <Users className="w-5 h-5 text-primary" />}
              {step === 2 && <Chrome className="w-5 h-5 text-primary" />}
            </div>
            <CardTitle>Step {step + 1} of {STEPS.length}: {STEPS[step]}</CardTitle>
            <CardDescription>
              {step === 0 && "Tell us about you and your company."}
              {step === 1 && "The most important step. Most of a LinkedIn network has nothing to do with what you sell: Olanovo uses this description to pick, among your contacts, the people worth staying close to, and to find new people like them. Everyone else is left alone."}
              {step === 2 && "Install the Chrome extension. It reads LinkedIn for you; you approve and post everything yourself."}
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
                    placeholder="What does your company do? This helps the drafts sound like you."
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

            {/* STEP 1: Who matters */}
            {step === 1 && (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="audience-description">Who buys from you, or sends you business? *</Label>
                  <Textarea
                    id="audience-description"
                    placeholder="Their role, the kind of company they work at, its size, and where they are. One or two sentences."
                    value={form.icp_description}
                    onChange={e => setForm({ ...form, icp_description: e.target.value.slice(0, 500) })}
                    rows={4}
                    className="mt-1"
                  />
                  <p className="text-xs mt-1 text-right text-muted-foreground">{form.icp_description.length}/500</p>
                </div>
                <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 m-0">
                  <li>Be specific. "Decision makers" matches everyone; a role in a kind of company in a place matches the right few.</li>
                  <li>Describe the person, not your product.</li>
                  <li>You can change it later, and add other descriptions for other groups.</li>
                </ul>
              </div>
            )}

            {/* STEP 2: Extension */}
            {step === 2 && (
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
                        <li>Open <a href={EXTENSION_STORE_URL} target="_blank" rel="noopener noreferrer" className="text-primary font-medium hover:underline">the Olanovo extension on the Chrome Web Store</a> and click "Add to Chrome"</li>
                        <li>Connect it to your account: use the button below when it appears, or click the extension icon in the Chrome toolbar and sign in with the email and password you use here</li>
                        <li>Log in to LinkedIn in the same browser</li>
                      </ol>
                    </div>

                    <ConnectExtensionButton onConnected={handleStartWaiting} />

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
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  <ArrowLeft className="w-4 h-4 mr-1" /> Back
                </Button>
              ) : <div />}

              {step < 2 && (
                <Button onClick={handleNext} disabled={updateProfile.isPending}>
                  Next <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              )}

              {step === 2 && (
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
