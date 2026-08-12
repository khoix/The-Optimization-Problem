// M46 — the saves you actually made.
//   A. Continue opens the newest save of any kind, not the autosave
//   B. three manual slots, filled in turn, never overwritten in place
//   C. the Load menu is built from the list, and the row is the button
//   D. hiding the tab writes the autosave
//   E. an ended administration still releases every slot it was holding
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
const SEED = 8080;
/** A running region, seeded, with the clock stopped and no saves on disk. */
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
  await page.evaluate((seed) => {
    const api = window.__api, g = window.__game;
    const ng = api.newGame(seed, 'verdant');
    for (const k of Object.keys(g)) delete g[k];
    Object.assign(g, ng);
    api.invalidateNetwork(g);
    window.__renderer.resetSession();
    g.speed = 0;
  }, SEED);
  await page.waitForTimeout(300);
  await clearAll(page);
  return { ctx, page };
};
/**
 * Run the region forward, so each save is a visibly different year.
 *
 * `gameOver` is cleared after the last tick as well as before each one. Left
 * set, `serialize` flags the envelope `ended` — and the first version of this
 * file then found the title screen offering *"Review Final State"* where it
 * expected *"Continue"*, with a termination modal over the button it was trying
 * to press. The region under test is a fixture, not a run; it does not end.
 */
const advance = async (page, months) => {
  const tick = await page.evaluate((n) => {
    const g = window.__game, api = window.__api;
    g.resources.capital = 9e5;
    for (let i = 0; i < n; i++) {
      g.gameOver = null;
      g.failCounters = { blackout: 0, approval: 0, environment: 0, inactive: 0 };
      api.simTick(g);
    }
    g.gameOver = null;
    g.failCounters = { blackout: 0, approval: 0, environment: 0, inactive: 0 };
    g.pendingEvent = null; g.pendingReport = null;
    g.speed = 0;
    document.body.classList.remove('ended');
    return g.tick;
  }, months);
  await page.waitForTimeout(120);
  await clearAll(page);
  return tick;
};
/**
 * Every save on disk, newest first — read out of localStorage rather than
 * through `__api.savedGames`.
 *
 * Deliberately independent of the build's own API surface. The first version
 * called the new helper, so running this file against the previous build threw
 * `savedGames is not a function` and took the whole counterfactual with it —
 * which proves nothing about the previous build's behaviour, only that it does
 * not export a function written after it.
 */
