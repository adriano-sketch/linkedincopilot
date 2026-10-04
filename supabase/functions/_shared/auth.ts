// Shared authentication helper for LinkedIn Copilot edge functions.
//
// All functions run with verify_jwt=false, so the gateway does NOT check
// tokens. Every function must call `authenticate()` itself.
//
// Accepted callers:
//   - "service": internal calls (pg_cron, other edge functions). The Bearer
//     token (or x-internal-key header) must be the real service-role key.
//     It is accepted if it exactly matches SUPABASE_SERVICE_ROLE_KEY, or if
//     the Auth admin API accepts it (covers a legacy JWT key vs sb_secret_
//     key mismatch). Verified tokens are cached per isolate.
//   - "user": a logged-in user. The JWT is verified with auth.getUser().
//     Callers must use `auth.userId` and IGNORE any user_id in the body.
//
// NEVER decode a JWT without verifying its signature.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-key, x-extension-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export type AuthResult =
  | { kind: "service" }
  | { kind: "user"; userId: string; email: string | null };

const verifiedServiceTokens = new Set<string>();

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function getBearer(req: Request): string {
  const h = req.headers.get("authorization") || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

export async function isServiceToken(token: string): Promise<boolean> {
  if (!token) return false;
  const envKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (safeEqual(token, envKey)) return true;
  if (verifiedServiceTokens.has(token)) return true;
  // Only service-role keys can list auth users.
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=1`, {
      headers: { Authorization: `Bearer ${token}`, apikey: token },
    });
    await res.body?.cancel();
    if (res.ok) {
      verifiedServiceTokens.add(token);
      return true;
    }
  } catch (_) { /* fall through */ }
  return false;
}

export async function authenticate(
  req: Request,
  opts: { allowService?: boolean; allowUser?: boolean } = { allowService: true, allowUser: true },
): Promise<AuthResult | null> {
  const token = getBearer(req);
  const internalKey = req.headers.get("x-internal-key") || "";

  if (opts.allowService !== false) {
    if (internalKey && (await isServiceToken(internalKey))) return { kind: "service" };
    if (token && (await isServiceToken(token))) return { kind: "service" };
  }

  if (opts.allowUser !== false && token) {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.auth.getUser(token);
    if (!error && data?.user) return { kind: "user", userId: data.user.id, email: data.user.email ?? null };
  }
  return null;
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

/** Resolve the effective user id: service callers may pass user_id, users always act as themselves. */
export function effectiveUserId(auth: AuthResult, bodyUserId: unknown): string | null {
  if (auth.kind === "user") return auth.userId;
  return typeof bodyUserId === "string" && bodyUserId ? bodyUserId : null;
}
