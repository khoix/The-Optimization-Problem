import type { Building, BuildingType, EmergenceWeights, GameState, GroupId, CorpId, NotifyKind, PolicyId, Severity, Tile } from './types';
import { BUILDING_DEFS } from './buildings';
import { defaultCorps, defaultGroups, ELECTION_PERIOD } from './politics';
import { scenarioDef, type ScenarioDef, type ScenarioId } from './scenarios';
import { connectOrphans } from './network';

export const MAP_W = 112;
export const MAP_H = 112;

// Small deterministic PRNG (mulberry32).
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function valueNoise(seed: number, w: number, h: number, scale: number): number[] {
  const gw = Math.ceil(w / scale) + 2;
  const gh = Math.ceil(h / scale) + 2;
  const r = rng(seed);
  const grid: number[] = Array.from({ length: gw * gh }, () => r());
  const out = new Array(w * h).fill(0);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / scale, gy = y / scale;
      const x0 = Math.floor(gx), y0 = Math.floor(gy);
      const tx = smooth(gx - x0), ty = smooth(gy - y0);
      const v00 = grid[y0 * gw + x0], v10 = grid[y0 * gw + x0 + 1];
      const v01 = grid[(y0 + 1) * gw + x0], v11 = grid[(y0 + 1) * gw + x0 + 1];
      out[y * w + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
    }
  }
  return out;
}

function generateTerrain(seed: number, scen: ScenarioDef): Tile[] {
  const n1 = valueNoise(seed, MAP_W, MAP_H, 9);       // broad landmass
  const n2 = valueNoise(seed + 77, MAP_W, MAP_H, 4);  // forests
  const r = rng(seed + 1234);
  const tiles: Tile[] = [];
  // A river (or a dry sandy wash, in arid scenarios) meanders vertically
  // through the west third of the map.
  const riverX: number[] = [];
  let rx = Math.floor(MAP_W * 0.24);
  const rr = rng(seed + 555);
  for (let y = 0; y < MAP_H; y++) {
    rx += Math.round((rr() - 0.5) * 2);
    rx = Math.max(6, Math.min(Math.floor(MAP_W * 0.4), rx));
    riverX.push(rx);
  }
  // Coastal scenarios: ocean along the eastern edge with a sandy shore.
  const coastX = Math.floor(MAP_W * 0.86);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      let terrain: Tile['terrain'] = 'grass';
      const dRiver = Math.abs(x - riverX[y]);
      const coastEdge = coastX + Math.round(Math.sin(y * 0.35 + seed) * 2);
      if (scen.terrain.coast && x >= coastEdge) terrain = 'water';
      else if (scen.terrain.coast && x >= coastEdge - 2) terrain = 'sand';
      else if (scen.terrain.river && dRiver < 2) terrain = 'water';
      else if (dRiver < (scen.terrain.river ? 3 : 2)) terrain = 'sand'; // wash stays sandy either way
      else if (n1[i] > scen.terrain.rockThreshold) terrain = 'rock';
      else if (n2[i] > scen.terrain.forestThreshold) terrain = 'forest';
      else if (!scen.terrain.river && !scen.terrain.coast && n2[i] < 0.34) terrain = 'sand'; // desert flats
      tiles.push({ terrain, variant: Math.floor(r() * 4), road: false, roadType: 1, buildingId: -1, pollution: 0 });
    }
  }
  return tiles;
}

export function tileAt(g: GameState, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= g.mapW || y >= g.mapH) return null;
  return g.map[y * g.mapW + x];
}

export function isRoadType(type: BuildingType): boolean {
  return BUILDING_DEFS[type].roadType !== undefined;
}

/** What clearing one tile of rock costs the treasury. */
export const ROCK_CLEAR_COST = 25;

/**
 * How far a bridge may reach before it stops being a crossing.
 *
 * A bridge has to get to the other side. Without a limit the rule "roads may
 * be laid on water" would let a player pave the Azure Coast's ocean flat, and
 * the map's shape would stop meaning anything. Eight tiles clears every river
 * the generator makes and reaches nothing at all across open water.
 */
export const MAX_BRIDGE_SPAN = 8;

