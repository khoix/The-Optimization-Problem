import type { Building, BuildingType, GameState, Tile } from './types';
import { BUILDING_DEFS } from './buildings';
import { defaultCorps, defaultGroups, ELECTION_PERIOD } from './politics';

export const MAP_W = 72;
export const MAP_H = 72;

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

function generateTerrain(seed: number): Tile[] {
  const n1 = valueNoise(seed, MAP_W, MAP_H, 9);       // broad landmass
  const n2 = valueNoise(seed + 77, MAP_W, MAP_H, 4);  // forests
  const r = rng(seed + 1234);
  const tiles: Tile[] = [];
  // A river meanders vertically through the west third of the map.
  const riverX: number[] = [];
  let rx = Math.floor(MAP_W * 0.24);
  const rr = rng(seed + 555);
  for (let y = 0; y < MAP_H; y++) {
    rx += Math.round((rr() - 0.5) * 2);
    rx = Math.max(6, Math.min(Math.floor(MAP_W * 0.4), rx));
    riverX.push(rx);
  }
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const i = y * MAP_W + x;
      let terrain: Tile['terrain'] = 'grass';
      const dRiver = Math.abs(x - riverX[y]);
      if (dRiver < 2) terrain = 'water';
      else if (dRiver < 3) terrain = 'sand';
      else if (n1[i] > 0.78) terrain = 'rock';
      else if (n2[i] > 0.62) terrain = 'forest';
      tiles.push({ terrain, variant: Math.floor(r() * 4), road: false, buildingId: -1, pollution: 0 });
    }
  }
  return tiles;
}

export function tileAt(g: GameState, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= g.mapW || y >= g.mapH) return null;
  return g.map[y * g.mapW + x];
}

export function canPlace(g: GameState, type: BuildingType, x: number, y: number): boolean {
  const def = BUILDING_DEFS[type];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(g, x + dx, y + dy);
      if (!t) return false;
      if (t.terrain === 'water' || t.terrain === 'rock') return false;
      if (t.buildingId !== -1) return false;
      if (t.road && type !== 'road') return false;
      if (type === 'road' && t.road) return false;
    }
  }
  return true;
}

export function placeBuilding(g: GameState, type: BuildingType, x: number, y: number, opts?: { free?: boolean; instant?: boolean; asiBuilt?: boolean }): Building | null {
  const def = BUILDING_DEFS[type];
  if (!canPlace(g, type, x, y)) return null;
  if (!opts?.free) {
    if (g.resources.capital < def.cost) return null;
    g.resources.capital -= def.cost;
  }
  if (type === 'road') {
    const t = tileAt(g, x, y)!;
    t.road = true;
    if (t.terrain === 'forest') t.terrain = 'grass';
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
}

export function notify(g: GameState, text: string, kind: 'info' | 'warn' | 'system' | 'asi' = 'info'): void {
  g.notifications.push({ tick: g.tick, text, kind });
  if (g.notifications.length > 120) g.notifications.splice(0, g.notifications.length - 120);
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

export function newGame(seed = Date.now() % 100000): GameState {
  const g: GameState = {
    tick: 0,
    seed,
    map: generateTerrain(seed),
    mapW: MAP_W,
    mapH: MAP_H,
    buildings: new Map(),
    nextBuildingId: 1,
    resources: {
      capital: 900,
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
    population: 60,
    jobsFilled: 0, jobsTotal: 0, unemployment: 0.08,
    humanExpertise: 0.85,
    corporateInfluence: 0.08,
    unrest: 0.05,
    pollutionAvg: 0,
    migrationDemand: 70,
    housingShortage: 0,
    expectations: 40,
    computeBase: 4,
    peakPopulation: 60,
    lastPopulation: 60,
    failCounters: { blackout: 0, approval: 0, environment: 0, inactive: 0 },
    history: [],
    tutorialDone: [],
    groups: defaultGroups(),
    corps: defaultCorps(),
    resistanceStage: 0,
    resistancePressure: 0,
    nextElectionTick: ELECTION_PERIOD,
    lastElectionResult: null,
    asi: { emergence: 0, phase: 0, phaseTick: 0, noticesShown: [], renamed: false, observer: false },
    notifications: [],
    pendingEvent: null,
    firedEvents: new Set(),
    eventCooldowns: {},
    speed: 1,
    gameOver: null,
  };

  // Seed a starter settlement east of the river.
  const cx = Math.floor(MAP_W * 0.52), cy = Math.floor(MAP_H * 0.5);
  for (let x = cx - 6; x <= cx + 6; x++) { const t = tileAt(g, x, cy); if (t && t.terrain !== 'water') { t.road = true; if (t.terrain === 'forest') t.terrain = 'grass'; } }
  for (let y = cy - 5; y <= cy + 5; y++) { const t = tileAt(g, cx, y); if (t && t.terrain !== 'water') { t.road = true; if (t.terrain === 'forest') t.terrain = 'grass'; } }
  const starter: Array<[BuildingType, number, number]> = [
    ['house', cx - 3, cy - 2], ['house', cx - 2, cy - 2], ['house', cx + 2, cy - 2], ['house', cx + 3, cy - 2],
    ['house', cx - 3, cy + 2], ['house', cx - 2, cy + 2], ['house', cx + 2, cy + 2],
    ['house', cx + 3, cy + 2], ['house', cx - 3, cy - 3], ['house', cx + 2, cy - 3], ['house', cx + 3, cy - 3],
    ['retail', cx + 1, cy + 1],
    ['water_plant', cx - 6, cy + 1],
    ['solar_farm', cx + 4, cy - 6],
    ['factory', cx - 6, cy - 5],
  ];
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
    placeBuilding(g, t, x, y, { free: true, instant: true });
  }

  notify(g, 'Welcome, Administrator. The regional development authority is yours. Investors are watching.', 'system');
  return g;
}
