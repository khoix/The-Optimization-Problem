// M44 — placing things, and unplacing them.
//   A. no founding road stands on rock, and every one of them can be repaved
//   B. saves written before that still open, and are repaired
//   C. the placement cursor sits in the middle of the footprint
//   D. a foundation with no work done on it is refunded in full
//   E. a road laid over a road says so
//   F. the inspector opens beside the structure and follows it
//   G. and closes with an X in its top right corner
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
const fresh = async (w = 1280, h = 800, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('top:boot', 'new:verdant'); });
  await page.reload();
  await page.waitForTimeout(1500);
  await pastBoot(page);
  await clearAll(page);
  // Noon and stopped: the cursor colours below are read off the screen, and
  // the lighting pass tints everything it draws.
  await page.evaluate(() => { window.__game.speed = 0; window.__renderer.hour = 12; });
  return { ctx, page };
};
/** Swap in a differently seeded region the way startSession does. */
const reseed = (page, seed) => page.evaluate((s) => {
  const api = window.__api;
  const ng = api.newGame(s, 'verdant');
  for (const k of Object.keys(window.__game)) delete window.__game[k];
  Object.assign(window.__game, ng);
  api.invalidateNetwork(window.__game);
  window.__game.speed = 0;
  return window.__game.map.filter((t) => t.terrain === 'rock').length;
}, seed);

// ================== A. NO FOUNDING ROAD STANDS ON ROCK
{
  const { ctx, page } = await fresh();
  const seeds = [303, 404, 606, 1212, 7777];
  for (const s of seeds) {
    const rocks = await reseed(page, s);
    const m = await page.evaluate(() => {
      const g = window.__game, api = window.__api;
      let roads = 0, onRock = 0, repavable = 0, nearRock = 0;
      for (let y = 0; y < g.mapH; y++) {
        for (let x = 0; x < g.mapW; x++) {
          const t = g.map[y * g.mapW + x];
          if (!t.road) continue;
          roads++;
          if (t.terrain === 'rock') onRock++;
          if (api.canPlace(g, 'avenue', x, y)) repavable++;
          // Rock within one tile of a road: proof this region's terrain
          // actually reaches the founding grid, so "no road on rock" is a
          // fact about the fix and not about a map with no rock in it.
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const n = g.map[(y + dy) * g.mapW + (x + dx)];
            if (n && n.terrain === 'rock') { nearRock++; break; }
          }
        }
      }
      return { roads, onRock, repavable, nearRock };
    });
    check(`Seed ${s}: no founding road is standing on rock`, m.onRock === 0,
      `${m.onRock} of ${m.roads} road tiles on rock (${rocks} rock tiles on the map)`);
    check(`Seed ${s}: every founding road accepts an avenue over it`,
      m.repavable === m.roads, `${m.repavable} of ${m.roads}`);
  }
  // At least one of those seeds must put rock next to the founding grid, or
  // the whole section is asserting about ground that was never at issue.
  const touching = await page.evaluate(() => {
    const api = window.__api;
    let worst = 0;
    for (const s of [303, 404, 606, 1212, 7777]) {
      const g = api.newGame(s, 'verdant');
      let n = 0;
      for (let y = 1; y < g.mapH - 1; y++) {
        for (let x = 1; x < g.mapW - 1; x++) {
          const t = g.map[y * g.mapW + x];
          if (!t.road) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (g.map[(y + dy) * g.mapW + (x + dx)].terrain === 'rock') { n++; break; }
          }
        }
      }
      worst = Math.max(worst, n);
    }
    return worst;
  });
  check('And the founding grid really is laid through rock country on at least one of them',
    touching > 0, `${touching} road tiles with rock alongside`);
  await ctx.close();
}

