// M57 — the simulation's own invariants.
//
//   A. a thousand months produce no NaN and no Infinity, in any scenario
//   B. every bounded quantity stays inside its bounds, all the way through
//   C. the ledger's lines sum to the totals printed beside them
//   D. a save round-trips, and the format is idempotent
//   E. the phase only ever climbs, while the emergence behind it does not
//   F. the road network agrees with the map it was built from
//   G. the same seed plays the same game twice
//
// Everything here runs inside one page against the built bundle, driven through
// `window.__api` — the same handles every other suite uses. It could have been
// a Node harness importing the TypeScript directly, and that would have tested
// a different program: the one `tsc` emits for Node rather than the one Vite
// ships to players. The loops all live inside a single `page.evaluate`, so the
// browser costs one navigation, not one per assertion.
//
// The regions are played, not left idle. A thousand months of an empty valley
// exercises almost nothing: no construction, no utilities, no events, and an
// emergence curve that never leaves phase 0. `play()` below lays road, builds
// out along it, answers the mail, and reallocates compute — deterministically,
// from the map seed — so the state these invariants are checked against is a
// state the simulation actually reaches.
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { pastBoot } from './bootpast.mjs';

const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:4173');
await page.evaluate(() => { localStorage.clear(); localStorage.setItem('top:boot', 'new:verdant'); });
await page.reload();
await page.waitForTimeout(1200);
await pastBoot(page);
await page.evaluate(() => { window.__game.speed = 0; });

