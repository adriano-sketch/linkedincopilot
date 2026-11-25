import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { connectExtension, findExtension, type ExtensionState } from '@/lib/extensionBridge';

const OTHER_ACCOUNT = 'The extension in this browser is connected to another Olanovo account. Open the extension, disconnect it there, then connect it here.';

/**
 * "Connect the extension" for the person signed in on the site: one click, no password typed in
 * the extension. Shows nothing when the extension is not installed, is an older version that does
 * not answer the site, or nobody is signed in; the written steps around it cover those cases.
 */
export default function ConnectExtensionButton({ className, onConnected }: { className?: string; onConnected?: () => void }) {
  const { user } = useAuth();
  const userId = user?.id || null;
  const [state, setState] = useState<ExtensionState | null>(null);
  const [busy, setBusy] = useState(false);

  const look = useCallback(async () => { setState(await findExtension(userId)); }, [userId]);

  // The person may install the extension while this page is open: look again when they come back to it.
  useEffect(() => {
    void look();
    const again = () => { if (document.visibilityState === 'visible') void look(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, [look]);

  if (!userId || !state?.found) return null;

  if (state.authenticated && state.sameUser) {
    return (
      <p className={`text-sm text-muted-foreground flex items-center gap-1.5 ${className || ''}`}>
        <Check className="w-4 h-4 text-primary" /> The extension is connected to this account.
      </p>
    );
  }

  // On another account the extension refuses to be switched from the site, so there is no button.
  if (state.authenticated) {
    return <p className={`text-xs text-muted-foreground ${className || ''}`}>{OTHER_ACCOUNT}</p>;
  }

  const connect = async () => {
    setBusy(true);
    try {
      const r = await connectExtension(userId);
      if (r.ok === true) {
        toast.success('Extension connected');
        onConnected?.();
        return;
      }
      const reason = 'reason' in r ? r.reason : 'server';
      if (reason === 'not_found') toast.error('The extension did not answer. Check that it is installed and turned on in this browser.');
      else if (reason === 'other_account') toast.error(OTHER_ACCOUNT);
      else if (reason === 'too_soon') toast.error('That was just tried. Wait a minute and try again.');
      else toast.error('Could not connect the extension. Try again, or sign in from the extension itself.');
    } finally {
      await look();
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Button onClick={connect} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
        Connect the extension
      </Button>
    </div>
  );
}
