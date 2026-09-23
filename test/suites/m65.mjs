// Complete architecture atlas and viewport-edge integration, using the built renderer.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173'); await pastBoot(page);
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now() + 1000));
  const result = await page.evaluate(() => {
    const r = window.__renderer, api = window.__api, g = window.__game;
    g.speed = 0;
    const assets = Object.values(api.BUILDING_DEFS).filter((d) => d.roadType === undefined).map((d) => {
      const s = r.buildings.get(d.type), f = r.facadeFor(d.type);
      return { type: d.type, expected: [d.w * 16, d.h * 16],
        roof: [s.albedo.width, s.albedo.height], emit: [s.emissive.width, s.emissive.height],
        facade: f ? [f.albedo.width, f.albedo.height, f.emissive.width, f.emissive.height] : null,
        image: s.albedo.toDataURL(), sameLayers: s.albedo.toDataURL() === s.emissive.toDataURL() };
    });
    const next = api.newGame(90210, 'verdant');
    Object.assign(g, next); g.buildings.clear(); g.speed = 0;
    for (const t of g.map) { t.terrain = 'grass'; t.buildingId = -1; t.road = false; }
    const b = api.placeBuilding(g, 'arcology', 30, 30, { free: true, instant: true });
    if (!b) throw new Error('No arcology fixture');
    b.active = true; api.touchMap(g); api.invalidateNetwork(g); r.resetSession();
    r.setZoomDirect(2, 640, 400); r.hour = 12;
    const state = JSON.stringify([...g.buildings.values()]);
    const ui = { hoverTile: null, cursorWorld: null, xrayRadial: false, buildType: null,
      buildTile: null, canPlaceHere: false, buildReplaces: false, demolish: null,
      selectedBuildingId: null, overlay: null };
    const roof = r.buildings.get('arcology').albedo;
    const original = r.wctx.drawImage;
    let draws = 0;
    r.wctx.drawImage = function(source, ...args) {
      if (source === roof) draws++;
      return original.call(this, source, ...args);
    };
    const edges = [];
    try {
      // Footprint just below the view, plus partially visible side-edge towers.
      for (const [dx, dy] of [[100, r.viewH + 10], [-20, 180], [r.viewW - 10, 180]]) {
        r.camX = 30 * 16 - dx; r.camY = 30 * 16 - dy;
        draws = 0; r.render(g, ui); edges.push(draws);
      }
    } finally { r.wctx.drawImage = original; }
    return { assets, edges, unchanged: state === JSON.stringify([...g.buildings.values()]) };
  });
  assert.equal(result.assets.length, 29, 'all non-road building types reviewed');
  for (const a of result.assets) {
    assert.deepEqual(a.roof, a.expected, `${a.type}: original footprint`);
    assert.deepEqual(a.emit, a.expected, `${a.type}: separate aligned emitter`);
    assert.equal(a.sameLayers, false, `${a.type}: emissive is not daytime art`);
    if (a.facade) assert.deepEqual(a.facade.slice(0, 2), a.facade.slice(2), `${a.type}: facade alignment`);
  }
  assert.equal(new Set(result.assets.map((a) => a.image)).size, result.assets.length);
  assert.ok(result.unchanged, 'rendering preserves building state');
  assert.ok(result.edges.every((n) => n > 0), `projected arcology visible at all edges: ${result.edges}`);
  assert.deepEqual(errors, []);
  console.log('PASS all 29 building atlases, unique art, footprint/emissive geometry, preserved state and projected viewport-edge visibility');
} finally { await browser.close(); }
