// Spatial infrastructure: the road network and utility service areas.
//
// Two derived structures, both recomputed rather than serialized:
//  - Road components: connected groups of road tiles. A workplace is only
//    staffable if it shares a component with housing — jobs have to be
//    reachable from homes, not merely adjacent to pavement.
//  - Coverage grids: power and water service areas stamped from each
//    producer's radius. Being inside a service area is what connects you to
//    the grid; whether the grid can actually supply you is still the global
//    capacity question. You need both.

import type { Building, GameState } from './types';
import { BUILDING_DEFS } from './buildings';

export const ROAD_DEFS = [
  { type: 'dirt_road', name: 'Dirt Track', capacity: 4 },
  { type: 'road', name: 'Street', capacity: 10 },
  { type: 'avenue', name: 'Avenue', capacity: 22 },
  { type: 'highway', name: 'Highway', capacity: 45 },
] as const;

interface NetworkCache {
  mapVersion: number;
  /** Component id per tile, -1 where there is no road. */
  component: Int32Array;
  componentCount: number;
  /** Total traffic capacity of all road tiles. */
  roadCapacity: number;
}

/**
 * Cached per state, not globally.
 *
 * A single module-level entry keyed on mapVersion alone was correct only while
 * exactly one GameState existed. The walkthrough puts a second region on screen
 * — a small illustrative town rendered beside the live one — and two unrelated
 * maps can easily agree on a version number, at which point one of them
 * silently gets the other's road components: wrong staffing, wrong capacity,
 * districts going dark for no visible reason. Keyed by the state itself, that
 * cannot happen, and a WeakMap doesn't keep a finished region alive.
 */
const caches = new WeakMap<GameState, NetworkCache>();

/** Flood-fill road tiles into connected components. Cached per state+mapVersion. */
export function roadNetwork(g: GameState): NetworkCache {
  const cached = caches.get(g);
  if (cached && cached.mapVersion === g.mapVersion) return cached;
  const n = g.mapW * g.mapH;
  const component = new Int32Array(n).fill(-1);
  let componentCount = 0;
  let roadCapacity = 0;
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!g.map[i].road) continue;
    roadCapacity += ROAD_DEFS[g.map[i].roadType ?? 1].capacity;
    if (component[i] !== -1) continue;
    const id = componentCount++;
    stack.push(i);
    component[i] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      const cx = cur % g.mapW, cy = (cur / g.mapW) | 0;
      if (cx > 0) tryPush(cur - 1);
      if (cx < g.mapW - 1) tryPush(cur + 1);
      if (cy > 0) tryPush(cur - g.mapW);
      if (cy < g.mapH - 1) tryPush(cur + g.mapW);
      function tryPush(next: number): void {
        if (g.map[next].road && component[next] === -1) {
          component[next] = id;
          stack.push(next);
        }
      }
    }
  }
  const built: NetworkCache = { mapVersion: g.mapVersion, component, componentCount, roadCapacity };
  caches.set(g, built);
  return built;
}

/**
 * Forget a state's cached network. Keying by identity handles two states
 * colliding on a version number, but not one state *becoming* a different
 * region: the in-place session swap assigns a whole new map onto the same
 * object, and the incoming mapVersion can match the one already cached.
 * Called from startSession, alongside the renderer's own cache reset.
 */
export function invalidateNetwork(g: GameState): void {
  caches.delete(g);
}

/** Road components a building's footprint touches (orthogonally adjacent). */
export function adjacentComponents(g: GameState, b: Building): Set<number> {
  const net = roadNetwork(g);
  const def = BUILDING_DEFS[b.type];
  const out = new Set<number>();
  const check = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= g.mapW || y >= g.mapH) return;
    const c = net.component[y * g.mapW + x];
    if (c !== -1) out.add(c);
  };
  for (let dx = 0; dx < def.w; dx++) {
    check(b.x + dx, b.y - 1);
    check(b.x + dx, b.y + def.h);
  }
  for (let dy = 0; dy < def.h; dy++) {
    check(b.x - 1, b.y + dy);
    check(b.x + def.w, b.y + dy);
  }
  return out;
}

export interface Connectivity {
  /** Building ids that touch any road. */
  onRoad: Set<number>;
  /** Building ids that share a road component with housing (i.e. reachable by workers). */
  labourReachable: Set<number>;
  roadCapacity: number;
}

/**
 * Which buildings are connected, and which can actually draw workers.
 * Housing itself only needs road access; workplaces need to be on the same
 * network as somebody's home.
 */
