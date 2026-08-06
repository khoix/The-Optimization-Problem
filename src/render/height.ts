// The height axis.
//
// The sprites are top-down footprints with no notion of volume. This gives each
// building a height, turns its existing sprite into a roof lifted by that
// height, and generates the facade that fills the gap down to the footprint it
// still stands on. Everything here is 2D compositing, so the lighting, bloom,
// tilt-shift and grading stack downstream is untouched.

import type { BuildingType } from '../game/types';
import { BUILDING_DEFS } from '../game/buildings';
import { TILE } from './sprites';

/**
 * Height in pixels above the ground plane, roughly four pixels to a storey.
 *
 * Exhaustive by type rather than partial: a new building type should fail the
 * build here and get a considered height, not silently inherit a default and
 * look wrong in one district nobody checks.
 */
export const BUILDING_HEIGHT: Record<Exclude<BuildingType, 'dirt_road' | 'road' | 'avenue' | 'highway' | 'bridge'>, number> = {
  // Housing — the skyline, and the clearest read on density.
  house: 7,
  apartment: 15,
  midrise: 25,
  highrise: 48,
  arcology: 72,
  // Civic and amenity — deliberately low, so services read as human-scaled.
  park: 0,
  plaza: 0,
  school: 12,
  library: 13,
  sports_complex: 15,
  museum: 18,
  community_center: 11,
  hospital: 28,
  // Power and water — industrial silhouettes.
  solar_farm: 3,
  coal_plant: 27,
  nuclear_plant: 32,
  water_plant: 15,
  solar_array: 3,
  water_reclamation: 11,
  // Economy.
  factory: 17,
  auto_factory: 19,
  office: 32,
  retail: 10,
  // Compute — the thing that keeps growing.
  edge_dc: 10,
  cloud_dc: 21,
  ai_campus: 38,
  gov_dc: 19,
  med_dc: 16,
  community_dc: 12,
};

export function heightOf(type: BuildingType): number {
  return (BUILDING_HEIGHT as Record<string, number | undefined>)[type] ?? 0;
}

/** Tall enough that it can hide ground behind it and needs occlusion relief. */
export const OCCLUDING_HEIGHT = 14;

/**
 * Parallax displacement.
 *
 * A tall building is offset from its footprint in proportion to its height and
 * its distance off the optical axis — what a real lens does to anything that
 * isn't on the centre line. Panning makes towers lean while the ground plane
 * does not, and that differential *is* the depth cue: it does not read in a
 * still frame, only in motion.
 *
 * Strength is the one number that decides whether this looks like perspective
 * or like a skew. Past roughly 0.4 the illusion breaks.
 */
const PARALLAX = 0.34;
/** Vertical lean is weaker than horizontal — the camera looks down, not across. */
const PARALLAX_Y = 0.42;

export function parallaxShift(
  screenX: number, screenY: number, height: number, W: number, H: number,
): [number, number] {
  const ax = (screenX - W / 2) / (W / 2);
  const ay = (screenY - H / 2) / (H / 2);
  return [ax * height * PARALLAX, ay * height * PARALLAX * PARALLAX_Y];
}

/** Average colour of a sprite's lower edge, to key the facade off its own roof. */
function edgeColor(src: HTMLCanvasElement): [number, number, number] {
  const ctx = src.getContext('2d', { willReadFrequently: true })!;
  const band = ctx.getImageData(0, Math.max(0, src.height - 3), src.width, 3).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < band.length; i += 4) {
    if (band[i + 3] < 40) continue;
    r += band[i]; g += band[i + 1]; b += band[i + 2]; n++;
  }
  if (!n) return [96, 100, 112];
  return [r / n, g / n, b / n];
}

export interface Facade {
  albedo: HTMLCanvasElement;
  /** Lit windows, written into the same emissive buffer the sprites use. */
  emissive: HTMLCanvasElement;
  height: number;
}

/** How a district's walls are built, which is what makes districts distinguishable. */
type WallStyle = 'glass' | 'masonry' | 'industrial' | 'civic';

function wallStyleOf(type: BuildingType): WallStyle {
  const def = BUILDING_DEFS[type];
  if (def.category === 'compute') return 'glass';
  if (def.category === 'power' || def.category === 'industry') return 'industrial';
  if (def.category === 'civic' || def.category === 'amenity') return 'civic';
  // Tall housing is curtain wall; low housing is brick and render.
  return heightOf(type) >= 24 ? 'glass' : 'masonry';
}