// ================== B. OLDER SAVES ARE REPAIRED ON THE WAY IN
{
  const { ctx, page } = await fresh();
  // Write a save, then put the rock back under its roads — byte for byte what
  // a region founded before this milestone had on disk.
  const doctored = await page.evaluate(() => {
    const api = window.__api, g = window.__game;
    api.saveTo(api.MANUAL_SLOT, g);
    const env = JSON.parse(localStorage.getItem('top:save'));
    const road = env.state.map.road, terrain = env.state.map.terrain.split('');
    const hit = [];
    for (let i = 0; i < road.length && hit.length < 6; i++) {
      if (road[i] !== '.' && terrain[i] === 'g') { terrain[i] = 'r'; hit.push(i); }
    }
    env.state.map.terrain = terrain.join('');
    localStorage.setItem('top:save', JSON.stringify(env));
    localStorage.setItem('top:boot', 'load:top:save');
    return { hit, mapW: g.mapW };
  });
  check('The probe put rock back under six road tiles', doctored.hit.length === 6,
    `${doctored.hit.length} tiles`);
  await page.reload();
  await page.waitForTimeout(1600);
  await pastBoot(page);
  await clearAll(page);
  const m = await page.evaluate((d) => {
    const g = window.__game, api = window.__api;
    return d.hit.map((i) => {
      const t = g.map[i];
      return {
        road: t.road, terrain: t.terrain,
        avenue: api.canPlace(g, 'avenue', i % d.mapW, Math.floor(i / d.mapW)),
      };
    });
  }, doctored);
  check('A save with roads on rock still opens', m.length === 6 && m.every((t) => t.road),
    JSON.stringify(m[0]));
  check('And the rock under them is gone', m.every((t) => t.terrain === 'grass'),
    m.map((t) => t.terrain).join(','));
  check('So they can finally be repaved', m.every((t) => t.avenue),
    m.map((t) => t.avenue).join(','));
  await ctx.close();
}

/** Screen point at the centre of a tile, or null if it isn't comfortably visible. */
const tileScreen = (page, tx, ty) => page.evaluate(([x, y]) => {
  const r = window.__renderer;
  const sx = (x * 16 + 8 - r.camX) * r.zoom, sy = (y * 16 + 8 - r.camY) * r.zoom;
  if (sx < 40 || sy < 40 || sx > innerWidth - 40 || sy > innerHeight - 240) return null;
  return [sx, sy];
}, [tx, ty]);

// ================== C. THE CURSOR SITS IN THE MIDDLE OF THE FOOTPRINT
{
  const { ctx, page } = await fresh();
  await page.evaluate(() => { window.__game.resources.capital = 9e5; });
  // One of each shape the game actually builds: odd, even, oblong, and the 1×1
  // that must not move at all. Dimensions read from the definitions rather than
  // written down here — the first draft asserted a 3×3 school against a 3×2 one
  // and reported the code off by a tile.
  const cases = await page.evaluate(() =>
    ['school', 'apartment', 'arcology', 'house'].map((t) =>
      [t, window.__api.BUILDING_DEFS[t].w, window.__api.BUILDING_DEFS[t].h]));
  check('The probe is testing a range of footprint shapes, including an oblong one',
    new Set(cases.map(([, w, h]) => `${w}x${h}`)).size === 4 && cases.some(([, w, h]) => w !== h),
    cases.map(([t, w, h]) => `${t} ${w}×${h}`).join(', '));
  for (const [type, w, h] of cases) {
    const spot = await page.evaluate(([t, tw, th]) => {
      const g = window.__game, api = window.__api, r = window.__renderer;
      // A clicked tile whose *centred* footprint is clear — and whose top-left
      // one is too, so the old behaviour and the new one are both legal here
      // and the check is about where it lands, not whether it can.
      const off = [Math.round(-tw / 2), Math.round(-th / 2)];
      for (let ty = 6; ty < g.mapH - 6; ty++) {
        for (let tx = 6; tx < g.mapW - 6; tx++) {
          if (!api.canPlace(g, t, tx + off[0], ty + off[1])) continue;
          if (!api.canPlace(g, t, tx, ty)) continue;
          const sx = (tx * 16 + 8 - r.camX) * r.zoom, sy = (ty * 16 + 8 - r.camY) * r.zoom;
          if (sx < 60 || sy < 60 || sx > innerWidth - 60 || sy > innerHeight - 260) continue;
          return [tx, ty, sx, sy];
        }
      }
      return null;
    }, [type, w, h]);
    if (!spot) { check(`${type}: the probe found a clear site on screen`, false, 'none'); continue; }
    const px = [spot[2], spot[3]];
    const built = await page.evaluate(async ([t, sx, sy]) => {
      const g = window.__game;
      window.__ui.tool = { kind: 'build', type: t };
      const before = new Set(g.buildings.keys());
      const c = document.getElementById('game');
      c.dispatchEvent(new PointerEvent('pointermove', { pointerId: 3, pointerType: 'mouse', clientX: sx, clientY: sy, bubbles: true }));
      c.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: sx, clientY: sy, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 3, pointerType: 'mouse', button: 0, clientX: sx, clientY: sy, bubbles: true }));
      await new Promise((r) => setTimeout(r, 220));
      window.__ui.tool = { kind: 'none' };
      for (const [id, b] of g.buildings) if (!before.has(id)) return { x: b.x, y: b.y };
      return null;
    }, [type, px[0], px[1]]);
    if (!built) { check(`${type}: the click placed one`, false, `at ${spot}`); continue; }
    // The centre of the footprint should be the tile that was clicked, to
    // within the half tile an even footprint cannot express.
    const cx = built.x + (w - 1) / 2, cy = built.y + (h - 1) / 2;
    check(`A ${w}×${h} ${type} lands centred on the clicked tile`,
      Math.abs(cx - spot[0]) <= 0.5 && Math.abs(cy - spot[1]) <= 0.5,
      `clicked ${spot}, anchored ${built.x},${built.y}, centre ${cx},${cy}`);
    if (w === 1) {
      check('And a 1×1 still lands exactly on the tile under the cursor',
        built.x === spot[0] && built.y === spot[1], `clicked ${spot}, got ${built.x},${built.y}`);
    }
  }
  await ctx.close();
}

