// M49 — choosing a region.
//   A. four cards, each showing the region it is offering
//   B. the picture is the map, tile for tile
//   C. pressing a card hands you that region, not another one rolled after
//   D. reroll deals one card again and leaves the other three alone
//   E. the figures are the scenario's own, and only the ones that differ
//   F. the card is the button, per M47
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';
const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const clearAll = async (page) => {
  for (let i = 0; i < 12; i++) {
    const b = page.locator('.modal:not(.hidden) .choice-btn, .modal:not(.hidden) .btn-primary').first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(140); }
    else break;
  }
};
/** The title screen, with nothing on disk — where a new player actually starts. */
const fresh = async (w = 1280, h = 900) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1600);
  await pastBoot(page);
  return { ctx, page };
};
const openPicker = async (page, viaTitle = true) => {
  // Through the title screen when it is there. On the previous build the
  // picker's first choice button is a scenario rather than Back, so backing
  // out of it starts a game and the title screen is gone — which hung the
  // whole counterfactual on `#t-new` rather than failing an assertion.
  const t = page.locator('#t-new');
  if (viaTitle && await t.count() && await t.isVisible().catch(() => false)) await t.click();
  else await page.evaluate(() => window.__ui.showScenarioPicker(true));
  await page.waitForTimeout(600);
};
const seeds = (page) => page.evaluate(() =>
  window.__ui.pickerSeeds ? Object.fromEntries(window.__ui.pickerSeeds) : {});
/**
 * Click something, or report that it was not there to click.
 *
 * The previous build's picker is four prose buttons and has no `.region-card`
 * on it at all, so every locator below resolves to nothing on it. Waiting
 * thirty seconds and throwing proves only that the selector is new.
 */
const tryClick = async (page, sel, wait = 400) => {
  const el = page.locator(sel);
  if (!(await el.count())) return false;
  await el.first().click();
  await page.waitForTimeout(wait);
  return true;
};
const cards = (page) => page.evaluate(() =>
  [...document.querySelectorAll('.modal:not(.hidden) .region-card')].map((c) => c.dataset.row));

/**
 * The thumbnail's pixels, as terrain names.
 *
 * The harness keeps its own copy of the colour table on purpose: a test that
 * imports the mapping it is checking would agree with the code about a wrong
 * answer.
 */
