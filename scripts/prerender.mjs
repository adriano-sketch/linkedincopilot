// Runs after `vite build`. Writes ready-made HTML for the public pages, so search engines and tools
// that do not run JavaScript can read them. The app itself is unchanged: when its script loads, it
// renders over this HTML.
//
//   dist/index.html    home, with its content
//   dist/privacy.html  /privacy, with its content and its own title   (vercel.json rewrites /privacy here)
//   dist/terms.html    /terms,   with its content and its own title   (vercel.json rewrites /terms here)
//   dist/app.html      the empty page vite built; every other route is served this (vercel.json)
//
// It must never break a deploy: on any failure the pages are left as the empty app page, which is
// exactly what the site served before this script existed, and the build still succeeds.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const ROOT = '<div id="root"></div>';
const SITE = 'https://www.olanovo.com';

const PAGES = [
  { url: '/', file: 'index.html', mustContain: 'Doing business is the point' },
  {
    url: '/privacy', file: 'privacy.html', mustContain: 'Privacy Policy',
    title: 'Privacy Policy | Olanovo',
    description: 'What data Olanovo processes, why, and what it never does with it.',
  },
  {
    url: '/terms', file: 'terms.html', mustContain: 'Terms of Service',
    title: 'Terms of Service | Olanovo',
    description: 'The terms that apply to the Olanovo web app and Chrome extension.',
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Title, description and address of a page other than the home. The home's FAQ data stays on the home. */
function headFor(shell, page) {
  if (!page.title) return shell;
  const address = SITE + page.url;
  return shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${address}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${address}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${esc(page.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${esc(page.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/<script type="application\/ld\+json">(?:(?!<\/script>)[\s\S])*?"@type":\s*"(?:FAQPage|SoftwareApplication)"[\s\S]*?<\/script>\s*/g, '');
}

let shell;
try {
  shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  // First, before anything can fail: every address has a page, the empty one.
  fs.writeFileSync(path.join(dist, 'app.html'), shell);
  for (const p of PAGES) if (p.file !== 'index.html') fs.writeFileSync(path.join(dist, p.file), headFor(shell, p));
} catch (e) {
  console.error('prerender: could not read or copy the built page, nothing prerendered:', e);
  process.exit(0);
}

const giveUp = setTimeout(() => {
  console.error('prerender: timed out, pages left empty');
  process.exit(0);
}, 90_000);

let vite;
try {
  if (!shell.includes(ROOT)) throw new Error(`the built page has no ${ROOT}`);
  // The dev server compiles JSX with React's development helpers, which React only ships when
  // NODE_ENV is not "production" (it is "production" during a hosted build). The HTML is the same.
  process.env.NODE_ENV = 'development';
  // The app's data client keeps a reference to browser storage when its module loads. Nothing is read
  // or written during a server render.
  const mem = new Map();
  globalThis.localStorage ??= {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  };
  const { createServer } = await import('vite');
  vite = await createServer({ mode: 'production', appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  const { render } = await vite.ssrLoadModule('/src/prerender.tsx');
  let done = 0;
  for (const page of PAGES) {
    try {
      const html = render(page.url);
      if (html.length < 2000 || !html.includes(page.mustContain)) throw new Error(`unexpected output (${html.length} characters)`);
      fs.writeFileSync(path.join(dist, page.file), headFor(shell, page).replace(ROOT, `<div id="root">${html}</div>`));
      done++;
      console.log(`prerender: ${page.url} -> ${page.file} (${html.length} characters)`);
    } catch (e) {
      console.error(`prerender: ${page.url} left empty:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`prerender: ${done} of ${PAGES.length} pages`);
} catch (e) {
  console.error('prerender: failed, pages left empty:', e);
} finally {
  clearTimeout(giveUp);
  try { await vite?.close(); } catch { /* closing is best effort */ }
  process.exit(0);
}
