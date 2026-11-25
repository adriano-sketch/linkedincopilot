import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Plug } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { connectExtension, findExtension, type ExtensionState } from '@/lib/extensionBridge';

/**
 * "Connect the extension" for the person signed in on the site: one click, no password typed in
 * the extension. Shows nothing when the extension is not installed, is an older version that does
 * not answer the site, or nobody is signed in; the written steps around it cover those cases.
 */
export default function ConnectExtensionButton({ className, onConnected }: { className?: string; onConnected?: () => void }) {
  const { user } = useAuth();
  const [state, setState] = useState<ExtensionState | null>(null);
  const [busy, setBusy] = useState(false);

  const look = useCallback(async () => { setState(await findExtension()); }, []);

  // The person may install the extension while this page is open: look again when they come back to it.
  useEffect(() => {
    void look();
    const again = () => { if (document.visibilityState === 'visible') void look(); };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [look]);

  if (!user || !state?.found) return null;

  if (state.authenticated && state.userId === user.id) {
    return (
      <p className={`text-sm text-muted-foreground flex items-center gap-1.5 ${className || ''}`}>
        <Check className="w-4 h-4 text-primary" /> The extension is connected to this account.
      </p>
    );
  }

  const connect = async () => {
    setBusy(true);
    try {
      const r = await connectExtension();
      if (r.ok === true) {
        toast.success('Extension connected');
        onConnected?.();
      } else if ('reason' in r && r.reason === 'not_found') {
        toast.error('The extension did not answer. Check that it is installed and turned on in this browser.');
      } else {
        toast.error('Could not connect the extension. Try again, or sign in from the extension itself.');
      }
    } finally {
      await look();
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <Button onClick={connect} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
        {state.authenticated ? 'Connect the extension to this account' : 'Connect the extension'}
      </Button>
      {state.authenticated && (
        <p className="text-xs text-muted-foreground mt-1.5">The extension in this browser is connected to another Olanovo account.</p>
      )}
    </div>
  );
}