// ================== D. NOTHING BUILT YET COSTS NOTHING TO TAKE BACK
{
  const { ctx, page } = await fresh();
  const site = (type) => page.evaluate((t) => {
    const g = window.__game, api = window.__api;
    for (let ty = 5; ty < g.mapH - 5; ty++) {
      for (let tx = 5; tx < g.mapW - 5; tx++) if (api.canPlace(g, t, tx, ty)) return [tx, ty];
    }
    return null;
  }, type);

  // Paused, as the complaint describes: lay it, look again, take it back.
  const s1 = await site('apartment');
  const undo = await page.evaluate(async ([t, x, y]) => {
    const g = window.__game, api = window.__api;
    g.resources.capital = 5000;
    const before = g.resources.capital;
    const b = api.placeBuilding(g, t, x, y);
    const paid = before - g.resources.capital;
    const progress = b.progress;
    window.__ui.requestDemolish(b.id);
    await new Promise((r) => setTimeout(r, 150));
    return {
      paid, progress, back: g.resources.capital - (before - paid),
      gone: !g.buildings.has(b.id),
      modal: !document.querySelector('.modal').classList.contains('hidden'),
    };
  }, [...['apartment'], ...s1]);
  check('The foundation was paid for and no work had been done on it',
    undo.paid > 0 && undo.progress === 0, `§${undo.paid}, progress ${undo.progress}`);
  check('Cancelling it returns every last unit of capital',
    undo.gone && undo.back === undo.paid, `paid §${undo.paid}, got §${undo.back} back`);

  // One month later the ordinary scrap rate applies again — and so does the
  // confirmation, which is the same §150 threshold as ever. Both halves of the
  // contrast are asserted, because the change is which side of it a foundation
  // falls on, not the threshold itself.
  const s2 = await site('apartment');
  const later = await page.evaluate(async ([t, x, y]) => {
    const g = window.__game, api = window.__api;
    g.resources.capital = 5000;
    const before = g.resources.capital;
    const b = api.placeBuilding(g, t, x, y);
    const paid = before - g.resources.capital;
    g.gameOver = null;
    api.simTick(g);
    const progress = b.progress;
    const mid = g.resources.capital;
    window.__ui.requestDemolish(b.id);
    await new Promise((r) => setTimeout(r, 150));
    const asked = !document.querySelector('.modal').classList.contains('hidden');
    const still = g.buildings.has(b.id);
    // Say yes to it.
    const btn = document.querySelector('.modal:not(.hidden) .choice-btn');
    if (btn) btn.click();
    await new Promise((r) => setTimeout(r, 200));
    return { paid, progress, asked, still, back: g.resources.capital - mid, gone: !g.buildings.has(b.id) };
  }, [...['apartment'], ...s2]);
  check('A month of work started, so the building is no longer just a decision',
    later.progress > 0, `progress ${later.progress}`);
  check('Demolishing it asks first, and waits for the answer',
    later.asked && later.still, `asked ${later.asked}, still standing ${later.still}`);
  check('And returns the scrap rate, not the price',
    later.gone && later.back > 0 && later.back < later.paid * 0.6,
    `paid §${later.paid}, got §${later.back} back`);
  await clearAll(page);

  // The expensive case: a confirmation exists to stop a misclick spending a
  // fortune, and there is no fortune to spend on a site with nothing on it.
  const s3 = await site('nuclear_plant');
  const big = await page.evaluate(async ([t, x, y]) => {
    const g = window.__game, api = window.__api;
    g.resources.capital = 9e5;
    const cost = api.BUILDING_DEFS[t].cost;
    const before = g.resources.capital;
    const b = api.placeBuilding(g, t, x, y);
    window.__ui.requestDemolish(b.id);
    await new Promise((r) => setTimeout(r, 200));
    return {
      cost, gone: !g.buildings.has(b.id), whole: g.resources.capital === before,
      modal: !document.querySelector('.modal').classList.contains('hidden'),
    };
  }, [...['nuclear_plant'], ...s3]);
  check('The building used for this is dear enough to normally need confirming',
    big.cost >= 400, `§${big.cost}`);
  check('Taking back an unstarted one asks nothing and charges nothing',
    big.gone && big.whole && !big.modal,
    `gone ${big.gone}, capital whole ${big.whole}, modal ${big.modal}`);
  await ctx.close();
}

