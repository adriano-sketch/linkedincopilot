// Prevent double injection — guard MUST wrap the message listener too,
// otherwise each injection adds another listener causing duplicate execution
if (window.__linkedinCopilotLoaded) {
  console.log('[LinkedIn Copilot] Content script already loaded, skipping');
  // STOP HERE — do not register another message listener
} else {
  window.__linkedinCopilotLoaded = true;
  console.log('[LinkedIn Copilot] Content script loaded');

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
    if (message.type === 'SEND_VIA_CONVERSATION_URN') {
      // Called by background.js after extracting threadId from messaging page URL
      sendMessageViaConversationUrn(message.threadId, message.messageText)
        .then(result => sendResponse(result))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
    }
  });
}

async function handleAction(action) {
  console.log(`[LinkedIn Copilot] Executing: ${action.action_type}`);

  // Wait for page to be ready
  await waitForLinkedInReady();

  switch (action.action_type) {
    case 'visit_profile':
      return await visitProfile();
    case 'follow_profile':
      return await followProfile();
    case 'send_connection_request':
      return await sendConnectionRequest(action.message_text);
    case 'send_dm':
    case 'send_followup':
      return await sendMessage(action.message_text);
    case 'compose_on_messaging_page':
      return await composeOnMessagingPage(action.message_text, action.expected_name);
    case 'find_and_click_message_button':
      return await findAndClickMessageButton();
    case 'check_connection_status':
      return await checkConnectionStatus();
    case 'check_reply_status':
      return await checkReplyStatus(action);

    // ── Growth Mode Actions ──
    case 'find_latest_post':
      return await findLatestPost();
    case 'like_post':
      return await likePost(action.post_url);
    case 'post_comment':
      return await postComment(action.post_url, action.message_text);

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
    console.log('[LinkedIn Copilot] Clicked Follow button');
    await sleep(1000 + Math.random() * 1000);
    return { success: true, action: 'follow_profile', followed: true };
  }

  console.log('[LinkedIn Copilot] Follow button not found — may already be following');
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
        return { success: true, action: 'send_connection_request', note: 'already_connected' };
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

      throw new Error('Connect button not found on profile page');
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
          console.warn('[LinkedIn Copilot] Note insertion incomplete. Retrying with fallback.');
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
        console.log('[LinkedIn Copilot] Note typed and events dispatched ✅');
      } else {
        console.warn('[LinkedIn Copilot] Note input not found, sending without note');
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
        console.warn('[LinkedIn Copilot] Add a note button not found. Dialog buttons:', JSON.stringify(btns));
      } else {
        console.warn('[LinkedIn Copilot] Add a note button not found — no dialog present');
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
    console.warn('[LinkedIn Copilot] LinkedIn limit banner detected:', pageLimitBanner);
    // Connection was likely sent, but flag the limit for the queue to pause
    return { success: true, action: 'send_connection_request', note: 'sent_with_note', limitWarning: pageLimitBanner };
  }

  return { success: true, action: 'send_connection_request', note: noteText ? 'sent_with_note' : 'sent_without_note' };
}

// ══════════════════════════════════════════════
// VOYAGER API — Direct message send (bypasses DOM entirely)
// ══════════════════════════════════════════════

// Cache the user's own mailbox URN across calls within one page lifecycle
let _cachedMailboxUrn = null;

/**
 * Fetch the logged-in user's mailbox URN from LinkedIn's /me endpoint.
 * Returns something like "urn:li:fsd_profile:ACoAAA...".
 */
async function getMyMailboxUrn() {
  if (_cachedMailboxUrn) return _cachedMailboxUrn;
  const csrf = getCsrfToken();
  if (!csrf) throw new Error('VOYAGER_NO_CSRF: Could not extract JSESSIONID from cookies');
  const resp = await fetch('/voyager/api/me', {
    headers: {
      'csrf-token': csrf,
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
    },
    credentials: 'include',
  });
  if (!resp.ok) throw new Error(`VOYAGER_ME_FAILED: /me returned ${resp.status}`);
  const json = await resp.json();
  const mini = (json.included || []).find(i => i.publicIdentifier);
  if (!mini || !mini.entityUrn) throw new Error('VOYAGER_ME_PARSE: Could not find entityUrn in /me response');
  // entityUrn is "urn:li:fs_miniProfile:ACoAAA..." — convert to fsd_profile
  const profileId = mini.entityUrn.replace('urn:li:fs_miniProfile:', '');
  _cachedMailboxUrn = `urn:li:fsd_profile:${profileId}`;
  console.log('[LinkedIn Copilot] Resolved own mailboxUrn:', _cachedMailboxUrn);
  return _cachedMailboxUrn;
}

/**
 * Extract CSRF token from JSESSIONID cookie.
 */
