// M53 — the boot screen styled on its first frame.
//   A. its stylesheet is in the document, not beside it
//   B. no unstyled frame, in the build *or* the dev server
//   C. the two copies of the shared colours agree
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Found from this file rather than written down.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PROD = 'http://localhost:4173';
const DEV = 'http://localhost:4174';

const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

/**
 * Watch for a frame where the boot screen is on the page without its styling.
 *
 * Throttled deliberately: on a fast local connection a render-blocking
 * stylesheet arrives in the same tick and nothing can be observed either way,
 * which is how this went unnoticed until somebody played it on a phone.
 *
 * The sampler is installed as an init script so it is running before the entry
 * module has been fetched — the window this is about is the one before any of
 * the page's own JavaScript exists.
 */
async function unstyledFrames(url) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 300,
    downloadThroughput: 400 * 1024 / 8, uploadThroughput: 400 * 1024 / 8,
  });
  await page.addInitScript(() => {
    window.__fouc = [];
    const tick = () => {
      const boot = document.getElementById('boot');
      if (boot) {
        const cs = getComputedStyle(boot);
        const t = document.querySelector('.boot-title');
        window.__fouc.push({
          t: Math.round(performance.now()),
          sheets: document.styleSheets.length,
          pos: cs.position,
          bg: cs.backgroundColor,
          titleSize: t ? getComputedStyle(t).fontSize : null,
          // Sampled here rather than at the end: read after load the body has
          // its colour in either build, because by then the stylesheet has
          // arrived. The frame that matters is the one before that.
          bodyBg: getComputedStyle(document.body).backgroundColor,
          // Styled means: covering the page, which is the whole job.
          covering: cs.position === 'fixed' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
        });
      }
      if (performance.now() < 9000) requestAnimationFrame(tick);
    };
    tick();
  });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1200);
  const trace = await page.evaluate(() => window.__fouc ?? []);
  await ctx.close();
  const white = trace.filter((s) => s.bodyBg !== 'rgb(10, 14, 22)');
  return { trace, bad: trace.filter((s) => !s.covering), white };
}

// ============ A. THE STYLESHEET IS IN THE DOCUMENT
{
  const html = existsSync(ROOT + 'dist/index.html') ? readFileSync(ROOT + 'dist/index.html', 'utf8') : '';
  const head = html.slice(0, html.indexOf('</head>'));
  const styled = /<style>[\s\S]*?<\/style>/.exec(head);
  check('The built page carries a <style> block in its head',
    !!styled && styled[0].includes('.boot'), styled ? `${styled[0].length} bytes inline` : 'none');
  check('And it is the boot screen it styles, all of it',
    !!styled && ['.boot-title', '.boot-ch', '.boot-bar', '.boot-begin', '.boot-city']
      .every((sel) => styled[0].includes(sel)),
    styled ? `${(styled[0].match(/\.boot[\w-]*/g) ?? []).length} boot selectors` : 'none');
  // Conditioned on there being a block: "the placeholder is gone" is trivially
  // true of a page that never had one, which is what the previous build is.
  check('The slot it goes in is filled, not left in the output',
    !!styled && !html.includes('<!--boot-css-->'),
    !styled ? 'nothing was inlined' : html.includes('<!--boot-css-->') ? 'slot still there' : 'replaced');

  // One copy. Inlining and *also* bundling is a page that pays for the boot
  // screen twice and can disagree with itself about it.
  const cssFiles = existsSync(ROOT + 'dist/assets')
    ? readdirSync(ROOT + 'dist/assets').filter((f) => f.endsWith('.css')) : [];
  const bundled = cssFiles.map((f) => readFileSync(ROOT + 'dist/assets/' + f, 'utf8')).join('');
  check('And the bundled stylesheet does not carry it as well',
    cssFiles.length > 0 && !bundled.includes('.boot-title'),
    `${cssFiles.length} stylesheet(s), ${bundled.includes('.boot-title') ? 'duplicated' : 'no boot rules'}`);
}

// ============ B. NO UNSTYLED FRAME, IN EITHER SERVER
for (const [label, url] of [['the build', PROD], ['the dev server', DEV]]) {
  const r = await unstyledFrames(url).catch((e) => ({ error: e.message.split('\n')[0] }));
  if (r.error) { check(`${label}: there is a page to measure`, false, r.error); continue; }
  // Not just "no bad frames": an empty trace has none of those either, and
  // would be an assertion passing over the absence of the thing it is about.
  check(`${label}: the boot screen is styled on every frame it is on`,
    r.trace.length > 20 && r.bad.length === 0,
    r.bad.length
      ? `${r.bad.length} of ${r.trace.length} frames unstyled, ${r.bad[0].t}ms → ${r.bad[r.bad.length - 1].t}ms` +
        ` (sheets ${r.bad[0].sheets}, position ${r.bad[0].pos}, title ${r.bad[0].titleSize})`
      : `${r.trace.length} frames sampled, first at ${r.trace[0]?.t}ms, none unstyled`);
  check(`${label}: and the page's own background is under it from the first frame`,
    r.trace.length > 20 && r.white.length === 0,
    r.white.length
      ? `${r.white.length} of ${r.trace.length} frames on ${r.white[0].bodyBg}, up to ${r.white[r.white.length - 1].t}ms`
      : `${r.trace.length} frames, all on rgb(10, 14, 22)`);
}

// ============ C. THE TWO COPIES OF THE SHARED COLOURS AGREE
{
  // boot.css declares the handful of variables it needs, because style.css has
  // not loaded when it is applied. Two copies of a colour is exactly the sort
  // of thing that quietly stops being one colour.
  const vars = (file) => {
    const txt = existsSync(ROOT + file) ? readFileSync(ROOT + file, 'utf8') : '';
    const root = /:root\s*\{([^}]*)\}/.exec(txt);
    const out = {};
    for (const m of (root?.[1] ?? '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    return out;
  };
  const boot = vars('src/boot.css'), main = vars('src/style.css');
  const shared = Object.keys(boot).filter((k) => k in main);
  const disagree = shared.filter((k) => boot[k] !== main[k]);
  check('Every variable the boot stylesheet redeclares is one style.css also has',
    shared.length === Object.keys(boot).length && shared.length >= 4,
    `${shared.length} of ${Object.keys(boot).length} shared: ${shared.join(', ')}`);
  check('And every one of them is the same value in both',
    shared.length > 0 && disagree.length === 0,
    disagree.length ? disagree.map((k) => `${k}: ${boot[k]} vs ${main[k]}`).join('; ') : 'identical');
}

console.log('\nPASS');
for (const p of pass) console.log('  ✓ ' + p);
if (fail.length) { console.log('\nFAIL'); for (const f of fail) console.log('  ✗ ' + f); }
if (errs.length) { console.log('\nPAGE ERRORS'); for (const e of new Set(errs)) console.log('  ! ' + e); }
console.log(`\n${pass.length} passed, ${fail.length} failed, ${new Set(errs).size} distinct page errors`);
// Non-zero on a failure, and on a page error, and on a suite that asserted
// nothing at all. Without this a suite that printed a wall of red still exited
// 0, and the runner — and CI behind it — would have called it green.
if (fail.length || errs.length || !pass.length) process.exitCode = 1;
await browser.close();
