// M61 — the console, in one language.
//
//   A. the bar carries the same hairline that runs under the title
//   B. a drawer is the console's material, with the console's header
//   C. the hamburger's items are the title screen's rows
//   D. toasts and the feed are the same material, edge-coded by kind
//   E. every surface in the game is cut from one panel
//   F. and the system can still take it apart later
//
// The last one is the check with the most to lose. The whole late-game arc is
// the console being quietly restyled by something that is not the player —
// phase 4 cools it, observer mode drains the colour out of it — and a
// milestone that unifies every surface could easily unify them into something
// those overrides no longer reach.
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const fresh = async (w = 1340, h = 860) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('top:boot', 'new:verdant'); });
  await page.reload();
  await page.waitForTimeout(1300);
  await pastBoot(page);
  for (let i = 0; i < 8; i++) {
    const b = page.locator('.modal:not(.hidden) .choice-btn').first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(120); }
    else break;
  }
  await page.evaluate(() => { window.__game.speed = 0; });
  return { ctx, page };
};

const ASI = 'rgb(122, 233, 255)';

// ================== A. THE BAR
{
  const { ctx, page } = await fresh();
  const bar = await page.evaluate(() => {
    const el = document.querySelector('.civic-bar');
    if (!el) return null;
    const before = getComputedStyle(el, '::before');
    return {
      drawn: before.content !== 'none',
      image: before.backgroundImage,
      opacity: Number(before.opacity),
      height: before.height,
      // The rule under the title, for comparison: it is the same mark.
      titleRule: (() => {
        const t = document.createElement('p');
        t.className = 'title-rule';
        document.body.append(t);
        const bg = getComputedStyle(t).backgroundImage;
        t.remove();
        return bg;
      })(),
    };
  });
  check('The bar carries a hairline along its top edge',
    !!bar && bar.drawn && bar.height === '1px' && bar.image.includes(ASI),
    bar ? `${bar.height}, ${bar.image.slice(0, 62)}…` : 'no bar');
  // Same colour as the rule under the title, or it is decoration rather than
  // the same instrument saying so twice.
  check('And it is the system\'s own colour, as under the title',
    !!bar && bar.titleRule.includes(ASI) && bar.image.includes(ASI) && bar.opacity > 0.2,
    bar ? `bar ${bar.opacity}, title rule ${bar.titleRule.includes(ASI) ? 'same colour' : bar.titleRule}` : 'no bar');
  await ctx.close();
}

// ================== B. A DRAWER
{
  const { ctx, page } = await fresh();
  await page.locator('.bar-tool[data-panel="indicators"]').first().click();
  await page.waitForTimeout(400);
  const drawer = await page.evaluate(() => {
    const fly = document.querySelector('.flyout:not(.hidden)');
    if (!fly) return null;
    const head = fly.querySelector('.flyout-head');
    const title = fly.querySelector('.flyout-title');
    const ts = title ? getComputedStyle(title) : null;
    return {
      panel: fly.classList.contains('console-panel'),
      bg: getComputedStyle(fly).backgroundImage,
      title: title?.textContent ?? '',
      upper: ts?.textTransform ?? null,
      spacing: ts ? parseFloat(ts.letterSpacing) : null,
      size: ts ? parseFloat(ts.fontSize) : null,
      rule: head ? getComputedStyle(head, '::after').backgroundImage : null,
      // A drawer says which button it came out of with a tab, not a bracket.
      connector: getComputedStyle(fly, '::after').content !== 'none',
      brackets: fly.classList.contains('bracketed'),
    };
  });
  check('A drawer is the console\'s panel',
    !!drawer && drawer.panel && /gradient/.test(drawer.bg),
    drawer ? `${drawer.panel ? 'console-panel' : 'plain'}, ${drawer.bg.slice(0, 54)}…` : 'no drawer opened');
  check('Its header is the console\'s header',
    !!drawer && drawer.upper === 'uppercase' && drawer.spacing >= 1.5,
    drawer ? `"${drawer.title}" ${drawer.upper} at ${drawer.spacing}px/${drawer.size}px` : 'no drawer');
  check('Over the console\'s hairline',
    !!drawer && (drawer.rule ?? '').includes(ASI),
    drawer?.rule ?? 'none');
  check('And it keeps its connector tab instead of corner brackets',
    !!drawer && drawer.connector && !drawer.brackets,
    drawer ? `connector ${drawer.connector}, bracketed ${drawer.brackets}` : 'no drawer');
  await ctx.close();
}

