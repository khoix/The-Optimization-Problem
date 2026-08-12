// M54 — the main menu.
//   A. the copy is the copy that was asked for
//   B. the mark is the boot screen's mark, and one heading to a screen reader
//   C. every control is a row: an icon, what it does, and the figure it is about
//   D. and it still does all the things it did
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';
const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const TAG_1 = 'Govern a growing region in a time of AI. Every decision is reasonable.';
const TAG_2 = 'That’s the problem.';

/** A returning player: a save on disk and two finished administrations. */
const seedReturning = () => {
  const api = window.__api;
  const g = api.newGame(4242, 'verdant');
  g.tick = 39;
  g.population = 1240;
  api.saveTo('top:save', g);
  // Complete records. The first version left out `peakPopulation`, which the
  // archive renders with `.toLocaleString()` — so pressing Past Administrations
  // threw, the dialog never opened, and the check reported it as a layout
  // problem. A probe that seeds half a record tests half a screen.
  localStorage.setItem('top:archive', JSON.stringify([
    { runId: 1, endedAt: Date.now() - 8e6, scenario: 'rustbelt', scenarioName: 'Rustbelt Revival',
      tick: 96, finalPopulation: 4200, peakPopulation: 5100, cause: 'Civil unrest',
      kind: 'terminated', asiPhase: 3, history: [] },
    { runId: 2, endedAt: Date.now() - 2e7, scenario: 'sunbelt', scenarioName: 'Sunbelt Dry',
      tick: 132, finalPopulation: 9100, peakPopulation: 9600, cause: 'Administrative lockout',
      kind: 'observer', asiPhase: 6, history: [] },
  ]));
};

const fresh = async (opts = { viewport: { width: 1280, height: 900 } }, seed = null) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => localStorage.clear());
  if (seed) {
    // `__api` only exists once the boot screen's last step has imported main.
    await page.waitForFunction(() => !!window.__api, null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(seed);
  }
  await page.reload();
  await page.waitForTimeout(1100);
  await pastBoot(page);
  await page.waitForTimeout(600);
  return { ctx, page };
};

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.title-btn')].map((b) => {
  const r = b.getBoundingClientRect();
  return {
    id: b.id,
    tag: b.tagName,
    primary: b.classList.contains('primary'),
    icons: b.querySelectorAll('.tb-ico svg.ico').length,
    label: b.querySelector('.tb-label')?.textContent.trim() ?? null,
    meta: b.querySelector('.tb-meta')?.textContent.trim() ?? null,
    metaMono: b.querySelector('.tb-meta')
      ? getComputedStyle(b.querySelector('.tb-meta')).fontFamily.toLowerCase() : null,
    align: getComputedStyle(b).textAlign,
    w: Math.round(r.width), h: Math.round(r.height),
  };
}));

// ============ A. THE COPY
{
  const { ctx, page } = await fresh();
  const tag = await page.evaluate(() => {
    const t = document.querySelector('.title-tag');
    if (!t) return null;
    const s = t.querySelector('span');
    return {
      full: t.textContent.replace(/\s+/g, ' ').trim(),
      html: t.innerHTML.replace(/\s+/g, ' ').trim(),
      span: s?.textContent.trim() ?? null,
      spanColour: s ? getComputedStyle(s).color : null,
      restColour: getComputedStyle(t).color,
    };
  });
  check('The line under the title is the line that was asked for',
    !!tag && tag.full === `${TAG_1}${TAG_2}`, tag ? tag.full : 'no tagline');
  check('And the break falls where the copy puts it, before the punchline',
    !!tag && /reasonable\.<br>/.test(tag.html) && tag.span === TAG_2,
    tag ? `breaks before "${tag.span}"` : 'none');
  check('The punchline is the one line in the ASI’s colour',
    !!tag && tag.spanColour === 'rgb(122, 233, 255)' && tag.restColour !== tag.spanColour,
    tag ? `${tag.spanColour} against ${tag.restColour}` : 'none');
  // The old screen said this twice — a tagline and a paragraph under it. One
  // of them is now the whole of it.
  const leftovers = await page.evaluate(() => ({
    what: !!document.querySelector('.title-what'),
    oldTag: document.body.textContent.includes('That is the problem.'),
  }));
  check('And the paragraph it replaced is gone rather than left underneath',
    !leftovers.what && !leftovers.oldTag,
    `.title-what ${leftovers.what ? 'still there' : 'gone'}, old wording ${leftovers.oldTag ? 'still there' : 'gone'}`);
  await ctx.close();
}

