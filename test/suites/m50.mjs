// M50 — the boot screen.
//   A. it is on screen before the game module is
//   B. the bar reports work that is actually happening
//   C. what it precaches is what the game then uses
//   D. the tap starts the audio and hands over to the menu
//   E. and it leaves nothing behind
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const fresh = async (w = 1280, h = 900) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  return { ctx, page };
};
/** Get past the boot screen the way a player does, with a real press. */
const tapThrough = async (page) => {
  if (!(await page.locator('#boot').count())) return false;
  await page.waitForFunction(() => window.__boot?.loaded(), null, { timeout: 15000 }).catch(() => {});
  // Two presses at most: the first settles the intro if it is still playing,
  // the second answers the prompt. Both are real clicks, because the audio
  // assertion below is worthless if the gesture was synthetic.
  for (let i = 0; i < 2 && await page.locator('#boot').count(); i++) {
    await page.mouse.click(640, 700);
    await page.waitForTimeout(260);
  }
  await page.waitForSelector('#boot', { state: 'detached', timeout: 5000 }).catch(() => {});
  return true;
};

// ============ A. ON SCREEN BEFORE THE GAME IS
{
  const res = await fetch('http://localhost:4173/index.html');
  const html = await res.text();
  check('The boot screen is in the document, not built by the script it is covering for',
    html.includes('id="boot"') && html.includes('OPTIMIZATION') && html.includes('Tap to Begin'),
    `${html.length} bytes of markup`);

  const { ctx, page } = await fresh();
  // The paint that matters is the first one. Everything the bar counts happens
  // after it, which is the whole point of moving the work behind a screen.
  //
  // Waited for rather than read: `goto` resolves on load, and the paint entry
  // is filed by the compositor a beat later — asking straight away returned -1
  // about half the time, which is a harness that reports a missing measurement
  // as a failed one.
  await page.waitForFunction(
    () => performance.getEntriesByName('first-contentful-paint').length > 0, null, { timeout: 8000 }
  ).catch(() => {});
  await page.waitForFunction(() => window.__boot?.loaded(), null, { timeout: 15000 }).catch(() => {});
  const paint = await page.evaluate(() => {
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      fcp: Math.round(fcp ? fcp.startTime : -1),
      domInteractive: Math.round(nav.domInteractive),
      loadedAt: Math.round(window.__boot?.loadedAt?.() ?? -1),
    };
  });
  // Against the loading's own clock, not against a number that looked fast.
  // "Under 900ms" was true of the previous build too — where the first paint
  // *is* the finished menu, after every one of these nine steps has run — so
  // it distinguished nothing. The claim is an ordering: the title is on screen
  // before the work behind it is done.
  check('The title is painted before the work behind it has even finished',
    paint.fcp > 0 && paint.loadedAt > 0 && paint.fcp < paint.loadedAt,
    `first contentful paint at ${paint.fcp}ms, loading done at ${paint.loadedAt}ms`);

  const title = await page.evaluate(() => {
    const h1 = document.querySelector('.boot-title');
    const chars = [...document.querySelectorAll('.boot-ch')];
    return {
      label: h1?.getAttribute('aria-label') ?? '',
      chars: chars.length,
      hidden: [...document.querySelectorAll('.boot-line')].every((l) => l.getAttribute('aria-hidden') === 'true'),
      staggered: new Set(chars.map((c) => c.style.animationDelay)).size,
      text: chars.map((c) => c.textContent).join(''),
    };
  });
  check('It animates letter by letter', title.chars === 22 && title.staggered === 22,
    `${title.chars} letters, ${title.staggered} distinct delays`);
  // `hidden` is an `every()` over the animated lines, which is trivially true
  // of a build that has none — so it only counts alongside there being 22
  // letters for it to be hiding.
  check('Which a screen reader is never asked to read one letter at a time',
    title.label === 'The Optimization Problem' && title.chars === 22 && title.hidden,
    `labelled "${title.label}", ${title.chars} letters, lines hidden: ${title.hidden}`);
  check('And the letters still spell the title', title.text === 'THEOPTIMIZATIONPROBLEM', title.text);
  console.log(`  · paint: fcp ${paint.fcp}ms, domInteractive ${paint.domInteractive}ms, loaded ${paint.loadedAt}ms`);
  await ctx.close();
}

