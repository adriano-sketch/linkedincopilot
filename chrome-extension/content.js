// Prevent double injection — guard MUST wrap the message listener too,
// otherwise each injection adds another listener causing duplicate execution
if (window.__linkedinCopilotLoaded) {
  console.log('[Olanovo] Content script already loaded, skipping');
  // STOP HERE — do not register another message listener
} else {
  window.__linkedinCopilotLoaded = true;
  console.log('[Olanovo] Content script loaded');

  // Listen for action requests from background (registered ONCE only)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
      sendResponse({ pong: true });
      return;
    }
    if (message.type === 'EXECUTE_ACTION') {
      handleAction(message.action)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Keep channel open for async response
    }
  });
}

async function handleAction(action) {
  console.log(`[Olanovo] Executing: ${action.action_type}`);

  // Wait for page to be ready
  await waitForLinkedInReady();

  switch (action.action_type) {
    case 'visit_profile':
      return await visitProfile();
    case 'follow_profile':
      return await followProfile();
    case 'send_connection_request':
      return await sendConnectionRequest(action.message_text);
    case 'check_connection_status':
      return await checkConnectionStatus();

    // ── Growth Mode Actions ──
    case 'find_latest_post':
      return await findLatestPost(action.expected_name, { like: action.like === true });
    case 'like_post':
      return await likePost(action.post_url);
    case 'post_comment':
      // Comments are posted by the person on LinkedIn, never by this extension.
      throw new Error('COMMENT_NOT_AUTOMATED: comments are posted by the person');

    default:
      throw new Error(`Unknown action: ${action.action_type}`);
  }
}

// ══════════════════════════════════════════════
// VISIT PROFILE
// ══════════════════════════════════════════════
async function visitProfile() {
  // We're already on the profile page (background navigated us here)
  // Just simulate human browsing behavior

  // Wait a moment
  await sleep(1000 + Math.random() * 2000);

  // Scroll down to simulate reading the profile
  await simulateProfileBrowsing();

  return { success: true, action: 'visit_profile' };
}


// ══════════════════════════════════════════════
// FOLLOW PROFILE
// ══════════════════════════════════════════════
async function followProfile() {
  await sleep(1000 + Math.random() * 2000);
  window.scrollBy(0, 200 + Math.random() * 300);
  await sleep(500 + Math.random() * 1000);

  const allButtons = Array.from(document.querySelectorAll('button'));
  const followButton = allButtons.find(btn => {
    const text = (btn.textContent || '').trim().toLowerCase();
    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    return (text === 'follow' || ariaLabel.includes('follow')) &&
           !text.includes('following') && !text.includes('unfollow') &&
           !ariaLabel.includes('following') && !ariaLabel.includes('unfollow');
  });

  if (followButton) {
    followButton.click();
    console.log('[Olanovo] Clicked Follow button');
    await sleep(1000 + Math.random() * 1000);
    return { success: true, action: 'follow_profile', followed: true };
  }

  console.log('[Olanovo] Follow button not found — may already be following');
  return { success: true, action: 'follow_profile', followed: false, note: 'already_following_or_not_found' };
}

// ══════════════════════════════════════════════
// SEND CONNECTION REQUEST
// ══════════════════════════════════════════════
async function sendConnectionRequest(noteText) {
  await sleep(1000 + Math.random() * 1500);

  // Safety: truncate note if too long (max 200 chars)
  if (noteText && noteText.length > 200) {
    noteText = noteText.substring(0, 197) + '...';
  }

  // ── STEP 1: Check if custom-invite dialog is already open (navigated directly) ──
  let dialogAlreadyOpen = !!document.querySelector('dialog, div[role="dialog"]');
  const isCustomInvitePage = window.location.pathname.includes('/preload/custom-invite');

  if (!dialogAlreadyOpen || !isCustomInvitePage) {
    // ── STEP 1b: Find the Connect button/link on the profile page ──
    const connectButton = await findConnectButton();

    if (!connectButton) {
      // Check if we're already connected (LinkedIn 2026: Message can be a button OR a link)
      const messageElement = document.querySelector('button[aria-label*="Message" i]') ||
        document.querySelector('a[aria-label*="Message" i]') ||
        document.querySelector('a[href*="/messaging/compose/"]');
      if (messageElement) {
        // A Message button alone does not mean "connected": 2nd and 3rd-degree profiles show one too.
        // Only the "1st" badge next to the name does.
        const first = lcFirstDegreeBadgeOfProfile();
        return { success: true, action: 'send_connection_request', note: first ? 'already_connected' : 'connect_unavailable' };
      }

      // Check if connection request is already pending (LinkedIn 2026: Pending can be a button OR a link)
      const pendingElement = document.querySelector('button[aria-label*="Pending" i]') ||
        document.querySelector('a[aria-label*="Pending" i]') ||
        Array.from(document.querySelectorAll('a, button, span')).find(el => {
          const text = (el.textContent || '').trim().toLowerCase();
          return text.includes('pending') && text.includes('withdraw');
        });
      if (pendingElement) {
        return { success: true, action: 'send_connection_request', note: 'already_pending' };
      }

      throw new Error('Connect button not found on profile page ' + lcConnectDiag());
    }

    // If it's a <a> link (new LinkedIn 2026 layout), signal background.js to navigate
    if (connectButton.tagName === 'A' && connectButton.href && connectButton.href.includes('custom-invite')) {
      return { success: false, action: 'send_connection_request', redirect: connectButton.href, note: 'custom_invite_redirect' };
    }

    connectButton.click();
    await sleep(1500 + Math.random() * 1000);

    // ── STEP 2: Handle "How do you know" modal ──
    const howDoYouKnowModal = document.querySelector('dialog, div[role="dialog"]');
    if (howDoYouKnowModal) {
      const otherButton = howDoYouKnowModal.querySelector('button[aria-label*="Other" i]');
      if (otherButton) {
        otherButton.click();
        await sleep(800 + Math.random() * 500);
      }

      const connectInsideModal = howDoYouKnowModal.querySelector('button[aria-label*="Connect" i]');
      if (connectInsideModal) {
        connectInsideModal.click();
        await sleep(800 + Math.random() * 500);
      }
    }
  }

  // ── STEP 3: Find and click "Add a note" ──
  if (noteText && noteText.trim().length > 0) {
    const addNoteButton = await findAddNoteButton();

    if (addNoteButton) {
      addNoteButton.click();
      await sleep(800 + Math.random() * 500);

      // ── STEP 4: Find the note textarea and type the message ──
      const noteInput = await findNoteInput();

      if (noteInput) {
        noteInput.focus();
        noteInput.value = '';
        noteInput.textContent = '';
        noteInput.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);

        // Use robust insertion for the note (LinkedIn React overwrites char-by-char typing)
        const inserted = await typeNoteRobust(noteInput, noteText);
        await sleep(500 + Math.random() * 500);

        if (!inserted) {
          console.warn('[Olanovo] Note insertion incomplete. Retrying with fallback.');
          const retried = await retryNoteInsertion(noteInput, noteText);
          if (!retried) {
            throw new Error('Connection note could not be fully inserted');
          }
        }

        const typedValue = (noteInput.value || noteInput.textContent || '').trim();
        const expectedValue = noteText.trim();
        if (typedValue.length < expectedValue.length * 0.95) {
          throw new Error(`Connection note truncated (${typedValue.length}/${expectedValue.length})`);
        }

        // Dispatch extra events to ensure LinkedIn's Ember.js detects the input change
        // and enables the Send button (Ember binds on focusout/blur, not just input)
        noteInput.dispatchEvent(new Event('focusin', { bubbles: true }));
        noteInput.dispatchEvent(new Event('focusout', { bubbles: true }));
        noteInput.dispatchEvent(new Event('blur', { bubbles: true }));
        noteInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(300);
        console.log('[Olanovo] Note typed and events dispatched ✅');
      } else {
        console.warn('[Olanovo] Note input not found, sending without note');
      }
    } else {
      // Diagnostic: log dialog buttons to help debug selector issues
      const diag = document.querySelector('dialog, div[role="dialog"]');
      if (diag) {
        const btns = Array.from(diag.querySelectorAll('button')).map(b => ({
          text: b.textContent.trim().substring(0, 60),
          ariaLabel: b.getAttribute('aria-label'),
          classes: b.className.substring(0, 80),
        }));
        console.warn('[Olanovo] Add a note button not found. Dialog buttons:', JSON.stringify(btns));
      } else {
        console.warn('[Olanovo] Add a note button not found — no dialog present');
      }
    }
  }

  // ── STEP 5: Click Send ──
  await sleep(500 + Math.random() * 800);

  const sendButton = await findSendButton();
  if (!sendButton) {
    throw new Error('Send/Submit button not found in connection dialog');
  }

  sendButton.click();
  await sleep(2000 + Math.random() * 1000);

  // ── STEP 6: Verify — check if the dialog closed and button changed ──
  const dialogStillOpen = document.querySelector('dialog, div[role="dialog"]');
  if (dialogStillOpen) {
    const errorMsg = dialogStillOpen.querySelector('.artdeco-inline-feedback__message');
    if (errorMsg) {
      const errText = errorMsg.textContent.trim();
      if (isLimitError(errText)) {
        throw new Error(`LINKEDIN_LIMIT: ${errText}`);
      }
      throw new Error(`LinkedIn error: ${errText}`);
    }
    const dialogText = dialogStillOpen.textContent.toLowerCase();
    if (isLimitError(dialogText)) {
      throw new Error('LINKEDIN_LIMIT: Connection request limit reached');
    }
  }

  // Also check for page-level limit banners (LinkedIn sometimes shows them outside dialogs)
  const pageLimitBanner = detectLinkedInLimitBanner();
  if (pageLimitBanner) {
    console.warn('[Olanovo] LinkedIn limit banner detected:', pageLimitBanner);
    // Connection was likely sent, but flag the limit for the queue to pause
    return { success: true, action: 'send_connection_request', note: 'sent_with_note', limitWarning: pageLimitBanner };
  }

  return { success: true, action: 'send_connection_request', note: noteText ? 'sent_with_note' : 'sent_without_note' };
}