const readThumb = (page, id) => page.evaluate((row) => {
  const img = document.querySelector(`.region-card[data-row="${row}"] .region-map`);
  if (!img) return null;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  c.getContext('2d').drawImage(img, 0, 0);
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const NAME = {
    '4a7f3c': 'grass', '2f5a28': 'forest', 'c9b06a': 'sand',
    '6e6f6a': 'rock', '2e5f8f': 'water',
    '585d66': 'paved', 'd8cdb6': 'built',
  };
  const out = [];
  for (let i = 0; i < d.length; i += 4) {
    const hex = [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    out.push(NAME[hex] ?? null);
  }
  return { side: c.width, terrain: out };
}, id);

// ============ A. FOUR CARDS, EACH SHOWING ITS REGION
{
  const { ctx, page } = await fresh();
  await openPicker(page);
  const shape = await page.evaluate(() => {
    const m = document.querySelector('.modal:not(.hidden)');
    const cs = [...m.querySelectorAll('.region-card')];
    return {
      title: m.querySelector('h2')?.textContent ?? '',
      wide: m.querySelector('.modal-box')?.classList.contains('regions') ?? false,
      n: cs.length,
      ids: cs.map((c) => c.dataset.row),
      maps: cs.filter((c) => {
        const img = c.querySelector('img.region-map');
        return img && img.naturalWidth > 0 && img.naturalWidth === img.naturalHeight;
      }).length,
      side: cs[0]?.querySelector('img.region-map')?.naturalWidth ?? 0,
      // Prose buttons, which is what this dialog used to be made of.
      proseButtons: [...m.querySelectorAll('.choice-btn')].map((b) => b.textContent.trim()),
    };
  });
  check('The picker opens on Begin New Simulation', /begin new simulation/i.test(shape.title), shape.title);
  check('Four regions, as cards', shape.n === 4 && shape.wide,
    `${shape.n} cards, wide box ${shape.wide}`);
  check('Every one carries a square map of its own region',
    shape.maps === 4 && shape.side > 32, `${shape.maps} maps at ${shape.side}px square`);
  check('And the four regions are the four scenarios',
    shape.ids.join(',') === 'verdant,sunbelt,rustbelt,coast', shape.ids.join(','));
  check('The only remaining plain button is the way out',
    shape.proseButtons.length === 1 && /back|cancel/i.test(shape.proseButtons[0]),
    JSON.stringify(shape.proseButtons));
  await ctx.close();
}

// ============ B. THE PICTURE IS THE MAP, TILE FOR TILE
{
  const { ctx, page } = await fresh();
  await openPicker(page);
  const pinned = await seeds(page);
  for (const id of ['verdant', 'sunbelt', 'rustbelt', 'coast']) {
    const shot = await readThumb(page, id);
    if (!shot) { check(`${id}: there is a thumbnail to compare`, false, 'none'); continue; }
    // The region that seed actually produces, built by the game the same way
    // pressing the card will build it.
    const real = await page.evaluate(([sc, seed]) => {
      const g = window.__api.newGame(seed, sc);
      return {
        side: Math.round(Math.sqrt(g.map.length)),
        terrain: g.map.map((t) => t.terrain),
        road: g.map.map((t) => t.road),
        built: g.map.map((t) => t.buildingId !== -1),
      };
    }, [id, pinned[id]]);
    check(`${id}: the thumbnail is the same size as the map`,
      shot.side === real.side, `${shot.side} vs ${real.side}`);
    // Ground where there is nothing built, and the settlement where there is.
    // The first version compared against raw `generateTerrain` and found a
    // dozen tiles wrong per map: the founding town clears the rock and forest
    // it stands on, so the picture was of the valley before the town.
    let ground = 0, wrong = 0, paved = 0, built = 0;
    for (let i = 0; i < real.terrain.length; i++) {
      if (real.road[i]) { if (shot.terrain[i] === 'paved') paved++; continue; }
      if (real.built[i]) { if (shot.terrain[i] === 'built') built++; continue; }
      ground++;
      if (shot.terrain[i] !== real.terrain[i]) wrong++;
    }
    check(`${id}: every tile of ground in the picture is the tile the map has`,
      wrong === 0 && ground > 10000, `${wrong} wrong of ${ground} compared`);
    check(`${id}: and the founding town is drawn on it`,
      paved > 40 && built > 20, `${paved} paved tiles, ${built} built`);
  }
  // And they are not all the same picture, which a broken cache would give.
  const distinct = await page.evaluate(() =>
    new Set([...document.querySelectorAll('.region-map')].map((i) => i.src)).size);
  check('The four cards show four different regions', distinct === 4, `${distinct} distinct images`);
  await ctx.close();
}

// ============ C. PRESSING A CARD HANDS YOU THAT REGION
{
  const { ctx, page } = await fresh();
  await openPicker(page);
  const pinned = await seeds(page);
  const want = await readThumb(page, 'sunbelt');
  const pressed = await tryClick(page, '.region-card[data-row="sunbelt"] .region-name', 1100);
  check('There is a card to press', pressed, 'no region card on the picker');
  await clearAll(page);
  const got = await page.evaluate(() => {
    const g = window.__game;
    return { scenario: g.scenario, seed: g.seed, tick: g.tick,
      terrain: g.map.map((t) => t.terrain),
      road: g.map.map((t) => t.road),
      built: g.map.map((t) => t.buildingId !== -1),
      side: Math.round(Math.sqrt(g.map.length)) };
  });
  check('Pressing a card starts that scenario', pressed && got.scenario === 'sunbelt', got.scenario);
  check('At the seed the card was holding — not one rolled after the choice',
    pressed && pinned.sunbelt !== undefined && got.seed === pinned.sunbelt,
    `card showed ${pinned.sunbelt}, region opened at ${got.seed}`);
  let wrong = 0, compared = 0;
  if (want) for (let i = 0; i < got.terrain.length; i++) {
    if (got.road[i] || got.built[i]) continue;
    compared++;
    if (want.terrain[i] !== got.terrain[i]) wrong++;
  }
  check('And the region on screen is the one the card drew',
    !!want && wrong === 0 && compared > 10000,
    want ? `${wrong} of ${compared} tiles differ from the thumbnail` : 'no thumbnail to compare');
  await ctx.close();
}

// ============ D. REROLL DEALS ONE CARD AGAIN
{
  const { ctx, page } = await fresh();
  await openPicker(page);
  const before = await seeds(page);
  const beforeSrc = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.region-card')].map((c) => [c.dataset.row, c.querySelector('img').src])));
  const tickBefore = await page.evaluate(() => window.__game.tick);

  const rerolled = await tryClick(page, '.region-card[data-row="verdant"] .region-reroll', 500);
  check('There is a reroll control to press', rerolled, 'none on the picker');
  const after = await seeds(page);
  const afterSrc = await page.evaluate(() => Object.fromEntries(
    [...document.querySelectorAll('.region-card')].map((c) => [c.dataset.row, c.querySelector('img').src])));

  check('Rerolling changes that region\'s seed',
    rerolled && after.verdant !== undefined && after.verdant !== before.verdant,
    `${before.verdant} → ${after.verdant}`);
  check('And its picture with it',
    rerolled && !!afterSrc.verdant && afterSrc.verdant !== beforeSrc.verdant, 'image changed');
  check('The other three are untouched',
    rerolled && ['sunbelt', 'rustbelt', 'coast'].every((k) => after[k] !== undefined && after[k] === before[k] && afterSrc[k] === beforeSrc[k]),
    JSON.stringify(['sunbelt', 'rustbelt', 'coast'].map((k) => `${k}:${after[k] === before[k]}`)));
  check('And rerolling does not start anything',
    await page.evaluate(() => !!document.querySelector('.modal:not(.hidden) .region-card')) &&
    await page.evaluate(() => window.__game.tick) === tickBefore,
    'still on the picker');

  // Backing out and coming back must not silently swap the region under you.
  const held = await seeds(page);
  // The way out by name, not "the first button", which on the previous build
  // is Verdant Valley and starts a game.
  await tryClick(page, '.modal:not(.hidden) .choice-btn:has-text("Back")', 500);
  await openPicker(page);
  const again = await seeds(page);
  check('Leaving the picker and returning offers the same four regions',
    Object.keys(again).length === 4 &&
    ['verdant', 'sunbelt', 'rustbelt', 'coast'].every((k) => again[k] === held[k]),
    JSON.stringify(again) + ' vs ' + JSON.stringify(held));
  await ctx.close();
}

// ============ E. THE FIGURES ARE THE SCENARIO'S OWN
{
  const { ctx, page } = await fresh();
  await openPicker(page);
  const facts = await page.evaluate(() => {
    const out = {};
    for (const c of document.querySelectorAll('.region-card')) {
      out[c.dataset.row] = [...c.querySelectorAll('.fact')].map((f) => f.textContent.trim());
    }
    return out;
  });
  const defs = await page.evaluate(() => {
    // Read from the game, not from the card — that is the comparison.
    const s = {};
    for (const id of ['verdant', 'sunbelt', 'rustbelt', 'coast']) {
      const g = window.__api.newGame(1, id);
      s[id] = { capital: g.resources.capital, population: g.population };
    }
    return s;
  });
  const four = ['verdant', 'sunbelt', 'rustbelt', 'coast'];
  check('Every card states the capital the region actually starts with',
    four.every((id) => (facts[id] ?? []).some((f) => f.replace(/[^\d]/g, '') === String(defs[id].capital))),
    JSON.stringify(Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, v[0]]))));
  check('Sunbelt says what makes it hard: little water, a great deal of sun',
    (facts.sunbelt ?? []).some((f) => /0\.55/.test(f)) && (facts.sunbelt ?? []).some((f) => /1\.45/.test(f)),
    JSON.stringify(facts.sunbelt ?? null));
  check('Rustbelt says its plant is old and its industry inherited',
    (facts.rustbelt ?? []).some((f) => /aging/i.test(f)) && (facts.rustbelt ?? []).some((f) => /legacy/i.test(f)),
    JSON.stringify(facts.rustbelt ?? null));
  // The point of leaving the neutral ones off: four ×1.00s say nothing.
  check('And Verdant, which is ordinary in every respect, says nothing about multipliers',
    !!facts.verdant && !facts.verdant.some((f) => /×/.test(f)), JSON.stringify(facts.verdant ?? null));
  check('Every fact carries an icon or a currency mark, not a bare number',
    Object.values(facts).flat().length >= 12 && Object.values(facts).flat().every((f) => f.length > 0),
    `${Object.values(facts).flat().length} facts`);
  const iconed = await page.evaluate(() =>
    document.querySelectorAll('.region-card .fact svg.ico').length);
  check('The icons on them are the console\'s own set',
    iconed >= 6, `${iconed} icons across the four cards`);
  await ctx.close();
}

