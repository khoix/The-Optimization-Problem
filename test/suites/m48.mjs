// M48 — one icon set.
//   A. no character stands in for an icon anywhere in the console
//   B. every icon slot holds one, and it is drawn, not written
//   C. the belt and the indicators use the same mark for the same thing
//   D. they take their size from the slot and their colour from CSS
//   E. the whole set is drawn and reachable
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
/** A region far enough along that every panel has something in it. */
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
    const api = window.__api, g = window.__game, r = window.__renderer;
    const ng = api.newGame(seed, 'verdant');
    for (const k of Object.keys(g)) delete g[k];
    Object.assign(g, ng);
    api.invalidateNetwork(g);
    r.resetSession();
    g.resources.capital = 9e5;
    const cx = Math.floor(g.mapW * 0.52), cy = Math.floor(g.mapH * 0.5);
    api.placeBuilding(g, 'coal_plant', cx + 8, cy - 6, { free: true, instant: true });
    api.placeBuilding(g, 'water_plant', cx + 8, cy + 4, { free: true, instant: true });
    api.placeBuilding(g, 'edge_dc', cx - 6, cy + 5, { free: true, instant: true });
    for (let i = 0; i < 30; i++) {
      g.gameOver = null;
      g.failCounters = { blackout: 0, approval: 0, environment: 0, inactive: 0 };
      api.simTick(g);
    }
    g.gameOver = null; g.pendingEvent = null; g.pendingReport = null; g.speed = 0;
    document.body.classList.remove('ended');
  }, SEED);
  await page.waitForTimeout(350);
  await clearAll(page);
  return { ctx, page };
};

/**
 * Emoji and the symbol characters that were standing in for icons.
 *
 * Not "any non-ASCII": the console is full of legitimate typography — § for
 * currency, · as a separator, − for a negative, ▮▶ for the transport, ▲▼ on a
 * change chip, × on a close control. Those are text doing a text job. This is
 * the list of characters that were doing an *icon's* job.
 */
const STAND_INS = [...'🛣🏘⚡💧🌳🏭📊🗳🔔🗒💾📂❓🏠👤👥✊⛏▣✚◈⚙✦☰⚠☺★◎✕'];

// ============ A. NO CHARACTER IS DOING AN ICON'S JOB
{
  const { ctx, page } = await fresh();
  // Every panel opened in turn, so the sweep sees the markup they build
  // lazily rather than only what the bar shows at rest.
  const panels = ['transit', 'zoning', 'power', 'water', 'compute', 'services',
    'environment', 'economy', 'indicators', 'layers', 'compute_alloc', 'policies',
    'politics', 'alerts', 'menu'];
  const found = await page.evaluate(async ([ids, marks]) => {
    const hits = [];
    const sweep = (where) => {
      const walk = document.createTreeWalker(document.getElementById('app'), NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        for (const ch of marks) {
          if (n.nodeValue.includes(ch)) {
            hits.push(`${where}: ${ch} in ${JSON.stringify(n.nodeValue.trim().slice(0, 30))}`);
          }
        }
      }
    };
    sweep('bar at rest');
    for (const id of ids) {
      window.__ui.togglePanel(id);
      await new Promise((r) => setTimeout(r, 90));
      sweep(id);
      window.__ui.closePanel();
      await new Promise((r) => setTimeout(r, 40));
    }
    // And with a tool in hand, which is when the action button changes.
    window.__ui.tool = { kind: 'build', type: 'house' };
    window.__ui.syncToolButtons?.();
    await new Promise((r) => setTimeout(r, 120));
    sweep('tool armed');
    window.__ui.tool = { kind: 'none' };
    return [...new Set(hits)];
  }, [panels, STAND_INS]);
  check('No emoji and no stand-in glyph is left anywhere in the console',
    found.length === 0, found.slice(0, 6).join(' | '));

  // The premise: the sweep really did visit the surfaces in question.
  const visited = await page.evaluate(async () => {
    window.__ui.togglePanel('zoning');
    await new Promise((r) => setTimeout(r, 200));
    const n = document.querySelectorAll('.flyout:not(.hidden) .build-card').length;
    window.__ui.closePanel();
    return n;
  });
  check('And the sweep was looking at populated panels, not empty ones',
    visited > 3, `${visited} build cards in one of them`);
  await ctx.close();
}

