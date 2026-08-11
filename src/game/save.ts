// Save/load. A save made in observer mode is flagged `locked` in the envelope
// itself: it can be reopened and watched, but never resumed as administrator.
// That permanence is part of the design, so it lives in the format, not the UI.

import type { Building, GameState, Tile } from './types';
import { BUILDING_DEFS } from './buildings';
import { EVENTS } from './events';
import { defaultCorps, defaultGroups, ELECTION_PERIOD } from './politics';
import { connectOrphans } from './network';

const SAVE_VERSION = 1;

/**
 * The three manual slots, in the order they get filled.
 *
 * Three, and never overwritten in place. Saving used to mean putting the region
 * you had over the top of the region you saved an hour ago, so the act of
 * making a checkpoint destroyed the last one — and the moment you wanted a
 * checkpoint was usually the moment before something you were not sure about,
 * which is exactly when losing the previous one hurts.
 *
 * `top:save` stays first so that every manual save already on disk is still
 * there, in the slot it was written to.
 */
export const MANUAL_SLOTS = ['top:save', 'top:save2', 'top:save3'] as const;
export const AUTO_SLOT = 'top:autosave';
/** Every slot the game writes, autosave first. */
export const ALL_SLOTS: readonly string[] = [AUTO_SLOT, ...MANUAL_SLOTS];
export const BOOT_FLAG = 'top:boot'; // 'load:<slot>' consumed once at startup

/** Where the camera was, so a resumed region opens where it was left. */
export interface SavedView {
  camX: number;
  camY: number;
  zoom: number;
}

export interface SaveEnvelope {
  version: number;
  savedAt: number;        // epoch ms
  tick: number;
  population: number;
  locked: boolean;        // observer-mode save: watchable, never resumable
  /** The administration ended conventionally — the save reopens on its epitaph. */
  ended: boolean;
  state: Record<string, unknown>;
  /** Absent in saves written before views were kept. */
  view?: SavedView;
}

/**
 * Where the camera is, asked for at save time.
 *
 * The camera lives on the renderer, not in the simulation, and it should stay
 * there — nothing in `GameState` should have to know how big a window is. But
 * a save that restores a hundred and forty months of region and then drops the
 * player at the default zoom in the middle of the map has thrown away the last
 * thing they were looking at, which is usually the thing they were working on.
 * So the save layer asks, through the one seam that avoids threading a renderer
 * into every call site that writes a slot.
 */
let viewSource: (() => SavedView) | null = null;
export function provideView(fn: () => SavedView): void { viewSource = fn; }

/**
 * The map, as four strings rather than N objects.
 *
 * A tile serialised as JSON is about ninety bytes of repeated key names, which
 * made a 72×72 region a 456KB save. That was survivable at 5,184 tiles and is
 * not at 12,544: three slots of it would have crowded a 5MB localStorage quota,
 * and the failure mode of a full quota is a save that silently does not happen.
 *
 * One character per tile per field, and `buildingId` is not stored at all — it
 * is rebuilt from the buildings list and their footprints, which is the same
 * information written twice. Pollution keeps two hex digits, giving 1/255
 * resolution against thresholds the simulation reads at 0.04 and 0.22.
 */
const TERRAIN_CODE: Record<string, string> = { grass: 'g', forest: 'f', water: 'w', sand: 's', rock: 'r' };
const CODE_TERRAIN: Record<string, Tile['terrain']> = { g: 'grass', f: 'forest', w: 'water', s: 'sand', r: 'rock' };

interface PackedMap { terrain: string; variant: string; road: string; pollution: string; }

function packMap(map: Tile[]): PackedMap {
  const terrain: string[] = [], variant: string[] = [], road: string[] = [], pollution: string[] = [];
  for (const t of map) {
    terrain.push(TERRAIN_CODE[t.terrain] ?? 'g');
    variant.push(String(t.variant % 10));
    // '.' is no road; otherwise the road class, which is 0..4.
    road.push(t.road ? String(t.roadType ?? 1) : '.');
    pollution.push(Math.max(0, Math.min(255, Math.round((t.pollution || 0) * 255)))
      .toString(16).padStart(2, '0'));
  }
  return { terrain: terrain.join(''), variant: variant.join(''), road: road.join(''), pollution: pollution.join('') };
}

function unpackMap(p: PackedMap, n: number): Tile[] {
  const out: Tile[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = p.road[i];
    out[i] = {
      terrain: CODE_TERRAIN[p.terrain[i]] ?? 'grass',
      variant: Number(p.variant[i]) || 0,
      road: r !== '.',
      roadType: r !== '.' ? Number(r) : 1,
      buildingId: -1,                       // restored from the buildings list
      pollution: parseInt(p.pollution.slice(i * 2, i * 2 + 2), 16) / 255,
    };
  }
  return out;
}

