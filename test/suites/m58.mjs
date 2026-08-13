// M58 — regions that leave the browser they were built in.
//
//   A. a region exports, imports, and is the same region on the other side
//   B. the file is named after what is in it
//   C. every way a file can be wrong is refused, with a reason
//   D. a file that is the right shape and full of lies is refused too
//   E. text out of a region file cannot become markup
//   F. the menus offer it, and the empty state offers it too
//
// The file picker is the one control a browser will not let a script fill in,
// so the round trip is driven through `__api` — which holds exactly the
// functions the buttons call. The buttons themselves are checked for being
// there and reaching the right code, which is the part a probe can see.
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const fresh = async (boot = 'new:verdant') => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:4173');
  await page.evaluate((b) => { localStorage.clear(); localStorage.setItem('top:boot', b); }, boot);
  await page.reload();
  await page.waitForTimeout(1200);
  await pastBoot(page);
  for (let i = 0; i < 8; i++) {
    const b = page.locator('.modal:not(.hidden) .choice-btn').first();
    if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(120); }
    else break;
  }
  await page.evaluate(() => { window.__game.speed = 0; });
  return { ctx, page };
};

// A region with something in it: months of history, buildings, roads, alerts.
const PLAY = `(() => {
  const api = window.__api, g = window.__game;
  for (let m = 0; m < 90; m++) {
    if (g.pendingEvent) api.resolveEvent(g, 0);
    g.pendingReport = null;
    if (g.resources.capital < 3000) g.resources.capital += 6000;
    const types = ['house', 'house', 'park', 'solar_array', 'water_plant', 'retail', 'school'];
    const type = types[m % types.length];
    const d = api.BUILDING_DEFS[type];
    outer: for (let y = 1; y < g.mapH - d.h - 1; y++) {
      for (let x = 1; x < g.mapW - d.w - 1; x++) {
        let near = false;
        for (let yy = y - 1; yy <= y + d.h && !near; yy++) {
          for (let xx = x - 1; xx <= x + d.w && !near; xx++) {
            if (xx < 0 || yy < 0 || xx >= g.mapW || yy >= g.mapH) continue;
            if (g.map[yy * g.mapW + xx].road) near = true;
          }
        }
        if (near && api.canPlace(g, type, x, y)) { api.placeBuilding(g, type, x, y); break outer; }
      }
    }
    api.simTick(g);
  }
  return { tick: g.tick, buildings: g.buildings.size, history: g.history.length,
    notifications: g.notifications.length, pop: Math.round(g.population) };
})()`;

// ================== A. THE ROUND TRIP
{
  const { ctx, page } = await fresh();
  const built = await page.evaluate(PLAY);
  check('The region exported is a region worth exporting',
    built.tick === 90 && built.buildings > 20 && built.history > 5 && built.notifications > 0,
    `t${built.tick}, ${built.buildings} buildings, ${built.history} history entries, ${built.notifications} alerts, pop ${built.pop}`);

  const trip = await page.evaluate(() => {
    const api = window.__api, g = window.__game;
    const text = api.exportRegion(api.serialize(g));
    const res = api.importRegion(text);
    if (!res.ok) return { error: res.reason };
    api.writeEnvelope('top:save', res.env);
    const back = api.loadFrom('top:save');
    if (!back) return { error: 'the imported slot would not load' };
    const shot = (s) => ({
      tick: s.tick, seed: s.seed, scenario: s.scenario, pop: s.population,
      buildings: [...s.buildings.values()].sort((a, b) => a.id - b.id)
        .map((b) => [b.id, b.type, b.x, b.y, b.progress, b.active ? 1 : 0, b.age].join(',')).join(';'),
      roads: s.map.filter((t) => t.road).length,
      terrain: s.map.map((t) => t.terrain + t.variant + (t.road ? t.roadType : '-') + ':' + t.buildingId).join('|'),
      history: s.history.map((h) => h.tick + h.kind + h.text).join('\n'),
      notifications: s.notifications.map((n) => [n.id, n.seq, n.tick, n.kind, n.severity, n.text].join('~')).join('\n'),
      policies: [...s.policies].sort().join(','),
      indicators: Object.keys(s.indicators).sort().map((k) => k + '=' + s.indicators[k]).join(','),
      asi: [s.asi.phase, s.asi.emergence, s.asi.observer].join('|'),
    });
    const a = shot(g), b = shot(back);
    return {
      bytes: text.length,
      differing: Object.keys(a).filter((k) => String(a[k]) !== String(b[k])),
      fields: Object.keys(a).length,
      roads: a.roads, buildings: [...g.buildings.values()].length,
      // The file has to actually be a file, not an object reference.
      isText: typeof text === 'string',
      parsed: JSON.parse(text).magic,
    };
  });
  check('A region survives export and import intact', !trip.error && trip.differing?.length === 0,
    trip.error ?? (trip.differing.length
      ? 'differed in: ' + trip.differing.join(', ')
      : `${trip.fields} fields identical across ${Math.round(trip.bytes / 1024)}KB of file — ${trip.buildings} buildings, ${trip.roads} road tiles`));
  check('The file is text, and says what it is',
    trip.isText === true && trip.parsed === 'the-optimization-problem/region',
    `magic ${JSON.stringify(trip.parsed)}, ${Math.round((trip.bytes ?? 0) / 1024)}KB`);

  // ================== B. THE NAME
  const named = await page.evaluate(() => {
    const api = window.__api, g = window.__game;
    const env = api.serialize(g);
    return { name: api.regionFilename(env), year: Math.floor(g.tick / 12) + 1,
      pop: Math.round(g.population), scenario: g.scenario };
  });
  check('The file is named after what is in it',
    named.name.includes(`y${named.year}`) && named.name.includes(`pop${named.pop}`)
    && named.name.includes(named.scenario) && named.name.endsWith('.json')
    && /^[a-z0-9.-]+$/.test(named.name),
    `${named.name} for ${named.scenario} year ${named.year}, population ${named.pop}`);

  await ctx.close();
}