// ============ B. THE MARK
{
  const { ctx, page } = await fresh();
  const mark = await page.evaluate(() => {
    const h = document.querySelector('.title-mark');
    if (!h) return null;
    const parts = [...h.querySelectorAll('span')];
    return {
      heading: h.tagName,
      label: h.getAttribute('aria-label'),
      lines: parts.map((p) => p.textContent.trim()),
      hidden: parts.every((p) => p.getAttribute('aria-hidden') === 'true'),
      headings: document.querySelectorAll('.title-card h1, .title-card h2').length,
    };
  });
  check('The mark is stacked the way the boot screen stacks it',
    !!mark && mark.lines.join(' ') === 'THE OPTIMIZATION PROBLEM',
    mark ? mark.lines.join(' / ') : 'none');
  check('And a screen reader gets one heading, not three shouted words',
    !!mark && mark.heading === 'H1' && mark.label === 'The Optimization Problem' &&
      mark.lines.length === 3 && mark.hidden && mark.headings === 1,
    mark ? `${mark.heading} labelled "${mark.label}", ${mark.lines.length} lines hidden: ${mark.hidden}` : 'none');
  await ctx.close();
}

// ============ C. EVERY CONTROL IS A ROW
{
  const { ctx, page } = await fresh(undefined, seedReturning);
  const r = await rows(page);
  const ids = r.map((x) => x.id).join(',');
  check('A returning player is offered every way back in',
    ids === 't-continue,t-load,t-past,t-new,t-how,t-settings', ids);
  check('Every one of them is a button carrying one icon from the console’s set',
    r.length === 6 && r.every((x) => x.tag === 'BUTTON' && x.icons === 1),
    `${r.length} rows, ${r.filter((x) => x.icons === 1).length} with an icon`);
  check('Every one says what it does, left-aligned, full width',
    r.length === 6 && r.every((x) => x.label && x.align === 'left') &&
      new Set(r.map((x) => x.w)).size === 1,
    `${new Set(r.map((x) => x.label)).size} distinct labels, ${new Set(r.map((x) => x.w)).size} width`);
  const withMeta = r.filter((x) => x.meta);
  check('And the figures sit apart from the labels, in the mono face',
    withMeta.length === 2 && withMeta.every((x) => x.metaMono.includes('cascadia') || x.metaMono.includes('consolas') || x.metaMono.includes('mono')),
    withMeta.map((x) => `${x.id}: "${x.meta}"`).join(', '));

  // One emphasis, and it is on the thing a returning player came back for.
  const primaries = r.filter((x) => x.primary);
  check('Exactly one row is the primary one, and it is Continue',
    primaries.length === 1 && primaries[0].id === 't-continue',
    primaries.map((x) => x.id).join(',') || 'none');

  // The figure has to be the save's figure, not a plausible-looking one.
  const truth = await page.evaluate(() => {
    // `peek` returns the envelope itself, not a slot record around one.
    const env = window.__api.peek('top:save');
    return env ? { year: Math.floor(env.tick / 12) + 1, pop: env.population } : null;
  });
  const cont = r.find((x) => x.id === 't-continue');
  check('Continue states the year and the population of the save it will open',
    !!truth && !!cont && cont.meta === `Year ${truth.year} · pop ${truth.pop.toLocaleString()}`,
    truth ? `row says "${cont?.meta}", save is year ${truth.year} pop ${truth.pop}` : 'no save');
  check('Past Administrations states how many there are',
    r.find((x) => x.id === 't-past')?.meta === '2', r.find((x) => x.id === 't-past')?.meta ?? 'none');
  await ctx.close();
}
{
  // With nothing on disk the emphasis has to move, or the screen has a primary
  // action that is not there.
  const { ctx, page } = await fresh();
  const r = await rows(page);
  const primaries = r.filter((x) => x.primary);
  check('With nothing saved, the emphasis moves to Begin New Simulation',
    r.length === 3 && primaries.length === 1 && primaries[0].id === 't-new',
    `${r.length} rows, primary ${primaries.map((x) => x.id).join(',') || 'none'}`);
  check('And no row claims a figure it does not have',
    r.every((x) => x.meta === null), r.map((x) => x.meta).join('|') || 'none carry one');
  await ctx.close();
}

