// ═══════════════════════════════════════════════════
// LinkedIn Copilot — Background Service Worker
// Single-file bundle (no ES module imports)
// ═══════════════════════════════════════════════════

console.log('[LC] Background service worker started');

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

function setAuthToken(auth) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ auth }, resolve);
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
      
      console.warn('[LC:Auth] All recovery attempts failed, clearing auth');
      await this.clearAuth();
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
    this.accessToken = data.access_token;
    this.userId = data.user.id;
    await setAuthToken({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user.id,
      expires_at: Date.now() + (data.expires_in * 1000)
    });
    return data;
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
    const stored = await getAuthToken();
    if (!stored?.refresh_token) return false;
    const res = await fetch(`${this.url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.anonKey
      },
      body: JSON.stringify({ refresh_token: stored.refresh_token })
    });
    if (!res.ok) return false;
    const data = await res.json();
    this.accessToken = data.access_token;
    await setAuthToken({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: stored.user_id,
      expires_at: Date.now() + (data.expires_in * 1000)
    });
    return true;
  },

  async clearAuth() {
    this.accessToken = null;
    this.userId = null;
    await clearAuthToken();
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
    return this.query(table, { method: 'PATCH', body, filters });
  }
};

// ── SAFETY MANAGER ──
const LIMITS = {
  connection_requests: 40,
  messages: 100,
  profile_visits: 80,
  
  post_likes: 30,
  total_actions: 200,
  active_hours_start: 8,
  active_hours_end: 18,
  active_days: [1, 2, 3, 4, 5], // 1=Mon..7=Sun
  timezone: 'America/New_York',
  warmup_days: 0,
  warmup_multiplier: 1,
  min_delay_ms: 15000,
  max_delay_ms: 90000,
  connection_request_extra_delay_ms: 5000,
  message_extra_delay_ms: 3000,
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
    // Only messaging actions are restricted to business hours
    const MESSAGING_ACTIONS = ['send_connection_request', 'send_dm', 'send_followup'];
    if (MESSAGING_ACTIONS.includes(actionType) && !this.isWithinActiveHours()) {
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
      case 'send_dm':
      case 'send_followup':
        if (counters.messages >= effectiveLimit(LIMITS.messages)) {
          return { allowed: false, reason: 'daily_limit_messages' };
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
    if (actionType === 'send_dm' || actionType === 'send_followup') base += LIMITS.message_extra_delay_ms;
    const jitter = base * 0.2;
    base += (Math.random() * jitter * 2) - jitter;
    return Math.floor(base);
  },

  async getDailyCounters() {
    const counters = await getLocalData('daily_counters');
    const today = new Date().toDateString();

    // If local counters exist and are from today, use them
    if (counters && counters.date === today) {
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
      case 'send_dm': case 'send_followup': counters.messages++; break;
      case 'visit_profile': counters.visits++; break;
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
      const refreshed = await supabase.refreshSession();
      if (!refreshed) {
        console.error('[LC:Auth] Session refresh failed during heartbeat');
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
  isPaused: false,

  async poll() {
    if (!supabase.accessToken || !supabase.userId) return;
    if (this.isPaused) return;
    if (this.isProcessing) return;
    try {
      const cooldownUntil = await getLocalData('linkedin_cooldown_until');
      if (cooldownUntil && Date.now() < cooldownUntil) {
        return;
      }
      const now = new Date().toISOString();
      
      // Build exclusion list for action types that hit daily limits
      const counters = await safetyManager.getDailyCounters();
      const excludeTypes = [];
      if (counters.connections >= LIMITS.connection_requests) excludeTypes.push('send_connection_request');
      if (counters.messages >= LIMITS.messages) { excludeTypes.push('send_dm'); excludeTypes.push('send_followup'); }
      const warmingCount = (counters.visits || 0) + (counters.follows || 0); // visit + follow share the same daily cap
      if (warmingCount >= LIMITS.profile_visits) { excludeTypes.push('visit_profile'); excludeTypes.push('follow_profile'); }
      if (counters.likes >= LIMITS.post_likes) excludeTypes.push('like_post');
      if (counters.total >= LIMITS.total_actions) return; // all actions blocked
      
      // Only messaging actions need business hours
      if (!safetyManager.isWithinActiveHours()) {
        excludeTypes.push('send_connection_request', 'send_dm', 'send_followup');
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
      await this.executeAction(data[0]);
    } catch (error) {
      console.error('[QueueProcessor] Poll error:', error);
    }
  },

  async executeAction(action) {
    this.isProcessing = true;
    try {
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
      await supabase.update('action_queue',
        { status: 'in_progress', picked_up_at: new Date().toISOString() },
        `id=eq.${action.id}`
      );
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
    const actionTypes = ['visit_profile', 'follow_profile', 'send_connection_request', 'like_post', 'send_dm', 'send_followup', 'check_connection_status', 'check_reply_status'];
    if (actionTypes.includes(action.action_type)) {
      let targetUrl = action.action_data?.linkedin_url || action.linkedin_url;
      if (targetUrl) {
        const normalized = normalizeLinkedInUrl(targetUrl);
        if (!normalized) {
          throw new Error(`Invalid LinkedIn URL: ${targetUrl}`);
        }
        targetUrl = normalized;

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
      }
    }

    const ghostGuardActions = ['visit_profile', 'send_connection_request', 'send_dm', 'send_followup'];
    if (ghostGuardActions.includes(action.action_type)) {
      const quality = await this.runProfileQualityCheck(tab.id);
      if (quality?.is_ghost && quality?.confidence === 'strong') {
        const now = new Date().toISOString();
        const ghostResult = { ...quality, action: 'check_profile_quality', jit: true };
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
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      await this.sleep(1500); // Give it time to initialize
      
      // Verify content script is responsive with a ping
      try {
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error('ping timeout')), 5000);
          chrome.tabs.sendMessage(tabId, { type: 'PING' }, (resp) => {
            clearTimeout(t);
            if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
            else resolve(resp);
          });
        });
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

  sendMessageToTab(tabId, action) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Content script timeout (30s)')), 30000);
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          action_type: action.action_type,
          linkedin_url: action.action_data?.linkedin_url || action.linkedin_url,
          message_text: action.action_data?.message_text || action.message_text
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
      await fetch(`${supabase.url}/functions/v1/action-completed`, {
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
      console.warn('[LC:Auth] ensureAuth: refresh failed, clearing');
      await supabase.clearAuth();
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
  }
});

chrome.runtime.onStartup.addListener(async () => {
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
    if (hasAuth) await sendHeartbeat();
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
          console.error('[LC:Auth] Session lost — user needs to re-login');
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