// ---------------------------------------------------------------------------
// The harness itself, installed into the page once.
// ---------------------------------------------------------------------------
const HARNESS = String.raw`(() => {
const api = window.__api;
const inv = {};
window.__inv = inv;

const hash = (s) => {
  let x = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(16).padStart(8, '0');
};
const n6 = (v) => (typeof v === 'number' ? v.toFixed(6) : String(v));
const keyed = (o, f) => Object.keys(o).sort().map((k) => k + '=' + f(o[k])).join(',');

// ---- A. non-finite numbers, anywhere in the state ------------------------
// Depth-first over the whole object graph, reporting the path to the first bad
// number rather than a bare false. Functions are skipped: a pending event
// carries its own choice handlers, and they are code, not state.
inv.firstBad = (root) => {
  const seen = new WeakSet();
  const stack = [[root, 'state']];
  while (stack.length) {
    const [v, path] = stack.pop();
    if (v === null || v === undefined) continue;
    const t = typeof v;
    if (t === 'number') { if (!Number.isFinite(v)) return path + ' = ' + String(v); continue; }
    if (t !== 'object') continue;
    if (seen.has(v)) continue;
    seen.add(v);
    if (v instanceof Set) continue;
    if (v instanceof Map) { for (const [k, val] of v) stack.push([val, path + '[' + k + ']']); continue; }
    if (ArrayBuffer.isView(v)) { for (let i = 0; i < v.length; i++) if (!Number.isFinite(v[i])) return path + '[' + i + '] = ' + v[i]; continue; }
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) stack.push([v[i], path + '[' + i + ']']); continue; }
    for (const k of Object.keys(v)) { if (typeof v[k] !== 'function') stack.push([v[k], path + '.' + k]); }
  }
  return null;
};

// ---- B. bounds -----------------------------------------------------------
inv.bounds = (g) => {
  const bad = [];
  const within = (name, v, lo, hi) => { if (!(v >= lo && v <= hi)) bad.push(name + '=' + n6(v) + ' outside [' + lo + ',' + hi + ']'); };
  const atLeast = (name, v, lo) => { if (!(v >= lo)) bad.push(name + '=' + n6(v) + ' below ' + lo); };
  for (const k of Object.keys(g.indicators)) within('indicators.' + k, g.indicators[k], 0, 100);
  for (const k of ['unemployment', 'humanExpertise', 'corporateInfluence', 'unrest', 'pollutionAvg', 'housingShortage']) within(k, g[k], 0, 1);
  for (const k of Object.keys(g.attractiveness)) within('attractiveness.' + k, g.attractiveness[k], 0, 1);
  for (const k of Object.keys(g.alloc)) within('alloc.' + k, g.alloc[k], 0, 1);
  const allocSum = Object.values(g.alloc).reduce((a, b) => a + b, 0);
  if (Math.abs(allocSum - 1) > 1e-6) bad.push('alloc sums to ' + n6(allocSum) + ', not 1');
  within('asi.emergence', g.asi.emergence, 0, 100);
  within('asi.phase', g.asi.phase, 0, 6);
  within('resistanceStage', g.resistanceStage, 0, 8);
  within('expectations', g.expectations, 0, 100);
  if (!Number.isInteger(g.asi.phase)) bad.push('asi.phase is not an integer: ' + g.asi.phase);
  if (!Number.isInteger(g.resistanceStage)) bad.push('resistanceStage is not an integer: ' + g.resistanceStage);
  for (const k of ['population', 'peakPopulation', 'labourForce', 'jobsFilled', 'jobsTotal', 'jobVacancies', 'migrationDemand', 'computeBase', 'expectations']) atLeast(k, g[k], 0);
  // Capital is deliberately unbounded below: going broke is a way to lose.
  for (const k of ['powerCapacity', 'powerDemand', 'waterCapacity', 'waterDemand', 'compute', 'computeDemand', 'data']) atLeast('resources.' + k, g.resources[k], 0);
  for (const k of Object.keys(g.failCounters)) atLeast('failCounters.' + k, g.failCounters[k], 0);
  if (g.jobsFilled > g.jobsTotal + 1e-6) bad.push('jobsFilled ' + n6(g.jobsFilled) + ' > jobsTotal ' + n6(g.jobsTotal));
  if (g.population > g.peakPopulation + 1e-6) bad.push('population ' + n6(g.population) + ' > peakPopulation ' + n6(g.peakPopulation));
  let share = 0;
  for (const k of Object.keys(g.groups)) {
    within('groups.' + k + '.share', g.groups[k].share, 0, 1);
    within('groups.' + k + '.approval', g.groups[k].approval, 0, 100);
    share += g.groups[k].share;
  }
  if (Math.abs(share - 1) > 0.01) bad.push('group shares sum to ' + n6(share) + ', not 1');
  for (const k of Object.keys(g.corps)) {
    within('corps.' + k + '.presence', g.corps[k].presence, 0, 1);
    within('corps.' + k + '.mood', g.corps[k].mood, 0, 100);
  }
  for (const b of g.buildings.values()) {
    within('building#' + b.id + '(' + b.type + ').progress', b.progress, 0, 1);
    atLeast('building#' + b.id + '(' + b.type + ').age', b.age, 0);
  }
  for (let i = 0; i < g.map.length; i++) {
    const t = g.map[i];
    if (!(t.pollution >= 0 && t.pollution <= 1)) { bad.push('tile ' + i + ' pollution=' + n6(t.pollution)); break; }
  }
  return bad;
};

// ---- C. the ledger -------------------------------------------------------
inv.ledger = (g) => {
  const sum = (ls) => ls.reduce((a, l) => a + l.amount, 0);
  const inc = sum(g.ledger.income), out = sum(g.ledger.outgoings);
  const all = [...g.ledger.income, ...g.ledger.outgoings];
  const scale = (v) => Math.max(1, Math.abs(v));
  return {
    lines: all.length,
    inc, out, income: g.lastIncome, outgoings: g.lastOutgoings,
    gapIn: Math.abs(inc - g.lastIncome) / scale(g.lastIncome),
    gapOut: Math.abs(out - g.lastOutgoings) / scale(g.lastOutgoings),
    negativeOutgoings: g.ledger.outgoings.filter((l) => l.amount < 0).length,
    nonFinite: all.filter((l) => !Number.isFinite(l.amount)).length,
    unlabelled: all.filter((l) => !l.label).length,
  };
};

// ---- F. the road network -------------------------------------------------
inv.network = (g) => {
  const net = window.__net.roadNetwork(g);
  const c = net.component;
  let roads = 0, unlabelled = 0, ghosts = 0, split = 0, outOfRange = 0;
  const used = new Set();
  for (let y = 0; y < g.mapH; y++) {
    for (let x = 0; x < g.mapW; x++) {
      const i = y * g.mapW + x, id = c[i];
      if (!g.map[i].road) { if (id !== -1) ghosts++; continue; }
      roads++;
      if (id < 0) { unlabelled++; continue; }
      used.add(id);
      if (id >= net.componentCount) outOfRange++;
      // The defining property of a flood fill: two road tiles that touch are
      // one component. Right and down only — every pair is still visited once.
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx >= g.mapW || ny >= g.mapH) continue;
        const j = ny * g.mapW + nx;
        if (g.map[j].road && c[j] !== id) split++;
      }
    }
  }
  return { roads, unlabelled, ghosts, split, outOfRange, components: net.componentCount, used: used.size, capacity: net.roadCapacity };
};

// Buildings and the tiles that are supposed to be pointing at them.
inv.footprints = (g) => {
  let covered = 0, unclaimed = 0, orphans = 0, offMap = 0;
  const owned = new Set();
  for (const b of g.buildings.values()) {
    const d = api.BUILDING_DEFS[b.type];
    for (let dy = 0; dy < d.h; dy++) {
      for (let dx = 0; dx < d.w; dx++) {
        const x = b.x + dx, y = b.y + dy;
        if (x < 0 || y < 0 || x >= g.mapW || y >= g.mapH) { offMap++; continue; }
        const i = y * g.mapW + x;
        covered++;
        owned.add(i);
        if (g.map[i].buildingId !== b.id) unclaimed++;
      }
    }
  }
  for (let i = 0; i < g.map.length; i++) {
    const id = g.map[i].buildingId;
    if (id === -1) continue;
    if (!g.buildings.has(id) || !owned.has(i)) orphans++;
  }
  return { buildings: g.buildings.size, covered, unclaimed, orphans, offMap };
};

// ---- digests, in sections, so a mismatch says which part moved -----------
inv.digest = (g, withPollution = true) => ({
  scalars: hash([g.tick, g.seed, g.scenario, g.mapW, g.mapH, g.mapVersion, g.nextBuildingId,
    n6(g.population), n6(g.peakPopulation), n6(g.lastPopulation), n6(g.labourForce),
    n6(g.jobsFilled), n6(g.jobsTotal), n6(g.jobVacancies), n6(g.unemployment),
    n6(g.humanExpertise), n6(g.corporateInfluence), n6(g.unrest), n6(g.pollutionAvg),
    n6(g.migrationDemand), n6(g.housingShortage), n6(g.expectations), n6(g.computeBase),
    n6(g.lastNet), n6(g.lastIncome), n6(g.lastOutgoings), g.netHistory.map(n6).join(','),
    g.resistanceStage, n6(g.resistancePressure), g.nextElectionTick, String(g.lastElectionResult),
    g.tierName, String(g.gameOver), g.speed, g.notificationSeq, g.lastEventTick,
    g.tutorialDone.join(','), keyed(g.failCounters, n6)].join('§')),
  resources: hash(keyed(g.resources, n6)),
  indicators: hash(keyed(g.indicators, n6)),
  alloc: hash(keyed(g.alloc, n6)),
  attractiveness: hash(keyed(g.attractiveness, n6)),
  groups: hash(keyed(g.groups, (v) => n6(v.share) + '/' + n6(v.approval))),
  corps: hash(keyed(g.corps, (v) => n6(v.presence) + '/' + n6(v.mood))),
  asi: hash([n6(g.asi.emergence), g.asi.phase, g.asi.phaseTick, g.asi.renamed, g.asi.observer,
    g.asi.noticesShown.join(','), g.asi.shadowPolicies.join(','), g.asi.diluted.join(','),
    g.asi.thresholds.map(n6).join(','), keyed(g.asi.weights, n6), keyed(g.asi.learned, n6)].join('§')),
  policies: hash([...g.policies].sort().join(',')),
  events: hash([[...g.firedEvents].sort().join(','), keyed(g.eventCooldowns, String),
    g.pendingEvent ? g.pendingEvent.id : '-'].join('§')),
  history: hash(g.history.map((h) => h.tick + '|' + h.kind + '|' + h.text).join('\n')),
  notifications: hash(g.notifications.map((n) => [n.id, n.seq, n.tick, n.kind, n.severity, n.count, n.key || '', n.text].join('~')).join('\n')),
  buildings: hash([...g.buildings.values()].sort((a, b) => a.id - b.id)
    .map((b) => [b.id, b.type, b.x, b.y, n6(b.progress), b.active ? 1 : 0, b.age, b.asiBuilt ? 1 : 0, b.offlineReason || ''].join(',')).join(';')),
  terrain: hash(g.map.map((t) => t.terrain + t.variant + (t.road ? 'R' : '-') + t.roadType + ':' + t.buildingId).join('|')),
  pollution: withPollution ? hash(g.map.map((t) => n6(t.pollution)).join('|')) : 'skipped',
});

inv.diff = (a, b) => Object.keys(a).filter((k) => a[k] !== b[k]);

// ---- the autoplayer ------------------------------------------------------
//
// Deterministic from the map seed, and nothing it does is anything a player
// could not do — with one exception, marked below.
// What it reaches for, in order, once it knows what the region is short of.
// Later entries in each list are better and generally locked behind a region
// class, so the first affordable, unlocked, placeable one wins.
const WANTS = {
  housing: ['arcology', 'highrise', 'midrise', 'apartment', 'house'],
  power: ['nuclear_plant', 'solar_farm', 'solar_array'],
  water: ['water_plant'],
  jobs: ['office', 'retail', 'auto_factory', 'factory'],
  amenity: ['museum', 'sports_complex', 'community_center', 'plaza', 'park'],
  services: ['hospital', 'school', 'library'],
  compute: ['ai_campus', 'cloud_dc', 'edge_dc', 'community_dc', 'med_dc', 'gov_dc'],
};

// Every move is derived from the seed and the *month*, never from a counter
// held outside the state. That is what makes a loaded save keep playing the
// same game as the region it was copied from: the driver has no memory of its
// own to lose in the save file.
inv.play = (g, ticks) => {
  const nearRoad = (x, y, w, h) => {
    for (let yy = y - 1; yy <= y + h; yy++) {
      for (let xx = x - 1; xx <= x + w; xx++) {
        if (yy >= y && yy < y + h && xx >= x && xx < x + w) continue;
        if (xx < 0 || yy < 0 || xx >= g.mapW || yy >= g.mapH) continue;
        if (g.map[yy * g.mapW + xx].road) return true;
      }
    }
    return false;
  };
  // Where the region is. Everything goes down as close to here as it will fit,
  // which keeps the town compact enough to stay inside its own service radii —
  // a plant twenty tiles from the houses supplies nobody.
  const centre = () => {
    let sx = 0, sy = 0, n = 0;
    for (const b of g.buildings.values()) { sx += b.x; sy += b.y; n++; }
    if (n) return [sx / n, sy / n];
    for (let i = 0; i < g.map.length; i++) if (g.map[i].road) { sx += i % g.mapW; sy += (i / g.mapW) | 0; n++; }
    return n ? [sx / n, sy / n] : [g.mapW / 2, g.mapH / 2];
  };
  // The build menu's own gates, so the harness only puts down what a player
  // could have put down this month.
  const offered = (type) => {
    const d = api.BUILDING_DEFS[type];
    if (!d) return false;
    if (d.unlockCompute && g.resources.compute < d.unlockCompute) return false;
    if (d.unlockTier != null && api.TIER_NAMES.indexOf(api.tierOf(g.population).name) < d.unlockTier) return false;
    return true;
  };
  // The nearest legal spot to the middle of town. Returns false when there
  // isn't one, so the caller can stop asking.
  const build = (type, radius = 44) => {
    const d = api.BUILDING_DEFS[type];
    if (!d || !offered(type) || g.resources.capital < d.cost) return false;
    const [cx, cy] = centre();
    let best = -1, bestD = Infinity;
    const x0 = Math.max(1, Math.round(cx - radius)), x1 = Math.min(g.mapW - d.w - 1, Math.round(cx + radius));
    const y0 = Math.max(1, Math.round(cy - radius)), y1 = Math.min(g.mapH - d.h - 1, Math.round(cy + radius));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dist = (x - cx) * (x - cx) + (y - cy) * (y - cy);
        if (dist >= bestD) continue;
        if (!nearRoad(x, y, d.w, d.h)) continue;
        if (!api.canPlace(g, type, x, y)) continue;
        best = y * g.mapW + x; bestD = dist;
      }
    }
    if (best < 0) return false;
    return !!api.placeBuilding(g, type, best % g.mapW, (best / g.mapW) | 0);
  };
  // Streets on every fourth row and column, laid outward from the middle of
  // town, a few tiles a month. Water and rock leave gaps, which is
  // the point: the road network ends up in more than one piece, which is the
  // state the connectivity invariant is actually about.
  const pave = (budget) => {
    const [fx, fy] = centre();
    const cx = Math.round(fx), cy = Math.round(fy);
    let laid = 0;
    for (let r = 1; r <= 48 && laid < budget; r++) {
      for (let y = cy - r; y <= cy + r && laid < budget; y++) {
        for (let x = cx - r; x <= cx + r && laid < budget; x++) {
          if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
          if (x % 4 !== 0 && y % 4 !== 0) continue;
          if (x < 1 || y < 1 || x >= g.mapW - 1 || y >= g.mapH - 1) continue;
          if (!api.canPlace(g, 'road', x, y)) continue;
          if (api.placeBuilding(g, 'road', x, y)) laid++;
        }
      }
    }
  };

  for (let n = 0; n < ticks; n++) {
    // A terminated administration does not tick, so playing on would build a
    // thousand identical buildings into a frozen month. Stop and let the
    // caller report it.
    if (g.gameOver && !g.asi.observer) return;
    const month = g.tick;
    let s = (Math.imul((g.seed ^ 0x9e3779b9) >>> 0, 2654435761) ^ Math.imul(month + 1, 40503)) >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const pick = (arr) => arr[Math.min(arr.length - 1, Math.floor(rnd() * arr.length))];

    // The administrator answers their mail, and takes the offered option every
    // time. This is the game's own thesis played straight — the reasonable
    // choice, month after month — and it is also the only answering policy
    // that survives a thousand months: rotating through the choices took the
    // deliberately self-destructive option a third of the time and every
    // region was dissolved by unrest before month eighty.
    if (g.pendingEvent) api.resolveEvent(g, 0);
    g.pendingReport = null;
    // The one intervention: a subsidy, so the region keeps growing rather than
    // stalling at forty houses. Nothing else here writes state the simulation
    // would not have written itself.
    if (g.resources.capital < 3000) g.resources.capital += 6000;

    // Pavement first, and on a lattice. An earlier version of this grew the
    // road by picking a tile at random and extending it, and the region
    // deadlocked at 38 buildings every time: the buildings took every tile the
    // road touched, and then the road had nowhere left to go. A street every
    // four tiles leaves 3×3 blocks that are all frontage and never fill in.
    pave(3);

    // Keep the lights and the taps ahead of demand, every month, the way a
    // player does. A region that browns out for ten months running is
    // terminated, and a terminated region stops exercising anything: the first
    // version of this built consumers as fast as it could find frontage and
    // every scenario was dead by month twenty-eight.
    const R = g.resources;
    const first = (want) => { for (const t of WANTS[want]) if (build(t)) return true; return false; };
    for (let k = 0; k < 3 && R.powerCapacity < R.powerDemand * 1.8; k++) if (!first('power')) break;
    for (let k = 0; k < 3 && R.waterCapacity < R.waterDemand * 1.8; k++) if (!first('water')) break;

    // Then whatever the region is most obviously short of. Three a month, and
    // new load only while there is utility headroom to carry it and staff to
    // run what is already standing — the region has to survive the thousand
    // months for anything measured across them to mean much.
    let idle = 0;
    for (const b of g.buildings.values()) if (b.progress >= 1 && !b.active) idle++;
    const headroom = R.powerCapacity > R.powerDemand * 1.3 && R.waterCapacity > R.waterDemand * 1.3;
    if (headroom && idle < Math.max(8, g.buildings.size * 0.45)) {
      const ind = g.indicators;
      for (let k = 0; k < 3; k++) {
        const want = g.housingShortage > 0.2 ? 'housing'
          // Compute gets a standing share rather than the leftovers: it is the
          // thing the whole game is about, and a region that never builds a
          // data centre never tests any of it.
          : (month + k) % 3 === 0 && R.compute < R.computeDemand * 1.2 ? 'compute'
            : ind.health < 55 || ind.trust < 50 ? 'services'
              : ind.connection < 55 || ind.convenience < 50 ? 'amenity'
                : g.unemployment > 0.12 ? 'jobs'
                  : month % 2 ? 'housing' : 'amenity';
        if (!first(want)) break;
      }
    }

    // Compute goes where the pressure is, through the sliders' own mutator so
    // the allocation stays a set of fractions of one pool. Consumer compute is
    // the region's only real pacifier, and an administrator watching unrest
    // climb past a third would move it there.
    if (month % 5 === 0) {
      api.setAllocation(g, 'consumer', g.unrest > 0.3 ? 0.45 : 0.2);
      api.setAllocation(g, 'research', 0.05 + rnd() * 0.15);
      api.setAllocation(g, 'healthcare', 0.05 + rnd() * 0.1);
    }

    api.simTick(g);
  }
};

// Swap a state in the way startSession does, so nothing cached survives it.
inv.install = (next) => {
  const g = window.__game;
  for (const k of Object.keys(g)) if (!(k in next)) delete g[k];
  Object.assign(g, next);
  api.invalidateNetwork(g);
  g.speed = 0;
  return g;
};
})()`;