function getCsrfToken() {
  const m = document.cookie.match(/JSESSIONID=["']?([^;"']+)/);
  return m ? m[1].replace(/"/g, '') : null;
}

/**
 * Generate a pseudo-random tracking ID (base64, ~16 chars) like LinkedIn's client.
 */
function generateTrackingId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).substring(0, 16);
}

/**
 * Verify connection degree via Voyager API before sending DM.
 * Extracts the vanity name from the current URL (/in/vanity-name/) and
 * queries LinkedIn's profile API for the network distance.
 *
 * @returns {{ isFirstDegree: boolean|null, distance: string|null, raw: any }}
 *          isFirstDegree = null means we couldn't verify (proceed anyway)
 */
async function verifyConnectionDegreeViaAPI() {
  const csrf = getCsrfToken();
  if (!csrf) return { isFirstDegree: null, distance: null };

  // Extract vanity name from current URL
  const pathMatch = window.location.pathname.match(/^\/in\/([^/]+)/);
  if (!pathMatch) return { isFirstDegree: null, distance: null };
  const vanityName = pathMatch[1];

  try {
    // Use the identity/profiles endpoint which includes networkDistance
    const resp = await fetch(`/voyager/api/identity/profiles/${vanityName}/networkinfo`, {
      headers: {
        'csrf-token': csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });

    if (resp.ok) {
      const json = await resp.json();
      // LinkedIn returns distance as { value: "DISTANCE_1" | "DISTANCE_2" | "DISTANCE_3" | "OUT_OF_NETWORK" }
      const distValue = json?.data?.distance?.value || json?.distance?.value || null;
      if (distValue) {
        const isFirst = distValue === 'DISTANCE_1';
        console.log(`[LinkedIn Copilot] Voyager networkinfo: ${vanityName} → distance=${distValue}, isFirstDegree=${isFirst}`);
        return { isFirstDegree: isFirst, distance: distValue, raw: json };
      }
    }

    // Fallback: try the dash profiles endpoint
    const resp2 = await fetch(`/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${vanityName}`, {
      headers: {
        'csrf-token': csrf,
        'accept': 'application/vnd.linkedin.normalized+json+2.1',
      },
      credentials: 'include',
    });

    if (resp2.ok) {
      const json2 = await resp2.json();
      // Look for distance in included items
      const included = json2?.included || [];
      for (const item of included) {
        const dist = item?.distance?.value || item?.networkDistance?.value;
        if (dist) {
          const isFirst = dist === 'DISTANCE_1';
          console.log(`[LinkedIn Copilot] Voyager dash/profiles: ${vanityName} → distance=${dist}, isFirstDegree=${isFirst}`);
          return { isFirstDegree: isFirst, distance: dist, raw: { source: 'dash_profiles' } };
        }
      }
    }

    console.warn(`[LinkedIn Copilot] verifyConnectionDegreeViaAPI: could not determine degree for ${vanityName}`);
    return { isFirstDegree: null, distance: null };
  } catch (err) {
    console.warn('[LinkedIn Copilot] verifyConnectionDegreeViaAPI error:', err.message);
    return { isFirstDegree: null, distance: null };
  }
}

/**
 * Send a DM via LinkedIn's Voyager REST API, completely bypassing DOM compose.
 *
 * @param {string} recipientProfileId — The profile ID part of the recipient URN
 *        (e.g., "ACoAAB9xdv4B..." extracted from the Message <a> href)
 * @param {string} messageText — The message body to send
 * @returns {object} — { success, via, messageUrn?, conversationUrn?, ... }
 */
async function sendMessageViaVoyagerAPI(recipientProfileId, messageText) {
  const mailboxUrn = await getMyMailboxUrn();
  const recipientUrn = `urn:li:fsd_profile:${recipientProfileId}`;
  const csrf = getCsrfToken();
  if (!csrf) throw new Error('VOYAGER_NO_CSRF');
  if (recipientUrn === mailboxUrn) throw new Error('VOYAGER_SELF_SEND: Recipient URN matches own mailbox — refusing to send to self');

  const originToken = crypto.randomUUID ? crypto.randomUUID() : generateTrackingId();
  const body = {
    dedupeByClientGeneratedToken: false,
    hostRecipientUrns: [recipientUrn],
    mailboxUrn: mailboxUrn,
    message: {
      body: { attributes: [], text: messageText },
      originToken: originToken,
      renderContentUnions: [],
    },
    trackingId: generateTrackingId(),
  };

  console.log('[LinkedIn Copilot] Voyager API createMessage →', recipientUrn);
  const resp = await fetch('/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage', {
    method: 'POST',
    headers: {
      'csrf-token': csrf,
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'content-type': 'application/json; charset=UTF-8',
      'x-restli-protocol-version': '2.0.0',
    },
    body: JSON.stringify(body),
    credentials: 'include',
  });

  const respText = await resp.text();
  let respJson;
  try { respJson = JSON.parse(respText); } catch (_) { respJson = { raw: respText.substring(0, 500) }; }

  if (!resp.ok) {
    const code = respJson?.data?.code || `HTTP_${resp.status}`;
    console.error('[LinkedIn Copilot] Voyager createMessage failed:', resp.status, code, respText.substring(0, 300));
    // Surface specific LinkedIn limits
    if (resp.status === 429 || /RATE_LIMIT|TOO_MANY/i.test(code)) {
      throw new Error(`LINKEDIN_LIMIT: Voyager API rate limited (${resp.status} ${code})`);
    }
    throw new Error(`VOYAGER_SEND_FAILED: ${resp.status} ${code}`);
  }

  // Extract conversation/message URN from response for telemetry
  let conversationUrn = null;
  let messageUrn = null;
  try {
    const included = respJson?.included || [];
    const msg = included.find(i => i.$type && /MessengerMessage/i.test(i.$type));
    messageUrn = msg?.entityUrn || msg?.['*entityUrn'] || null;
    const convo = included.find(i => i.$type && /Conversation/i.test(i.$type));
    conversationUrn = convo?.entityUrn || convo?.['*entityUrn'] || null;
  } catch (_) {}

  console.log('[LinkedIn Copilot] ✅ Voyager API send success. Conversation:', conversationUrn, 'Message:', messageUrn);
  return {
    success: true,
    via: 'voyager_api',
    conversationUrn,
    messageUrn,
  };
}

/**
 * Send a message via Voyager API using conversationUrn (bypasses InMail restriction).
 *
 * When a conversation thread was created by a connection-request note, LinkedIn treats
 * it as InMail and blocks the standard hostRecipientUrns approach with 422
 * NOT_ALLOWED_PREMIUM_INMAIL_SUBSEQUENT_REPLY.
 *
 * The workaround: put conversationUrn INSIDE the message object and omit
 * hostRecipientUrns entirely — this is the same payload LinkedIn's own web client uses.
 *
 * @param {string} threadId — The thread ID from the messaging URL (e.g. "2-MTEwOGFm...")
 * @param {string} messageText — The message body to send
 * @returns {object} — { success, via, conversationUrn?, messageUrn? }
 */
async function sendMessageViaConversationUrn(threadId, messageText) {
  const mailboxUrn = await getMyMailboxUrn();
  const csrf = getCsrfToken();
  if (!csrf) throw new Error('VOYAGER_NO_CSRF');

  // Extract the profile ID from the mailboxUrn (urn:li:fsd_profile:XXXXX)
  const myProfileId = mailboxUrn.replace('urn:li:fsd_profile:', '');
  const conversationUrn = `urn:li:msg_conversation:(urn:li:fsd_profile:${myProfileId},${threadId})`;
  const originToken = crypto.randomUUID ? crypto.randomUUID() : generateTrackingId();

  const body = {
    message: {
      body: { attributes: [], text: messageText },
      renderContentUnions: [],
      conversationUrn: conversationUrn,
      originToken: originToken,
    },
    mailboxUrn: mailboxUrn,
    trackingId: generateTrackingId(),
    dedupeByClientGeneratedToken: false,
  };

  console.log('[LinkedIn Copilot] Voyager API createMessage (conversationUrn) →', conversationUrn);
  const resp = await fetch('/voyager/api/voyagerMessagingDashMessengerMessages?action=createMessage', {
    method: 'POST',
    headers: {
      'csrf-token': csrf,
      'accept': 'application/vnd.linkedin.normalized+json+2.1',
      'content-type': 'application/json; charset=UTF-8',
      'x-restli-protocol-version': '2.0.0',
    },
    body: JSON.stringify(body),
    credentials: 'include',
  });

  const respText = await resp.text();
  let respJson;
  try { respJson = JSON.parse(respText); } catch (_) { respJson = { raw: respText.substring(0, 500) }; }

  if (!resp.ok) {
    const code = respJson?.data?.code || `HTTP_${resp.status}`;
    console.error('[LinkedIn Copilot] Voyager conversationUrn send failed:', resp.status, code, respText.substring(0, 300));
    if (resp.status === 429 || /RATE_LIMIT|TOO_MANY/i.test(code)) {
      throw new Error(`LINKEDIN_LIMIT: Voyager API rate limited (${resp.status} ${code})`);
    }
    throw new Error(`VOYAGER_CONVERSATION_SEND_FAILED: ${resp.status} ${code}`);
  }

  // Extract URNs from response for telemetry
  let responseConversationUrn = null;
  let messageUrn = null;
  try {
    const included = respJson?.included || [];
    const msg = included.find(i => i.$type && /MessengerMessage/i.test(i.$type));
    messageUrn = msg?.entityUrn || msg?.['*entityUrn'] || null;
    const convo = included.find(i => i.$type && /Conversation/i.test(i.$type));
    responseConversationUrn = convo?.entityUrn || convo?.['*entityUrn'] || null;
  } catch (_) {}

  console.log('[LinkedIn Copilot] ✅ Voyager conversationUrn send success. Conversation:', responseConversationUrn, 'Message:', messageUrn);
  return {
    success: true,
    via: 'voyager_api_conversation_urn',
    conversationUrn: responseConversationUrn || conversationUrn,
    messageUrn,
  };
}

// ══════════════════════════════════════════════
// SEND MESSAGE (DM / Follow-up)
// ══════════════════════════════════════════════
async function sendMessage(messageText) {
  if (!messageText || messageText.trim().length === 0) {
    throw new Error('No message text provided');
  }

  // ── SAFETY: Verify we are on a profile page, NOT a messaging/thread page ──
  // Cross-contamination root cause: if a previous action left the tab on /messaging/thread/...,
  // findMessageButton() can pick up links belonging to a different conversation and send
  // the message to the wrong person via Voyager API.
  const currentPath = window.location.pathname;
  if (!currentPath.startsWith('/in/')) {
    throw new Error(`WRONG_PAGE: sendMessage requires a profile page (/in/...) but current URL is ${currentPath}. Aborting to prevent cross-contamination.`);
  }

  await sleep(1000 + Math.random() * 1000);

  // ── STEP 0: Close ALL existing message overlays to prevent cross-chat contamination ──
  const existingOverlays = document.querySelectorAll('.msg-overlay-conversation-bubble');
  for (const overlay of existingOverlays) {
    const closeBtn = overlay.querySelector('button[data-control-name="overlay.close_conversation_window"]') ||
                     overlay.querySelector('.msg-overlay-bubble-header button[aria-label*="Close" i]');
    if (closeBtn && closeBtn.offsetParent !== null) {
      closeBtn.click();
      await sleep(400);
    }
  }
  await sleep(500);

  // ── STEP 0.5: Capture the profile name from the page heading ──
  const profileH1 = document.querySelector('main h1') || document.querySelector('main h2');
  const profileName = profileH1 ? profileH1.textContent.trim().toLowerCase() : null;
  console.log('[LinkedIn Copilot] Target profile name from heading:', profileName);

  // ── STEP 1: Find the Message button/link on their profile (with retry) ──
  let messageButton = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    messageButton = findMessageButton();
    if (messageButton) break;
    if (attempt % 3 === 2) {
      console.log(`[LinkedIn Copilot] sendMessage: Message button not found yet (attempt ${attempt + 1}/10), URL: ${window.location.href}`);
    }
    await sleep(1500);
  }

  if (!messageButton) {
    // Include diagnostic info in error message so it reaches Supabase
    const profileNameEl = document.querySelector('main h1') || document.querySelector('main h2');
    const pName = profileNameEl ? profileNameEl.textContent.trim() : 'NO_HEADING';
    const allBtns = document.querySelectorAll('button, a[role="button"], a[href*="messaging"]');
    const btnTexts = Array.from(allBtns).filter(b => b.offsetParent !== null).map(b => b.textContent.trim().substring(0, 25)).slice(0, 8);
    throw new Error(`Message button not found (url=${window.location.pathname}, heading=${pName}, buttons=${JSON.stringify(btnTexts)})`);
  }

  // LinkedIn 2026-04: Message is an <a> link with href like
  //   /messaging/compose/?recipient=ACoAAB...&profileUrn=...&interop=msgOverlay
  // Full-page navigation to this URL does NOT resolve the recipient (2026-04 layout
  // change), and synthetic .click() from content script is not trusted by LinkedIn's
  // SPA router. Both approaches fail with RECIPIENT_MISMATCH or blank compose.
  //
  // v0.1.6 FIX: Send the message directly via LinkedIn's Voyager REST API — no DOM
  // interaction needed. Falls back to the old redirect approach if the API call fails.
  if (messageButton.tagName === 'A') {
    if (!isValidMessageHref(messageButton.href)) {
      throw new Error(`Refused to redirect to non-compose messaging href: "${messageButton.href}" (url=${window.location.pathname})`);
    }

    // Extract recipient profile ID from href
    let recipientProfileId = null;
    try {
      const u = new URL(messageButton.href, 'https://www.linkedin.com');
      recipientProfileId = u.searchParams.get('recipient');
    } catch (_) {}

    if (recipientProfileId) {
      // ── PRE-FLIGHT: Verify connection degree via API before sending ──
      // This prevents sending DMs to non-1st-degree connections that the DOM
      // detection incorrectly identified as connected (false positives from InMail
      // "Message" buttons + "1st" text matching non-degree content).
      try {
        const degreeCheck = await verifyConnectionDegreeViaAPI();
        if (degreeCheck.isFirstDegree === false) {
          console.error(`[LinkedIn Copilot] PRE-FLIGHT BLOCK: Recipient is ${degreeCheck.distance}, not 1st-degree. Refusing to send DM.`);
          throw new Error(`RECIPIENT_NOT_FIRST_DEGREE_CONNECTION: Pre-flight API check shows distance=${degreeCheck.distance}. Lead is NOT actually connected.`);
        }
        if (degreeCheck.isFirstDegree === true) {
          console.log('[LinkedIn Copilot] Pre-flight OK: Recipient confirmed as 1st-degree connection');
        } else {
          console.log('[LinkedIn Copilot] Pre-flight: Could not verify degree, proceeding anyway');
        }
      } catch (preFlightErr) {
        if (/RECIPIENT_NOT_FIRST_DEGREE/i.test(preFlightErr.message)) {
          throw preFlightErr; // Rethrow the definitive block
        }
        console.warn('[LinkedIn Copilot] Pre-flight degree check failed (non-blocking):', preFlightErr.message);
      }

      try {
        console.log('[LinkedIn Copilot] Message button is <a> link — using Voyager API to send directly');
        const apiResult = await sendMessageViaVoyagerAPI(recipientProfileId, messageText);

        // If InMail thread detected, bubble the retry signal up to background.js
        if (apiResult && apiResult.note === 'inmail_thread_retry_needed') {
          console.warn('[LinkedIn Copilot] InMail retry signal — passing to background.js');
          return apiResult; // background.js checks for this note
        }

        return {
          success: true,
          action: 'send_dm',
          note: 'sent_via_voyager_api',
          telemetry: {
            url_path: window.location.pathname,
            thread_header: profileName || null,
            expected_name: profileName || null,
            text_preview: (messageText || '').substring(0, 40),
            sent_at_client: new Date().toISOString(),
            voyager_conversation: apiResult.conversationUrn || null,
            voyager_message: apiResult.messageUrn || null,
          },
        };
      } catch (voyagerErr) {
        console.error('[LinkedIn Copilot] Voyager API send failed:', voyagerErr.message);

        // ── InMail thread detected: return retry signal instead of throwing ──
        // background.js will navigate to /messaging/thread/new/?recipient=ID,
        // extract the threadId from the URL, and resend via conversationUrn.
        const isInmailBlock = /NOT_ALLOWED_PREMIUM_INMAIL/i.test(voyagerErr.message);
        if (isInmailBlock) {
          console.warn('[LinkedIn Copilot] InMail thread — returning retry signal for conversationUrn flow');
          return {
            success: false,
            note: 'inmail_thread_retry_needed',
            recipientProfileId: recipientProfileId,
            error: voyagerErr.message,
          };
        }

        // Propagate ALL other Voyager errors directly — the redirect/DOM fallback is broken
        // in LinkedIn's 2026-04 layout and always fails with RECIPIENT_MISMATCH.
        throw voyagerErr;
      }
    } else {
      console.warn('[LinkedIn Copilot] Message <a> href has no ?recipient= param, cannot use Voyager API. href:', messageButton.href);
    }

    // If we get here, the <a> link had no extractable recipient ID.
    // The redirect approach is broken in 2026-04, so throw instead of silently failing.
    throw new Error(`VOYAGER_NO_RECIPIENT: Message button is <a> but no recipient param in href (url=${window.location.pathname})`);
  }

  messageButton.click();
  await sleep(2000 + Math.random() * 1500);

  // ── STEP 2: Find the message input in the correct chat overlay ──
  const messageInputResult = await waitForMessageInput();

  if (!messageInputResult) {
    throw new Error('Message input not found in chat window');
  }

  const { element: messageInput, overlay: messageOverlay } = messageInputResult;

  // ── STEP 2.5: CRITICAL — Verify the conversation is with the correct person ──
  if (profileName && messageOverlay) {
    const headerEl = messageOverlay.querySelector('.msg-overlay-bubble-header h2, .msg-overlay-bubble-header a, .msg-overlay-bubble-header span.msg-overlay-bubble-header__title');
    const conversationName = headerEl ? headerEl.textContent.trim().toLowerCase() : '';
    console.log('[LinkedIn Copilot] Conversation header name:', conversationName);

    // Compare: the conversation header should contain the profile name (or vice versa)
    // Use first name match as minimum since LinkedIn may abbreviate
    const profileFirstName = profileName.split(/\s+/)[0];
    const conversationFirstName = conversationName.split(/\s+/)[0];

    if (profileFirstName && conversationFirstName && profileFirstName.length > 1 && conversationFirstName.length > 1) {
      const nameMatches = conversationName.includes(profileFirstName) || profileName.includes(conversationFirstName);
      if (!nameMatches) {
        console.error(`[LinkedIn Copilot] RECIPIENT MISMATCH! Profile: "${profileName}" vs Conversation: "${conversationName}". Aborting send.`);
        await closeMessageOverlay(messageOverlay);
        throw new Error(`Recipient mismatch: expected "${profileName}" but chat opened for "${conversationName}". Blocked to prevent sending DM to wrong person.`);
      }
      console.log('[LinkedIn Copilot] ✅ Recipient verified:', profileFirstName);
    }
  }

  // ── STEP 3: Type and verify message integrity before sending ──
  await clearComposer(messageInput);
  await typeHumanLike(messageInput, messageText);

  const isComposerValid = await verifyComposerIntegrity(messageInput, messageText);
  if (!isComposerValid) {
    await closeMessageOverlay(messageOverlay);
    throw new Error('Message integrity check failed — send blocked to prevent garbled DM');
  }

  // Extra safety: re-check for late LinkedIn/React mutations before click
  const isComposerStable = await verifyComposerIntegrity(messageInput, messageText, {
    checks: 5,
    baseDelayMs: 260,
    incrementalDelayMs: 190,
  });

  if (!isComposerStable) {
    await closeMessageOverlay(messageOverlay);
    throw new Error('Late composer mutation detected — send blocked to prevent garbled DM');
  }

  await sleep(500 + Math.random() * 600);

  // ── STEP 4: Click Send in the SAME overlay as the validated composer ──
  const sendButton = findMessageSendButton(messageOverlay);

  if (!sendButton) {
    await closeMessageOverlay(messageOverlay);
    throw new Error('Send button not found in validated message overlay');
  }

  sendButton.click();
  await sleep(2000 + Math.random() * 1000);

  // ── STEP 5: Verify the message was actually sent ──
  // After clicking Send, LinkedIn removes the text from the composer if successful.
  // If the text is still there, the send failed silently.
  // 2026-04-13 fix: increased attempts from 3→4, added thread-match fallback.
  let sendVerified = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt === 0 ? 2000 : 1500 + attempt * 500);
    const remainingText = normalizeMessageText(readComposerText(messageInput));
    const expectedText = normalizeMessageText(messageText);

    if (remainingText.length === 0 || remainingText !== expectedText) {
      // Composer cleared or changed = send succeeded
      sendVerified = true;
      break;
    }

    // Text still in composer — try clicking send again (first 2 attempts only)
    if (attempt < 2) {
      console.warn(`[LinkedIn Copilot] Send verification attempt ${attempt + 1}: text still in composer, retrying send`);
      const retryBtn = findMessageSendButton(messageOverlay);
      if (retryBtn && !retryBtn.disabled) {
        retryBtn.click();
        await sleep(1500);
      }
    }
  }

  // Thread-match fallback for overlay: check if message appeared in the bubble list
  if (!sendVerified) {
    try {
      const snippet = (messageText || '').substring(0, 50).toLowerCase();
      const bubbles = messageOverlay?.querySelectorAll?.('.msg-s-event-listitem__body, [class*="msg-s-event"] p') || [];
      const recent = Array.from(bubbles).slice(-5);
      for (const b of recent) {
        if ((b.textContent || '').trim().toLowerCase().includes(snippet)) {
          sendVerified = true;
          console.warn('[LinkedIn Copilot] ⚠️ Overlay composer not cleared but message found in thread — treating as success');
          break;
        }
      }
    } catch (e) {
      console.warn('[LinkedIn Copilot] Overlay thread-match check failed:', e.message);
    }
  }

  // ── STEP 6: Always close the message overlay ──
  await closeMessageOverlay(messageOverlay);

  if (!sendVerified) {
    throw new Error('Send verification failed — message text remained in composer after clicking Send');
  }

  // Forensic telemetry — see composeOnMessagingPage for rationale.
  let overlayHeader = '';
  try {
    const hEl = messageOverlay?.querySelector?.(
      '.msg-overlay-bubble-header h2, .msg-overlay-bubble-header a, .msg-overlay-bubble-header span.msg-overlay-bubble-header__title'
    );
    overlayHeader = hEl ? (hEl.textContent || '').trim().substring(0, 80) : '';
  } catch (_) {}

  return {
    success: true,
    action: 'send_dm',
    note: 'sent_via_overlay',
    telemetry: {
      url_path: window.location.pathname,
      thread_header: overlayHeader || null,
      expected_name: profileName || null,
      text_preview: (messageText || '').substring(0, 40),
      sent_at_client: new Date().toISOString(),
    },
  };
}