// ══════════════════════════════════════════════
// CHECK CONNECTION STATUS
// ══════════════════════════════════════════════
async function checkConnectionStatus() {
  await sleep(1000 + Math.random() * 1000);

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const profileNameEl = document.querySelector('main h1') || document.querySelector('main h2');
  if (!profileNameEl) {
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_heading_found', confidence: 'weak' };
  }
  const profileSection = profileNameEl.closest('section, .artdeco-card, [data-view-name]') || profileNameEl.parentElement?.parentElement;
  if (!profileSection) {
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_profile_section', confidence: 'weak' };
  }

  const profileButtons = [...profileSection.querySelectorAll('button, a[role="button"], a[href*="messaging"]')];
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

  // ── Degree badge detection (strict) ──
  // Only match "1st" in SHORT text elements (≤ 12 chars) — the actual badge is tiny
  // (e.g., "1st", "· 1st", "1st degree", "1º grau"). This avoids false positives
  // from longer text like "Endorsed by 1st-degree connections" or "1st to react".
  const allTextEls = [...profileSection.querySelectorAll('span, li, div')];
  const shortTexts = allTextEls
    .map((el) => normalize(el.textContent || ''))
    .filter((txt) => txt && txt.length <= 12);
  const shortBlob = shortTexts.join(' | ');
  const hasFirstDegree = /(\b1st\b|\b1º\b|\b1er\b|\b1\.? grau\b|\b1\.? grado\b|\b1\.? degree\b)/i.test(shortBlob);

  // Also check for NON-first degree badges — if found, definitely NOT connected
  const allTexts = allTextEls
    .map((el) => normalize(el.textContent || ''))
    .filter((txt) => txt && txt.length <= 20);
  const allBlob = allTexts.join(' | ');
  const hasNonFirstDegree = /(\b2nd\b|\b3rd\b|\b2º\b|\b3º\b|\b2e\b|\b3e\b|\b2\.? grau\b|\b3\.? grau\b)/i.test(allBlob);

  // If a 2nd/3rd degree badge is found, this person is definitively NOT a 1st-degree connection
  if (hasNonFirstDegree) {
    const msgAvail = hasAction(MESSAGE);
    return { success: true, action: 'check_connection_status', is_connected: false, note: msgAvail ? 'non_first_degree_with_message' : 'non_first_degree_badge', confidence: 'strong',
      debug: { url: window.location.href, profileName: normalize(profileNameEl.textContent), buttonsFound: profileButtons.length, buttonTexts: buttonData.map(b => b.text).slice(0, 6), hasFirstDegree, hasNonFirstDegree, shortBlobSample: shortBlob.substring(0, 100), profileSectionTag: profileSection.tagName, profileSectionClass: profileSection.className }
    };
  }

  if (hasAction(PENDING)) {
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'pending', confidence: 'weak' };
  }
  if (hasAction(CONNECT, ['disconnect', 'remover', 'remove'])) {
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'connect_available', confidence: 'weak' };
  }
  if (hasAction(CONNECTED)) {
    return { success: true, action: 'check_connection_status', is_connected: true, note: 'connected_label', confidence: 'strong' };
  }
  if (hasAction(REMOVE)) {
    return { success: true, action: 'check_connection_status', is_connected: true, note: 'remove_connection', confidence: 'strong' };
  }
  if (hasAction(MESSAGE)) {
    if (hasFirstDegree) {
      // Extra guard: if we found multiple "message" buttons, one might be InMail
      const msgButtonCount = buttonData.filter(b => b.text === 'message' || b.text === 'mensagem' || b.text === 'mensaje').length;
      if (msgButtonCount >= 2) {
        // Suspicious: likely has both InMail "Message" and regular actions — downgrade confidence
        return { success: true, action: 'check_connection_status', is_connected: true, note: 'message_button_1st_multi', confidence: 'medium',
          debug: { url: window.location.href, profileName: normalize(profileNameEl.textContent), buttonsFound: profileButtons.length, buttonTexts: buttonData.map(b => b.text).slice(0, 6), hasFirstDegree, hasNonFirstDegree, msgButtonCount, shortBlobSample: shortBlob.substring(0, 100), profileSectionTag: profileSection.tagName, profileSectionClass: profileSection.className }
        };
      }
      return { success: true, action: 'check_connection_status', is_connected: true, note: 'message_button_1st', confidence: 'strong',
        debug: { url: window.location.href, profileName: normalize(profileNameEl.textContent), buttonsFound: profileButtons.length, buttonTexts: buttonData.map(b => b.text).slice(0, 6), hasFirstDegree, hasNonFirstDegree, shortBlobSample: shortBlob.substring(0, 100), profileSectionTag: profileSection.tagName, profileSectionClass: profileSection.className }
      };
    }
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'message_without_1st', confidence: 'weak' };
  }

  const msgLinks = profileSection.querySelectorAll('a[href*="messaging"]');
  if (msgLinks.length > 0) {
    if (hasFirstDegree) {
      return { success: true, action: 'check_connection_status', is_connected: true, note: 'message_link_1st', confidence: 'strong' };
    }
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'message_link_without_1st', confidence: 'weak' };
  }

  if (hasFirstDegree) {
    return { success: true, action: 'check_connection_status', is_connected: true, note: 'first_degree_badge', confidence: 'strong' };
  }

  return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_top_card_buttons', confidence: 'weak' };
}


// ══════════════════════════════════════════════
// GROWTH MODE — FIND LATEST POST
// ──────────────────────────────────────────────
// Navigates to the "recent activity" / posts section of a profile
// and extracts the most recent post's URL and text content.
// ══════════════════════════════════════════════
// Only the person's OWN posts from the last GROWTH_MAX_POST_AGE_DAYS count: liking and commenting on
// a months-old post, or on something they merely reposted, reads as automation, not as attention.
const GROWTH_MAX_POST_AGE_DAYS = 10;

