import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Check, Loader2, ExternalLink, Copy, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useGmailConnection } from '@/hooks/useGmailConnection';

interface IntegrationsPanelProps {
  profile: any;
  onUpdateProfile: (updates: Record<string, unknown>) => Promise<void>;
  isOnboarding?: boolean;
  onNext?: () => void;
}

export default function IntegrationsPanel({ profile, onUpdateProfile, isOnboarding, onNext }: IntegrationsPanelProps) {
  const [extensionChecked, setExtensionChecked] = useState(false);
  const { isConnected: gmailConnected, connectGmail, isConnecting } = useGmailConnection();

  const copyToken = () => {
    if (profile?.extension_token) {
      navigator.clipboard.writeText(profile.extension_token);
      toast.success('Token copied!');
    }
  };

  const canProceed = !isOnboarding || extensionChecked;

  return (
    <div className="space-y-4">
      {/* Gmail */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">📧 Gmail <span className="text-muted-foreground text-xs font-normal">(Optional)</span></CardTitle>
            {gmailConnected && <Badge variant="default" className="text-xs"><Check className="w-3 h-3 mr-1" /> Connected</Badge>}
          </div>
          <CardDescription className="text-xs">Connect Gmail to detect LinkedIn connection acceptances via email.</CardDescription>
        </CardHeader>
        <CardContent>
          {!gmailConnected ? (
            <Button size="sm" variant="outline" onClick={connectGmail} disabled={isConnecting}>
              {isConnecting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting...</> : <><Mail className="w-3 h-3 mr-1" /> Connect Gmail</>}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3" /> Gmail connected</p>
          )}
        </CardContent>
      </Card>

      {/* Chrome Extension */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">🧩 Chrome Extension {isOnboarding && <span className="text-destructive">*</span>}</CardTitle>
          </div>
          <CardDescription className="text-xs">Install our Chrome extension to capture LinkedIn profile data. This is what makes your DMs truly personalized.</CardDescription>
          {isOnboarding && <Badge variant="secondary" className="text-xs mt-1">Required for AI-powered DMs</Badge>}
        </CardHeader>
        <CardContent className="space-y-2">
          {profile?.extension_token ? (
            <div className="flex gap-2">
              <Input value={profile.extension_token} readOnly className="font-mono text-xs" />
              <Button variant="outline" size="sm" onClick={copyToken}><Copy className="w-3 h-3" /></Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Extension token will be generated after saving your profile.</p>
          )}
          <p className="text-xs text-muted-foreground">Install the extension and paste this token in the popup to link it.</p>
          {isOnboarding && (
            <label className="flex items-center gap-2 text-sm mt-2">
              <input type="checkbox" checked={extensionChecked} onChange={e => setExtensionChecked(e.target.checked)} className="rounded" />
              I've installed the Chrome Extension
            </label>
          )}
        </CardContent>
      </Card>

      {isOnboarding && (
        <div className="flex justify-end pt-2">
          <Button onClick={onNext} disabled={!canProceed} size="lg">
            {canProceed ? 'Next: Create Your First Campaign →' : 'Install extension to continue'}
          </Button>
        </div>
      )}
    </div>
  );
}
