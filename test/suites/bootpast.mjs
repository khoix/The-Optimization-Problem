// Shared by every suite that predates M50: get past the boot screen the way a
// player does. Two real presses at most — the first settles the intro if it is
// still playing, the second answers the prompt — then wait for the screen to
// take itself off the page.
//
// Deliberately a no-op when there is no `#boot`, so the same harness runs
// against the pre-M50 build in a counterfactual without being rewritten.
export async function pastBoot(page) {
  if (!(await page.locator('#boot').count())) return false;
  await page.waitForFunction(() => window.__boot?.loaded(), null, { timeout: 20000 }).catch(() => {});
  for (let i = 0; i < 3 && (await page.locator('#boot').count()); i++) {
    await page.mouse.click(30, 30).catch(() => {});
    await page.waitForTimeout(240);
  }
  await page.waitForSelector('#boot', { state: 'detached', timeout: 6000 }).catch(() => {});
  return true;
}