// ============ B. THE BAR REPORTS WORK THAT IS HAPPENING
{
  const { ctx, page } = await fresh();
  // Sampled from inside the page, every frame, so the trace is what the bar
  // did rather than what it was doing whenever the harness got round to asking.
  // Null rather than a throw when there is no bar. On the previous build none
  // of this exists, and a harness that dies on the first missing element
  // proves only that the element is new — it never gets as far as the
  // assertions it was written to make.
  const trace = await page.evaluate(() => new Promise((done) => {
    const seen = [];
    const bar = document.getElementById('boot-bar');
    if (!bar || !window.__boot) { done(null); return; }
    const tick = () => {
      const pct = Number(bar.getAttribute('aria-valuenow'));
      const step = document.getElementById('boot-step').textContent;
      const last = seen[seen.length - 1];
      if (!last || last.pct !== pct || last.step !== step) seen.push({ pct, step, t: Math.round(performance.now()) });
      if (window.__boot.loaded() && seen.length > 1) { done(seen); return; }
      requestAnimationFrame(tick);
    };
    tick();
  }));
  if (!trace) for (const n of ['a bar to watch']) check(`There is ${n}`, false, 'no boot screen on this build');
  const pcts = (trace ?? []).map((s) => s.pct);
  const labels = await page.evaluate(() => window.__boot?.labels ?? []);

  check('The bar counts real work: five sprite atlases, four region surveys, the region',
    labels.length === 9 && labels[0] === 'Compiling terrain' && labels[8] === 'Founding the region',
    labels.join(' · '));
  check('Every step it names is one the player is shown on screen',
    !!trace && trace.filter((s) => labels.includes(s.step)).length >= 5,
    trace ? `${new Set(trace.map((s) => s.step)).size} distinct labels seen: ${[...new Set(trace.map((s) => s.step))].slice(0, 4).join(', ')}…` : 'nothing was shown');
  // Not `pcts[0] === 0`: the first sample is taken on the first frame the
  // harness gets, by which time a step has already finished, and the reading
  // it caught was 11%. Where the bar *starts* is a property of the markup —
  // it is served at zero — and the trace's job is the rest of the journey.
  const startsAtZero = (await (await fetch('http://localhost:4173/index.html')).text())
    .includes('aria-valuenow="0"');
  check('It is served empty and it ends full',
    startsAtZero && pcts.length > 0 && pcts[pcts.length - 1] === 100,
    `markup at 0%, first reading caught at ${pcts[0]}%, last ${pcts[pcts.length - 1]}%`);
  check('And it only ever goes forwards',
    pcts.length > 0 && pcts.every((p, i) => i === 0 || p >= pcts[i - 1]),
    pcts.length ? pcts.join(' → ') : 'no readings');
  check('It moves in steps a player can see, rather than in one flash',
    !!trace && new Set(pcts).size >= 6 && trace[trace.length - 1].t - trace[0].t > 40,
    trace ? `${new Set(pcts).size} distinct readings over ${trace[trace.length - 1].t - trace[0].t}ms` : 'no bar');
  check('The number on the screen is the number in the accessibility tree',
    await page.evaluate(() => !!document.getElementById('boot-pct') &&
      document.getElementById('boot-pct').textContent ===
      `${document.getElementById('boot-bar').getAttribute('aria-valuenow')}%`),
    await page.evaluate(() => document.getElementById('boot-pct')?.textContent ?? 'no readout'));
  if (trace) console.log(`  · bar: ${pcts.join(' ')} over ${trace[trace.length - 1].t - trace[0].t}ms`);
  await ctx.close();
}