// ============ B. EVERY ICON SLOT HOLDS A DRAWN ICON
{
  const { ctx, page } = await fresh();
  const slots = await page.evaluate(() => {
    const count = (sel) => {
      const els = [...document.querySelectorAll(sel)];
      return { n: els.length, drawn: els.filter((e) => e.querySelector('svg.ico')).length };
    };
    return {
      belt: count('.bar-tool .tool-ico'),
      sys: count('.sys-btn .sys-ico, .alert-btn .sys-ico, .override-btn .sys-ico'),
      vitals: count('.vital-ico'),
    };
  });
  check('Every mark on the tool belt is a drawn icon',
    slots.belt.n >= 13 && slots.belt.drawn === slots.belt.n,
    `${slots.belt.drawn} of ${slots.belt.n}`);
  check('And every system button',
    slots.sys.n >= 3 && slots.sys.drawn === slots.sys.n, `${slots.sys.drawn} of ${slots.sys.n}`);
  // Capital keeps its §: it is the currency mark, and it appears inline in
  // every price in the game. An icon there would break that association.
  check('And every indicator except capital, which keeps the currency mark',
    slots.vitals.n >= 10 && slots.vitals.drawn === slots.vitals.n - 1,
    `${slots.vitals.drawn} drawn of ${slots.vitals.n} rows`);
  const capital = await page.evaluate(() =>
    document.querySelector('.bar-vitals [data-key="capital"] .vital-ico')?.textContent?.trim());
  check('Capital is the one that is still a §', capital === '§', JSON.stringify(capital));

  const menu = await page.evaluate(async () => {
    window.__ui.togglePanel('menu');
    await new Promise((r) => setTimeout(r, 250));
    const items = [...document.querySelectorAll('.flyout:not(.hidden) .menu-item')];
    const out = { n: items.length, drawn: items.filter((e) => e.querySelector('svg.ico')).length };
    window.__ui.closePanel();
    return out;
  });
  check('Every menu item too', menu.n >= 6 && menu.drawn === menu.n, `${menu.drawn} of ${menu.n}`);
  await ctx.close();
}

// ============ C. THE BELT AND THE INDICATORS AGREE
{
  const { ctx, page } = await fresh();
  const same = await page.evaluate(() => {
    const beltOf = (panel) =>
      document.querySelector(`.bar-tool[data-panel="${panel}"] .tool-ico svg`)?.innerHTML ?? null;
    const vitalOf = (key) =>
      document.querySelector(`.bar-vitals [data-key="${key}"] .vital-ico svg`)?.innerHTML ?? null;
    const pairs = [['power', 'power'], ['water', 'water'], ['compute', 'compute']];
    return pairs.map(([panel, key]) => ({
      what: panel, belt: beltOf(panel), vital: vitalOf(key),
    }));
  });
  for (const p of same) {
    check(`The belt and the indicators draw ${p.what} the same way`,
      !!p.belt && p.belt === p.vital,
      // Both null is not "identical" — it is a build with no icons in it, and
      // the first version of this reported that case as a match.
      !p.belt ? 'neither slot holds a drawn icon'
        : p.belt === p.vital ? 'identical'
          : `belt ${String(p.belt).slice(0, 24)} vs vital ${String(p.vital).slice(0, 24)}`);
  }
  // Housing has no belt button of its own — the category is "Housing" under
  // zoning — so it is checked against the build card that uses the same mark.
  const housing = await page.evaluate(async () => {
    const vital = document.querySelector('.bar-vitals [data-key="housing"] .vital-ico svg')?.innerHTML ?? null;
    window.__ui.togglePanel('zoning');
    await new Promise((r) => setTimeout(r, 250));
    const card = document.querySelector('.flyout:not(.hidden) .card-stats svg.ico')?.innerHTML ?? null;
    const belt = document.querySelector('.bar-tool[data-panel="zoning"] .tool-ico svg')?.innerHTML ?? null;
    window.__ui.closePanel();
    return { vital, card, belt };
  });
  check('A house is the same house on the belt, on a build card and in the indicators',
    !!housing.vital && housing.vital === housing.card && housing.card === housing.belt,
    `belt/card/vital match: ${housing.belt === housing.card}/${housing.card === housing.vital}`);
  await ctx.close();
}

