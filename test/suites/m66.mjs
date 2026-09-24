// Lighting transitions use the real renderer without advancing simulation.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { captureScene, lightingScenes } from '../visual-review.mjs';

const browser = await chromium.launch(launchOptions);
try {
  for (const viewport of [{ width: 1340, height: 860 }, { width: 390, height: 844 }]) {
    const result = await captureScene(browser, { ...lightingScenes.midnight, profile: true }, viewport);
    assert.equal(result.profile.samples.length, 12);
    assert.ok(result.profile.samples.every((s) => s.total > 0 && Number.isFinite(s.total)));
    assert.ok(result.profile.samples.some((s) => s.passes['· bloom'] > 0), 'existing pass profiler runs');
    assert.ok(result.profile.worldPixels <= 4_400_000, 'world buffer budget preserved');
    assert.equal(result.profile.buffers.length, 6, 'no extra effect buffers');
    assert.equal(result.transitions.length, 15);
    const samples = result.transitions;
    assert.ok(Math.abs(samples[0].night - samples[1].night) < 0.0001, 'dawn eases out of night');
    assert.ok(Math.abs(samples[2].night - samples[3].night) < 0.0001, 'dawn eases into daylight');
    assert.ok(Math.abs(samples[5].night - samples[6].night) < 0.0001, 'dusk eases into night');
    assert.ok(new Set(samples.map((s) => s.canvasHash)).size > 5, 'transitions actually redraw');
    for (const index of [1, 3, 6, 8, 10])
      assert.ok(samples[index].meanDelta < 3, 'nearby light/weather samples avoid visible full-frame jumps');
    assert.ok(new Set(samples.slice(11).map((s) => s.canvasHash)).size > 1,
      'environment and light animation advances at a fixed simulation hour');
    console.log(`PASS ${viewport.width}px lighting transitions, state preservation, real pass timings and buffer ceiling`);
  }
} finally { await browser.close(); }