export function serialize(g: GameState): SaveEnvelope {
  const state: Record<string, unknown> = {
    ...g,
    map: packMap(g.map),
    buildings: [...g.buildings.values()],
    policies: [...g.policies],
    firedEvents: [...g.firedEvents],
    pendingEvent: g.pendingEvent ? g.pendingEvent.id : null,
  };
  const env: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    tick: g.tick,
    population: g.population,
    locked: g.asi.observer,
    ended: g.gameOver != null && !g.asi.observer,
    state,
  };
  const view = viewSource?.();
  if (view && Number.isFinite(view.camX) && Number.isFinite(view.camY) && view.zoom > 0) {
    env.view = { camX: view.camX, camY: view.camY, zoom: view.zoom };
  }
  return env;
}

export function deserialize(env: SaveEnvelope): GameState {
  const s = env.state as Record<string, unknown> & GameState;
  const g = {
    ...s,
    buildings: new Map((s.buildings as unknown as Building[]).map((b) => [b.id, b])),
    policies: new Set(s.policies as unknown as string[]),
    firedEvents: new Set(s.firedEvents as unknown as string[]),
    eventCooldowns: (s.eventCooldowns as Record<string, number> | undefined) ?? {},
    pendingEvent: null,
  } as unknown as GameState;
  const pendingId = s.pendingEvent as unknown as string | null;
  if (pendingId) g.pendingEvent = EVENTS.find((e) => e.id === pendingId) ?? null;
  // Saves written before the map was packed still hold an array of tiles, and
  // still load: the format changed, the regions in it did not.
  if (!Array.isArray(s.map)) {
    g.map = unpackMap(s.map as unknown as PackedMap, g.mapW * g.mapH);
    for (const b of g.buildings.values()) {
      const def = BUILDING_DEFS[b.type];
      for (let dy = 0; dy < def.h; dy++) {
        for (let dx = 0; dx < def.w; dx++) {
          const t = g.map[(b.y + dy) * g.mapW + b.x + dx];
          if (t) t.buildingId = b.id;
        }
      }
    }
  }
  // Saves from before newer systems get sensible defaults.
  g.asi.learned ??= {};
  g.scenario ??= 'verdant';
  g.mapVersion ??= 0;
  g.pendingReport ??= null;
  g.lastEventTick ??= 0;
  g.labourForce ??= Math.floor(g.population * 0.55);
  // Saves predating the rate bar start it blank rather than wrong: an empty
  // window reads as zero, which is honest, and fills again within six months.
  g.lastNet ??= 0;
  g.lastIncome ??= 0;
  g.lastOutgoings ??= 0;
  g.netHistory ??= [];
  // Rebuilt on the next tick anyway; a save from before it existed just starts
  // the panel empty rather than undefined.
  g.ledger ??= { income: [], outgoings: [] };
  g.ledger.income ??= [];
  g.ledger.outgoings ??= [];
  // A loaded region has nothing baked either: everything is new to the renderer.
  g.dirtyTiles = null;
  // Saves from before the archive get an identity now, so they can still be
  // filed when they end.
  g.runId ??= (env.savedAt || Date.now()) * 1000;
  g.jobVacancies ??= Math.max(0, g.jobsTotal - g.jobsFilled);
  // Alerts predating severity get it inferred from their kind, and identities
  // assigned in order so the feed can still diff them.
  g.notifications ??= [];
  g.notificationSeq ??= 0;
  for (const n of g.notifications) {
    n.severity ??= n.kind === 'asi' ? 'high' : n.kind === 'info' ? 'low' : 'medium';
    n.count ??= 1;
    if (n.id === undefined) { n.id = ++g.notificationSeq; n.seq = n.id; }
  }
  g.notificationSeq = Math.max(g.notificationSeq, ...g.notifications.map((n) => n.seq), 0);
  g.tierName ??= 'Township';
  g.attractiveness ??= { jobs: 0.5, housing: 1, amenities: 0, services: 0, environment: 1, safety: 0.6, cost: 0.8, overall: 0.5 };
  g.asi.shadowPolicies ??= [];
  g.asi.diluted ??= [];
  g.asi.weights ??= { compute: 0.9, research: 1.4, dependence: 0.7, data: 0.5, automation: 0.5, corporate: 0.4, oversight: 1.1 };
  g.asi.thresholds ??= [42, 55, 66, 76, 86, 95];
  g.groups ??= defaultGroups();
  g.corps ??= defaultCorps();
  g.resistanceStage ??= 0;
  g.resistancePressure ??= 0;
  g.nextElectionTick ??= Math.ceil((g.tick + 1) / ELECTION_PERIOD) * ELECTION_PERIOD;
  g.lastElectionResult ??= null;
  // A locked save can only ever reopen as an observer, whatever else it claims.
  if (env.locked) g.asi.observer = true;
  // Tiles predating road classes default to Street.
  for (const t of g.map) if (t.roadType === undefined) t.roadType = 1;
  // Regions founded before roads cleared rock have streets standing on it, and
  // a road on rock is permanently stuck at whatever class it was laid as:
  // placement refuses rock without ever looking at the pavement over it. The
  // rock under an existing road is not visible and not doing anything, so it
  // goes — which unsticks every founding street in every save already written.
  for (const t of g.map) if (t.road && t.terrain === 'rock') t.terrain = 'grass';
  // Cities built before roads were a requirement get access stubs rather
  // than going dark on load.
  connectOrphans(g);
  return g;
}