const AUTO = 'top:autosave';
const MANUAL = ['top:save', 'top:save2', 'top:save3'];
const ALL = [AUTO, ...MANUAL];
const slots = (page) => page.evaluate((known) => {
  const out = [];
  for (const slot of known) {
    const raw = localStorage.getItem(slot);
    if (!raw) continue;
    try {
      const env = JSON.parse(raw);
      out.push({ slot, manual: slot !== 'top:autosave', tick: env.tick, savedAt: env.savedAt, ended: !!env.ended });
    } catch { /* unreadable is not present */ }
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}, ALL);
const newest = async (page) => (await slots(page))[0] ?? null;
/** Use the menu the way a player does: open it and click "Save Game". */
const saveViaMenu = async (page) => {
  await page.evaluate(() => window.__ui.togglePanel('menu'));
  await page.waitForTimeout(220);
  const btn = page.locator('.menu-item', { hasText: 'Save Game' }).first();
  await btn.click();
  await page.waitForTimeout(260);
};

// ============ A. CONTINUE OPENS THE NEWEST SAVE, NOT THE AUTOSAVE
{
  const { ctx, page } = await fresh();
  // The autosave first, then a manual save a long way later — which is the
  // ordinary shape of it: the autosave writes once a game year, so the save
  // you made by hand is almost always the newer of the two.
  await advance(page, 6);
  await page.evaluate(() => window.__api.saveTo('top:autosave', window.__game));
  await advance(page, 48);
  await saveViaMenu(page);
  const after = await slots(page);
  check('The probe wrote an autosave and then a much later manual save',
    after.length === 2 && after.some((s) => !s.manual) && after.some((s) => s.manual),
    JSON.stringify(after.map((s) => `${s.slot}@${s.tick}`)));
  const top = await newest(page);
  check('The manual save is the newer of the two', top.manual && top.tick > 6,
    `newest is ${top.slot} at tick ${top.tick}`);

  // The title screen's Continue button, clicked.
  await page.evaluate(() => window.__ui.showTitle());
  await page.waitForTimeout(300);
  const label = await page.locator('#t-continue').textContent();
  const year = Math.floor(top.tick / 12) + 1;
  check('Continue offers the year of that save, not the autosave\'s',
    label.includes(`Year ${year}`), `"${label.trim()}" for tick ${top.tick}`);
  await page.locator('#t-continue').click();
  await page.waitForTimeout(900);
  await clearAll(page);
  const opened = await page.evaluate(() => window.__game.tick);
  check('And clicking it opens that region', opened === top.tick,
    `opened tick ${opened}, expected ${top.tick}`);

  // The other way round: an autosave written after the manual save wins.
  await advance(page, 24);
  await page.evaluate(() => window.__api.saveTo('top:autosave', window.__game));
  const newer = await newest(page);
  check('An autosave made later than the manual save is what Continue picks',
    !newer.manual && newer.tick > top.tick,
    `${newer.slot} at tick ${newer.tick} over ${top.slot} at ${top.tick}`);
  await ctx.close();
}

// ============ B. THREE MANUAL SLOTS, FILLED IN TURN
{
  const { ctx, page } = await fresh();
  const ticks = [];
  for (let i = 0; i < 3; i++) {
    ticks.push(await advance(page, 12));
    await saveViaMenu(page);
  }
  const three = await slots(page);
  const manual = three.filter((s) => s.manual);
  check('Three saves in a row occupy three different slots',
    manual.length === 3 && new Set(manual.map((s) => s.slot)).size === 3,
    JSON.stringify(manual.map((s) => `${s.slot}@${s.tick}`)));
  check('And all three regions are still there, at the years they were saved at',
    ticks.every((t) => manual.some((s) => s.tick === t)),
    `saved at ${ticks.join(', ')}, on disk ${manual.map((s) => s.tick).sort((a, b) => a - b).join(', ')}`);
  // Strictly descending over all three. `first >= last` is true of a list with
  // one thing in it, which is what the previous build produces here.
  check('Newest first',
    manual.length === 3 && manual.every((s, i) => i === 0 || manual[i - 1].savedAt > s.savedAt),
    manual.map((s) => `${s.slot}@${s.savedAt}`).join(' '));

  // The fourth asks rather than choosing for you.
  await advance(page, 12);
  await saveViaMenu(page);
  const asked = await page.evaluate(() => {
    const m = document.querySelector('.modal:not(.hidden)');
    return {
      open: !!m,
      title: m?.querySelector('h2')?.textContent ?? '',
      rows: m ? m.querySelectorAll('.save-row').length : 0,
    };
  });
  check('A fourth save asks which of the three to replace',
    asked.open && /replace/i.test(asked.title) && asked.rows === 3,
    `${JSON.stringify(asked.title)}, ${asked.rows} rows`);
  const stillThree = (await slots(page)).filter((s) => s.manual);
  check('And writes nothing until it is answered',
    stillThree.length === 3 && ticks.every((t) => stillThree.some((s) => s.tick === t)),
    JSON.stringify(stillThree.map((s) => s.tick)));

  // Answer it: press the oldest row, then confirm.
  const oldest = [...stillThree].sort((a, b) => a.savedAt - b.savedAt)[0];
  // Guarded: a build with no replace dialog should fail these checks, not hang
  // on a locator that will never resolve and take the whole run with it.
  const row = page.locator(`.modal:not(.hidden) .save-row[data-row="${oldest.slot}"]`);
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(240);
    const yes = page.locator('.modal:not(.hidden) .choice-btn', { hasText: 'Replace it' });
    if (await yes.count()) { await yes.click(); await page.waitForTimeout(300); }
  }
  const replaced = (await slots(page)).filter((s) => s.manual);
  const now = await page.evaluate(() => window.__game.tick);
  check('Replacing writes over the slot that was chosen and no other',
    replaced.length === 3 && replaced.find((s) => s.slot === oldest.slot)?.tick === now &&
    replaced.filter((s) => s.slot !== oldest.slot).every((s) => ticks.includes(s.tick)),
    JSON.stringify(replaced.map((s) => `${s.slot}@${s.tick}`)));
  await ctx.close();
}

