// M55 — the submenus, in the console's language.
//   A. every screen off the main menu wears the same frame and header
//   B. every list is the same row
//   C. every choice is the same button
//   D. and nothing that arrives *during* play was restyled with them
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';
const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);
const ASI = 'rgb(122, 233, 255)';

const seedReturning = () => {
  const api = window.__api;
  const g = api.newGame(4242, 'verdant');
  g.tick = 39; g.population = 1240;
  api.saveTo('top:save', g);
  localStorage.setItem('top:archive', JSON.stringify([
    { runId: 1, endedAt: Date.now() - 8e6, scenario: 'rustbelt', scenarioName: 'Rustbelt Revival',
      tick: 96, finalPopulation: 4200, peakPopulation: 5100, cause: 'Civil unrest',
      kind: 'terminated', asiPhase: 3,
      history: [{ tick: 4, kind: 'build', text: 'Built Housing Block.' }] },
    { runId: 2, endedAt: Date.now() - 2e7, scenario: 'sunbelt', scenarioName: 'Sunbelt Dry',
      tick: 132, finalPopulation: 9100, peakPopulation: 9600, cause: 'Administrative lockout',
      kind: 'observer', asiPhase: 6, history: [] },
  ]));
};

const fresh = async (opts = { viewport: { width: 1280, height: 900 } }) => {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => localStorage.clear());
  await page.waitForFunction(() => !!window.__api, null, { timeout: 20000 }).catch(() => {});
  await page.evaluate(seedReturning);
  await page.reload();
  await page.waitForTimeout(1100);
  await pastBoot(page);
  await page.waitForTimeout(600);
  return { ctx, page };
};

/** What a dialog looks like, measured rather than described. */
const dialog = (page) => page.evaluate(() => {
  const box = document.querySelector('.modal:not(.hidden) .modal-box');
  if (!box) return null;
  const h2 = box.querySelector(':scope > h2');
  const cs = (el, pseudo) => getComputedStyle(el, pseudo);
  // All four edges, not just the top one. Each bracket is drawn by zeroing two
  // borders — and `border-top: 0` is a shorthand, so it resets that edge's
  // *colour* to currentColor as well as its width. Reading `borderTopColor` on
  // the bottom-right bracket therefore returns the text colour, which is how a
  // correctly drawn frame reported itself as unframed.
  const brackets = ['::before', '::after'].map((p) => {
    const s = cs(box, p);
    const edges = [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor];
    return { drawn: s.content !== 'none', edges, asi: edges.some((c) => c.includes('122, 233, 255')) };
  });
  return {
    title: h2?.textContent.trim() ?? null,
    upper: h2 ? cs(h2).textTransform : null,
    spaced: h2 ? cs(h2).letterSpacing : null,
    centred: h2 ? cs(h2).textAlign : null,
    // The hairline under the header is drawn by the h2's own ::after.
    rule: h2 ? cs(h2, '::after').content !== 'none' : false,
    brackets,
  };
});

const framed = (d) => !!d && d.upper === 'uppercase' && d.centred === 'center' &&
  d.spaced !== 'normal' && d.rule && d.brackets.every((b) => b.drawn && b.asi);

const home = async (page) => {
  await page.evaluate(() => {
    document.querySelector('.modal')?.classList.add('hidden');
    document.querySelector('.guide')?.classList.add('hidden');
    window.__ui.showTitle();
  });
  await page.waitForTimeout(350);
};

// ============ A. EVERY SCREEN OFF THE MENU WEARS THE FRAME
{
  const { ctx, page } = await fresh();
  const screens = [
    ['Load Save', () => window.__ui.showLoadMenu(true)],
    ['Past Administrations', () => window.__ui.showArchive(true)],
    ['Settings', () => window.__ui.showSettings()],
    ['Keyboard Shortcuts', () => window.__ui.showHotkeys()],
    ['the region picker', () => window.__ui.showScenarioPicker(true)],
  ];
  for (const [name, open] of screens) {
    await page.evaluate(open);
    await page.waitForTimeout(400);
    const d = await dialog(page);
    check(`${name} wears the console's frame and header`, framed(d),
      d ? `"${d.title}" — ${d.upper}, ${d.spaced} tracking, rule ${d.rule}, ` +
          `${d.brackets.filter((b) => b.drawn && b.asi).length}/2 corner brackets`
        : 'nothing opened');
    await home(page);
  }
  // The deepest screen off the menu: one administration's decisions.
  await page.evaluate(() => window.__ui.showArchive(true));
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('[data-row]')?.click());
  await page.waitForTimeout(400);
  const rec = await dialog(page);
  check('And so does a record’s decisions, two screens deep', framed(rec),
    rec ? `"${rec.title}"` : 'nothing opened');
  await home(page);

  // The walkthrough is a different shape, and still part of the family.
  await page.evaluate(() => window.__ui.showHowTo(true));
  await page.waitForTimeout(700);
  const guide = await page.evaluate(() => {
    const box = document.querySelector('.guide-box');
    if (!box) return null;
    const t = box.querySelector('.guide-title');
    const cs = (el, p) => getComputedStyle(el, p);
    return {
      title: t?.textContent.trim() ?? null,
      upper: t ? cs(t).textTransform : null,
      spaced: t ? cs(t).letterSpacing : null,
      rule: t ? cs(t, '::after').content !== 'none' : false,
      brackets: ['::before', '::after'].filter((p) => {
        const st = cs(box, p);
        return st.content !== 'none' && [st.borderTopColor, st.borderRightColor,
          st.borderBottomColor, st.borderLeftColor].some((c) => c.includes('122, 233, 255'));
      }).length,
    };
  });
  check('How to Play wears it too, at reading scale',
    !!guide && guide.upper === 'uppercase' && guide.spaced !== 'normal' &&
      guide.rule && guide.brackets === 2,
    guide ? `"${guide.title}" — ${guide.upper}, ${guide.brackets}/2 brackets` : 'no walkthrough');
  await ctx.close();
}

