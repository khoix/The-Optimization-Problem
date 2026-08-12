// M47 — the list is the button, in Past Administrations too.
//   A. the row opens the decisions; there is no Decisions button
//   B. delete is a corner X, and it asks first
//   C. the X and the row do not fight each other
//   D. the shape is the same one the Load menu uses
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';
const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const clearAll = async (page) => {
  for (let i = 0; i < 12; i++) {
    const b = page.locator('.modal:not(.hidden) .choice-btn, .modal:not(.hidden) .btn-primary, .observer-overlay:not(.hidden) button').first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(140); }
    else break;
  }
};

/**
 * A page with three administrations on record.
 *
 * Written straight into the archive rather than played out: the panel under
 * test reads `top:archive` and knows nothing about how an entry got there, and
 * three failed regions is a great deal of simulation for a list.
 */
const ARCHIVE_KEY = 'top:archive';
const fresh = async (w = 1280, h = 800) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('top:boot', 'new:verdant'); });
  await page.reload();
  await page.waitForTimeout(1500);
  await pastBoot(page);
  await clearAll(page);
  await page.evaluate((key) => {
    const mk = (runId, name, tick, peak, kind, cause, decisions) => ({
      runId, scenarioName: name, tick, peakPopulation: peak, kind, cause,
      endedAt: runId,
      history: Array.from({ length: decisions }, (_, i) => ({
        tick: i * 3, kind: i % 3 === 0 ? 'system' : 'build',
        text: `${name} decision ${i + 1}`,
      })),
    });
    localStorage.setItem(key, JSON.stringify([
      mk(1001, 'Verdant Valley', 96, 4200, 'observer', 'Optimization complete.', 7),
      mk(1002, 'Rustbelt', 51, 1800, 'terminated', 'The treasury ran dry.', 4),
      mk(1003, 'Coastal Shelf', 132, 9100, 'terminated', 'The electorate replaced you.', 11),
    ]));
  }, ARCHIVE_KEY);
  await page.evaluate(() => { window.__game.speed = 0; });
  return { ctx, page };
};
const records = (page) => page.evaluate((key) => {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]').map((r) => r.runId); } catch { return []; }
}, ARCHIVE_KEY);
const openArchive = async (page) => {
  await page.evaluate(() => window.__ui.showArchive(false));
  await page.waitForTimeout(320);
};
/**
 * Click something, or report that it was not there to click.
 *
 * The previous build has no `data-row` on anything, so every locator in this
 * file resolves to nothing on it. Waiting thirty seconds and throwing proves
 * only that the selector is new; the checks below have to be allowed to fail.
 */
const tryClick = async (page, sel, opts) => {
  const el = page.locator(sel);
  if (!(await el.count())) return false;
  await el.first().click(opts);
  await page.waitForTimeout(300);
  return true;
};

// ============ A. THE ROW OPENS THE DECISIONS
{
  const { ctx, page } = await fresh();
  await openArchive(page);
  const panel = await page.evaluate(() => {
    const m = document.querySelector('.modal:not(.hidden)');
    const rows = [...m.querySelectorAll('.save-row')];
    return {
      title: m.querySelector('h2')?.textContent ?? '',
      count: rows.length,
      ids: rows.map((r) => r.dataset.row),
      roles: rows.map((r) => r.getAttribute('role')),
      tabbable: rows.every((r) => r.getAttribute('tabindex') === '0'),
      // Anything in a row that is a button and is not the corner X.
      innerButtons: rows.flatMap((r) =>
        [...r.querySelectorAll('button')].filter((b) => !b.classList.contains('row-x'))
          .map((b) => b.textContent.trim())),
      xs: rows.filter((r) => r.querySelector('.row-x')).length,
    };
  });
  check('The archive listed all three administrations',
    /past administrations/i.test(panel.title) && panel.count === 3,
    `${JSON.stringify(panel.title)}, ${panel.count} rows`);
  check('No Decisions button, and no other button beside the row either',
    panel.innerButtons.length === 0, JSON.stringify(panel.innerButtons));
  check('Every row is itself the control',
    panel.roles.every((r) => r === 'button') && panel.tabbable,
    `roles ${panel.roles.join(',')}`);
  check('And every row carries a corner X', panel.xs === 3, `${panel.xs} of ${panel.count}`);

  // Press the middle row anywhere — on its text, not on a control.
  const pressed = await tryClick(page, '.modal:not(.hidden) .save-row[data-row="1002"] .save-what');
  check('There is a row to press', pressed, 'no row carries a key');
  const rec = await page.evaluate(() => {
    const m = document.querySelector('.modal:not(.hidden)');
    return {
      title: m.querySelector('h2')?.textContent ?? '',
      body: m.querySelector('.modal-body')?.textContent ?? '',
      rows: m.querySelectorAll('.hist-row').length,
    };
  });
  check('Pressing the row opens that administration\'s decisions',
    /Rustbelt/.test(rec.title) && rec.rows === 4,
    `${JSON.stringify(rec.title)}, ${rec.rows} decisions`);
  check('And they are that administration\'s, not another\'s',
    /Rustbelt decision 1/.test(rec.body) && !/Verdant|Coastal/.test(rec.body),
    rec.body.slice(0, 70));

  // The keyboard reaches it too.
  await tryClick(page, '.modal:not(.hidden) .choice-btn:has-text("Back")');
  const keyRow = page.locator('.modal:not(.hidden) .save-row[data-row="1003"]');
  if (await keyRow.count()) { await keyRow.press('Enter'); await page.waitForTimeout(320); }
  const viaKey = await page.evaluate(() => document.querySelector('.modal:not(.hidden) h2')?.textContent ?? '');
  check('Enter on a focused row opens it as well', /Coastal Shelf/.test(viaKey), JSON.stringify(viaKey));
  await ctx.close();
}