async function clearComposer(element) {
  element.focus();
  await sleep(180);

  if (element.tagName === 'DIV') {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('delete', false);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  } else {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  await sleep(120);
}

function readComposerText(element) {
  if (!element) return '';
  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    return element.value || '';
  }
  return element.innerText || element.textContent || '';
}

function normalizeMessageText(text) {
  return String(text || '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

async function verifyComposerIntegrity(element, expectedText, options = {}) {
  const expected = normalizeMessageText(expectedText);
  const checks = Math.max(1, options.checks || 3);
  const baseDelayMs = options.baseDelayMs || 220;
  const incrementalDelayMs = options.incrementalDelayMs || 160;

  // Check multiple times to catch LinkedIn async mutations after typing
  for (let i = 0; i < checks; i++) {
    await sleep(baseDelayMs + i * incrementalDelayMs);
    const current = normalizeMessageText(readComposerText(element));
    if (current !== expected) {
      console.error('[LinkedIn Copilot] Composer mismatch detected, blocking send', {
        expectedLength: expected.length,
        currentLength: current.length,
      });
      return false;
    }
  }

  return true;
}

function getMessageOverlayFromInput(element) {
  if (!element) return null;

  const directOverlay = element.closest('.msg-overlay-conversation-bubble, .msg-overlay-list-bubble');
  if (directOverlay) return directOverlay;

  return document.querySelector('.msg-overlay-conversation-bubble.msg-overlay-conversation-bubble--is-active') ||
         document.querySelector('.msg-overlay-conversation-bubble') ||
         null;
}

async function closeMessageOverlay(overlayRoot = null) {
  const scopes = [];

  if (overlayRoot && overlayRoot.isConnected) {
    scopes.push(overlayRoot);
  }

  const activeOverlay = document.querySelector('.msg-overlay-conversation-bubble.msg-overlay-conversation-bubble--is-active');
  if (activeOverlay && activeOverlay !== overlayRoot) {
    scopes.push(activeOverlay);
  }

  if (scopes.length === 0) {
    scopes.push(document);
  }

  for (const scope of scopes) {
    const closeButton = scope.querySelector('button[data-control-name="overlay.close_conversation_window"]') ||
                        scope.querySelector('.msg-overlay-bubble-header button[aria-label*="Close" i]');
    if (closeButton) {
      closeButton.click();
      await sleep(500);
      return;
    }
  }
}

async function waitForMessageInput(maxWaitMs = 8000) {
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const selectors = [
      '.msg-overlay-conversation-bubble.msg-overlay-conversation-bubble--is-active div.msg-form__contenteditable[contenteditable="true"]',
      '.msg-overlay-conversation-bubble.msg-overlay-conversation-bubble--is-active div[role="textbox"][contenteditable="true"]',
      'div.msg-form__contenteditable[contenteditable="true"]',
      'div[role="textbox"][aria-label*="message" i]',
      'div.msg-form__msg-content-container div[contenteditable="true"]',
      '.msg-overlay-conversation-bubble div[contenteditable="true"]',
    ];

    for (const selector of selectors) {
      const elements = Array.from(document.querySelectorAll(selector));
      for (const el of elements) {
        if (!el || el.offsetParent === null) continue;
        const overlay = getMessageOverlayFromInput(el);
        if (overlay && overlay.offsetParent === null) continue;
        return { element: el, overlay };
      }
    }

    await sleep(500);
  }

  return null;
}

function findMessageSendButton(overlayRoot = null) {
  const selectors = [
    'button.msg-form__send-button',
    'button[type="submit"][aria-label*="Send" i]',
    '.msg-form__send-btn',
    '.msg-overlay-conversation-bubble button[aria-label*="Send" i]',
  ];

  const scopes = [];

  if (overlayRoot && overlayRoot.isConnected) {
    scopes.push(overlayRoot);
  }

  const activeOverlay = document.querySelector('.msg-overlay-conversation-bubble.msg-overlay-conversation-bubble--is-active');
  if (activeOverlay && activeOverlay !== overlayRoot) {
    scopes.push(activeOverlay);
  }

  if (scopes.length === 0) {
    scopes.push(document);
  }

  for (const scope of scopes) {
    for (const selector of selectors) {
      const btn = scope.querySelector(selector);
      if (btn && btn.offsetParent !== null && !btn.disabled) return btn;
    }
  }

  return null;
}

// ══════════════════════════════════════════════
// COMPOSE MESSAGE ON FULL MESSAGING PAGE (LinkedIn 2026)
// ══════════════════════════════════════════════

// Find the active thread container on /messaging/... pages. Everything we
// query (compose input, send button, header, banners) MUST be scoped to this
// container — doing document.querySelector(...) page-wide is what caused the
// 2026-04-10 "all DMs in one thread" incident, because the sidebar and any
// lingering thread panels contain duplicate compose inputs, send buttons and
// name spans that cause false positives.
function findActiveThreadContainer() {
  const selectors = [
    '.msg-thread',
    '.msg-convo-wrapper',
    '[data-test-conversation-container]',
    '.scaffold-layout__detail .msg-form__msg-content-container',
    '.msg-form', // fallback: the compose form itself acts as a scope
  ];
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      if (el.offsetParent !== null) {
        // Prefer a container that is also the closest ancestor of a visible compose input
        const compose = el.querySelector('div.msg-form__contenteditable[contenteditable="true"]');
        if (compose && compose.offsetParent !== null) {
          // Walk up from compose to the outer thread/convo scope if possible
          const outer = compose.closest('.msg-thread, .msg-convo-wrapper, [data-test-conversation-container]') || el;
          return outer;
        }
      }
    }
  }
  // Last resort: return the closest ancestor of the most-visible compose input
  const visibleCompose = Array.from(
    document.querySelectorAll('div.msg-form__contenteditable[contenteditable="true"]')
  ).find((el) => el.offsetParent !== null);
  if (visibleCompose) {
    return (
      visibleCompose.closest('.msg-thread, .msg-convo-wrapper, [data-test-conversation-container]') ||
      visibleCompose.closest('.msg-form') ||
      visibleCompose.parentElement
    );
  }
  return null;
}