// ================== C. EVERY WAY A FILE CAN BE WRONG
{
  const { ctx, page } = await fresh();
  await page.evaluate(PLAY);
  const cases = await page.evaluate(() => {
    const api = window.__api, g = window.__game;
    const good = JSON.parse(api.exportRegion(api.serialize(g)));
    const clone = () => JSON.parse(JSON.stringify(good));
    const run = (name, mutate) => {
      let text;
      if (typeof mutate === 'string') text = mutate;
      else { const f = clone(); mutate(f); text = JSON.stringify(f); }
      let res;
      try { res = api.importRegion(text); } catch (e) { return { name, threw: String(e && e.message) }; }
      return { name, ok: res.ok, reason: res.ok ? '' : res.reason };
    };
    return [
      run('empty file', ''),
      run('not JSON at all', 'this is not a save, it is a sentence'),
      run('JSON, but not an object', '[1,2,3]'),
      run('somebody else\'s JSON', '{"hello":"world"}'),
      run('no magic', (f) => { delete f.magic; }),
      run('a newer wrapper', (f) => { f.transfer = 99; }),
      run('a newer save', (f) => { f.envelope.version = 99; }),
      run('no region inside', (f) => { delete f.envelope.state; }),
      run('a map one tile short', (f) => { f.envelope.state.map.terrain = f.envelope.state.map.terrain.slice(0, -1); }),
      run('a map of the wrong pollution length', (f) => { f.envelope.state.map.pollution = 'ff'; }),
      run('no map at all', (f) => { delete f.envelope.state.map; }),
      run('a building off the edge', (f) => { f.envelope.state.buildings[0].x = 5000; }),
      run('a building of no known type', (f) => { f.envelope.state.buildings[0].type = 'orbital_ring'; }),
      run('two buildings with one id', (f) => { f.envelope.state.buildings[1].id = f.envelope.state.buildings[0].id; }),
      run('a policy that does not exist', (f) => { f.envelope.state.policies.push('mandatory_joy'); }),
      run('a scenario that does not exist', (f) => { f.envelope.state.scenario = 'atlantis'; }),
      run('a phase past the last one', (f) => { f.envelope.state.asi.phase = 9; }),
      run('emergence past 100', (f) => { f.envelope.state.asi.emergence = 4000; }),
      run('no system state', (f) => { delete f.envelope.state.asi; }),
      run('a population that is not a number', (f) => { f.envelope.state.population = 'lots'; }),
      run('a resource that is not a number', (f) => { f.envelope.state.resources.capital = null; }),
      run('an infinite indicator', (f) => { f.envelope.state.indicators.trust = 1e999; }),
      // Spliced into the text, not set on the object: assigning `__proto__` in
      // JS sets the prototype and writes no key at all, so the object route
      // produces a file with nothing wrong with it. Only a hand-written file
      // can carry the key, and only `JSON.parse` turns it back into one.
      run('a prototype key', JSON.stringify(good).replace('"state":{', '"state":{"__proto__":{"polluted":true},')),
      run('a cover that disagrees with its contents', (f) => { f.envelope.tick = 4; }),
      run('a history entry with no text', (f) => { f.envelope.state.history.push({ tick: 1, kind: 'event' }); }),
      run('half a million history entries', (f) => {
        f.envelope.state.history = new Array(500000).fill({ tick: 1, kind: 'event', text: 'x' });
      }),
      run('a string longer than any save holds', (f) => { f.envelope.state.tierName = 'x'.repeat(100000); }),
    ];
  });

  const refused = cases.filter((c) => c.ok === false);
  const accepted = cases.filter((c) => c.ok === true);
  const threw = cases.filter((c) => c.threw);
  check('Every damaged file is refused', refused.length === cases.length,
    `${refused.length} of ${cases.length} refused` +
    (accepted.length ? '; ACCEPTED: ' + accepted.map((c) => c.name).join(', ') : '') +
    (threw.length ? '; THREW: ' + threw.map((c) => `${c.name} (${c.threw})`).join(', ') : ''));
  check('Nothing a file can contain makes the importer throw', threw.length === 0,
    threw.length ? threw.map((c) => c.name).join(', ') : `${cases.length} malformed files, none threw`);
  const vague = refused.filter((c) => !/\.$/.test(c.reason) || c.reason.length < 15);
  check('Every refusal says something a player could act on', vague.length === 0 && refused.length > 0,
    vague.length ? 'unhelpful: ' + vague.map((c) => `${c.name} → "${c.reason}"`).join('; ')
      : `e.g. "${refused.find((c) => c.name === 'a building of no known type')?.reason}"`);
  // The refusals have to be telling them apart, not printing one sentence.
  const distinct = new Set(refused.map((c) => c.reason)).size;
  check('The refusals distinguish between the things that are wrong',
    distinct >= refused.length - 3,
    `${distinct} distinct reasons across ${refused.length} refusals`);

  // ================== D. THE GOOD FILE STILL PASSES
  const goodStill = await page.evaluate(() => {
    const api = window.__api, g = window.__game;
    const res = api.importRegion(api.exportRegion(api.serialize(g)));
    return { ok: res.ok, reason: res.ok ? '' : res.reason };
  });
  check('The file the game just wrote is accepted', goodStill.ok === true,
    goodStill.ok ? 'exported and read straight back' : `refused: ${goodStill.reason}`);
  await ctx.close();
}