// ============ B. DELETE IS A CORNER X, AND IT ASKS
{
  const { ctx, page } = await fresh();
  await openArchive(page);
  const geom = await page.evaluate(() => {
    const row = document.querySelector('.modal:not(.hidden) .save-row[data-row="1002"]');
    const x = row?.querySelector('.row-x');
    if (!row || !x) return { glyph: '', label: '', fromRight: 9999, size: [0, 0], share: 1 };
    const rr = row.getBoundingClientRect(), xr = x.getBoundingClientRect();
    return {
      glyph: x.textContent.trim(),
      label: x.getAttribute('aria-label'),
      fromRight: Math.round(rr.right - xr.right),
      size: [Math.round(xr.width), Math.round(xr.height)],
      // Its share of the row it sits in — a corner, not a column.
      share: +(xr.width / rr.width).toFixed(3),
    };
  });
  check('The delete control is an X', geom.glyph === '×', JSON.stringify(geom.glyph));
  check('In the corner of the row', geom.fromRight <= 10, `${geom.fromRight}px from the right edge`);
  check('Big enough to hit', geom.size[0] >= 24 && geom.size[1] >= 24, JSON.stringify(geom.size));
  check('And small enough not to be a second column',
    geom.share < 0.1, `${(geom.share * 100).toFixed(1)}% of the row's width`);
  check('It says what it is to a screen reader', /delete/i.test(geom.label ?? ''), JSON.stringify(geom.label));

  const before = await records(page);
  // Every check below has to depend on this click having landed. A build with
  // no X to press changes nothing, opens nothing, and deletes nothing — and
  // "nothing was deleted" and "one dialog is on screen" are both true of that,
  // which is how four of these first passed against a build that has no X.
  const pressedX = await tryClick(page, '.modal:not(.hidden) .save-row[data-row="1002"] .row-x');
  check('There is an X to press', pressedX, 'no row carries one');
  const asked = await page.evaluate(() => {
    const m = document.querySelector('.modal:not(.hidden)');
    return { title: m?.querySelector('h2')?.textContent ?? '', body: m?.querySelector('.modal-body')?.textContent ?? '' };
  });
  const isConfirm = pressedX && /delete record/i.test(asked.title);
  check('The X asks before it deletes', isConfirm, JSON.stringify(asked.title));
  check('And names the administration it is about to lose',
    isConfirm && /Rustbelt/.test(asked.body), asked.body.slice(0, 80));
  const during = await records(page);
  check('Nothing is deleted while the question is open',
    isConfirm && during.length === before.length, `${before.length} → ${during.length}`);

  // Answering no puts the list back, intact.
  const declined = await tryClick(page, '.modal:not(.hidden) .choice-btn:has-text("Keep it")');
  const kept = await records(page);
  const backOnList = await page.evaluate(() =>
    document.querySelectorAll('.modal:not(.hidden) .save-row').length);
  check('Declining keeps the record and returns to the list',
    declined && kept.length === 3 && backOnList === 3,
    `declined: ${declined}, ${kept.length} records, ${backOnList} rows`);

  // Answering yes takes exactly that one.
  await tryClick(page, '.modal:not(.hidden) .save-row[data-row="1002"] .row-x');
  await tryClick(page, '.modal:not(.hidden) .choice-btn:has-text("Delete")');
  const after = await records(page);
  check('Confirming deletes that record and no other',
    after.length === 2 && !after.includes(1002) && after.includes(1001) && after.includes(1003),
    JSON.stringify(after));
  const rowsLeft = await page.evaluate(() =>
    [...document.querySelectorAll('.modal:not(.hidden) .save-row')].map((r) => r.dataset.row));
  check('And the list redraws without it', JSON.stringify(rowsLeft) === '["1001","1003"]', JSON.stringify(rowsLeft));
  await ctx.close();
}

