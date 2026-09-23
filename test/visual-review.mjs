// Fixed art-review fixtures, driven through the same built game as the suites.
// These are staged visual states, not claims about a viable economic strategy.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchOptions } from './suites/browser.mjs';
import { pastBoot } from './suites/bootpast.mjs';

export const scenes = {
  early: { dense: false, hour: 12, rain: 0, tick: 6, phase: 0 },
  dense: { dense: true, hour: 12, rain: 0, tick: 246, phase: 2 },
  night: { dense: true, hour: 23, rain: 0, tick: 246, phase: 2 },
  rain: { dense: true, hour: 15, rain: 0.8, tick: 246, phase: 2 },
  snow: { dense: true, hour: 15, rain: 0.8, tick: 240, phase: 2 },
  late: { dense: true, hour: 12, rain: 0, tick: 486, phase: 5 },
  observer: { dense: true, hour: 12, rain: 0, tick: 606, phase: 6 },
};
export const surfaceScenes = Object.fromEntries(
  ['verdant', 'sunbelt', 'rustbelt', 'coast'].flatMap((scenario) =>
    [0.5, 2, 4].map((zoom) => [`${scenario}-${zoom}`, { ...scenes.early, scenario, zoom, shore: scenario !== 'sunbelt' }])),
);
for (const overlay of ['power', 'water', 'roads', 'pollution'])
  surfaceScenes[`overlay-${overlay}`] = { ...scenes.early, overlay };
for (const preview of ['place', 'replace', 'blocked', 'demolish'])
  surfaceScenes[`preview-${preview}`] = { ...scenes.early, preview };
const viewports = {
  desktop: { width: 1340, height: 860 },
  phone: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
};
const hash = (value) => createHash('sha256').update(value).digest('hex');