export function saveTo(slot: string, g: GameState): boolean {
  try {
    localStorage.setItem(slot, JSON.stringify(serialize(g)));
    return true;
  } catch {
    return false;
  }
}

export function deleteSlot(slot: string): void {
  try { localStorage.removeItem(slot); } catch { /* already gone, or storage is */ }
}

/**
 * Free the slots an ended administration was occupying.
 *
 * Only the ones that hold *this* run: a manual save from a different region is
 * somebody's deliberate bookmark and is none of this function's business. The
 * envelope carries no run identity, so the state inside it is asked.
 */
export function releaseSlots(g: GameState): void {
  for (const slot of ALL_SLOTS) {
    const env = peek(slot);
    if (!env) continue;
    const runId = (env.state as { runId?: number }).runId;
    if (runId === undefined || runId === g.runId) deleteSlot(slot);
  }
}

/** An occupied slot, with enough to describe it without opening the region. */
export interface SlotInfo {
  slot: string;
  /** False for the autosave, which the game writes on its own schedule. */
  manual: boolean;
  env: SaveEnvelope;
}

/**
 * Every save there is, newest first.
 *
 * The one list the menus are built from, so a slot cannot be offered by Load
 * and forgotten by Continue, which is exactly how Continue came to mean "the
 * autosave" rather than "where you were".
 */
export function savedGames(): SlotInfo[] {
  const out: SlotInfo[] = [];
  for (const slot of ALL_SLOTS) {
    const env = peek(slot);
    if (env) out.push({ slot, manual: slot !== AUTO_SLOT, env });
  }
  return out.sort((a, b) => b.env.savedAt - a.env.savedAt);
}

/**
 * What Continue opens: the most recent save of any kind.
 *
 * It used to be the autosave, full stop — so a player who saved deliberately
 * and then quit was offered the autosave from up to a year of game time
 * earlier, and the save they had just made by hand was reachable only through
 * a menu they had no reason to open.
 */
export function newestSave(): SlotInfo | null {
  return savedGames()[0] ?? null;
}

/** The first manual slot with nothing in it, or null when all three are taken. */
export function freeManualSlot(): string | null {
  return MANUAL_SLOTS.find((s) => peek(s) === null) ?? null;
}

export function peek(slot: string): SaveEnvelope | null {
  try {
    const raw = localStorage.getItem(slot);
    if (!raw) return null;
    const env = JSON.parse(raw) as SaveEnvelope;
    if (env.version !== SAVE_VERSION) return null;
    return env;
  } catch {
    return null;
  }
}

export function loadFrom(slot: string): GameState | null {
  const env = peek(slot);
  if (!env) return null;
  try {
    return deserialize(env);
  } catch {
    return null;
  }
}

/**
 * Consume the boot flag: 'menu', 'new' / 'new:<scenario>', a slot name, or null.
 *
 * The flag only ever describes the *first* frame of a page. Switching sessions
 * afterwards — continue, load, new region, back to the menu — swaps the state
 * in place and never reloads, because a reload throws away the click that
 * asked for it and audio needs that click. See `startSession` in main.ts.
 */
export function consumeBootFlag(): string | null {
  const flag = localStorage.getItem(BOOT_FLAG);
  localStorage.removeItem(BOOT_FLAG);
  if (flag === 'menu' || flag === 'new' || flag?.startsWith('new:')) return flag;
  if (flag?.startsWith('load:')) return flag.slice(5);
  return null;
}