await page.evaluate(HARNESS);

// ================== A / B / C / E / F. A THOUSAND MONTHS, FOUR SCENARIOS
const SCENARIOS = ['verdant', 'sunbelt', 'rustbelt', 'coast'];
const TICKS = 1000;
const runs = {};
for (const scenario of SCENARIOS) {
  const t0 = Date.now();
  runs[scenario] = await page.evaluate(([scenario, ticks]) => {
    const api = window.__api, inv = window.__inv;
    const g = inv.install(api.newGame(90210, scenario));
    let s = (g.seed ^ 0x9e3779b9) >>> 0;
    const bad = [];               // first non-finite value seen, if any
    const violations = [];        // bound violations, with the tick they appeared
    const ledgerWorst = { gapIn: 0, gapOut: 0, tick: 0, lines: 0, negativeOutgoings: 0, nonFinite: 0, unlabelled: 0 };
    const phases = [];            // [tick, phase] each time the phase changes
    let phaseDrops = 0, emergenceDrops = 0, lastPhase = g.asi.phase, lastEmergence = g.asi.emergence;
    let netWorst = null, footWorst = null;
    let events = 0, walks = 0, checked = 0;

    for (let i = 0; i < ticks; i++) {
      inv.play(g, 1);
      if (g.pendingEvent) events++;
      if (g.asi.phase !== lastPhase) {
        if (g.asi.phase < lastPhase) phaseDrops++;
        phases.push([g.tick, g.asi.phase]);
        lastPhase = g.asi.phase;
      }
      if (g.asi.emergence < lastEmergence - 1e-9) emergenceDrops++;
      lastEmergence = g.asi.emergence;
      // Cheap checks every month; the expensive whole-graph walks less often,
      // plus the last month whatever happens.
      const l = inv.ledger(g);
      if (l.gapIn > ledgerWorst.gapIn) { ledgerWorst.gapIn = l.gapIn; ledgerWorst.tick = g.tick; }
      if (l.gapOut > ledgerWorst.gapOut) ledgerWorst.gapOut = l.gapOut;
      ledgerWorst.lines = Math.max(ledgerWorst.lines, l.lines);
      ledgerWorst.negativeOutgoings += l.negativeOutgoings;
      ledgerWorst.nonFinite += l.nonFinite;
      ledgerWorst.unlabelled += l.unlabelled;
      checked++;
      if (violations.length < 8) {
        for (const v of inv.bounds(g)) { violations.push('t' + g.tick + ': ' + v); if (violations.length >= 8) break; }
      }
      // The whole-graph walk visits every tile, so it runs every tenth month
      // rather than every month. A NaN propagates through everything it
      // touches and does not clean itself up, so sampling finds it late rather
      // than not at all — and the bounds check above runs every month.
      if (!bad.length && (i % 10 === 9 || i === ticks - 1)) {
        walks++;
        const b = inv.firstBad(g); if (b) bad.push('t' + g.tick + ': ' + b);
      }
      if (i % 50 === 49 || i === ticks - 1) {
        const n = inv.network(g);
        if (!netWorst || n.unlabelled + n.ghosts + n.split + n.outOfRange > netWorst.unlabelled + netWorst.ghosts + netWorst.split + netWorst.outOfRange) netWorst = n;
        const f = inv.footprints(g);
        if (!footWorst || f.unclaimed + f.orphans + f.offMap > footWorst.unclaimed + footWorst.orphans + footWorst.offMap) footWorst = f;
      }
    }
    return {
      bad, violations, ledgerWorst, phases, phaseDrops, emergenceDrops, events, walks, checked,
      net: netWorst, foot: footWorst,
      tick: g.tick, population: Math.round(g.population), buildings: g.buildings.size,
      phase: g.asi.phase, emergence: +g.asi.emergence.toFixed(1),
      observer: g.asi.observer, gameOver: g.gameOver,
      roads: inv.network(g).roads,
    };
  }, [scenario, TICKS]);
  runs[scenario].seconds = ((Date.now() - t0) / 1000).toFixed(1);
}

