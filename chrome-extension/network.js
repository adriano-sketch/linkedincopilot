// ═══════════════════════════════════════════════════
// LinkedIn Copilot — "Rede" module (network growth + post monitoring)
// Loaded by background.js via importScripts('network.js').
//
// Action types (all carry action_data.module === 'network'):
//   network_search_people     open a people search page and read the result cards
//   network_search_posts      open a post search page and read the posts
//   network_sync_connections  read recent connections + pending sent invitations
//   network_withdraw_invites  withdraw a few invitations pending for too long
// send_connection_request and post_comment reuse the existing content.js flows.
//
// Page readers are self-contained functions injected with chrome.scripting.executeScript.
// They rely on text and link patterns (not CSS class names) because LinkedIn changes
// class names often. Each reader returns a small `debug` block when it finds nothing,
// so layout changes can be diagnosed from action_queue.result.
// ═══════════════════════════════════════════════════

const NETWORK_ACTION_TYPES = [
  'network_search_people',
  'network_search_posts',
  'network_sync_connections',
  'network_withdraw_invites',
];

function isNetworkAction(action) {
  return !!(action && action.action_data && action.action_data.module === 'network');
}

// ── Page reader: people search results ─────────────────────────────────────
async function lcReadPeopleSearch() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const lower = (t) => norm(t).toLowerCase();

  // Wait for results (or for an empty/limit state)
  for (let i = 0; i < 20; i++) {
    if (document.querySelectorAll('main a[href*="/in/"]').length > 0) break;
    const body = lower(document.body && document.body.innerText);
    if (body.includes('no results found') || body.includes('nenhum resultado')) break;
    await sleep(500);
  }

  const bodyText = lower(document.body && document.body.innerText);
  const LIMIT_PHRASES = [
    'commercial use limit', 'reached the monthly limit for profile searches',
    'limite de uso comercial', 'atingiu o limite mensal de pesquisas',
  ];
  if (LIMIT_PHRASES.some((p) => bodyText.includes(p))) {
    return { success: true, limit_reached: true, profiles: [], has_next: false };
  }

  // Scroll like a person reading the page so lazy cards render
  for (let i = 0; i < 5; i++) {
    window.scrollBy(0, 500 + Math.random() * 300);
    await sleep(700 + Math.random() * 700);
  }
  window.scrollTo(0, document.body.scrollHeight);
  await sleep(1200);

  const anchors = Array.from(document.querySelectorAll('main a[href*="/in/"]'));
  const containers = [];
  const seen = new Set();
  for (const a of anchors) {
    const m = (a.getAttribute('href') || '').match(/\/in\/([^/?#]+)/);
    if (!m) continue;
    const slug = m[1].toLowerCase();
    if (seen.has(slug)) continue;
    const box = a.closest('li') || a.closest('[data-chameleon-result-urn]') || a.closest('[data-view-name="search-entity-result-universal-template"]');
    if (!box) continue;
    // Skip "people also viewed"/ads blocks outside the main result list
    if (box.querySelectorAll('a[href*="/in/"]').length > 6) continue;
    seen.add(slug);
    containers.push({ slug, href: a.href, box });
  }

  const DEGREE_RE = /(?:^|\s|•)\s*(1st|2nd|3rd\+?|1º|2º|3º\+?)(?:\s|$)/i;
  const profiles = [];
  for (const { slug, href, box } of containers) {
    const raw = (box.innerText || '').split('\n').map(norm).filter(Boolean);
    const lines = raw.filter((l, i) => l !== raw[i - 1]);
    const text = lines.join(' | ');
    const anchor = box.querySelector(`a[href*="/in/${slug}"]`) || box.querySelector('a[href*="/in/"]');
    let name = norm(anchor && (anchor.querySelector('span[aria-hidden="true"]') || anchor).textContent);
    name = name.replace(/view .*profile$/i, '').replace(/ver perfil.*$/i, '').trim();
    if (!name || /linkedin member|membro do linkedin/i.test(name)) continue;

    const degreeMatch = text.match(DEGREE_RE);
    let degree = degreeMatch ? degreeMatch[1].toLowerCase() : null;
    if (degree) degree = degree.replace('º', degree.startsWith('1') ? 'st' : degree.startsWith('2') ? 'nd' : 'rd');

    let mutual = null;
    let mm;
    if ((mm = text.match(/(\d[\d.,]*)\s+other mutual connections?/i))) mutual = parseInt(mm[1].replace(/\D/g, ''), 10) + 2;
    else if ((mm = text.match(/(\d[\d.,]*)\s+outras?\s+conex(?:ão|ões) em comum/i))) mutual = parseInt(mm[1].replace(/\D/g, ''), 10) + 2;
    else if ((mm = text.match(/(\d[\d.,]*)\s+mutual connections?/i))) mutual = parseInt(mm[1].replace(/\D/g, ''), 10);
    else if ((mm = text.match(/(\d[\d.,]*)\s+conex(?:ão|ões) em comum/i))) mutual = parseInt(mm[1].replace(/\D/g, ''), 10);
    else if (/are mutual connections|são conexões em comum/i.test(text)) mutual = 2;
    else if (/is a mutual connection|é uma conexão em comum/i.test(text)) mutual = 1;

    // Headline / location = first informative lines after the name
    const skip = (l) =>
      l === name || (l.startsWith(name) && /profile|perfil|•|\b(1st|2nd|3rd)\b/i.test(l)) ||
      DEGREE_RE.test(` ${l} `) && l.length < 20 || /view .*profile/i.test(l) || /ver perfil/i.test(l) ||
      /^status is/i.test(l) || /mutual connection|conex(ão|ões) em comum/i.test(l) ||
      /^(connect|conectar|follow|seguir|message|mensagem|pending|pendente)$/i.test(l) || /^•/.test(l);
    const info = lines.filter((l) => !skip(l));
    const headline = info[0] || null;
    const loc = info[1] || null;
    const snippet = info.slice(2, 4).join(' | ') || null;
    let currentCompany = null;
    if (headline) {
      const c = headline.match(/\s(?:at|na|no|em|@)\s+(.+)$/i);
      if (c) currentCompany = c[1].split('|')[0].trim();
    }

    const buttons = Array.from(box.querySelectorAll('button, a[role="button"]')).map((b) =>
      lower(`${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`));
    const isPending = buttons.some((b) => /\bpending\b|pendente|withdraw|retirar/.test(b));
    const isConnected = degree === '1st';

    profiles.push({
      profile_url: href.split('?')[0],
      name,
      headline,
      location: loc,
      current_company: currentCompany,
      degree,
      mutual_connections: mutual,
      is_pending: isPending,
      is_connected: isConnected,
      snippet,
    });
  }

  const nextBtn = Array.from(document.querySelectorAll('button')).find((b) => {
    const l = lower(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`);
    return (l.includes('next') || l.includes('avançar') || l.includes('próxima') || l.includes('próximo')) && !b.disabled;
  });

  const result = { success: true, profiles, has_next: !!nextBtn, page_url: location.href };
  if (profiles.length === 0) {
    result.debug = {
      anchors: anchors.length,
      containers: containers.length,
      sample: containers[0] ? (containers[0].box.innerText || '').slice(0, 400) : (document.querySelector('main') || document.body).innerText.slice(0, 400),
    };
  }
  return result;
}

// ── Page reader: post (content) search results ─────────────────────────────
async function lcReadPostSearch() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();

  const findPosts = () => {
    const els = Array.from(document.querySelectorAll(
      '[data-urn^="urn:li:activity"], [data-id^="urn:li:activity"], [data-urn^="urn:li:ugcPost"], [data-urn^="urn:li:share"]'
    ));
    // keep outermost
    return els.filter((el) => !els.some((o) => o !== el && o.contains(el)));
  };

  for (let i = 0; i < 20 && findPosts().length === 0; i++) await sleep(500);
  for (let i = 0; i < 6; i++) {
    window.scrollBy(0, 700 + Math.random() * 400);
    await sleep(900 + Math.random() * 900);
  }

  const posts = [];
  for (const el of findPosts().slice(0, 25)) {
    const urn = el.getAttribute('data-urn') || el.getAttribute('data-id') || '';
    if (!urn) continue;

    // Expand "...more" so we read the whole text
    const more = Array.from(el.querySelectorAll('button')).find((b) =>
      /…\s*(more|mais)|see more|ver mais/i.test(`${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`));
    if (more) { try { more.click(); await sleep(300); } catch (_) { /* ignore */ } }

    const textEl = el.querySelector('.update-components-text, .feed-shared-inline-show-more-text, .feed-shared-update-v2__description, [data-test-id="main-feed-activity-card__commentary"]');
    let text = norm(textEl && textEl.innerText);
    if (!text) {
      // fallback: longest text block inside the post
      const blocks = Array.from(el.querySelectorAll('span[dir="ltr"], div[dir="ltr"]')).map((b) => norm(b.innerText));
      text = blocks.sort((a, b) => b.length - a.length)[0] || '';
    }
    text = text.replace(/…\s*(more|mais)$/i, '').trim();

    const actor = el.querySelector('.update-components-actor, .feed-shared-actor') || el;
    const authorA = actor.querySelector('a[href*="/in/"]') || el.querySelector('a[href*="/in/"]');
    const authorName = norm((actor.querySelector('.update-components-actor__title span[aria-hidden="true"], .update-components-actor__name span[aria-hidden="true"]') || {}).textContent)
      || norm(authorA && authorA.innerText).split('\n')[0];
    const headline = norm((actor.querySelector('.update-components-actor__description, .feed-shared-actor__description') || {}).textContent) || null;
    const sub = norm((actor.querySelector('.update-components-actor__sub-description, .feed-shared-actor__sub-description') || {}).textContent);
    const actorText = norm(actor.innerText);
    const degreeM = actorText.match(/•\s*(1st|2nd|3rd\+?|1º|2º|3º\+?)/i);

    const social = norm((el.querySelector('.social-details-social-counts, .social-details-social-counts__reactions') || {}).innerText);
    const reactions = (social.match(/^([\d.,]+)/) || [])[1] || null;
    const commentsM = social.match(/([\d.,]+)\s+(comments?|comentários?)/i);

    posts.push({
      urn,
      text: text.slice(0, 5000),
      author_name: authorName || null,
      author_headline: headline,
      author_profile_url: authorA ? authorA.href.split('?')[0] : null,
      author_degree: degreeM ? degreeM[1] : null,
      posted_label: sub ? sub.split('•')[0].trim().slice(0, 40) : null,
      reactions,
      comments: commentsM ? commentsM[1] : null,
    });
  }

  let ownProfileUrl = null;
  try {
    const csrf = (document.cookie.match(/JSESSIONID=["']?([^;"']+)/) || [])[1];
    const r = await fetch('/voyager/api/me', {
      headers: { 'csrf-token': (csrf || '').replace(/"/g, ''), accept: 'application/vnd.linkedin.normalized+json+2.1' },
      credentials: 'include',
    });
    if (r.ok) {
      const j = await r.json();
      const mini = (j.included || []).find((i) => i.publicIdentifier);
      if (mini) ownProfileUrl = `https://www.linkedin.com/in/${mini.publicIdentifier}`;
    }
  } catch (_) { /* optional */ }

  const result = { success: true, posts, own_profile_url: ownProfileUrl };
  if (posts.length === 0) {
    result.debug = { sample: (document.querySelector('main') || document.body).innerText.slice(0, 400) };
  }
  return result;
}

// ── Page reader: list of profile links on the current page (connections / sent invites) ──
async function lcReadProfileLinks(maxScrolls) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20 && document.querySelectorAll('main a[href*="/in/"]').length === 0; i++) await sleep(500);
  for (let i = 0; i < (maxScrolls || 4); i++) {
    window.scrollTo(0, document.body.scrollHeight);
    await sleep(1200 + Math.random() * 800);
    const showMore = Array.from(document.querySelectorAll('main button')).find((b) =>
      /show more results|mostrar mais resultados|load more|carregar mais/i.test(b.textContent || ''));
    if (showMore) { showMore.click(); await sleep(1500); }
  }
  const urls = new Set();
  for (const a of document.querySelectorAll('main a[href*="/in/"]')) {
    const m = (a.getAttribute('href') || '').match(/\/in\/([^/?#]+)/);
    if (m) urls.add(`https://www.linkedin.com/in/${m[1]}`);
  }
  return { success: true, urls: Array.from(urls).slice(0, 300) };
}

// ── Page action: withdraw selected sent invitations ───────────────────────
async function lcWithdrawInvites(profileUrls) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const slugOf = (u) => ((u || '').match(/\/in\/([^/?#]+)/) || [])[1];
  const targets = (profileUrls || []).map((u) => {
    const s = slugOf(u);
    try { return s ? decodeURIComponent(s).toLowerCase() : null; } catch (_) { return s ? s.toLowerCase() : null; }
  }).filter(Boolean);

  for (let i = 0; i < 20 && document.querySelectorAll('main a[href*="/in/"]').length === 0; i++) await sleep(500);
  for (let i = 0; i < 4; i++) { window.scrollTo(0, document.body.scrollHeight); await sleep(1200); }

  const withdrawn = [];
  const notFound = [];
  for (const slug of targets.slice(0, 10)) {
    const link = Array.from(document.querySelectorAll('main a[href*="/in/"]')).find((a) => {
      const s = slugOf(a.getAttribute('href'));
      if (!s) return false;
      let d = s; try { d = decodeURIComponent(s); } catch (_) { /* keep */ }
      return d.toLowerCase() === slug;
    });
    const card = link && (link.closest('li') || link.closest('[data-view-name]') || link.parentElement);
    const btn = card && Array.from(card.querySelectorAll('button')).find((b) =>
      /withdraw|retirar|cancelar convite/i.test(`${b.textContent || ''} ${b.getAttribute('aria-label') || ''}`));
    if (!btn) { notFound.push(`https://www.linkedin.com/in/${slug}`); continue; }
    btn.scrollIntoView({ block: 'center' });
    await sleep(800 + Math.random() * 600);
    btn.click();
    await sleep(1200 + Math.random() * 600);
    const dialog = document.querySelector('div[role="alertdialog"], div[role="dialog"], dialog');
    const confirm = dialog && Array.from(dialog.querySelectorAll('button')).find((b) =>
      /^(withdraw|retirar|confirmar)$/i.test((b.textContent || '').trim()));
    if (confirm) { confirm.click(); await sleep(1500 + Math.random() * 1500); }
    withdrawn.push(`https://www.linkedin.com/in/${slug}`);
    await sleep(2000 + Math.random() * 3000);
  }
  return { success: true, withdrawn, not_found: notFound };
}

// ── Orchestration (runs in the service worker) ────────────────────────────
async function lcNavigate(processor, tabId, url) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, func: () => { window.onbeforeunload = null; } });
  } catch (_) { /* page may not allow scripting yet */ }
  await chrome.tabs.update(tabId, { url });
  await processor.waitForTabLoad(tabId);
  await processor.sleep(4000 + Math.random() * 3000);
}

async function lcExec(tabId, func, args, timeoutMs) {
  const run = chrome.scripting.executeScript({ target: { tabId }, func, args: args || [] });
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error(`Network page script timeout (${(timeoutMs || 120000) / 1000}s)`)), timeoutMs || 120000));
  const results = await Promise.race([run, timeout]);
  if (!results || !results[0]) throw new Error('No result from page script');
  return results[0].result;
}

async function runNetworkAction(processor, tab, action) {
  const data = action.action_data || {};
  switch (action.action_type) {
    case 'network_search_people': {
      await lcNavigate(processor, tab.id, data.search_url || action.linkedin_url);
      return await lcExec(tab.id, lcReadPeopleSearch);
    }
    case 'network_search_posts': {
      await lcNavigate(processor, tab.id, data.search_url || action.linkedin_url);
      return await lcExec(tab.id, lcReadPostSearch);
    }
    case 'network_sync_connections': {
      await lcNavigate(processor, tab.id, 'https://www.linkedin.com/mynetwork/invite-connect/connections/');
      const conns = await lcExec(tab.id, lcReadProfileLinks, [3]);
      await processor.sleep(3000 + Math.random() * 3000);
      await lcNavigate(processor, tab.id, 'https://www.linkedin.com/mynetwork/invitation-manager/sent/');
      const sent = await lcExec(tab.id, lcReadProfileLinks, [4]);
      return { success: true, connections: conns.urls || [], pending: sent.urls || [] };
    }
    case 'network_withdraw_invites': {
      await lcNavigate(processor, tab.id, 'https://www.linkedin.com/mynetwork/invitation-manager/sent/');
      return await lcExec(tab.id, lcWithdrawInvites, [data.profile_urls || []], 180000);
    }
    default:
      throw new Error(`Unknown network action: ${action.action_type}`);
  }
}
