// Layered single-mass buildings: fixed lots, inset walls and aligned emitters.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const types = ['house', 'apartment', 'office', 'edge_dc', 'med_dc', 'hospital', 'auto_factory', 'community_dc', 'community_center', 'midrise', 'highrise', 'retail', 'school', 'library', 'museum'];
const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173'); await pastBoot(page);
  await page.locator('#t-new').click(); await page.locator('.region-card').first().click();
  await page.locator('.bar-tool[data-panel="indicators"]').waitFor({ state: 'visible' });
  const decision = page.locator('.modal:not(.hidden) .modal-choices button').first();
  if (await decision.isVisible()) await decision.click();
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
  const output = process.env.PARALLAX_REVIEW_DIR;
  if (output) await mkdir(output, { recursive: true });
  for (const type of types) {
    const result = await page.evaluate((type) => {
      const r = window.__renderer, api = window.__api, g = window.__game;
      const def = api.BUILDING_DEFS[type], sprite = r.buildings.get(type), layer = sprite.volume;
      if (!layer) throw new Error(`${type}: ground/top layers missing`);
      const w = def.w * 16, h = def.h * 16;
      const expected = type === 'house' ? [1, 1, 14, 13]
        : type === 'hospital' ? [1, 1, w - 2, h - 4]
        : type === 'auto_factory' ? [1, 3, w - 2, h - 5]
        : type === 'community_dc' ? [1, 2, w - 2, h - 4]
        : type === 'community_center' ? [1, 2, w - 2, h - 6]
        : type === 'midrise' ? [1, 1, w - 2, h - 4]
        : type === 'highrise' ? [6, 2, w - 12, h - 12]
        : type === 'retail' ? [1, 4, w - 2, h - 6]
        : type === 'school' ? [22, 3, w - 25, h - 10]
        : type === 'library' ? [2, 3, w - 4, h - 8]
        : type === 'museum' ? [16, 2, w - 19, h - 8] : [1, 1, w - 2, h - 3];
      const equal = (a, b, label) => {
        if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${type}: ${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
      };
      equal([layer.base.x, layer.base.y, layer.base.w, layer.base.h], expected, 'visual base');
      const front = r.facadeFor(type), side = r.sideFacadeFor(type);
      equal([front.albedo.width, front.emissive.width], [expected[2], expected[2]], 'front material width');
      equal([side.albedo.width, side.emissive.width], [expected[3], expected[3]], 'side material width');
      const pixel = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
      equal(pixel(layer.top, 0, 0)[3], 0, 'top excludes lot backing');
      equal(pixel(layer.ground, 0, 0)[3], 255, 'ground retains lot backing');
      if (type === 'auto_factory') {
        equal(pixel(layer.ground, 3, h - 2), [208, 216, 96, 255], 'logistics stripe grounded');
        equal(pixel(layer.top, 3, h - 2)[3], 0, 'stripe absent from top');
      }
      if (type === 'community_center') {
        equal(pixel(layer.ground, 3, h - 3), [164, 120, 90, 255], 'noticeboard grounded');
        equal(pixel(layer.top, 3, h - 3)[3], 0, 'noticeboard absent from top');
      }
      if (type === 'community_dc') {
        equal(pixel(layer.ground, 3, h - 2), [58, 58, 64, 255], 'bikes grounded');
        equal(pixel(layer.top, 3, h - 2)[3], 0, 'bikes absent from top');
      }
      const groundSamples = {
        highrise: [3, h - 5], school: [5, h - 8], library: [9, h - 2], museum: [6, h - 6],
      };
      if (groundSamples[type]) {
        const [x, y] = groundSamples[type];
        equal(pixel(layer.top, x, y)[3], 0, 'yard detail absent from top');
        equal(pixel(layer.ground, x, y), pixel(sprite.albedo, x, y), 'yard detail preserved');
      }
      Object.assign(g, api.newGame(90210, 'verdant'));
      g.buildings.clear(); g.speed = 0; g.pendingEvent = null;
      for (const t of g.map) { t.terrain = 'grass'; t.road = false; t.buildingId = -1; }
      const b = api.placeBuilding(g, type, 50, 50, { free: true, instant: true });
      if (!b) throw new Error(`Cannot place ${type}`);
      b.active = true; api.touchMap(g); api.invalidateNetwork(g); r.resetSession();
      const state = JSON.stringify([...g.buildings.values()]);
      const ui = { hoverTile: null, cursorWorld: null, xrayRadial: false, buildType: null,
        buildTile: null, canPlaceHere: false, buildReplaces: false, demolish: null,
        selectedBuildingId: null, overlay: null };
      let renders = 0;
      for (const zoom of [2, 4]) for (const hour of [12, 23]) for (const right of [false, true]) for (const bottom of [false, true]) {
        r.setZoomDirect(zoom, 640, 400); r.hour = hour;
        const dx = right ? r.viewW - w - 32 : 32, dy = bottom ? r.viewH - h - 16 : 60;
        r.camX = 800 - dx; r.camY = 800 - dy;
        const v = r.volumeFor(type, dx, dy);
        const roofX = v.top.x - expected[0], roofY = v.top.y - expected[1];
        if (v.bounds.x > Math.min(dx, roofX) || v.bounds.y > Math.min(dy, roofY)
          || v.bounds.x + v.bounds.w < Math.max(dx, roofX) + w
          || v.bounds.y + v.bounds.h < Math.max(dy, roofY) + h)
          throw new Error(`${type}: roof attachment or lot outside culling bounds`);
        equal([v.base.x, v.base.y, v.base.w, v.base.h], [dx + expected[0], dy + expected[1], expected[2], expected[3]], 'stationary base');
        const seen = { ground: 0, top: 0, wall: 0, light: 0, bloom: 0, roofLight: 0, roofBloom: 0 };
        const wrap = (ctx, bloom) => {
          const original = ctx.drawImage;
          ctx.drawImage = function(source, ...args) {
            if (!bloom && source === layer.ground) { equal(args, [dx, dy], 'ground origin'); seen.ground++; }
            if (!bloom && source === layer.top) {
              equal(args, [v.top.x - expected[0], v.top.y - expected[1]], 'top origin'); seen.top++;
            }
            if (source === sprite.emissive) {
              equal(args, [v.top.x - expected[0], v.top.y - expected[1]], 'roof emitter origin');
              if (bloom) seen.roofBloom++; else seen.roofLight++;
            }
            const material = source === front.albedo || source === front.emissive ? front
              : source === side.albedo || source === side.emissive ? side : null;
            if (material) {
              const [x, y, width = source.width, height = source.height] = args;
              const m = this.getTransform();
              const corners = [[x,y], [x+width,y], [x+width,y+height], [x,y+height]]
                .map(([x,y]) => ({ x: m.a*x + m.c*y + m.e, y: m.b*x + m.d*y + m.f }));
              const matches = v.faces.some((f) => f.visible && f.corners.every((p, i) =>
                Math.abs(p.x-corners[i].x) < 0.001 && Math.abs(p.y-corners[i].y) < 0.001));
              if (!matches) throw new Error(`${type}: material detached from projected face`);
              if (bloom) seen.bloom++; else if (source === material.emissive) seen.light++; else seen.wall++;
            }
            return original.call(this, source, ...args);
          };
          return () => { ctx.drawImage = original; };
        };
        const restoreWorld = wrap(r.wctx, false), restoreBloom = wrap(r.ectx, true);
        try { r.render(g, ui); } finally { restoreWorld(); restoreBloom(); }
        equal(seen.ground, 1, 'ground actually rendered'); equal(seen.top, 1, 'top actually rendered');
        equal(seen.wall, v.faces.filter((f) => f.visible).length, 'all visible walls rendered');
        if (hour === 23) {
          equal(seen.light, seen.wall, 'night wall emitters'); equal(seen.bloom, seen.light, 'aligned bloom');
          equal(seen.roofLight, 1, 'roof emitter rendered'); equal(seen.roofBloom, 1, 'roof bloom rendered');
        }
        renders++;
      }
      if (type === 'highrise') {
        // The mast can be the only visible pixel while every structural corner
        // is below the viewport. Bounds-only unit assertions would miss a
        // renderer still culling against the inset structural rectangle.
        const H = r.viewH;
        let mastOnlyY;
        for (let y = H + 1; y < H + 100; y++) {
          const v = r.volumeFor(type, 80, y);
          if (v.top.y > H && y + v.z.y === H - 1) { mastOnlyY = y; break; }
        }
        if (mastOnlyY === undefined) throw new Error('Missing mast-only culling fixture');
        r.camX = 720; r.camY = 800 - mastOnlyY;
        const original = r.wctx.drawImage;
        let topDraws = 0;
        r.wctx.drawImage = function(source, ...args) {
          if (source === layer.top) topDraws++;
          return original.call(this, source, ...args);
        };
        try { r.render(g, ui); } finally { r.wctx.drawImage = original; }
        equal(topDraws, 1, 'mast-only top survives viewport culling');
      }
      equal(JSON.stringify([...g.buildings.values()]), state, 'gameplay state preserved');
      return renders;
    }, type);
    assert.equal(result, 16, `${type}: all pan/zoom/day-night cases`);
    if (output) for (const hour of [12, 23]) {
      await page.evaluate((hour) => {
        const r = window.__renderer;
        r.centerOn(50, 50); r.camX -= 12; r.camY -= 8; r.hour = hour;
        r.render(window.__game, { hoverTile: null, cursorWorld: null, xrayRadial: false,
          buildType: null, buildTile: null, canPlaceHere: false, buildReplaces: false,
          demolish: null, selectedBuildingId: null, overlay: null });
      }, hour);
      await page.screenshot({ path: resolve(output, `m69-${type}-${hour}.png`) });
    }
  }
  assert.deepEqual(errors, []);
  console.log('PASS fifteen layered types: 240 renders, inset bases, ground details, material sizes, projected faces, night emitters/bloom and unchanged state');
} finally { await browser.close(); }