// ============ C. WHAT IT DREW IS WHAT THE GAME USES
{
  const { ctx, page } = await fresh();
  await tapThrough(page);
  const survey = await page.evaluate(() => {
    const api = window.__api;
    if (!api?.regionThumbnail || !api.openingSeed) return null;
    const ids = ['verdant', 'sunbelt', 'rustbelt', 'coast'];
    // Cached *before* asking for it: the check is whether the boot screen's
    // four maps are the four the picker is about to want, and calling
    // regionThumbnail first would populate the cache and then congratulate
    // itself for finding it populated.
    const cachedFirst = ids.map((id) => api.isCached(id, api.openingSeed(id)));
    const t = performance.now();
    const urls = ids.map((id) => api.regionThumbnail(id, api.openingSeed(id)));
    return { cachedFirst, cost: +(performance.now() - t).toFixed(1), urls };
  });
  check('The four regions the boot screen surveyed are already drawn',
    !!survey && survey.cachedFirst.every(Boolean),
    survey ? survey.cachedFirst.join(',') : 'no api');
  check('So opening the picker founds nothing — it is looking at kept pictures',
    !!survey && survey.cost < 2, survey ? `${survey.cost}ms for all four` : 'no api');

  await page.evaluate(() => window.__ui.showScenarioPicker(true));
  await page.waitForTimeout(400);
  const onCards = await page.evaluate(() =>
    [...document.querySelectorAll('.region-card')].map((c) => c.querySelector('.region-map').src));
  check('And the maps on the cards are those maps, not four rolled afterwards',
    onCards.length === 4 && survey && onCards.every((u, i) => u === survey.urls[i]),
    `${onCards.length} cards, ${onCards.filter((u, i) => survey && u === survey.urls[i]).length} matching`);
  await ctx.close();
}

// ============ D. THE TAP
{
  const { ctx, page } = await fresh();
  // Mid-intro: the work is finished long before the title is, and the prompt
  // must not arrive over the top of a word still being drawn.
  const hasBoot = await page.waitForFunction(() => window.__boot?.loaded(), null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  // Read before anything has been pressed. Any real press arms the audio —
  // `main.ts` listens at the window and would catch the skip-press below — so
  // sampling this after the first click proves only that clicking works.
  const beforeAudio = await page.evaluate(() => window.__api?.soundRunning?.() ?? null);
  const early = hasBoot ? await page.evaluate(() => ({
    t: Math.round(performance.now()), loaded: window.__boot.loaded(),
    offered: window.__boot.offered(), pct: window.__boot.percent(),
  })) : null;
  check('The work finishes before the title does',
    !!early && early.loaded && early.pct === 100,
    early ? `100% at ${early.t}ms` : 'no loading screen on this build');
  check('And the prompt waits for the title rather than landing on top of it',
    !!early && !early.offered,
    early ? `offered at ${early.t}ms: ${early.offered}` : 'no prompt on this build');

  // A press during the intro means "get on with it", never "wait".
  await page.mouse.click(640, 700);
  await page.waitForTimeout(120);
  const skipped = await page.evaluate(() => {
    const b = document.getElementById('boot');
    if (!b || !window.__boot) return null;
    return {
      settled: b.classList.contains('settled'),
      offered: window.__boot.offered(), dismissed: window.__boot.dismissed(),
      t: Math.round(performance.now()),
    };
  });
  check('A press before the prompt skips the intro instead of being ignored',
    !!skipped && skipped.settled && skipped.offered && !skipped.dismissed,
    skipped ? `settled ${skipped.settled}, prompt up ${skipped.offered}, at ${skipped.t}ms` : 'nothing to skip');

  if (await page.locator('#boot-begin').count()) await page.locator('#boot-begin').click();
  else await page.mouse.click(640, 700);
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => ({
    audio: window.__api?.soundRunning?.() ?? null,
    gone: !document.getElementById('boot'),
    booting: document.body.classList.contains('booting'),
    atTitle: document.body.classList.contains('at-title'),
    menu: [...document.querySelectorAll('.title-btn')].map((b) => b.id),
  }));
  check('A page load on its own leaves the region silent',
    beforeAudio === false, `audio running before any press: ${beforeAudio}`);
  check('And the press is what starts it',
    after.audio === true, `audio running after the press: ${after.audio}`);
  check('The screen is removed rather than hidden',
    hasBoot && after.gone && !after.booting,
    hasBoot ? `#boot present: ${!after.gone}` : 'there was no screen to remove');
  // Conditioned on there having been a screen to hand over from: the menu is
  // up on the previous build too, and "the menu is up" is not a fact about a
  // handover that never happened.
  check('And it hands over to the menu it was covering',
    hasBoot && after.atTitle && after.menu.includes('t-new'),
    hasBoot ? after.menu.join(', ') : 'nothing handed over');
  await ctx.close();
}

