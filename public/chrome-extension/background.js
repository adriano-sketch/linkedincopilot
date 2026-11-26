// ═══════════════════════════════════════════════════
// Olanovo — Background Service Worker
// Single-file bundle (no ES module imports)
// ═══════════════════════════════════════════════════

console.log('[LC] Background service worker started');

// "Rede" module: ICP prospecting + post monitoring (see network.js)
importScripts('network.js');

// ── CONFIG ──
const CONFIG = {
  SUPABASE_URL: 'https://gdwpkojugtggozyofpmw.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_oOmeQt5Z6pGRRsDjgcFO2Q_Bn3w-nYi',
  DEBUG: true,
  QUEUE_POLL_INTERVAL_MS: 30000,
  HEARTBEAT_INTERVAL_MS: 60000,
  MIN_ACTION_DELAY_MS: 15000,
  MAX_ACTION_DELAY_MS: 45000,
  PAGE_LOAD_WAIT_MS: 3000,
  MIN_CHAR_DELAY_MS: 30,
  MAX_CHAR_DELAY_MS: 80,
};

// ── STORAGE HELPERS ──
function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['auth'], (result) => {
      resolve(result.auth || null);
    });
  });
}

// The extension was signed out without the person asking (the session was ended elsewhere, or could
// not be renewed). Until they connect again nothing runs, so it is said where they will see it: a mark
// on the toolbar icon and a line in the popup. A deliberate sign-out leaves no mark.
function markSessionLost() {
  try {
    const quiet = () => {};
    chrome.storage.local.set({ session_lost_at: Date.now() }).catch(quiet);
    chrome.action.setBadgeBackgroundColor({ color: '#B4232A' }).catch(quiet);
    chrome.action.setBadgeText({ text: '!' }).catch(quiet);
    chrome.action.setTitle({ title: 'Olanovo is signed out. Click to connect again.' }).catch(quiet);
  } catch (e) { console.warn('[LC:Auth] Could not show the signed-out mark:', e && e.message); }
}
// The mark on the icon does not survive a browser restart; the note in storage does.
try {
  chrome.storage.local.get('session_lost_at', (v) => {
    if (!chrome.runtime.lastError && v && v.session_lost_at) {
      const quiet = () => {};
      chrome.action.setBadgeBackgroundColor({ color: '#B4232A' }).catch(quiet);
      chrome.action.setBadgeText({ text: '!' }).catch(quiet);
      chrome.action.setTitle({ title: 'Olanovo is signed out. Click to connect again.' }).catch(quiet);
    }
  });
} catch (e) { /* storage not ready: the popup still shows the note */ }
function clearSessionLost() {
  try {
    const quiet = () => {};
    chrome.storage.local.remove('session_lost_at').catch(quiet);
    chrome.action.setBadgeText({ text: '' }).catch(quiet);
    chrome.action.setTitle({ title: 'Olanovo' }).catch(quiet);
  } catch (e) { /* nothing to clear */ }
}

// Changes to the stored session run one at a time. A sign-in, a renewal and a sign-out each read
// the stored session and then write it; interleaved, the renewal of one account could land on top
// of a sign-in to another.
let sessionQueue = Promise.resolve();
function withSessionLock(fn) {
  const run = sessionQueue.then(fn);
  sessionQueue = run.catch(() => {});
  return run;
}

// Rejects when the browser could not write: a session that was not stored is gone the next time the
// worker restarts, so callers must not treat it as signed in.
function setAuthToken(auth) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set({ auth }, () => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message || 'Could not store the session'));
      else resolve();
    });
  });
}

function clearAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(['auth'], resolve);
  });
}

function getLocalData(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      resolve(result[key] || null);
    });
  });
}

function setLocalData(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

function normalizeLinkedInUrl(rawUrl) {
  if (!rawUrl) return null;
  let url = String(rawUrl).trim();
  if (!url) return null;
  url = url.replace(/^<|>$/g, '');
  if (url.startsWith('www.')) url = `https://${url}`;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.toLowerCase().includes('linkedin.com')) return null;
    if (!parsed.hostname.toLowerCase().startsWith('www.')) {
      parsed.hostname = `www.${parsed.hostname}`;
    }
    parsed.hash = '';
    parsed.search = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

// ── SUPABASE CLIENT ──
const supabase = {
  url: CONFIG.SUPABASE_URL,
  anonKey: CONFIG.SUPABASE_ANON_KEY,
  accessToken: null,
  userId: null,
  // Set by refreshSession: true only when the server said no to this session (it was ended, or the
  // token is not accepted). A failure of any other kind (no network, a server error, too many
  // requests) leaves it false: the session is kept and the renewal is tried again later. Signing
  // the person out for a hiccup on the server stops their lists for no reason.
  refreshRefused: false,

  async init() {
    const stored = await getAuthToken();
    if (stored) {
      this.accessToken = stored.access_token;
      this.userId = stored.user_id;
      
      // Check if token is expired or about to expire (within 5 min)
      if (stored.expires_at && Date.now() >= stored.expires_at - 300000) {
        console.log('[LC:Auth] Token expired or expiring soon, refreshing...');
        const refreshed = await this.refreshSession();
        if (refreshed) return true;
      }
      
      const valid = await this.verifyToken();
      if (valid) return true;
      
      // Token invalid — try refresh before giving up
      console.log('[LC:Auth] Token invalid, attempting refresh...');
      const refreshed = await this.refreshSession();
      if (refreshed) {
        console.log('[LC:Auth] Session recovered via refresh token');
        return true;
      }
      
      if (!this.refreshRefused) {
        console.warn('[LC:Auth] Could not renew the session right now; keeping it and trying again later');
        return false;
      }
      console.warn('[LC:Auth] All recovery attempts failed, clearing auth');
      await this.clearAuth(stored);
      return false;
    }
    return false;
  },

  async signIn(email, password) {
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.anonKey
      },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error_description || error.msg || 'Login failed');
    }
    const data = await res.json();
    await withSessionLock(async () => {
      await setAuthToken({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user_id: data.user.id,
        expires_at: Date.now() + (data.expires_in * 1000)
      });
      this.publish(data.access_token, data.user.id);
    });
    return data;
  },

  // Makes a stored session the one in use. Whether this account is paused is not known until its own
  // heartbeat answers, so the queue waits for that answer (it does not run on what the previous
  // account's heartbeat said).
  publish(accessToken, userId) {
    clearSessionLost();
    const changed = this.userId !== userId;
    this.accessToken = accessToken;
    this.userId = userId;
    if (changed) queueProcessor.pauseSynced = false;
  },

  // A session handed over by the Olanovo site for the person signed in there (no password typed in
  // the extension). It is only kept if the server confirms that the token is valid and belongs to
  // the account it claims to be for.
  async signInWithSession(session) {
    const { access_token, refresh_token, expires_in, user_id } = session || {};
    if (typeof access_token !== 'string' || typeof refresh_token !== 'string' || typeof user_id !== 'string'
      || !access_token || !refresh_token || !user_id) {
      throw new Error('Incomplete session');
    }
    const res = await fetch(`${this.url}/auth/v1/user`, {
      headers: { 'apikey': this.anonKey, 'Authorization': `Bearer ${access_token}` }
    });
    if (!res.ok) throw new Error('Session not accepted');
    const user = await res.json();
    if (!user || user.id !== user_id) throw new Error('Session is for another account');
    // Already connected to a different account: the site cannot switch it. A script on the site
    // must never be able to point this browser's LinkedIn at someone else's Olanovo account, and
    // a switch in the middle of an action would leave that action unreported. The person
    // disconnects in the popup first.
    await withSessionLock(async () => {
      const current = await getAuthToken();
      if (current?.user_id && current.user_id !== user.id) throw new Error('other_account');
      const seconds = Number(expires_in);
      await setAuthToken({
        access_token,
        refresh_token,
        user_id: user.id,
        expires_at: Date.now() + ((Number.isFinite(seconds) && seconds > 0 ? seconds : 3600) * 1000)
      });
      this.publish(access_token, user.id);
    });
    return { user };
  },

  async verifyToken() {
    try {
      const res = await fetch(`${this.url}/auth/v1/user`, {
        headers: this.getHeaders()
      });
      if (res.status === 401) return false;
      return res.ok;
    } catch {
      // Network error — don't treat as auth failure
      console.warn('[LC:Auth] Network error during verify, assuming still valid');
      return true;
    }
  },

  async refreshSession() {
    this.refreshRefused = false;
    const stored = await getAuthToken();
    if (!stored?.refresh_token) {
      // A stored session that cannot be renewed at all will never work again: that is a refusal.
      this.refreshRefused = !!stored;
      return false;
    }
    let res;
    try {
      res = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': this.anonKey
        },
        body: JSON.stringify({ refresh_token: stored.refresh_token })
      });
    } catch (e) {
      console.warn('[LC:Auth] Could not reach the server to renew the session:', e && e.message);
      return false;
    }
    // The stored session may have been replaced while this request was on its way (a new sign-in):
    // then this answer, good or bad, belongs to the old one. It is dropped: not written over the new
    // session, and a failure is not taken as the new session having failed.
    // The check and the write below hold the session lock, so no sign-in can slip between them.
    const data = res.ok ? await res.json().catch(() => null) : null;
    // A "no" counts as a refusal of this session only when the answer says so. A 401 or 403 can also
    // come from in front of the sign-in service (a key being rotated, a filter) and says nothing
    // about the session: taking it as a refusal would sign everyone out at once.
    let refused = false;
    if (!res.ok && (res.status === 400 || res.status === 401 || res.status === 403)) {
      const why = await res.json().catch(() => null);
      const code = String((why && (why.error_code || why.error)) || '');
      const said = String((why && (why.msg || why.error_description || why.message)) || '');
      refused = /^(invalid_grant|refresh_token_not_found|refresh_token_already_used|session_not_found|session_expired|user_banned|user_not_found)$/i.test(code)
        || /refresh token|session|banned/i.test(said);
    }
    return withSessionLock(async () => {
    const now = await getAuthToken();
    if (!now || now.refresh_token !== stored.refresh_token || now.user_id !== stored.user_id) return !!now;
    if (!res.ok || !data) {
      this.refreshRefused = refused;
      return false;
    }
    // The renewed token must be for the account this session is stored under (the answer names the
    // account; if it ever does not, the check is skipped, not failed). Tokens that say otherwise are
    // not kept: the stored identity and the credentials would no longer match.
    if (!data.access_token || !data.refresh_token) {
      console.error('[LC:Auth] Renewed session is incomplete; not kept');
      this.refreshRefused = true;
      return false;
    }
    if (data.user?.id && data.user.id !== stored.user_id) {
      console.error('[LC:Auth] Renewed session is not for the stored account; not kept');
      this.refreshRefused = true;
      return false;
    }
    try {
      await setAuthToken({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user_id: stored.user_id,
        expires_at: Date.now() + (data.expires_in * 1000)
      });
    } catch (e) {
      console.error('[LC:Auth] Could not store the renewed session:', e.message);
      return false;
    }
    // Only for the account in use (nothing in use yet at start-up: then the stored one is it).
    if (!this.userId || this.userId === stored.user_id) this.accessToken = data.access_token;
    return true;
    });
  },

  // With `expected` (the session whose renewal failed), the stored session is cleared only if it is
  // still that one: a sign-in that landed in the meantime is kept.
  async clearAuth(expected) {
    await withSessionLock(async () => {
      const now = expected ? await getAuthToken() : null;
      if (expected && now && (now.refresh_token !== expected.refresh_token || now.user_id !== expected.user_id)) return;
      this.accessToken = null;
      this.userId = null;
      await clearAuthToken();
      // With `expected` this is not the person signing out: the session stopped being accepted.
      // Only if that session was still there: when the person signed out a moment before, there is
      // nothing to warn about.
      if (expected && now) markSessionLost();
    });
  },

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.anonKey,
      'Authorization': `Bearer ${this.accessToken}`
    };
  },

  async query(table, { method = 'GET', filters = '', body = null, select = '*', limit = null, order = null } = {}) {
    let url = `${this.url}/rest/v1/${table}?select=${select}`;
    if (filters) url += `&${filters}`;
    if (limit) url += `&limit=${limit}`;
    if (order) url += `&order=${order}`;
    const headers = { ...this.getHeaders() };
    if (method === 'POST') headers['Prefer'] = 'return=representation';
    if (method === 'PATCH') headers['Prefer'] = 'return=representation';
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetchWithRetry(url, options, 2);
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || `Query failed: ${res.status}`);
    }
    if (method === 'DELETE') return { data: null };
    const data = await res.json();
    return { data };
  },

  async select(table, filters = '', options = {}) {
    return this.query(table, { method: 'GET', filters, ...options });
  },

  async insert(table, body) {
    return this.query(table, { method: 'POST', body });
  },

  async update(table, body, filters) {
    // The action this copy holds can only change status with proof of the claim (see the trigger
    // action_queue_guard_claim): the proof is added here so every write site carries it.
    if (table === 'action_queue' && body && 'status' in body && body.status !== 'in_progress') {
      // Claims are kept per action id, so a proof can never be attached to a different action.
      const m = String(filters || '').match(/(?:^|&)id=eq\.([0-9a-f-]{36})(?:&|$)/i);
      if (m) {
        const claims = this.claims || (this.claims = (await getLocalData('action_claims')) || {});
        const claim = claims[m[1]];
        if (claim && claim.claimId) body = { ...body, released_claim_id: claim.claimId };
      }
    }
    return this.query(table, { method: 'PATCH', body, filters });
  }
};

