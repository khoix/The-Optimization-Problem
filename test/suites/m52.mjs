// M52 — the tap that begins the game must not press the menu.
//   A. a tap over every menu control begins the game and does nothing else
//   B. it still does the things the tap is for
//   C. and the guard it needs comes off with the screen
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };

const fresh = async (opts = PHONE) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__boot?.offered(), null, { timeout: 20000 })
    .catch(() => {});
  return { ctx, page };
};

/**
 * What the menu looks like when nothing has been pressed.
 *
 * Deliberately wider than "is a modal open". *How to Play* opens the guide
 * overlay rather than a dialog and *Begin New Simulation* opens the picker;
 * an earlier version of this probe watched `.modal` alone and reported the
 * How to Play tap as clean, which it was not.
 */
const menuState = (page) => page.evaluate(() => ({
  atTitle: document.body.classList.contains('at-title'),
  modal: document.querySelector('.modal:not(.hidden) h2')?.textContent ?? null,
  guide: !document.querySelector('.guide-overlay, .guide')?.classList.contains('hidden')
    && !!document.querySelector('.guide-overlay, .guide'),
  cards: document.querySelectorAll('.region-card').length,
  bootGone: !document.getElementById('boot'),
}));
const untouched = (s) => s.atTitle && !s.modal && !s.guide && s.cards === 0;

// Where the menu's own controls sit, measured with the boot screen already gone
// so the coordinates are the ones a finger would find behind it.
let spots = [];
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => { window.__boot.activate(); window.__boot.activate(); });
  await page.waitForTimeout(700);
  spots = await page.evaluate(() => [...document.querySelectorAll('.title-btn')].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.id, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  }));
  check('The menu underneath has controls to be pressed by accident',
    spots.length >= 3, spots.map((s) => `${s.id} at ${s.y}`).join(', '));
  await ctx.close();
}

// The row to press when the point is that pressing works. Not the first one:
// since M58 that is Import a Region on a cold start, and what it opens is the
// operating system's file dialog, which is not in the page and cannot be seen
// from here. Begin New Simulation puts four region cards on screen.
const deliberate = spots.find((s) => s.id === 't-new') ?? spots[0];

// ============ A. A TAP ANYWHERE BEGINS THE GAME AND DOES NOTHING ELSE
for (const spot of spots) {
  const { ctx, page } = await fresh();
  await page.touchscreen.tap(spot.x, spot.y);
  await page.waitForTimeout(900);
  const s = await menuState(page);
  check(`A tap over ${spot.id} begins the game without pressing it`,
    s.bootGone && untouched(s),
    s.bootGone
      ? (untouched(s) ? 'menu untouched'
        : `tapped through to ${s.modal ?? (s.guide ? 'How to Play' : `${s.cards} region cards`)}`)
      : 'the boot screen did not go');
  await ctx.close();
}
{
  // And somewhere with nothing behind it, so the row above is a claim about
  // the buttons rather than about taps in general.
  const { ctx, page } = await fresh();
  await page.touchscreen.tap(195, 120);
  await page.waitForTimeout(900);
  const s = await menuState(page);
  check('A tap on empty sky does the same', s.bootGone && untouched(s),
    s.bootGone ? 'menu untouched' : 'the boot screen did not go');
  await ctx.close();
}

// ============ B. IT STILL DOES THE THINGS THE TAP IS FOR
{
  const { ctx, page } = await fresh();
  const before = await page.evaluate(() => window.__api?.soundRunning?.() ?? null);
  await page.touchscreen.tap(deliberate.x, deliberate.y);
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => ({
    audio: window.__api?.soundRunning?.() ?? null,
    gone: !document.getElementById('boot'),
    atTitle: document.body.classList.contains('at-title'),
  }));
  check('A page load on its own still leaves the region silent', before === false,
    `running before the tap: ${before}`);
  check('And the tap still starts the audio', after.audio === true,
    `running after the tap: ${after.audio}`);
  check('And still hands over to the menu', after.gone && after.atTitle,
    `boot gone ${after.gone}, at title ${after.atTitle}`);
  await ctx.close();
}
{
  // The overlay has to still be hit-testable while it fades — that is the half
  // of the fix that stops the trailing click reaching the menu at all.
  const { ctx, page } = await fresh();
  await page.evaluate(() => window.__boot.activate());
  const fading = await page.evaluate(() => {
    const b = document.getElementById('boot');
    return b ? { going: b.classList.contains('going'), pe: getComputedStyle(b).pointerEvents } : null;
  });
  check('The screen still owns the pointer while it fades',
    !!fading && fading.going && fading.pe !== 'none',
    fading ? `going ${fading.going}, pointer-events ${fading.pe}` : 'no screen');
  await ctx.close();
}

// ============ C. THE GUARD COMES OFF WITH THE SCREEN
{
  // A capture-phase swallower left standing would eat every press for the rest
  // of the session. This is the check that the cure is not worse than the bug.
  const { ctx, page } = await fresh();
  await page.touchscreen.tap(195, 120);
  await page.waitForSelector('#boot', { state: 'detached', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  const swallowed = await page.evaluate(() => {
    const e = new MouseEvent('click', { cancelable: true, bubbles: true });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
  check('A press after the handover is not swallowed', swallowed === false,
    `defaultPrevented: ${swallowed}`);

  await page.touchscreen.tap(deliberate.x, deliberate.y);
  await page.waitForTimeout(700);
  const s = await menuState(page);
  check('And the menu answers a deliberate tap normally',
    s.cards === 4 || !!s.modal,
    s.cards ? `${s.cards} region cards` : `opened "${s.modal}"`);
  await ctx.close();
}
{
  // Desktop, where the bug never showed: a click must behave the same.
  const { ctx, page } = await fresh({ viewport: { width: 1280, height: 900 } });
  await page.mouse.click(640, 700);
  await page.waitForTimeout(900);
  const s = await menuState(page);
  check('With a mouse it is unchanged', s.bootGone && untouched(s),
    s.bootGone ? 'menu untouched' : 'the boot screen did not go');
  await ctx.close();
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