// ================== E. A ROAD OVER A ROAD SAYS SO
{
  const { ctx, page } = await fresh();
  const note = await page.evaluate(async () => {
    window.__ui.togglePanel('transit');
    await new Promise((r) => setTimeout(r, 300));
    const n = document.querySelector('.flyout:not(.hidden) .build-note');
    const txt = n ? n.textContent : '';
    window.__ui.closePanel();
    return txt;
  });
  check('The road drawer says a road can be drawn over a road',
    /over an existing/i.test(note) && /in place/i.test(note), JSON.stringify(note.slice(0, 90)));

  // And the cursor says it too. Read off the screen at two hovers — one over
  // existing pavement, one over open ground — and diff them, rather than
  // asserting an absolute colour that the grade, bloom and vignette all move.
  const probe = await page.evaluate(() => {
    const g = window.__game, r = window.__renderer;
    const on = (pred) => {
      for (let ty = 4; ty < g.mapH - 4; ty++) {
        for (let tx = 4; tx < g.mapW - 4; tx++) {
          const t = g.map[ty * g.mapW + tx];
          if (!pred(t)) continue;
          const sx = (tx * 16 + 8 - r.camX) * r.zoom, sy = (ty * 16 + 8 - r.camY) * r.zoom;
          if (sx > 60 && sy > 60 && sx < innerWidth - 60 && sy < innerHeight - 260) return [tx, ty, sx, sy];
        }
      }
      return null;
    };
    return {
      road: on((t) => t.road && t.roadType === 1 && t.buildingId === -1),
      open: on((t) => !t.road && t.buildingId === -1 && (t.terrain === 'grass' || t.terrain === 'sand')),
    };
  });
  check('The probe found a street and a patch of open ground on screen',
    !!probe.road && !!probe.open, JSON.stringify(probe));
  if (probe.road && probe.open) {
    const sample = async (sx, sy) => {
      await page.mouse.move(sx, sy);
      await page.waitForTimeout(220);
      return page.evaluate(([x, y]) => {
        const c = document.getElementById('game');
        const cx = c.getContext('2d');
        const dpr = c.width / innerWidth;
        // A small block, averaged: one pixel can land on a road stripe.
        const d = cx.getImageData(Math.round(x * dpr) - 3, Math.round(y * dpr) - 3, 7, 7).data;
        let r = 0, g2 = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g2 += d[i + 1]; b += d[i + 2]; }
        const n = d.length / 4;
        return { r: r / n, g: g2 / n, b: b / n };
      }, [sx, sy]);
    };
    // Nothing in hand: the ground itself, so the comparison below is about the
    // cursor and not about road pixels being greyer than grass pixels.
    const bareRoad = await sample(probe.road[2], probe.road[3]);
    const bareOpen = await sample(probe.open[2], probe.open[3]);
    await page.evaluate(() => { window.__ui.tool = { kind: 'build', type: 'avenue' }; });
    const overRoad = await sample(probe.road[2], probe.road[3]);
    const overOpen = await sample(probe.open[2], probe.open[3]);
    await page.evaluate(() => { window.__ui.tool = { kind: 'none' }; });
    // Warmth: amber pushes red above blue, green pulls it the other way.
    const warm = (c) => c.r - c.b;
    const dRoad = warm(overRoad) - warm(bareRoad);
    const dOpen = warm(overOpen) - warm(bareOpen);
    check('The cursor over open ground reads as a placement, not a replacement',
      dOpen < 6, `warmth shift ${dOpen.toFixed(1)}`);
    check('The cursor over an existing road reads warmer — a replacement, not a new tile',
      dRoad > dOpen + 12, `over road ${dRoad.toFixed(1)} vs over ground ${dOpen.toFixed(1)}`);
  }
  await ctx.close();
}

