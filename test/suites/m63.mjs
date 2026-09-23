// Ground art contracts, checked on the atlases and cache in the built game.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const browser = await chromium.launch(launchOptions);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:4173');
  await pastBoot(page);
  await page.evaluate(() => { window.__game.speed = 0; });
  const art = await page.evaluate(() => {
    const r = window.__renderer, t = r.terrain;
    const pixels = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const dominant = (c) => {
      const d = pixels(c), counts = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return Math.max(...counts.values()) / (d.length / 4);
    };
    const a = pixels(t.water[0]), b = pixels(t.water[1]);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4)
      if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) changed++;
    const shores = (t.shore || []).map((c, mask) => {
      const d = pixels(c), alpha = (x, y) => d[(y * 16 + x) * 4 + 3];
      return { mask, center: alpha(8, 8), edges: [alpha(8, 0), alpha(15, 8), alpha(8, 15), alpha(0, 8)] };
    });
    const pixel = (c, x, y) => [...c.getContext('2d').getImageData(x, y, 1, 1).data];
    return {
      quiet: t.grass.map(dominant), changed,
      forestDistinct: t.forest[0].toDataURL() !== t.grass[0].toDataURL(),
      treeDistinct: t.tree[0].toDataURL() !== t.treeDead[0].toDataURL(), shores,
      roads: r.roads.map((row) => row.length),
      clearJunctions: [1, 2, 3].every((type) => JSON.stringify(pixel(r.roads[type][15], 8, 8))
        === JSON.stringify(pixel(r.roads[type][15], 4, 4))),
      bridgeMargins: [pixel(r.roads[4][5], 0, 8)[3], pixel(r.roads[4][10], 8, 0)[3]],
      bridgeDecks: [pixel(r.roads[4][5], 8, 8)[3], pixel(r.roads[4][10], 8, 8)[3]],
    };
  });
  assert.ok(art.quiet.every((n) => n > 0.8), `grass has quiet masses: ${art.quiet}`);
  assert.ok(art.changed > 0 && art.changed < 24, `water changes only ripples: ${art.changed}/256`);
  assert.ok(art.forestDistinct && art.treeDistinct);
  assert.equal(art.shores.length, 16);
  for (const s of art.shores) {
    assert.equal(s.center, 0, 'shore keeps open-water interior transparent');
    s.edges.forEach((alpha, edge) => assert.equal(alpha, s.mask & (1 << edge) ? 255 : 0));
  }
  assert.deepEqual(art.roads, [16, 16, 16, 16, 16]);
  assert.ok(art.clearJunctions, 'paved junctions have a clear conflict area');
  assert.deepEqual(art.bridgeMargins, [0, 0]);
  assert.deepEqual(art.bridgeDecks, [255, 255]);
  console.log('PASS quiet terrain, coherent animated water, distinct vegetation, 16 shore masks, 80 road masks and transparent bridge margins');

  const cache = await page.evaluate(() => {
    const api = window.__api, r = window.__renderer;
    const g = api.newGame(90210, 'verdant');
    const mapBefore = JSON.stringify(g.map);
    r.resetSession(); r.syncTerrainCache(g);
    const unchanged = mapBefore === JSON.stringify(g.map);
    let candidate = -1;
    for (let i = g.mapW + 1; i < g.map.length - g.mapW - 1; i++) {
      if (g.map[i].terrain === 'rock' && g.map[i - 1].terrain === 'grass'
        && !g.map[i - 1].road && i % g.mapW > 0) { candidate = i; break; }
    }
    if (candidate < 0) throw new Error('No rock/grass boundary to exercise');
    const before = r.terrainCache.toDataURL();
    g.resources.capital = 1e6;
    api.clearRock(g, candidate % g.mapW, Math.floor(candidate / g.mapW));
    r.syncTerrainCache(g);
    const incremental = r.terrainCache.toDataURL();
    g.dirtyTiles = null; r.syncTerrainCache(g);
    return { unchanged, changed: before !== incremental, equal: incremental === r.terrainCache.toDataURL() };
  });
  assert.ok(cache.unchanged, 'rendering does not rewrite terrain');
  assert.ok(cache.changed, 'clearing rock changes the ground image');
  assert.ok(cache.equal, 'incremental cardinal-edge repaint equals a full cache rebuild');
  assert.deepEqual(errors, []);
  console.log('PASS real rock clearance invalidates adjacent ground correctly; rendering preserves the map; no page errors');
} finally { await browser.close(); }
