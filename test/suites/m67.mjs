// E5: presentation is checked through the controls a player actually presses.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const browser = await chromium.launch(launchOptions);
const output = process.env.UI_REVIEW_DIR;
if (output) await mkdir(output, { recursive: true });
const viewports = [
  ['desktop', 1340, 860, false], ['narrow', 960, 700, false],
  ['phone', 390, 844, true], ['landscape', 740, 380, true],
];
const requested = process.env.UI_REVIEW_VIEWPORT;
if (requested) assert.ok(viewports.some(([name]) => name === requested), 'known review viewport');
try {
  for (const [name, width, height, touch] of viewports.filter(([name]) => !requested || requested === name)) {
    const context = await browser.newContext({ viewport: { width, height },
      hasTouch: touch, isMobile: touch, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const shot = async (label) => {
      if (output) await page.screenshot({ path: resolve(output, `${name}-${label}.png`) });
    };
    const fit = async (selector) => {
      const state = await page.locator(selector).evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, right: r.right, bottom: r.bottom,
          width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.ok(state.top >= -1 && state.left >= -1 && state.right <= state.width + 1
        && state.bottom <= state.height + 1 && !state.overflow, `${name} ${selector}: ${JSON.stringify(state)}`);
    };
    await page.goto('http://localhost:4173');
    await pastBoot(page);
    await page.locator('#t-settings').waitFor();
    await shot('title');
    await page.locator('#t-how').click();
    await fit('.guide-box');
    await shot('guide');
    if (name === 'landscape') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => {
        const canvas = document.querySelector('.guide-canvas');
        return canvas.width > 0 && canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight;
      });
      await fit('.guide-box');
      await page.setViewportSize({ width, height });
      await fit('.guide-box');
    }
    await page.locator('.guide-skip').click();
    await page.locator('#t-settings').click();
    await fit('.modal:not(.hidden) .modal-box');
    await shot('settings');
    await page.locator('.modal:not(.hidden) .modal-choices button').last().click();
    await page.locator('#t-new').click();
    await fit('.modal:not(.hidden) .modal-box');
    assert.equal(await page.locator('.region-card').count(), 4);
    await shot('regions');
    await page.locator('.region-card').first().click();
    await page.locator('.bar-tool[data-panel="indicators"]').waitFor({ state: 'visible' });
    const decision = page.locator('.modal:not(.hidden) .modal-choices button').first();
    if (await decision.isVisible()) await decision.click();
    await page.evaluate(() => { window.__game.speed = 0; });
    await fit('.civic-bar');
    await shot('civic');
    const early = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--control-accent').trim());
    assert.ok(early, 'the civic control accent is explicit');
    assert.equal(await page.locator('.vital-num').first().evaluate((el) => getComputedStyle(el).fontVariantNumeric), 'tabular-nums');
    for (const panel of ['transit', 'indicators', 'policies', 'compute_alloc', 'politics']) {
      const button = page.locator(`.bar-tool[data-panel="${panel}"]`).first();
      assert.equal(await button.count(), 1, `${panel} control exists`);
      await button.scrollIntoViewIfNeeded();
      await button.click();
      await fit('.flyout:not(.hidden)');
      await shot(panel);
      await page.locator('.flyout-close').click();
    }
    // The first .bar-tool is an invisible spacer, not an interactive control.
    // Use keyboard modality before focusing the actual road category.
    await page.keyboard.press('Shift');
    await page.locator('.bar-tool[data-panel="transit"]').focus();
    assert.equal(await page.locator('.bar-tool[data-panel="transit"]').evaluate((el) => getComputedStyle(el).outlineStyle), 'solid');
    for (const phase of [4, 5, 6]) {
      await page.evaluate((phase) => {
        const g = window.__game;
        g.asi.phase = phase; g.asi.observer = phase === 6; g.asi.phaseTick = g.tick;
        window.__ui.refresh();
      }, phase);
      await page.waitForFunction((phase) => document.body.classList.contains(phase === 6 ? 'observer' : `phase${phase}`), phase);
      if (phase === 6) {
        await page.locator('#obs-continue').click();
        await fit('.observer-ticker');
        assert.equal(await page.locator('.observer-ticker').evaluate((el) => el.scrollWidth > el.clientWidth), false,
          `${name}: observer status is not clipped`);
      }
      const accent = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--control-accent').trim());
      assert.notEqual(accent, early, 'system authority has a distinct control accent');
      await fit('.civic-bar');
      await shot(`phase-${phase}`);
    }
    const animated = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
    assert.equal(animated, 0, 'reduced motion removes interface animation');
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}: title, settings, regions, civic panels, focus, phase 4/5/observer, reduced motion`);
    await context.close();
  }
} finally { await browser.close(); }