/** Open the inspector by clicking the building, the way a player does. */
const selectBuilding = async (page, pick = 'any') => {
  const spot = await page.evaluate((mode) => {
    const g = window.__game, r = window.__renderer;
    let best = null;
    for (const b of g.buildings.values()) {
      const def = window.__api.BUILDING_DEFS[b.type];
      const sx = (b.x * 16 + def.w * 8 - r.camX) * r.zoom, sy = (b.y * 16 + def.h * 8 - r.camY) * r.zoom;
      if (sx < 60 || sy < 60 || sx > innerWidth - 60 || sy > innerHeight - 260) continue;
      const score = mode === 'right' ? sx : mode === 'left' ? -sx : -Math.abs(sx - innerWidth / 2);
      if (!best || score > best.score) best = { score, id: b.id, sx, sy };
    }
    return best;
  }, pick);
  if (!spot) return null;
  await page.mouse.click(spot.sx, spot.sy);
  await page.waitForTimeout(260);
  return spot;
};
const boxes = (page) => page.evaluate(() => {
  const p = document.querySelector('.inspector');
  const g = window.__game, r = window.__renderer;
  const id = window.__ui.selectedBuildingId;
  const b = id != null ? g.buildings.get(id) : null;
  const def = b ? window.__api.BUILDING_DEFS[b.type] : null;
  const pr = p.getBoundingClientRect();
  return {
    hidden: p.classList.contains('hidden'),
    floating: p.classList.contains('floating'),
    panel: { x: pr.left, y: pr.top, w: pr.width, h: pr.height },
    foot: b ? {
      x: (b.x * 16 - r.camX) * r.zoom, y: (b.y * 16 - r.camY) * r.zoom,
      w: def.w * 16 * r.zoom, h: def.h * 16 * r.zoom,
    } : null,
    barH: parseFloat(getComputedStyle(document.getElementById('app')).getPropertyValue('--bar-h')) || 130,
    vw: innerWidth, vh: innerHeight,
  };
});
const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const gap = (p, f) => Math.max(0, f.x - (p.x + p.w), p.x - (f.x + f.w), f.y - (p.y + p.h), p.y - (f.y + f.h));