// ================== E. TEXT FROM A FILE CANNOT BECOME MARKUP
//
// The payload goes in through the surfaces a region file owns: the decision
// history it carries, the alerts it carries, and the epitaph it carries. Each
// one is measured in its own step, and measured *immediately* — the first
// version of this counted elements at the end of the whole probe, by which
// point the terminated-administration modal had replaced the history modal and
// taken the injected `<img>` down with it. It reported "0 elements injected"
// against a build with no escaping in it at all.
{
  const { ctx, page } = await fresh();
  await page.evaluate(PLAY);
  const BOMB = '<img src=q onerror="window.__pwned=1"><script>window.__pwned=1<\/script>';

  // ---- the decision log
  const hist = await page.evaluate((bomb) => {
    const ui = window.__ui, g = window.__game;
    g.history.push({ tick: 12, kind: 'event', text: bomb });
    const before = document.querySelectorAll('img, script').length;
    ui.showHistory();
    const host = document.querySelector('.hist-list');
    return {
      injected: document.querySelectorAll('img, script').length - before,
      text: host?.textContent ?? '',
      html: host?.innerHTML ?? '',
      rows: host?.querySelectorAll('.hist-row').length ?? 0,
    };
  }, BOMB);
  // An `onerror` is asynchronous: read the flag after the browser has had a
  // chance to fail the request and run the handler, not in the same turn.
  await page.waitForTimeout(600);
  const pwnedAfterHistory = await page.evaluate(() => window.__pwned === 1);

  check('A payload in a region\'s decision history does not become an element',
    hist.injected === 0 && !/<img|<script/i.test(hist.html) && hist.rows > 0,
    `${hist.injected} elements injected across ${hist.rows} history rows`);
  check('And does not execute', pwnedAfterHistory === false,
    `window.__pwned after 600ms: ${pwnedAfterHistory}`);
  // Escaping that ate the text would pass both checks above and lose the log.
  check('The words still arrive, escaped rather than dropped',
    hist.text.includes('onerror') && (hist.html.includes('&lt;img') || hist.html.includes('&lt;script')),
    `readable ${hist.text.includes('onerror')}, entity-escaped ${hist.html.includes('&lt;img')}`);

  // ---- the alert feed
  //
  // Through the Alerts button, because the feed is built into the panel and is
  // not in the document until the panel has been opened — a probe that reached
  // for `.feed` before pressing it measured an element that was not there and
  // reported nothing injected into it.
  await page.evaluate(() => document.querySelector('.modal')?.classList.add('hidden'));
  await page.locator('.sys-btn[data-panel="alerts"]').first().click().catch(() => {});
  await page.waitForTimeout(250);
  const feed = await page.evaluate((bomb) => {
    const ui = window.__ui, g = window.__game;
    const host = document.querySelector('.feed');
    if (!host) return { missing: true };
    const before = host.querySelectorAll('img, script').length;
    g.notifications.push({ id: ++g.notificationSeq, seq: g.notificationSeq, tick: 12,
      kind: 'info', severity: 'low', count: 1, text: bomb });
    ui.refresh(g);
    return {
      injected: host.querySelectorAll('img, script').length - before,
      html: host.innerHTML,
      items: host.children.length,
      text: host.textContent ?? '',
    };
  }, BOMB);
  check('A payload in a region\'s alerts does not become an element',
    !feed.missing && feed.injected === 0 && !/<img|<script/i.test(feed.html) && feed.items > 0,
    feed.missing ? 'the alert feed was not in the document to look at'
      : `${feed.injected} elements injected across ${feed.items} feed items`);
  check('And the alert still says what it said',
    !feed.missing && feed.text.includes('onerror'),
    feed.missing ? 'no feed' : `the feed carries the text: ${feed.text.includes('onerror')}`);

  // ---- the epitaph
  //
  // Counted inside the modal rather than across the document: the terminated
  // modal replaces whatever was open, so a document-wide before/after reads
  // negative when the thing it replaced had elements of its own in it.
  const over = await page.evaluate((bomb) => {
    const ui = window.__ui, g = window.__game;
    g.gameOver = bomb;
    document.body.classList.remove('ended');
    document.querySelector('.modal')?.classList.add('hidden');
    ui.refresh(g);
    const body = document.querySelector('.modal-body');
    if (!body) return { missing: true };
    return {
      injected: body.querySelectorAll('img, script').length,
      html: body.innerHTML,
      text: body.textContent ?? '',
    };
  }, BOMB);
  check('A payload in a region\'s epitaph does not become an element',
    !over.missing && over.injected === 0 && !/<img|<script/i.test(over.html) && over.text.includes('onerror'),
    over.missing ? 'the terminated modal never opened'
      : `${over.injected} elements in the modal; the epitaph reads "${over.text.slice(0, 44)}…"`);
  await page.waitForTimeout(400);
  const pwnedAtEnd = await page.evaluate(() => window.__pwned === 1);
  check('Nothing anywhere in the region ran', pwnedAtEnd === false,
    `window.__pwned after three surfaces: ${pwnedAtEnd}`);
  await ctx.close();
}