// ============ D. SIZE FROM THE SLOT, COLOUR FROM CSS
{
  const { ctx, page } = await fresh();
  const sizes = await page.evaluate(() => {
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    return {
      belt: box('.bar-tool .tool-ico svg.ico'),
      vital: box('.bar-vitals [data-key="power"] .vital-ico svg.ico'),
      sys: box('.alert-btn .sys-ico svg.ico'),
    };
  });
  check('An icon on the belt is bigger than the same icon in the indicators',
    sizes.belt && sizes.vital && sizes.belt.w > sizes.vital.w,
    `belt ${sizes.belt?.w}px, indicators ${sizes.vital?.w}px, system ${sizes.sys?.w}px`);
  check('And square, at every one of them',
    [sizes.belt, sizes.vital, sizes.sys].every((b) => b && Math.abs(b.w - b.h) < 0.6),
    JSON.stringify(sizes));

  // Colour. The set has its own palette rather than taking the slot's text
  // colour, which is the whole of this revision — so the checks are about
  // there being real, varied, deliberate colour, and about the states that
  // used to recolour an icon still reaching it now that it cannot be tinted.
  const palette = await page.evaluate(() => {
    const fills = [];
    for (const svg of document.querySelectorAll('.civic-bar svg.ico')) {
      for (const shape of svg.children) {
        const f = shape.getAttribute('fill');
        if (f && f !== 'none' && f !== 'currentColor') fills.push(f.toLowerCase());
      }
    }
    const hex = (c) => {
      const m = /^#([0-9a-f]{6})$/.exec(c);
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };
    // Saturation, so "colourful" is not satisfied by fourteen shades of grey.
    const sat = (rgb) => {
      const mx = Math.max(...rgb), mn = Math.min(...rgb);
      return mx === 0 ? 0 : (mx - mn) / mx;
    };
    const rgbs = fills.map(hex).filter(Boolean);
    return {
      shapes: fills.length,
      distinct: new Set(fills).size,
      saturated: rgbs.filter((c) => sat(c) > 0.35).length,
      hues: new Set(rgbs.filter((c) => sat(c) > 0.35).map((c) => {
        const [r, g, b] = c;
        const mx = Math.max(r, g, b);
        return mx === r ? (g >= b ? 'warm' : 'magenta') : mx === g ? 'green' : 'blue';
      })).size,
    };
  });
  check('The icons are painted, not tinted — every shape names its own colour',
    palette.shapes >= 30, `${palette.shapes} coloured shapes on the bar`);
  check('And it is a palette, not one colour repeated',
    palette.distinct >= 8, `${palette.distinct} distinct colours`);
  check('Most of it is actual colour rather than shades of grey',
    palette.saturated >= 12, `${palette.saturated} saturated shapes of ${palette.shapes}`);
  check('Across warm, green and blue families',
    palette.hues >= 3, `${palette.hues} hue families`);

  // The one state that used to recolour an icon through `color`. It cannot any
  // more — the icon has colours of its own — so it has to be lifted instead,
  // and this is the check that it still visibly changes.
  const lit = await page.evaluate(async () => {
    const btn = document.querySelector('.bar-tool[data-panel="layers"]');
    const svg = btn?.querySelector('svg.ico');
    if (!svg) return { before: null, after: null };
    const before = getComputedStyle(svg).filter;
    btn.classList.add('layer-on');
    await new Promise((r) => setTimeout(r, 60));
    const after = getComputedStyle(svg).filter;
    btn.classList.remove('layer-on');
    return { before, after };
  });
  check('An active layer still visibly changes its icon',
    !!lit.after && lit.before !== lit.after && /drop-shadow|brightness/.test(lit.after),
    `${lit.before} → ${lit.after}`);

  // And the system's own aesthetic once it is running things.
  const observed = await page.evaluate(async () => {
    const svg = document.querySelector('.bar-tool[data-panel="power"] svg.ico');
    if (!svg) return { before: null, after: null };
    const before = getComputedStyle(svg).filter;
    document.body.classList.add('observer');
    await new Promise((r) => setTimeout(r, 60));
    const after = getComputedStyle(svg).filter;
    document.body.classList.remove('observer');
    return { before, after };
  });
  check('Observer mode drains the colour out of them, as it does the rest of the console',
    !!observed.after && /saturate/.test(observed.after) && observed.after !== observed.before,
    `${observed.before} → ${observed.after}`);
  await ctx.close();
}

// ============ E. THE WHOLE SET IS DRAWN
{
  const { ctx, page } = await fresh();
  const set = await page.evaluate(() => {
    // The bundle exports these on the debug handle only if the module was
    // reached; read them off a rendered icon instead, which is build-agnostic.
    const svgs = [...document.querySelectorAll('svg.ico')];
    return {
      total: svgs.length,
      viewBoxes: new Set(svgs.map((s) => s.getAttribute('viewBox'))).size,
      hidden: svgs.every((s) => s.getAttribute('aria-hidden') === 'true'),
      empty: svgs.filter((s) => s.innerHTML.trim() === '').length,
      distinct: new Set(svgs.map((s) => s.innerHTML)).size,
    };
  });
  check('The console is full of them', set.total >= 20, `${set.total} on screen at rest`);
  check('All on one grid', set.viewBoxes === 1, `${set.viewBoxes} distinct viewBoxes`);
  // `0 empty of 0` is true of a build with no icons at all, as is `every()` over
  // an empty list. Both are conditioned on there being icons to talk about.
  check('None of them is an empty box',
    set.total > 0 && set.empty === 0, `${set.empty} empty of ${set.total}`);
  check('And they are distinct marks, not the same one repeated',
    set.distinct >= 12, `${set.distinct} distinct drawings`);
  check('Every one is hidden from a screen reader, which reads the label beside it',
    set.total > 0 && set.hidden, `aria-hidden on all ${set.total}`);
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