// ================== F. THE INSPECTOR OPENS BESIDE THE STRUCTURE
{
  const { ctx, page } = await fresh();
  const sel = await selectBuilding(page);
  check('Clicking a building opened the inspector', !!sel, sel ? `#${sel.id}` : 'nothing clickable');
  const m = await boxes(page);
  check('The panel is on screen', !m.hidden && m.panel.w > 0, JSON.stringify(m.panel));
  check('It is floating rather than pinned to the corner',
    m.floating && m.panel.x > 40, `floating ${m.floating}, left ${Math.round(m.panel.x)}`);
  check('It sits next to the building, not somewhere else on the map',
    gap(m.panel, m.foot) < 60, `${Math.round(gap(m.panel, m.foot))}px from the footprint`);
  check('And not on top of it', !overlaps(m.panel, m.foot),
    `panel ${JSON.stringify(m.panel)} foot ${JSON.stringify(m.foot)}`);
  check('It clears the civic bar', m.panel.y + m.panel.h <= m.vh - m.barH + 1,
    `panel bottom ${Math.round(m.panel.y + m.panel.h)}, bar top ${Math.round(m.vh - m.barH)}`);

  // The pointer is still resting on the building it just selected, which is
  // now right beside the panel — so the hover card and the inspector are
  // competing for the same square of screen, and the card draws on top.
  const card = await page.evaluate(() => {
    const c = document.querySelector('.hover-card'), p = document.querySelector('.inspector');
    const cr = c.getBoundingClientRect(), pr = p.getBoundingClientRect();
    return {
      shown: !c.classList.contains('hidden') && cr.width > 0,
      text: c.textContent.trim().slice(0, 40),
      card: { x: cr.left, y: cr.top, w: cr.width, h: cr.height },
      panel: { x: pr.left, y: pr.top, w: pr.width, h: pr.height },
    };
  });
  check('The pointer is still over the building, so the hover card is up',
    card.shown, `shown ${card.shown}, ${JSON.stringify(card.text)}`);
  check('And it is not sitting on top of the inspector',
    !card.shown || !overlaps(card.card, card.panel),
    `card ${JSON.stringify(card.card)} panel ${JSON.stringify(card.panel)}`);

  // Pan. The panel is describing a building, not a corner of the screen.
  const moved = await page.evaluate(async () => {
    const r = window.__renderer;
    const before = document.querySelector('.inspector').getBoundingClientRect().left;
    r.camX -= 120 / r.zoom;
    await new Promise((res) => setTimeout(res, 200));
    return { before, after: document.querySelector('.inspector').getBoundingClientRect().left };
  });
  check('Panning the map takes the panel with the building',
    Math.abs((moved.after - moved.before) - 120) < 14,
    `building moved 120px, panel moved ${Math.round(moved.after - moved.before)}px`);
  const after = await boxes(page);
  check('And it is still beside it afterwards',
    !overlaps(after.panel, after.foot) && gap(after.panel, after.foot) < 60,
    `${Math.round(gap(after.panel, after.foot))}px`);

  // A building against the right edge has no room on its right.
  await page.evaluate(() => window.__ui.handleEscape());
  await page.waitForTimeout(120);
  const right = await selectBuilding(page, 'right');
  if (right) {
    const rm = await boxes(page);
    // "On screen and not overlapping" is true of the old bottom-left corner as
    // well, so it is not the claim. The claim is that the panel is beside this
    // building, and on the side of it that has the room.
    check('A building near the right edge gets the panel on its left',
      rm.panel.x + rm.panel.w <= rm.foot.x + 1 && gap(rm.panel, rm.foot) < 60 &&
      rm.panel.x >= 0 && rm.panel.x + rm.panel.w <= rm.vw,
      `panel ${Math.round(rm.panel.x)}–${Math.round(rm.panel.x + rm.panel.w)}, ` +
      `building at ${Math.round(rm.foot.x)}, ${Math.round(gap(rm.panel, rm.foot))}px apart`);
  } else {
    check('The probe found a building near the right edge', false, 'none on screen');
  }
  await ctx.close();
}