/**
 * Build the front wall for one building type: a band the width of the footprint,
 * keyed to the roof's own palette so it cannot look bolted on, with a window
 * pattern that is deterministic per type — a given building always looks like
 * itself across sessions.
 */
export function makeFacade(type: BuildingType, roof: HTMLCanvasElement): Facade | null {
  const h = heightOf(type);
  if (h <= 0) return null;
  const def = BUILDING_DEFS[type];
  const w = def.w * TILE;
  const style = wallStyleOf(type);

  const mk = () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d')!;
    x.imageSmoothingEnabled = false;
    return [c, x] as const;
  };
  const [albedo, a] = mk();
  const [emissive, e] = mk();

  const [br, bg, bb] = edgeColor(roof);
  const shade = (k: number, alpha = 1) =>
    `rgba(${Math.round(br * k)},${Math.round(bg * k)},${Math.round(bb * k)},${alpha})`;

  // The wall darkens toward the ground, so the mass reads as lit from above.
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    a.fillStyle = shade(0.76 - t * 0.32);
    a.fillRect(0, y, w, 1);
  }
  // Eave catching the sky, and corner shading to round the volume off.
  a.fillStyle = shade(1.14, 0.9);
  a.fillRect(0, 0, w, 1);
  a.fillStyle = 'rgba(10,14,24,0.22)';
  a.fillRect(0, 1, 1, h - 1);
  a.fillRect(w - 1, 1, 1, h - 1);

  let seed = (type.length * 2654435761) >>> 0;
  const rnd = () => {
    seed = (seed ^ (seed << 13)) >>> 0;
    seed = (seed ^ (seed >>> 17)) >>> 0;
    seed = (seed ^ (seed << 5)) >>> 0;
    return seed / 4294967296;
  };

  if (style === 'industrial') {
    // Ribbed cladding with few openings: sheds and plant, not offices.
    for (let x = 2; x < w - 1; x += 3) {
      a.fillStyle = 'rgba(255,255,255,0.05)';
      a.fillRect(x, 1, 1, h - 1);
    }
    for (let sy = 3; sy + 2 <= h - 4; sy += 7) {
      for (let sx = 2; sx + 3 <= w - 2; sx += 7) {
        if (rnd() < 0.45) continue;
        // Glass reads dark by day whatever is on behind it; the warmth lives
        // in the emissive channel only, so windows light up at dusk instead of
        // glowing through the afternoon.
        a.fillStyle = 'rgba(26,32,44,0.85)';
        a.fillRect(sx, sy, 3, 2);
        if (rnd() < 0.4) {
          e.fillStyle = 'rgba(255,190,110,0.7)';
          e.fillRect(sx, sy, 3, 2);
        }
      }
    }
  } else {
    // Storey grid. Glass runs as continuous bands; masonry and civic are
    // punched openings with piers between them.
    const storey = style === 'glass' ? 4 : 5;
    const litChance = style === 'glass' ? 0.42 : style === 'civic' ? 0.5 : 0.3;
    for (let sy = 2; sy + 2 <= h - 1; sy += storey) {
      if (style === 'glass') {
        // Spandrel band under each window run, which is what reads as "tower".
        a.fillStyle = shade(0.58);
        a.fillRect(1, sy + 2, w - 2, Math.min(2, h - sy - 2));
      }
      for (let sx = 2; sx + 2 <= w - 2; sx += style === 'glass' ? 3 : 4) {
        if (rnd() < 0.1) continue;
        const lit = rnd() < litChance;
        // Every window is dark glass in the albedo, with a touch of sky in it;
        // only the emissive knows which ones are occupied. Baking the warm
        // colour into the albedo left towers glowing at two in the afternoon.
        a.fillStyle = lit ? 'rgba(26,34,50,0.88)' : 'rgba(18,23,34,0.9)';
        a.fillRect(sx, sy, 2, 2);
        a.fillStyle = 'rgba(150,180,220,0.13)';
        a.fillRect(sx, sy, 2, 1);
        if (lit) {
          e.fillStyle = 'rgba(255,214,140,0.85)';
          e.fillRect(sx, sy, 2, 2);
        }
      }
    }
  }

  // Ground-floor entrance for anything people walk into.
  if (h >= 10 && def.category !== 'power') {
    const dx = Math.floor(w / 2) - 1;
    a.fillStyle = 'rgba(24,21,18,0.92)';
    a.fillRect(dx, h - 4, 3, 4);
    e.fillStyle = 'rgba(255,196,120,0.5)';
    e.fillRect(dx, h - 3, 3, 2);
  }
  return { albedo, emissive, height: h };
}
