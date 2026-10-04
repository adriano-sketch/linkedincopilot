// Signed OAuth "state" for the Gmail connect flow (gmail-auth-url / gmail-callback).
//
// state = base64url(`${userId}.${nonce}.${exp}.${sig}`)
//   nonce = crypto.randomUUID()
//   exp   = unix ms, now + 10 min
//   sig   = base64url(HMAC-SHA256(SUPABASE_SERVICE_ROLE_KEY, `${userId}.${nonce}.${exp}`))
//
// Stateless: nothing is stored server-side. It binds the OAuth callback to the
// user who started the flow and expires after 10 minutes.

const STATE_TTL_MS = 10 * 60 * 1000;
const enc = new TextEncoder();

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlEncodeString(s: string): string {
  return b64urlEncodeBytes(enc.encode(s));
}

function b64urlDecodeString(s: string): string | null {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/");
    const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmac(message: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64urlEncodeBytes(new Uint8Array(sig));
}

export async function createOAuthState(userId: string): Promise<{ state: string; nonce: string; exp: number }> {
  const nonce = `${crypto.randomUUID()}`;
  const exp = Date.now() + STATE_TTL_MS;
  const sig = await hmac(`${userId}.${nonce}.${exp}`);
  return { state: b64urlEncodeString(`${userId}.${nonce}.${exp}.${sig}`), nonce, exp };
}

export type StateCheck = { ok: true; nonce: string } | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "user_mismatch" };

export async function verifyOAuthState(state: unknown, expectedUserId: string): Promise<StateCheck> {
  if (typeof state !== "string" || !state || state.length > 1024) return { ok: false, reason: "malformed" };
  const decoded = b64urlDecodeString(state);
  if (!decoded) return { ok: false, reason: "malformed" };
  const parts = decoded.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [userId, nonce, expStr, sig] = parts;
  if (!userId || !nonce || !/^\d+$/.test(expStr) || !sig) return { ok: false, reason: "malformed" };

  const expected = await hmac(`${userId}.${nonce}.${expStr}`);
  if (!safeEqual(sig, expected)) return { ok: false, reason: "bad_signature" };
  if (Date.now() > Number(expStr)) return { ok: false, reason: "expired" };
  if (!safeEqual(userId, expectedUserId)) return { ok: false, reason: "user_mismatch" };
  return { ok: true, nonce };
}