// ================== F. THE MENUS
{
  const { ctx, page } = await fresh();
  await page.evaluate(PLAY);
  // The in-game menu.
  await page.locator('.sys-btn[data-panel="menu"]').first().click().catch(() => {});
  await page.waitForTimeout(200);
  const menu = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.menu-item')].map((b) => b.textContent.trim());
    const ex = [...document.querySelectorAll('.menu-item')].find((b) => /Export Region/.test(b.textContent));
    return { items, hasExport: !!ex, hasIcon: !!ex?.querySelector('svg') };
  });
  check('The in-game menu offers Export Region, with a mark like everything beside it',
    menu.hasExport && menu.hasIcon, `menu: ${menu.items.join(' · ')}`);

  // Export really produces a file: intercept the download.
  const [download] = await Promise.all([
    // Generous: this fires while a dozen other suites may be sharing the
    // machine, and a download that took nine seconds is still a download.
    page.waitForEvent('download', { timeout: 25000 }).catch(() => null),
    page.evaluate(() => {
      const b = [...document.querySelectorAll('.menu-item')].find((x) => /Export Region/.test(x.textContent));
      b?.click();
    }),
  ]);
  let downloaded = null;
  if (download) {
    const stream = await download.createReadStream().catch(() => null);
    if (stream) {
      const chunks = [];
      for await (const c of stream) chunks.push(c);
      downloaded = { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
    } else downloaded = { name: download.suggestedFilename(), text: '' };
  }
  check('Pressing Export Region downloads a file',
    !!downloaded && /^optimization-problem-.*\.json$/.test(downloaded.name),
    downloaded ? `${downloaded.name}, ${Math.round(downloaded.text.length / 1024)}KB` : 'no download event fired');
  const readBack = downloaded?.text
    ? await page.evaluate((t) => { const r = window.__api.importRegion(t); return r.ok ? 'accepted' : r.reason; }, downloaded.text)
    : 'nothing was downloaded';
  check('The file that came out of the browser is one the game will take back',
    readBack === 'accepted', readBack);

  // The load menu, with saves and without.
  const withSaves = await page.evaluate(() => {
    window.__api.saveTo('top:save', window.__game);
    window.__ui.showLoadMenu();
    return [...document.querySelectorAll('.modal .choice-btn')].map((b) => b.textContent.trim());
  });
  check('The Load menu offers to import one', withSaves.some((l) => /Import a region file/i.test(l)),
    withSaves.join(' · '));
  const empty = await page.evaluate(() => {
    for (const s of ['top:save', 'top:save2', 'top:save3', 'top:autosave']) localStorage.removeItem(s);
    window.__ui.showLoadMenu();
    return {
      body: document.querySelector('.modal-body')?.textContent.trim() ?? '',
      buttons: [...document.querySelectorAll('.modal .choice-btn')].map((b) => b.textContent.trim()),
    };
  });
  check('And offers it when there is nothing to load, which is when it matters most',
    empty.buttons.some((l) => /Import a region file/i.test(l)),
    `"${empty.body}" → ${empty.buttons.join(' · ')}`);

  // The title screen with no saves at all: import has to be reachable from a
  // cold start, or a player on a new machine cannot get their region in.
  const title = await page.evaluate(() => {
    for (const s of ['top:save', 'top:save2', 'top:save3', 'top:autosave']) localStorage.removeItem(s);
    document.querySelector('.modal')?.classList.add('hidden');
    window.__ui.showTitle();
    const rows = [...document.querySelectorAll('.title-btn')].map((b) => b.id);
    return { rows, hasImport: !!document.querySelector('#t-import'),
      label: document.querySelector('#t-import')?.textContent.trim().replace(/\s+/g, ' ') ?? '' };
  });
  check('A cold start with no saves can still import one',
    title.hasImport, `title rows: ${title.rows.join(', ')}`);
  check('The import row says what it does', /Import a Region/i.test(title.label),
    `"${title.label}"`);

  // And the file input it opens is real, off-screen, and out of the way.
  const input = await page.evaluate(() => {
    document.querySelector('#t-import')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const el = document.querySelector('input.file-pick');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { type: el.type, accept: el.accept, tabIndex: el.tabIndex,
      hidden: el.getAttribute('aria-hidden'), onScreen: r.right > 0 && r.bottom > 0 && r.left < innerWidth };
  });
  check('The import button opens a real file picker, kept out of the tab order',
    !!input && input.type === 'file' && /json/.test(input.accept)
    && input.tabIndex === -1 && input.hidden === 'true' && input.onScreen === false,
    input ? `type ${input.type}, accept "${input.accept}", tabIndex ${input.tabIndex}, aria-hidden ${input.hidden}, on screen ${input.onScreen}`
      : 'no input.file-pick was created');
  await ctx.close();
}

console.log('\nPASS');
for (const p of pass) console.log('  ✓ ' + p);
if (fail.length) { console.log('\nFAIL'); for (const f of fail) console.log('  ✗ ' + f); }
if (errs.length) { console.log('\nPAGE ERRORS'); for (const e of new Set(errs)) console.log('  ! ' + e); }
console.log(`\n${pass.length} passed, ${fail.length} failed, ${new Set(errs).size} distinct page errors`);
// Non-zero on a failure, and on a page error, and on a suite that asserted
// nothing at all. Without this a suite that printed a wall of red still exited
// 0, and the runner — and CI behind it — would have called it green.
if (fail.length || errs.length || !pass.length) process.exitCode = 1;
await browser.close();