// ============ C. THE X AND THE ROW DO NOT FIGHT
{
  const { ctx, page } = await fresh();
  await openArchive(page);
  // The X sits inside the row, and the row opens what the X is about to delete.
  // Without a stopPropagation the click would do both — the confirmation would
  // appear over a decision log that had just opened underneath it.
  const hitX = await tryClick(page, '.modal:not(.hidden) .save-row[data-row="1001"] .row-x');
  const state = await page.evaluate(() => {
    const m = document.querySelector('.modal:not(.hidden)');
    return {
      title: m?.querySelector('h2')?.textContent ?? '',
      histRows: m ? m.querySelectorAll('.hist-row').length : -1,
      modals: document.querySelectorAll('.modal:not(.hidden)').length,
    };
  });
  check('Pressing the X does not also open the decisions underneath it',
    hitX && /delete record/i.test(state.title) && state.histRows === 0,
    `${JSON.stringify(state.title)}, ${state.histRows} decision rows behind it`);
  check('And there is one dialog on screen, not two',
    hitX && state.modals === 1, `pressed: ${hitX}, ${state.modals} dialogs`);
  await ctx.close();
}

// ============ D. THE SAME SHAPE AS THE LOAD MENU
{
  const { ctx, page } = await fresh();
  // Give the Load menu something to list, so both panels can be compared.
  await page.evaluate(() => {
    const api = window.__api, g = window.__game;
    g.resources.capital = 9e5;
    for (let i = 0; i < 14; i++) {
      g.gameOver = null;
      g.failCounters = { blackout: 0, approval: 0, environment: 0, inactive: 0 };
      api.simTick(g);
    }
    g.gameOver = null; g.pendingEvent = null; g.pendingReport = null; g.speed = 0;
    api.saveTo('top:autosave', g);
    api.saveTo('top:save', g);
  });
  await page.waitForTimeout(200);
  await clearAll(page);

  const shapeOf = async (open) => {
    await open();
    await page.waitForTimeout(320);
    return page.evaluate(() => {
      const rows = [...document.querySelectorAll('.modal:not(.hidden) .save-row')];
      return {
        n: rows.length,
        role: rows.every((r) => r.getAttribute('role') === 'button'),
        tab: rows.every((r) => r.getAttribute('tabindex') === '0'),
        keyed: rows.every((r) => !!r.dataset.row),
        x: rows.every((r) => !!r.querySelector('.row-x')),
        extraButtons: rows.flatMap((r) => [...r.querySelectorAll('button')]
          .filter((b) => !b.classList.contains('row-x'))).length,
        cursor: rows.length ? getComputedStyle(rows[0]).cursor : '',
      };
    });
  };
  const arch = await shapeOf(() => page.evaluate(() => window.__ui.showArchive(false)));
  await clearAll(page);
  const load = await shapeOf(() => page.evaluate(() => window.__ui.showLoadMenu(false)));
  check('Both panels have rows to compare', arch.n === 3 && load.n === 2, `${arch.n} and ${load.n}`);
  check('Both build the same row: pressable, keyed, keyboard-reachable, no inner buttons',
    arch.role && load.role && arch.tab && load.tab && arch.keyed && load.keyed &&
    arch.extraButtons === 0 && load.extraButtons === 0,
    JSON.stringify({ arch, load }));
  check('Both carry the corner X', arch.x && load.x, `${arch.x} / ${load.x}`);
  check('Both look pressable', arch.cursor === 'pointer' && load.cursor === 'pointer',
    `${arch.cursor} / ${load.cursor}`);
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