// ============ C. THE LOAD MENU IS THE LIST, AND THE ROW IS THE BUTTON
{
  const { ctx, page } = await fresh();
  await advance(page, 12); await saveViaMenu(page);
  await advance(page, 12); await saveViaMenu(page);
  const midTick = await page.evaluate(() => window.__game.tick);
  await page.evaluate(() => window.__api.saveTo('top:autosave', window.__game));
  await advance(page, 12); await saveViaMenu(page);

  await page.evaluate(() => window.__ui.showLoadMenu(false));
  await page.waitForTimeout(300);
  const menu = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.modal:not(.hidden) .save-row')];
    return {
      count: rows.length,
      slots: rows.map((r) => r.dataset.row),
      loadButtons: document.querySelectorAll('.modal:not(.hidden) .save-load').length,
      deleteButtons: [...document.querySelectorAll('.modal:not(.hidden) .small-btn')]
        .filter((b) => /delete/i.test(b.textContent)).length,
      xs: document.querySelectorAll('.modal:not(.hidden) .save-row .row-x').length,
      roles: rows.map((r) => r.getAttribute('role')),
      tabbable: rows.every((r) => r.getAttribute('tabindex') === '0'),
    };
  });
  check('Every slot on disk is listed', menu.count === 4, `${menu.count} rows: ${menu.slots.join(', ')}`);
  check('The rows are the buttons — no Load button on any of them',
    menu.loadButtons === 0 && menu.roles.every((r) => r === 'button') && menu.tabbable,
    `${menu.loadButtons} load buttons, roles ${menu.roles.join(',')}`);
  check('And deleting is a corner X, not a button beside the one you wanted',
    menu.deleteButtons === 0 && menu.xs === 4, `${menu.deleteButtons} Delete buttons, ${menu.xs} X controls`);
  const order = await page.evaluate(() => [...document.querySelectorAll('.modal:not(.hidden) .save-row')]
    .map((r) => window.__api.peek(r.dataset.row).savedAt));
  check('Newest first', order.length === 4 && order.every((v, i) => i === 0 || order[i - 1] > v),
    order.join(' '));

  // The X deletes that row and nothing else.
  const before = (await slots(page)).length;
  const victim = menu.slots[1];
  const x = page.locator(`.modal:not(.hidden) .save-row[data-row="${victim}"] .row-x`);
  let confirmOpen = '(no X to press)';
  if (await x.count()) {
    await x.click();
    await page.waitForTimeout(220);
    confirmOpen = await page.locator('.modal:not(.hidden) h2').textContent();
  }
  check('The X asks before it deletes', /delete save/i.test(confirmOpen), confirmOpen);
  const del = page.locator('.modal:not(.hidden) .choice-btn', { hasText: 'Delete' }).first();
  if (await del.count()) { await del.click(); await page.waitForTimeout(300); }
  const left = await slots(page);
  check('And takes exactly the row it was on',
    left.length === before - 1 && !left.some((s) => s.slot === victim),
    `${before} → ${left.length}, ${victim} gone: ${!left.some((s) => s.slot === victim)}`);

  // Pressing the row loads it.
  await page.evaluate(() => window.__ui.showLoadMenu(false));
  await page.waitForTimeout(300);
  const target = await page.evaluate((t) => {
    const rows = [...document.querySelectorAll('.modal:not(.hidden) .save-row')];
    const r = rows.find((x) => window.__api.peek(x.dataset.row).tick === t);
    return r ? r.dataset.row : null;
  }, midTick);
  check('The probe found the row it means to press', !!target, `${target} for tick ${midTick}`);
  if (target) {
    // The row's own text, not a control on it: pressing anywhere must load.
    await page.locator(`.modal:not(.hidden) .save-row[data-row="${target}"] .save-what`).click({ force: true });
    await page.waitForTimeout(900);
    await clearAll(page);
    const opened = await page.evaluate(() => window.__game.tick);
    check('Pressing the row — not a button on it — loads that save',
      opened === midTick, `opened tick ${opened}, expected ${midTick}`);
  }
  await ctx.close();
}