// ============ F. THE CARD IS THE BUTTON
{
  const { ctx, page } = await fresh();
  await openPicker(page);
  const shape = await page.evaluate(() => {
    const cs = [...document.querySelectorAll('.region-card')];
    return {
      roles: cs.map((c) => c.getAttribute('role')),
      tabbable: cs.every((c) => c.getAttribute('tabindex') === '0'),
      innerButtons: cs.flatMap((c) => [...c.querySelectorAll('button')]
        .filter((b) => !b.classList.contains('row-x')).map((b) => b.textContent.trim())),
      corners: cs.filter((c) => c.querySelector('.region-reroll')).length,
      // A corner, not a column.
      share: (() => {
        const c = cs[0], x = c?.querySelector('.region-reroll');
        if (!c || !x) return 1;
        return +(x.getBoundingClientRect().width / c.getBoundingClientRect().width).toFixed(3);
      })(),
      labels: cs.map((c) => c.querySelector('.region-reroll')?.getAttribute('aria-label')),
    };
  });
  check('Every card is itself the control',
    shape.roles.length === 4 && shape.roles.every((r) => r === 'button') && shape.tabbable,
    shape.roles.join(',') || 'no cards');
  // "No button inside a card" is true of a dialog with no cards in it, which
  // is the previous build. Conditioned on there being four to look inside.
  check('With no button inside it competing for the press',
    shape.roles.length === 4 && shape.innerButtons.length === 0,
    `${shape.roles.length} cards, inner buttons ${JSON.stringify(shape.innerButtons)}`);
  check('Reroll is a corner control, not a second column',
    shape.corners === 4 && shape.share < 0.1, `${shape.corners} corners at ${(shape.share * 100).toFixed(1)}% width`);
  check('And it says which region it would deal again',
    shape.labels.length === 4 && shape.labels.every((l) => l && /another/i.test(l)),
    JSON.stringify(shape.labels[0]));

  // The keyboard reaches a card.
  // Counted before the press, not after: pressing it starts the game and takes
  // the card off the screen, so asking afterwards always says zero.
  const kb = page.locator('.region-card[data-row="rustbelt"]');
  const hadCard = (await kb.count()) > 0;
  if (hadCard) { await kb.press('Enter'); await page.waitForTimeout(1100); await clearAll(page); }
  const opened = await page.evaluate(() => window.__game.scenario);
  check('Enter on a focused card takes the post', hadCard && opened === 'rustbelt', opened);
  await ctx.close();
}