// ============ B. EVERY LIST IS THE SAME ROW
{
  const { ctx, page } = await fresh();
  const readRows = () => page.evaluate(() => [...document.querySelectorAll('.modal:not(.hidden) .save-row')]
    .map((r) => {
      const meta = r.querySelector('.tb-meta');
      return {
        icons: r.querySelectorAll('.tb-ico svg.ico').length,
        label: r.querySelector('.tb-label')?.textContent.trim() ?? null,
        bold: r.querySelector('.tb-label') ? getComputedStyle(r.querySelector('.tb-label')).fontWeight : null,
        meta: meta?.textContent.trim() ?? null,
        metaMono: meta ? getComputedStyle(meta).fontFamily.toLowerCase() : null,
        edge: getComputedStyle(r, '::before').content !== 'none',
        del: !!r.querySelector('[data-del]'),
      };
    }));
  const mono = (f) => !!f && (f.includes('cascadia') || f.includes('consolas') || f.includes('mono'));

  await page.evaluate(() => window.__ui.showLoadMenu(true));
  await page.waitForTimeout(400);
  const saves = await readRows();
  check('A save is an icon, a label, and its figures set apart in the mono face',
    saves.length >= 1 && saves.every((r) => r.icons === 1 && r.label && Number(r.bold) >= 600 &&
      r.meta && mono(r.metaMono) && r.edge && r.del),
    saves.length ? saves.map((r) => `"${r.label}" ${r.meta}`).join(' | ') : 'no saves');
  await home(page);

  await page.evaluate(() => window.__ui.showArchive(true));
  await page.waitForTimeout(400);
  const past = await readRows();
  check('And so is an administration on the record',
    past.length === 2 && past.every((r) => r.icons === 1 && r.label && r.meta && mono(r.metaMono) && r.edge),
    past.length ? past.map((r) => `"${r.label}" ${r.meta}`).join(' | ') : 'no records');
  // Two endings, two marks — and neither of them claims a cause the record
  // does not have.
  const marks = await page.evaluate(() => [...document.querySelectorAll('.save-row .tb-ico svg')]
    .map((s) => s.getAttribute('class')));
  check('The two kinds of ending carry different marks',
    marks.length === 2 && new Set(marks).size === 2, marks.join(', '));

  // And the row still does what the row is for.
  await page.evaluate(() => document.querySelector('[data-row]')?.click());
  await page.waitForTimeout(500);
  const opened = await page.evaluate(() =>
    document.querySelector('.modal:not(.hidden) h2')?.textContent.trim() ?? '');
  check('Pressing one still opens its decisions', /rustbelt|sunbelt/i.test(opened), opened || 'nothing');
  await ctx.close();
}

// ============ C. EVERY CHOICE IS THE SAME BUTTON
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => window.__ui.showLoadMenu(true));
  await page.waitForTimeout(400);
  const btns = await page.evaluate(() => [...document.querySelectorAll('.modal:not(.hidden) .choice-btn')]
    .map((b) => ({
      label: b.textContent.trim(),
      edge: getComputedStyle(b, '::before').content !== 'none',
      edgeColour: getComputedStyle(b, '::before').backgroundColor,
      recommended: b.classList.contains('recommended'),
    })));
  check('A choice carries the same lit edge as every other row in the game',
    btns.length >= 1 && btns.every((b) => b.edge),
    btns.map((b) => `${b.label}: ${b.edgeColour}`).join(', ') || 'no choices');
  await ctx.close();
}