export async function captureScene(browser, scene, viewport, output) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1,
    hasTouch: viewport.width < 900, isMobile: viewport.width < 900,
    reducedMotion: 'reduce' });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.goto('http://localhost:4173');
    await pastBoot(page);
    await page.waitForFunction(() => !!window.__api);
    // Freeze RAF, timers and wall time, then draw a fixed number of updates.
    // Pausing game speed alone still advances renderer animation and weather.
    await page.clock.install({ time: new Date('2026-01-01T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-01-01T12:00:01Z'));
    const metadata = await page.evaluate((config) => {
      const api = window.__api, g = window.__game, r = window.__renderer;
      const next = api.newGame(90210, config.scenario || 'verdant');
      for (const key of Object.keys(g)) if (!(key in next)) delete g[key];
      Object.assign(g, next);
      api.invalidateNetwork(g);
      const cx = Math.floor(g.mapW * 0.52), cy = Math.floor(g.mapH * 0.5);
      const placed = [];
      if (config.dense) {
        const types = ['highrise', 'apartment', 'office', 'cloud_dc', 'hospital',
          'factory', 'school', 'park', 'ai_campus', 'nuclear_plant', 'arcology', 'water_plant'];
        // Fill valid sites around the founding town; never flatten its terrain.
        for (let y = cy - 18; y <= cy + 18; y += 6) {
          for (let x = cx - 18; x <= cx + 18; x += 6) {
            const type = types[placed.length % types.length];
            if (!api.canPlace(g, type, x, y)) continue;
            const b = api.placeBuilding(g, type, x, y, { free: true, instant: true });
            if (!b) throw new Error(`Fixture failed to place ${type}`);
            placed.push(type);
            for (let dx = 0; dx < 6; dx++) {
              if (api.canPlace(g, 'road', x + dx, y + 5))
                api.placeBuilding(g, 'road', x + dx, y + 5, { free: true });
            }
          }
        }
      }
      g.tick = config.tick; g.speed = 0; g.pendingEvent = null;
      g.asi.phase = config.phase; g.asi.emergence = config.phase * 16;
      g.asi.observer = config.phase === 6; g.asi.phaseTick = 486;
      // Commissioned art fixtures: illuminate the material set independently
      // of economic viability. Simulation invariants remain in the M57 suite.
      for (const b of g.buildings.values()) { b.active = true; b.age = config.dense ? 80 : 0; }
      r.resetSession();
      r.setZoomDirect(config.zoom || 2, innerWidth / 2, innerHeight / 2);
      r.centerOn(cx, cy);
      if (config.shore) {
        // Pick an actual inland shoreline, not empty ocean or a map corner.
        const candidates = g.map.map((t, i) => ({ t, i }))
          .filter(({ t, i }) => t.terrain === 'water' && i % g.mapW > 5
            && i % g.mapW < g.mapW - 5 && i > g.mapW * 5 && i < g.mapW * (g.mapH - 5)
            && g.map[i - 1].terrain !== 'water');
        candidates.sort((a, b) => Math.abs(a.i % g.mapW - cx) + Math.abs(Math.floor(a.i / g.mapW) - cy)
          - Math.abs(b.i % g.mapW - cx) - Math.abs(Math.floor(b.i / g.mapW) - cy));
        if (!candidates.length) throw new Error('No shoreline in scenario');
        r.centerOn(candidates[0].i % g.mapW, Math.floor(candidates[0].i / g.mapW));
      }
      r.hour = config.hour;
      const snow = config.tick % 12 < 2;
      const originalRandom = Math.random;
      let seed = 24680;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      try {
        for (let i = 0; i < 120; i++)
          r.life.update(g, 1 / 30, config.rain, r.nightFactor(), snow);
      } finally { Math.random = originalRandom; }
      r.rain = config.rain; r.snowing = snow && config.rain > 0;
      window.__ui.resetSession();
      if (g.asi.observer) document.querySelector('#obs-continue').click();
      const uiState = { hoverTile: null, cursorWorld: null, xrayRadial: false,
        buildType: null, buildTile: null, canPlaceHere: false, buildReplaces: false,
        demolish: null, selectedBuildingId: null, overlay: config.overlay || null };
      if (config.overlay === 'pollution') {
        for (let y = cy - 5; y <= cy + 5; y++) for (let x = cx - 5; x <= cx + 5; x++)
          g.map[y * g.mapW + x].pollution = 0.35;
      }
      if (config.preview) {
        let target;
        for (let y = cy - 4; y < cy + 4 && !target; y++) for (let x = cx - 6; x < cx + 6; x++) {
          const t = g.map[y * g.mapW + x];
          const road = config.preview !== 'place';
          if (road ? t.road : api.canPlace(g, 'avenue', x, y) && !t.road) { target = [x, y]; break; }
        }
        if (!target) throw new Error('No preview site');
        if (config.preview === 'demolish') uiState.demolish = { x: target[0], y: target[1], w: 1, h: 1, kind: 'remove', buildingId: null };
        else Object.assign(uiState, { buildType: config.preview === 'blocked' ? 'house' : 'avenue',
          buildTile: target, canPlaceHere: config.preview !== 'blocked', buildReplaces: config.preview === 'replace' });
      }
      r.render(g, uiState);
      const canvas = document.querySelector('#game');
      return { seed: g.seed, scenario: g.scenario, tick: g.tick, phase: g.asi.phase,
        observer: g.asi.observer, hour: r.hour, rain: r.rain, snowing: r.snowing,
        buildings: g.buildings.size, placed, agents: r.life.agents.length,
        particles: r.life.particles.length, zoom: r.zoom, camera: [r.camX, r.camY],
        body: document.body.className, canvas: canvas.toDataURL(),
        state: JSON.stringify([...g.buildings.values()]),
        overflow: document.documentElement.scrollWidth > innerWidth };
    }, scene);
    assert.equal(metadata.phase, scene.phase);
    assert.equal(metadata.hour, scene.hour);
    assert.equal(metadata.rain, scene.rain);
    assert.equal(metadata.observer, scene.phase === 6);
    if (scene.zoom) assert.equal(metadata.zoom, scene.zoom, 'requested review zoom is actually reached');
    assert.ok(metadata.buildings >= 15, 'founding settlement exists');
    if (scene.dense) assert.ok(metadata.placed.length >= 24, 'dense scene populated');
    if (scene.rain) assert.ok(metadata.particles > 0, 'precipitation is populated');
    if (scene.phase >= 4) assert.match(metadata.body, /phase4/);
    if (scene.phase === 6) assert.match(metadata.body, /observer/);
    assert.equal(metadata.overflow, false, 'viewport has no document overflow');
    assert.deepEqual(errors, [], 'no browser errors');
    const { canvas, state, ...manifest } = metadata;
    manifest.canvasHash = hash(canvas);
    manifest.stateHash = hash(state);
    if (output) await page.screenshot({ path: output, animations: 'disabled' });
    return manifest;
  } finally { await ctx.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.env.VISUAL_REVIEW_DIR || 'artifacts/visual-review');
  const catalog = process.env.VISUAL_SURFACES ? surfaceScenes : scenes;
  const sceneNames = process.env.VISUAL_SCENES?.split(',') || Object.keys(catalog);
  for (const name of sceneNames) assert.ok(catalog[name], `Unknown scene: ${name}`);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch(launchOptions);
  const manifest = { seed: 90210, captures: [] };
  try {
    // 1280×800 fits the renderer's world-buffer budget at a true 0.5× overview.
    for (const [view, viewport] of Object.entries(process.env.VISUAL_SURFACES ? { desktop: { width: 1280, height: 800 } } : viewports)) {
      for (const name of sceneNames) {
        const file = `${view}-${name}.png`;
        const result = await captureScene(browser, catalog[name], viewport, resolve(out, file));
        manifest.captures.push({ file, viewport, ...result });
        console.log(`PASS ${file}: ${result.buildings} buildings, ${result.canvasHash.slice(0, 12)}`);
      }
    }
    const first = manifest.captures[0];
    const repeat = await captureScene(browser, catalog[sceneNames[0]], first.viewport);
    assert.equal(repeat.canvasHash, first.canvasHash, 'repeated fixture renders identically');
    assert.equal(repeat.stateHash, first.stateHash, 'repeated fixture state is identical');
    await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    await writeFile(resolve(out, 'index.html'), '<!doctype html><meta charset="utf-8"><title>Visual review</title>'
      + '<style>body{background:#10141e;color:#d8dee8;font:16px system-ui;margin:24px}img{max-width:100%;height:auto}figure{margin:24px 0}</style>'
      + '<h1>Visual review · seed 90210</h1><p>Staged art fixtures; see manifest.json for exact state.</p>'
      + manifest.captures.map((c) => `<figure><figcaption>${c.file}</figcaption><a href="${c.file}"><img src="${c.file}" loading="lazy"></a></figure>`).join(''));
    console.log(`PASS deterministic replay; ${manifest.captures.length} captures in ${out}`);
  } finally { await browser.close(); }
}