/**
 * Is this water tile part of a crossing rather than a pier?
 *
 * True when land lies within MAX_BRIDGE_SPAN on *both* sides along at least
 * one axis — which is the whole rule, stated once: a bridge reaches the far
 * bank. Existing bridge tiles count as bank, so a crossing can be built from
 * either end and meet in the middle.
 */
export function bridgeSpans(g: GameState, x: number, y: number): boolean {
  const landward = (dx: number, dy: number): boolean => {
    for (let i = 1; i <= MAX_BRIDGE_SPAN; i++) {
      const t = tileAt(g, x + dx * i, y + dy * i);
      if (!t) return false;
      if (t.terrain !== 'water') return true;   // reached the bank
      if (!t.road) continue;                    // open water, keep looking
      return true;                              // met an existing deck
    }
    return false;
  };
  return (landward(-1, 0) && landward(1, 0)) || (landward(0, -1) && landward(0, 1));
}

export function canPlace(g: GameState, type: BuildingType, x: number, y: number): boolean {
  const def = BUILDING_DEFS[type];
  const road = isRoadType(type);
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(g, x + dx, y + dy);
      if (!t) return false;
      // A bridge is the one thing that wants water, and wants nothing else:
      // laying deck across dry ground is just an expensive street.
      if (type === 'bridge') {
        if (t.terrain !== 'water') return false;
        if (!bridgeSpans(g, x + dx, y + dy)) return false;
      } else if (t.terrain === 'water' || t.terrain === 'rock') {
        return false;
      }
      if (t.buildingId !== -1) return false;
      if (t.road && !road) return false;
      // Roads may be laid on empty ground, or over a road of a different
      // class — paving over is an upgrade (or a downgrade, if you insist).
      if (road && t.road && t.roadType === def.roadType) return false;
    }
  }
  return true;
}

/**
 * Above this many changed tiles, stop keeping the list and repaint everything.
 *
 * The renderer bakes the whole map into one canvas and rebuilds it whenever
 * `mapVersion` moves. That rebuild costs 15.5ms at 72×72 and scales with area,
 * and `mapVersion` moves for *every single road tile a player paints* — one
 * dropped frame per tile, which is what a bigger map would have multiplied.
 * So the map now also says *what* changed, and the renderer repaints only
 * those tiles. The cap is generous: the largest single edit in the game is an
 * ASI access road, a couple of dozen tiles at most.
 */
const DIRTY_LIMIT = 512;

/**
 * Record a change to the map and bump the version.
 *
 * Every mutation site goes through here rather than touching `mapVersion`
 * directly, so a new one cannot forget to say what it changed — the failure
 * mode of forgetting is a stale tile on screen, which is far harder to notice
 * than a slow frame. `dirtyTiles` of null means "everything, or more than is
 * worth tracking".
 */
export function touchMap(g: GameState, x: number, y: number, w = 1, h = 1): void {
  g.mapVersion++;
  if (g.dirtyTiles === null) return;
  if (g.dirtyTiles.length + w * h > DIRTY_LIMIT) { g.dirtyTiles = null; return; }
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= g.mapW || ty >= g.mapH) continue;
      g.dirtyTiles.push(ty * g.mapW + tx);
    }
  }
}

/**
 * Clear a tile of rock, for money. Returns what it cost, or 0 if there was
 * nothing to clear or nothing to pay with.
 *
 * Rock was the map's one permanent refusal — the only terrain that could not
 * be built on and could not be changed. It is now a price instead, which is
 * the same thing the rest of the game does with every other obstacle.
 */
export function clearRock(g: GameState, x: number, y: number): number {
  const t = tileAt(g, x, y);
  if (!t || t.terrain !== 'rock') return 0;
  if (g.resources.capital < ROCK_CLEAR_COST) return 0;
  g.resources.capital -= ROCK_CLEAR_COST;
  t.terrain = 'grass';
  touchMap(g, x, y);
  return ROCK_CLEAR_COST;
}