// ============ G. ON A PHONE, REROLL SHOWS YOU WHAT IT ROLLED
{
  // A real phone context: the coarse-pointer rules that enlarge every corner
  // control only apply here, and they are what moved this one off centre.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1700);
  await pastBoot(page);
  await openPicker(page);

  // The list is taller than 50vh on a 390px screen, so the last card is below
  // the fold — which is the only place this bug is visible, and the only place
  // a player meets it.
  const before = await page.evaluate(() => {
    const body = document.querySelector('.modal:not(.hidden) .modal-body');
    const card = document.querySelector('.region-card[data-row="coast"]');
    if (!body || !card) return null;
    body.scrollTop = body.scrollHeight;
    const img = card.querySelector('.region-map');
    return {
      scrollTop: Math.round(body.scrollTop), scrollable: body.scrollHeight > body.clientHeight + 4,
      cardTop: Math.round(card.getBoundingClientRect().top),
      bodyTop: Math.round(body.getBoundingClientRect().top),
      bodyBottom: Math.round(body.getBoundingClientRect().bottom),
      src: img ? img.src.slice(-24) : '',
    };
  });
  check('The regions do not fit on a phone screen, so the list scrolls',
    !!before && before.scrollable && before.scrollTop > 40,
    before ? `scrolled to ${before.scrollTop}px` : 'no picker to scroll');

  const rerolled = await tryClick(page, '.region-card[data-row="coast"] .region-reroll', 500);
  const after = await page.evaluate(() => {
    const body = document.querySelector('.modal:not(.hidden) .modal-body');
    const card = document.querySelector('.region-card[data-row="coast"]');
    if (!body || !card) return null;
    const img = card.querySelector('.region-map');
    const r = card.getBoundingClientRect();
    return {
      scrollTop: Math.round(body.scrollTop),
      cardTop: Math.round(r.top), cardBottom: Math.round(r.bottom),
      bodyTop: Math.round(body.getBoundingClientRect().top),
      bodyBottom: Math.round(body.getBoundingClientRect().bottom),
      src: img ? img.src.slice(-24) : '',
    };
  });
  check('Rerolling the last region does not scroll the list back to the first',
    !!before && !!after && before.scrollTop > 40 && after.scrollTop === before.scrollTop,
    after ? `${before.scrollTop}px before, ${after.scrollTop}px after` : 'card gone after reroll');
  check('The card stays exactly where the finger left it',
    !!before && !!after && Math.abs(after.cardTop - before.cardTop) <= 1,
    after ? `top ${before.cardTop} → ${after.cardTop}` : 'no card');
  check('So the map it just dealt is on screen to be looked at',
    !!after && after.cardTop >= after.bodyTop - 1 && after.cardBottom <= after.bodyBottom + 1,
    after ? `card ${after.cardTop}–${after.cardBottom} within ${after.bodyTop}–${after.bodyBottom}` : 'no card');
  check('And it is a different map than the one it replaced',
    rerolled && !!before && !!after && before.src !== '' && after.src !== before.src,
    after ? `…${before.src} → …${after.src}` : 'no image');

  // Centred, on the card, on a phone — where the description wraps to four
  // lines and there is real vertical room to get this wrong.
  const centring = await page.evaluate(() =>
    [...document.querySelectorAll('.region-card')].map((c) => {
      const img = c.querySelector('.region-map');
      if (!img) return null;
      const a = c.getBoundingClientRect(), b = img.getBoundingClientRect();
      return {
        id: c.dataset.row, slack: Math.round(a.height - b.height),
        off: Math.round((b.top + b.height / 2) - (a.top + a.height / 2)),
      };
    }).filter(Boolean));
  const roomy = centring.filter((c) => c.slack > 20);
  check('The map sits in the middle of its card, not level with the first line',
    roomy.length >= 2 && roomy.every((c) => Math.abs(c.off) <= 1),
    roomy.length ? roomy.map((c) => `${c.id}:${c.off}px off centre (${c.slack}px of slack)`).join(', ')
      : 'no card taller than its map — nothing to centre');

  // Big enough to read a river off, without squeezing the card it sits on.
  const sizing = await page.evaluate(() => {
    const body = document.querySelector('.modal:not(.hidden) .modal-body');
    return [...document.querySelectorAll('.region-card')].map((c) => {
      const img = c.querySelector('.region-map'), txt = c.querySelector('.region-body');
      if (!img || !txt || !body) return null;
      const a = c.getBoundingClientRect(), i = img.getBoundingClientRect(), t = txt.getBoundingClientRect();
      const facts = [...c.querySelectorAll('.fact')].map((f) => f.getBoundingClientRect());
      return {
        id: c.dataset.row, map: Math.round(i.width), text: Math.round(t.width),
        // Nothing may hang past the card, and the card may not hang past the
        // list — an oversized map takes its space from the column beside it,
        // and a flex child that will not shrink pushes the overflow sideways
        // rather than reporting it.
        spill: Math.round(Math.max(0, t.right - (a.right - 44), ...facts.map((f) => f.right - (a.right - 44)))),
        wide: Math.round(Math.max(0, a.right - body.getBoundingClientRect().right)),
      };
    }).filter(Boolean);
  });
  check('The map is big enough on a phone to read a river off',
    sizing.length === 4 && sizing.every((s) => s.map >= 80),
    sizing.length ? sizing.map((s) => `${s.id}:${s.map}px`).join(', ') : 'no map');
  check('And the column beside it still has room for the words',
    sizing.length === 4 && sizing.every((s) => s.text >= 150 && s.spill <= 0 && s.wide <= 0),
    sizing.length ? sizing.map((s) => `${s.id}: text ${s.text}px, spill ${s.spill}px`).join(', ') : 'no card');

  // The reroll itself, which lost its centring to the coarse-pointer rule that
  // enlarges `.panel-close` and resets its `top` along the way.
  const corner = await page.evaluate(() =>
    [...document.querySelectorAll('.region-card')].map((c) => {
      const b = c.querySelector('.region-reroll');
      if (!b) return null;
      const a = c.getBoundingClientRect(), r = b.getBoundingClientRect();
      return {
        id: c.dataset.row,
        off: Math.round((r.top + r.height / 2) - (a.top + a.height / 2)),
        inside: r.right <= a.right + 1 && r.top >= a.top - 1 && r.bottom <= a.bottom + 1,
        size: Math.round(r.width),
      };
    }).filter(Boolean));
  check('Reroll is centred in its own corner too, at a size a thumb can hit',
    corner.length === 4 && corner.every((c) => Math.abs(c.off) <= 1 && c.inside && c.size >= 36),
    corner.length ? corner.map((c) => `${c.id}:${c.off}px, ${c.size}px`).join(', ') : 'no reroll');
  await ctx.close();
}