// ================== C. THE HAMBURGER
{
  const { ctx, page } = await fresh();
  await page.locator('.sys-btn[data-panel="menu"]').first().click();
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu-item')];
    return items.map((b) => {
      const before = getComputedStyle(b, '::before');
      const s = getComputedStyle(b);
      return {
        label: b.textContent.trim(),
        rowBtn: b.classList.contains('row-btn'),
        edge: before.content !== 'none' && parseFloat(before.width) >= 1.5,
        edgeColour: before.backgroundColor,
        bordered: s.borderLeftStyle !== 'none' && s.borderTopColor !== 'rgba(0, 0, 0, 0)',
        icon: !!b.querySelector('svg'),
      };
    });
  });
  check('Every menu item is a row you can see is a control',
    rows.length >= 6 && rows.every((r) => r.rowBtn && r.edge && r.bordered && r.icon),
    `${rows.length} items: ${rows.filter((r) => r.rowBtn && r.edge && r.bordered).length} with a lit edge and a border, ${rows.filter((r) => r.icon).length} with a mark`);
  // The edge has to light, or it is a stripe rather than a state.
  const lit = await page.evaluate(async () => {
    const b = document.querySelector('.menu-item');
    const before = () => getComputedStyle(b, '::before').backgroundColor;
    const at_rest = before();
    b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    // :hover cannot be forced from script, so compare against the rule itself.
    const rule = [...document.styleSheets].flatMap((sh) => { try { return [...sh.cssRules]; } catch { return []; } })
      .find((r) => r.selectorText === '.row-btn:hover::before');
    return { at_rest, hover: rule?.style?.background || rule?.style?.backgroundColor || null };
  });
  check('And the edge lights when the pointer is on it',
    !!lit.hover && lit.hover !== lit.at_rest,
    `at rest ${lit.at_rest}, on hover ${lit.hover ?? 'no rule found'}`);
  await ctx.close();
}

// ================== D. TOASTS AND THE FEED
{
  const { ctx, page } = await fresh();
  const toasts = await page.evaluate(() => {
    const g = window.__game, ui = window.__ui;
    const add = (text, kind, severity) => g.notifications.push({
      id: ++g.notificationSeq, seq: g.notificationSeq, tick: g.tick, kind, severity, count: 1, text });
    add('A routine commissioning notice.', 'info', 'low');
    add('Power demand is within 8% of capacity.', 'warn', 'medium');
    add('Three advisory systems submitted identical recommendations.', 'asi', 'high');
    ui.refresh(g);
    return [...document.querySelectorAll('.toast')].map((t) => {
      const s = getComputedStyle(t);
      return { cls: t.className, bg: s.backgroundImage, edge: s.borderLeftColor, edgeW: s.borderLeftWidth };
    });
  });
  check('Toasts are the console\'s panel',
    toasts.length >= 3 && toasts.every((t) => /gradient/.test(t.bg)),
    `${toasts.length} toasts, ${toasts.filter((t) => /gradient/.test(t.bg)).length} on the panel gradient`);
  // The left edge is the one thing that is *not* shared: it carries the kind.
  const kinds = new Set(toasts.map((t) => t.edge));
  check('And their left edge still says what kind of alert it is',
    kinds.size === toasts.length && toasts.some((t) => t.edge === 'rgb(122, 233, 255)'),
    `${kinds.size} distinct edges across ${toasts.length} toasts: ${[...kinds].join(', ')}`);

  const feed = await page.evaluate(async () => {
    document.querySelector('.sys-btn[data-panel="alerts"]')?.click();
    await new Promise((r) => setTimeout(r, 250));
    const items = [...document.querySelectorAll('.feed-item')];
    return items.slice(0, 6).map((f) => {
      const s = getComputedStyle(f);
      return { bg: s.backgroundColor, edge: s.borderLeftColor, radius: s.borderRadius };
    });
  });
  check('The feed matches the toasts it archives',
    feed.length > 0 && new Set(feed.map((f) => f.bg)).size === 1
    && new Set(feed.map((f) => f.edge)).size > 1,
    `${feed.length} entries, one background (${feed[0]?.bg}), ${new Set(feed.map((f) => f.edge)).size} edge colours`);
  await ctx.close();
}