// Returns a short description of any blocking banner shown inside the active
// thread (e.g. "This member has disabled messaging" / "unable to receive").
// If any such banner is present, we must abort instead of typing into a
// phantom compose that will never deliver.
function detectUnableToReceiveBanner(scope) {
  if (!scope) return null;
  const bannerSelectors = [
    '.msg-s-message-list__event--unable-to-send',
    '.msg-connections-typeahead__member-note',
    '[class*="unable-to-send"]',
    '[class*="unable-to-receive"]',
    '[class*="cannot-send"]',
    '.msg-overlay-messaging-container--unavailable',
  ];
  for (const sel of bannerSelectors) {
    const el = scope.querySelector(sel);
    if (el && el.offsetParent !== null) {
      return (el.textContent || '').trim().substring(0, 100) || 'unable_to_receive_banner_detected';
    }
  }
  // Text-based fallback: look for unmistakable phrases in the thread
  const text = (scope.textContent || '').toLowerCase();
  const phrases = [
    'unable to receive messages',
    'no pueden recibir mensajes',
    'não pode receber mensagens',
    'nao pode receber mensagens',
    'this member only accepts messages',
    'messaging is restricted',
  ];
  for (const p of phrases) {
    if (text.includes(p)) return p;
  }
  return null;
}

// ── FIND AND CLICK MESSAGE BUTTON (v0.2.3) ──
// Used by InMail fallback: clicks the Message button on a profile page so that
// LinkedIn navigates to /messaging/thread/... where composeOnMessagingPage can
// take over. Returns success with the resulting URL.
async function findAndClickMessageButton() {
  // Safety: must be on a profile page
  const currentPath = window.location.pathname;
  if (!currentPath.startsWith('/in/')) {
    throw new Error(`WRONG_PAGE: findAndClickMessageButton requires /in/ but on ${currentPath}`);
  }

  let messageButton = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    messageButton = findMessageButton();
    if (messageButton) break;
    await sleep(1500);
  }

  if (!messageButton) {
    throw new Error('Message button not found on profile page');
  }

  console.log('[LinkedIn Copilot] Clicking Message button for InMail fallback:', messageButton.tagName, messageButton.href || '(button)');

  // If it's an <a> link, navigate directly
  if (messageButton.tagName === 'A' && messageButton.href) {
    window.location.href = messageButton.href;
  } else {
    messageButton.click();
  }

  await sleep(2000);
  return { success: true, action: 'find_and_click_message_button', url: window.location.href };
}