// ============ COST
{
  const { ctx, page } = await fresh();
  // The thumbnails themselves, not the dialog around them. Timing
  // `showScenarioPicker` twice measures four region generations the first time
  // and a DOM rebuild plus four image decodes the second, which is why the
  // first version of this could not tell a cache from a coincidence.
  const timing = await page.evaluate(() => {
    const api = window.__api;
    const ids = ['verdant', 'sunbelt', 'rustbelt', 'coast'];
    const seeds = ids.map((_, i) => 700000 + i);
    if (!api.regionThumbnail) return { first: 0, again: 0, identical: false, distinct: 0, bytes: 0 };
    const t0 = performance.now();
    const cold = ids.map((id, i) => api.regionThumbnail(id, seeds[i]));
    const first = performance.now() - t0;
    const t1 = performance.now();
    const warm = ids.map((id, i) => api.regionThumbnail(id, seeds[i]));
    const again = performance.now() - t1;
    return {
      first: +first.toFixed(1), again: +again.toFixed(1),
      identical: cold.every((u, i) => u === warm[i]),
      distinct: new Set(cold).size,
      bytes: Math.round(cold.reduce((n, u) => n + u.length, 0) / 1024),
    };
  });
  check('The four thumbnails are four different regions',
    timing.distinct === 4, `${timing.distinct} distinct`);
  check('Founding four regions to draw them is a cost worth paying',
    timing.bytes > 0 && timing.first < 400,
    `${timing.first}ms for four 112×112 regions, ${timing.bytes}KB of image`);
  check('And asking again returns the kept copy rather than founding them twice',
    timing.identical && timing.again < timing.first * 0.1,
    `${timing.first}ms cold, ${timing.again}ms warm`);
  console.log(`\n  · thumbnails: ${timing.first}ms cold, ${timing.again}ms warm, ${timing.bytes}KB`);
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
