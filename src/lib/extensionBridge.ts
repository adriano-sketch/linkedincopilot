import { supabase } from '@/integrations/supabase/client';

// Talking to the Olanovo browser extension from this site.
//
// From version 0.6.8 the extension accepts messages from olanovo.com. The site uses that to see
// whether the extension is installed and to connect it to the account signed in here, with no
// password typed in the extension. Older versions do not answer: every function here then reports
// "not found", and the page keeps showing how to sign in from the extension itself.

/** The extension's id on the Chrome Web Store. */
const STORE_ID = 'ddcdamnmknicgdafjooejmfapamgohgo';

// For testing a copy of the extension loaded from a folder, which gets another id: the id can be
// set in this browser's storage for this site (key "olanovo_extension_id"), from the developer
// console. Never read from the address of the page, which a link from someone else could set.
function extensionId(): string {
  try {
    const own = localStorage.getItem('olanovo_extension_id') || '';
    if (/^[a-p]{32}$/.test(own)) return own;
  } catch { /* storage not available */ }
  return STORE_ID;
}

type Runtime = { sendMessage: (id: string, message: unknown, callback: (response: unknown) => void) => void; lastError?: { message?: string } };
const runtime = (): Runtime | null => {
  const c = (globalThis as unknown as { chrome?: { runtime?: Runtime } }).chrome;
  return c?.runtime && typeof c.runtime.sendMessage === 'function' ? c.runtime : null;
};

/** Sends one message and waits for the answer. Null when there is no extension to answer, or it took too long. */
function ask<T>(message: unknown, timeoutMs = 4000): Promise<T | null> {
  return new Promise(resolve => {
    const rt = runtime();
    if (!rt) return resolve(null);
    let done = false;
    const finish = (value: T | null) => { if (!done) { done = true; resolve(value); } };
    const timer = setTimeout(() => finish(null), timeoutMs);
    try {
      rt.sendMessage(extensionId(), message, response => {
        clearTimeout(timer);
        // Reading lastError tells the browser the failure was seen (no extension, or an older one).
        const failed = !!runtime()?.lastError;
        finish(failed || !response || typeof response !== 'object' ? null : (response as T));
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

export type ExtensionState =
  | { found: false }
  | { found: true; version: string; authenticated: boolean; sameUser: boolean };

/**
 * Is the extension installed in this browser, is it connected, and is it on this account? The
 * extension answers "same account or not"; it does not say which account it holds.
 */
export async function findExtension(userId?: string | null): Promise<ExtensionState> {
  const r = await ask<{ success?: boolean; version?: string; authenticated?: boolean; sameUser?: boolean }>({ type: 'OLANOVO_PING', userId: userId || '' });
  if (!r || r.success !== true) return { found: false };
  return { found: true, version: String(r.version || ''), authenticated: r.authenticated === true, sameUser: r.sameUser === true };
}

/**
 * Connects the extension to the account signed in on this site. The extension gets a session of
 * its own (asked from the server for this account), not a copy of this page's.
 */
export type ConnectResult = { ok: true } | { ok: false; reason: 'not_found' | 'other_account' | 'too_soon' | 'server' | 'refused' };

export async function connectExtension(userId: string): Promise<ConnectResult> {
  const before = await findExtension(userId);
  if (!before.found) return { ok: false, reason: 'not_found' };
  // Connected to another account: the extension refuses to be switched from the site, so no
  // session is asked for. The person disconnects in the extension first.
  if (before.authenticated && !before.sameUser) return { ok: false, reason: 'other_account' };
  const { data, error } = await supabase.functions.invoke('extension-session', { body: {} });
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    return { ok: false, reason: status === 429 ? 'too_soon' : 'server' };
  }
  if (!data?.access_token || !data?.refresh_token || !data?.user_id) return { ok: false, reason: 'server' };
  const r = await ask<{ success?: boolean; error?: string }>({ type: 'OLANOVO_CONNECT', session: data }, 15000);
  if (r?.success === true) return { ok: true };
  return { ok: false, reason: r?.error === 'other_account' ? 'other_account' : 'refused' };
}