// Message actions are never executed (retired in 0.6.7). Kept as a guard in case the server still holds one.
const RETIRED_ACTIONS = ['send_dm', 'send_followup', 'check_reply_status'];

// ── SAFETY MANAGER ──
const LIMITS = {
  connection_requests: 40,
  messages: 100,
  profile_visits: 100,
  
  post_likes: 30,
  total_actions: 200,
  active_hours_start: 8,
  active_hours_end: 18,
  active_days: [1, 2, 3, 4, 5, 6, 7], // 1=Mon..7=Sun — LinkedIn ≠ email, 7 dias por default
  timezone: 'America/New_York',
  warmup_days: 0,
  warmup_multiplier: 1,
  min_delay_ms: 15000,
  max_delay_ms: 90000,
  connection_request_extra_delay_ms: 5000,
};

const safetyManager = {
  getNowInTimezone() {
    const tz = LIMITS.timezone || 'America/New_York';
    const nowStr = new Date().toLocaleString('en-US', { timeZone: tz });
    return new Date(nowStr);
  },

  isWithinActiveHours() {
    const now = this.getNowInTimezone();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;
    const startParts = String(LIMITS.active_hours_start).includes(':')
      ? String(LIMITS.active_hours_start).split(':').map(Number)
      : [LIMITS.active_hours_start, 0];
    const endParts = String(LIMITS.active_hours_end).includes(':')
      ? String(LIMITS.active_hours_end).split(':').map(Number)
      : [LIMITS.active_hours_end, 0];
    const startMinutes = startParts[0] * 60 + startParts[1];
    const endMinutes = endParts[0] * 60 + endParts[1];
    const day = now.getDay();
    const adjustedDay = day === 0 ? 7 : day;
    return LIMITS.active_days.includes(adjustedDay)
      && currentTime >= startMinutes
      && currentTime < endMinutes;
  },

  getNextActiveWindow() {
    const now = this.getNowInTimezone();
    const next = new Date(now);
    const startParts = String(LIMITS.active_hours_start).includes(':')
      ? String(LIMITS.active_hours_start).split(':').map(Number)
      : [LIMITS.active_hours_start, 0];
    next.setHours(startParts[0], startParts[1], 0, 0);
    if (next <= now || !this.isBusinessDay(next)) {
      do {
        next.setDate(next.getDate() + 1);
        next.setHours(startParts[0], startParts[1], 0, 0);
      } while (!this.isBusinessDay(next));
    }
    return next;
  },

  isBusinessDay(date) {
    const day = date.getDay();
    const adjustedDay = day === 0 ? 7 : day;
    return LIMITS.active_days.includes(adjustedDay);
  },

  async canExecute(actionType) {
    // Messages were retired in 0.6.7: the extension refuses them even if one is still in the queue.
    if (RETIRED_ACTIONS.includes(actionType)) return { allowed: false, reason: 'retired_action' };
    // Only invitations are restricted to business hours
    if (actionType === 'send_connection_request' && !this.isWithinActiveHours()) {
      return { allowed: false, reason: 'outside_business_hours', retryAt: this.getNextActiveWindow() };
    }
    const counters = await this.getDailyCounters();
    const firstUseDate = await getLocalData('first_use_date');
    let limitMultiplier = 1;
    if (firstUseDate) {
      const daysSinceFirst = Math.floor((Date.now() - new Date(firstUseDate).getTime()) / (24 * 60 * 60 * 1000));
      if (daysSinceFirst < LIMITS.warmup_days) {
        limitMultiplier = LIMITS.warmup_multiplier;
      }
    } else {
      await setLocalData('first_use_date', new Date().toISOString());
      limitMultiplier = LIMITS.warmup_multiplier;
    }
    const effectiveLimit = (limit) => Math.floor(limit * limitMultiplier);
    switch (actionType) {
      case 'send_connection_request':
        if (counters.connections >= effectiveLimit(LIMITS.connection_requests)) {
          return { allowed: false, reason: 'daily_limit_connections' };
        }
        break;
      case 'visit_profile':
      case 'follow_profile': {
        const warmingCount = (counters.visits || 0) + (counters.follows || 0);
        if (warmingCount >= effectiveLimit(LIMITS.profile_visits)) {
          return { allowed: false, reason: 'daily_limit_visits' };
        }
        break;
      }
      case 'like_post':
        if (counters.likes >= effectiveLimit(LIMITS.post_likes)) {
          return { allowed: false, reason: 'daily_limit_likes' };
        }
        break;
    }
    if (counters.total >= effectiveLimit(LIMITS.total_actions)) {
      return { allowed: false, reason: 'daily_limit_total' };
    }
    const lastActionTime = await getLocalData('last_action_time');
    if (lastActionTime) {
      const elapsed = Date.now() - lastActionTime;
      if (elapsed < LIMITS.min_delay_ms) {
        return { allowed: false, reason: 'too_fast', waitMs: LIMITS.min_delay_ms - elapsed };
      }
    }
    return { allowed: true };
  },

  getRandomDelay(actionType) {
    let base = LIMITS.min_delay_ms + Math.random() * (LIMITS.max_delay_ms - LIMITS.min_delay_ms);
    if (actionType === 'send_connection_request') base += LIMITS.connection_request_extra_delay_ms;
    const jitter = base * 0.2;
    base += (Math.random() * jitter * 2) - jitter;
    return Math.floor(base);
  },

  async getDailyCounters() {
    const counters = await getLocalData('daily_counters');
    const today = new Date().toDateString();

    // If local counters exist and are from today, use them —
    // BUT periodically re-check the DB in case the counter was manually
    // reset server-side (e.g. to recover from an inflated counter bug).
    if (counters && counters.date === today) {
      const lastDbCheck = await getLocalData('last_counter_db_check') || 0;
      const sinceLastCheck = Date.now() - lastDbCheck;
      // Re-check DB every 2 minutes to pick up server-side resets
      if (sinceLastCheck > 120_000) {
        await setLocalData('last_counter_db_check', Date.now());
        const hydrated = await this.hydrateFromDb();
        if (hydrated && hydrated.total < counters.total) {
          console.log(`[LC:Safety] DB counter (${hydrated.total}) < local (${counters.total}) — accepting DB reset`);
          await setLocalData('daily_counters', hydrated);
          return hydrated;
        }
      }
      return counters;
    }

    // Local counters missing or stale — try to hydrate from DB
    const hydrated = await this.hydrateFromDb();
    if (hydrated) return hydrated;

    // Fallback to fresh counters
    const fresh = this.freshCounters();
    await setLocalData('daily_counters', fresh);
    return fresh;
  },

  // Hydrate local counters from extension_status table (survives extension updates)
  async hydrateFromDb() {
    if (!supabase.userId) return null;
    try {
      const { data } = await supabase.select(
        'extension_status',
        `user_id=eq.${supabase.userId}`,
        { limit: 1 }
      );
      if (!data || data.length === 0) return null;

      const row = data[0];
      const today = new Date().toDateString();

      // Check if the DB data is from today by comparing last_limit_reset_at
      const lastReset = row.last_limit_reset_at ? new Date(row.last_limit_reset_at) : null;
      const resetIsToday = lastReset && lastReset.toDateString() === today;

      if (!resetIsToday) {
        // DB counters are from a previous day, start fresh
        const fresh = this.freshCounters();
        await setLocalData('daily_counters', fresh);
        console.log('[LC:Safety] DB counters stale, starting fresh');
        return fresh;
      }

      // Reconstruct local counters from DB values
      const warmingTotal = row.visits_today || 0;
      const connections = row.connection_requests_today || 0;
      const messages = row.messages_today || 0;
      const visits = Math.ceil(warmingTotal / 2); // approximate split
      const follows = warmingTotal - visits;

      const hydrated = {
        date: today,
        total: row.actions_today || 0,
        connections,
        messages,
        visits: Math.max(visits, 0),
        follows: Math.max(follows, 0),
        likes: 0,
      };

      await setLocalData('daily_counters', hydrated);
      console.log('[LC:Safety] Counters hydrated from DB:', JSON.stringify(hydrated));
      return hydrated;
    } catch (e) {
      console.warn('[LC:Safety] Failed to hydrate counters from DB:', e.message);
      return null;
    }
  },

  freshCounters() {
    return { date: new Date().toDateString(), total: 0, connections: 0, messages: 0, visits: 0, follows: 0, likes: 0 };
  },

  async incrementCounter(actionType) {
    const counters = await this.getDailyCounters();
    counters.total++;
    switch (actionType) {
      case 'send_connection_request': counters.connections++; break;
      // Every page of a person's profile counts, including the activity page read for posts.
      case 'visit_profile': case 'find_latest_post': counters.visits++; break;
      case 'follow_profile': counters.follows++; break;
      case 'like_post': counters.likes++; break;
    }
    await setLocalData('daily_counters', counters);
    await setLocalData('last_action_time', Date.now());
    return counters;
  },

  async getStatus() {
    const counters = await this.getDailyCounters();
    const isActive = this.isWithinActiveHours();
    const firstUseDate = await getLocalData('first_use_date');
    let isWarmup = false;
    let warmupDaysLeft = 0;
    if (firstUseDate) {
      const daysSince = Math.floor((Date.now() - new Date(firstUseDate).getTime()) / (24 * 60 * 60 * 1000));
      isWarmup = daysSince < LIMITS.warmup_days;
      warmupDaysLeft = Math.max(0, LIMITS.warmup_days - daysSince);
    }
    const multiplier = isWarmup ? LIMITS.warmup_multiplier : 1;
    return {
      isActive,
      isWarmup,
      warmupDaysLeft,
      counters,
      limits: {
        connections: Math.floor(LIMITS.connection_requests * multiplier),
        messages: Math.floor(LIMITS.messages * multiplier),
        visits: Math.floor(LIMITS.profile_visits * multiplier),
        total: Math.floor(LIMITS.total_actions * multiplier),
      },
      nextActiveWindow: isActive ? null : this.getNextActiveWindow(),
    };
  }
};