// Age of a post in days from LinkedIn's relative label ("2w", "3mo", "1yr", "5d", "3h", "2 sem", "3 m",
// "1 a", "2 weeks ago", "há 3 meses"...). Returns null when no label is recognised.
function parsePostAgeDays(label, pageLang) {
  const t = (label || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // Long forms first (visually-hidden text, tooltips): "3 weeks ago", "há 2 meses"
  let m = t.match(/(\d+)\s*(minutes?|minutos?|hours?|horas?|days?|dias?|weeks?|semanas?|months?|meses|mês|years?|anos?)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    const u = m[2];
    if (/^minut/.test(u)) return n / 1440;
    if (/^(hour|hora)/.test(u)) return n / 24;
    if (/^(day|dia)/.test(u)) return n;
    if (/^(week|semana)/.test(u)) return n * 7;
    if (/^(month|mes|mês)/.test(u)) return n * 30;
    return n * 365;
  }
  // Compact forms: "5m" (en: minutes) / "5 m" (pt: months), "3h", "2d", "1w", "2 sem", "3mo", "1yr", "1 a"
  m = t.match(/(^|[\s•·|])(\d+)\s*(min|mo|yr|sem|h|d|w|m|a)(?![a-z])/);
  if (!m) return null;
  const n = parseInt(m[2], 10);
  const u = m[3];
  const pt = /^pt/i.test(pageLang || '');
  switch (u) {
    case 'min': return n / 1440;
    case 'h': return n / 24;
    case 'd': return n;
    case 'w': case 'sem': return n * 7;
    case 'mo': return n * 30;
    case 'yr': return n * 365;
    case 'a': return pt ? n * 365 : null;
    case 'm': return pt ? n * 30 : n / 1440;
  }
  return null;
}

// ── Activity page cards (works on the 2026 layout, which has no stable class names or data-urn) ──
// A card is found from its relative-time label ("19h", "5d • Edited", "2 sem"): the label's
// ancestor that holds exactly one such label is the post card. Old layouts are read with the
// previous selectors. Each card yields: element, actor name, repost flag, age label, body text,
// permalink (only an own-post /feed/update/urn:li:activity: link counts; ugcPost links inside a
// card belong to embedded/shared media) and a text fingerprint used to find the card again later.
// Since Nov 2026 the label span also holds a visibility icon and ends with a bullet ("1w • Edited •"),
// so the label is read from the span's own text nodes and a trailing bullet is allowed.
const LC_AGE_LABEL_RE = /^(\d+)\s?(min|h|d|w|mo|yr|m|sem|a)(\s*[•·]\s*(edited|editado|modifié|editada))?\s*[•·]?$/i;
function lcOwnText(el) {
  let t = '';
  for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
  return t.replace(/\s+/g, ' ').trim();
}
// A span is an age label when its own text is one and no child span carries text of its own.
function lcIsAgeSpan(s) {
  if (!LC_AGE_LABEL_RE.test(lcOwnText(s))) return false;
  for (const c of s.querySelectorAll('span')) if (c.textContent.trim()) return false;
  return true;
}
const LC_CARD_HEADER_RE = /^(feed post|publicação( do| no)? feed|post)$/i;
const LC_REPOST_RE = /reposted|republicou|compartilhou (isso|esta|este)|shared this|ha compartido|a republié|a partagé/i;
const LC_ACTION_LINE_RE = /^(like|comment|repost|send|share|gostei|comentar|compartilhar|enviar|reagir|…\s*more|…\s*ver mais|\d[\d,.]*\s*(reactions?|comments?|reposts?|reações|comentários|compartilhamentos)|.*\band \d+ others?$|.*\be mais \d+ (outras? )?pessoas?$|activate to view larger image|play video|video player is loading\.?)$/i;

function lcFingerprint(text) {
  return (text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 80);
}

function lcCollectActivityCards() {
  const main = document.querySelector('main') || document.body;
  const cards = [];
  const ageSpansIn = (root) => Array.from(root.querySelectorAll('span')).filter(lcIsAgeSpan);

  // Old layout
  const oldSel = '.feed-shared-update-v2, [data-urn*="activity"], .profile-creator-shared-feed-update__container, .occludable-update';
  const oldEls = Array.from(main.querySelectorAll(oldSel));
  if (oldEls.length) {
    for (const el of oldEls) {
      const header = el.querySelector('.update-components-header, .feed-shared-header');
      const actor = el.querySelector('.update-components-actor__name, .feed-shared-actor__name, .update-components-actor__title');
      const sub = el.querySelector('.update-components-actor__sub-description, .feed-shared-actor__sub-description, .update-components-actor__description');
      const textEl = el.querySelector('.feed-shared-text, .break-words, .update-components-text');
      const link = el.querySelector('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
      const urnEl = el.closest('[data-urn]') || el.querySelector('[data-urn]');
      const urn = urnEl ? urnEl.getAttribute('data-urn') : null;
      const text = textEl ? textEl.textContent.trim() : '';
      cards.push({
        el,
        actor: actor ? actor.textContent.replace(/\s+/g, ' ').trim() : '',
        isRepost: LC_REPOST_RE.test(header ? header.textContent : ''),
        ageLabel: sub ? (sub.textContent.match(/\d+\s?(min|h|d|w|mo|yr|m|sem|a)\b/i) || [''])[0] : '',
        text,
        permalink: link ? link.href.split('?')[0] : (urn && /urn:li:activity:/.test(urn) ? `https://www.linkedin.com/feed/update/${urn}` : null),
        fingerprint: lcFingerprint(text),
      });
    }
    return cards;
  }

  // 2026 layout
  const ageSpans = ageSpansIn(main);
  const seenEls = new Set();
  for (const span of ageSpans) {
    let el = span;
    let card = span;
    while (el && el !== main) {
      const n = ageSpansIn(el).length;
      if (n > 1) break;
      card = el;
      el = el.parentElement;
    }
    if (card === span || seenEls.has(card)) continue;
    seenEls.add(card);
    const lines = card.innerText.replace(/[ \t]+/g, ' ').split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const hIdx = lines.findIndex((l) => LC_CARD_HEADER_RE.test(l));
    const before = lines.slice(0, Math.max(hIdx, 0)).join(' ');
    const ageLabel = lcOwnText(span).replace(/\s*[•·]\s*$/, '');
    // The rendered line can carry the trailing bullet or the "Follow" button next to the label.
    const ageIdx = lines.findIndex((l) => l === ageLabel || l.startsWith(ageLabel + ' •') || l.startsWith(ageLabel + ' ·'));
    // "<Name> reposted this" can sit above the header or right below it, as the first line of the
    // actor block: look at everything before the age label, not only at what precedes the header.
    const headEnd = ageIdx >= 0 ? ageIdx : Math.max(hIdx, 0) + 3;
    const isRepost = LC_REPOST_RE.test(before) || LC_REPOST_RE.test(lines.slice(0, headEnd).join(' '));
    const actorLine = hIdx >= 0 ? (lines[hIdx + 1] || '') : (lines[0] || '');
    const actor = actorLine.split(/\s[•·]\s/)[0].trim();
    let body = lines.slice(ageIdx + 1).filter((l) => !/^(follow|following|seguir|seguindo|\+ ?follow)$/i.test(l));
    // "Show translation" closes the text; what follows is the link preview and the counters.
    const cut = body.findIndex((l) => LC_ACTION_LINE_RE.test(l) || /^(show translation|see translation|ver tradução|mostrar tradução)$/i.test(l));
    if (cut >= 0) body = body.slice(0, cut);
    const text = body.join('\n').replace(/\s*(…\s*more|…\s*ver mais|\.\.\.\s*more)$/i, '').trim();
    const link = card.querySelector('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
    cards.push({
      el: card, actor, isRepost, ageLabel, text,
      permalink: link ? link.href.split('?')[0] : null,
      fingerprint: lcFingerprint(text),
    });
  }
  return cards;
}

// Find the card a growth action refers to. post_url either is a real permalink (then the page IS the
// post and the first card is it) or an activity-page URL with #lcpost=<fingerprint> (then the card
// with that fingerprint is searched, scrolling the page a few times if needed).
async function lcFindTargetCard(postUrl) {
  const hashMatch = String(postUrl || window.location.href).match(/#lcpost=([^&]+)/);
  const wanted = hashMatch ? decodeURIComponent(hashMatch[1]) : null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const cards = lcCollectActivityCards();
    if (!wanted) {
      if (cards.length) return cards[0];
    } else {
      const hit = cards.find((c) => c.fingerprint && (c.fingerprint === wanted || c.fingerprint.startsWith(wanted.slice(0, 40)) || wanted.startsWith(c.fingerprint.slice(0, 40))));
      if (hit) return hit;
    }
    window.scrollBy(0, 700);
    await sleep(1200 + Math.random() * 600);
  }
  return null;
}

// The reaction button of one activity card (2026 layout). Used by find_latest_post (like in the same
// visit) and by like_post. Returns { liked, confirmed, note }.
async function lcReactOnCard(cardEl) {
  const stateBtn = Array.from(cardEl.querySelectorAll('button[aria-label*="Reaction button state" i], button[aria-label*="Estado do botão de reação" i]'))
    .find((b) => b.offsetParent !== null);
  if (!stateBtn) return { liked: false, confirmed: false, note: 'reaction_button_not_found' };
  const noReaction = (b) => /no reaction|sem reação|nenhuma reação/.test((b.getAttribute('aria-label') || '').toLowerCase());
  if (!noReaction(stateBtn)) return { liked: false, confirmed: false, note: 'already_reacted' };
  stateBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(600 + Math.random() * 600);
  stateBtn.click();
  await sleep(1500 + Math.random() * 1000);
  return { liked: true, confirmed: !noReaction(stateBtn), note: null };
}

async function findLatestPost(expectedName, opts = {}) {
  // The background script opens /in/<slug>/recent-activity/all/ before calling this. This function
  // must not navigate: a page load would kill this script before it can answer.
  const currentPath = window.location.pathname;
  const vanityMatch = currentPath.match(/^\/in\/([^/]+)/);
  const vanityName = vanityMatch ? vanityMatch[1] : null;
  if (!vanityName) {
    throw new Error(`WRONG_PAGE: findLatestPost requires /in/... but got ${currentPath}`);
  }
  if (!/\/recent-activity\//.test(currentPath)) {
    throw new Error(`WRONG_PAGE: findLatestPost requires the activity page but got ${currentPath}`);
  }

  // Whose activity this is, to tell their own posts from reposts: the lead's stored name, or
  // what the page says when that is missing.
  let profileName = (expectedName || '').replace(/\s+/g, ' ').trim() || null;
  if (!profileName) {
    const h1 = document.querySelector('main h1, h1');
    profileName = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : null;
  }

  await sleep(1000 + Math.random() * 1500);
  await waitForLinkedInReady();

  // Now we should be on the activity page — read the cards (newest first). The list can load
  // late, so wait for it instead of reading once.
  let cards = [];
  for (let i = 0; i < 10 && cards.length === 0; i++) {
    await sleep(1500);
    cards = lcCollectActivityCards();
    if (cards.length === 0 && i === 2) window.scrollBy(0, 400);
  }

  if (cards.length === 0) {
    const mainEl = document.querySelector('main') || document.body;
    const emptyPage = /nothing to see for now|no posts yet|nada para ver|ainda não publicou|hasn.t posted|não publicou/i.test(mainEl.innerText || '');
    const hidden = document.visibilityState !== 'visible';
    return {
      success: true,
      action: 'find_latest_post',
      found: false,
      note: emptyPage ? 'no_posts_found' : hidden ? 'page_not_visible' : 'cards_not_recognized',
      url: window.location.href,
      // What the page looked like, so an unreadable page can be told apart from an empty one.
      diag: {
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        main_chars: (mainEl.innerText || '').length,
        feed_nodes: mainEl.querySelectorAll('[class*="feed-shared"], [class*="update-components"]').length,
        placeholders: mainEl.querySelectorAll('[class*="skeleton"], [class*="ghost"], [class*="loader"]').length,
      },
    };
  }

  // Keep the first card that is the person's OWN post and recent enough. Reposts and old posts
  // are skipped: liking or commenting on them reads as automation, not as attention.
  const pageLang = document.documentElement.lang || '';
  const normName = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
  const profileKey = normName(profileName);
  let chosen = null;
  let postAgeDays = null;
  let newestAgeDays = null;
  const skipped = [];
  for (const card of cards.slice(0, 8)) {
    const actorKey = normName(card.actor);
    // Names come with suffixes (", PE, PMP") and screen-reader copies: compare by prefix.
    // The stored name can be the full legal name while LinkedIn shows a shorter one: the same
    // first name also counts as the same person.
    const sameFirst = profileKey.split(' ')[0].length >= 2 && profileKey.split(' ')[0] === actorKey.split(' ')[0];
    const byOther = profileKey && actorKey && !sameFirst &&
      !actorKey.startsWith(profileKey.slice(0, Math.min(profileKey.length, 12))) &&
      !profileKey.startsWith(actorKey.slice(0, Math.min(actorKey.length, 12)));
    const ageDays = parsePostAgeDays(card.ageLabel, pageLang);
    if (ageDays != null && (newestAgeDays == null || ageDays < newestAgeDays)) newestAgeDays = ageDays;
    if (card.isRepost || byOther) { skipped.push(card.isRepost ? 'repost' : 'other_author'); continue; }
    if (ageDays != null && ageDays > GROWTH_MAX_POST_AGE_DAYS) { skipped.push(`old:${Math.round(ageDays)}d`); continue; }
    if (!card.text || card.text.length < 20) { skipped.push('no_text'); continue; }
    chosen = card;
    postAgeDays = ageDays;
    break;
  }

  if (!chosen) {
    return {
      success: true,
      action: 'find_latest_post',
      found: false,
      note: newestAgeDays != null && newestAgeDays > GROWTH_MAX_POST_AGE_DAYS ? 'no_recent_posts' : 'no_own_posts',
      newest_post_age_days: newestAgeDays != null ? Math.round(newestAgeDays) : null,
      skipped,
      url: window.location.href,
    };
  }

  // Expand "…more" so the comment is written from the whole text (harmless if it is not there)
  const moreBtn = Array.from(chosen.el.querySelectorAll('button')).find((b) => /^(…\s*more|…\s*ver mais|\.\.\.\s*more|see more|ver mais)$/i.test(b.textContent.trim()));
  if (moreBtn) {
    moreBtn.click();
    await sleep(800 + Math.random() * 500);
    const refreshed = lcCollectActivityCards().find((c) => c.el === chosen.el);
    if (refreshed && refreshed.text.length > chosen.text.length) chosen = refreshed;
  }

  // Post URL: a real permalink when the card has one; otherwise the activity page plus the card's
  // fingerprint, which like_post / post_comment use to find the same card again.
  const postUrl = chosen.permalink ||
    `https://www.linkedin.com/in/${vanityName}/recent-activity/all/#lcpost=${encodeURIComponent(chosen.fingerprint)}`;

  console.log(`[Olanovo] Found latest post: ${postUrl}, author: ${chosen.actor}, age: ${chosen.ageLabel}, text: ${chosen.text.substring(0, 80)}...`);

  // Like it in this same visit, after the time it takes to read it: one page per contact instead
  // of coming back to the same page later just to click Like.
  let like = null;
  if (opts.like) {
    chosen.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(2500 + Math.random() * 3500);
    try {
      like = await lcReactOnCard(chosen.el);
    } catch (e) {
      like = { liked: false, confirmed: false, note: 'like_failed: ' + (e && e.message ? e.message : e) };
    }
    console.log('[Olanovo] Like in the same visit:', JSON.stringify(like));
  }

  return {
    success: true,
    action: 'find_latest_post',
    found: true,
    post_url: postUrl,
    post_content: chosen.text.substring(0, 1500),
    post_author: chosen.actor || null,
    post_age_days: postAgeDays != null ? Math.round(postAgeDays * 10) / 10 : null,
    post_age_label: chosen.ageLabel || null,
    skipped_before: skipped,
    note: chosen.permalink ? 'post_found' : 'post_found_by_fingerprint',
    ...(like ? { liked: like.liked, like_confirmed: like.confirmed, like_note: like.note } : {}),
  };
}

// ══════════════════════════════════════════════
// GROWTH MODE — LIKE POST
// ──────────────────────────────────────────────
// Likes the most recent visible post on the current page.
// Can be called on a profile activity page or on a specific post URL.
// ══════════════════════════════════════════════
async function likePost(postUrl) {
  await sleep(1000 + Math.random() * 1500);

  // On a post page the whole document is the post. On an activity page the target is the card
  // find_latest_post chose (by fingerprint in the URL hash), never blindly the first card.
  let targetPost = document;
  if (!window.location.href.includes('/feed/update/') && !/\/posts\//.test(window.location.pathname)) {
    const card = await lcFindTargetCard(postUrl);
    if (!card) {
      return { success: true, action: 'like_post', liked: false, note: 'post_not_found_on_activity_page', url: window.location.href };
    }
    targetPost = card.el;
    card.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(800 + Math.random() * 600);
  }

  // 2026 layout: one reaction button per card, labelled "Reaction button state: <state>"
  const reaction = await lcReactOnCard(targetPost);
  if (reaction.note !== 'reaction_button_not_found') {
    console.log(`[Olanovo] Like post result (reaction button): ${JSON.stringify(reaction)}`);
    return { success: true, action: 'like_post', liked: reaction.liked, confirmed: reaction.confirmed, ...(reaction.note ? { note: reaction.note } : {}), url: window.location.href };
  }

  // Find the Like button — LinkedIn uses various structures
  const likeSelectors = [
    'button[aria-label*="Like" i]:not([aria-label*="Unlike" i])',
    'button[aria-label*="Gostei" i]:not([aria-label*="Descurtir" i])',
    'button[aria-label*="Me gusta" i]',
    'button[aria-label*="J\'aime" i]',
    'button.react-button:not(.react-button--active)',
    'button[data-reaction-type] span.react-button__text',
  ];

  let likeBtn = null;
  for (const sel of likeSelectors) {
    const candidates = targetPost.querySelectorAll(sel);
    for (const btn of candidates) {
      if (btn.offsetParent === null) continue; // Skip hidden
      // Check it's not already liked (active state)
      const isActive = btn.classList.contains('react-button--active') ||
                       btn.getAttribute('aria-pressed') === 'true';
      if (!isActive) {
        likeBtn = btn;
        break;
      }
    }
    if (likeBtn) break;
  }

  // Fallback: find any reaction button that's not active
  if (!likeBtn) {
    const allButtons = targetPost.querySelectorAll('button');
    for (const btn of allButtons) {
      if (btn.offsetParent === null) continue;
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      const text = (btn.textContent || '').toLowerCase().trim();
      if ((label.includes('like') || label.includes('gost') || text === 'like' || text === 'gostei') &&
          !label.includes('unlike') && !label.includes('descurtir') &&
          btn.getAttribute('aria-pressed') !== 'true') {
        likeBtn = btn;
        break;
      }
    }
  }

  if (!likeBtn) {
    // Already liked or button not found
    return {
      success: true,
      action: 'like_post',
      liked: false,
      note: 'like_button_not_found_or_already_liked',
      url: window.location.href,
    };
  }

  // Scroll the button into view and click
  likeBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500 + Math.random() * 500);

  likeBtn.click();
  await sleep(1500 + Math.random() * 1000);

  // Verify it was liked (button should now be active)
  const isNowActive = likeBtn.classList.contains('react-button--active') ||
                      likeBtn.getAttribute('aria-pressed') === 'true';

  console.log(`[Olanovo] Like post result: ${isNowActive ? 'liked' : 'uncertain'}`);

  return {
    success: true,
    action: 'like_post',
    liked: true,
    confirmed: isNowActive,
    url: window.location.href,
  };
}

// ══════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════


// Wait for LinkedIn SPA to finish loading
async function waitForLinkedInReady() {
  const maxWait = 20000; // Increased from 10s to 20s for slow page loads
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const mainContent = document.querySelector('main') ||
      document.querySelector('.scaffold-layout__main') ||
      document.querySelector('[data-view-name]') ||
      document.querySelector('.scaffold-layout');
    if (mainContent) {
      // Wait for profile actions to load (key indicator page is interactive)
      const actionsReady = document.querySelector('.pvs-profile-actions') ||
        document.querySelector('.pv-top-card-v2-ctas') ||
        document.querySelector('dialog, div[role="dialog"]') ||
        document.querySelector('main button');
      if (actionsReady) {
        await sleep(1500);
        return;
      }
    }
    await sleep(500);
  }

  // Even if timeout, continue — the action handlers will fail gracefully
  console.warn('[Olanovo] Page may not be fully loaded after timeout, continuing anyway');
}

// Simulate human-like profile browsing
async function simulateProfileBrowsing() {
  const totalScroll = window.innerHeight * (1.5 + Math.random() * 1.5); // Scroll 1.5-3x viewport
  const steps = 8 + Math.floor(Math.random() * 6); // 8-14 scroll steps
  const stepSize = totalScroll / steps;

  for (let i = 0; i < steps; i++) {
    window.scrollBy({
      top: stepSize + (Math.random() * 30 - 15), // Add jitter
      behavior: 'smooth'
    });
    await sleep(300 + Math.random() * 500); // 300-800ms between scrolls
  }

  // Pause at some point (simulating reading)
  await sleep(2000 + Math.random() * 3000);

  // Scroll back up a bit
  window.scrollBy({ top: -200, behavior: 'smooth' });
  await sleep(500);
}

// ── CONNECTION REQUEST BUTTON FINDERS ──

// ── Whose button is it? ──────────────────────────────────────────────────────
// A profile page also lists other people ("People you may know"), each with its own
// "Invite <name> to connect" button. Only the control of the profile being visited counts.
function lcProfileSlug() {
  const m = window.location.pathname.match(/\/in\/([^/?#]+)/);
  if (!m) return '';
  try { return decodeURIComponent(m[1]).toLowerCase(); } catch (_) { return m[1].toLowerCase(); }
}
function lcNormName(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function lcProfileName() {
  const t = (document.title || '').replace(/^\(\d+\+?\)\s*/, '').replace(/\s*\|\s*LinkedIn\s*$/i, '');
  return lcNormName(t);
}
/**
 * Is the "1st" badge shown next to the name of the profile being visited? Looks only inside the block that
 * holds that person's name (other people on the page, such as "People also viewed", have badges too) and
 * accepts the forms LinkedIn uses in other languages, like checkConnectionStatus does.
 */
function lcFirstDegreeBadgeOfProfile() {
  const name = lcProfileName();
  const heading = Array.from(document.querySelectorAll('main h1, main h2'))
    .find(h => name && lcNormName(h.textContent) === name) || document.querySelector('main h1');
  if (!heading) return false;
  const section = heading.closest('section, .artdeco-card, [data-view-name]') ||
    (heading.parentElement && heading.parentElement.parentElement);
  if (!section) return false;
  return Array.from(section.querySelectorAll('span, li, div')).some(el => {
    if (el.children.length) return false;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    return txt.length <= 22 && /^(·\s*)?(1st|1º|1er|1\.? ?grau|1\.? ?grado|1\.? ?degree)( degree connection)?$/.test(txt);
  });
}
function lcIsOtherPersonsControl(el) {
  if (!el) return false;
  const holder = el.closest ? (el.closest('[aria-label*="to connect" i]') || el) : el;
  const label = (holder.getAttribute && holder.getAttribute('aria-label')) || '';
  const m = label.match(/^Invite\s+(.+?)\s+to connect$/i);
  if (!m) return false;
  const me = lcProfileName();
  return !!me && lcNormName(m[1]) !== me;
}
/** The invite link of the visited profile (href carries its own vanityName). Visibility is not
 *  required: the link is only used for its address. */
function lcOwnInviteLink() {
  const slug = lcProfileSlug();
  const links = Array.from(document.querySelectorAll('a[href*="custom-invite"]'));
  if (!slug) return links.find(a => a.offsetParent !== null) || null;
  return links.find(a => {
    try {
      const v = new URL(a.href, window.location.origin).searchParams.get('vanityName');
      return !!v && decodeURIComponent(v).toLowerCase() === slug;
    } catch (_) { return false; }
  }) || null;
}
function lcConnectDiag() {
  const q = sel => document.querySelectorAll(sel).length;
  return `[links=${q('a[href*="custom-invite"]')} own=${lcOwnInviteLink() ? 1 : 0} name=${lcProfileName() ? 1 : 0} ` +
    `buttons=${q('main button')} hidden=${document.hidden ? 1 : 0} ready=${document.readyState}]`;
}

async function findConnectButton() {
  // LinkedIn 2026: "Connect" is an <a> link whose address contains "custom-invite" and the
  // vanityName of the profile. The page is drawn after load (slower in a background tab), so wait
  // for it: up to 15 s, or 4 s after the top of the profile is on screen with no such link.
  const started = Date.now();
  let topSeenAt = 0;
  while (Date.now() - started < 15000) {
    const own = lcOwnInviteLink();
    if (own) return own;
    const name = lcProfileName();
    const topReady = !!name && Array.from(document.querySelectorAll('h1, h2')).some(h => lcNormName(h.textContent) === name) &&
      document.querySelectorAll('main button, main a[aria-label]').length > 3;
    if (topReady && !topSeenAt) topSeenAt = Date.now();
    if (topSeenAt && Date.now() - topSeenAt > 4000) break;
    await sleep(500);
  }

  const selectors = [
    'main button[aria-label*="connect" i]:not([aria-label*="disconnect" i])',
    'main button[aria-label*="Invite" i]',
    '.pvs-profile-actions button[aria-label*="connect" i]',
    '.pv-top-card-v2-ctas button[aria-label*="connect" i]',
    'div.artdeco-dropdown__content button[aria-label*="connect" i]',
    'button[aria-label*="connect" i][data-control-name*="connect" i]',
  ];

  for (const selector of selectors) {
    const btn = Array.from(document.querySelectorAll(selector))
      .find(b => b.offsetParent !== null && !lcIsOtherPersonsControl(b));
    if (btn) return btn;
  }

  // Fallback: look in "More actions" / "More" dropdown
  // Strategy 1: find by aria-label (legacy LinkedIn layout)
  const moreSelectors = [
    'button[aria-label*="More actions" i]',
    'button[aria-label*="More" i].artdeco-dropdown__trigger',
    '.pvs-profile-actions button[aria-label*="More" i]',
    '.pv-top-card-v2-ctas button[aria-label*="More" i]',
  ];

  // Strategy 2: find by text content (new LinkedIn layout — no aria-label)
  let moreButton = null;
  for (const moreSelector of moreSelectors) {
    const btn = document.querySelector(moreSelector);
    if (btn && btn.offsetParent !== null) { moreButton = btn; break; }
  }
  if (!moreButton) {
    const mainButtons = document.querySelectorAll('main button');
    for (const btn of mainButtons) {
      if (btn.textContent.trim() === 'More' && btn.offsetParent !== null) {
        moreButton = btn;
        break;
      }
    }
  }

  if (moreButton) {
      moreButton.click();
      await sleep(800 + Math.random() * 400);

      // Re-check for custom-invite link (may only appear in DOM after More dropdown opens)
      const customInviteAfterMore = lcOwnInviteLink();
      if (customInviteAfterMore) return customInviteAfterMore;

      // Search in all visible dropdown containers (legacy + new layout)
      const dropdowns = document.querySelectorAll('div.artdeco-dropdown__content, div.artdeco-dropdown__content--is-open, ul[role="menu"], div[role="menu"]');
      for (const dropdown of dropdowns) {
        if (!dropdown.offsetParent) continue;
        // Try aria-label match first
        const connectByLabel = Array.from(dropdown.querySelectorAll('[aria-label*="connect" i]:not([aria-label*="disconnect" i])'))
          .find(el => !lcIsOtherPersonsControl(el));
        if (connectByLabel) return connectByLabel;
        // Try text content match — search ALL descendants (div, span, li, etc.)
        const allItems = dropdown.querySelectorAll('li, li span, div[role="button"], div[role="menuitem"], span.display-flex, div.artdeco-dropdown__item, div, span');
        const connectByText = Array.from(allItems).find(
          el => {
            const txt = el.textContent.trim().toLowerCase();
            return (txt === 'connect' || txt === 'conectar') && el.children.length === 0;
          }
        );
        if (connectByText) {
          // Click the closest interactive parent or the element itself
          const clickTarget = connectByText.closest('div[role="menuitem"], li, div[role="button"], div.artdeco-dropdown__item') || connectByText;
          return clickTarget;
        }
      }

      // New LinkedIn layout (2026): dropdown items use <a role="menuitem"> with
      // inner <div aria-label="Invite ... to connect"> and <p>Connect</p>
      // Search broadly after clicking More
      const connectLink = Array.from(document.querySelectorAll('a[role="menuitem"] div[aria-label*="connect" i]:not([aria-label*="disconnect" i])'))
        .find(el => el.offsetParent !== null && !lcIsOtherPersonsControl(el));
      if (connectLink) {
        const clickTarget = connectLink.closest('a[role="menuitem"]') || connectLink;
        return clickTarget;
      }

      // Broader fallback: find any visible element with exact "Connect"/"Conectar" text
      const allLeafElements = document.querySelectorAll('p, span, div, a');
      for (const el of allLeafElements) {
        const txt = el.textContent.trim();
        if ((txt === 'Connect' || txt === 'Conectar') && el.children.length === 0 && el.offsetParent !== null) {
          // Skip main page buttons (Follow/Connect in top card)
          const isMainButton = el.closest('button[aria-label*="Follow" i], button[aria-label*="connect" i]');
          if (!isMainButton && !lcIsOtherPersonsControl(el)) {
            const clickTarget = el.closest('a[role="menuitem"], div[role="menuitem"], li, div[role="button"]') || el;
            return clickTarget;
          }
        }
      }

      // Close the dropdown if Connect not found
      moreButton.click();
      await sleep(300);
  }

  // Last resort: find by text
  const allButtons = document.querySelectorAll('main button, .pvs-profile-actions button, .pv-top-card-v2-ctas button');
  for (const btn of allButtons) {
    if (btn.textContent.trim().toLowerCase() === 'connect' && btn.offsetParent !== null && !lcIsOtherPersonsControl(btn)) {
      return btn;
    }
  }

  return null;
}

function findPendingButton() {
  // LinkedIn shows "Pending" button when connection request is awaiting acceptance
  const selectors = [
    'main button[aria-label*="Pending" i]',
    '.pvs-profile-actions button[aria-label*="Pending" i]',
  ];

  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn && btn.offsetParent !== null) return btn;
  }

  // Fallback: find by text content
  const allButtons = document.querySelectorAll('main button, .pvs-profile-actions button');
  for (const btn of allButtons) {
    const text = btn.textContent.trim().toLowerCase();
    if (text === 'pending' && btn.offsetParent !== null) {
      return btn;
    }
  }

  return null;
}


async function findAddNoteButton() {
  // Wait for dialog to appear with retry
  let dialog = null;
  for (let i = 0; i < 8; i++) {
    dialog = document.querySelector('dialog, div[role="dialog"]') ||
             document.querySelector('.artdeco-modal') ||
             document.querySelector('[data-test-modal]');
    if (dialog) break;
    await sleep(500);
  }

  if (!dialog) {
    console.warn('[Olanovo] No dialog found for Add a note');
    return null;
  }

  // Search within the dialog only
  const selectors = [
    'button[aria-label*="Add a note" i]',
    'button[aria-label*="add note" i]',
    'button[aria-label*="Adicionar nota" i]',
    'button[aria-label*="Añadir nota" i]',
    'button[aria-label*="Ajouter une note" i]',
    'button[aria-label*="nota" i]',
    'button[aria-label*="note" i]',
  ];

  for (const selector of selectors) {
    const btn = dialog.querySelector(selector);
    if (btn && btn.offsetParent !== null) return btn;
  }

  // Fallback: find by text content in dialog buttons
  const buttons = dialog.querySelectorAll('button');
  for (const btn of buttons) {
    const text = btn.textContent.trim().toLowerCase();
    if (
      text.includes('add a note') ||
      text.includes('adicionar nota') ||
      text.includes('añadir nota') ||
      text.includes('ajouter') ||
      text === 'add note' ||
      text === 'nota'
    ) return btn;
  }

  // Last resort: look for secondary/ghost button that isn't the primary CTA
  const nonPrimaryButtons = Array.from(buttons).filter(btn => {
    const cls = btn.className || '';
    return (cls.includes('secondary') || cls.includes('ghost') || cls.includes('tertiary')) &&
           btn.offsetParent !== null;
  });
  if (nonPrimaryButtons.length === 1) {
    console.log('[Olanovo] Found likely Add a note button via class heuristic');
    return nonPrimaryButtons[0];
  }

  return null;
}

async function findNoteInput() {
  const selectors = [
    'textarea[name="message"]',
    'textarea#custom-message',
    'textarea[placeholder*="message" i]',
    'textarea[placeholder*="nota" i]',
    'textarea[placeholder*="note" i]',
    'div[role="dialog"] textarea',
    'dialog textarea',
    '.artdeco-modal textarea',
    '[data-test-modal] textarea',
  ];

  // Retry up to 6 times (3s total) — textarea appears async after clicking "Add a note"
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) return el;
    }
    await sleep(500);
  }

  return null;
}