// ============ D. HIDING THE TAB WRITES THE AUTOSAVE
{
  const { ctx, page } = await fresh();
  await advance(page, 30);
  const before = await page.evaluate(() => window.__api.peek(window.__api.AUTO_SLOT));
  check('There is no autosave yet — the year is not up', before === null, `${before && 'present'}`);
  const tick = await page.evaluate(() => window.__game.tick);
  // What a phone's app switcher does, and what closing a laptop does.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => window.__api.peek(window.__api.AUTO_SLOT));
  check('Hiding the tab writes the autosave',
    after !== null && after.tick === tick, `${after ? `tick ${after.tick}` : 'nothing'}, expected ${tick}`);
  // "No manual slot was written" is also true of a build that wrote nothing at
  // all, which is the previous one. The autosave has to be there as well.
  const written = await slots(page);
  check('And writes it to the autosave, not to one of the player\'s slots',
    written.length === 1 && !written[0].manual,
    written.map((s) => s.slot).join(', ') || 'nothing on disk');
  await ctx.close();
}

// ============ E. AN ENDED ADMINISTRATION RELEASES EVERY SLOT
{
  const { ctx, page } = await fresh();
  await advance(page, 12); await saveViaMenu(page);
  await advance(page, 12); await saveViaMenu(page);
  await advance(page, 12); await saveViaMenu(page);
  await page.evaluate(() => window.__api.saveTo('top:autosave', window.__game));
  const full = await slots(page);
  check('The probe filled all four slots with one administration', full.length === 4, `${full.length}`);
  const ended = await page.evaluate(async () => {
    const g = window.__game;
    g.gameOver = 'The probe ended this administration.';
    await new Promise((r) => setTimeout(r, 400));
    // Leaving for the menu is what frees them, the same as it always was.
    window.__ui.onSession({ kind: 'menu' });
    await new Promise((r) => setTimeout(r, 700));
    return ['top:autosave', 'top:save', 'top:save2', 'top:save3']
      .filter((s) => localStorage.getItem(s)).length;
  });
  check('Leaving an ended administration frees every slot it was holding, not just two',
    ended === 0, `${ended} slots still occupied`);

  // A save belonging to a different region is nobody else's business.
  const kept = await page.evaluate(async () => {
    const api = window.__api;
    // Somebody else's bookmark, from a region this session knows nothing about.
    const other = api.newGame(999, 'verdant');
    other.runId = 12345;
    api.saveTo('top:save3', other);
    // A real administration, started through the session path. The first
    // version of this assigned a new region straight onto `window.__game`
    // while the game sat at the menu — where `atMenu` is true and nothing that
    // happens is an administration, so no slot was ever released and the probe
    // reported the wrong thing failing.
    window.__ui.onSession({ kind: 'new', scenario: 'verdant' });
    await new Promise((r) => setTimeout(r, 800));
    const g = window.__game;
    g.speed = 0;
    api.saveTo('top:save', g);
    const mine = api.peek('top:save').state.runId === g.runId;
    const theirs = api.peek('top:save3').state.runId;
    g.gameOver = 'ended again';
    await new Promise((r) => setTimeout(r, 400));
    window.__ui.onSession({ kind: 'menu' });
    await new Promise((r) => setTimeout(r, 800));
    return {
      mine, theirs, own: g.runId,
      slots: ['top:autosave', 'top:save', 'top:save2', 'top:save3'].filter((x) => localStorage.getItem(x)),
    };
  });
  check('The probe set up one save owned by this run and one owned by another',
    kept.mine && kept.theirs === 12345 && kept.own !== 12345,
    `this run ${kept.own}, the other ${kept.theirs}`);
  check('Ending it frees its own save and leaves the other region\'s alone',
    kept.slots.length === 1 && kept.slots[0].endsWith('save3'), JSON.stringify(kept.slots));
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