// ============ E. AND IT LEAVES NOTHING BEHIND
{
  // The boot screen answers to any key while it is up, which means it is
  // calling preventDefault on every one of them. If that handler outlived the
  // screen it would eat the hotkeys, the transport and Escape for the rest of
  // the session, from something no longer on the page.
  //
  // Paired, on the same key, and on a key the game itself has no use for: `1`
  // and the space bar still come back consumed after the handover because the
  // *game* wants them, which is the interface working rather than the boot
  // screen refusing to let go.
  const probe = (page) => page.evaluate(() => {
    const e = new KeyboardEvent('keydown', { key: 'q', cancelable: true, bubbles: true });
    dispatchEvent(e);
    return e.defaultPrevented;
  });
  const { ctx, page } = await fresh();
  await page.waitForFunction(() => window.__boot?.loaded(), null, { timeout: 15000 }).catch(() => {});
  const duringBoot = await probe(page);
  await tapThrough(page);
  const afterBoot = await probe(page);
  check('While the screen is up it answers to any key',
    duringBoot, `keypress consumed during boot: ${duringBoot}`);
  // Paired with the line above rather than standing alone. On a build with no
  // boot screen nothing consumes the key either, and "the handler is gone" is
  // not something to claim about a handler that was never installed.
  check('And it took that handler with it on the way out',
    duringBoot && !afterBoot,
    `consumed during boot: ${duringBoot}, after handover: ${afterBoot}`);

  await page.locator('#t-new').click();
  await page.waitForTimeout(500);
  const picker = await page.evaluate(() => [...document.querySelectorAll('.region-card')].map((c) => c.dataset.row));
  check('The menu underneath still works when pressed', picker.length === 4, picker.join(','));

  // The guide builds a second Renderer. A stopwatch on how long *How to Play*
  // takes to open cannot tell atlases apart from the walkthrough scene it also
  // generates, so this asks the one question that has a clean answer: are they
  // the same objects.
  await page.evaluate(() => window.__ui.showHowTo(true));
  await page.waitForTimeout(600);
  const shared = await page.evaluate(() => {
    const g = window.__ui.guide, r = window.__renderer;
    if (!g?.renderer || !r) return null;
    return {
      terrain: g.renderer.terrain === r.terrain,
      roads: g.renderer.roads === r.roads,
      buildings: g.renderer.buildings === r.buildings,
      cars: g.renderer.cars === r.cars,
      peds: g.renderer.peds === r.peds,
    };
  });
  check('The walkthrough draws from the same atlases rather than a second set',
    !!shared && Object.values(shared).every(Boolean),
    shared ? Object.entries(shared).map(([k, v]) => `${k}:${v}`).join(' ') : 'no second renderer');
  await ctx.close();
}

// ============ F. THE TITLE IS IN THE MIDDLE OF THE SCREEN
{
  // Three shapes, because "centred" is the sort of claim that is true at the
  // size it was designed at and nowhere else.
  for (const [name, vp] of [
    ['on a desktop', { width: 1280, height: 820 }],
    ['on a phone', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
    ['in landscape', { width: 780, height: 400 }],
  ]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto('http://localhost:4173');
    await page.waitForFunction(() => window.__boot?.offered(), null, { timeout: 20000 }).catch(() => {});
    const box = await page.evaluate(() => {
      const t = document.querySelector('.boot-title');
      const f = document.querySelector('.boot-foot');
      const g = document.querySelector('.boot-begin');
      if (!t || !f || !g) return null;
      const tr = t.getBoundingClientRect(), fr = f.getBoundingClientRect(), gr = g.getBoundingClientRect();
      return {
        off: Math.round((tr.top + tr.height / 2) - innerHeight / 2),
        hOff: Math.round((tr.left + tr.width / 2) - innerWidth / 2),
        gap: Math.round(fr.top - tr.bottom),
        promptWhole: gr.top >= 0 && gr.bottom <= innerHeight,
        titleWhole: tr.top >= 0 && tr.bottom <= innerHeight,
      };
    });
    check(`The title is in the middle of the screen ${name}`,
      !!box && Math.abs(box.off) <= 14 && Math.abs(box.hOff) <= 1 && box.titleWhole,
      box ? `${box.off}px off vertically, ${box.hOff}px horizontally` : 'no title');
    // The loader is positioned against the screen. Left inside `.boot-stage` —
    // which is only as tall as the words in it — its `bottom` resolved against
    // that instead, and the bar landed across the middle of the title.
    check(`And the loading bar is clear of it ${name}`,
      !!box && box.gap > 30 && box.promptWhole,
      box ? `${box.gap}px of clearance, prompt fully on screen: ${box.promptWhole}` : 'no loader');
    await ctx.close();
  }
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
