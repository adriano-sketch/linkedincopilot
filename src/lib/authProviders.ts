import { useEffect, useState } from 'react';

// Which sign-in providers are switched on is public information of the sign-in service. The page
// reads it, so a "Continue with Google" button appears on the day the provider is switched on and
// never before (a button for a provider that is off only leads to an error page).

const URL_ = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
const KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').replace(/\s+/g, '');

let cached: Promise<boolean> | null = null;

function googleSwitchedOn(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      if (!URL_ || !KEY) return false;
      try {
        const res = await fetch(`${URL_}/auth/v1/settings`, { headers: { apikey: KEY } });
        if (!res.ok) return false;
        const body = await res.json();
        return body?.external?.google === true;
      } catch {
        return false;
      }
    })();
  }
  return cached;
}

/** True once the sign-in service says Google sign-in is switched on. False while unknown. */
export function useGoogleSignIn(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    void googleSwitchedOn().then(v => { if (alive) setOn(v); });
    return () => { alive = false; };
  }, []);
  return on;
}