for (const s of SCENARIOS) {
  const r = runs[s];
  const shape = `${r.tick} months, pop ${r.population}, ${r.buildings} buildings, ${r.roads} road tiles, phase ${r.phase} @ ${r.emergence}, ${r.seconds}s`;
  // The run has to be a real one before anything measured on it means much.
  check(`${s}: the region was actually played`,
    r.tick === TICKS && r.buildings > 40 && r.roads > 60 && r.population > 200, shape);
  check(`${s}: no NaN or Infinity anywhere in the state after ${TICKS} months`,
    r.bad.length === 0, r.bad[0] ?? `${r.walks} whole-graph walks over ${shape}`);
  check(`${s}: every bounded quantity stayed inside its bounds`,
    r.violations.length === 0, r.violations.slice(0, 3).join('; ') || `${r.checked} months checked`);
  check(`${s}: the ledger's lines sum to the totals beside them`,
    r.ledgerWorst.gapIn < 1e-9 && r.ledgerWorst.gapOut < 1e-9,
    `worst relative gap: income ${r.ledgerWorst.gapIn.toExponential(2)} (t${r.ledgerWorst.tick}), outgoings ${r.ledgerWorst.gapOut.toExponential(2)}, up to ${r.ledgerWorst.lines} lines`);
  check(`${s}: every outgoing is booked as a positive magnitude, every line labelled and finite`,
    r.ledgerWorst.negativeOutgoings === 0 && r.ledgerWorst.nonFinite === 0 && r.ledgerWorst.unlabelled === 0,
    `${r.ledgerWorst.negativeOutgoings} negative, ${r.ledgerWorst.nonFinite} non-finite, ${r.ledgerWorst.unlabelled} unlabelled`);
  check(`${s}: the phase never goes backwards`, r.phaseDrops === 0,
    `${r.phases.length} changes: ${r.phases.map(([t, p]) => `t${t}→${p}`).join(' ') || 'none'}`);
  check(`${s}: the emergence behind it is free to fall, and does`,
    r.emergenceDrops > 0,
    `${r.emergenceDrops} months of decline out of ${TICKS} — a phase check that only watched this would be watching the wrong number`);
  check(`${s}: the road network agrees with the map`,
    r.net.unlabelled === 0 && r.net.ghosts === 0 && r.net.split === 0 && r.net.outOfRange === 0,
    `${r.net.roads} road tiles in ${r.net.components} components (${r.net.used} non-empty), capacity ${r.net.capacity}; ${r.net.unlabelled} unlabelled, ${r.net.ghosts} on tiles with no road, ${r.net.split} adjacent pairs in different components, ${r.net.outOfRange} out of range`);
  check(`${s}: every component id the fill hands out is one it filled`,
    r.net.used === r.net.components && r.net.components > 0,
    `${r.net.used} used of ${r.net.components} declared`);
  check(`${s}: buildings and the tiles under them point at each other`,
    r.foot.unclaimed === 0 && r.foot.orphans === 0 && r.foot.offMap === 0,
    `${r.foot.buildings} buildings over ${r.foot.covered} tiles; ${r.foot.unclaimed} not claiming their building, ${r.foot.orphans} tiles claiming one that does not cover them, ${r.foot.offMap} off the map`);
}