// ============ D. AND IT STILL DOES WHAT IT DID
{
  const { ctx, page } = await fresh(undefined, seedReturning);
  const opens = async (id, probe) => {
    await page.locator(`#${id}`).click();
    await page.waitForTimeout(700);
    const got = await page.evaluate(probe);
    // Back out of whatever opened, so the next press starts from the menu —
    // and check it worked, rather than assuming, since a dialog left open is
    // how the *next* row gets reported as broken.
    for (let i = 0; i < 3; i++) {
      const closed = await page.evaluate(() => {
        if (!document.querySelector('.modal:not(.hidden)')) return true;
        const back = [...document.querySelectorAll('.modal:not(.hidden) .choice-btn')]
          .find((b) => /back|close|cancel/i.test(b.textContent));
        if (back) { back.click(); return false; }
        document.querySelector('.modal')?.classList.add('hidden');
        return false;
      });
      await page.waitForTimeout(400);
      if (closed) break;
    }
    if (!(await page.locator('#t-new').count())) {
      await page.evaluate(() => window.__ui.showTitle());
      await page.waitForTimeout(400);
    }
    return got;
  };
  // Every detail below reports what was measured. The first version passed a
  // hardcoded label — so a check that failed printed the name of the screen it
  // had *not* opened, which is worse than printing nothing.
  const cards = await opens('t-new', () => document.querySelectorAll('.region-card').length);
  check('Begin New Simulation still opens the region picker', cards === 4, `${cards} region cards`);
  const title = () => document.querySelector('.modal:not(.hidden) h2')?.textContent?.trim() ?? '(nothing opened)';
  const load = await opens('t-load', title);
  check('Load Save still opens the saves', /load/i.test(load), load);
  const past = await opens('t-past', title);
  check('Past Administrations still opens the archive', /administration/i.test(past), past);
  const settings = await opens('t-settings', title);
  check('Settings still opens settings', /settings/i.test(settings), settings);
  check('And the game chrome is still hidden behind all of it',
    await page.evaluate(() => document.body.classList.contains('at-title') &&
      getComputedStyle(document.querySelector('.civic-bar')).display === 'none'),
    'civic bar hidden');
  await ctx.close();
}
{
  // Continue is the one that leaves, so it goes last and on its own.
  const { ctx, page } = await fresh(undefined, seedReturning);
  await page.locator('#t-continue').click();
  await page.waitForTimeout(1400);
  const inGame = await page.evaluate(() => ({
    atTitle: document.body.classList.contains('at-title'),
    year: window.__game ? Math.floor(window.__game.tick / 12) + 1 : null,
  }));
  check('Continue still opens the save it named',
    !inGame.atTitle && inGame.year === 4, `left the title screen, year ${inGame.year}`);
  await ctx.close();
}

// ============ E. AND IT FITS
for (const [name, vp] of [
  ['on a desktop', { viewport: { width: 1280, height: 900 } }],
  ['on a phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['in landscape', { viewport: { width: 740, height: 380 } }],
]) {
  const { ctx, page } = await fresh(vp, seedReturning);
  const fit = await page.evaluate(() => {
    const card = document.querySelector('.title-card');
    const rs = [...document.querySelectorAll('.title-btn')];
    if (!card || !rs.length) return null;
    const c = card.getBoundingClientRect();
    return {
      inside: c.left >= 0 && c.right <= innerWidth + 1,
      rowsOnScreen: rs.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= innerHeight + 1;
      }).length,
      total: rs.length,
      shortest: Math.min(...rs.map((b) => Math.round(b.getBoundingClientRect().height))),
      scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  check(`The card fits ${name}, with every control reachable`,
    !!fit && fit.inside && fit.rowsOnScreen === fit.total && fit.scrollX <= 0,
    fit ? `${fit.rowsOnScreen}/${fit.total} rows on screen, ${fit.scrollX}px of sideways scroll` : 'no card');
  check(`And its rows are big enough to press ${name}`,
    !!fit && fit.shortest >= 38, fit ? `shortest row ${fit.shortest}px` : 'no rows');
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