// ================== E. ONE PANEL
{
  const { ctx, page } = await fresh();
  const mats = await page.evaluate(async () => {
    const ui = window.__ui, g = window.__game;
    const out = {};
    const bg = (sel) => {
      const el = document.querySelector(sel);
      return el ? getComputedStyle(el).backgroundImage : null;
    };
    document.querySelector('.bar-tool[data-panel="indicators"]')?.click();
    await new Promise((r) => setTimeout(r, 220));
    out.drawer = bg('.flyout:not(.hidden)');
    document.querySelector('.flyout')?.classList.add('hidden');
    ui.showSettings();
    await new Promise((r) => setTimeout(r, 220));
    out.dialog = bg('.modal:not(.hidden) .modal-box');
    document.querySelector('.modal')?.classList.add('hidden');
    const b = [...g.buildings.values()][2];
    if (b) ui.showInspector(b.id);
    await new Promise((r) => setTimeout(r, 200));
    out.inspector = bg('.inspector:not(.hidden)');
    out.toast = (() => {
      g.notifications.push({ id: ++g.notificationSeq, seq: g.notificationSeq, tick: g.tick,
        kind: 'info', severity: 'low', count: 1, text: 'A notice.' });
      ui.refresh(g);
      return bg('.toast');
    })();
    return out;
  });
  const names = Object.keys(mats);
  const values = names.map((k) => mats[k]);
  check('The drawer, a dialog, the inspector and a toast are cut from one panel',
    values.every((v) => v && /gradient/.test(v)) && new Set(values).size === 1,
    names.map((k) => `${k}: ${mats[k] ? (mats[k].slice(0, 34) + '…') : 'null'}`).join(' | '));
  await ctx.close();
}

// ================== F. THE SYSTEM CAN STILL TAKE IT APART
{
  const { ctx, page } = await fresh();
  const arc = await page.evaluate(async () => {
    const ui = window.__ui, g = window.__game;
    const read = () => {
      const bar = document.querySelector('.civic-bar');
      const toast = document.querySelector('.toast.warn');
      const card = document.querySelector('.build-card');
      return {
        barBorder: getComputedStyle(bar).borderTopColor,
        barBg: getComputedStyle(bar).backgroundImage,
        toastEdge: toast ? getComputedStyle(toast).borderLeftColor : null,
        cardFilter: card ? getComputedStyle(card).filter : null,
      };
    };
    g.notifications.push({ id: ++g.notificationSeq, seq: g.notificationSeq, tick: g.tick,
      kind: 'warn', severity: 'medium', count: 1, text: 'Grid strain.' });
    document.querySelector('.bar-tool[data-panel="zoning"]')?.click();
    await new Promise((r) => setTimeout(r, 220));
    ui.refresh(g);
    const before = read();
    document.body.classList.add('phase4');
    const phase4 = read();
    document.body.classList.add('observer');
    const observer = read();
    document.body.classList.remove('phase4', 'observer');
    return { before, phase4, observer };
  });
  check('Phase 4 still cools the console it inherited',
    arc.before.barBorder !== arc.phase4.barBorder && arc.before.barBg !== arc.phase4.barBg,
    `border ${arc.before.barBorder} → ${arc.phase4.barBorder}; background ${arc.before.barBg === arc.phase4.barBg ? 'unchanged' : 'changed'}`);
  check('And it still calms the warnings rather than removing them',
    arc.before.toastEdge !== null && arc.phase4.toastEdge !== null
    && arc.before.toastEdge !== arc.phase4.toastEdge,
    `${arc.before.toastEdge} → ${arc.phase4.toastEdge}`);
  check('Observer mode still drains what decides',
    arc.observer.cardFilter !== null && arc.observer.cardFilter !== 'none'
    && arc.observer.cardFilter !== arc.before.cardFilter,
    `build card filter ${arc.before.cardFilter} → ${arc.observer.cardFilter}`);
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