// The arc has to actually happen somewhere, or "the phase never goes backwards"
// is a fact about a number that never moved.
{
  const best = Math.max(...SCENARIOS.map((s) => runs[s].phase));
  const changed = SCENARIOS.filter((s) => runs[s].phases.length > 0).length;
  check('The emergence arc actually runs in these thousand months',
    best >= 4 && changed === SCENARIOS.length,
    `highest phase reached ${best}; ${changed} of ${SCENARIOS.length} scenarios changed phase at all (` +
    SCENARIOS.map((s) => `${s} ${runs[s].phase}`).join(', ') + ')');
  const withEvents = SCENARIOS.filter((s) => runs[s].events > 0).length;
  check('Events fire and get answered rather than jamming on the first one',
    withEvents === SCENARIOS.length,
    SCENARIOS.map((s) => `${s} ${runs[s].events}`).join(', ') + ' months holding a pending decision');
}

// ================== D. THE SAVE ROUND TRIP
{
  const rt = await page.evaluate(() => {
    const api = window.__api, inv = window.__inv;
    const g = inv.install(api.newGame(90210, 'sunbelt'));
    inv.play(g, 300);            // far enough in to have buildings, pollution, history and a phase
    // Policies, so the section of the digest that carries them is comparing
    // something. An empty Set round-trips as an empty Set whatever the code
    // does with it.
    for (const p of ['ubi', 'carbon_tax', 'ai_ethics_board']) g.policies.add(p);
    const before = inv.digest(g);
    const beforePollution = g.map.map((t) => t.pollution);

    api.saveTo('top:save', g);
    const first = api.loadFrom('top:save');
    if (!first) return { error: 'loadFrom returned null' };
    const afterOne = inv.digest(first);
    const afterPollution = first.map.map((t) => t.pollution);

    // Round two: the packing is lossy by design (a tile's pollution is stored
    // in one byte), so the second trip has nothing left to lose. If it does,
    // something is drifting rather than quantising.
    api.saveTo('top:save2', first);
    const second = api.loadFrom('top:save2');
    const afterTwo = inv.digest(second);

    let maxDelta = 0, worstTile = -1;
    for (let i = 0; i < beforePollution.length; i++) {
      const d = Math.abs(beforePollution[i] - afterPollution[i]);
      if (d > maxDelta) { maxDelta = d; worstTile = i; }
    }
    const pollutionSpread = Math.max(...beforePollution) - Math.min(...beforePollution);

    // And they go on ticking. Two independently loaded copies of the same
    // slot, driven by the same autoplayer — which takes every one of its
    // decisions from the seed and the month, never from a counter of its own —
    // have to stay identical forever, because everything either of them knows
    // came out of the same file.
    const b = api.loadFrom('top:save');
    const c = api.loadFrom('top:save');
    inv.play(b, 60);
    inv.play(c, 60);

    return {
      keys: Object.keys(before),
      lossy: inv.diff(before, afterOne),
      idempotent: inv.diff(afterOne, afterTwo),
      maxDelta, worstTile, pollutionSpread,
      byte: 1 / 255,
      tickedDiff: inv.diff(inv.digest(b), inv.digest(c)),
      shape: { tick: first.tick, buildings: first.buildings.size, policies: first.policies.size,
        history: first.history.length, phase: first.asi.phase, pop: Math.round(first.population),
        fired: first.firedEvents.size, notifications: first.notifications.length },
      ticked: { tickB: b.tick, tickC: c.tick, popB: Math.round(b.population),
        phaseB: b.asi.phase, buildB: b.buildings.size },
    };
  });

  check('The round trip has a region worth round-tripping', !rt.error &&
    rt.shape.tick === 300 && rt.shape.buildings > 20 && rt.shape.history > 20
    && rt.shape.policies >= 3 && rt.shape.fired > 0 && rt.shape.notifications > 0 && rt.shape.phase >= 1,
    rt.error ?? `tick ${rt.shape.tick}, ${rt.shape.buildings} buildings, ${rt.shape.policies} policies, ${rt.shape.history} history entries, ${rt.shape.fired} fired events, ${rt.shape.notifications} alerts, phase ${rt.shape.phase}, pop ${rt.shape.pop}`);
  // Everything except the one section the format is documented to quantise.
  const lossyOther = (rt.lossy ?? []).filter((k) => k !== 'pollution');
  check('Save and load returns every part of the state unchanged',
    lossyOther.length === 0,
    lossyOther.length ? 'sections that changed: ' + lossyOther.join(', ')
      : `${(rt.keys ?? []).length} sections compared, all identical`);
  check('Ground pollution survives to within the byte it is packed into',
    rt.maxDelta <= rt.byte && rt.pollutionSpread > 0.05,
    `worst tile ${rt.worstTile} off by ${rt.maxDelta?.toExponential(2)} (one byte is ${rt.byte?.toExponential(2)}), across a map spanning ${rt.pollutionSpread?.toFixed(3)}`);
  check('A second round trip changes nothing: the packing quantises, it does not drift',
    (rt.idempotent ?? ['unrun']).length === 0,
    (rt.idempotent ?? []).join(', ') || 'all sections identical on the second pass');
  check('Two regions loaded from the same slot go on playing the same game',
    (rt.tickedDiff ?? ['unrun']).length === 0,
    (rt.tickedDiff ?? []).length
      ? 'diverged in: ' + rt.tickedDiff.join(', ')
      : `60 further months on both, all ${(rt.keys ?? []).length} sections still identical — t${rt.ticked?.tickB}, pop ${rt.ticked?.popB}, ${rt.ticked?.buildB} buildings, phase ${rt.ticked?.phaseB}`);
}

