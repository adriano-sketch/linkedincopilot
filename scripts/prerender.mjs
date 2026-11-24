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

// Nothing here may fail a production deploy: an error that escapes the try blocks below (a timer, a
// promise nobody awaits) is logged and the build goes on with whatever pages were written.
let done = 0;
function finish(reason) {
  if (reason) console.error('prerender:', reason);
  try { fs.writeFileSync(path.join(dist, 'prerender.json'), JSON.stringify({ done, total: PAGES.length, builtAt: new Date().toISOString() })); } catch { /* a read-out only */ }
  // On a preview deployment a page left empty fails the build, so the pull request shows it. Production
  // always deploys: an empty page there is what the site served before this script existed.
  process.exit(process.env.VERCEL_ENV === 'preview' && done < PAGES.length ? 1 : 0);
}
process.on('unhandledRejection', (e) => finish(`unhandled rejection: ${e instanceof Error ? e.message : e}`));
process.on('uncaughtException', (e) => finish(`uncaught exception: ${e instanceof Error ? e.message : e}`));

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Title, description and address of a page other than the home. The home's FAQ data stays on the home. */
function headFor(shell, page) {
  if (!page.title) return shell;
  const address = SITE + page.url;
  const out = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(page.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${address}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${address}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${esc(page.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${esc(page.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(page.description)}$2`)
    .replace(/<script type="application\/ld\+json">(?:(?!<\/script>)[\s\S])*?"@type":\s*"(?:FAQPage|SoftwareApplication)"[\s\S]*?<\/script>\s*/g, '');
  // If index.html is ever reformatted the replacements above stop matching without an error.
  if (!out.includes(`<title>${esc(page.title)}</title>`) || !out.includes(`href="${address}"`)) {
    throw new Error(`could not set the title and address of ${page.url}`);
  }
  return out;
}

/** The empty page served for every other route: it is not the home, so it does not carry the home's address or FAQ data. */
function appPage(shell) {
  return shell
    .replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, '')
    .replace(/<script type="application\/ld\+json">(?:(?!<\/script>)[\s\S])*?"@type":\s*"(?:FAQPage|SoftwareApplication)"[\s\S]*?<\/script>\s*/g, '');
}

let shell;
try {
  shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  // Checked before anything is written: on a second run over the same dist, index.html is already a
  // rendered page, and copying it would hand the home's content to every other route.
  if (!shell.includes(ROOT)) finish(`dist/index.html has no ${ROOT} (already prerendered?), nothing written`);
  // First, before anything else can fail: every address has a page, the empty one.
  const copies = [['app.html', appPage(shell)]];
  for (const p of PAGES) if (p.file !== 'index.html') copies.push([p.file, headFor(shell, p)]);
  for (const [file, html] of copies) fs.writeFileSync(path.join(dist, file), html);
} catch (e) {
  finish(`could not read or copy the built page: ${e instanceof Error ? e.message : e}`);
}

setTimeout(() => finish('timed out, remaining pages left empty'), 90_000);

let vite;
try {
  // The dev server compiles JSX with React's development helpers, which React only ships when
  // NODE_ENV is not "production" (it is "production" during a hosted build). The HTML is the same.
  process.env.NODE_ENV = 'development';
  // The app's data client keeps a reference to browser storage when its module loads. Nothing is read
  // or written during a server render.
  const mem = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => void mem.set(k, String(v)),
    removeItem: (k) => void mem.delete(k),
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } });
  const { createServer } = await import('vite');
  vite = await createServer({ mode: 'production', appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, ws: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  const { render } = await vite.ssrLoadModule('/src/prerender.tsx');
  for (const page of PAGES) {
    try {
      const html = render(page.url);
      if (html.length < 2000 || !html.includes(page.mustContain)) throw new Error(`unexpected output (${html.length} characters)`);
      // A function, so that a "$&" in the page text is not read as a replacement pattern.
      fs.writeFileSync(path.join(dist, page.file), headFor(shell, page).replace(ROOT, () => `<div id="root">${html}</div>`));
      done++;
      console.log(`prerender: ${page.url} -> ${page.file} (${html.length} characters)`);
    } catch (e) {
      console.error(`prerender: ${page.url} left empty:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`prerender: ${done} of ${PAGES.length} pages`);
} catch (e) {
  console.error('prerender: failed, pages left empty:', e);
}
// The dev server is not closed: the process ends here, and a close that hangs would hang the build.
finish();
