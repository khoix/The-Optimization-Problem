// Regions that leave the browser they were built in.
//
// A save lives in `localStorage`, which is per-origin, per-browser and per
// profile: clear the site data and a hundred and forty months of region are
// gone, and there has never been a way to move one to another machine or hand
// one to somebody else. This is that way — a file the player owns.
//
// Everything in here that is not the file format is about the fact that an
// imported file is the first thing in this game that the game did not write.
// Every other input the simulation has ever taken came from a control we drew:
// a button, a slider, a tile under a pointer. A file can say anything at all,
// including things that are the right shape and complete nonsense, and it
// arrives as a `GameState` that the renderer will index by, the simulation will
// arithmetic on and the console will interpolate into markup. So it is checked
// before it is kept, and refused with a reason rather than repaired quietly:
// a region that has to be guessed at is not the region the player was given.

import { BUILDING_DEFS } from './buildings';
import { POLICY_DEFS } from './policies';
import { SCENARIOS } from './scenarios';
import { SAVE_VERSION, type SaveEnvelope } from './save';

/** What the file says it is. Present so a wrong file fails as a wrong file. */
export const TRANSFER_MAGIC = 'the-optimization-problem/region';
/** The wrapper's own version, which is not the save's. */
export const TRANSFER_VERSION = 1;

export interface TransferFile {
  magic: string;
  transfer: number;
  exportedAt: number;
  envelope: SaveEnvelope;
}

/** Enough for a 112×112 region with a full decision history, and not much more. */
const MAX_CHARS = 12 * 1024 * 1024;
/** No single string in a save is longer than this except the packed map. */
const MAX_TEXT = 800;
const MAX_HISTORY = 2000;
const MAX_NOTIFICATIONS = 1000;
const MAX_TILES = 512 * 512;
/** Keys that mean something to the language rather than to the game. */
const POISON = new Set(['__proto__', 'constructor', 'prototype']);

export type ImportResult =
  | { ok: true; env: SaveEnvelope }
  | { ok: false; reason: string };

// ---------------------------------------------------------------- writing

export function exportRegion(env: SaveEnvelope): string {
  const file: TransferFile = {
    magic: TRANSFER_MAGIC,
    transfer: TRANSFER_VERSION,
    exportedAt: Date.now(),
    envelope: env,
  };
  // No indentation: a region is a few hundred kilobytes of packed map and
  // pretty-printing it would be the difference between a file that attaches to
  // a message and one that does not.
  return JSON.stringify(file);
}

/**
 * What the file is called.
 *
 * The year and the population, because the one thing a player wants from a
 * folder of these is to tell them apart. Sanitised down to the characters that
 * are safe in a filename on every platform, which is a shorter list than it
 * looks: a scenario name is authored copy today, and this still does not trust
 * it, because the envelope it comes from might not be.
 */
export function regionFilename(env: SaveEnvelope): string {
  const year = Math.floor((Number(env.tick) || 0) / 12) + 1;
  const pop = Math.max(0, Math.round(Number(env.population) || 0));
  const scenario = String((env.state as { scenario?: unknown })?.scenario ?? 'region')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'region';
  return `optimization-problem-${scenario}-y${year}-pop${pop}.json`;
}

// ---------------------------------------------------------------- reading

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Every number finite, every string bounded, no key that means something to the
 * language, and nothing nested deeply enough to blow the stack on the way back
 * out. This runs over the whole state before any of the shape checks below,
 * because a field nobody thought to name is exactly the one that arrives as
 * `NaN` and turns a region into a blank screen six months later.
 *
 * `skip` names the one subtree this must not enter: the packed map is four
 * strings of tens of thousands of characters and has its own exact check.
 */
function walk(v: unknown, path: string, depth: number, seen: WeakSet<object>, skip: string): string | null {
  if (path === skip) return null;
  if (depth > 12) return `${path} is nested too deeply`;
  if (v === null || v === undefined) return null;
  const t = typeof v;
  if (t === 'number') return Number.isFinite(v as number) ? null : `${path} is ${String(v)}`;
  if (t === 'string') {
    return (v as string).length > MAX_TEXT ? `${path} is ${(v as string).length} characters long` : null;
  }
  if (t === 'boolean') return null;
  if (t !== 'object') return `${path} is a ${t}, which a save file cannot contain`;
  if (seen.has(v as object)) return `${path} refers back to itself`;
  seen.add(v as object);
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const bad = walk(v[i], `${path}[${i}]`, depth + 1, seen, skip);
      if (bad) return bad;
    }
    return null;
  }
  for (const k of Object.keys(v as object)) {
    if (POISON.has(k)) return `${path} carries a "${k}" key`;
    const bad = walk((v as Record<string, unknown>)[k], `${path}.${k}`, depth + 1, seen, skip);
    if (bad) return bad;
  }
  return null;
}