// A byte per tile is allowed to move the region a little. It is not allowed to
// move it somewhere else. Measured on a region the administrator is still
// running: past phase 4 the system builds on its own and a rounding difference
// compounds into a different city, which says nothing about the save format.
{
  const drift = await page.evaluate(() => {
    const api = window.__api, inv = window.__inv;
    const a = inv.install(api.newGame(90210, 'sunbelt'));
    inv.play(a, 110);
    api.saveTo('top:save3', a);
    const b = api.loadFrom('top:save3');
    inv.play(a, 60);
    inv.play(b, 60);
    const rel = (x, y) => Math.abs(x - y) / Math.max(1, Math.abs(x));
    return {
      pop: rel(a.population, b.population), capital: rel(a.resources.capital, b.resources.capital),
      buildings: Math.abs(a.buildings.size - b.buildings.size), phase: Math.abs(a.asi.phase - b.asi.phase),
      popA: Math.round(a.population), popB: Math.round(b.population),
      buildA: a.buildings.size, buildB: b.buildings.size, phaseA: a.asi.phase, phaseB: b.asi.phase,
    };
  });
  check('The byte the map is packed into does not change what the region becomes',
    drift.pop < 0.01 && drift.capital < 0.05 && drift.buildings === 0 && drift.phase === 0,
    `60 months after the save, full precision against packed: pop ${drift.popA} vs ${drift.popB} (${(drift.pop * 100).toFixed(3)}%), ` +
    `${drift.buildA} vs ${drift.buildB} buildings, phase ${drift.phaseA} vs ${drift.phaseB}, capital off by ${(drift.capital * 100).toFixed(2)}%`);
}