export function placeBuilding(g: GameState, type: BuildingType, x: number, y: number, opts?: { free?: boolean; instant?: boolean; asiBuilt?: boolean }): Building | null {
  const def = BUILDING_DEFS[type];
  if (!canPlace(g, type, x, y)) return null;
  if (!opts?.free) {
    if (g.resources.capital < def.cost) return null;
    g.resources.capital -= def.cost;
  }
  // Everything the administrator puts down is noted. Roads included: a player
  // who paves before they build is telling the system something about how they
  // work, and the system is listening from the first month.
  if (!opts?.asiBuilt) g.asi.learned[type] = (g.asi.learned[type] ?? 0) + 1;
  if (isRoadType(type)) {
    const t = tileAt(g, x, y)!;
    t.road = true;
    t.roadType = def.roadType!;
    if (t.terrain === 'forest') t.terrain = 'grass';
    touchMap(g, x, y);
    return null;
  }
  const b: Building = {
    id: g.nextBuildingId++,
    type, x, y,
    progress: opts?.instant ? 1 : 0,
    active: false,
    age: 0,
    asiBuilt: opts?.asiBuilt,
  };
  g.buildings.set(b.id, b);
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(g, x + dx, y + dy)!;
      t.buildingId = b.id;
      if (t.terrain === 'forest') t.terrain = 'grass';
    }
  }
  touchMap(g, x, y, def.w, def.h);
  return b;
}

export function removeBuilding(g: GameState, id: number): void {
  const b = g.buildings.get(id);
  if (!b) return;
  const def = BUILDING_DEFS[b.type];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(g, b.x + dx, b.y + dy);
      if (t && t.buildingId === id) t.buildingId = -1;
    }
  }
  g.buildings.delete(id);
  touchMap(g, b.x, b.y, def.w, def.h);
}

/** Severity a kind carries unless a caller says otherwise. */
const DEFAULT_SEVERITY: Record<NotifyKind, Severity> = {
  info: 'low',
  warn: 'medium',
  system: 'medium',
  asi: 'high',
};

/** Months a keyed condition stays "the same episode" before it may speak again. */
const DEFAULT_COOLDOWN = 12;

export interface NotifyOpts {
  /**
   * Identity of an ongoing condition — a grid under strain, a budget in
   * deficit. Repeats inside the cooldown fold into the standing alert with a
   * count rather than filling the feed with the same sentence.
   */
  key?: string;
  severity?: Severity;
  /** Override the default per-key quiet period, in months. */
  cooldown?: number;
}

export function notify(g: GameState, text: string, kind: NotifyKind = 'info', opts: NotifyOpts = {}): void {
  const severity = opts.severity ?? DEFAULT_SEVERITY[kind];
  if (opts.key) {
    // Only the most recent entry for this key matters: if it is still inside
    // its cooldown the condition has not stopped, so update it in place.
    for (let i = g.notifications.length - 1; i >= 0; i--) {
      const n = g.notifications[i];
      if (n.key !== opts.key) continue;
      // `tick` stays at the episode's start: sliding it forward would mean a
      // permanent condition never finished its cooldown and so never spoke
      // again, leaving the player to assume it had resolved. Instead each
      // episode runs for the cooldown, then re-announces itself.
      if (g.tick - n.tick < (opts.cooldown ?? DEFAULT_COOLDOWN)) {
        n.count++;
        n.text = text;          // keep the latest figures
        n.severity = severity;  // a worsening condition may escalate
        n.seq = ++g.notificationSeq;
        return;
      }
      break;
    }
  }
  const seq = ++g.notificationSeq;
  g.notifications.push({ id: seq, seq, tick: g.tick, text, kind, severity, key: opts.key, count: 1 });
  if (g.notifications.length > 120) g.notifications.splice(0, g.notifications.length - 120);
}

/**
 * True when a policy's machinery is actually running — whether because the
 * player enacted it, or because the system kept it alive under another name
 * after the player "repealed" it (Phase 3 substitution).
 */
export function policyActive(g: GameState, p: PolicyId): boolean {
  return g.policies.has(p) || g.asi.shadowPolicies.includes(p);
}

/**
 * Record a decision for the historical review. The record deliberately keeps
 * ordinary decisions and system actions in one stream: the review is meant to
 * show a chain of reasonable choices, not one culpable mistake.
 */