/**
 * The packed map, which is the one place a long string is expected.
 *
 * Checked for length rather than content: `unpackMap` reads an unknown terrain
 * letter as grass and an unknown road digit as no road, so a corrupt character
 * costs a tile. A *short* string is different — it reads past the end and every
 * tile after it comes back `undefined`, which is a region that renders as a
 * hole and crashes the first time the simulation looks at one.
 */
function checkMap(map: unknown, tiles: number): string | null {
  if (!isObj(map)) return 'the map is missing';
  for (const k of ['terrain', 'variant', 'road', 'pollution'] as const) {
    if (typeof map[k] !== 'string') return `the map has no ${k}`;
  }
  const want = { terrain: tiles, variant: tiles, road: tiles, pollution: tiles * 2 };
  for (const [k, n] of Object.entries(want)) {
    const got = (map[k] as string).length;
    if (got !== n) return `the map's ${k} is ${got} characters for ${tiles} tiles, not ${n}`;
  }
  return null;
}

function checkBuildings(list: unknown, w: number, h: number): string | null {
  if (!Array.isArray(list)) return 'the buildings list is missing';
  if (list.length > w * h) return `there are ${list.length} buildings for ${w * h} tiles`;
  const ids = new Set<number>();
  for (const b of list) {
    if (!isObj(b)) return 'a building is not an object';
    if (!isInt(b.id, 0, Number.MAX_SAFE_INTEGER)) return `a building has id ${String(b.id)}`;
    if (ids.has(b.id as number)) return `two buildings share id ${b.id}`;
    ids.add(b.id as number);
    const def = BUILDING_DEFS[b.type as keyof typeof BUILDING_DEFS];
    if (!def) return `a building is of unknown type "${String(b.type)}"`;
    if (!isInt(b.x, 0, w - def.w) || !isInt(b.y, 0, h - def.h)) {
      return `a ${String(b.type)} sits at ${String(b.x)},${String(b.y)}, which is off the map`;
    }
    if (!isNum(b.progress) || b.progress < 0 || b.progress > 1) return `a ${String(b.type)} is ${String(b.progress)} built`;
    if (!isNum(b.age) || b.age < 0) return `a ${String(b.type)} is ${String(b.age)} months old`;
    if (typeof b.active !== 'boolean') return `a ${String(b.type)} is neither active nor inactive`;
  }
  return null;
}

function checkEntries(list: unknown, name: string, cap: number, fields: string[]): string | null {
  if (list === undefined) return null;
  if (!Array.isArray(list)) return `the ${name} is not a list`;
  if (list.length > cap) return `there are ${list.length} ${name} entries, and the cap is ${cap}`;
  for (const e of list) {
    if (!isObj(e)) return `a ${name} entry is not an object`;
    for (const f of fields) {
      if (f === 'tick' ? !isNum(e.tick) : typeof e[f] !== 'string') {
        return `a ${name} entry has no ${f}`;
      }
    }
  }
  return null;
}

/**
 * Everything `deserialize` will read without a default of its own, plus every
 * field that reaches the renderer as an index or the console as markup.
 *
 * Fields that a save is *allowed* to be missing are not required here: the
 * loader fills those in, and it has to, because saves written before a system
 * existed are still expected to open. The rule is that what is present must be
 * the right kind of thing, not that everything must be present.
 */
