// Visual foundation: fixed states must really render, and repeat independently.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { captureScene, scenes } from '../visual-review.mjs';

const browser = await chromium.launch(launchOptions);
try {
  const viewport = { width: 1340, height: 860 };
  const early = await captureScene(browser, scenes.early, viewport);
  const repeat = await captureScene(browser, scenes.early, viewport);
  assert.equal(early.stateHash, repeat.stateHash);
  assert.equal(early.canvasHash, repeat.canvasHash);
  console.log('PASS fixed seed, state, camera and animation reproduce the same canvas');
  const night = await captureScene(browser, scenes.night, viewport);
  assert.notEqual(early.canvasHash, night.canvasHash);
  assert.ok(night.buildings > early.buildings);
  console.log('PASS populated night scene differs from the founding daytime scene');
  for (const name of ['rain', 'snow', 'late', 'observer']) {
    const result = await captureScene(browser, scenes[name], { width: 390, height: 844 });
    if (name === 'snow') assert.equal(result.snowing, true);
    if (name === 'rain') assert.equal(result.snowing, false);
    assert.ok(result.canvasHash);
    console.log(`PASS phone ${name}: real renderer, expected state, no page errors or overflow`);
  }
} finally { await browser.close(); }