export function computeConnectivity(g: GameState): Connectivity {
  const net = roadNetwork(g);
  const onRoad = new Set<number>();
  const labourReachable = new Set<number>();
  const housingComponents = new Set<number>();
  const perBuilding = new Map<number, Set<number>>();

  for (const b of g.buildings.values()) {
    const comps = adjacentComponents(g, b);
    perBuilding.set(b.id, comps);
    if (comps.size > 0) onRoad.add(b.id);
    if (b.progress >= 1 && BUILDING_DEFS[b.type].housing > 0) {
      for (const c of comps) housingComponents.add(c);
    }
  }
  for (const b of g.buildings.values()) {
    const comps = perBuilding.get(b.id)!;
    for (const c of comps) {
      if (housingComponents.has(c)) { labourReachable.add(b.id); break; }
    }
  }
  return { onRoad, labourReachable, roadCapacity: net.roadCapacity };
}

export interface Coverage {
  power: Uint8Array;
  water: Uint8Array;
}

/**
 * Stamp each producer's service radius into a coverage grid. Radius scales
 * with facility class, so a nuclear plant reaches districts a solar farm
 * never will.
 */
export function computeCoverage(g: GameState): Coverage {
  const n = g.mapW * g.mapH;
  const power = new Uint8Array(n);
  const water = new Uint8Array(n);
  for (const b of g.buildings.values()) {
    if (b.progress < 1) continue;
    const def = BUILDING_DEFS[b.type];
    const radius = def.serviceRadius;
    if (!radius) continue;
    const grid = def.power > 0 ? power : def.water > 0 ? water : null;
    if (!grid) continue;
    const x0 = Math.max(0, b.x - radius), x1 = Math.min(g.mapW - 1, b.x + def.w - 1 + radius);
    const y0 = Math.max(0, b.y - radius), y1 = Math.min(g.mapH - 1, b.y + def.h - 1 + radius);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        // Distance from the footprint rectangle, not its center.
        const dx = Math.max(b.x - x, 0, x - (b.x + def.w - 1));
        const dy = Math.max(b.y - y, 0, y - (b.y + def.h - 1));
        if (dx * dx + dy * dy <= radius * radius) grid[y * g.mapW + x] = 1;
      }
    }
  }
  return { power, water };
}

/** Is any tile of this building's footprint inside the given coverage grid? */
export function covered(g: GameState, b: Building, grid: Uint8Array): boolean {
  const def = BUILDING_DEFS[b.type];
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const x = b.x + dx, y = b.y + dy;
      if (x < g.mapW && y < g.mapH && grid[y * g.mapW + x]) return true;
    }
  }
  return false;
}

/**
 * One-time migration for cities built before roads and service radii were
 * requirements: lay short access stubs so existing regions stay playable
 * instead of going dark on load.
 */
export function connectOrphans(g: GameState): number {
  let laid = 0;
  for (const b of [...g.buildings.values()]) {
    const def = BUILDING_DEFS[b.type];
    if (def.jobs === 0 && def.housing === 0) continue;
    if (adjacentComponents(g, b).size > 0) continue;
    // Walk outward from the footprint for the nearest existing road.
    let best: [number, number] | null = null;
    let bestDist = Infinity;
    for (let y = Math.max(0, b.y - 12); y < Math.min(g.mapH, b.y + def.h + 12); y++) {
      for (let x = Math.max(0, b.x - 12); x < Math.min(g.mapW, b.x + def.w + 12); x++) {
        if (!g.map[y * g.mapW + x].road) continue;
        const d = Math.abs(x - b.x) + Math.abs(y - b.y);
        if (d < bestDist) { bestDist = d; best = [x, y]; }
      }
    }
    if (!best) continue;
    // L-shaped stub from the building's edge to that road.
    let [tx, ty] = best;
    let cx = Math.min(Math.max(tx, b.x), b.x + def.w - 1);
    let cy = Math.min(Math.max(ty, b.y), b.y + def.h - 1);
    cy = ty < b.y ? b.y - 1 : ty >= b.y + def.h ? b.y + def.h : cy;
    const layAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= g.mapW || y >= g.mapH) return;
      const t = g.map[y * g.mapW + x];
      if (t.buildingId !== -1 || t.terrain === 'water' || t.road) return;
      t.road = true; t.roadType = 1; laid++;
    };
    const stepY = Math.sign(ty - cy), stepX = Math.sign(tx - cx);
    for (let y = cy; y !== ty + stepY && stepY !== 0; y += stepY) layAt(cx, y);
    for (let x = cx; x !== tx + stepX && stepX !== 0; x += stepX) layAt(x, ty);
  }
  if (laid > 0) g.mapVersion++;
  return laid;
}
