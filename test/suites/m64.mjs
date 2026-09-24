// Compute facades keep sealed material and cool emitters separate from albedo.
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
  const results = await page.evaluate(() => {
    window.__game.speed = 0;
    const r = window.__renderer;
    const types = ['edge_dc', 'cloud_dc', 'ai_campus', 'gov_dc', 'med_dc', 'community_dc'];
    return types.map((type) => {
      const f = r.facadeFor(type), roof = r.buildings.get(type).albedo;
      const pixels = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const a = pixels(f.albedo), e = pixels(f.emissive);
      let lights = 0, warm = 0, saturatedDay = 0;
      for (let i = 0; i < e.length; i += 4) {
        if (e[i + 3]) { lights++; if (e[i] >= e[i + 2]) warm++; }
        if (a[i] > 180 || a[i + 1] > 180 || a[i + 2] > 180) saturatedDay++;
      }
      return { type, width: f.albedo.width, roofWidth: roof.width,
        height: f.height, emitterHeight: f.emissive.height,
        lights, warm, saturatedDay, image: f.albedo.toDataURL() };
    });
  });
  for (const r of results) {
    assert.equal(r.width, r.roofWidth, `${r.type}: footprint width preserved`);
    assert.equal(r.height, r.emitterHeight, `${r.type}: aligned emissive geometry`);
    assert.ok(r.lights > 0, `${r.type}: visible status emitters`);
    assert.equal(r.warm, 0, `${r.type}: cool compute lighting`);
    assert.equal(r.saturatedDay, 0, `${r.type}: no bright lights baked into albedo`);
  }
  assert.equal(new Set(results.map((r) => r.image)).size, 6, 'each compute class has distinct facade geometry');
  assert.deepEqual(errors, []);
  console.log('PASS all six compute facades: footprint widths, aligned emitters, distinct geometry, dark albedo, cool lights, no page errors');
} finally { await browser.close(); }