async function composeOnMessagingPage(messageText, expectedName) {
  console.log('[LinkedIn Copilot] Composing on messaging page. URL:', window.location.href);

  // Wait for the active thread to render AND contain a VISIBLE compose input.
  // No more "use a hidden compose element" fallback — that was the fast path
  // to sending DMs into phantom composes belonging to other threads.
  const composeSelectors = [
    'div.msg-form__contenteditable[contenteditable="true"]',
    'div[role="textbox"][contenteditable="true"]',
    'div[aria-label*="Write a message" i][contenteditable="true"]',
    'div[aria-label*="Escriba un mensaje" i][contenteditable="true"]',
    'div[aria-label*="Escreva uma mensagem" i][contenteditable="true"]',
    '[contenteditable="true"][class*="msg"]',
    '.msg-form__msg-content-container [contenteditable="true"]',
  ];

  let threadScope = null;
  let messageInput = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    threadScope = findActiveThreadContainer();
    if (threadScope) {
      // Bail out immediately if the active thread is restricted — no point
      // typing into a compose that LinkedIn will refuse to deliver.
      const banner = detectUnableToReceiveBanner(threadScope);
      if (banner) {
        throw new Error(`RECIPIENT_UNABLE_TO_RECEIVE: ${banner} (url=${window.location.pathname})`);
      }
      for (const sel of composeSelectors) {
        const el = threadScope.querySelector(sel);
        if (el && el.offsetParent !== null) { messageInput = el; break; }
      }
      if (messageInput) break;
    }

    if (attempt % 5 === 4) {
      console.log(`[LinkedIn Copilot] Visible compose input not found yet (attempt ${attempt + 1}/30). URL: ${window.location.pathname}`);
    }
    await sleep(1000);
  }

  if (!messageInput) {
    const editables = document.querySelectorAll('[contenteditable="true"]');
    const editableInfo = Array.from(editables).map(e => ({
      tag: e.tagName, cls: (e.className || '').substring(0, 60),
      label: e.getAttribute('aria-label'), role: e.getAttribute('role'),
      visible: !!e.offsetParent
    }));
    throw new Error(`Visible message compose input not found on messaging page (editables=${JSON.stringify(editableInfo)}, url=${window.location.pathname})`);
  }

  // STRICT recipient verification: read the header of the active thread ONLY
  // (not every <a, span, h2> on the page, which matches dozens of sidebar
  // conversation previews and "verifies" any name). If it doesn't match, abort.
  if (expectedName && threadScope) {
    const expectedFirst = expectedName.split(/\s+/)[0].toLowerCase();
    // Look for the conversation header within the same scaffold panel as the thread
    const headerScope =
      threadScope.closest('.scaffold-layout__detail') ||
      threadScope.closest('.msg-convo-wrapper') ||
      threadScope.parentElement ||
      threadScope;
    const headerSelectors = [
      '.msg-entity-lockup__entity-title',
      '[class*="conversation-header"] a',
      '[class*="conversation-header"] h2',
      '[class*="msg-thread"] h2',
      '.msg-thread__link-to-profile',
      '.msg-compose-form__member-name',
      '.msg-connections-typeahead__selected-pill',
      'h2.msg-entity-lockup__entity-title',
      'h2',
    ];
    let headerText = '';
    for (const sel of headerSelectors) {
      const el = headerScope.querySelector(sel);
      if (el && el.offsetParent !== null) {
        headerText = (el.textContent || '').trim().toLowerCase();
        if (headerText) break;
      }
    }
    console.log('[LinkedIn Copilot] Active thread header:', headerText || '(empty)', 'expected:', expectedName);
    const expectedLower = expectedName.toLowerCase();
    const matches =
      headerText && (
        headerText.includes(expectedFirst) ||
        headerText.includes(expectedLower) ||
        expectedLower.includes(headerText)
      );
    if (!matches) {
      throw new Error(`RECIPIENT_MISMATCH: expected "${expectedName}" but active thread header was "${headerText || '(empty)'}" (url=${window.location.pathname})`);
    }
    // Also re-check for "unable to receive" on the now-active compose — LinkedIn
    // sometimes shows the banner after the thread header loads.
    const lateBanner = detectUnableToReceiveBanner(threadScope);
    if (lateBanner) {
      throw new Error(`RECIPIENT_UNABLE_TO_RECEIVE: ${lateBanner}`);
    }
    console.log('[LinkedIn Copilot] ✅ Recipient verified strictly:', headerText);
  }

  // Capture forensic telemetry that will be returned in the success result so
  // action-completed can persist it into action_queue.result. This lets us
  // detect future variants of the 2026-04-10 "all DMs in one thread" bug
  // IMMEDIATELY (server-side) instead of waiting hours for the user to notice.
  let thread_header_final = '';
  const headerProbeSelectors = [
    '.msg-entity-lockup__entity-title',
    '[class*="conversation-header"] a',
    '[class*="conversation-header"] h2',
    '[class*="msg-thread"] h2',
    '.msg-thread__link-to-profile',
    'h2.msg-entity-lockup__entity-title',
  ];
  const headerProbeScope =
    (threadScope && threadScope.closest('.scaffold-layout__detail')) ||
    (threadScope && threadScope.parentElement) ||
    threadScope ||
    document;
  for (const sel of headerProbeSelectors) {
    const el = headerProbeScope.querySelector(sel);
    if (el && el.offsetParent !== null) {
      thread_header_final = (el.textContent || '').trim().substring(0, 80);
      if (thread_header_final) break;
    }
  }

  // ── Insert text using direct DOM manipulation (fast, works even if element is hidden) ──
  messageInput.focus();
  await sleep(500);

  // Clear existing content
  messageInput.innerHTML = '';
  messageInput.textContent = '';
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(300);

  // Strategy 1: Set innerHTML with <p> tag (how LinkedIn stores messages)
  messageInput.innerHTML = `<p>${messageText}</p>`;
  messageInput.dispatchEvent(new Event('input', { bubbles: true }));
  messageInput.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(500);

  // Verify text was set
  let composerText = (messageInput.textContent || '').trim();
  console.log(`[LinkedIn Copilot] After innerHTML set, composer has ${composerText.length} chars (expected ${messageText.length})`);

  // Strategy 2: If innerHTML didn't work, try insertText
  if (composerText.length < messageText.length * 0.5) {
    console.log('[LinkedIn Copilot] innerHTML failed, trying execCommand insertText');
    messageInput.innerHTML = '';
    messageInput.focus();
    await sleep(200);
    document.execCommand('insertText', false, messageText);
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);
    composerText = (messageInput.textContent || '').trim();
  }

  // Strategy 3: Try setting textContent directly
  if (composerText.length < messageText.length * 0.5) {
    console.log('[LinkedIn Copilot] insertText failed, trying textContent');
    messageInput.textContent = messageText;
    messageInput.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(500);
    composerText = (messageInput.textContent || '').trim();
  }

  if (composerText.length < messageText.length * 0.5) {
    throw new Error(`Failed to set message text in composer (got ${composerText.length} chars, expected ${messageText.length})`);
  }

  console.log('[LinkedIn Copilot] Message text set successfully');
  await sleep(1000);

  // ── Find Send button SCOPED to the same thread as the compose input ──
  // Critical: use the closest msg-form container to the validated compose,
  // never document.querySelector — otherwise we'd click a send button from a
  // different, unrelated thread (the original 2026-04-10 bug).
  const sendScope =
    messageInput.closest('.msg-form') ||
    messageInput.closest('.msg-form__msg-content-container') ||
    threadScope ||
    messageInput.parentElement;
  if (!sendScope) {
    throw new Error('Could not determine send button scope (no msg-form ancestor of compose)');
  }

  let sendButton = null;
  const sendSelectors = [
    'button.msg-form__send-button',
    'button[type="submit"][class*="msg-form"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Enviar" i]',
    'button[aria-label*="Envoyer" i]',
  ];

  for (let attempt = 0; attempt < 10; attempt++) {
    for (const selector of sendSelectors) {
      const btn = sendScope.querySelector(selector);
      if (btn && !btn.disabled && btn.offsetParent !== null) { sendButton = btn; break; }
    }
    if (sendButton) break;
    // Fallback: find by text — ALSO scoped to sendScope
    const scopeButtons = sendScope.querySelectorAll('button');
    for (const btn of scopeButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if ((text === 'send' || text === 'enviar' || text === 'envoyer') && !btn.disabled && btn.offsetParent !== null) {
        sendButton = btn;
        break;
      }
    }
    if (sendButton) break;
    await sleep(1000);
  }

  if (!sendButton) {
    const scopeBtns = sendScope.querySelectorAll('button');
    const btnTexts = Array.from(scopeBtns).map(b => `${b.textContent.trim().substring(0,20)}[disabled=${b.disabled}]`).slice(0, 10);
    throw new Error(`Send button not found in active thread scope (buttons=${JSON.stringify(btnTexts)})`);
  }

  console.log('[LinkedIn Copilot] Clicking Send button:', sendButton.textContent.trim(), sendButton.className);
  sendButton.click();

  // ── Robust send verification ──
  // LinkedIn's compose field can take 3-8s to clear after a successful send.
  // Previous logic waited 3s and threw if text remained → caused 9/14 false
  // positive failures on 2026-04-13.  Now we:
  //   1. Poll the composer for up to 8s (composer-cleared = definitive success)
  //   2. If composer still has text, check thread for the message (thread-match)
  //   3. Only throw if BOTH checks fail

  let composerCleared = false;
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt === 0 ? 3000 : 2000);          // 3s, then 2s, 2s, 2s = 9s max
    const remaining = (messageInput.textContent || '').trim();
    if (remaining.length === 0 || remaining.length < messageText.length * 0.3) {
      composerCleared = true;
      break;
    }
    // On first retry, try clicking send again (scoped)
    if (attempt === 0) {
      console.warn('[LinkedIn Copilot] Text still in composer after 3s, retrying send');
      const retryBtn = sendScope.querySelector('button.msg-form__send-button') || sendButton;
      if (retryBtn && !retryBtn.disabled) {
        retryBtn.click();
      }
    }
  }

  // Thread-match fallback: even if composer didn't clear, check whether the
  // message actually landed in the conversation thread.  We look for our
  // text snippet inside the last few message bubbles.
  let threadMatch = false;
  if (!composerCleared) {
    try {
      const snippet = (messageText || '').substring(0, 50).toLowerCase();
      const msgBubbles = document.querySelectorAll(
        '.msg-s-event-listitem__body, .msg-s-message-group__msg, [class*="msg-s-event"] .msg-s-event-listitem__message-bubble'
      );
      // Check last 5 bubbles
      const recentBubbles = Array.from(msgBubbles).slice(-5);
      for (const bubble of recentBubbles) {
        const bubbleText = (bubble.textContent || '').trim().toLowerCase();
        if (bubbleText.includes(snippet)) {
          threadMatch = true;
          break;
        }
      }
    } catch (e) {
      console.warn('[LinkedIn Copilot] Thread-match check failed:', e.message);
    }
  }

  const sendVerified = composerCleared || threadMatch;
  if (!sendVerified) {
    throw new Error('Message may not have been sent — compose input still has content and message not found in thread');
  }
  if (!composerCleared && threadMatch) {
    console.warn('[LinkedIn Copilot] ⚠️ Composer not cleared but message found in thread — treating as success');
  }

  console.log('[LinkedIn Copilot] ✅ Message sent successfully on messaging page');
  return {
    success: true,
    action: 'send_dm',
    note: 'sent_via_messaging_page',
    // Forensic telemetry — persisted to action_queue.result by the backend.
    // Use these to cross-check that each DM actually went to the intended
    // recipient, not whichever thread the script found first on the page.
    telemetry: {
      // The final URL the content script was on when it sent the DM.
      url_path: window.location.pathname,
      // Header of the thread the DM was actually delivered into. This is the
      // single most important field — if it stops matching `expected_name`
      // across multiple leads, the 2026-04-10 bug is back.
      thread_header: thread_header_final || null,
      // The expected recipient name passed in from the profile page heading.
      expected_name: expectedName || null,
      // First 40 chars of the DM text — used to distinguish which lead's
      // generated_message was delivered (each lead has unique personalized text).
      text_preview: (messageText || '').substring(0, 40),
      // Timestamp of delivery (client-side).
      sent_at_client: new Date().toISOString(),
    },
  };
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
// CHECK REPLY STATUS
// ──────────────────────────────────────────────
// Author-based detection: we read every message bubble in the thread and
// bucket it into "ours" vs "theirs" based on the sender's profile link or
// an explicit "You" marker. A reply exists iff at least one bubble belongs
// to the lead. Replaces the old `chatMessages.length > 1` heuristic which
// false-positived on any thread with prior history and false-negatived
// when our DM hadn't rendered yet.
// ══════════════════════════════════════════════
async function checkReplyStatus(action) {
  // ── SAFETY: Verify we are on a profile page ──
  const currentPath = window.location.pathname;
  if (!currentPath.startsWith('/in/')) {
    throw new Error(`WRONG_PAGE: checkReplyStatus requires a profile page (/in/...) but current URL is ${currentPath}`);
  }

  const leadUrl = action?.action_data?.linkedin_url || action?.linkedin_url || "";
  // Extract the lead's LinkedIn slug from the URL — we'll match it against
  // profile links inside the chat thread to classify who sent each message.
  const leadSlug = extractLinkedinSlug(leadUrl);

  const messageButton = findMessageButton();
  if (!messageButton) {
    return { success: true, action: 'check_reply_status', has_reply: false, note: 'not_connected' };
  }

  messageButton.click();
  await sleep(2500 + Math.random() * 1500);

  // Wait up to 4s for bubbles to render (slow networks)
  let events = [];
  for (let i = 0; i < 8; i++) {
    events = Array.from(document.querySelectorAll('.msg-s-event-listitem, .msg-s-message-list__event'));
    if (events.length > 0) break;
    await sleep(500);
  }

  const close = () => {
    const closeBtn = document.querySelector('.msg-overlay-bubble-header button[aria-label*="Close" i]');
    if (closeBtn) closeBtn.click();
  };

  if (events.length === 0) {
    close();
    return { success: true, action: 'check_reply_status', has_reply: false, note: 'no_messages_found' };
  }

  // Classify each event as "ours" or "theirs" or "unknown".
  // Heuristics, in order of reliability:
  //   1. Event has .msg-s-event-listitem__message-bubble--msg-arrived-while-scrolled signals
  //      irrelevant, skip.
  //   2. Author link href contains the lead's slug → theirs.
  //   3. Author link href contains "/in/me/" or the event has
  //      aria-label starting with "You " → ours.
  //   4. Fallback: the first event in the thread is usually ours (our DM),
  //      mark subsequent events with a *different* author as theirs.
  let lastAuthorHref = null;
  let firstAuthorHref = null;
  const classified = [];
  for (const ev of events) {
    // Find the author link for this event (or reuse the previous one,
    // because LinkedIn groups consecutive messages under one author header).
    const authorLink = ev.querySelector('a.msg-s-message-group__profile-link, a.msg-s-event-listitem__link, a[href*="/in/"]');
    const href = authorLink?.getAttribute('href') || lastAuthorHref;
    if (href) {
      lastAuthorHref = href;
      if (!firstAuthorHref) firstAuthorHref = href;
    }

    // Message text
    const bodyEl = ev.querySelector('.msg-s-event-listitem__body, .msg-s-event__content');
    const text = (bodyEl?.textContent || '').trim();
    if (!text) continue;

    // Skip edit-notice / system rows
    if (/^(edited|sent|seen|delivered)$/i.test(text)) continue;

    let who = 'unknown';
    if (leadSlug && href && href.includes(`/in/${leadSlug}`)) {
      who = 'theirs';
    } else if (href && /\/in\/(me|ACoAA)/i.test(href)) {
      // LinkedIn's "You" profile often resolves to /in/me or the session user's own ACoAA-id
      who = 'ours';
    }
    classified.push({ who, text, href });
  }

  // Fallback classification: if nothing was marked "theirs" yet but we saw
  // at least two *distinct* author hrefs, the second distinct author is
  // almost certainly the lead.
  const distinctHrefs = [...new Set(classified.map(c => c.href).filter(Boolean))];
  if (!classified.some(c => c.who === 'theirs') && distinctHrefs.length >= 2) {
    // Assume the first distinct author is "ours" (we sent the DM first).
    const oursHref = distinctHrefs[0];
    for (const c of classified) {
      if (c.href && c.href !== oursHref) c.who = 'theirs';
      else if (c.href === oursHref) c.who = 'ours';
    }
  }

  const theirs = classified.filter(c => c.who === 'theirs');
  const hasReply = theirs.length > 0;
  // Last reply text — truncated to 2KB to keep action_queue payloads small.
  const replyText = hasReply ? theirs[theirs.length - 1].text.slice(0, 2000) : null;

  await sleep(500);
  close();

  return {
    success: true,
    action: 'check_reply_status',
    has_reply: hasReply,
    reply_text: replyText,
    reply_count: theirs.length,
    total_events: classified.length,
    detection_method: distinctHrefs.length >= 2 ? 'distinct_authors' : (leadSlug ? 'slug_match' : 'heuristic_only'),
  };
}