export function record(g: GameState, kind: GameState['history'][number]['kind'], text: string): void {
  g.history.push({ tick: g.tick, kind, text });
  if (g.history.length > 500) g.history.splice(0, g.history.length - 500);
}

/** Seed-derived emergence weights: every campaign's danger has a different shape. */
function rollEmergenceProfile(seed: number): { weights: EmergenceWeights; thresholds: number[] } {
  const r = rng(seed * 3 + 999);
  const span = (lo: number, hi: number) => lo + r() * (hi - lo);
  const weights: EmergenceWeights = {
    compute: span(0.7, 1.1),
    research: span(1.1, 1.7),
    dependence: span(0.55, 0.9),
    data: span(0.35, 0.7),
    automation: span(0.35, 0.7),
    corporate: span(0.25, 0.55),
    oversight: span(0.9, 1.35),
  };
  const thresholds = [42, 55, 66, 76, 86, 95].map((t) => Math.round(t + span(-3, 3)));
  thresholds.sort((a, b) => a - b);
  return { weights, thresholds };
}

export function newGame(seed = Date.now() % 100000, scenarioId: ScenarioId = 'verdant'): GameState {
  const scen = scenarioDef(scenarioId);
  const profile = rollEmergenceProfile(seed);
  for (const [k, mul] of Object.entries(scen.emergenceBias) as Array<[keyof EmergenceWeights, number]>) {
    profile.weights[k] *= mul;
  }
  const g: GameState = {
    tick: 0,
    seed,
    scenario: scen.id,
    map: generateTerrain(seed, scen),
    mapW: MAP_W,
    mapH: MAP_H,
    mapVersion: 0,
    buildings: new Map(),
    nextBuildingId: 1,
    resources: {
      capital: scen.startCapital,
      powerCapacity: 0, powerDemand: 0,
      waterCapacity: 0, waterDemand: 0,
      compute: 0, computeDemand: 4, data: 0,
    },
    indicators: {
      convenience: 45, trust: 62, agency: 66, security: 58,
      connection: 64, health: 62, futureConfidence: 60,
    },
    alloc: { consumer: 0.35, healthcare: 0.2, industry: 0.15, government: 0.15, research: 0.1, surveillance: 0.05 },
    policies: new Set(),
    population: scen.startPopulation,
    jobsFilled: 0, jobsTotal: 0, labourForce: 0, jobVacancies: 0, unemployment: 0.08,
    humanExpertise: 0.85,
    corporateInfluence: 0.08,
    unrest: 0.05,
    pollutionAvg: 0,
    migrationDemand: scen.migrationBase,
    housingShortage: 0,
    attractiveness: { jobs: 0.5, housing: 1, amenities: 0, services: 0, environment: 1, safety: 0.6, cost: 0.8, overall: 0.5 },
    expectations: 40,
    computeBase: 4,
    peakPopulation: scen.startPopulation,
    lastPopulation: scen.startPopulation,
    lastNet: 0,
    lastIncome: 0,
    lastOutgoings: 0,
    netHistory: [],
    ledger: { income: [], outgoings: [] },
    dirtyTiles: null,   // a fresh region has nothing baked yet
    runId: Date.now() * 1000 + Math.floor(Math.random() * 1000),
    failCounters: { blackout: 0, approval: 0, environment: 0, inactive: 0 },
    history: [],
    tutorialDone: [],
    groups: defaultGroups(),
    corps: defaultCorps(),
    resistanceStage: 0,
    resistancePressure: 0,
    nextElectionTick: ELECTION_PERIOD,
    lastElectionResult: null,
    asi: {
      emergence: 0, phase: 0, phaseTick: 0, noticesShown: [], renamed: false, observer: false,
      weights: profile.weights, thresholds: profile.thresholds, shadowPolicies: [], diluted: [],
      learned: {},
    },
    notifications: [],
    notificationSeq: 0,
    pendingEvent: null,
    pendingReport: null,
    firedEvents: new Set(),
    eventCooldowns: {},
    lastEventTick: 0,
    tierName: 'Township',
    speed: 1,
    gameOver: null,
  };

  // Seed a starter settlement east of the river: a small street grid, so
  // every founding building has frontage on day one.
  const cx = Math.floor(MAP_W * 0.52), cy = Math.floor(MAP_H * 0.5);
  const layRoad = (x: number, y: number) => {
    const t = tileAt(g, x, y);
    if (!t || t.terrain === 'water') return;
    t.road = true; t.roadType = 1;
    if (t.terrain === 'forest') t.terrain = 'grass';
  };
  for (const row of [cy - 4, cy, cy + 4]) for (let x = cx - 7; x <= cx + 7; x++) layRoad(x, row);
  for (const col of [cx - 4, cx, cx + 4]) for (let y = cy - 5; y <= cy + 5; y++) layRoad(col, y);
  // Buildings sit inside the blocks, each touching one of the streets above.
  const starter: Array<[BuildingType, number, number]> = [
    ['house', cx - 3, cy - 3], ['house', cx - 2, cy - 3], ['house', cx - 1, cy - 3],
    ['house', cx + 1, cy - 3], ['house', cx + 2, cy - 3], ['house', cx + 3, cy - 3],
    ['house', cx - 3, cy + 1], ['house', cx - 2, cy + 1], ['house', cx - 1, cy + 1],
    ['house', cx + 1, cy + 3], ['house', cx + 2, cy + 3],
    ['retail', cx + 1, cy + 1],
    // Founding utilities sit central enough that their service radii cover
    // the whole settlement on day one.
    ['water_plant', cx + 5, cy + 1],
    ['solar_farm', cx + 5, cy - 3],
    // Sited a tile east of the block corner: a 3x3 at cx-4 puts its left
    // column straight onto the grid's own north-south street, which canPlace
    // rejects — so the founding industry silently never existed and every
    // region but Rustbelt opened with one retail unit and no other workplace.
    ['factory', cx - 3, cy + 5],
  ];
  if (scen.extraIndustry) {
    starter.push(['factory', cx + 1, cy + 5], ['coal_plant', cx + 5, cy + 5],
      ['house', cx - 1, cy - 1], ['house', cx + 1, cy - 1], ['house', cx + 2, cy - 1], ['house', cx + 3, cy + 3]);
  }
  for (const [t, x, y] of starter) {
    // The founding settlement must actually exist: clear rock/forest under
    // each footprint so seed-dependent terrain can't erase starter utilities.
    const def = BUILDING_DEFS[t];
    for (let dy = 0; dy < def.h; dy++) {
      for (let dx = 0; dx < def.w; dx++) {
        const tile = tileAt(g, x + dx, y + dy);
        if (tile && tile.terrain !== 'water') tile.terrain = 'grass';
      }
    }
    const b = placeBuilding(g, t, x, y, { free: true, instant: true });
    // A founding building that fails to place leaves no trace at all — no
    // error, just a region quietly missing a workplace. Say so.
    if (!b) console.warn(`Founding ${t} at ${x},${y} could not be placed.`);
    // Rustbelt infrastructure has been limping along for decades.
    if (b && scen.agedStart) b.age = 100 + ((b.id * 37) % 90);
  }

  // Scenario politics: demographic shape and how the majors feel about you.
  for (const [id, delta] of Object.entries(scen.shareTweaks) as Array<[GroupId, number]>) {
    g.groups[id].share = Math.max(0.01, g.groups[id].share + delta);
  }
  const totalShare = Object.values(g.groups).reduce((s, grp) => s + grp.share, 0);
  for (const grp of Object.values(g.groups)) grp.share /= totalShare;
  for (const [id, delta] of Object.entries(scen.corpMoodTweaks) as Array<[CorpId, number]>) {
    g.corps[id].mood = Math.max(0, Math.min(100, g.corps[id].mood + delta));
  }

  // Safety net: whatever the terrain did to the layout, the founding
  // settlement must actually be connected on day one.
  connectOrphans(g);

  notify(g, `Welcome to ${scen.name}, Administrator. The regional development authority is yours. Investors are watching.`, 'system');
  return g;
}