async function findSendButton() {
  // Retry finding the dialog and send button — LinkedIn may render it async
  for (let attempt = 0; attempt < 8; attempt++) {
    const dialog = document.querySelector('dialog, div[role="dialog"]') ||
      document.querySelector('[data-test-modal]') ||
      document.querySelector('.artdeco-modal');
    if (!dialog) {
      await sleep(600);
      continue;
    }

    const selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="invitation" i]',
      'button[aria-label*="Enviar" i]',
      'button[aria-label*="Envoyer" i]',
      'button[data-control-name*="send" i]',
    ];

    for (const selector of selectors) {
      const btn = dialog.querySelector(selector);
      if (btn && btn.offsetParent !== null && !btn.disabled) return btn;
    }

    // Fallback: find primary/cta button in dialog by text
    const buttons = dialog.querySelectorAll('button');
    for (const btn of buttons) {
      const text = btn.textContent.trim().toLowerCase();
      if ((text === 'send' || text === 'send invitation' || text === 'send now' ||
           text === 'enviar' || text === 'enviar convite' || text === 'envoyer') &&
          btn.offsetParent !== null && !btn.disabled) {
        return btn;
      }
    }

    // Also try: primary-styled button in dialog (LinkedIn uses artdeco-button--primary)
    const primaryBtn = dialog.querySelector('button.artdeco-button--primary');
    if (primaryBtn && primaryBtn.offsetParent !== null && !primaryBtn.disabled) {
      return primaryBtn;
    }

    // On custom-invite page: if Send button exists but is disabled, try to force-enable it
    // by re-triggering input events on the textarea (Ember.js may not have detected the input)
    if (attempt >= 3 && window.location.pathname.includes('/preload/custom-invite')) {
      const textarea = dialog.querySelector('textarea');
      if (textarea && textarea.value.trim().length > 0) {
        console.log('[Olanovo] Send button disabled — re-triggering textarea events');
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.dispatchEvent(new Event('focusout', { bubbles: true }));
        textarea.dispatchEvent(new Event('blur', { bubbles: true }));
        // Also try Ember-specific: trigger keyup to simulate real typing
        textarea.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: ' ' }));
        textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
      }

      // Last resort: if the button is still disabled after all retries, force-click it
      if (attempt >= 6) {
        const sendBtn = dialog.querySelector('button[aria-label*="Send" i]') ||
          dialog.querySelector('button.artdeco-button--primary');
        if (sendBtn && sendBtn.offsetParent !== null) {
          console.warn('[Olanovo] Force-clicking disabled Send button as last resort');
          sendBtn.disabled = false;
          sendBtn.classList.remove('artdeco-button--disabled');
          return sendBtn;
        }
      }
    }

    await sleep(600);
  }

  return null;
}