// ── RETRY HELPER ──
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      // Retry on 5xx or Cloudflare errors (520-529)
      if (res.status >= 500 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
        console.warn(`[LC:Retry] Got ${res.status}, retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (error) {
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt) + Math.random() * 1000, 15000);
        console.warn(`[LC:Retry] Network error, retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries}):`, error.message);
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw error;
      }
    }
  }
}

// ── HEARTBEAT ──
async function sendHeartbeat() {
  if (!supabase.userId) return;
  // Whose heartbeat this is. If the account changes while it is on its way, its answer (schedule,
  // limits, paused or not) is about the other account and is not applied.
  const forUser = supabase.userId;
  try {
    let counters = await getLocalData('daily_counters');
    const today = new Date().toDateString();

    if (!counters || typeof counters !== 'object') {
      counters = safetyManager.freshCounters();
    }

    if (counters.date !== today) {
      counters = safetyManager.freshCounters();
    } else {
      // Normalize legacy counter payloads that may miss newer keys (e.g. follows)
      counters = { ...safetyManager.freshCounters(), ...counters, date: today };
    }

    await setLocalData('daily_counters', counters);

    const linkedinTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
    const linkedinLoggedIn = linkedinTabs.length > 0;
    const warmingCount = (counters.visits || 0) + (counters.follows || 0);
    const payload = {
      is_connected: true,
      last_heartbeat_at: new Date().toISOString(),
      linkedin_logged_in: linkedinLoggedIn,
      actions_today: counters.total || 0,
      connection_requests_today: counters.connections || 0,
      messages_today: counters.messages || 0,
      visits_today: warmingCount,
    };

    // Try PATCH first (update existing record)
    const patchRes = await fetchWithRetry(
      `${supabase.url}/rest/v1/extension_status?user_id=eq.${supabase.userId}`,
      {
        method: 'PATCH',
        headers: {
          ...supabase.getHeaders(),
          'Prefer': 'return=representation'
        },
        body: JSON.stringify(payload)
      }
    );

    if (patchRes.status === 401) {
      console.warn('[LC:Auth] Heartbeat got 401, attempting session refresh...');
      const heldBefore = await getAuthToken();
      const refreshed = await supabase.refreshSession();
      if (!refreshed) {
        console.error('[LC:Auth] Session refresh failed during heartbeat');
        // Refused for good: say so now (the mark on the icon), not at the next scheduled renewal.
        if (supabase.refreshRefused && heldBefore) await supabase.clearAuth(heldBefore);
      } else {
        console.log('[LC:Auth] Session refreshed after heartbeat 401, will retry next cycle');
      }
      return;
    }

    let data = [];
    if (patchRes.ok) {
      data = await patchRes.json();
    }

    // If PATCH returned empty array, record doesn't exist — INSERT
    if (!data || data.length === 0) {
      console.log('[Heartbeat] No existing record, inserting...');
      const insertRes = await fetchWithRetry(
        `${supabase.url}/rest/v1/extension_status`,
        {
          method: 'POST',
          headers: {
            ...supabase.getHeaders(),
            'Prefer': 'return=representation'
          },
          body: JSON.stringify({ ...payload, user_id: supabase.userId })
        }
      );
      if (!insertRes.ok) {
        console.error('[Heartbeat] Insert failed:', insertRes.status, await insertRes.text());
        return;
      }
      data = await insertRes.json();
    }

    if (CONFIG.DEBUG) console.log('[Heartbeat] Sent successfully');

    if (supabase.userId !== forUser) return;

    // Sync schedule settings from server
    if (data && data.length > 0) {
      const ext = data[0];
      if (ext.active_days && Array.isArray(ext.active_days)) {
        const DAY_MAP = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
        LIMITS.active_days = ext.active_days.map(d => DAY_MAP[d] || 0).filter(Boolean);
      }
      if (ext.active_hours_start) LIMITS.active_hours_start = ext.active_hours_start;
      if (ext.active_hours_end) LIMITS.active_hours_end = ext.active_hours_end;
      if (ext.timezone) LIMITS.timezone = ext.timezone;
      if (ext.daily_limit_connection_requests) LIMITS.connection_requests = ext.daily_limit_connection_requests;
      if (ext.daily_limit_messages) LIMITS.messages = ext.daily_limit_messages;
      if (ext.daily_limit_visits) LIMITS.profile_visits = ext.daily_limit_visits;
      if (ext.is_paused !== undefined) queueProcessor.isPaused = ext.is_paused;
      // The server's answer is in: the queue may run (or stay paused) from here on.
      queueProcessor.pauseSynced = true;
      if (CONFIG.DEBUG) console.log('[Heartbeat] Schedule synced:', {
        days: LIMITS.active_days, hours: `${LIMITS.active_hours_start}-${LIMITS.active_hours_end}`, tz: LIMITS.timezone
      });
    }
  } catch (error) {
    console.error('[Heartbeat] Error (all retries exhausted):', error.message);
  }
}

// ── QUEUE PROCESSOR ──
const queueProcessor = {
  isProcessing: false,
  pollRunning: false, // one poll at a time, from its first check to the last status write
  isPaused: false,
  // False until the first heartbeat of this service-worker life has read is_paused from the
  // server. Chrome restarts the worker often and isPaused starts as false every time: on
  // 2026-11-10 two actions ran (13:27 and 14:40) while the account was paused on the server,
  // in the gap between a restart and the next heartbeat.
  pauseSynced: false,

  async poll() {
    if (!supabase.accessToken || !supabase.userId) return;
    if (!this.pauseSynced) return;
    if (this.isPaused) return;
    if (this.isProcessing || this.pollRunning) return;
    // Taken synchronously, before the first await: a second alarm-triggered poll that starts while
    // this one is still reading storage must not get through and run a second action in parallel.
    this.pollRunning = true;
    try {
      const cooldownUntil = await getLocalData('linkedin_cooldown_until');
      if (cooldownUntil && Date.now() < cooldownUntil) {
        return;
      }
      // ── Coming back after the computer slept or Chrome was closed ──
      // No poll for more than 10 minutes means the machine was away. Do not act the instant it
      // wakes: wait a few minutes first, like someone who has just opened the laptop.
      const lastPollAt = await getLocalData('last_poll_at');
      await setLocalData('last_poll_at', Date.now());
      if (lastPollAt && Date.now() - lastPollAt > 10 * 60 * 1000) {
        await setLocalData('resume_after', Date.now() + (2 + Math.random() * 3) * 60 * 1000);
        await setLocalData('catchup_gap_ms', null);
      }
      const resumeAfter = await getLocalData('resume_after');
      if (resumeAfter && Date.now() < resumeAfter) return;
      const now = new Date().toISOString();
      
      // Build exclusion list for action types that hit daily limits
      const counters = await safetyManager.getDailyCounters();
      // Retired action types are never claimed.
      const excludeTypes = [...RETIRED_ACTIONS];
      if (counters.connections >= LIMITS.connection_requests) excludeTypes.push('send_connection_request');
      const warmingCount = (counters.visits || 0) + (counters.follows || 0); // visit + follow share the same daily cap
      if (warmingCount >= LIMITS.profile_visits) { excludeTypes.push('visit_profile'); excludeTypes.push('follow_profile'); }
      if (counters.likes >= LIMITS.post_likes) excludeTypes.push('like_post');
      if (counters.total >= LIMITS.total_actions) return; // all actions blocked
      
      // Only messaging actions need business hours
      if (!safetyManager.isWithinActiveHours()) {
        excludeTypes.push('send_connection_request');
      }
      
      // ── STUCK ACTION GUARD ──
      // If any action has been in_progress for >5 minutes, reset it to pending.
      // This handles cases where the queue processor crashed mid-execution
      // (e.g., service worker restart) and left an action stuck.
      try {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const { data: stuck } = await supabase.select(
          'action_queue',
          `user_id=eq.${supabase.userId}&status=eq.in_progress&picked_up_at=lt.${fiveMinAgo}`,
          { limit: 5 }
        );
        if (stuck && stuck.length > 0) {
          for (const s of stuck) {
            console.warn(`[QueueProcessor] Unsticking action ${s.id} (${s.action_type}) — in_progress since ${s.picked_up_at}`);
            // Only if the row is still the claim we just read: another copy may have reset it and
            // taken it again in the meantime, and that new claim must not be undone.
            const sameClaim = `status=eq.in_progress&picked_up_at=eq.${encodeURIComponent(s.picked_up_at)}`
              + (s.claim_id ? `&claim_id=eq.${encodeURIComponent(s.claim_id)}` : '&claim_id=is.null');
            await supabase.update('action_queue',
              { status: 'pending', picked_up_at: null, error_message: 'auto-reset: stuck in_progress >5min' },
              `id=eq.${s.id}&${sameClaim}`
            );
          }
        }
      } catch (stuckErr) {
        console.warn('[QueueProcessor] Stuck action guard failed:', stuckErr.message);
      }

      let filters = `user_id=eq.${supabase.userId}&status=eq.pending&scheduled_for=lte.${now}`;
      if (excludeTypes.length > 0) {
        const unique = [...new Set(excludeTypes)];
        filters += `&action_type=not.in.(${unique.join(',')})`;
      }
      
      const { data } = await supabase.select(
        'action_queue',
        filters,
        { order: 'priority.asc,scheduled_for.asc', limit: 1 }
      );
      if (!data || data.length === 0) return;
      // ── Backlog pacing ──
      // An action more than 10 minutes late is backlog (the machine was away). Backlog does not run
      // back to back: each late action waits 4 to 8 minutes after the previous action, the same
      // rhythm the server schedules pages at. What does not fit before the queue's own expiry simply does not run.
      const lateMs = Date.now() - new Date(data[0].scheduled_for).getTime();
      if (lateMs > 10 * 60 * 1000) {
        const lastActionAt = Math.max(
          (await getLocalData('last_attempt_at')) || 0,
          (await getLocalData('last_action_time')) || 0,
        );
        let gap = await getLocalData('catchup_gap_ms');
        if (!gap) {
          gap = (4 + Math.random() * 4) * 60 * 1000;
          await setLocalData('catchup_gap_ms', gap);
        }
        if (lastActionAt && Date.now() - lastActionAt < gap) return;
        await setLocalData('catchup_gap_ms', null); // a new random gap for the next late action
      }
      // No action is started on a session about to run out that could not be renewed: the action
      // would be done on LinkedIn and its result refused by the server, then done a second time.
      const held = await getAuthToken();
      if (held?.expires_at && Date.now() >= held.expires_at - 300000) {
        const renewed = await supabase.refreshSession();
        const after = renewed ? await getAuthToken() : null;
        if (!after?.expires_at || Date.now() >= after.expires_at - 300000) {
          console.warn('[QueueProcessor] Session about to expire and not renewed; action left pending');
          return;
        }
      }
      await this.executeAction(data[0]);
    } catch (error) {
      console.error('[QueueProcessor] Poll error:', error);
    } finally {
      this.pollRunning = false;
    }
  },

  async executeAction(action) {
    this.isProcessing = true;
    try {
      // An action picked for the previous account is not touched with the new account's session.
      if (action.user_id && action.user_id !== supabase.userId) return;
      const safetyCheck = await safetyManager.canExecute(action.action_type);
      if (!safetyCheck.allowed) {
        console.log(`[QueueProcessor] Action blocked: ${safetyCheck.reason}`);
        if (safetyCheck.reason === 'too_fast') {
          // Transient — just skip this poll cycle, action stays pending
          return;
        }
        // For time-based blocks (outside_business_hours, daily limits),
        // leave the action as 'pending' so it gets retried in the next window.
        // Only permanently skip for unknown/fatal safety reasons.
        const RETRYABLE_REASONS = [
          'outside_business_hours',
          'daily_limit_connections',
          'daily_limit_messages',
          'daily_limit_visits',
          'daily_limit_follows',
          'daily_limit_likes',
          'daily_limit_total',
        ];
        if (RETRYABLE_REASONS.includes(safetyCheck.reason)) {
          console.log(`[QueueProcessor] Retryable safety block: ${safetyCheck.reason} — leaving action pending`);
          return;
        }
        await supabase.update('action_queue',
          { status: 'skipped', error_message: `Safety: ${safetyCheck.reason}` },
          `id=eq.${action.id}`
        );
        return;
      }
      // Claim the action only while it is still pending. Two copies of the extension on one account
      // (the old folder install next to the store one) both read the same pending row; the status
      // filter lets only one of them take it, and the database refuses a second claim outright.
      // The claim carries a random id: if the request went through but its answer was lost and the
      // retry found nothing to update, reading the row back tells our own claim from another copy's.
      // The account may have changed while this poll was waiting (a sign-in from the site). Nothing
      // is claimed until the new account's own pause state has arrived, nor for another account.
      if (!this.pauseSynced || this.isPaused || (action.user_id && action.user_id !== supabase.userId)) {
        console.log('[QueueProcessor] Account changed or paused before the claim; action left pending');
        return;
      }
      const claimId = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      let claimed = null;
      let claimError = null;
      try {
        ({ data: claimed } = await supabase.update('action_queue',
          { status: 'in_progress', picked_up_at: new Date().toISOString(), claim_id: claimId },
          `id=eq.${action.id}&status=eq.pending`
        ));
      } catch (e) {
        claimError = e;
      }
      if (!Array.isArray(claimed) || claimed.length === 0) {
        let mine = false;
        try {
          const { data: row } = await supabase.select('action_queue',
            `id=eq.${action.id}&status=eq.in_progress&claim_id=eq.${claimId}`, { select: 'id', limit: 1 });
          mine = Array.isArray(row) && row.length > 0;
        } catch (e) {
          console.warn('[QueueProcessor] Could not confirm the claim:', e.message);
        }
        if (!mine) {
          console.log(`[QueueProcessor] Action ${action.id} not claimed (${claimError ? claimError.message : 'taken by another copy'}); skipping`);
          return;
        }
      }
      {
        const claims = supabase.claims || (supabase.claims = (await getLocalData('action_claims')) || {});
        claims[action.id] = { claimId, at: Date.now() };
        // Proofs only matter while an action is fresh; keep a day of them.
        for (const [id, c] of Object.entries(claims)) if (Date.now() - (c.at || 0) > 24 * 60 * 60 * 1000) delete claims[id];
        await setLocalData('action_claims', claims);
      }
      // Every attempt counts for pacing, whatever its outcome: a skipped or failed action still
      // opened a LinkedIn page. (last_action_time is only written when an action succeeds.)
      await setLocalData('last_attempt_at', Date.now());
      const delay = safetyManager.getRandomDelay(action.action_type);
      console.log(`[QueueProcessor] Waiting ${Math.round(delay / 1000)}s before ${action.action_type}...`);
      await this.sleep(delay);

      let result = await this.sendToContentScript(action);

      // Handle custom-invite redirect (new LinkedIn 2026 layout)
      // The content script found a <a href="/preload/custom-invite/..."> link instead of
      // an inline Connect button. Navigate to that URL and re-run the content script
      // directly on the custom-invite page (which shows the connection dialog).
      if (result && result.redirect && result.note === 'custom_invite_redirect') {
        console.log(`[QueueProcessor] Redirecting to custom-invite page: ${result.redirect}`);
        const tab = (await chrome.tabs.query({ url: 'https://www.linkedin.com/*' }))[0];
        if (tab) {
          const redirectUrl = result.redirect.startsWith('http') ? result.redirect : `https://www.linkedin.com${result.redirect}`;
          await chrome.tabs.update(tab.id, { url: redirectUrl });
          await this.waitForTabLoad(tab.id);
          await this.sleep(4000);
          // Inject and execute content script on the custom-invite page
          // Do NOT call sendToContentScript — it would re-navigate to the profile page
          await this.ensureContentScript(tab.id);
          result = await this.sendMessageToTab(tab.id, action);
        }
      }

      if (result && result.skip_report) {
        console.log(`[QueueProcessor] ${action.action_type} skipped: ${result.reason || 'skip_report'}`);
        return;
      }
      await supabase.update('action_queue',
        { status: 'completed', completed_at: new Date().toISOString(), result: result },
        `id=eq.${action.id}`
      );
      await safetyManager.incrementCounter(action.action_type);
      // A like given inside find_latest_post counts toward the daily like limit too.
      if (action.action_type === 'find_latest_post' && result && result.liked === true) {
        await safetyManager.incrementCounter('like_post');
      }
      await this.reportCompletion(action, true, result);
      console.log(`[QueueProcessor] ${action.action_type} completed`);

      // If the action succeeded but LinkedIn showed a limit warning banner,
      // pause the queue proactively to avoid hitting the hard limit
      if (result && result.limitWarning) {
        console.warn(`[QueueProcessor] ⚠️ LinkedIn limit warning detected after successful action: ${result.limitWarning}`);
        console.warn(`[QueueProcessor] Pausing connection requests for 24 hours`);
        const cooldownUntil = Date.now() + (24 * 60 * 60 * 1000);
        await chrome.storage.local.set({
          linkedin_cooldown_until: cooldownUntil,
          linkedin_cooldown_reason: `Limit warning: ${result.limitWarning}`,
          linkedin_cooldown_started: Date.now(),
        });
      }
    } catch (error) {
      console.error(`[QueueProcessor] ${action.action_type} failed:`, error);

      // ── LINKEDIN LIMIT DETECTION ──
      // If the error indicates a LinkedIn rate limit, pause the entire queue
      // instead of retrying (retrying would just hit the limit again)
      const isLinkedInLimit = error.message && (
        error.message.includes('LINKEDIN_LIMIT') ||
        error.message.toLowerCase().includes('invitation limit') ||
        error.message.toLowerCase().includes('weekly invitation') ||
        error.message.toLowerCase().includes('too many') ||
        error.message.toLowerCase().includes('you\'ve reached') ||
        error.message.toLowerCase().includes('temporarily restricted') ||
        (error.message.toLowerCase().includes('limit') && error.message.toLowerCase().includes('connection'))
      );

      if (isLinkedInLimit) {
        console.warn(`[QueueProcessor] ⚠️ LINKEDIN LIMIT DETECTED: ${error.message}`);
        console.warn(`[QueueProcessor] Pausing queue for 24 hours to respect LinkedIn limits`);

        // Set 24-hour cooldown
        const cooldownUntil = Date.now() + (24 * 60 * 60 * 1000);
        await chrome.storage.local.set({
          linkedin_cooldown_until: cooldownUntil,
          linkedin_cooldown_reason: error.message,
          linkedin_cooldown_started: Date.now(),
        });

        // Mark this action as failed with limit reason (no retry)
        try {
          await supabase.update('action_queue',
            { status: 'failed', error_message: `LIMIT_REACHED: ${error.message}` },
            `id=eq.${action.id}`
          );
          await this.reportCompletion(action, false, null, `LIMIT_REACHED: ${error.message}`);
        } catch (reportErr) {
          console.error(`[QueueProcessor] Failed to report limit:`, reportErr.message);
        }

        this.isProcessing = false;
        return; // Exit early — don't retry
      }

      try {
        await supabase.update('action_queue',
          { status: 'failed', error_message: error.message, retry_count: (action.retry_count || 0) + 1 },
          `id=eq.${action.id}`
        );
        await this.reportCompletion(action, false, null, error.message);
      } catch (reportErr) {
        console.error(`[QueueProcessor] Failed to report failure:`, reportErr.message);
      }
    } finally {
      this.isProcessing = false;
    }
  },

  async runProfileQualityCheck(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const debugInfo = { url: window.location.href };

          const bodyText = normalize(document.body?.innerText || '');
          const unavailablePhrases = [
            'profile not found',
            "this profile doesn't exist",
            "this page doesn't exist",
            'profile unavailable',
            'this profile is unavailable',
            'member only',
            'private member',
            'linkedin member',
            'linkedin user',
            'membro do linkedin',
            'miembro de linkedin',
            'membre linkedin',
            'perfil indisponível',
            'perfil no disponible',
            'perfil non disponibile',
            'não encontramos',
            'no encontramos',
            'page not found'
          ];

          if (unavailablePhrases.some(p => bodyText.includes(p))) {
            return { success: true, action: 'check_profile_quality', is_ghost: true, note: 'profile_unavailable', confidence: 'strong', debug: debugInfo };
          }

          const h1 = document.querySelector('main h1') || document.querySelector('main h2');
          const name = normalize(h1?.textContent || '');
          debugInfo.name = name || null;
          if (!name) {
            return { success: true, action: 'check_profile_quality', is_ghost: true, note: 'no_heading', confidence: 'weak', debug: debugInfo };
          }

          const placeholderNames = ['linkedin member', 'linkedin user', 'member only', 'private member', 'membro do linkedin', 'miembro de linkedin', 'membre linkedin'];
          if (placeholderNames.some(p => name.includes(p))) {
            return { success: true, action: 'check_profile_quality', is_ghost: true, note: 'placeholder_name', confidence: 'strong', debug: debugInfo };
          }

          const headings = Array.from(document.querySelectorAll('main h2, main h3'));
          const hasSection = (keywords, minChars) => {
            const heading = headings.find(h => {
              const txt = normalize(h.textContent || '');
              return keywords.some(k => txt.includes(k));
            });
            if (!heading) return false;
            const section = heading.closest('section') || heading.parentElement?.parentElement;
            const text = normalize(section?.innerText || '');
            return text.length >= minChars;
          };

          const headlineEl = document.querySelector('main h2');
          const headline = normalize(headlineEl?.textContent || '');
          const hasHeadline = headline.length >= 4;

          const hasAbout = hasSection(['about', 'sobre', 'acerca', 'à propos', 'informações', 'informacion', 'informazioni'], 40);
          const hasExperience = hasSection(['experience', 'experiência', 'experiencia', 'experienze'], 40);
          const hasEducation = hasSection(['education', 'educação', 'educacion', 'formação', 'formacion', 'istruzione'], 30);
          const hasSkills = hasSection(['skills', 'competências', 'competencias', 'habilidades', 'competenze'], 20);

          const signalCount = [hasHeadline, hasAbout, hasExperience, hasEducation, hasSkills].filter(Boolean).length;
          debugInfo.signalCount = signalCount;

          if (signalCount === 0) {
            return { success: true, action: 'check_profile_quality', is_ghost: true, note: 'no_profile_signals', confidence: 'strong', debug: debugInfo };
          }

          if (signalCount <= 1 && !hasHeadline) {
            return { success: true, action: 'check_profile_quality', is_ghost: true, note: 'minimal_profile_signals', confidence: 'weak', debug: debugInfo };
          }

          return { success: true, action: 'check_profile_quality', is_ghost: false, note: 'ok', confidence: 'strong', debug: debugInfo };
        },
      });
      if (results && results[0] && results[0].result) {
        return results[0].result;
      }
      throw new Error('No result from quality check');
    } catch (err) {
      console.error('[QueueProcessor] Quality check failed:', err.message);
      return null;
    }
  },

  async sendToContentScript(action) {
    if (action.action_type === 'check_profile_quality') {
      const now = new Date().toISOString();
      const result = { action: 'check_profile_quality', skipped: true, note: 'jit_only' };
      try {
        await supabase.update(
          'campaign_leads',
          {
            profile_quality_status: 'ok',
            profile_quality_checked_at: now,
            profile_quality_note: 'csv_precheck',
          },
          `id=eq.${action.campaign_lead_id}`
        );
        await supabase.update(
          'action_queue',
          { status: 'completed', completed_at: now, result },
          `id=eq.${action.id}`
        );
        await supabase.insert('activity_log', {
          user_id: supabase.userId,
          campaign_lead_id: action.campaign_lead_id,
          action: 'check_profile_quality_skipped',
          details: { result },
        });
      } catch (err) {
        console.warn('[QueueProcessor] Failed to skip check_profile_quality:', err.message);
      }
      return { ...result, skip_report: true, reason: 'quality_scan_disabled' };
    }

    let tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
    let tab;
    if (tabs.length > 0) {
      tab = tabs[0];
    } else {
      tab = await chrome.tabs.create({ url: 'https://www.linkedin.com/feed/', active: false });
      await this.waitForTabLoad(tab.id);
      await this.sleep(3000);
    }
    // "Rede" module page actions (search pages, invitations) have their own navigation
    if (NETWORK_ACTION_TYPES.includes(action.action_type)) {
      const networkResult = await runNetworkAction(this, tab, action);
      if (!networkResult || networkResult.success === false) {
        throw new Error((networkResult && networkResult.error) || `${action.action_type} failed`);
      }
      return networkResult;
    }

    // find_latest_post was missing too: the tab stayed wherever the previous action left it
    // (invitation manager, a search page) and the page script answered WRONG_PAGE.
    const actionTypes = ['visit_profile', 'follow_profile', 'send_connection_request', 'find_latest_post', 'like_post', 'check_connection_status'];
    if (actionTypes.includes(action.action_type)) {
      let targetUrl = action.action_data?.linkedin_url || action.linkedin_url;
      if (targetUrl) {
        const rawTargetUrl = String(targetUrl);
        const normalized = normalizeLinkedInUrl(targetUrl);
        if (!normalized) {
          throw new Error(`Invalid LinkedIn URL: ${targetUrl}`);
        }
        targetUrl = normalized;

        if (action.action_type === 'find_latest_post') {
          // Open the person's activity page directly. The page script must not navigate by itself:
          // a page load kills it before it can answer.
          const slug = normalized.match(/\/in\/([^/?#]+)/)?.[1];
          if (!slug) throw new Error(`Invalid profile URL for find_latest_post: ${rawTargetUrl}`);
          targetUrl = `https://www.linkedin.com/in/${slug}/recent-activity/all/`;
          action._expectedName = await this.lookupLeadName(action);
          // Like in the same visit only while the daily like limit allows it.
          action._likeInVisit = action.action_data?.like === true &&
            ((await safetyManager.getDailyCounters()).likes || 0) < LIMITS.post_likes;
        } else if (action.action_type === 'like_post') {
          // The target card is identified by "#lcpost=<fingerprint>"; normalizeLinkedInUrl drops it.
          const fp = rawTargetUrl.match(/#lcpost=[^#\s]+/);
          action._postUrl = fp ? `${normalized}/${fp[0]}` : normalized;
          if (fp) targetUrl = action._postUrl;
        }

        // ── CLEANUP: Dismiss any open composer/overlay to prevent "Leave site?" dialog ──
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              // Clear any text in open message composers to prevent beforeunload
              const composers = document.querySelectorAll(
                'div.msg-form__contenteditable[contenteditable="true"], div[role="textbox"][contenteditable="true"]'
              );
              for (const c of composers) {
                if (c.textContent && c.textContent.trim().length > 0) {
                  c.innerHTML = '';
                  c.dispatchEvent(new Event('input', { bubbles: true }));
                }
              }
              // Close any open message overlays
              const closeButtons = document.querySelectorAll(
                'button[data-control-name="overlay.close_conversation_window"], .msg-overlay-bubble-header button[aria-label*="Close" i]'
              );
              for (const btn of closeButtons) {
                if (btn.offsetParent !== null) btn.click();
              }
              // Disable beforeunload handlers
              window.onbeforeunload = null;
            },
          });
          await this.sleep(500);
        } catch (cleanupErr) {
          console.warn('[QueueProcessor] Pre-navigation cleanup failed (non-fatal):', cleanupErr.message);
        }

        console.log('[QueueProcessor] Navigating to:', targetUrl);
        await chrome.tabs.update(tab.id, { url: targetUrl });
        await this.waitForTabLoad(tab.id);
        await this.sleep(6000);

        // ── POST-NAV GUARD: Verify the tab actually landed on the expected URL ──
        // Cross-contamination root cause: LinkedIn SPA sometimes doesn't complete
        // the navigation, leaving the tab on a /messaging/thread/ page from a
        // previous action. We must verify before injecting the content script.
        const messagingActions = ['send_connection_request', 'visit_profile', 'follow_profile', 'find_latest_post', 'like_post', 'post_comment'];
        if (messagingActions.includes(action.action_type)) {
          const postNavTab = await chrome.tabs.get(tab.id);
          const postNavUrl = postNavTab.url || '';
          console.log('[QueueProcessor] Post-navigation URL:', postNavUrl);

          // LinkedIn sent us to a security checkpoint, a restriction notice or the login page.
          // Stop everything at once: on 2026-11-10 the queue kept opening pages into the
          // "unusual activity" checkpoint six more times after the first redirect.
          if (/linkedin\.com\/(checkpoint|uas\/|authwall|login|m\/login)/i.test(postNavUrl)) {
            await this.pauseForLinkedInWarning(postNavUrl);
            throw new Error(`LINKEDIN_CHECKPOINT: paused everything, LinkedIn redirected to ${postNavUrl.slice(0, 80)}`);
          }

          // For profile-based actions, the URL must contain /in/
          const expectedSlug = targetUrl.match(/\/in\/([^/?]+)/)?.[1];
          const actualSlug = postNavUrl.match(/\/in\/([^/?]+)/)?.[1];

          // LinkedIn often redirects old slugs to new ones (e.g. "lena-ramos-b76669103" → "lena-ramos")
          // and normalizes URL encoding (e.g. %c3%a1 → %C3%A1). We consider it a match if:
          // 1. Exact match (after decoding), OR
          // 2. The actual page is on /in/ (a profile page) — LinkedIn redirected the slug
          //    We trust LinkedIn's redirect as long as we're on a profile page, not messaging.
          const slugsMatch = (a, b) => {
            if (!a || !b) return false;
            try { a = decodeURIComponent(a).toLowerCase(); } catch(e) { a = a.toLowerCase(); }
            try { b = decodeURIComponent(b).toLowerCase(); } catch(e) { b = b.toLowerCase(); }
            if (a === b) return true;
            // Strip trailing hash suffixes that LinkedIn adds/removes (e.g. "-b76669103")
            const baseA = a.replace(/-[a-f0-9]{6,}$/i, '');
            const baseB = b.replace(/-[a-f0-9]{6,}$/i, '');
            if (baseA === baseB) return true;
            // Check if one starts with the other (handles "sara-reyes" matching "sarag-reyes" less well,
            // but the critical check is: are we on /in/ at all vs /messaging/)
            return false;
          };

          const isOnProfilePage = actualSlug != null; // URL contains /in/something
          const exactMatch = slugsMatch(expectedSlug, actualSlug);

          if (expectedSlug && !isOnProfilePage) {
            // Not on a profile page at all — definitely wrong
            console.warn(`[QueueProcessor] NOT ON PROFILE PAGE after navigation! Expected /in/${expectedSlug} but got: ${postNavUrl}`);
            console.log('[QueueProcessor] Retrying navigation...');
            await chrome.tabs.update(tab.id, { url: targetUrl });
            await this.waitForTabLoad(tab.id);
            await this.sleep(8000);

            const retryTab = await chrome.tabs.get(tab.id);
            const retryUrl = retryTab.url || '';
            const retrySlug = retryUrl.match(/\/in\/([^/?]+)/)?.[1];
            console.log('[QueueProcessor] Post-retry URL:', retryUrl);

            if (!retrySlug) {
              throw new Error(`NAVIGATION_FAILED: Expected /in/${expectedSlug} but landed on ${retryUrl} after 2 attempts. Aborting to prevent cross-contamination.`);
            }
            // After retry, if we're on /in/ we trust LinkedIn's redirect
            console.log(`[QueueProcessor] After retry: on profile /in/${retrySlug} (expected ${expectedSlug}) — accepting LinkedIn redirect`);
          } else if (expectedSlug && isOnProfilePage && !exactMatch) {
            // On a profile page but slug differs — LinkedIn redirected. Log but allow.
            console.log(`[QueueProcessor] Slug redirect detected: expected /in/${expectedSlug}, got /in/${actualSlug} — trusting LinkedIn redirect`);
          }

          // Extra guard: reject if we're on a messaging page (should never happen for profile actions)
          if (postNavUrl.includes('/messaging/thread/') || postNavUrl.includes('/messaging/compose/')) {
            console.warn(`[QueueProcessor] CRITICAL: Tab is on messaging page after profile navigation! URL: ${postNavUrl}`);
            // Force navigate to profile
            await chrome.tabs.update(tab.id, { url: targetUrl });
            await this.waitForTabLoad(tab.id);
            await this.sleep(8000);
            const forceTab = await chrome.tabs.get(tab.id);
            if ((forceTab.url || '').includes('/messaging/')) {
              throw new Error(`STUCK_ON_MESSAGING: Tab stuck on ${forceTab.url} despite navigation to ${targetUrl}. Aborting.`);
            }
          }
        }
      }
    }

    const ghostGuardActions = ['visit_profile', 'send_connection_request'];
    if (ghostGuardActions.includes(action.action_type)) {
      const quality = await this.runProfileQualityCheck(tab.id);
      if (quality?.is_ghost && quality?.confidence === 'strong') {
        const now = new Date().toISOString();
        const ghostResult = { ...quality, action: 'check_profile_quality', jit: true };
        if (isNetworkAction(action)) {
          // Network prospects are not campaign leads: report it as a failed invite instead
          await supabase.update('action_queue',
            { status: 'failed', completed_at: now, result: ghostResult, error_message: 'GHOST_PROFILE' },
            `id=eq.${action.id}`
          );
          await this.reportCompletion(action, false, ghostResult, 'GHOST_PROFILE: profile unavailable or empty');
          return { ...ghostResult, skip_report: true, reason: 'ghost_profile' };
        }
        try {
          await supabase.update(
            'campaign_leads',
            {
              profile_quality_status: 'ghost',
              profile_quality_checked_at: now,
              profile_quality_note: quality.note || 'ghost_profile',
              status: 'skipped',
              profile_enriched_at: now,
              error_message: 'Ghost profile (LinkedIn)',
            },
            `id=eq.${action.campaign_lead_id}`
          );
          await supabase.update(
            'action_queue',
            { status: 'completed', completed_at: now, result: ghostResult },
            `id=eq.${action.id}`
          );
          await supabase.insert('activity_log', {
            user_id: supabase.userId,
            campaign_lead_id: action.campaign_lead_id,
            action: 'check_profile_quality_completed',
            details: { result: ghostResult },
          });
        } catch (err) {
          console.warn('[QueueProcessor] Failed to persist ghost result:', err.message);
        }
        return { ...ghostResult, skip_report: true, reason: 'ghost_profile' };
      }
    }

    // For lightweight checks, use direct script execution (bypasses content script messaging)
    if (action.action_type === 'check_connection_status') {
      console.log('[QueueProcessor] Using direct execution for check_connection_status');
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
            const debugInfo = { url: window.location.href, buttonsFound: 0 };

            const profileNameEl = document.querySelector('main h1') || document.querySelector('main h2');
            debugInfo.profileName = normalize(profileNameEl?.textContent || '') || null;

            if (!profileNameEl) {
              return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_heading_found', confidence: 'weak', debug: debugInfo };
            }

            const profileSection = profileNameEl.closest('section, .artdeco-card, [data-view-name]') || profileNameEl.parentElement?.parentElement;
            debugInfo.profileSectionTag = profileSection?.tagName || 'none';
            debugInfo.profileSectionClass = (profileSection?.className || '').substring(0, 100);

            if (!profileSection) {
              return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_profile_section', confidence: 'weak', debug: debugInfo };
            }

            const profileButtons = [...profileSection.querySelectorAll('button, a[role="button"], a[href*="messaging"]')];
            debugInfo.buttonsFound = profileButtons.length;
            debugInfo.buttonTexts = profileButtons.slice(0, 8).map(b => normalize(b.textContent || '').substring(0, 30));

            const buttonData = profileButtons.map(btn => ({
              text: normalize(btn.textContent || ''),
              label: normalize(btn.getAttribute('aria-label') || ''),
            }));

            const hasAction = (keywords, exclude = []) => {
              return buttonData.some(({ text, label }) => {
                const combined = `${text} ${label}`;
                if (exclude.some(ex => combined.includes(ex))) return false;
                return keywords.some(k => text === k || label === k || text.includes(k) || label.includes(k));
              });
            };

            const PENDING = ['pending', 'pendente', 'pendiente', 'en attente', 'aguardando', 'em espera', 'in attesa'];
            const CONNECT = ['connect', 'conectar', 'conectar-se', 'se connecter', 'inviter', 'invitar', 'ajouter', 'add'];
            const MESSAGE = ['message', 'mensagem', 'mensaje', 'messaggio'];
            const CONNECTED = ['connected', 'conectado', 'conectada', 'connecté', 'connectée', 'connesso', 'connessa'];
            const REMOVE = ['remove connection', 'remover conexão', 'remover conexao', 'retirer la relation', 'eliminar conexión', 'eliminar conexion'];

            const degreeTexts = [...profileSection.querySelectorAll('span, li, div')]
              .map((el) => normalize(el.textContent || ''))
              .filter((txt) => txt && txt.length <= 48);
            const degreeBlob = degreeTexts.join(' | ');
            const hasFirstDegree = /(\b1st\b|\b1º\b|\b1er\b|\b1\.? grau\b|\b1\.? grado\b|\b1\.? degree\b)/i.test(degreeBlob);
            debugInfo.hasFirstDegree = hasFirstDegree;

            if (hasAction(PENDING)) {
              return { success: true, action: 'check_connection_status', is_connected: false, note: 'pending', confidence: 'weak', debug: debugInfo };
            }

            if (hasAction(CONNECT, ['disconnect', 'remover', 'remove'])) {
              return { success: true, action: 'check_connection_status', is_connected: false, note: 'connect_available', confidence: 'weak', debug: debugInfo };
            }

            if (hasAction(CONNECTED)) {
              return { success: true, action: 'check_connection_status', is_connected: true, note: 'connected_label', confidence: 'strong', debug: debugInfo };
            }

            if (hasAction(REMOVE)) {
              return { success: true, action: 'check_connection_status', is_connected: true, note: 'remove_connection', confidence: 'strong', debug: debugInfo };
            }

            if (hasAction(MESSAGE)) {
              if (hasFirstDegree) {
                return { success: true, action: 'check_connection_status', is_connected: true, note: 'message_button_1st', confidence: 'strong', debug: debugInfo };
              }
              return { success: true, action: 'check_connection_status', is_connected: false, note: 'message_without_1st', confidence: 'weak', debug: debugInfo };
            }

            const msgLinks = profileSection.querySelectorAll('a[href*="messaging"]');
            if (msgLinks.length > 0) {
              if (hasFirstDegree) {
                return { success: true, action: 'check_connection_status', is_connected: true, note: 'message_link_1st', confidence: 'strong', debug: debugInfo };
              }
              return { success: true, action: 'check_connection_status', is_connected: false, note: 'message_link_without_1st', confidence: 'weak', debug: debugInfo };
            }

            if (hasFirstDegree) {
              return { success: true, action: 'check_connection_status', is_connected: true, note: 'first_degree_badge', confidence: 'strong', debug: debugInfo };
            }

            return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_top_card_buttons', confidence: 'weak', debug: debugInfo };
          },
        });
        if (results && results[0] && results[0].result) {
          console.log('[QueueProcessor] Direct check result:', JSON.stringify(results[0].result));
          return results[0].result;
        }
        throw new Error('No result from direct execution');
      } catch (err) {
        console.error('[QueueProcessor] Direct execution failed:', err.message);
        throw err;
      }
    }

    // For other actions, use content script messaging
    await this.ensureContentScript(tab.id);
    const maxRetries = 4;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.sendMessageToTab(tab.id, action);
        return result;
      } catch (err) {
        console.warn(`[QueueProcessor] sendMessage attempt ${attempt}/${maxRetries} failed:`, err.message);
        if (attempt < maxRetries) {
          const retryWait = 1000 + attempt * 2000;
          await this.sleep(retryWait);
          await this.ensureContentScript(tab.id);
          await this.sleep(1500);
        } else {
          throw err;
        }
      }
    }
  },

  async ensureContentScript(tabId) {
    try {
      // Verify tab is on a LinkedIn page before injecting
      const tab = await chrome.tabs.get(tabId);
      console.log('[QueueProcessor] Tab URL before injection:', tab.url);
      if (!tab.url || !tab.url.includes('linkedin.com')) {
        console.warn('[QueueProcessor] Tab not on LinkedIn, skipping injection');
        return;
      }
      const ping = (ms) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('ping timeout')), ms);
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (resp) => {
          clearTimeout(t);
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(resp);
        });
      });
      // The manifest already loads content.js on every LinkedIn page. Loading it a second time
      // throws "Identifier '_cachedMailboxUrn' has already been declared" (its top-level let/const
      // cannot be declared twice) and shows up in the extension's error list. So ask first, and
      // inject only when nobody answers.
      try {
        await ping(2000);
        console.log('[QueueProcessor] Content script already loaded');
        return;
      } catch (_) { /* not there yet: inject below */ }
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      await this.sleep(1500); // Give it time to initialize
      
      // Verify content script is responsive with a ping
      try {
        await ping(5000);
        console.log('[QueueProcessor] Content script verified responsive');
      } catch (pingErr) {
        console.warn('[QueueProcessor] Content script not responding to ping, retrying injection...');
        await this.sleep(2000);
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        });
        await this.sleep(2000);
      }
    } catch (err) {
      console.warn('[QueueProcessor] Content script injection failed:', err.message);
    }
  },

  // The lead's name as stored, so the activity page can tell the person's own posts from reposts.
  async lookupLeadName(action) {
    if (!action.campaign_lead_id) return null;
    try {
      const { data } = await supabase.select('campaign_leads', `id=eq.${action.campaign_lead_id}&select=full_name`, { limit: 1 });
      return (data && data[0] && data[0].full_name) || null;
    } catch (err) {
      console.warn('[QueueProcessor] Lead name lookup failed (non-fatal):', err.message);
      return null;
    }
  },

  sendMessageToTab(tabId, action) {
    return new Promise((resolve, reject) => {
      const timeoutMs = 30000;
      const timeout = setTimeout(() => reject(new Error(`Content script timeout (${timeoutMs / 1000}s)`)), timeoutMs);
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          action_type: action.action_type,
          linkedin_url: action.action_data?.linkedin_url || action.linkedin_url,
          message_text: action.action_data?.message_text || action.message_text,
          expected_name: action.action_data?.expected_name || action._expectedName || null,
          post_url: action._postUrl || action.action_data?.post_url || null,
          // Growth: like the chosen post in the same visit that finds it.
          like: action.action_type === 'find_latest_post' && action._likeInVisit === true,
        }
      }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response) {
          reject(new Error('No response from content script'));
          return;
        }
        if (response.success || response.redirect) {
          resolve(response);
        } else {
          reject(new Error(response.error || 'Action failed'));
        }
      });
    });
  },

  async reportCompletion(action, success, result, errorMessage) {
    try {
      // "Rede" module actions report to their own endpoint
      const endpoint = isNetworkAction(action) ? 'network-action-completed' : 'action-completed';
      await fetch(`${supabase.url}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers: supabase.getHeaders(),
        body: JSON.stringify({
          action_queue_id: action.id,
          campaign_lead_id: action.campaign_lead_id,
          action_type: action.action_type,
          success,
          result: result || null,
          error_message: errorMessage || null
        })
      });
    } catch (error) {
      console.error('[QueueProcessor] Failed to report completion:', error);
    }
  },

  waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      function listener(updatedTabId, changeInfo) {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(listener);
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }, 15000);
    });
  },

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  pause() {
    this.isPaused = true;
    console.log('[QueueProcessor] Paused');
  },

  // Pause here and on the server, so the schedulers stop queueing too. Only the user resumes.
  async pauseForLinkedInWarning(url) {
    this.pause();
    if (!supabase.accessToken || !supabase.userId) return;
    try {
      await fetch(`${supabase.url}/rest/v1/extension_status?user_id=eq.${supabase.userId}`, {
        method: 'PATCH',
        headers: { ...supabase.getHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          is_paused: true,
          auto_paused_at: new Date().toISOString(),
          auto_paused_reason: `LinkedIn showed a security checkpoint or logged the account out (${String(url).slice(0, 120)}). Paused automatically.`,
        }),
      });
    } catch (e) {
      console.error('[LC] Failed to store the automatic pause:', e);
    }
  },

  resume() {
    this.isPaused = false;
    console.log('[QueueProcessor] Resumed');
  }
};

// ═══════════════════════════════════════════════════
// INITIALIZATION & EVENT LISTENERS
// ═══════════════════════════════════════════════════

// Re-hydrate in-memory auth from storage (service worker may have been terminated)
async function ensureAuth() {
  if (supabase.accessToken && supabase.userId) return true;
  const stored = await getAuthToken();
  if (!stored) return false;
  supabase.accessToken = stored.access_token;
  supabase.userId = stored.user_id;
  // Proactive refresh if expiring within 5 min
  if (stored.expires_at && Date.now() >= stored.expires_at - 300000) {
    console.log('[LC:Auth] ensureAuth: token expiring, refreshing...');
    const refreshed = await supabase.refreshSession();
    if (!refreshed) {
      if (!supabase.refreshRefused) {
        console.warn('[LC:Auth] ensureAuth: could not renew right now; keeping the session');
        // Unless the person signed out while the renewal was on its way.
        return !!(supabase.accessToken && supabase.userId);
      }
      console.warn('[LC:Auth] ensureAuth: the session was refused, clearing');
      await supabase.clearAuth(stored);
      return false;
    }
  }
  return true;
}

async function runConnectionVerificationSweep() {
  if (!supabase.accessToken || !supabase.userId) return;
  const cooldownUntil = await getLocalData('linkedin_cooldown_until');
  if (cooldownUntil && Date.now() < cooldownUntil) return;

  try {
    const { data: leads } = await supabase.select(
      'campaign_leads',
      `user_id=eq.${supabase.userId}&status=in.(connection_sent,connected,connection_accepted)`,
      { select: 'id,linkedin_url,connection_verified,connection_verified_at,connection_sent_at', limit: 200 }
    );
    if (!leads || leads.length === 0) return;

    const now = Date.now();
    const staleMs = 12 * 60 * 60 * 1000;
    const candidates = leads.filter((lead) => {
      if (!lead.linkedin_url) return false;
      if (lead.connection_verified === true && lead.connection_verified_at) {
        return now - new Date(lead.connection_verified_at).getTime() > staleMs;
      }
      return lead.connection_verified !== true;
    });
    if (candidates.length === 0) return;

    const leadIds = candidates.map(l => l.id);
    const { data: existing } = await supabase.select(
      'action_queue',
      `user_id=eq.${supabase.userId}&status=eq.pending&action_type=eq.check_connection_status&campaign_lead_id=in.(${leadIds.join(',')})`,
      { select: 'campaign_lead_id', limit: 200 }
    );
    const existingIds = new Set((existing || []).map(e => e.campaign_lead_id));
    const MAX_BATCH = 30;
    const toQueue = candidates.filter(l => !existingIds.has(l.id)).slice(0, MAX_BATCH);
    if (toQueue.length === 0) return;

    const baseTime = Date.now();
    const queued = toQueue.map((lead, index) => ({
      user_id: supabase.userId,
      campaign_lead_id: lead.id,
      action_type: 'check_connection_status',
      linkedin_url: normalizeLinkedInUrl(lead.linkedin_url) || lead.linkedin_url,
      scheduled_for: new Date(baseTime + index * 15000).toISOString(),
      priority: 1,
    }));

    await supabase.insert('action_queue', queued);
    console.log(`[Verification] Queued ${queued.length} connection checks`);
  } catch (error) {
    console.error('[Verification] Sweep failed:', error.message);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('[LC] Extension installed/updated');
  chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
  chrome.alarms.create('pollQueue', { periodInMinutes: 0.5 });
  chrome.alarms.create('refreshToken', { periodInMinutes: 30 });
  chrome.alarms.create('verifyConnections', { periodInMinutes: 720 });
  const authenticated = await supabase.init();
  if (authenticated) {
    console.log('[LC:Auth] Session restored for user:', supabase.userId);
    await sendHeartbeat();
    try { await lcMaybeDetectTier(true); } catch (_) { /* retried by the heartbeat alarm */ }
  }
});

chrome.runtime.onStartup.addListener(async () => {
  // Created again when the browser starts: timers are not guaranteed to survive a restart, and the
  // queue waits for a heartbeat before it runs. Creating one that exists just replaces it.
  chrome.alarms.create('heartbeat', { periodInMinutes: 1 });
  chrome.alarms.create('pollQueue', { periodInMinutes: 0.5 });
  chrome.alarms.create('refreshToken', { periodInMinutes: 30 });
  chrome.alarms.create('verifyConnections', { periodInMinutes: 720 });
  const authenticated = await supabase.init();
  if (authenticated) {
    console.log('[LC:Auth] Session restored on startup');
    await sendHeartbeat();
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // Always re-hydrate auth from storage (SW may have been terminated)
  const hasAuth = await ensureAuth();

  if (alarm.name === 'heartbeat') {
    if (hasAuth) {
      await sendHeartbeat();
      // LinkedIn plan (free / premium / Sales Navigator), checked every 12h
      try { await lcMaybeDetectTier(false); } catch (e) { console.warn('[LC:Tier]', e.message); }
    }
  }
  if (alarm.name === 'pollQueue') {
    if (hasAuth) await queueProcessor.poll();
  }
  if (alarm.name === 'refreshToken') {
    if (hasAuth) {
      const refreshed = await supabase.refreshSession();
      if (!refreshed) {
        console.warn('[LC:Auth] Scheduled refresh failed — attempting re-init...');
        const recovered = await supabase.init();
        if (!recovered) {
          console.error('[LC:Auth] Session not confirmed (signed out, or the renewal will be tried again)');
        }
      } else {
        if (CONFIG.DEBUG) console.log('[LC:Auth] Token refreshed successfully');
      }
    }
  }
  if (alarm.name === 'verifyConnections') {
    if (hasAuth) await runConnectionVerificationSweep();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOGIN') {
    handleLogin(message.email, message.password)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.type === 'LOGOUT') {
    handleLogout()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.type === 'GET_STATUS') {
    // Re-hydrate from storage before checking
    ensureAuth().then(hasAuth => {
      sendResponse({
        authenticated: hasAuth && !!supabase.accessToken,
        userId: supabase.userId
      });
    });
    return true;
  }
  if (message.type === 'TOGGLE_PAUSE') {
    handleTogglePause()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.type === 'GET_SAFETY_STATUS') {
    safetyManager.getStatus()
      .then(status => sendResponse(status))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'GET_FULL_STATUS') {
    getFullStatus()
      .then(status => sendResponse(status))
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  if (message.type === 'GET_SCHEDULE') {
    const DAY_MAP_R = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat', 7: 'sun' };
    const days = (LIMITS.active_days || []).map(n => DAY_MAP_R[n]).filter(Boolean);
    sendResponse({
      success: true,
      active_days: days,
      active_hours_start: typeof LIMITS.active_hours_start === 'string' ? LIMITS.active_hours_start : String(LIMITS.active_hours_start).padStart(2, '0') + ':00',
      active_hours_end: typeof LIMITS.active_hours_end === 'string' ? LIMITS.active_hours_end : String(LIMITS.active_hours_end).padStart(2, '0') + ':00',
    });
    return false;
  }
  if (message.type === 'SAVE_SCHEDULE') {
    handleSaveSchedule(message.active_days, message.active_hours_start, message.active_hours_end)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  if (message.type === 'CHECK_LINKEDIN_WARNINGS') {
    if (message.warning) {
      console.error('[LC:Safety] LinkedIn warning detected:', message.warning);
      queueProcessor.pause();
      chrome.storage.local.set({
        linkedin_cooldown_until: Date.now() + (24 * 60 * 60 * 1000),
        linkedin_cooldown_reason: message.warning
      });
    }
    sendResponse({ received: true });
    return false;
  }
});

// ── MESSAGES FROM THE OLANOVO SITE ──
// Only pages listed under externally_connectable in the manifest can reach this listener. The
// origin is checked again here, so a change to the manifest alone cannot open it to another site.
const SITE_ORIGINS = ['https://www.olanovo.com', 'https://olanovo.com'];

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  let origin = '';
  try { origin = new URL(sender.origin || sender.url || '').origin; } catch { origin = ''; }
  if (!SITE_ORIGINS.includes(origin)) {
    sendResponse({ success: false, error: 'not_allowed' });
    return false;
  }
  // Is the extension there, which version, and is it connected? The page says which account it
  // is signed in as and is told only whether the extension is on that same account: the id of the
  // account the extension holds is never sent to the page.
  if (message?.type === 'OLANOVO_PING') {
    const asked = typeof message.userId === 'string' ? message.userId : '';
    ensureAuth().then(hasAuth => {
      const connected = !!(hasAuth && supabase.accessToken && supabase.userId);
      sendResponse({
        success: true,
        version: chrome.runtime.getManifest().version,
        authenticated: connected,
        sameUser: connected && !!asked && asked === supabase.userId
      });
    }).catch(() => sendResponse({ success: true, version: chrome.runtime.getManifest().version, authenticated: false, sameUser: false }));
    return true;
  }
  // Connect the extension to the account signed in on the site.
  if (message?.type === 'OLANOVO_CONNECT') {
    handleSiteConnect(message.session)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  sendResponse({ success: false, error: 'unknown_message' });
  return false;
});

async function handleSiteConnect(session) {
  try {
    await supabase.signInWithSession(session);
  } catch (error) {
    return { success: false, error: error.message };
  }
  // The site is answered as soon as the session is stored. The heartbeat follows on its own: it can
  // take longer than the site waits, and the queue does not run until it has answered anyway. The
  // answer carries no account id.
  sendHeartbeat().catch(() => {});
  return { success: true };
}

async function handleLogin(email, password) {
  try {
    await supabase.signIn(email, password);
    await sendHeartbeat();
    return { success: true, userId: supabase.userId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleLogout() {
  await supabase.clearAuth();
  clearSessionLost(); // the person signed out themselves: nothing to warn about
}

async function handleSaveSchedule(activeDays, startHour, endHour) {
  try {
    const allowed = ['mon','tue','wed','thu','fri','sat','sun'];
    const cleanDays = (Array.isArray(activeDays) ? activeDays : [])
      .map(d => String(d).toLowerCase())
      .filter(d => allowed.includes(d));
    if (cleanDays.length === 0) {
      return { success: false, error: 'Pick at least one day.' };
    }
    const timeRe = /^([01]?\d|2[0-3]):[0-5]\d$/;
    if (!timeRe.test(startHour) || !timeRe.test(endHour)) {
      return { success: false, error: 'Invalid time format.' };
    }
    const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
    if (toMin(startHour) >= toMin(endHour)) {
      return { success: false, error: 'End must be after start.' };
    }

    // Persist to Supabase so it survives extension updates
    if (supabase.accessToken && supabase.userId) {
      const res = await fetch(
        `${supabase.url}/rest/v1/extension_status?user_id=eq.${supabase.userId}`,
        {
          method: 'PATCH',
          headers: { ...supabase.getHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({
            active_days: cleanDays,
            active_hours_start: startHour,
            active_hours_end: endHour,
          }),
        }
      );
      if (!res.ok) {
        const text = await res.text();
        console.error('[LC] Failed to save schedule:', res.status, text);
        return { success: false, error: `Server refused update (${res.status}).` };
      }
    }

    // Update in-memory LIMITS so canExecute sees the new schedule immediately
    const DAY_MAP = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
    LIMITS.active_days = cleanDays.map(d => DAY_MAP[d]).filter(Boolean);
    LIMITS.active_hours_start = startHour;
    LIMITS.active_hours_end = endHour;
    if (CONFIG.DEBUG) console.log('[Schedule] Updated:', { days: cleanDays, start: startHour, end: endHour });
    return { success: true };
  } catch (error) {
    console.error('[LC] handleSaveSchedule error:', error);
    return { success: false, error: error.message };
  }
}

async function handleTogglePause() {
  if (queueProcessor.isPaused) {
    queueProcessor.resume();
  } else {
    queueProcessor.pause();
  }
  if (supabase.accessToken && supabase.userId) {
    try {
      await fetch(
        `${supabase.url}/rest/v1/extension_status?user_id=eq.${supabase.userId}`,
        {
          method: 'PATCH',
          headers: { ...supabase.getHeaders(), 'Prefer': 'return=representation' },
          body: JSON.stringify({ is_paused: queueProcessor.isPaused })
        }
      );
    } catch (e) {
      console.error('[LC] Failed to update pause status:', e);
    }
  }
  return { success: true, paused: queueProcessor.isPaused };
}

async function getFullStatus() {
  const safetyStatus = await safetyManager.getStatus();
  const linkedinTabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  let queueCount = 0;
  let lastAction = null;
  if (supabase.accessToken) {
    try {
      const { data: queue } = await supabase.select(
        'action_queue',
        `user_id=eq.${supabase.userId}&status=eq.pending`,
        { select: 'id', limit: 100 }
      );
      queueCount = queue?.length || 0;
      const { data: recent } = await supabase.select(
        'action_queue',
        `user_id=eq.${supabase.userId}&status=eq.completed`,
        { order: 'completed_at.desc', limit: 1, select: 'action_type,completed_at' }
      );
      if (recent?.length > 0) {
        lastAction = { type: recent[0].action_type, completedAt: recent[0].completed_at };
      }
    } catch (e) {
      console.error('[LC] Status query error:', e);
    }
  }
  const cooldownData = await new Promise(resolve => {
    chrome.storage.local.get(['linkedin_cooldown_until', 'linkedin_cooldown_reason'], resolve);
  });
  const cooldownActive = cooldownData.linkedin_cooldown_until && Date.now() < cooldownData.linkedin_cooldown_until;
  return {
    authenticated: !!supabase.accessToken,
    userId: supabase.userId,
    linkedinOpen: linkedinTabs.length > 0,
    isPaused: queueProcessor.isPaused,
    isProcessing: queueProcessor.isProcessing,
    safety: safetyStatus,
    queueCount,
    lastAction,
    cooldown: cooldownActive ? {
      until: cooldownData.linkedin_cooldown_until,
      reason: cooldownData.linkedin_cooldown_reason
    } : null,
  };
}