// --- and on a phone it stays the full-width sheet it already was
{
  const { ctx, page } = await fresh(390, 844, { hasTouch: true });
  const sel = await selectBuilding(page);
  check('The phone case selected a building', !!sel, sel ? `#${sel.id}` : 'none');
  const m = await boxes(page);
  check('On a narrow screen the panel is not floated beside anything',
    !m.floating, `floating ${m.floating}`);
  check('It spans the width above the bar, as it did before',
    m.panel.x < 20 && m.panel.x + m.panel.w > m.vw - 20 && m.panel.y + m.panel.h <= m.vh - m.barH + 1,
    `x ${Math.round(m.panel.x)}, right ${Math.round(m.panel.x + m.panel.w)} of ${m.vw}`);
  await ctx.close();
}

// ================== G. CLOSE IS AN X IN THE TOP RIGHT
{
  const { ctx, page } = await fresh();
  await selectBuilding(page);
  const m = await page.evaluate(() => {
    const p = document.querySelector('.inspector');
    const x = p.querySelector('.panel-close');
    const pr = p.getBoundingClientRect();
    const xr = x ? x.getBoundingClientRect() : null;
    return {
      exists: !!x, glyph: x ? x.textContent.trim() : '',
      label: x ? x.getAttribute('aria-label') : '',
      size: xr ? [Math.round(xr.width), Math.round(xr.height)] : null,
      fromRight: xr ? Math.round(pr.right - xr.right) : null,
      fromTop: xr ? Math.round(xr.top - pr.top) : null,
      textButtons: [...p.querySelectorAll('.inspector-actions button')].map((b) => b.textContent.trim()),
      rows: (() => {
        // How many lines the action row occupies — the reason the button left it.
        const btns = [...p.querySelectorAll('.inspector-actions button')];
        return new Set(btns.map((b) => Math.round(b.getBoundingClientRect().top))).size;
      })(),
    };
  });
  check('The inspector has an X control', m.exists && m.glyph === '×', `${m.exists} ${JSON.stringify(m.glyph)}`);
  check('It is in the top right corner', m.fromRight !== null && m.fromRight <= 8 && m.fromTop <= 8,
    `${m.fromRight}px from the right, ${m.fromTop}px from the top`);
  check('It is big enough to hit', m.size && m.size[0] >= 24 && m.size[1] >= 24, JSON.stringify(m.size));
  check('It says what it is to a screen reader', m.label === 'Close', JSON.stringify(m.label));
  check('And no Close button is left in the action row',
    !m.textButtons.some((t) => /^Close$/i.test(t)), JSON.stringify(m.textButtons));

  // Guarded so a build without the control fails the assertions rather than
  // hanging the run on a locator that will never resolve.
  if (await page.locator('.inspector .panel-close').count()) {
    await page.locator('.inspector .panel-close').click();
    await page.waitForTimeout(180);
  }
  const closed = await page.evaluate(() => ({
    hidden: document.querySelector('.inspector').classList.contains('hidden'),
    sel: window.__ui.selectedBuildingId,
  }));
  check('Clicking it puts the panel away and drops the selection',
    closed.hidden && closed.sel === null, JSON.stringify(closed));

  // Observer mode greys what decides. Closing a panel is not a decision.
  await selectBuilding(page);
  const obs = await page.evaluate(async () => {
    window.__game.asi.observer = true;
    document.body.classList.add('observer');
    await new Promise((r) => setTimeout(r, 60));
    const x = document.querySelector('.inspector .panel-close');
    const s = x ? getComputedStyle(x) : null;
    const btn = document.querySelector('.inspector .small-btn');
    return { close: s?.opacity ?? null, filter: s?.filter ?? null, action: btn ? getComputedStyle(btn).opacity : null };
  });
  check('Under observer mode the actions are greyed but the X is not',
    obs.close === '1' && obs.filter === 'none' && obs.action !== '1',
    `X opacity ${obs.close} filter ${obs.filter}, action opacity ${obs.action}`);
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