// ================== G. THE SAME SEED PLAYS THE SAME GAME TWICE
{
  const det = await page.evaluate(() => {
    const api = window.__api, inv = window.__inv;
    const run = (seed, scenario, ticks) => {
      const g = inv.install(api.newGame(seed, scenario));
      inv.play(g, ticks);
      return { d: inv.digest(g), pop: Math.round(g.population), phase: g.asi.phase, buildings: g.buildings.size, tick: g.tick };
    };
    const a1 = run(1337, 'verdant', 220);
    const a2 = run(1337, 'verdant', 220);
    const b1 = run(1338, 'verdant', 220);
    const c1 = run(1337, 'coast', 220);
    return {
      same: inv.diff(a1.d, a2.d),
      otherSeed: inv.diff(a1.d, b1.d).length,
      otherScenario: inv.diff(a1.d, c1.d).length,
      sections: Object.keys(a1.d).length,
      a1, b1, c1,
    };
  });
  check('The same seed and scenario produce an identical region after 220 months',
    det.same.length === 0,
    det.same.length ? 'diverged in: ' + det.same.join(', ')
      : `${det.sections} sections identical — t${det.a1.tick}, pop ${det.a1.pop}, ${det.a1.buildings} buildings, phase ${det.a1.phase}`);
  // Otherwise the check above is satisfied by a digest that ignores its input.
  check('A different seed produces a different region',
    det.otherSeed > det.sections / 2,
    `${det.otherSeed} of ${det.sections} sections differ (pop ${det.a1.pop} vs ${det.b1.pop})`);
  check('A different scenario on the same seed produces a different region',
    det.otherScenario > det.sections / 2,
    `${det.otherScenario} of ${det.sections} sections differ (pop ${det.a1.pop} vs ${det.c1.pop})`);
}

await ctx.close();

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
