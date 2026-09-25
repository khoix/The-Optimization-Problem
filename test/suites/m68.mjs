// Fixed-base volume integration, against the production bundle.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ts from 'typescript';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

// Pure geometry has no DOM dependency; compile the same source with the
// project's TypeScript dependency, then verify the production bundle below.
const code = ts.transpileModule(await readFile(new URL('../../src/render/volume.ts', import.meta.url), 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { projectVolume, projectHeightVector, intersectsViewport } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const base = { x: 100, y: 150, w: 64, h: 48 };
for (const [x, y] of [[-20, -50], [20, -50], [-20, 50], [20, 50], [0, -50], [0, 0]]) {
  const v = projectVolume(base, 50, { x, y });
  assert.deepEqual(v.base, base, 'optical shift never changes the base');
  assert.deepEqual(v.top, { ...base, x: base.x + x, y: base.y + y });
  for (const f of v.faces) {
    assert.deepEqual(f.corners[0], { x: f.corners[3].x + x, y: f.corners[3].y + y });
    assert.deepEqual(f.corners[1], { x: f.corners[2].x + x, y: f.corners[2].y + y });
    for (const p of f.corners) assert.ok(p.x >= v.bounds.x && p.x <= v.bounds.x + v.bounds.w
      && p.y >= v.bounds.y && p.y <= v.bounds.y + v.bounds.h);
  }
  assert.deepEqual(v.faces.map((f) => f.visible), [y > 0, x < 0, y < 0, x > 0]);
}
const flat = projectVolume(base, 0, { x: 20, y: -50 });
assert.deepEqual(flat.base, flat.top); assert.ok(flat.faces.every((f) => !f.visible));
assert.equal(intersectsViewport(projectVolume(base, 100, { x: 0, y: -100 }), 200, 100), true);
assert.deepEqual(projectHeightVector({ x: 0, y: 0, w: 20, h: 20 }, 50, 200, 200), { x: -17, y: -57 });
console.log('PASS pure geometry: fixed bases, top vectors, connecting faces, bounds, zero height, axis visibility, top-only culling');

const browser = await chromium.launch(launchOptions);
const output = process.env.PARALLAX_REVIEW_DIR;
if (output) await mkdir(output, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173'); await pastBoot(page);
  await page.locator('#t-new').click();
  await page.locator('.region-card').first().click();
  await page.locator('.bar-tool[data-panel="indicators"]').waitFor({ state: 'visible' });
  const decision = page.locator('.modal:not(.hidden) .modal-choices button').first();
  if (await decision.isVisible()) await decision.click();
  await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T12:01:00Z'));
  const results = [];
  for (const zoom of [2, 4]) for (const hour of [12, 23]) {
    for (const position of ['left', 'right', 'top', 'bottom']) {
      const result = await page.evaluate(({ zoom, hour, position }) => {
        const g = window.__game, api = window.__api, r = window.__renderer;
        Object.assign(g, api.newGame(90210, 'verdant'));
        g.buildings.clear(); g.speed = 0; g.pendingEvent = null;
        for (const t of g.map) { t.terrain = 'grass'; t.road = false; t.buildingId = -1; }
        for (const [type, x, y] of [['arcology', 50, 50], ['house', 46, 50], ['factory', 56, 50]]) {
          const b = api.placeBuilding(g, type, x, y, { free: true, instant: true });
          if (!b) throw new Error(`Missing ${type}`);
          b.active = true;
        }
        // Stationary trees and road markers on all sides of the reference tower.
        for (const [x, y] of [[48, 48], [56, 48], [48, 55], [56, 55]]) g.map[y * g.mapW + x].terrain = 'forest';
        for (const [x, y] of [[50, 48], [50, 56], [48, 52], [55, 52]]) api.placeBuilding(g, 'road', x, y, { free: true });
        api.touchMap(g); api.invalidateNetwork(g); r.resetSession();
        r.setZoomDirect(zoom, 640, 400); r.hour = hour;
        const W = r.viewW, H = r.viewH;
        const dx = position === 'left' ? 48 : position === 'right' ? W - 150 : W / 2 - 32;
        const dy = position === 'top' ? 80 : position === 'bottom' ? H + 8 : H / 2 - 32;
        r.camX = 800 - dx; r.camY = 800 - dy;
        const state = JSON.stringify([...g.buildings.values()]);
        const references = [...g.buildings.values()].filter((b) => ['house', 'factory', 'arcology'].includes(b.type));
        const walls = references.map((b) => ({ type: b.type, source: r.facadeFor(b.type).albedo,
          expected: [[b.x * 16 - r.camX, (b.y + api.BUILDING_DEFS[b.type].h) * 16 - r.camY],
            [(b.x + api.BUILDING_DEFS[b.type].w) * 16 - r.camX, (b.y + api.BUILDING_DEFS[b.type].h) * 16 - r.camY]], edges: [] }));
        const facade = r.facadeFor('arcology').albedo;
        const original = r.wctx.drawImage, bases = [];
        let faceEmitters = 0;
        r.wctx.drawImage = function(source, ...args) {
          if (source === r.facadeFor('arcology').emissive) faceEmitters++;
          const wall = walls.find((wall) => wall.source === source);
          if (wall) {
            const [x, y, w = source.width, h = source.height] = args;
            const m = this.getTransform();
            const p = (xx, yy) => [m.a * xx + m.c * yy + m.e, m.b * xx + m.d * yy + m.f];
            const edge = [p(x, y + h), p(x + w, y + h)];
            wall.edges.push(edge);
            if (source === facade) bases.push(edge);
          }
          return original.call(this, source, ...args);
        };
        const ui = { hoverTile: null, cursorWorld: null, xrayRadial: false,
          buildType: null, buildTile: null, canPlaceHere: false, buildReplaces: false,
          demolish: null, selectedBuildingId: null, overlay: null };
        let repeated;
        try {
          r.render(g, ui); const first = document.querySelector('#game').toDataURL();
          r.render(g, ui); repeated = first === document.querySelector('#game').toDataURL();
        }
        finally { r.wctx.drawImage = original; }
        const d = api.BUILDING_DEFS.arcology;
        return { bases, repeated, faceEmitters, walls: walls.map(({ source, ...wall }) => wall),
          expected: [[dx, dy + d.h * 16], [dx + d.w * 16, dy + d.h * 16]],
          unchanged: state === JSON.stringify([...g.buildings.values()]),
          volume: r.volumeFor ? r.volumeFor('arcology', dx, dy) : null };
      }, { zoom, hour, position });
      if (output) await page.screenshot({ path: resolve(output, `${zoom}-${hour}-${position}.png`) });
      results.push({ zoom, hour, position, ...result });
    }
  }
  for (const r of results) {
    assert.ok(r.bases.length > 0, `${r.position}: projected wall survives edge culling`);
    for (const edge of r.bases) for (let i = 0; i < 2; i++) for (let axis = 0; axis < 2; axis++)
      assert.ok(Math.abs(edge[i][axis] - r.expected[i][axis]) < 0.001,
        `${r.position} ${r.zoom}x: facade base ${JSON.stringify(edge)} must anchor at ${JSON.stringify(r.expected)}`);
    assert.ok(r.unchanged, 'projection preserves simulation state');
    assert.ok(r.repeated, 'fixed state and camera render deterministically');
    assert.equal(r.faceEmitters > 0, r.hour === 23, 'face emitters light at night, not in daylight');
    for (const wall of r.walls) for (const edge of wall.edges)
      for (let i = 0; i < 2; i++) for (let axis = 0; axis < 2; axis++)
        assert.ok(Math.abs(edge[i][axis] - wall.expected[i][axis]) < 0.001, `${wall.type}: anchored wall`);
  }
  for (const type of ['house', 'factory', 'arcology'])
    assert.ok(results.some((r) => r.walls.some((w) => w.type === type && w.edges.length)), `${type} actually rendered`);
  assert.deepEqual(errors, []);
  console.log('PASS fixed facade bases, pan axes, day/night, 2x/4x, projected-edge culling, unchanged state');
} finally { await browser.close(); }
