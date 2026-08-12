// A picture of the region you are about to be handed.
//
// Drawn by `generateTerrain` — the same function that builds the map you will
// then play on, from the same seed. Not an illustration of a river valley: the
// river valley. This follows the walkthrough's rule about its figures, and for
// the same reason: anything drawn by a second copy of the rules is a picture
// that can quietly stop being true, and the one thing a preview of the terrain
// has to be is the terrain.
//
// One pixel per tile, at the map's own 112×112, scaled up by CSS with
// `image-rendering: pixelated`. A 112×112 canvas is 12,544 pixels — cheaper to
// produce than one frame of the game, and the expensive half is founding the
// region, which is why the results are kept.

import { newGame } from '../game/state';
import { type ScenarioId } from '../game/scenarios';

/**
 * Ground colours, one per terrain, taken from the sprites that draw them.
 *
 * Forest is darker than the grass it actually stands on, because at one pixel
 * a tile there is no room for a tree — the canopy has to be the colour.
 */
const GROUND: Record<string, string> = {
  grass: '#4a7f3c',
  forest: '#2f5a28',
  sand: '#c9b06a',
  rock: '#6e6f6a',
  water: '#2e5f8f',
};
/** The settlement, drawn over the ground it stands on. */
const PAVED = '#585d66';
const BUILT = '#d8cdb6';

/**
 * Generating a region is the costly part, so a thumbnail is made once.
 *
 * Keyed on scenario and seed: rerolling asks for a different seed and gets a
 * different picture, and coming back to a card the player has already seen
 * costs a lookup.
 */
const cache = new Map<string, string>();

/** A data URL for this region, as it will be on the morning you take it. */
export function regionThumbnail(scenario: ScenarioId, seed: number): string {
  const key = `${scenario}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // `newGame`, not `generateTerrain`. The founding settlement clears the ground
  // it stands on — rock and forest go under the streets and the footprints —
  // so raw terrain is a picture of the valley *before* the town, which is a
  // region nobody is offered. It differed from the real map by a dozen tiles,
  // which is small enough to have gone unnoticed and wrong all the same.
  const g = newGame(seed, scenario);
  const side = g.mapW;
  const c = document.createElement('canvas');
  c.width = side; c.height = c.height = g.mapH;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(side, g.mapH);
  const put = (i: number, hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    img.data[i * 4] = (n >> 16) & 255;
    img.data[i * 4 + 1] = (n >> 8) & 255;
    img.data[i * 4 + 2] = n & 255;
    img.data[i * 4 + 3] = 255;
  };
  for (let i = 0; i < g.map.length; i++) {
    const t = g.map[i];
    // The town on top of the ground: streets, then what stands on them. It is
    // fifteen tiles across at one pixel a tile, which is enough to read as a
    // settlement and not enough to pretend it is a city.
    put(i, t.buildingId !== -1 ? BUILT : t.road ? PAVED : (GROUND[t.terrain] ?? GROUND.grass));
  }
  ctx.putImageData(img, 0, 0);

  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

/** A seed the player has not seen before. Same range `newGame` defaults to. */
export function rollSeed(): number {
  return Math.floor(Math.random() * 100000);
}

/**
 * The seed each region is holding when the picker first opens.
 *
 * Decided here rather than in the picker so the boot screen can draw those
 * four maps while the player is reading the title. A cache keyed on scenario
 * *and* seed is no use to anyone if the two sides roll their own numbers: the
 * boot screen would found four regions nobody is ever shown, and the picker
 * would still hitch on the way open. Rerolling still asks for a fresh seed —
 * that one is a miss on purpose, and it is one region rather than four.
 */
const opening = new Map<ScenarioId, number>();
export function openingSeed(id: ScenarioId): number {
  let s = opening.get(id);
  if (s === undefined) { s = rollSeed(); opening.set(id, s); }
  return s;
}

/** Whether this region and seed have already been drawn. For measurement. */
export function isCached(scenario: ScenarioId, seed: number): boolean {
  return cache.has(`${scenario}:${seed}`);
}
