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
  active_days: [1, 2, 3, 4, 5, 6, 7], // 1=Mon..7=Sun — LinkedIn ≠ email, 7 dias por default
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
            await supabase.update('action_queue',
              { status: 'pending', picked_up_at: null, error_message: 'auto-reset: stuck in_progress >5min' },
              `id=eq.${s.id}`
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

      // ── PRE-FLIGHT REPLY CHECK (v0.1.9) ──
      // Before sending a follow-up, navigate to the profile and check if the lead
      // has already replied. If they have, skip the follow-up entirely — the user
      // takes over manually once a lead engages. This is more reliable than
      // depending on check_reply_status having run correctly beforehand.
      if (action.action_type === 'send_followup') {
        console.log('[QueueProcessor] Pre-flight reply check before send_followup...');
        try {
          // Create a temporary check action to reuse the existing flow
          const checkAction = {
            ...action,
            action_type: 'check_reply_status',
          };
          const checkResult = await this.sendToContentScript(checkAction);

          if (checkResult && checkResult.has_reply) {
            console.log(`[QueueProcessor] ✅ Reply detected in pre-flight check — aborting follow-up`);
            console.log(`[QueueProcessor]   Reply text: ${(checkResult.reply_text || '').substring(0, 60)}...`);

            // Mark the followup as skipped
            await supabase.update('action_queue',
              { status: 'skipped', error_message: 'REPLY_DETECTED: Lead already replied — follow-up aborted', completed_at: new Date().toISOString() },
              `id=eq.${action.id}`
            );

            // Update lead status to replied
            if (action.campaign_lead_id) {
              await supabase.update('campaign_leads',
                {
                  status: 'replied',
                  replied_at: new Date().toISOString(),
                  reply_detected_at: new Date().toISOString(),
                  reply_text: (checkResult.reply_text || '').substring(0, 4000),
                  next_action_at: null, // Stop all automation
                  error_message: null,
                },
                `id=eq.${action.campaign_lead_id}`
              );
            }

            // Report as skipped (not failed, not success)
            await this.reportCompletion(action, false, checkResult, 'REPLY_DETECTED: Lead already replied — follow-up aborted');

            await supabase.insert('activity_log', {
              user_id: supabase.userId,
              campaign_lead_id: action.campaign_lead_id,
              action: 'send_followup_aborted_reply_detected',
              details: {
                reply_count: checkResult.reply_count || 0,
                reply_text: (checkResult.reply_text || '').substring(0, 200),
                detection_method: checkResult.detection_method || 'pre_flight',
              },
            });

            this.isProcessing = false;
            return;
          }
          console.log('[QueueProcessor] No reply detected — proceeding with follow-up');
        } catch (checkErr) {
          // If the pre-flight check fails, log but continue with the follow-up
          // (better to send a follow-up than to silently skip it due to a check failure)
          console.warn('[QueueProcessor] Pre-flight reply check failed (non-fatal):', checkErr.message);
        }
      }

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

      // NOTE: The messaging_redirect fallback (DOM compose on /messaging/ page) was removed
      // in v0.1.7 — it's 100% broken in LinkedIn's 2026-04 layout. content.js now sends
      // via Voyager API directly and propagates errors instead of returning a redirect.

      // ── INMAIL THREAD BYPASS (v0.1.9) ──
      // When the standard hostRecipientUrns approach returns 422 NOT_ALLOWED_PREMIUM_INMAIL,
      // content.js returns { note: 'inmail_thread_retry_needed', recipientProfileId }.
      // We navigate to /messaging/thread/new/?recipient=ID, let LinkedIn SPA resolve
      // the conversation URL (/messaging/thread/THREAD_ID/), extract the threadId,
      // then send via conversationUrn which bypasses the InMail restriction.
      if (result && result.note === 'inmail_thread_retry_needed' && result.recipientProfileId) {
        console.log(`[QueueProcessor] InMail thread detected — attempting conversationUrn bypass for ${result.recipientProfileId}`);
        const tab = (await chrome.tabs.query({ url: 'https://www.linkedin.com/*' }))[0];
        if (tab) {
          try {
            // Step 1: Navigate to messaging thread (LinkedIn SPA resolves to /messaging/thread/THREAD_ID/)
            const messagingUrl = `https://www.linkedin.com/messaging/thread/new/?recipient=${result.recipientProfileId}`;
            console.log('[QueueProcessor] Navigating to messaging URL:', messagingUrl);
            await chrome.tabs.update(tab.id, { url: messagingUrl });
            await this.waitForTabLoad(tab.id);
            await this.sleep(5000); // Give SPA time to resolve the conversation

            // Step 2: Extract threadId from the resolved URL
            const updatedTab = await chrome.tabs.get(tab.id);
            const tabUrl = updatedTab.url || '';
            console.log('[QueueProcessor] Resolved messaging URL:', tabUrl);

            // URL pattern: /messaging/thread/THREAD_ID/ (e.g. /messaging/thread/2-MTEwOGFm...==/)
            const threadMatch = tabUrl.match(/\/messaging\/thread\/([^/?]+)/);
            if (!threadMatch || threadMatch[1] === 'new') {
              // SPA didn't resolve — try waiting longer
              console.warn('[QueueProcessor] Thread ID not resolved yet, waiting...');
              await this.sleep(5000);
              const retryTab = await chrome.tabs.get(tab.id);
              const retryUrl = retryTab.url || '';
              const retryMatch = retryUrl.match(/\/messaging\/thread\/([^/?]+)/);
              if (!retryMatch || retryMatch[1] === 'new') {
                throw new Error(`INMAIL_THREAD_ID_NOT_RESOLVED: URL stayed at ${retryUrl.substring(0, 100)}`);
              }
              threadMatch[1] = retryMatch[1];
            }

            const threadId = decodeURIComponent(threadMatch[1]);
            console.log('[QueueProcessor] Extracted threadId:', threadId);

            // Step 3: Inject content script and send via conversationUrn
            await this.ensureContentScript(tab.id);
            const messageText = action.action_data?.message_text || action.message_text;

            const inmailResult = await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error('conversationUrn send timeout (60s)')), 60000);
              chrome.tabs.sendMessage(tab.id, {
                type: 'SEND_VIA_CONVERSATION_URN',
                threadId: threadId,
                messageText: messageText,
              }, (response) => {
                clearTimeout(timeout);
                if (chrome.runtime.lastError) {
                  reject(new Error(chrome.runtime.lastError.message));
                  return;
                }
                if (!response) {
                  reject(new Error('No response from content script (conversationUrn)'));
                  return;
                }
                if (response.success) {
                  resolve(response);
                } else {
                  reject(new Error(response.error || 'conversationUrn send failed'));
                }
              });
            });

            console.log('[QueueProcessor] ✅ InMail bypass successful via conversationUrn');
            result = {
              success: true,
              action: action.action_type,
              note: 'sent_via_conversation_urn_inmail_bypass',
              via: 'voyager_api_conversation_urn',
              conversationUrn: inmailResult.conversationUrn || null,
              messageUrn: inmailResult.messageUrn || null,
              threadId: threadId,
            };
          } catch (inmailErr) {
            console.warn('[QueueProcessor] InMail conversationUrn bypass failed:', inmailErr.message);

            // ── FALLBACK: sendViaMessagingPage (v0.2.3) ──
            // When conversationUrn fails (usually INMAIL_THREAD_ID_NOT_RESOLVED because
            // LinkedIn won't resolve /messaging/thread/new/ for non-1st-degree),
            // fall back to the DOM-based compose approach that worked 09-14/04 with 65 successes.
            // This requires navigating BACK to the profile page first (URL guard protection).
            const isThreadNotResolved = /INMAIL_THREAD_ID_NOT_RESOLVED/i.test(inmailErr.message);
            if (isThreadNotResolved) {
              console.log('[QueueProcessor] Falling back to messaging page compose...');
              try {
                // Navigate back to the lead's profile page
                const profileUrl = action.action_data?.linkedin_url || action.linkedin_url;
                if (!profileUrl) throw new Error('No profile URL for messaging page fallback');

                console.log('[QueueProcessor] Navigating back to profile:', profileUrl);
                await chrome.tabs.update(tab.id, { url: profileUrl });
                await this.waitForTabLoad(tab.id);
                await this.sleep(6000);

                // Verify we're on the profile page
                const profileTab = await chrome.tabs.get(tab.id);
                const profileTabUrl = profileTab.url || '';
                if (!profileTabUrl.includes('/in/')) {
                  throw new Error(`MESSAGING_FALLBACK_NAVIGATION_FAILED: Expected /in/ but on ${profileTabUrl}`);
                }

                // Inject content script and send via the old messaging page flow
                await this.ensureContentScript(tab.id);
                const messageText = action.action_data?.message_text || action.message_text;
                const expectedName = action.action_data?.expected_name || null;

                // First, tell content script to click the Message button on the profile
                // This will open the messaging overlay or navigate to /messaging/thread/...
                const clickResult = await new Promise((resolve, reject) => {
                  const timeout = setTimeout(() => reject(new Error('Message button click timeout (30s)')), 30000);
                  chrome.tabs.sendMessage(tab.id, {
                    type: 'EXECUTE_ACTION',
                    action: {
                      action_type: 'find_and_click_message_button',
                      linkedin_url: profileUrl,
                    }
                  }, (response) => {
                    clearTimeout(timeout);
                    if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                      return;
                    }
                    resolve(response || {});
                  });
                });

                // If clicking the Message button navigated to a messaging page, wait and compose there
                await this.sleep(3000);
                const afterClickTab = await chrome.tabs.get(tab.id);
                const afterClickUrl = afterClickTab.url || '';
                console.log('[QueueProcessor] After Message button click, URL:', afterClickUrl);

                if (afterClickUrl.includes('/messaging/')) {
                  // We're on the messaging page — use composeOnMessagingPage
                  await this.ensureContentScript(tab.id);
                  const composeResult = await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Messaging page compose timeout (90s)')), 90000);
                    chrome.tabs.sendMessage(tab.id, {
                      type: 'EXECUTE_ACTION',
                      action: {
                        action_type: 'compose_on_messaging_page',
                        message_text: messageText,
                        expected_name: expectedName,
                      }
                    }, (response) => {
                      clearTimeout(timeout);
                      if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                      }
                      if (!response) {
                        reject(new Error('No response from compose_on_messaging_page'));
                        return;
                      }
                      if (response.success) {
                        resolve(response);
                      } else {
                        reject(new Error(response.error || 'compose_on_messaging_page failed'));
                      }
                    });
                  });

                  console.log('[QueueProcessor] ✅ InMail fallback via messaging page compose succeeded');
                  result = {
                    success: true,
                    action: action.action_type,
                    note: 'sent_via_messaging_page_inmail_fallback',
                    via: 'messaging_page_dom',
                    telemetry: composeResult.telemetry || null,
                  };
                } else {
                  // Message button didn't navigate to messaging — no compose available
                  throw new Error('INMAIL_NOT_AVAILABLE: Message button did not open messaging page');
                }
              } catch (fallbackErr) {
                console.error('[QueueProcessor] Messaging page fallback also failed:', fallbackErr.message);
                const isNotAvailable = /INMAIL_NOT_AVAILABLE|RECIPIENT_UNABLE_TO_RECEIVE|Message button not found/i.test(fallbackErr.message);
                if (isNotAvailable) {
                  // Mark lead as skipped_inmail so we stop retrying
                  throw new Error(`INMAIL_NOT_AVAILABLE: ${fallbackErr.message}`);
                }
                throw new Error(`INMAIL_BYPASS_FAILED: conversationUrn=${inmailErr.message} | messagingPage=${fallbackErr.message}`);
              }
            } else {
              // Non-threadID error (e.g. timeout, script error) — don't retry via messaging page
              throw new Error(`INMAIL_BYPASS_FAILED: ${inmailErr.message}`);
            }
          }
        } else {
          throw new Error('INMAIL_BYPASS_FAILED: No LinkedIn tab found');
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

      // ── INMAIL NOT AVAILABLE (v0.2.3) ──
      // Both conversationUrn AND messaging page fallback failed — this lead
      // cannot receive messages via any method. Mark as skipped_inmail so
      // the pipeline stops retrying.
      const isInmailNotAvailable = /INMAIL_NOT_AVAILABLE/i.test(error.message);
      if (isInmailNotAvailable) {
        console.warn(`[QueueProcessor] InMail not available for ${action.action_type}: ${error.message}`);
        try {
          await this.reportCompletion(action, false, null, `INMAIL_NOT_AVAILABLE: ${error.message}`);
          await supabase.update('action_queue',
            { status: 'skipped', error_message: `INMAIL_NOT_AVAILABLE: ${error.message}` },
            `id=eq.${action.id}`
          );
          if (action.campaign_lead_id) {
            await supabase.update('campaign_leads',
              {
                status: 'skipped_inmail',
                error_message: `InMail not available: ${error.message}`,
                next_action_at: null,
              },
              `id=eq.${action.campaign_lead_id}`
            );
          }
        } catch (reportErr) {
          console.error(`[QueueProcessor] Failed to report InMail not available:`, reportErr.message);
        }
        this.isProcessing = false;
        return;
      }

      // ── INMAIL BYPASS FAILURE ──
      // If the conversationUrn bypass was attempted but failed with a non-recoverable
      // error (timeout, script crash, etc). Mark as failed for investigation.
      const isInmailError = /INMAIL_BYPASS_FAILED|NOT_ALLOWED_PREMIUM_INMAIL/i.test(error.message);
      if (isInmailError) {
        console.warn(`[QueueProcessor] InMail bypass failed for ${action.action_type}: ${error.message}`);
        try {
          await this.reportCompletion(action, false, null, `INMAIL_FAILED: ${error.message}`);
          await supabase.update('action_queue',
            { status: 'failed', error_message: `INMAIL_FAILED: ${error.message}` },
            `id=eq.${action.id}`
          );
          if (action.campaign_lead_id) {
            await supabase.update('campaign_leads',
              { error_message: `InMail bypass failed: ${error.message}` },
              `id=eq.${action.campaign_lead_id}`
            );
          }
        } catch (reportErr) {
          console.error(`[QueueProcessor] Failed to report InMail failure:`, reportErr.message);
        }
        this.isProcessing = false;
        return;
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

        // ── POST-NAV GUARD: Verify the tab actually landed on the expected URL ──
        // Cross-contamination root cause: LinkedIn SPA sometimes doesn't complete
        // the navigation, leaving the tab on a /messaging/thread/ page from a
        // previous action. We must verify before injecting the content script.
        const messagingActions = ['send_dm', 'send_followup', 'send_connection_request', 'visit_profile', 'follow_profile', 'like_post'];
        if (messagingActions.includes(action.action_type)) {
          const postNavTab = await chrome.tabs.get(tab.id);
          const postNavUrl = postNavTab.url || '';
          console.log('[QueueProcessor] Post-navigation URL:', postNavUrl);

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
      // send_dm/compose needs longer: 25s compose input retry + typing/verification/sending
      const timeoutMs = (action.action_type === 'send_dm' || action.action_type === 'send_followup' || action.action_type === 'compose_on_messaging_page') ? 90000 : 30000;
      const timeout = setTimeout(() => reject(new Error(`Content script timeout (${timeoutMs / 1000}s)`)), timeoutMs);
      chrome.tabs.sendMessage(tabId, {
        type: 'EXECUTE_ACTION',
        action: {
          action_type: action.action_type,
          linkedin_url: action.action_data?.linkedin_url || action.linkedin_url,
          message_text: action.action_data?.message_text || action.message_text,
          expected_name: action.action_data?.expected_name || null,
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
        if (response.success || response.redirect || response.note === 'inmail_thread_retry_needed') {
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