// ── MESSAGE BUTTON FINDERS ──




// ── ROBUST NOTE INSERTION (for connection request textarea) ──

async function typeNoteRobust(element, text) {
  element.focus();
  await sleep(200);

  // Strategy 1: Use native input value setter to bypass React's controlled component
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set || Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);

    if ((element.value || '').trim() === text.trim()) {
      console.log('[Olanovo] Note inserted via native setter ✅');
      return true;
    }
  }

  // Strategy 2: execCommand insertText
  element.focus();
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(100);
  element.select();
  document.execCommand('insertText', false, text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(200);

  if ((element.value || '').trim() === text.trim()) {
    console.log('[Olanovo] Note inserted via execCommand ✅');
    return true;
  }

  // Strategy 3: Paste event
  element.focus();
  element.value = '';
  await sleep(100);
  try {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    element.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData,
    }));
    await sleep(200);

    if ((element.value || '').trim() === text.trim()) {
      console.log('[Olanovo] Note inserted via paste ✅');
      return true;
    }
  } catch (e) { /* fallthrough */ }

  // Strategy 4: Character-by-character with periodic React sync (last resort)
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(100);

  // Type in chunks of 20 chars to reduce React overwrite risk
  const chunkSize = 20;
  for (let i = 0; i < text.length; i += chunkSize) {
    const chunk = text.substring(i, Math.min(i + chunkSize, text.length));
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, text.substring(0, i + chunk.length));
    } else {
      element.value = text.substring(0, i + chunk.length);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(80 + Math.random() * 40);
  }
  element.dispatchEvent(new Event('change', { bubbles: true }));
  console.log('[Olanovo] Note inserted via chunk typing');
  const finalValue = (element.value || '').trim();
  return finalValue.length >= text.trim().length * 0.95;
}