// Extract the LinkedIn slug (the part after /in/) from a full profile URL.
function extractLinkedinSlug(url) {
  if (!url) return null;
  const m = url.match(/\/in\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]).toLowerCase() : null;
}

// ══════════════════════════════════════════════
// GROWTH MODE — FIND LATEST POST
// ──────────────────────────────────────────────
// Navigates to the "recent activity" / posts section of a profile
// and extracts the most recent post's URL and text content.
// ══════════════════════════════════════════════
async function findLatestPost() {
  // Verify we're on a profile page
  const currentPath = window.location.pathname;
  if (!currentPath.startsWith('/in/')) {
    throw new Error(`WRONG_PAGE: findLatestPost requires /in/... but got ${currentPath}`);
  }

  await sleep(1000 + Math.random() * 1500);

  // Strategy 1: Look for "Activity" / "Recent Activity" section on the profile
  // LinkedIn shows a "Show all activity" or "See all posts" link
  const activitySelectors = [
    'a[href*="/recent-activity/"]',
    'a[href*="/recent-activity/all/"]',
    'a[href*="/recent-activity/shares/"]',
    'a[href*="/detail/recent-activity/"]',
  ];

  let activityLink = null;
  for (const sel of activitySelectors) {
    activityLink = document.querySelector(sel);
    if (activityLink) break;
  }

  // If no activity link found, try scrolling down to find the activity section
  if (!activityLink) {
    for (let i = 0; i < 5; i++) {
      window.scrollBy(0, 600);
      await sleep(800);
      for (const sel of activitySelectors) {
        activityLink = document.querySelector(sel);
        if (activityLink) break;
      }
      if (activityLink) break;
    }
  }

  // Extract the vanity name for the activity URL
  const vanityMatch = currentPath.match(/^\/in\/([^/]+)/);
  const vanityName = vanityMatch ? vanityMatch[1] : null;

  if (!activityLink && vanityName) {
    // Navigate directly to the activity page
    const activityUrl = `https://www.linkedin.com/in/${vanityName}/recent-activity/all/`;
    console.log('[LinkedIn Copilot] No activity link found, navigating directly to:', activityUrl);
    window.location.href = activityUrl;
    await sleep(3000 + Math.random() * 2000);
    await waitForLinkedInReady();
  } else if (activityLink) {
    activityLink.click();
    await sleep(3000 + Math.random() * 2000);
    await waitForLinkedInReady();
  }

  // Now we should be on the activity page — find the latest post
  await sleep(1500);

  // LinkedIn activity feed: each post is in a container with data-urn or
  // inside .feed-shared-update-v2 or similar
  const postSelectors = [
    '.feed-shared-update-v2',
    '[data-urn*="activity"]',
    '.profile-creator-shared-feed-update__container',
    '.occludable-update',
  ];

  let postEl = null;
  for (const sel of postSelectors) {
    const posts = document.querySelectorAll(sel);
    if (posts.length > 0) {
      postEl = posts[0]; // First = most recent
      break;
    }
  }

  if (!postEl) {
    // Try scrolling once more
    window.scrollBy(0, 400);
    await sleep(1500);
    for (const sel of postSelectors) {
      const posts = document.querySelectorAll(sel);
      if (posts.length > 0) {
        postEl = posts[0];
        break;
      }
    }
  }

  if (!postEl) {
    return {
      success: true,
      action: 'find_latest_post',
      found: false,
      note: 'no_posts_found',
      url: window.location.href,
    };
  }

  // Extract post text
  const textEl = postEl.querySelector(
    '.feed-shared-text, .break-words, .update-components-text, [dir="ltr"]'
  );
  const postText = textEl ? textEl.textContent.trim().substring(0, 1500) : '';

  // Extract post URL (the activity/post permalink)
  let postUrl = null;
  const postLink = postEl.querySelector(
    'a[href*="/feed/update/"], a[href*="/posts/"], a[href*="/pulse/"]'
  );
  if (postLink) {
    postUrl = postLink.href.split('?')[0]; // Clean URL
  }

  // Fallback: try data-urn attribute
  if (!postUrl) {
    const urnEl = postEl.closest('[data-urn]') || postEl.querySelector('[data-urn]');
    const urn = urnEl ? urnEl.getAttribute('data-urn') : null;
    if (urn) {
      // Convert urn:li:activity:12345 → /feed/update/urn:li:activity:12345
      postUrl = `https://www.linkedin.com/feed/update/${urn}`;
    }
  }

  // Extract post author (to verify it's actually their post, not a reshare)
  const authorEl = postEl.querySelector(
    '.update-components-actor__name, .feed-shared-actor__name, [data-anonymize="person-name"]'
  );
  const postAuthor = authorEl ? authorEl.textContent.trim() : null;

  // Extract engagement metrics if visible
  const likesEl = postEl.querySelector(
    '.social-details-social-counts__reactions-count, [aria-label*="reaction"], [aria-label*="like"]'
  );
  const likesText = likesEl ? likesEl.textContent.trim() : null;

  const commentsEl = postEl.querySelector(
    '.social-details-social-counts__comments, [aria-label*="comment"]'
  );
  const commentsText = commentsEl ? commentsEl.textContent.trim() : null;

  console.log(`[LinkedIn Copilot] Found latest post: ${postUrl}, author: ${postAuthor}, text: ${postText.substring(0, 80)}...`);

  return {
    success: true,
    action: 'find_latest_post',
    found: true,
    post_url: postUrl,
    post_content: postText,
    post_author: postAuthor,
    engagement: { likes: likesText, comments: commentsText },
    note: postUrl ? 'post_found' : 'post_found_no_url',
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

  // If we're on the post URL directly, find the like button
  // If we're on the activity page, like the first post

  const postContainers = document.querySelectorAll(
    '.feed-shared-update-v2, [data-urn*="activity"], .occludable-update, .profile-creator-shared-feed-update__container'
  );

  let targetPost = postContainers.length > 0 ? postContainers[0] : document;

  // If we have a specific post URL and we're on that page, the main content is the post
  if (postUrl && window.location.href.includes('/feed/update/')) {
    targetPost = document;
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

  console.log(`[LinkedIn Copilot] Like post result: ${isNowActive ? 'liked' : 'uncertain'}`);

  return {
    success: true,
    action: 'like_post',
    liked: true,
    confirmed: isNowActive,
    url: window.location.href,
  };
}

// ══════════════════════════════════════════════
// GROWTH MODE — POST COMMENT
// ──────────────────────────────────────────────
// Posts a comment on a LinkedIn post. Assumes we're already on the
// post page or the activity feed with the target post visible.
// ══════════════════════════════════════════════
async function postComment(postUrl, commentText) {
  if (!commentText || commentText.trim().length === 0) {
    throw new Error('No comment text provided');
  }

  await sleep(1000 + Math.random() * 1500);

  // Find the first post container
  const postContainers = document.querySelectorAll(
    '.feed-shared-update-v2, [data-urn*="activity"], .occludable-update'
  );
  const targetPost = postContainers.length > 0 ? postContainers[0] : document;

  // Step 1: Click the "Comment" button to open the comment box
  const commentBtnSelectors = [
    'button[aria-label*="Comment" i]',
    'button[aria-label*="Comentar" i]',
    'button[aria-label*="Commenter" i]',
    'button[aria-label*="Comentario" i]',
  ];

  let commentBtn = null;
  for (const sel of commentBtnSelectors) {
    const candidates = targetPost.querySelectorAll(sel);
    for (const btn of candidates) {
      if (btn.offsetParent === null) continue;
      commentBtn = btn;
      break;
    }
    if (commentBtn) break;
  }

  // Fallback: text-based search
  if (!commentBtn) {
    const allButtons = targetPost.querySelectorAll('button');
    for (const btn of allButtons) {
      if (btn.offsetParent === null) continue;
      const text = (btn.textContent || '').toLowerCase().trim();
      if (text === 'comment' || text === 'comentar' || text === 'commenter') {
        commentBtn = btn;
        break;
      }
    }
  }

  if (!commentBtn) {
    throw new Error('Comment button not found on post');
  }

  commentBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(500 + Math.random() * 500);
  commentBtn.click();
  await sleep(2000 + Math.random() * 1500);

  // Step 2: Find the comment input (contenteditable div or textarea)
  const commentInputSelectors = [
    '.comments-comment-box__form .ql-editor',
    '.comments-comment-texteditor .ql-editor',
    '[contenteditable="true"][data-placeholder*="comment" i]',
    '[contenteditable="true"][data-placeholder*="comentar" i]',
    '[contenteditable="true"][aria-label*="comment" i]',
    '[contenteditable="true"][role="textbox"]',
    '.editor-content [contenteditable="true"]',
  ];

  let commentInput = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    for (const sel of commentInputSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        commentInput = el;
        break;
      }
    }
    if (commentInput) break;
    await sleep(1000);
  }

  if (!commentInput) {
    throw new Error('Comment input not found after clicking comment button');
  }

  // Step 3: Focus and type the comment with human-like delays
  commentInput.focus();
  await sleep(300);

  // Clear any existing content
  commentInput.innerHTML = '';
  await sleep(200);

  // Type character by character with random delays for human-like behavior
  const text = commentText.trim();
  for (let i = 0; i < text.length; i++) {
    // Insert text progressively
    commentInput.textContent = text.substring(0, i + 1);
    // Dispatch input event so LinkedIn's React picks it up
    commentInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Random typing speed: fast for most chars, occasional pause
    if (i % 20 === 0 && i > 0) {
      await sleep(200 + Math.random() * 400); // Thinking pause
    } else {
      await sleep(30 + Math.random() * 70);
    }
  }

  // Final input event
  commentInput.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(1000 + Math.random() * 500);

  // Step 4: Find and click the Submit/Post button for the comment
  const submitSelectors = [
    '.comments-comment-box__submit-button',
    'button.comments-comment-box__submit-button',
    'button[aria-label*="Post comment" i]',
    'button[aria-label*="Publicar" i]',
    'button[aria-label*="Publier" i]',
    'button[type="submit"]',
  ];

  let submitBtn = null;
  for (const sel of submitSelectors) {
    const candidates = document.querySelectorAll(sel);
    for (const btn of candidates) {
      if (btn.offsetParent === null) continue;
      if (btn.disabled) continue;
      submitBtn = btn;
      break;
    }
    if (submitBtn) break;
  }

  // Fallback: find "Post" button near the comment input
  if (!submitBtn) {
    const commentBox = commentInput.closest('.comments-comment-box, .comments-comment-texteditor, form');
    if (commentBox) {
      const btns = commentBox.querySelectorAll('button');
      for (const btn of btns) {
        const text = (btn.textContent || '').toLowerCase().trim();
        if ((text === 'post' || text === 'publicar' || text === 'publier' || text === 'submit') && !btn.disabled) {
          submitBtn = btn;
          break;
        }
      }
    }
  }

  if (!submitBtn) {
    throw new Error('Comment submit button not found or disabled');
  }

  submitBtn.click();
  await sleep(2500 + Math.random() * 1500);

  // Step 5: Verify comment was posted (comment box should be empty or closed)
  const inputAfter = document.querySelector(commentInputSelectors[0]) || commentInput;
  const inputText = (inputAfter.textContent || '').trim();
  const success = inputText.length === 0 || inputText !== text;

  console.log(`[LinkedIn Copilot] Comment posted: ${success ? 'yes' : 'uncertain'}, text preview: "${text.substring(0, 50)}..."`);

  return {
    success: true,
    action: 'post_comment',
    posted: success,
    comment_preview: text.substring(0, 100),
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
  console.warn('[LinkedIn Copilot] Page may not be fully loaded after timeout, continuing anyway');
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

async function findConnectButton() {
  // New LinkedIn layout (2026): "Connect" is an <a> link already present in the DOM
  // with href containing "custom-invite". Works for both "Follow first" profiles
  // (where Connect is in the More dropdown) and standard profiles.
  const connectMenuItem = document.querySelector('a[href*="custom-invite"]');
  if (connectMenuItem && connectMenuItem.offsetParent !== null) return connectMenuItem;

  const selectors = [
    'main button[aria-label*="connect" i]:not([aria-label*="disconnect" i])',
    'main button[aria-label*="Invite" i]',
    '.pvs-profile-actions button[aria-label*="connect" i]',
    '.pv-top-card-v2-ctas button[aria-label*="connect" i]',
    'div.artdeco-dropdown__content button[aria-label*="connect" i]',
    'button[aria-label*="connect" i][data-control-name*="connect" i]',
  ];

  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn && btn.offsetParent !== null) return btn;
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
      const customInviteAfterMore = document.querySelector('a[href*="custom-invite"]');
      if (customInviteAfterMore) return customInviteAfterMore;

      // Search in all visible dropdown containers (legacy + new layout)
      const dropdowns = document.querySelectorAll('div.artdeco-dropdown__content, div.artdeco-dropdown__content--is-open, ul[role="menu"], div[role="menu"]');
      for (const dropdown of dropdowns) {
        if (!dropdown.offsetParent) continue;
        // Try aria-label match first
        const connectByLabel = dropdown.querySelector('[aria-label*="connect" i]:not([aria-label*="disconnect" i])');
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
      const connectLink = document.querySelector('a[role="menuitem"] div[aria-label*="connect" i]:not([aria-label*="disconnect" i])');
      if (connectLink && connectLink.offsetParent !== null) {
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
          if (!isMainButton) {
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
    if (btn.textContent.trim().toLowerCase() === 'connect' && btn.offsetParent !== null) {
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
    console.warn('[LinkedIn Copilot] No dialog found for Add a note');
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
    console.log('[LinkedIn Copilot] Found likely Add a note button via class heuristic');
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
        console.log('[LinkedIn Copilot] Send button disabled — re-triggering textarea events');
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
          console.warn('[LinkedIn Copilot] Force-clicking disabled Send button as last resort');
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

// Reject hrefs that point to the messaging inbox root instead of a specific
// compose/thread. This was the root cause of the "all DMs land in the same
// thread" incident (2026-04-10): findMessageButton used to fall back to
// document.querySelector('a[href*="/messaging/"]') which always matched the
// top-nav Messaging icon (href="/messaging/"), causing the extension to
// redirect every lead to the inbox root — which opens whichever thread the
// user had open last. A valid profile Message link MUST contain /messaging/compose/
// or /messaging/thread/new/ (never plain /messaging/).
function isValidMessageHref(href) {
  if (!href) return false;
  try {
    const u = new URL(href, window.location.origin);
    if (u.hostname && u.hostname !== window.location.hostname) return false;
    const p = u.pathname || '';
    // Plain inbox — reject
    if (p === '/messaging' || p === '/messaging/') return false;
    // Inbox with query but no compose path — reject
    if (p === '/messaging' || p.startsWith('/messaging') && !p.includes('/compose') && !p.includes('/thread/new')) return false;
    return p.includes('/messaging/compose') || p.includes('/messaging/thread/new');
  } catch (_) {
    return false;
  }
}

// Check that an element is inside the profile's top-card / primary-actions
// area, not in the left/right rails, sidebar, footer, global nav, etc.
function isInsideProfileTopCard(el) {
  if (!el) return false;
  // Reject anything inside the global nav bar
  if (el.closest('nav, header, .global-nav, #global-nav, [class*="global-nav"]')) return false;
  // Reject sidebars / rails / footer
  if (el.closest('aside, footer, [class*="right-rail"], [class*="left-rail"], [class*="rail-"]')) return false;
  const profileNameEl = document.querySelector('main h1') || document.querySelector('main h2');
  if (!profileNameEl) return false;
  // The top-card / primary-actions container usually wraps the h1. We accept
  // anything in the same section/card as the h1, OR any descendant of <main>
  // provided it's not in a rail/nav.
  const topCard = profileNameEl.closest('section, [class*="pv-top-card"], [class*="top-card"], .artdeco-card, [data-view-name]');
  if (topCard && topCard.contains(el)) return true;
  const main = document.querySelector('main');
  if (main && main.contains(el)) return true;
  return false;
}

function findMessageButton() {
  // Strategy 1: Prefer scoped search inside the profile top-card / primary-actions.
  const profileNameEl = document.querySelector('main h1') || document.querySelector('main h2');
  if (profileNameEl) {
    // Walk up a few levels looking for the card that contains the action buttons
    const candidates = [
      profileNameEl.closest('[class*="pv-top-card"]'),
      profileNameEl.closest('[class*="top-card"]'),
      profileNameEl.closest('section'),
      profileNameEl.closest('.artdeco-card'),
      profileNameEl.closest('[data-view-name]'),
      profileNameEl.parentElement?.parentElement,
      profileNameEl.parentElement?.parentElement?.parentElement,
    ].filter(Boolean);

    const scopedSelectors = [
      'a[href*="/messaging/compose/"]',
      'a[href*="/messaging/thread/new"]',
      'button[aria-label*="Message" i]',
    ];

    for (const scope of candidates) {
      for (const sel of scopedSelectors) {
        const els = scope.querySelectorAll(sel);
        for (const el of els) {
          if (el.offsetParent === null) continue;
          // For <a> elements, require a compose/thread-new href
          if (el.tagName === 'A' && !isValidMessageHref(el.href)) continue;
          console.log('[LinkedIn Copilot] findMessageButton: found (scoped)', sel, 'href:', el.href || '(button)');
          return el;
        }
      }
      // Text-based match inside the scope (e.g. localized)
      const clickables = scope.querySelectorAll('button, a[role="button"], a');
      for (const el of clickables) {
        if (el.offsetParent === null) continue;
        const text = (el.textContent || '').trim().toLowerCase();
        const label = (el.getAttribute('aria-label') || '').toLowerCase();
        const isMessageText =
          text === 'message' || text === 'mensagem' || text === 'mensaje' ||
          label === 'message' || label.includes('message ') || label.startsWith('message');
        if (!isMessageText) continue;
        // For <a>, must have a valid compose href (reject navbar inbox link)
        if (el.tagName === 'A' && !isValidMessageHref(el.href)) continue;
        console.log('[LinkedIn Copilot] findMessageButton: found (scoped text)', 'href:', el.href || '(button)');
        return el;
      }
    }
  }

  // Strategy 2: Global search but with strict href validation — rejects the
  // global-nav "Messaging" icon which has href="/messaging/" (inbox root).
  const strictSelectors = [
    'a[href*="/messaging/compose/"]',
    'a[href*="/messaging/thread/new"]',
    'button[aria-label*="Message" i]',
  ];
  for (const sel of strictSelectors) {
    const els = document.querySelectorAll(sel);
    for (const el of els) {
      if (el.offsetParent === null) continue;
      if (el.tagName === 'A' && !isValidMessageHref(el.href)) continue;
      if (!isInsideProfileTopCard(el)) continue;
      console.log('[LinkedIn Copilot] findMessageButton: found (strict global)', sel, 'href:', el.href || '(button)');
      return el;
    }
  }

  // Diagnostic: log what buttons are visible for debugging
  const allBtns = document.querySelectorAll('button, a[role="button"], a[href*="messaging"]');
  const btnTexts = Array.from(allBtns).filter(b => b.offsetParent !== null).map(b => `${b.textContent.trim().substring(0, 30)}[${b.href || ''}]`).slice(0, 10);
  console.error('[LinkedIn Copilot] findMessageButton: FAILED. Visible clickables:', JSON.stringify(btnTexts));

  return null;
}

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
      console.log('[LinkedIn Copilot] Note inserted via native setter ✅');
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
    console.log('[LinkedIn Copilot] Note inserted via execCommand ✅');
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
      console.log('[LinkedIn Copilot] Note inserted via paste ✅');
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
  console.log('[LinkedIn Copilot] Note inserted via chunk typing');
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
      console.log(`[LinkedIn Copilot] Note retry successful: ${result.length}/${text.trim().length} chars ✅`);
      return true;
    }
  }

  console.error(`[LinkedIn Copilot] Note retry failed. Proceeding with whatever was typed.`);
  return false;
}

// ── HUMAN-LIKE TYPING ──

async function typeHumanLike(element, text) {
  element.focus();

  if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
    // Use robust approach for textareas (same as note insertion)
    await typeNoteRobust(element, text);
  } else {
    // For contenteditable divs (LinkedIn messages):
    // Insert in a single operation to minimize React mutation/corruption risk.
    element.focus();

    // Move cursor to end
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    const expectedText = normalizeMessageText(text);
    let inserted = false;

    // Try paste event first (closest to normal user behavior in LinkedIn composer)
    try {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });

      element.dispatchEvent(pasteEvent);
      await sleep(90);

      const pastedText = normalizeMessageText(element.textContent || '');
      inserted = pastedText === expectedText;
    } catch (e) {
      inserted = false;
    }

    // Fallback: execCommand insertText with full payload
    if (!inserted) {
      document.execCommand('insertText', false, text);
      await sleep(100);
      const cmdText = normalizeMessageText(element.textContent || '');
      inserted = cmdText === expectedText;
    }

    // Last-resort deterministic set
    if (!inserted) {
      element.innerHTML = '';
      element.textContent = text;
      await sleep(80);
    }

    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));

    // Final verification: check if the text matches
    await sleep(120);
    const finalText = normalizeMessageText(element.textContent || '');

    if (finalText !== expectedText) {
      console.warn(`[LinkedIn Copilot] Text mismatch detected. Expected ${expectedText.length} chars, got ${finalText.length}. Attempting full replace.`);
      // Nuclear option: clear and set via single insert with proper events
      element.focus();
      element.innerHTML = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(200);

      // Insert the full text as a single operation
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(element);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText', false, text);
      element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      await sleep(250);

      // Final check (strict)
      const recheckText = normalizeMessageText(element.textContent || '');
      if (recheckText !== expectedText) {
        console.error('[LinkedIn Copilot] Message integrity failure after retry. Blocking send.');
        throw new Error('Message integrity failure: typed text does not match expected DM');
      }

      console.log('[LinkedIn Copilot] Text corrected via full replace');
    }
  }
}

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
