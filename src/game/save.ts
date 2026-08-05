// Save/load. A save made in observer mode is flagged `locked` in the envelope
// itself: it can be reopened and watched, but never resumed as administrator.
// That permanence is part of the design, so it lives in the format, not the UI.

import type { Building, GameState } from './types';
import { EVENTS } from './events';
import { defaultCorps, defaultGroups, ELECTION_PERIOD } from './politics';
import { connectOrphans } from './network';

const SAVE_VERSION = 1;

export const MANUAL_SLOT = 'top:save';
export const AUTO_SLOT = 'top:autosave';
export const BOOT_FLAG = 'top:boot'; // 'load:<slot>' consumed once at startup

export interface SaveEnvelope {
  version: number;
  savedAt: number;        // epoch ms
  tick: number;
  population: number;
  locked: boolean;        // observer-mode save: watchable, never resumable
  /** The administration ended conventionally — the save reopens on its epitaph. */
  ended: boolean;
  state: Record<string, unknown>;
}

export function serialize(g: GameState): SaveEnvelope {
  const state: Record<string, unknown> = {
    ...g,
    buildings: [...g.buildings.values()],
    policies: [...g.policies],
    firedEvents: [...g.firedEvents],
    pendingEvent: g.pendingEvent ? g.pendingEvent.id : null,
  };
  return {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    tick: g.tick,
    population: g.population,
    locked: g.asi.observer,
    ended: g.gameOver != null && !g.asi.observer,
    state,
  };
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
  // Saves from before newer systems get sensible defaults.
  g.scenario ??= 'verdant';
  g.mapVersion ??= 0;
  g.pendingReport ??= null;
  g.lastEventTick ??= 0;
  g.labourForce ??= Math.floor(g.population * 0.55);
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

/** Ask the next page load to boot from a slot, then reload. */
export function requestLoad(slot: string): void {
  localStorage.setItem(BOOT_FLAG, `load:${slot}`);
  location.reload();
}

/** Ask the next page load to open the title screen, then reload. */
export function requestMenu(): void {
  localStorage.setItem(BOOT_FLAG, 'menu');
  location.reload();
}

/** Consume the boot flag: 'menu', 'new' / 'new:<scenario>', a slot name, or null. */
export function consumeBootFlag(): string | null {
  const flag = localStorage.getItem(BOOT_FLAG);
  localStorage.removeItem(BOOT_FLAG);
  if (flag === 'menu' || flag === 'new' || flag?.startsWith('new:')) return flag;
  if (flag?.startsWith('load:')) return flag.slice(5);
  return null;
}
