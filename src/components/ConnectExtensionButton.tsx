import { useCallback, useEffect, useRef, useState } from 'react';
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
export default function ConnectExtensionButton({ className, onConnected, notice }: {
  className?: string;
  onConnected?: () => void;
  /** Shown across the app: says why nothing is running, and shows nothing at all once connected. */
  notice?: boolean;
}) {
  const { user } = useAuth();
  const userId = user?.id || null;
  // Kept with the account it was asked for: after a change of account the old answer is not shown.
  const [answer, setAnswer] = useState<{ forUser: string | null; found: ExtensionState } | null>(null);
  const state = answer && answer.forUser === userId ? answer.found : null;
  const [busy, setBusy] = useState(false);

  // Returning to the tab fires two events at once: one question to the extension is enough. The
  // question in flight is reused only if it was asked for the same account, and an answer is shown
  // only if it is for the account signed in now (the account loads a moment after the page).
  const looking = useRef<{ forUser: string | null; done: Promise<void> } | null>(null);
  const current = useRef(userId);
  current.current = userId;
  const look = useCallback(() => {
    if (looking.current?.forUser === userId) return looking.current.done;
    const mine = { forUser: userId, done: Promise.resolve() };
    mine.done = findExtension(userId)
      .then(found => { if (current.current === userId) setAnswer({ forUser: userId, found }); })
      .finally(() => { if (looking.current === mine) looking.current = null; });
    looking.current = mine;
    return mine.done;
  }, [userId]);

  // The person may install the extension while this page is open: look again when they come back to it.
  useEffect(() => {
    void look();
    const again = () => { if (document.visibilityState === 'visible') void look(); };
    document.addEventListener('visibilitychange', again);
    // Closing the extension's popup gives the focus back without a visibility change: that is when
    // the person has just disconnected or signed in there.
    window.addEventListener('focus', again);
    return () => { document.removeEventListener('visibilitychange', again); window.removeEventListener('focus', again); };
  }, [look]);

  if (!userId || !state?.found) return null;

  if (state.authenticated && state.sameUser) {
    if (notice) return null;
    return (
      <p className={`text-sm text-muted-foreground flex items-center gap-1.5 ${className || ''}`}>
        <Check className="w-4 h-4 text-primary" /> The extension is connected to this account.
      </p>
    );
  }

  // On another account the extension refuses to be switched from the site, so there is no button.
  if (state.authenticated) {
    if (notice) {
      return (
        <div role="status" className={`rounded-xl border border-attention/40 bg-attention/5 px-4 py-3 text-sm ${className || ''}`}>
          <span className="font-semibold">This browser is not working for this account.</span> {OTHER_ACCOUNT}
        </div>
      );
    }
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
      // A question asked before the connection was made would show the old state: wait for it, then ask again.
      await looking.current?.done;
      await look();
      setBusy(false);
    }
  };

  if (notice) {
    return (
      <div role="status" className={`rounded-xl border border-attention/40 bg-attention/5 px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${className || ''}`}>
        <p className="text-sm m-0">
          <span className="font-semibold">The extension in this browser is not connected to your account.</span>{' '}
          Until it is, this browser reads nothing on LinkedIn and brings no new drafts.
        </p>
        <Button onClick={connect} disabled={busy} size="sm" className="gap-1.5">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
          Connect the extension
        </Button>
      </div>
    );
  }

  return (
    <div className={className}>
      <Button onClick={connect} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plug className="w-4 h-4" />}
        Connect the extension
      </Button>
    </div>
  );
}