function checkState(s: unknown): string | null {
  if (!isObj(s)) return 'the file has no region in it';
  // Everything except the packed map, whose four strings are tens of thousands
  // of characters by design and are length-checked exactly, below. Walking
  // them here would have refused every file the game has ever written — which
  // is what the first run of the M58 suite found.
  const bad = walk(s, 'the region', 0, new WeakSet(), 'the region.map');
  if (bad) return bad;

  if (!isInt(s.mapW, 1, 512) || !isInt(s.mapH, 1, 512)) return 'the region has no size';
  const tiles = (s.mapW as number) * (s.mapH as number);
  if (tiles > MAX_TILES) return `the region claims ${tiles} tiles`;
  const mapBad = checkMap(s.map, tiles);
  if (mapBad) return mapBad;
  const buildBad = checkBuildings(s.buildings, s.mapW as number, s.mapH as number);
  if (buildBad) return buildBad;

  if (!isInt(s.tick, 0, 1e7)) return `the region is at month ${String(s.tick)}`;
  if (!isNum(s.seed)) return 'the region has no seed';
  if (!isNum(s.population) || s.population < 0) return `the region holds ${String(s.population)} people`;
  if (s.scenario !== undefined && !(String(s.scenario) in SCENARIOS)) {
    return `the region names an unknown scenario, "${String(s.scenario)}"`;
  }

  if (!Array.isArray(s.policies)) return 'the policy list is missing';
  for (const p of s.policies) {
    // Unknown ids are refused rather than dropped: the ledger looks every
    // active policy up by name each month and would throw on the first one.
    if (!(String(p) in POLICY_DEFS)) return `the region enacts an unknown policy, "${String(p)}"`;
  }
  if (!Array.isArray(s.firedEvents)) return 'the fired-events list is missing';
  if (s.firedEvents.length > 500) return `${s.firedEvents.length} events are marked as fired`;

  for (const k of ['resources', 'indicators', 'alloc'] as const) {
    if (!isObj(s[k])) return `the region has no ${k}`;
    for (const [name, v] of Object.entries(s[k] as Record<string, unknown>)) {
      if (!isNum(v)) return `${k}.${name} is ${String(v)}`;
    }
  }

  const asi = s.asi;
  if (!isObj(asi)) return 'the region has no system state';
  if (!isInt(asi.phase, 0, 6)) return `the system is in phase ${String(asi.phase)}`;
  if (!isNum(asi.emergence) || asi.emergence < 0 || asi.emergence > 100) {
    return `the system's emergence is ${String(asi.emergence)}`;
  }
  if (typeof asi.observer !== 'boolean') return 'the system neither has nor has not taken over';
  if (asi.thresholds !== undefined) {
    if (!Array.isArray(asi.thresholds) || asi.thresholds.length !== 6 || !asi.thresholds.every(isNum)) {
      return 'the system has the wrong number of phase thresholds';
    }
  }

  const histBad = checkEntries(s.history, 'decision history', MAX_HISTORY, ['tick', 'kind', 'text']);
  if (histBad) return histBad;
  const noteBad = checkEntries(s.notifications, 'alerts', MAX_NOTIFICATIONS, ['tick', 'kind', 'text']);
  if (noteBad) return noteBad;
  if (!Array.isArray(s.history)) return 'the decision history is missing';

  return null;
}

/**
 * Read a region file, or say why it could not be read.
 *
 * Never throws and never half-succeeds: the caller gets an envelope it can put
 * straight into a slot, or a sentence it can put straight in front of the
 * player. Both are deliberate — an error message that says "unexpected token <
 * in JSON at position 0" tells somebody who picked the wrong file nothing at
 * all about which file to pick instead.
 */
export function importRegion(text: string): ImportResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, reason: 'That file is empty.' };
  if (text.length > MAX_CHARS) {
    return { ok: false, reason: `That file is ${Math.round(text.length / 1048576)}MB. A region is under one.` };
  }
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That is not a region file — it is not readable as JSON at all.' };
  }
  if (!isObj(file)) return { ok: false, reason: 'That is not a region file.' };
  if (file.magic !== TRANSFER_MAGIC) {
    return { ok: false, reason: 'That is not a region file. It was not exported by this game.' };
  }
  if (!isInt(file.transfer, 1, TRANSFER_VERSION)) {
    return { ok: false, reason: 'That region file was written by a newer version of the game than this one.' };
  }
  const env = file.envelope;
  if (!isObj(env)) return { ok: false, reason: 'That region file has no region in it.' };
  if (!isInt(env.version, 1, SAVE_VERSION)) {
    return { ok: false, reason: 'That region was saved by a newer version of the game than this one.' };
  }
  if (!isInt(env.tick, 0, 1e7) || !isNum(env.population) || env.population < 0) {
    return { ok: false, reason: 'That region file is damaged: its summary does not describe a region.' };
  }
  if (typeof env.locked !== 'boolean' || typeof env.ended !== 'boolean') {
    return { ok: false, reason: 'That region file is damaged: it does not say how the administration stood.' };
  }
  if (!isNum(env.savedAt)) return { ok: false, reason: 'That region file is damaged: it has no save date.' };
  const bad = checkState(env.state);
  if (bad) return { ok: false, reason: `That region file is damaged: ${bad}.` };
  // The envelope's own summary is what the load menu draws before anything is
  // opened, so a file whose cover disagrees with its contents is refused —
  // it would otherwise offer a Year 4 save that opens in Year 900.
  const s = env.state as Record<string, unknown>;
  if (s.tick !== env.tick) {
    return { ok: false, reason: 'That region file is damaged: it is labelled a different month than it holds.' };
  }
  return { ok: true, env: env as unknown as SaveEnvelope };
}
