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

// ── Page reader: Sales Navigator lead search ──────────────────────────────
// Reads the lead cards, then turns each Sales Navigator lead into the person's public
// linkedin.com/in/ URL (the rest of the system, invites and acceptance sync, works on those).
// Leads whose public URL cannot be found are left out. If nothing can be used, it returns
// sales_nav_unavailable so the backend falls back to the regular search for 24h.
async function lcReadSalesNavSearch() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (t) => (t || '').replace(/\s+/g, ' ').trim();
  const lower = (t) => norm(t).toLowerCase();
  const leadLinks = () => Array.from(document.querySelectorAll('a[href*="/sales/lead/"]'));
  const unavailable = (reason, extra) => ({
    success: true, sales_nav_unavailable: true, reason, profiles: [], has_next: false,
    debug: { url: location.href, sample: ((document.querySelector('main') || document.body || {}).innerText || '').slice(0, 400), ...(extra || {}) },
  });

  // Wait for results, an empty state, or a redirect away from the search (no license / contract chooser)
  for (let i = 0; i < 30; i++) {
    if (leadLinks().length > 0) break;
    const body = lower(document.body && document.body.innerText);
    if (/no leads matched|no results|nenhum lead|nenhum resultado/.test(body)) break;
    if (!location.pathname.startsWith('/sales/search')) break;
    await sleep(500);
  }
  if (!location.pathname.startsWith('/sales/search')) {
    return unavailable(/contract/i.test(location.pathname) ? 'contract_chooser' : 'not_on_sales_navigator');
  }

  const bodyText = lower(document.body && document.body.innerText);
  if (/commercial use limit|limite de uso comercial|reached the (monthly|daily) limit/.test(bodyText)) {
    return { success: true, limit_reached: true, profiles: [], has_next: false };
  }

  // Results live in their own scrolling panel: scroll it like a person so all 25 cards render.
  const first = leadLinks()[0];
  let scroller = document.querySelector('#search-results-container');
  if (!scroller && first) {
    let el = first.parentElement;
    while (el && el !== document.body) {
      const st = getComputedStyle(el);
      if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 50) { scroller = el; break; }
      el = el.parentElement;
    }
  }
  for (let i = 0; i < 8; i++) {
    if (scroller) scroller.scrollBy(0, 450 + Math.random() * 250); else window.scrollBy(0, 450 + Math.random() * 250);
    await sleep(700 + Math.random() * 700);
  }
  await sleep(1000);

  const leads = [];
  const seen = new Set();
  for (const a of leadLinks()) {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/sales\/lead\/([^,/?#]+),([^,/?#]+),([^/?#]+)/);
    if (!m || seen.has(m[1])) continue;
    const box = a.closest('li') || a.closest('[data-x-search-result]') || a.closest('article');
    if (!box) continue;
    seen.add(m[1]);
    const pick = (sel) => norm((box.querySelector(sel) || {}).textContent);
    const text = norm(box.innerText);
    const name = pick('[data-anonymize="person-name"]') || norm(a.textContent);
    if (!name || /linkedin member|membro do linkedin/i.test(name)) continue;
    const title = pick('[data-anonymize="title"]') || null;
    const company = pick('[data-anonymize="company-name"]') || null;
    const loc = pick('[data-anonymize="location"]') || null;
    const degM = text.match(/\b(1st|2nd|3rd\+?)\b|\b(1º|2º|3º\+?)/i);
    let degree = degM ? (degM[1] || degM[2]).toLowerCase() : null;
    if (degree && degree.includes('º')) degree = degree.startsWith('1') ? '1st' : degree.startsWith('2') ? '2nd' : '3rd';
    leads.push({
      id: m[1], authType: m[2], authToken: decodeURIComponent(m[3]),
      name, title, company, location: loc, degree,
      is_pending: /\bpending\b|pendente/i.test(text),
      recently_posted: /recently posted|posted on linkedin|publicou recentemente|publicou no linkedin/i.test(text),
      changed_jobs: /changed jobs|recently hired|new in role|mudou de emprego|novo cargo/i.test(text),
    });
  }

  if (leads.length === 0) {
    const empty = /no leads matched|no results|nenhum lead|nenhum resultado/.test(lower(document.body.innerText));
    if (empty) return { success: true, profiles: [], has_next: false, page_url: location.href };
    return unavailable('no_lead_cards', { links: leadLinks().length });
  }

  // Public profile URL for each lead (the same call Sales Navigator makes when a lead is opened)
  const csrf = ((document.cookie.match(/JSESSIONID=["']?([^;"']+)/) || [])[1] || '').replace(/"/g, '');
  const resolve = async (l) => {
    const path = `/sales-api/salesApiProfiles/(profileId:${l.id},authType:${l.authType},authToken:${encodeURIComponent(l.authToken)})` +
      '?decoration=%28entityUrn%2CflagshipProfileUrl%29';
    const r = await fetch(path, {
      credentials: 'include',
      headers: { 'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0', accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`profile ${r.status}`);
    const t = await r.text();
    const mm = t.match(/linkedin\.com\/in\/([^"\\/?#]+)/);
    return mm ? `https://www.linkedin.com/in/${mm[1]}` : null;
  };

  const profiles = [];
  let failures = 0;
  let lastError = null;
  for (const l of leads) {
    if (failures >= 3 && profiles.length === 0) break; // the lookup is not working: stop early
    let url = null;
    try { url = await resolve(l); } catch (e) { lastError = String(e && e.message || e); }
    if (!url) { failures++; } else {
      profiles.push({
        profile_url: url,
        name: l.name,
        headline: l.title && l.company ? `${l.title} at ${l.company}` : (l.title || l.company || null),
        location: l.location,
        current_company: l.company,
        degree: l.degree,
        mutual_connections: null,
        is_pending: l.is_pending,
        is_connected: l.degree === '1st',
        recently_posted: l.recently_posted,
        changed_jobs: l.changed_jobs,
        snippet: [l.title, l.company].filter(Boolean).join(' | ') || null,
      });
    }
    await sleep(350 + Math.random() * 550);
  }
  if (profiles.length === 0) return unavailable('profile_lookup_failed', { leads: leads.length, error: lastError });

  const nextBtn = Array.from(document.querySelectorAll('button')).find((b) => {
    const l = lower(`${b.getAttribute('aria-label') || ''} ${b.textContent || ''}`);
    return /\bnext\b|avançar|próxim/.test(l) && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
  });

  return {
    success: true, reader: 'sales_navigator', profiles, has_next: !!nextBtn, page_url: location.href,
    leads_on_page: leads.length, unresolved: leads.length - profiles.length,
  };
}

// ── Page check: which LinkedIn plan is this account on? ───────────────────
// Runs inside any linkedin.com tab. Returns { tier, signals } or { tier: null } when unsure.
async function lcDetectLinkedInTier() {
  const csrf = ((document.cookie.match(/JSESSIONID=["']?([^;"']+)/) || [])[1] || '').replace(/"/g, '');
  const signals = { licenses_checked: false, sales_nav_license: false, nav_link: false, premium: null };

  try {
    const r = await fetch('/sales-api/salesApiIdentity?q=findLicensesByCurrentMember&includeRecentlyRevokedLicenses=false', {
      credentials: 'include',
      headers: { 'csrf-token': csrf, 'x-restli-protocol-version': '2.0.0', accept: 'application/json' },
    });
    if (r.ok) {
      const j = await r.json().catch(() => null);
      const els = (j && (j.elements || j.data && j.data.elements)) || [];
      signals.licenses_checked = Array.isArray(els);
      signals.sales_nav_license = Array.isArray(els) && els.some((e) => e && e.active !== false && e.revoked !== true);
    } else if (r.status === 403 || r.status === 404) {
      signals.licenses_checked = true; // the API answered: no Sales Navigator seat
    }
  } catch (_) { /* inconclusive */ }

  const nav = document.querySelector('#global-nav, header.global-nav, header');
  if (nav) {
    signals.nav_link = Array.from(nav.querySelectorAll('a[href*="/sales/"]')).some((a) =>
      /sales nav/i.test(`${a.textContent || ''} ${a.getAttribute('aria-label') || ''}`));
  }

  try {
    const r = await fetch('/voyager/api/me', {
      credentials: 'include',
      headers: { 'csrf-token': csrf, accept: 'application/vnd.linkedin.normalized+json+2.1' },
    });
    if (r.ok) {
      const t = await r.text();
      signals.premium = /"premiumSubscriber"\s*:\s*true/.test(t);
    }
  } catch (_) { /* inconclusive */ }

  let tier = null;
  // The license check is the source of truth; the nav link only counts when that check was inconclusive.
  if (signals.sales_nav_license || (signals.nav_link && !signals.licenses_checked)) tier = 'sales_navigator';
  else if (signals.premium === true) tier = 'premium';
  else if (signals.premium === false) tier = 'free';
  return { tier, signals };
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

const TIER_CHECK_EVERY_MS = 12 * 60 * 60 * 1000;

/** Detect the LinkedIn plan at most every 12h (or when forced) and store it in extension_status. */
async function lcMaybeDetectTier(force) {
  if (!supabase.userId) return null;
  const last = await getLocalData('tier_checked_at');
  if (!force && last && Date.now() - last < TIER_CHECK_EVERY_MS) return null;
  const tabs = await chrome.tabs.query({ url: 'https://www.linkedin.com/*' });
  const tab = tabs.find((t) => t.status === 'complete') || tabs[0];
  if (!tab) return null; // needs an open LinkedIn tab (logged in)
  let res;
  try { res = await lcExec(tab.id, lcDetectLinkedInTier, [], 30000); } catch (e) {
    console.warn('[LC:Tier] detection failed:', e.message);
    return null;
  }
  if (!res || !res.tier) {
    // Inconclusive (LinkedIn still loading, logged out...): try again in 30 minutes, not 12 hours.
    await setLocalData('tier_checked_at', Date.now() - TIER_CHECK_EVERY_MS + 30 * 60 * 1000);
    console.log('[LC:Tier] inconclusive', res && res.signals);
    return null;
  }
  await setLocalData('tier_checked_at', Date.now());

  try {
    const cur = await fetch(`${supabase.url}/rest/v1/extension_status?user_id=eq.${supabase.userId}&select=linkedin_account_tier`, {
      headers: supabase.getHeaders(),
    }).then((r) => (r.ok ? r.json() : []));
    const current = cur && cur[0] ? cur[0].linkedin_account_tier : null;
    // Never downgrade Sales Navigator on a weak signal: only when the license check really answered.
    if (current === 'sales_navigator' && res.tier !== 'sales_navigator' && !res.signals.licenses_checked) {
      console.log('[LC:Tier] keeping sales_navigator, license check inconclusive');
      return current;
    }
    const body = { linkedin_tier_detected_at: new Date().toISOString() };
    if (current !== res.tier) body.linkedin_account_tier = res.tier;
    await fetch(`${supabase.url}/rest/v1/extension_status?user_id=eq.${supabase.userId}`, {
      method: 'PATCH',
      headers: supabase.getHeaders(),
      body: JSON.stringify(body),
    });
    console.log('[LC:Tier] plan:', res.tier, current !== res.tier ? `(was ${current})` : '', res.signals);
    return res.tier;
  } catch (e) {
    console.warn('[LC:Tier] save failed:', e.message);
    return null;
  }
}
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
      if (data.reader === 'sales_navigator') {
        // Sales Navigator is a heavier app: give it a few more seconds before reading.
        await processor.sleep(3000 + Math.random() * 2000);
        return await lcExec(tab.id, lcReadSalesNavSearch, [], 180000);
      }
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
