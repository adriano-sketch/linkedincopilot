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
    case 'check_connection_status':
      return await checkConnectionStatus();
    case 'check_reply_status':
      return await checkReplyStatus();
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
    const howDoYouKnowModal = document.querySelector('div[role="dialog"]');
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
      const diag = document.querySelector('div[role="dialog"]');
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
  const dialogStillOpen = document.querySelector('div[role="dialog"]');
  if (dialogStillOpen) {
    const errorMsg = dialogStillOpen.querySelector('.artdeco-inline-feedback__message');
    if (errorMsg) {
      throw new Error(`LinkedIn error: ${errorMsg.textContent.trim()}`);
    }
    const limitWarning = dialogStillOpen.textContent;
    if (limitWarning.toLowerCase().includes('limit') || limitWarning.toLowerCase().includes('restriction')) {
      throw new Error('LinkedIn connection request limit reached');
    }
  }

  return { success: true, action: 'send_connection_request', note: noteText ? 'sent_with_note' : 'sent_without_note' };
}

// ══════════════════════════════════════════════
// SEND MESSAGE (DM / Follow-up)
// ══════════════════════════════════════════════
async function sendMessage(messageText) {
  if (!messageText || messageText.trim().length === 0) {
    throw new Error('No message text provided');
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

  // ── STEP 0.5: Capture the profile name from the page h1 ──
  const profileH1 = document.querySelector('main h1');
  const profileName = profileH1 ? profileH1.textContent.trim().toLowerCase() : null;
  console.log('[LinkedIn Copilot] Target profile name from h1:', profileName);

  // ── STEP 1: Click the Message button on their profile ──
  const messageButton = findMessageButton();

  if (!messageButton) {
    throw new Error('Message button not found — may not be connected');
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
  let sendVerified = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleep(800 + attempt * 500);
    const remainingText = normalizeMessageText(readComposerText(messageInput));
    const expectedText = normalizeMessageText(messageText);

    if (remainingText.length === 0 || remainingText !== expectedText) {
      // Composer cleared or changed = send succeeded
      sendVerified = true;
      break;
    }

    // Text still in composer — try clicking send again
    console.warn(`[LinkedIn Copilot] Send verification attempt ${attempt + 1}: text still in composer, retrying send`);
    const retryBtn = findMessageSendButton(messageOverlay);
    if (retryBtn && !retryBtn.disabled) {
      retryBtn.click();
      await sleep(1500);
    }
  }

  // ── STEP 6: Always close the message overlay ──
  await closeMessageOverlay(messageOverlay);

  if (!sendVerified) {
    throw new Error('Send verification failed — message text remained in composer after clicking Send');
  }

  return { success: true, action: 'send_dm' };
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
// CHECK CONNECTION STATUS
// ══════════════════════════════════════════════
async function checkConnectionStatus() {
  await sleep(1000 + Math.random() * 1000);

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const profileNameEl = document.querySelector('main h1');
  if (!profileNameEl) {
    return { success: true, action: 'check_connection_status', is_connected: false, note: 'no_h1_found', confidence: 'weak' };
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

  const degreeTexts = [...profileSection.querySelectorAll('span, li, div')]
    .map((el) => normalize(el.textContent || ''))
    .filter((txt) => txt && txt.length <= 48);
  const degreeBlob = degreeTexts.join(' | ');
  const hasFirstDegree = /(\b1st\b|\b1º\b|\b1er\b|\b1\.? grau\b|\b1\.? grado\b|\b1\.? degree\b)/i.test(degreeBlob);

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
      return { success: true, action: 'check_connection_status', is_connected: true, note: 'message_button_1st', confidence: 'strong' };
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
// ══════════════════════════════════════════════
async function checkReplyStatus() {
  const messageButton = findMessageButton();
  if (!messageButton) {
    return { success: true, action: 'check_reply_status', has_reply: false, note: 'not_connected' };
  }

  messageButton.click();
  await sleep(2500 + Math.random() * 1500);

  // Look for messages in the chat overlay that are NOT from us
  const chatMessages = document.querySelectorAll(
    '.msg-s-event-listitem, .msg-s-message-list__event'
  );

  if (chatMessages.length === 0) {
    const closeBtn = document.querySelector('.msg-overlay-bubble-header button[aria-label*="Close" i]');
    if (closeBtn) closeBtn.click();
    return { success: true, action: 'check_reply_status', has_reply: false, note: 'no_messages_found' };
  }

  // Simple heuristic: if there are more messages than what we sent (1 DM), they replied
  const hasReply = chatMessages.length > 1;

  const closeBtn = document.querySelector('.msg-overlay-bubble-header button[aria-label*="Close" i]');
  if (closeBtn) {
    await sleep(500);
    closeBtn.click();
  }

  return {
    success: true,
    action: 'check_reply_status',
    has_reply: hasReply
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
        document.querySelector('div[role="dialog"]') ||
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
    dialog = document.querySelector('div[role="dialog"]') ||
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
    const dialog = document.querySelector('div[role="dialog"]') ||
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

function findMessageButton() {
  const selectors = [
    'main button[aria-label*="Message" i]',
    '.pvs-profile-actions button[aria-label*="Message" i]',
    'a[href*="messaging"][aria-label*="Message" i]',
  ];

  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn && btn.offsetParent !== null) return btn;
  }

  // Fallback by text
  const allButtons = document.querySelectorAll('main button, .pvs-profile-actions button');
  for (const btn of allButtons) {
    if (btn.textContent.trim().toLowerCase() === 'message' && btn.offsetParent !== null) {
      return btn;
    }
  }

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