async function retryNoteInsertion(element, text) {
  // Nuclear retry: use all strategies again with more aggressive approach
  element.focus();
  await sleep(500);

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(element, text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    // Also fire React-specific synthetic events
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
    await sleep(400);

    const result = (element.value || '').trim();
    if (result.length >= text.trim().length * 0.95) {
      console.log(`[Olanovo] Note retry successful: ${result.length}/${text.trim().length} chars ✅`);
      return true;
    }
  }

  console.error(`[Olanovo] Note retry failed. Proceeding with whatever was typed.`);
  return false;
}

// ── HUMAN-LIKE TYPING ──


async function simulateScroll(pixels) {
  const steps = 3 + Math.floor(Math.random() * 3);
  const stepSize = pixels / steps;

  for (let i = 0; i < steps; i++) {
    window.scrollBy({ top: stepSize, behavior: 'smooth' });
    await sleep(200 + Math.random() * 300);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ══════════════════════════════════════════════
// LINKEDIN LIMIT DETECTION
// ══════════════════════════════════════════════

// Detects if a text string indicates a LinkedIn rate limit
function isLimitError(text) {
  const lower = (text || '').toLowerCase();
  const limitPhrases = [
    'limit', 'restriction', 'too many', 'quota',
    'weekly invitation', 'invitation limit', 'invitations this week',
    'you\'ve reached', 'reached the maximum', 'try again later',
    'slow down', 'temporarily restricted', 'temporarily limited',
    'límite', 'restricción', 'limite', 'restrição',  // ES/PT
  ];
  return limitPhrases.some(phrase => lower.includes(phrase));
}

// Scans the page for LinkedIn limit banners/alerts outside dialogs
function detectLinkedInLimitBanner() {
  const bannerSelectors = [
    '.artdeco-toast-item', '.artdeco-notification',
    '.ip-fuse-limit-alert', '[data-test-artdeco-toast]',
    '.artdeco-inline-feedback', '.global-alert',
  ];
  for (const selector of bannerSelectors) {
    const elements = document.querySelectorAll(selector);
    for (const el of elements) {
      const text = (el.textContent || '').trim();
      if (isLimitError(text)) return text.substring(0, 200);
    }
  }
  // Also check for any visible element with limit-related text near the top of the page
  const alerts = document.querySelectorAll('[role="alert"], [role="status"]');
  for (const el of alerts) {
    const text = (el.textContent || '').trim();
    if (isLimitError(text)) return text.substring(0, 200);
  }
  return null;
}

// ── "Copy and open post" from Olanovo ──
// LinkedIn's activity page gives no address for a single post, so Olanovo opens the author's
// activity page with #lcpost=<the post's opening words>. Left there, the person has to scroll and
// look for the post. This takes them to it: the page is scrolled to the post and it is outlined for a
// few seconds. Nothing is clicked and nothing is written.
// How far the search for the post goes: a number of steps down the page, and a time limit.
const LC_SHOW_POST_STEPS = 16;
const LC_SHOW_POST_MS = 25000;
async function lcShowLinkedPost() {
  if (window.top !== window) return;
  // The address is read once: if LinkedIn drops the marker a moment later, this must not go on to
  // outline some other post.
  const url = window.location.href;
  if (!/\/recent-activity\//.test(window.location.pathname)) return;
  const marker = url.match(/#lcpost=([^&]+)/);
  if (!marker) return;
  if (window.__olanovoShownPost === url) return;
  window.__olanovoShownPost = url;
  // A newer search (the marker changed) retires this one: only the latest may move the page.
  const turn = (window.__olanovoPostSearch || 0) + 1;
  window.__olanovoPostSearch = turn;
  const retired = () => window.__olanovoPostSearch !== turn;
  // The person's own scrolling, typing or clicking ends the search: the page is theirs.
  let stop = false;
  const halt = () => { stop = true; };
  const signs = ['wheel', 'keydown', 'touchstart', 'mousedown'];
  for (const ev of signs) window.addEventListener(ev, halt, { passive: true });
  try {
    const wanted = decodeURIComponent(marker[1]).trim();
    if (wanted.length < 10) return;
    // The list arrives after the page: give it a moment before the first look.
    await sleep(1500);
    let card = null;
    // The list loads a few posts at a time, and the next ones only arrive after the page reaches the
    // end of what is there. So the search goes on step by step, and when it is at the bottom with
    // nothing new it waits for the next posts instead of giving up. A post found through search can
    // be a week old, well below the first ones.
    const started = Date.now();
    const exact = (cards) => cards.find((c) => c.fingerprint && c.fingerprint.startsWith(wanted)) || null;
    // Posts that share the marker's first 40 characters, noted at every step: the page may drop a post
    // once it has scrolled past it, so they cannot be looked for only at the end.
    const near = new Set();
    let lastSig = '';
    let waits = 0;
    let lastCards = [];
    for (let step = 0; step < LC_SHOW_POST_STEPS && !stop && !retired() && Date.now() - started < LC_SHOW_POST_MS; step++) {
      // The post's text must begin with the whole marker. A shorter post that merely shares its
      // opening words with the marker is a different post.
      lastCards = lcCollectActivityCards();
      card = exact(lastCards);
      if (card) break;
      if (wanted.length > 40) {
        for (const c of lastCards) if (c.fingerprint && c.fingerprint.startsWith(wanted.slice(0, 40))) near.add(c.el);
      }
      const height = document.documentElement.scrollHeight;
      const atBottom = window.innerHeight + window.scrollY >= height - 300;
      // Progress is a longer page or a different last post. The number of posts in the page is not: the
      // page can drop the ones above while new ones arrive.
      const last = lastCards[lastCards.length - 1];
      const sig = `${height}|${last ? last.fingerprint : ''}`;
      if (atBottom && sig === lastSig) {
        // At the end, and nothing arrived since the last look: go to the very end (some pages only
        // load more once it is in view) and wait, a few times.
        if (++waits > 3) break;
        window.scrollTo(0, height);
        await sleep(1300 + Math.random() * 500);
        continue;
      }
      waits = 0;
      lastSig = sig;
      window.scrollBy(0, Math.max(500, Math.round(window.innerHeight * (0.7 + Math.random() * 0.2))));
      await sleep(900 + Math.random() * 500);
    }
    if (!card && !stop && !retired() && near.size) {
      // A long marker can differ from the card near its end (a counter read as text, an edit, the text
      // collapsed). Its first 40 characters decide, but only when one post still in the page has them.
      // An older layout lists the same post twice, a wrapper and the element inside it: the wrappers
      // are set aside. Two separate posts with the same opening stay two, and no choice is made.
      const els = [...near].filter((e) => e.isConnected);
      const posts = els.filter((e) => !els.some((o) => o !== e && e.contains(o)));
      if (posts.length === 1) card = { el: posts[0] };
    }
    if (!card && !stop && !retired()) {
      // Not found. Left in the console so the reason can be read: what was looked for and what the
      // page showed. Nothing here leaves the browser.
      console.debug('[Olanovo] post not found on this page', {
        wanted, steps: LC_SHOW_POST_STEPS, scrollY: Math.round(window.scrollY), height: document.documentElement.scrollHeight,
        cards: lastCards.map((c) => [c.ageLabel, c.isRepost, (c.fingerprint || '').slice(0, 50)]),
      });
    }
    if (retired()) return;
    if (!card || !card.el) {
      // Not found: back to where the page started, so the person is not left halfway down the list.
      if (!stop) window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (stop) return;
    card.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // An outline still showing from an earlier search is taken off first: otherwise it would be read
    // as the post's own style and put back for good.
    if (window.__olanovoClearOutline) window.__olanovoClearOutline();
    const el = card.el;
    const before = { outline: el.style.outline, outlineOffset: el.style.outlineOffset, borderRadius: el.style.borderRadius };
    el.style.outline = '3px solid #6B2EF5';
    el.style.outlineOffset = '4px';
    el.style.borderRadius = '10px';
    const timer = setTimeout(() => { if (window.__olanovoClearOutline === clear) clear(); }, 8000);
    const clear = () => {
      clearTimeout(timer);
      el.style.outline = before.outline;
      el.style.outlineOffset = before.outlineOffset;
      el.style.borderRadius = before.borderRadius;
      window.__olanovoClearOutline = null;
    };
    window.__olanovoClearOutline = clear;
  } catch (e) {
    console.warn('[Olanovo] Could not scroll to the post:', e && e.message);
  } finally {
    for (const ev of signs) window.removeEventListener(ev, halt);
  }
}
lcShowLinkedPost();
// Covers the marker arriving or changing on a page already open.
if (!window.__olanovoPostListener) {
  window.__olanovoPostListener = true;
  window.addEventListener('hashchange', () => { lcShowLinkedPost(); });
}
