document.addEventListener('DOMContentLoaded', () => {
  const loginView = document.getElementById('login-view');
  const statusView = document.getElementById('status-view');
  const noLinkedinView = document.getElementById('no-linkedin-view');
  const loadingView = document.getElementById('loading-view');
  const loginBtn = document.getElementById('login-btn');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const loginError = document.getElementById('login-error');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statConnections = document.getElementById('stat-connections');
  const statMessages = document.getElementById('stat-messages');
  const statFollowups = document.getElementById('stat-followups');
  const statVisits = document.getElementById('stat-visits');
  const statFollows = document.getElementById('stat-follows');
  const statLikes = document.getElementById('stat-likes');
  const statQueue = document.getElementById('stat-queue');
  const statLastAction = document.getElementById('stat-last-action');
  const warmupBanner = document.getElementById('warmup-banner');
  const cooldownBanner = document.getElementById('cooldown-banner');
  const pauseBtn = document.getElementById('pause-btn');
  const dashboardLink = document.getElementById('dashboard-link');
  const dashboardLink2 = document.getElementById('dashboard-link-2');
  const logoutLink = document.getElementById('logout-link');
  const logoutLink2 = document.getElementById('logout-link-2');
  const openLinkedinBtn = document.getElementById('open-linkedin-btn');

  // Schedule editor elements
  const scheduleSection = document.querySelector('.schedule-section');
  const scheduleToggle = document.getElementById('schedule-toggle');
  const schedulePanel = document.getElementById('schedule-panel');
  const scheduleSummary = document.getElementById('schedule-summary');
  const scheduleStart = document.getElementById('schedule-start');
  const scheduleEnd = document.getElementById('schedule-end');
  const scheduleError = document.getElementById('schedule-error');
  const scheduleSave = document.getElementById('schedule-save');
  const dayCheckboxes = document.querySelectorAll('.day-pill input[data-day]');
  const DAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
  const DAY_ORDER = ['mon','tue','wed','thu','fri','sat','sun'];

  const DASHBOARD_URL = 'https://linkedincopilot.vercel.app/dashboard';

  // Check current status on popup open
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response && response.authenticated) {
      loadFullStatus();
    } else {
      showLoginView();
    }
  });

  // Login handler
  loginBtn.addEventListener('click', () => {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      loginError.textContent = 'Please enter email and password';
      return;
    }

    loginError.textContent = '';
    showLoadingView();

    chrome.runtime.sendMessage(
      { type: 'LOGIN', email, password },
      (response) => {
        if (response && response.success) {
          loadFullStatus();
        } else {
          showLoginView();
          loginError.textContent = response?.error || 'Login failed';
        }
      }
    );
  });

  // Allow Enter key to submit login
  passwordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginBtn.click();
  });

  // Pause/Resume handler
  pauseBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TOGGLE_PAUSE' }, (response) => {
      if (response && response.success) {
        pauseBtn.textContent = response.paused ? 'Resume Automation' : 'Pause Automation';
      }
    });
  });

  // Dashboard links
  function openDashboard(e) {
    e.preventDefault();
    chrome.tabs.create({ url: DASHBOARD_URL });
  }
  dashboardLink.addEventListener('click', openDashboard);
  if (dashboardLink2) dashboardLink2.addEventListener('click', openDashboard);

  // Logout handlers
  function logout(e) {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => {
      showLoginView();
    });
  }
  logoutLink.addEventListener('click', logout);
  if (logoutLink2) logoutLink2.addEventListener('click', logout);

  // Open LinkedIn button
  if (openLinkedinBtn) {
    openLinkedinBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.linkedin.com/feed/' });
    });
  }

  // ── Schedule Editor ──
  if (scheduleToggle && schedulePanel) {
    scheduleToggle.addEventListener('click', () => {
      schedulePanel.classList.toggle('hidden');
      scheduleSection.classList.toggle('open');
    });
  }

  function renderScheduleSummary(days, start, end) {
    const count = (days || []).length;
    if (count === 0) {
      scheduleSummary.textContent = 'No days active';
      return;
    }
    let daysLabel;
    if (count === 7) daysLabel = '7 days';
    else if (count === 5 && ['mon','tue','wed','thu','fri'].every(d => days.includes(d))) daysLabel = 'Mon–Fri';
    else if (count === 2 && days.includes('sat') && days.includes('sun')) daysLabel = 'Weekends';
    else daysLabel = days.map(d => DAY_LABELS[d]).join('·');
    scheduleSummary.textContent = `${daysLabel}, ${start}–${end}`;
  }

  function loadScheduleFromBackground() {
    chrome.runtime.sendMessage({ type: 'GET_SCHEDULE' }, (resp) => {
      if (!resp || !resp.success) return;
      const days = Array.isArray(resp.active_days) ? resp.active_days : [];
      const start = resp.active_hours_start || '08:00';
      const end = resp.active_hours_end || '18:00';
      dayCheckboxes.forEach(cb => { cb.checked = days.includes(cb.dataset.day); });
      scheduleStart.value = start;
      scheduleEnd.value = end;
      renderScheduleSummary(days, start, end);
    });
  }

  if (scheduleSave) {
    scheduleSave.addEventListener('click', () => {
      const selected = DAY_ORDER.filter(d => {
        const cb = document.querySelector(`.day-pill input[data-day="${d}"]`);
        return cb && cb.checked;
      });
      const start = scheduleStart.value || '08:00';
      const end = scheduleEnd.value || '18:00';
      scheduleError.textContent = '';

      if (selected.length === 0) {
        scheduleError.textContent = 'Pick at least one day.';
        return;
      }
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if (isNaN(sh) || isNaN(eh) || (sh * 60 + (sm || 0)) >= (eh * 60 + (em || 0))) {
        scheduleError.textContent = 'End must be after start.';
        return;
      }

      scheduleSave.disabled = true;
      scheduleSave.textContent = 'Saving…';
      chrome.runtime.sendMessage(
        { type: 'SAVE_SCHEDULE', active_days: selected, active_hours_start: start, active_hours_end: end },
        (resp) => {
          scheduleSave.disabled = false;
          scheduleSave.textContent = 'Save schedule';
          if (resp && resp.success) {
            renderScheduleSummary(selected, start, end);
            scheduleError.style.color = 'var(--green)';
            scheduleError.textContent = 'Saved.';
            setTimeout(() => { scheduleError.textContent = ''; scheduleError.style.color = ''; }, 2000);
            // Refresh main status to reflect new active window
            loadFullStatus();
          } else {
            scheduleError.style.color = '';
            scheduleError.textContent = (resp && resp.error) || 'Save failed.';
          }
        }
      );
    });
  }

  // ── View Management ──

  function hideAllViews() {
    loginView.classList.add('hidden');
    statusView.classList.add('hidden');
    noLinkedinView.classList.add('hidden');
    loadingView.classList.add('hidden');
  }

  function showLoginView() {
    hideAllViews();
    loginView.classList.remove('hidden');
  }

  function showStatusView() {
    hideAllViews();
    statusView.classList.remove('hidden');
  }

  function showNoLinkedinView() {
    hideAllViews();
    noLinkedinView.classList.remove('hidden');
  }

  function showLoadingView() {
    hideAllViews();
    loadingView.classList.remove('hidden');
  }

  // ── Full Status Loading ──

  function loadFullStatus() {
    chrome.runtime.sendMessage({ type: 'GET_FULL_STATUS' }, (status) => {
      if (!status || status.error) {
        showStatusView();
        return;
      }

      if (!status.authenticated) {
        showLoginView();
        return;
      }

      if (!status.linkedinOpen) {
        showNoLinkedinView();
        return;
      }

      showStatusView();
      loadScheduleFromBackground();

      const safety = status.safety || {};
      const counters = safety.counters || {};
      const limits = safety.limits || {};

      // Status indicator
      if (status.isPaused) {
        statusDot.className = 'dot dot-yellow';
        statusText.textContent = 'Paused';
        pauseBtn.textContent = 'Resume Automation';
      } else if (status.cooldown) {
        statusDot.className = 'dot dot-red';
        statusText.textContent = 'Cooldown active';
      } else if (!safety.isActive) {
        statusDot.className = 'dot dot-gold';
        const nextWindow = safety.nextActiveWindow ? new Date(safety.nextActiveWindow) : null;
        if (nextWindow) {
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const day = dayNames[nextWindow.getDay()];
          const hour = nextWindow.getHours();
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;
          statusText.textContent = `Warmup running · Messaging resumes ${day} ${displayHour}:00 ${ampm}`;
        } else {
          statusText.textContent = 'Warmup running · Messaging paused';
        }
        pauseBtn.textContent = 'Pause Automation';
      } else {
        statusDot.className = 'dot dot-green';
        statusText.textContent = 'Active · All actions running';
        pauseBtn.textContent = 'Pause Automation';
      }

      // Passive action counters
      if (statVisits) statVisits.textContent = counters.visits || 0;
      if (statFollows) statFollows.textContent = counters.follows || 0;
      if (statLikes) statLikes.textContent = counters.likes || 0;

      // Messaging counters
      statConnections.textContent = `${counters.connections || 0} / ${limits.connections || 40}`;
      statMessages.textContent = `${counters.messages || 0} / ${limits.messages || 100}`;
      if (statFollowups) statFollowups.textContent = counters.followups || 0;

      // Queue
      statQueue.textContent = `${status.queueCount || 0} pending`;

      // Last action
      if (status.lastAction) {
        const ago = getTimeAgo(new Date(status.lastAction.completedAt));
        const actionLabels = {
          visit_profile: '👁 Visit',
          follow_profile: '➕ Follow',
          like_post: '👍 Like',
          send_connection_request: '🤝 Connect',
          send_dm: '💬 DM',
          send_followup: '📨 Follow-up',
        };
        const label = actionLabels[status.lastAction.type] || status.lastAction.type;
        statLastAction.textContent = `${label} (${ago})`;
      } else {
        statLastAction.textContent = '-';
      }

      // Warm-up banner
      if (safety.isWarmup && warmupBanner) {
        warmupBanner.textContent = `⚡ Warm-up: ${safety.warmupDaysLeft} days left (30% capacity)`;
        warmupBanner.classList.remove('hidden');
      } else if (warmupBanner) {
        warmupBanner.classList.add('hidden');
      }

      // Cooldown banner
      if (status.cooldown && cooldownBanner) {
        cooldownBanner.textContent = `⛔ Paused: ${status.cooldown.reason}`;
        cooldownBanner.classList.remove('hidden');
      } else if (cooldownBanner) {
        cooldownBanner.classList.add('hidden');
      }
    });
  }

  function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
});