// ============ D. THE SAME DIALOG, WHEREVER IT WAS OPENED FROM
//
// M55 scoped this milestone's frame to `body.at-title` and pinned that here,
// on the argument that a decision which interrupts a game should go on looking
// like an interruption. M61 kept the argument and threw out the scope: Settings
// and Load Game are the *same dialogs* reached through two doors, and they
// looked like two programs. What distinguishes them now is not where the game
// is — it is who opened the dialog.
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => window.__ui.onSession({ kind: 'new', scenario: 'verdant' }));
  await page.waitForTimeout(1600);
  const read = () => page.evaluate(() => {
    const box = document.querySelector('.modal:not(.hidden) .modal-box');
    const h2 = box?.querySelector(':scope > h2');
    return {
      atTitle: document.body.classList.contains('at-title'),
      opened: !!box,
      title: h2?.textContent ?? '',
      upper: h2 ? getComputedStyle(h2).textTransform : null,
      spacing: h2 ? getComputedStyle(h2).letterSpacing : null,
      rule: h2 ? getComputedStyle(h2, '::after').backgroundImage : null,
      brackets: box ? ['::before', '::after']
        .filter((pp) => getComputedStyle(box, pp).content !== 'none').length : -1,
      bg: box ? getComputedStyle(box).backgroundImage : null,
    };
  });

  // A dialog the player asked for, opened mid-game.
  await page.evaluate(() => {
    document.querySelector('.modal')?.classList.add('hidden');
    window.__ui.showSettings();
  });
  await page.waitForTimeout(400);
  const mine = await read();
  check('A dialog opened during play wears the console frame, same as at the title',
    mine.opened && !mine.atTitle && mine.upper === 'uppercase'
    && mine.brackets === 2 && /gradient/.test(mine.bg ?? ''),
    mine.opened ? `at title ${mine.atTitle}, header ${mine.upper}, ${mine.brackets} brackets, ${/gradient/.test(mine.bg ?? '') ? 'panel gradient' : mine.bg}`
      : 'no dialog opened');
  check('And its header sits over the console hairline',
    /rgb\(122, 233, 255\)/.test(mine.rule ?? ''), mine.rule ?? 'none');

  // A dialog that opened itself.
  const incoming = await page.evaluate(async () => {
    const api = window.__api, g = window.__game, ui = window.__ui;
    document.querySelector('.modal')?.classList.add('hidden');
    g.pendingEvent = api.EVENTS.find((e) => e.choices.length >= 2) ?? api.EVENTS[0];
    ui.refresh(g);
    return g.pendingEvent.title;
  });
  await page.waitForTimeout(400);
  const theirs = await read();
  check('A decision that arrives on its own carries no brackets',
    theirs.opened && theirs.brackets === 0 && /gradient/.test(theirs.bg ?? ''),
    theirs.opened ? `${theirs.brackets} brackets, ${/gradient/.test(theirs.bg ?? '') ? 'the same panel gradient' : theirs.bg}`
      : 'no dialog opened');
  // The distinction has to be visible in the dialog itself, not only in a
  // property nobody looks at: the rule under an event is amber, and its title
  // is a sentence rather than a letterspaced label.
  check('Its rule is the colour this console uses for something wanting an answer',
    /rgb\(232, 200, 90\)/.test(theirs.rule ?? ''), theirs.rule ?? 'none');
  check('And it keeps its title as a title rather than a label',
    theirs.upper === 'none' && theirs.title === incoming,
    `text-transform ${theirs.upper}, letter-spacing ${theirs.spacing}, "${theirs.title}"`);
  // Both are the same material — that is the whole point of the milestone.
  check('Both are cut from the same panel',
    mine.bg === theirs.bg && mine.bg !== null,
    mine.bg === theirs.bg ? 'identical background' : `${mine.bg} vs ${theirs.bg}`);
  await ctx.close();
}

// ============ E. AND IT ALL STILL FITS
for (const [name, vp] of [
  ['on a phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ['in landscape', { viewport: { width: 740, height: 380 } }],
]) {
  const { ctx, page } = await fresh(vp);
  const worst = [];
  for (const [label, open] of [
    ['Load Save', () => window.__ui.showLoadMenu(true)],
    ['Past Administrations', () => window.__ui.showArchive(true)],
    ['Settings', () => window.__ui.showSettings()],
  ]) {
    await page.evaluate(open);
    await page.waitForTimeout(400);
    const fit = await page.evaluate(() => {
      const box = document.querySelector('.modal:not(.hidden) .modal-box');
      if (!box) return null;
      const r = box.getBoundingClientRect();
      return {
        inside: r.left >= -1 && r.right <= innerWidth + 1,
        scrollX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    worst.push([label, fit]);
    await home(page);
  }
  check(`Every dialog fits ${name}`,
    worst.every(([, f]) => f && f.inside && f.scrollX <= 0),
    worst.map(([l, f]) => `${l}: ${f ? (f.inside ? 'inside' : 'overflows') : 'missing'}`).join(', '));
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
