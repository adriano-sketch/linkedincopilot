import { useGoogleSignIn } from '@/lib/authProviders';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Logo from '@/components/Logo';
import { supabase } from '@/integrations/supabase/client';

export default function AuthPage() {
  const { user, loading: authLoading, signUpWithEmail, signInWithEmail, signInWithGoogle } = useAuth();
  const googleOn = useGoogleSignIn();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'recovery'>(() => {
    // Read from the address at once, so a "Log in" link does not flash the sign-up form first.
    const m = searchParams.get('mode') || searchParams.get('type');
    return m === 'recovery' ? 'recovery' : m === 'signin' ? 'signin' : 'signup';
  });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const validatePassword = (pw: string) => {
    if (pw.length < 8) return 'At least 8 characters';
    if (!/[A-Z]/.test(pw)) return 'Include at least one uppercase letter';
    if (!/[0-9]/.test(pw)) return 'Include at least one number';
    return '';
  };

  useEffect(() => {
    const urlMode = searchParams.get('mode') || searchParams.get('type');
    if (urlMode === 'recovery') setMode('recovery');
    else if (urlMode === 'signin') setMode('signin');
  }, [searchParams]);

  useEffect(() => {
    if (!authLoading && user && mode !== 'recovery') navigate('/onboarding');
  }, [user, authLoading, navigate, mode]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup') {
      const err = validatePassword(password);
      if (err) { setPasswordError(err); return; }
    }
    setPasswordError('');
    setSubmitting(true);
    const fn = mode === 'signup' ? signUpWithEmail : signInWithEmail;
    const result = await fn(email, password);
    const error = (result as any)?.error;
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    if (mode === 'signup') {
      const session = (result as any)?.data?.session ?? null;
      if (!session) {
        toast({
          title: 'Check your email to confirm',
          description: 'We sent a confirmation link. After confirming, return here to sign in.',
        });
        setMode('signin');
      } else {
        toast({ title: 'Account created', description: 'Welcome to Olanovo.' });
      }
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?mode=recovery`,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reset email sent', description: 'Check your inbox for the reset link.' });
    setMode('signin');
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validatePassword(recoveryPassword);
    if (err) { setPasswordError(err); return; }
    if (recoveryPassword !== recoveryConfirm) {
      setPasswordError('Passwords do not match');
      return;
    }
    setPasswordError('');
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: recoveryPassword });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Password updated', description: 'You can now sign in with your new password.' });
    setRecoveryPassword('');
    setRecoveryConfirm('');
    setMode('signin');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
      <button onClick={() => navigate('/')} className="absolute top-6 left-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      <div className="flex items-center gap-2 mb-8">
        <Logo className="text-xl" markClassName="w-9 h-9" />
      </div>

      <Card className="w-full max-w-sm shadow-lg">
        <CardContent className="p-6">
          <h1 className="text-xl font-bold text-center mb-1">
            {mode === 'signup' && 'Start your 14-day free trial'}
            {mode === 'signin' && 'Welcome back'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'recovery' && 'Set a new password'}
          </h1>
          <p className="text-sm text-muted-foreground text-center mb-6">
            {mode === 'signup' && 'Everything included. No credit card.'}
            {mode === 'signin' && 'Sign in to your account'}
            {mode === 'forgot' && 'We will email you a reset link'}
            {mode === 'recovery' && 'Choose a strong password to continue'}
          </p>

          {googleOn && (mode === 'signin' || mode === 'signup') && (
            <>
              <Button type="button" variant="outline" className="w-full font-semibold" onClick={() => void signInWithGoogle()}>
                Continue with Google
              </Button>
              <div className="flex items-center gap-3 my-4 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <form onSubmit={handleEmailSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" placeholder="Min. 8 chars, 1 uppercase, 1 number" value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }} minLength={8} required />
                {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
              </div>
              <Button type="submit" className="w-full bg-gold hover:opacity-90 text-primary-foreground font-semibold" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                {mode === 'signup' ? 'Create Account' : 'Sign In'}
              </Button>
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="text-xs text-gold-dark font-medium hover:underline w-full text-center"
                >
                  Forgot your password?
                </button>
              )}
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="reset-email">Email</Label>
                <Input id="reset-email" type="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full bg-gold hover:opacity-90 text-primary-foreground font-semibold" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Send reset email
              </Button>
              <button
                type="button"
                onClick={() => setMode('signin')}
                className="text-xs text-muted-foreground hover:underline w-full text-center"
              >
                Back to sign in
              </button>
            </form>
          )}

          {mode === 'recovery' && (
            <form onSubmit={handleRecoverySubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-password">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Min. 8 chars, 1 uppercase, 1 number"
                  value={recoveryPassword}
                  onChange={(e) => { setRecoveryPassword(e.target.value); setPasswordError(''); }}
                  minLength={8}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Repeat new password"
                  value={recoveryConfirm}
                  onChange={(e) => { setRecoveryConfirm(e.target.value); setPasswordError(''); }}
                  minLength={8}
                  required
                />
                {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
              </div>
              <Button type="submit" className="w-full bg-gold hover:opacity-90 text-primary-foreground font-semibold" disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Update password
              </Button>
            </form>
          )}

          {mode === 'signup' && (
            <p className="text-center text-xs text-muted-foreground mt-4">
              By creating an account, you agree to the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Terms of Service</a> and the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">Privacy Policy</a>.
            </p>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <p className="text-center text-sm text-muted-foreground mt-5">
              {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')} className="text-gold-dark font-semibold hover:underline">
                {mode === 'signup' ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
