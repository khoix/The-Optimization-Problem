// Procedural pixel-art sprite generation. Every sprite is drawn once into an
// offscreen canvas at native pixel density (16px tiles) and composited by the
// renderer. Buildings get an albedo layer and an emissive layer (windows,
// LEDs, signage) that feeds the night-lighting and bloom passes.

import type { BuildingType } from '../game/types';
import { BUILDING_DEFS } from '../game/buildings';
import { rng } from '../game/state';

export const TILE = 16;

export interface Sprite {
  albedo: HTMLCanvasElement;
  emissive: HTMLCanvasElement | null;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

class Px {
  constructor(public ctx: CanvasRenderingContext2D) {}
  p(x: number, y: number, c: string): void { this.ctx.fillStyle = c; this.ctx.fillRect(x, y, 1, 1); }
  r(x: number, y: number, w: number, h: number, c: string): void { this.ctx.fillStyle = c; this.ctx.fillRect(x, y, w, h); }
  /** Sparse dither of color c over a region. */
  dither(x: number, y: number, w: number, h: number, c: string, density: number, seed: number): void {
    const rand = rng(seed);
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (rand() < density) this.p(xx, yy, c);
  }
  outline(x: number, y: number, w: number, h: number, c: string): void {
    this.r(x, y, w, 1, c); this.r(x, y + h - 1, w, 1, c);
    this.r(x, y, 1, h, c); this.r(x + w - 1, y, 1, h, c);
  }
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

export interface TerrainSprites {
  grass: HTMLCanvasElement[];
  forest: HTMLCanvasElement[]; // base tiles (grass); trees drawn separately for sway
  water: HTMLCanvasElement[];  // animation frames
  sand: HTMLCanvasElement[];
  rock: HTMLCanvasElement[];
  tree: HTMLCanvasElement[];   // overlay sprites, 16x20 (canopy above tile)
  treeDead: HTMLCanvasElement[]; // pollution-killed variants
}

export function makeTerrain(): TerrainSprites {
  const grass: HTMLCanvasElement[] = [];
  for (let v = 0; v < 4; v++) {
    const [c, ctx] = canvas(TILE, TILE);
    const p = new Px(ctx);
    p.r(0, 0, TILE, TILE, '#4a7f3c');
    p.dither(0, 0, TILE, TILE, '#548c44', 0.35, 10 + v);
    p.dither(0, 0, TILE, TILE, '#3f7034', 0.2, 20 + v);
    p.dither(0, 0, TILE, TILE, '#5d9a4d', 0.08, 30 + v);
    if (v === 3) { p.p(4, 5, '#c9d96a'); p.p(11, 10, '#d9e07a'); } // tiny flowers
    grass.push(c);
  }

  const sand: HTMLCanvasElement[] = [];
  for (let v = 0; v < 4; v++) {
    const [c, ctx] = canvas(TILE, TILE);
    const p = new Px(ctx);
    p.r(0, 0, TILE, TILE, '#c9b06a');
    p.dither(0, 0, TILE, TILE, '#d6bf7c', 0.3, 40 + v);
    p.dither(0, 0, TILE, TILE, '#b89b58', 0.2, 50 + v);
    sand.push(c);
  }

  const rock: HTMLCanvasElement[] = [];
  for (let v = 0; v < 4; v++) {
    const [c, ctx] = canvas(TILE, TILE);
    const p = new Px(ctx);
    p.r(0, 0, TILE, TILE, '#6e6f6a');
    p.dither(0, 0, TILE, TILE, '#7d7e78', 0.3, 60 + v);
    p.dither(0, 0, TILE, TILE, '#5c5d58', 0.25, 70 + v);
    const rand = rng(80 + v);
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(rand() * 10), y = 2 + Math.floor(rand() * 10);
      p.r(x, y, 3, 2, '#84857e'); p.r(x, y + 2, 3, 1, '#54554f');
    }
    rock.push(c);
  }

  const water: HTMLCanvasElement[] = [];
  for (let f = 0; f < 3; f++) {
    const [c, ctx] = canvas(TILE, TILE);
    const p = new Px(ctx);
    p.r(0, 0, TILE, TILE, '#2e5f8f');
    p.dither(0, 0, TILE, TILE, '#356b9e', 0.3, 90 + f);
    const rand = rng(100 + f * 7);
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rand() * 14), y = Math.floor(rand() * 15);
      // glints shift per frame
      p.r((x + f * 2) % 15, y, 2, 1, f === 1 ? '#6fa3cc' : '#4c86b8');
    }
    water.push(c);
  }

  const tree: HTMLCanvasElement[] = [];
  for (let v = 0; v < 3; v++) {
    const [c, ctx] = canvas(TILE, TILE + 4);
    const p = new Px(ctx);
    const rand = rng(200 + v);
    const cx = 8, cy = 9;
    // trunk + shadow
    p.r(cx - 1, cy + 5, 2, 3, '#5a4630');
    p.dither(cx - 5, cy + 6, 10, 3, '#00000055', 0.4, 210 + v);
    // canopy: layered blobs
    const dark = '#2f5c2c', mid = '#3d7338', light = '#4f8a44', hi = '#65a254';
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2, d = rand() * 5;
      p.r(Math.round(cx + Math.cos(a) * d) - 1, Math.round(cy + Math.sin(a) * d * 0.8) - 1, 3, 2, dark);
    }
    for (let i = 0; i < 18; i++) {
      const a = rand() * Math.PI * 2, d = rand() * 4;
      p.r(Math.round(cx + Math.cos(a) * d) - 1, Math.round(cy - 1 + Math.sin(a) * d * 0.8), 2, 2, mid);
    }
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2, d = rand() * 3;
      p.p(Math.round(cx - 1 + Math.cos(a) * d), Math.round(cy - 2 + Math.sin(a) * d * 0.8), light);
    }
    for (let i = 0; i < 5; i++) p.p(Math.round(cx - 2 + rand() * 4), Math.round(cy - 3 + rand() * 3), hi);
    tree.push(c);
  }

  const treeDead: HTMLCanvasElement[] = [];
  for (let v = 0; v < 3; v++) {
    const [c, ctx] = canvas(TILE, TILE + 4);
    const p = new Px(ctx);
    const rand = rng(260 + v);
    const cx = 8, cy = 9;
    p.dither(cx - 4, cy + 6, 8, 2, '#00000044', 0.35, 270 + v);
    // bare trunk and skeletal branches
    p.r(cx - 1, cy - 1, 2, 9, '#4a3c30');
    p.r(cx - 4, cy, 3, 1, '#4a3c30'); p.p(cx - 4, cy - 1, '#4a3c30');
    p.r(cx + 1, cy - 2, 3, 1, '#544438'); p.p(cx + 3, cy - 3, '#544438');
    p.p(cx - 2, cy - 3, '#4a3c30'); p.p(cx - 3, cy - 4, '#4a3c30');
    p.p(cx + 1, cy - 4, '#544438');
    for (let i = 0; i < 3; i++) p.p(cx - 3 + Math.floor(rand() * 6), cy - 1 + Math.floor(rand() * 3), '#3c332a');
    treeDead.push(c);
  }

  return { grass, forest: grass, water, sand, rock, tree, treeDead };
}

// ---------------------------------------------------------------------------
// Roads (16 connectivity variants, bitmask N=1 E=2 S=4 W=8)
// ---------------------------------------------------------------------------

/** Road sprites: [roadType][connectivity mask]. */
export function makeRoads(): HTMLCanvasElement[][] {
  const CLASSES = [
    { surface: '#7d6a4e', surfaceHi: '#8a7658', edge: '#6a5940', line: '', width: 0 }, // dirt track
    { surface: '#3a3a40', surfaceHi: '#44444b', edge: '#6a6a72', line: '#b8b25e', width: 1 }, // street
    { surface: '#34343a', surfaceHi: '#3e3e45', edge: '#7a7a84', line: '#c9c36a', width: 2 }, // avenue
    { surface: '#2e2e34', surfaceHi: '#38383f', edge: '#8a8a94', line: '#d9d372', width: 3 }, // highway
    { surface: '#6b5a48', surfaceHi: '#7a6853', edge: '#4a3d31', line: '#b8b25e', width: 1 }, // bridge deck
  ];
  return CLASSES.map((cls, type) => {
    const out: HTMLCanvasElement[] = [];
    for (let mask = 0; mask < 16; mask++) {
      const [c, ctx] = canvas(TILE, TILE);
      const p = new Px(ctx);
      const n = !!(mask & 1), e = !!(mask & 2), s = !!(mask & 4), w = !!(mask & 8);
      if (type === 4) {
        // A bridge is drawn over live water rather than over a cached ground
        // tile, so the deck is inset and the tile's edges stay transparent —
        // the river keeps moving either side of the crossing. Rails run along
        // the axis that carries traffic; a lone tile gets both.
        const along = (n || s) && !(e || w) ? 'ns' : (e || w) && !(n || s) ? 'ew' : 'both';
        const IN = 2;
        if (along === 'ns') p.r(IN, 0, TILE - IN * 2, TILE, cls.surface);
        else if (along === 'ew') p.r(0, IN, TILE, TILE - IN * 2, cls.surface);
        else p.r(IN, IN, TILE - IN * 2, TILE - IN * 2, cls.surface);
        p.dither(IN, IN, TILE - IN * 2, TILE - IN * 2, cls.surfaceHi, 0.22, 700 + mask);
        // Rails, and the plank joints that make the deck read as a structure.
        if (along !== 'ew') {
          p.r(IN, 0, 1, TILE, cls.edge);
          p.r(TILE - IN - 1, 0, 1, TILE, cls.edge);
          for (let y = 1; y < TILE; y += 3) p.r(IN + 1, y, TILE - IN * 2 - 2, 1, '#5d4e3f');
        }
        if (along !== 'ns') {
          p.r(0, IN, TILE, 1, cls.edge);
          p.r(0, TILE - IN - 1, TILE, 1, cls.edge);
          for (let x = 1; x < TILE; x += 3) p.r(x, IN + 1, 1, TILE - IN * 2 - 2, '#5d4e3f');
        }
        // Pale centre marking, so a bridge still reads as carriageway.
        if (along === 'ns') { p.r(7, 2, 2, 3, cls.line); p.r(7, 8, 2, 3, cls.line); }
        else if (along === 'ew') { p.r(2, 7, 3, 2, cls.line); p.r(8, 7, 3, 2, cls.line); }
        out.push(c);
        continue;
      }
      p.r(0, 0, TILE, TILE, cls.surface);
      p.dither(0, 0, TILE, TILE, cls.surfaceHi, type === 0 ? 0.3 : 0.15, 300 + mask + type * 37);
      // curbs / shoulders on unconnected edges
      if (!n) p.r(0, 0, TILE, 1, cls.edge);
      if (!s) p.r(0, TILE - 1, TILE, 1, cls.edge);
      if (!w) p.r(0, 0, 1, TILE, cls.edge);
      if (!e) p.r(TILE - 1, 0, 1, TILE, cls.edge);
      const cx = 7, cy = 7;
      if (type === 0) {
        // dirt: wheel ruts instead of markings
        const rand = rng(400 + mask);
        for (let i = 0; i < 16; i++) {
          const t = Math.floor(rand() * TILE);
          if (n || s) { p.p(5, t, '#6a5940'); p.p(10, t, '#6a5940'); }
          if (e || w) { p.p(t, 5, '#6a5940'); p.p(t, 10, '#6a5940'); }
        }
      } else if (type === 3) {
        // highway: solid double centreline plus shoulder stripes
        if (n || s) { p.r(cx, 0, 1, TILE, cls.line); p.r(cx + 2, 0, 1, TILE, cls.line); p.r(2, 0, 1, TILE, '#9a9aa4'); p.r(TILE - 3, 0, 1, TILE, '#9a9aa4'); }
        if (e || w) { p.r(0, cy, TILE, 1, cls.line); p.r(0, cy + 2, TILE, 1, cls.line); p.r(0, 2, TILE, 1, '#9a9aa4'); p.r(0, TILE - 3, TILE, 1, '#9a9aa4'); }
      } else if (type === 2) {
        // avenue: dashed centreline with a median tint
        if (n) { p.r(cx, 0, 2, 3, cls.line); p.r(cx, 5, 2, 3, cls.line); }
        if (s) { p.r(cx, 9, 2, 3, cls.line); p.r(cx, 13, 2, 3, cls.line); }
        if (w) { p.r(0, cy, 3, 2, cls.line); p.r(5, cy, 3, 2, cls.line); }
        if (e) { p.r(9, cy, 3, 2, cls.line); p.r(13, cy, 3, 2, cls.line); }
        if (!n && !e && !s && !w) p.r(cx, cy, 2, 2, cls.line);
      } else {
        // street: short dashes
        if (n) { p.r(cx, 1, 2, 2, cls.line); p.r(cx, 5, 2, 2, cls.line); }
        if (s) { p.r(cx, 9, 2, 2, cls.line); p.r(cx, 13, 2, 2, cls.line); }
        if (w) { p.r(1, cy, 2, 2, cls.line); p.r(5, cy, 2, 2, cls.line); }
        if (e) { p.r(9, cy, 2, 2, cls.line); p.r(13, cy, 2, 2, cls.line); }
        if (!n && !e && !s && !w) p.r(cx, cy, 2, 2, cls.line);
      }
      out.push(c);
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

/** Draw a flat roof "box" building: south facade visible, NW-lit roof. */
function boxBuilding(p: Px, x: number, y: number, w: number, h: number, opts: {
  wall: string; wallDark: string; roof: string; roofHi: string; roofLo: string; outlineC?: string;
}): void {
  const facade = 4;
  // roof
  p.r(x, y, w, h - facade, opts.roof);
  p.r(x, y, w, 1, opts.roofHi);
  p.r(x, y, 1, h - facade, opts.roofHi);
  p.r(x, y + h - facade - 1, w, 1, opts.roofLo);
  p.r(x + w - 1, y, 1, h - facade, opts.roofLo);
  // facade
  p.r(x, y + h - facade, w, facade, opts.wall);
  p.r(x, y + h - 1, w, 1, opts.wallDark);
  p.outline(x, y, w, h, opts.outlineC ?? '#1c1c22');
}

function windowsOn(p: Px, x: number, y: number, w: number, cols: number, color: string): void {
  const gap = Math.floor(w / cols);
  for (let i = 0; i < cols; i++) p.r(x + 1 + i * gap + Math.floor(gap / 2) - 1, y, 2, 2, color);
}

type BuildingSpriteFn = (p: Px, e: Px, w: number, h: number, seed: number) => void;

const DRAWERS: Record<BuildingType, BuildingSpriteFn> = {
  road: () => { /* handled by makeRoads */ },
  dirt_road: () => { /* handled by makeRoads */ },
  avenue: () => { /* handled by makeRoads */ },
  highway: () => { /* handled by makeRoads */ },
  bridge: () => { /* handled by makeRoads */ },

  house: (p, e, w, h, seed) => {
    const rand = rng(seed);
    const roofC = ['#8f4f3a', '#7a5a40', '#6e4a4a'][Math.floor(rand() * 3)];
    // yard
    p.r(0, 0, w, h, '#4a7f3c');
    p.dither(0, 0, w, h, '#548c44', 0.3, seed);
    // house body 12x12 centered
    const x = 2, y = 1;
    p.r(x, y + 4, 12, 8, '#c9b89a');            // walls
    p.r(x, y + 11, 12, 1, '#9a8a6e');
    // gabled roof (horizontal ridge)
    p.r(x - 1, y, 14, 5, roofC);
    p.r(x - 1, y, 14, 1, '#00000033');
    p.r(x - 1, y + 1, 14, 1, '#ffffff2e');
    p.r(x - 1, y + 4, 14, 1, '#00000042');
    // door + windows
    p.r(x + 5, y + 8, 2, 4, '#5a4630');
    p.r(x + 2, y + 7, 2, 2, '#7ca6c9'); p.r(x + 9, y + 7, 2, 2, '#7ca6c9');
    p.outline(x - 1, y, 14, 13, '#1c1c22');
    // path
    p.r(x + 5, y + 12, 2, 3, '#b0a48c');
    e.r(x + 2, y + 7, 2, 2, '#ffd9a0'); e.r(x + 9, y + 7, 2, 2, '#ffd9a0');
  },

  apartment: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#4a7f3c'); p.dither(0, 0, w, h, '#548c44', 0.3, seed);
    boxBuilding(p, 1, 1, w - 2, h - 3, { wall: '#8d8d99', wallDark: '#6e6e7a', roof: '#77778a', roofHi: '#8b8b9e', roofLo: '#5f5f70' });
    // roof furniture
    p.r(4, 4, 4, 3, '#68687a'); p.r(w - 9, 5, 5, 4, '#68687a');
    p.r(w - 8, 6, 3, 2, '#50505f');
    // windows on facade + roof-level courtyard windows
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 6; col++) {
        const wx = 3 + col * 4, wy = h - 6 + row * 2;
        if (wx < w - 3) { p.r(wx, wy, 2, 1, '#9cc3dd'); if ((col + row) % 3 !== 0) e.r(wx, wy, 2, 1, '#ffd9a0'); }
      }
    }
    p.r(2, 2, 1, 1, '#c94f4f'); // aerial light
    e.r(2, 2, 1, 1, '#ff6a6a');
  },

  midrise: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#4a7f3c'); p.dither(0, 0, w, h, '#548c44', 0.3, seed);
    boxBuilding(p, 1, 1, w - 2, h - 4, { wall: '#9a8d7e', wallDark: '#7a6f62', roof: '#8a7f72', roofHi: '#9e9384', roofLo: '#6e6459' });
    // courtyard cut into the roof
    p.r(10, 8, 12, 10, '#5d9a4d'); p.dither(10, 8, 12, 10, '#4f8a44', 0.35, seed + 3);
    p.outline(10, 8, 12, 10, '#6e6459');
    p.p(14, 12, '#c9d96a'); p.p(18, 15, '#d97ab0');
    // roof plant + stair heads
    p.r(3, 3, 5, 4, '#7a6f62'); p.r(w - 9, 4, 6, 4, '#7a6f62');
    // windows: four bands
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 7; col++) {
        const wx = 3 + col * 4, wy = h - 11 + row * 2;
        if (wx < w - 3) { p.r(wx, wy, 2, 1, '#9cc3dd'); if ((col * 3 + row) % 4 !== 0) e.r(wx, wy, 2, 1, '#ffd9a0'); }
      }
    // ground-floor shopfronts
    p.r(3, h - 3, 7, 2, '#c9a86a'); p.r(13, h - 3, 6, 2, '#7ab0c9'); p.r(22, h - 3, 6, 2, '#c97ab0');
    e.r(3, h - 3, 7, 1, '#ffe9b0'); e.r(13, h - 3, 6, 1, '#bfe9ff');
  },

  highrise: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#7d8a80'); p.dither(0, 0, w, h, '#8a968c', 0.25, seed);
    // plaza apron
    p.r(2, h - 8, w - 4, 6, '#a8a094'); p.dither(2, h - 8, w - 4, 6, '#b8b0a4', 0.3, seed + 1);
    // tower slab, tall and narrow
    boxBuilding(p, 6, 2, w - 12, h - 12, { wall: '#6e7a8a', wallDark: '#54606e', roof: '#5e6a7a', roofHi: '#76828f', roofLo: '#464f5c', outlineC: '#181c22' });
    // glass curtain: vertical mullions + horizontal floor bands
    for (let x = 8; x < w - 8; x += 3) p.r(x, 4, 1, h - 18, '#8fa4b8');
    for (let y = 6; y < h - 14; y += 4) p.r(7, y, w - 14, 1, '#4a5464');
    // crown + mast
    p.r(8, 2, w - 16, 2, '#8fa4b8');
    p.r(Math.floor(w / 2) - 1, -1, 2, 5, '#8a8a92'); p.p(Math.floor(w / 2) - 1, -2, '#c94f4f');
    // lit windows scattered up the face
    const rand = rng(seed + 11);
    for (let i = 0; i < 26; i++) {
      const wx = 8 + Math.floor(rand() * (w - 17)), wy = 5 + Math.floor(rand() * (h - 20));
      e.r(wx, wy, 2, 1, rand() < 0.25 ? '#bfe0ff' : '#ffd9a0');
    }
    e.p(Math.floor(w / 2) - 1, -2, '#ff6a6a');
  },

  arcology: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#6e7a74'); p.dither(0, 0, w, h, '#7a8680', 0.25, seed);
    // stepped terraces: three concentric plateaus with planting
    const steps: Array<[number, number, number, number, string, string]> = [
      [2, 6, w - 4, h - 10, '#5e6a72', '#76838c'],
      [8, 12, w - 16, h - 22, '#6a7680', '#828f99'],
      [15, 18, w - 30, h - 34, '#76838c', '#8e9ba6'],
    ];
    for (const [x, y, sw, sh, base, hi] of steps) {
      p.r(x, y, sw, sh, base);
      p.r(x, y, sw, 1, hi);
      p.r(x, y + sh - 1, sw, 1, '#454e56');
      p.outline(x, y, sw, sh, '#232a30');
      // green terrace edge
      p.r(x + 1, y + sh - 3, sw - 2, 2, '#4f8a44');
      p.dither(x + 1, y + sh - 3, sw - 2, 2, '#5d9a4d', 0.4, seed + x);
    }
    // crown gardens + skybridges
    p.r(20, 10, w - 40, 6, '#4f8a44'); p.dither(20, 10, w - 40, 6, '#65a254', 0.4, seed + 7);
    p.r(6, 26, w - 12, 1, '#8e9ba6'); p.r(6, 40, w - 12, 1, '#8e9ba6');
    // window bands on each face
    for (let i = 0; i < 3; i++) {
      const y = 20 + i * 14;
      for (let x = 6; x < w - 8; x += 4) { p.r(x, y, 2, 1, '#9cc3dd'); if ((x + i) % 3 !== 0) e.r(x, y, 2, 1, '#ffe0b0'); }
    }
    p.p(Math.floor(w / 2), 4, '#c94f4f');
    e.p(Math.floor(w / 2), 4, '#ff6a6a');
    e.r(20, 10, w - 40, 1, '#9fe8b0'); // grow lights in the crown gardens
  },

  school: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#5d9a4d'); p.dither(0, 0, w, h, '#4f8a44', 0.3, seed);
    // playing field + running track
    p.r(2, h - 12, 18, 10, '#4a8a3c');
    p.outline(2, h - 12, 18, 10, '#d9d9d0');
    p.r(10, h - 12, 1, 10, '#d9d9d0');
    // two-storey brick block, long and low
    boxBuilding(p, 22, 3, w - 25, h - 10, { wall: '#b06a52', wallDark: '#8a5040', roof: '#9a5f4a', roofHi: '#b0705a', roofLo: '#7a4838' });
    // clerestory windows in two rows
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 5; col++) {
        const wx = 24 + col * 4, wy = h - 9 + row * 3;
        if (wx < w - 4) { p.r(wx, wy, 3, 2, '#cfe0f0'); e.r(wx, wy, 3, 2, '#ffe9b0'); }
      }
    // entrance canopy + flagpole
    p.r(w - 12, h - 4, 5, 3, '#8a5040');
    p.r(w - 4, 4, 1, 7, '#8a8a92'); p.r(w - 3, 4, 3, 2, '#4f8ac9');
    // bike racks
    for (let i = 0; i < 4; i++) p.p(23 + i * 2, h - 2, '#3a3a40');
    e.r(w - 11, h - 3, 3, 1, '#ffd9a0');
  },

  library: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#7d8a6e'); p.dither(0, 0, w, h, '#8a967a', 0.28, seed);
    // stone civic block with a portico
    boxBuilding(p, 2, 3, w - 4, h - 8, { wall: '#c9c2ac', wallDark: '#a49d88', roof: '#b8b19c', roofHi: '#d2cbb6', roofLo: '#948d7a' });
    // pediment + columns across the front
    p.r(5, h - 8, w - 10, 2, '#d2cbb6');
    for (let i = 0; i < 5; i++) p.r(7 + i * 4, h - 6, 2, 4, '#dcd5c0');
    p.r(4, h - 9, w - 8, 1, '#948d7a');
    // skylights over the reading room
    p.r(7, 6, w - 14, 5, '#8fa4b8'); p.r(7, 6, w - 14, 1, '#cfe0f0');
    for (let x = 9; x < w - 8; x += 4) p.r(x, 7, 1, 3, '#a4b4c4');
    // steps
    p.r(9, h - 2, w - 18, 1, '#b8b19c');
    e.r(7, 6, w - 14, 5, '#ffeccc');   // warm glow through the skylights
    for (let i = 0; i < 4; i++) e.r(8 + i * 4, h - 5, 2, 2, '#ffe9b0');
  },

  sports_complex: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#5d9a4d'); p.dither(0, 0, w, h, '#4f8a44', 0.3, seed);
    // pitch with markings
    p.r(2, 2, w - 20, h - 18, '#4a8a3c');
    p.outline(2, 2, w - 20, h - 18, '#e8e8e2');
    p.r(2, Math.floor((h - 18) / 2) + 2, w - 20, 1, '#e8e8e2');
    p.r(Math.floor((w - 20) / 2) - 3, Math.floor((h - 18) / 2) - 1, 7, 5, '#4a8a3c');
    p.outline(Math.floor((w - 20) / 2) - 3, Math.floor((h - 18) / 2) - 1, 7, 5, '#e8e8e2');
    // pool hall with barrel roof
    boxBuilding(p, w - 17, 4, 15, 18, { wall: '#7aa8c0', wallDark: '#5e8499', roof: '#6e9ab0', roofHi: '#8ab6cc', roofLo: '#527a8e' });
    p.r(w - 15, 6, 11, 3, '#a8d8e8'); // rooflight
    // outdoor courts
    p.r(3, h - 14, 14, 11, '#b06a52'); p.outline(3, h - 14, 14, 11, '#e8e8e2');
    p.r(10, h - 14, 1, 11, '#e8e8e2');
    // floodlights
    for (const fx of [2, w - 22]) { p.r(fx, h - 20, 1, 6, '#5a5a62'); p.r(fx - 1, h - 21, 3, 2, '#e8e8e2'); }
    e.r(1, h - 21, 3, 2, '#fff4d0'); e.r(w - 23, h - 21, 3, 2, '#fff4d0');
    e.r(w - 15, 6, 11, 3, '#bfe9ff');
  },

  museum: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#8a8a7e'); p.dither(0, 0, w, h, '#96968a', 0.25, seed);
    // sculpture garden strip
    p.r(2, h - 7, 12, 5, '#5d9a4d'); p.dither(2, h - 7, 12, 5, '#4f8a44', 0.35, seed + 2);
    p.r(6, h - 6, 2, 3, '#a8a8b2'); p.p(6, h - 7, '#c2c2cc');
    // angular modern wing: pale stone with a glazed atrium
    boxBuilding(p, 16, 2, w - 19, h - 8, { wall: '#dcd8cc', wallDark: '#b4b0a4', roof: '#cac6ba', roofHi: '#e8e4d8', roofLo: '#a09c90' });
    // glass atrium wedge
    p.r(20, 5, 12, 9, '#7ca6c9');
    for (let x = 21; x < 32; x += 3) p.r(x, 5, 1, 9, '#a8cce0');
    p.outline(20, 5, 12, 9, '#4a6a80');
    // banner columns out front
    for (let i = 0; i < 3; i++) { const bx = 18 + i * 5; p.r(bx, h - 6, 3, 4, i === 1 ? '#c94f4f' : '#4f5fc9'); }
    p.r(16, h - 7, w - 19, 1, '#a09c90');
    e.r(20, 5, 12, 9, '#cfe6ff');
    for (let i = 0; i < 3; i++) e.r(18 + i * 5, h - 6, 3, 1, '#ffd9a0');
  },

  community_center: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#7d9a6e'); p.dither(0, 0, w, h, '#8aa67a', 0.3, seed);
    // low warm-timber hall with a pitched roof
    p.r(2, 6, w - 4, h - 10, '#c9a878');
    p.r(2, h - 5, w - 4, 1, '#a48858');
    p.r(1, 2, w - 2, 5, '#8a5f42');
    p.r(1, 3, w - 2, 1, '#a4785a');
    p.r(1, 6, w - 2, 1, '#6e4a32');
    p.outline(1, 2, w - 2, h - 6, '#3a2a1c');
    // big multipurpose windows + open doors
    for (let i = 0; i < 3; i++) { const wx = 4 + i * 8; p.r(wx, h - 10, 5, 4, '#9cc3dd'); }
    p.r(w - 8, h - 8, 4, 4, '#6e4a32');
    // noticeboard and picnic table
    p.r(3, h - 3, 4, 2, '#a4785a'); p.p(4, h - 3, '#e8e8e2'); p.p(6, h - 2, '#e8e8e2');
    for (let i = 0; i < 3; i++) e.r(4 + i * 8, h - 10, 5, 3, '#ffdca8');
    e.r(w - 8, h - 7, 4, 3, '#ffe9b0');
  },

  solar_array: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#8a8064'); p.dither(0, 0, w, h, '#968c70', 0.3, seed);
    // larger tracked panels in a denser grid than the farm
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const x = 2 + col * 12, y = 2 + row * 12;
        if (x + 10 > w || y + 8 > h) continue;
        p.r(x, y, 10, 7, '#16304f');
        p.r(x, y, 10, 1, '#3d6a9e');
        p.r(x + 1, y + 1, 4, 1, '#7ab0dd');
        for (let i = 1; i < 3; i++) p.r(x, y + i * 2 + 1, 10, 1, '#101f36');
        p.outline(x, y, 10, 7, '#0a1420');
        p.r(x + 4, y + 7, 2, 2, '#54544e'); // tracker post
      }
    }
    // inverter station + transformer yard
    p.r(w - 14, h - 12, 12, 10, '#8a8a92'); p.outline(w - 14, h - 12, 12, 10, '#3a3a42');
    for (let i = 0; i < 3; i++) p.r(w - 12 + i * 4, h - 10, 2, 6, '#6a6a74');
    e.r(w - 12, h - 11, 2, 1, '#7aff9a');
    e.r(3, 3, 3, 1, '#9fd0ff');
  },

  water_reclamation: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#8a8a80'); p.dither(0, 0, w, h, '#96968c', 0.3, seed);
    // three staged basins, progressively clearer
    const shades = ['#4a5a3e', '#2e5f8f', '#4a90c0'];
    for (let i = 0; i < 3; i++) {
      const bx = 4 + i * 14, by = 4;
      p.r(bx, by, 12, 12, '#7d7d75');
      p.r(bx + 1, by + 1, 10, 10, shades[i]);
      p.r(bx + 3, by + 3, 6, 6, i === 2 ? '#6fb3dd' : '#356b9e');
      p.r(bx + 5, by + 1, 1, 10, '#c9c9c2');
      p.r(bx + 1, by + 5, 10, 1, '#c9c9c2');
      p.outline(bx, by, 12, 12, '#3a3a36');
    }
    // membrane hall + pipe gallery
    boxBuilding(p, 4, 20, w - 8, h - 24, { wall: '#8a94a0', wallDark: '#6a7480', roof: '#7a8490', roofHi: '#8c96a2', roofLo: '#5e6874' });
    for (let i = 0; i < 4; i++) p.r(7 + i * 9, 22, 6, 3, '#5f8aa8');
    p.r(2, h - 8, w - 4, 3, '#5f8aa8'); p.outline(2, h - 8, w - 4, 3, '#2e4a5e');
    for (let i = 0; i < 4; i++) e.r(8 + i * 9, h - 6, 2, 1, '#bfe9ff');
    e.r(6, 22, 2, 2, '#7ae9ff');
  },

  park: (p, e, w, h, seed) => {
    const rand = rng(seed);
    p.r(0, 0, w, h, '#4f8a42');
    p.dither(0, 0, w, h, '#5d9a4d', 0.35, seed);
    p.dither(0, 0, w, h, '#437a38', 0.2, seed + 1);
    // pond
    p.r(4, h - 12, 9, 6, '#2e5f8f');
    p.r(5, h - 11, 7, 4, '#356b9e');
    p.r(6, h - 10, 3, 1, '#6fa3cc');
    p.outline(4, h - 12, 9, 6, '#274f6e');
    // winding path
    for (let i = 0; i < w; i++) p.r(i, Math.round(4 + Math.sin(i * 0.35 + seed) * 2), 1, 2, '#b0a48c');
    // benches + flowers
    p.r(w - 8, 4, 3, 1, '#7a5a40'); p.r(w - 8, 5, 1, 1, '#5a4630'); p.r(w - 6, 5, 1, 1, '#5a4630');
    for (let i = 0; i < 8; i++) p.p(2 + Math.floor(rand() * (w - 4)), 2 + Math.floor(rand() * (h - 4)), ['#c9d96a', '#d97ab0', '#e0e07a'][i % 3]);
    // lamp
    p.r(w - 4, h - 6, 1, 4, '#3a3a40'); p.p(w - 4, h - 7, '#ffe9b0');
    e.r(w - 5, h - 8, 3, 2, '#ffe9b0');
  },

  plaza: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#a8a094');
    p.dither(0, 0, w, h, '#b8b0a4', 0.3, seed);
    p.dither(0, 0, w, h, '#948c80', 0.2, seed + 1);
    // paving grid
    for (let i = 0; i < w; i += 4) p.r(i, 0, 1, h, '#948c8055');
    for (let i = 0; i < h; i += 4) p.r(0, i, w, 1, '#948c8055');
    // statue on plinth
    const cx = Math.floor(w / 2);
    p.r(cx - 3, h / 2 - 3, 6, 6, '#8a8a92'); p.outline(cx - 3, h / 2 - 3, 6, 6, '#5f5f68');
    p.r(cx - 1, h / 2 - 6, 2, 5, '#6e6e7a'); p.r(cx - 2, h / 2 - 7, 4, 2, '#7d7d88');
    // flag + lamps
    p.r(2, 2, 1, 5, '#3a3a40'); p.r(3, 2, 3, 2, '#c94f4f');
    p.r(w - 3, h - 7, 1, 5, '#3a3a40'); p.p(w - 3, h - 8, '#ffe9b0');
    e.r(w - 4, h - 9, 3, 2, '#ffe9b0');
    e.r(cx - 1, h / 2 - 6, 2, 2, '#fff2cc'); // uplit statue
  },

  solar_farm: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#7d7458');
    p.dither(0, 0, w, h, '#8a8064', 0.3, seed);
    for (let row = 0; row < 4; row++) {
      const y = 2 + row * 11;
      for (let col = 0; col < 4; col++) {
        const x = 2 + col * 11;
        p.r(x, y, 9, 6, '#1e3a5f');
        p.r(x, y, 9, 1, '#3d6a9e');
        p.r(x + 1, y + 1, 3, 1, '#6fa3cc'); // specular glint
        for (let i = 1; i < 3; i++) p.r(x, y + i * 2, 9, 1, '#16304f');
        p.outline(x, y, 9, 6, '#101c2e');
        p.r(x + 3, y + 6, 3, 1, '#54544e'); // mount
      }
    }
    e.r(3, 3, 2, 1, '#9fd0ff'); // inverter LED
  },

  coal_plant: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#6b665e'); p.dither(0, 0, w, h, '#767066', 0.3, seed);
    boxBuilding(p, 1, 10, w - 2, h - 11, { wall: '#5f5a52', wallDark: '#48443e', roof: '#57534c', roofHi: '#67625a', roofLo: '#413e38' });
    // coal pile
    p.r(3, 3, 10, 6, '#26262a'); p.dither(3, 3, 10, 6, '#38383e', 0.4, seed + 2);
    // twin stacks (drawn tall onto roof)
    p.r(w - 18, 4, 6, 14, '#8a8078'); p.r(w - 18, 4, 6, 2, '#a0968c'); p.outline(w - 18, 4, 6, 14, '#2a2622');
    p.r(w - 9, 6, 6, 12, '#8a8078'); p.r(w - 9, 6, 6, 2, '#a0968c'); p.outline(w - 9, 6, 6, 12, '#2a2622');
    p.r(w - 17, 4, 4, 1, '#c94f4f'); p.r(w - 8, 6, 4, 1, '#c94f4f'); // stack bands
    // facade windows
    windowsOn(p, 2, h - 4, w - 4, 5, '#d9a86a');
    e.r(w - 17, 3, 1, 1, '#ff6a6a'); e.r(w - 6, 5, 1, 1, '#ff6a6a'); // aircraft warning lights
    for (let i = 0; i < 5; i++) e.r(3 + i * 9, h - 4, 2, 2, '#ffc27a');
  },

  nuclear_plant: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#7c8a74'); p.dither(0, 0, w, h, '#89987f', 0.3, seed);
    // containment domes
    for (const [dx, dy] of [[8, 10], [8, 26]] as const) {
      p.r(dx - 6, dy - 6, 13, 13, '#c9c9c2');
      p.r(dx - 6, dy - 6, 13, 3, '#dcdcd4');
      p.r(dx - 6, dy + 5, 13, 2, '#a8a8a0');
      p.r(dx - 3, dy - 6, 3, 2, '#f0f0e8');
      p.outline(dx - 6, dy - 6, 13, 13, '#3a3a36');
    }
    // turbine hall
    boxBuilding(p, 22, 6, w - 26, 26, { wall: '#9aa0aa', wallDark: '#787e88', roof: '#8a92a0', roofHi: '#9aa2b0', roofLo: '#6e7480' });
    // cooling tower footprint
    p.r(24, 38, 18, 18, '#b5b5ae'); p.r(28, 42, 10, 10, '#8a8a84'); p.r(30, 44, 6, 6, '#2e4f6e');
    p.outline(24, 38, 18, 18, '#3a3a36');
    p.r(4, 44, 12, 10, '#6e7a68'); p.outline(4, 44, 12, 10, '#3a3a36'); // switchyard
    for (let i = 0; i < 3; i++) p.r(6 + i * 4, 46, 1, 6, '#4a4a44');
    e.r(30, 8, 2, 2, '#a0ffd0'); e.r(6, 46, 1, 1, '#ffe9a0');
    windowsOn(p, 24, 30, w - 30, 4, '#cfe0f0'); for (let i = 0; i < 4; i++) e.r(26 + i * 9, 30, 2, 2, '#bfe9ff');
  },

  water_plant: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#8a8a80'); p.dither(0, 0, w, h, '#96968c', 0.3, seed);
    // circular treatment basins
    for (const [bx, by] of [[8, 8], [23, 8]] as const) {
      p.r(bx - 6, by - 6, 12, 12, '#7d7d75');
      p.r(bx - 5, by - 5, 10, 10, '#2e5f8f');
      p.r(bx - 3, by - 3, 6, 6, '#356b9e');
      p.r(bx - 1, by - 5, 1, 10, '#c9c9c2'); p.r(bx - 5, by - 1, 10, 1, '#c9c9c2'); // skimmer arms
      p.outline(bx - 6, by - 6, 12, 12, '#3a3a36');
    }
    boxBuilding(p, 2, 18, 12, 12, { wall: '#8a94a0', wallDark: '#6a7480', roof: '#7a8490', roofHi: '#8c96a2', roofLo: '#5e6874' });
    p.r(18, 20, 3, 8, '#5f8aa8'); p.outline(18, 20, 3, 8, '#2e4a5e'); // pipe
    e.r(4, 27, 2, 2, '#bfe9ff');
  },

  hospital: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#9aa89a'); p.dither(0, 0, w, h, '#a8b6a8', 0.3, seed);
    boxBuilding(p, 1, 1, w - 2, h - 4, { wall: '#e8e8e2', wallDark: '#c2c2ba', roof: '#d8d8d0', roofHi: '#efefe8', roofLo: '#b2b2a8' });
    // red cross + helipad
    p.r(6, 6, 8, 8, '#c2c2ba'); p.r(9, 7, 2, 6, '#c94f4f'); p.r(7, 9, 6, 2, '#c94f4f');
    p.r(w - 18, 5, 12, 12, '#8a8a92'); p.outline(w - 18, 5, 12, 12, '#5a5a62');
    p.r(w - 14, 9, 4, 4, '#c9c9c2'); p.p(w - 13, 10, '#5a5a62'); // H
    // ambulance bay + facade windows
    p.r(3, h - 7, 8, 4, '#c2c2ba'); p.r(4, h - 6, 2, 2, '#c94f4f');
    windowsOn(p, 2, h - 6, w - 4, 6, '#9cc3dd');
    for (let i = 0; i < 6; i++) e.r(4 + i * 7, h - 6, 2, 2, '#d0f0ff');
    e.r(9, 7, 2, 6, '#ff8a8a'); e.r(7, 9, 6, 2, '#ff8a8a'); // glowing cross
  },

  factory: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#7d7468'); p.dither(0, 0, w, h, '#8a8074', 0.3, seed);
    // sawtooth roof
    boxBuilding(p, 1, 8, w - 2, h - 9, { wall: '#8a6f5a', wallDark: '#6a543f', roof: '#75604e', roofHi: '#87715e', roofLo: '#584838' });
    for (let i = 0; i < 4; i++) {
      const y = 10 + i * 8;
      p.r(3, y, w - 6, 3, '#9c8672');
      p.r(3, y, w - 6, 1, '#cfe0f0'); // skylight glass
      p.r(3, y + 3, w - 6, 1, '#4a3a2c');
    }
    // stack
    p.r(w - 10, 2, 5, 10, '#8a8078'); p.r(w - 10, 2, 5, 2, '#a0968c'); p.outline(w - 10, 2, 5, 10, '#2a2622');
    // loading dock
    p.r(2, h - 5, 6, 3, '#5f5a52'); p.r(3, h - 4, 4, 2, '#3d3933');
    windowsOn(p, 10, h - 5, w - 12, 4, '#d9a86a');
    for (let i = 0; i < 4; i++) e.r(12 + i * 9, h - 5, 2, 2, '#ffc27a');
    e.r(w - 9, 2, 1, 1, '#ff6a6a');
  },

  auto_factory: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#6e7478'); p.dither(0, 0, w, h, '#7a8084', 0.3, seed);
    boxBuilding(p, 1, 3, w - 2, h - 5, { wall: '#aeb8be', wallDark: '#8c969c', roof: '#9aa4aa', roofHi: '#b2bcc2', roofLo: '#7e888e' });
    // clean logistics yard markings
    p.r(3, h - 2, w - 6, 1, '#d0d860');
    // roof: HVAC + conveyor spine
    p.r(4, 6, w - 8, 3, '#7e888e'); p.r(4, 6, w - 8, 1, '#94a0a6');
    for (let i = 0; i < 4; i++) { p.r(6 + i * 9, 12, 6, 5, '#8c969c'); p.outline(6 + i * 9, 12, 6, 5, '#4e585e'); }
    // robot-arm bay doors on facade, few windows: nobody's home
    for (let i = 0; i < 3; i++) p.r(4 + i * 13, h - 5, 8, 3, '#5e686e');
    p.outline(1, 3, w - 2, h - 5, '#23282c');
    e.r(3, 4, 2, 1, '#7ae9ff'); e.r(w - 6, 4, 2, 1, '#7ae9ff');
    for (let i = 0; i < 3; i++) e.r(6 + i * 13, h - 4, 1, 1, '#7ae9ff'); // door status LEDs
  },

  office: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#8a9098'); p.dither(0, 0, w, h, '#969ca4', 0.25, seed);
    boxBuilding(p, 1, 1, w - 2, h - 3, { wall: '#5e7a94', wallDark: '#46607a', roof: '#54687c', roofHi: '#68809a', roofLo: '#405264' });
    // glass curtain roof detail
    for (let y = 3; y < h - 8; y += 3) p.r(3, y, w - 6, 1, '#7ca6c9');
    p.r(4, 3, 3, 2, '#cfe0f0'); // skylight
    windowsOn(p, 2, h - 5, w - 4, 5, '#9cc3dd');
    for (let i = 0; i < 5; i++) if (i % 3 !== 2) e.r(4 + i * 6, h - 5, 2, 2, '#bfe0ff');
    e.r(2, 2, 1, 1, '#ff6a6a');
  },

  retail: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#948c80'); p.dither(0, 0, w, h, '#a09888', 0.25, seed);
    boxBuilding(p, 1, 4, w - 2, h - 6, { wall: '#c9a86a', wallDark: '#a8875a', roof: '#b8927a', roofHi: '#cca68c', roofLo: '#9a7862' });
    // awnings + signage
    p.r(2, h - 7, 10, 2, '#c94f4f'); p.r(3, h - 7, 2, 2, '#e8e8e2'); p.r(7, h - 7, 2, 2, '#e8e8e2');
    p.r(18, h - 7, 10, 2, '#4f8ac9'); p.r(19, h - 7, 2, 2, '#e8e8e2'); p.r(23, h - 7, 2, 2, '#e8e8e2');
    p.r(3, 1, 8, 3, '#d94fb0'); p.outline(3, 1, 8, 3, '#8a2a70'); // rooftop sign
    windowsOn(p, 2, h - 4, w - 4, 5, '#ffe9b0');
    e.r(3, 1, 8, 3, '#ff7ad0');
    for (let i = 0; i < 5; i++) e.r(4 + i * 6, h - 4, 2, 2, '#ffe9b0');
  },

  edge_dc: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#82827a'); p.dither(0, 0, w, h, '#8e8e86', 0.25, seed);
    boxBuilding(p, 1, 1, w - 2, h - 3, { wall: '#9a9aa2', wallDark: '#7a7a84', roof: '#8a8a94', roofHi: '#9e9ea8', roofLo: '#6e6e78' });
    // rooftop HVAC + fenced yard
    p.r(4, 4, 8, 6, '#7a7a84'); p.outline(4, 4, 8, 6, '#4a4a54');
    p.r(6, 6, 2, 2, '#5a5a64'); p.r(9, 6, 2, 2, '#5a5a64'); // fans
    p.r(20, 5, 7, 5, '#7a7a84'); p.outline(20, 5, 7, 5, '#4a4a54');
    // vent slits on facade, one door, no windows
    p.r(4, h - 5, 2, 3, '#5a5a64');
    for (let i = 0; i < 4; i++) p.r(10 + i * 5, h - 5, 3, 1, '#6a6a74');
    for (let i = 0; i < 4; i++) p.r(10 + i * 5, h - 3, 3, 1, '#6a6a74');
    e.r(4, h - 4, 1, 1, '#7aff9a'); // status LED
    e.r(24, 6, 1, 1, '#7aff9a');
  },

  cloud_dc: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#787880'); p.dither(0, 0, w, h, '#84848c', 0.25, seed);
    boxBuilding(p, 1, 1, w - 2, h - 4, { wall: '#a2a6ae', wallDark: '#82868e', roof: '#92969e', roofHi: '#a6aab2', roofLo: '#767a82' });
    // long server-hall roof ridges
    for (let i = 0; i < 3; i++) { p.r(4, 5 + i * 11, w - 8, 8, '#9ea2aa'); p.r(4, 5 + i * 11, w - 8, 1, '#b2b6be'); p.r(4, 12 + i * 11, w - 8, 1, '#6e727a'); }
    // rooftop chillers along one edge
    for (let i = 0; i < 4; i++) { p.r(5 + i * 10, 2, 7, 3, '#82868e'); p.p(8 + i * 10, 3, '#5e626a'); }
    // security fence + gate
    p.outline(0, 0, w, h, '#5a5a62');
    p.r(2, h - 4, 3, 2, '#5e626a');
    // LED row on facade
    for (let i = 0; i < 10; i++) e.p(4 + i * 4, h - 3, i % 3 === 0 ? '#7ae9ff' : '#4aa8ff');
    e.r(2, h - 4, 1, 1, '#7aff9a');
  },

  gov_dc: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#6e7078'); p.dither(0, 0, w, h, '#7a7c84', 0.25, seed);
    // double security fence with dead zone
    p.outline(0, 0, w, h, '#4a4c54');
    p.outline(2, 2, w - 4, h - 4, '#4a4c54');
    // windowless navy bunker
    boxBuilding(p, 5, 5, w - 10, h - 12, { wall: '#3a4258', wallDark: '#2c3244', roof: '#333a4e', roofHi: '#454e66', roofLo: '#252b3a', outlineC: '#151820' });
    // roof: antenna array + dish
    p.r(9, 9, 1, 6, '#8a8a92'); p.p(9, 8, '#c94f4f');
    p.r(w - 14, 10, 5, 4, '#8a8a92'); p.r(w - 13, 11, 3, 2, '#b0b0b8');
    p.r(20, 12, 6, 5, '#2c3244'); p.outline(20, 12, 6, 5, '#151820');
    // gatehouse
    p.r(w - 10, h - 6, 6, 4, '#565e74'); p.outline(w - 10, h - 6, 6, 4, '#2c3244');
    p.r(w - 8, h - 4, 2, 2, '#8a94b0');
    // single reinforced door, keypad glow
    p.r(10, h - 10, 3, 3, '#2c3244');
    e.p(14, h - 9, '#7aff9a');
    e.p(9, 8, '#ff6a6a');                 // antenna beacon
    for (let i = 0; i < 4; i++) e.p(6 + i * 9, h - 8, '#4aa8ff'); // perimeter status LEDs
  },

  med_dc: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#8a9a94'); p.dither(0, 0, w, h, '#96a6a0', 0.25, seed);
    boxBuilding(p, 1, 1, w - 2, h - 3, { wall: '#e2ecea', wallDark: '#b8c6c2', roof: '#d0dedb', roofHi: '#eaf4f2', roofLo: '#a8b8b4' });
    // teal medical stripe + cross on roof
    p.r(2, 6, w - 4, 2, '#3aa8a0');
    p.r(7, 12, 2, 6, '#3aa8a0'); p.r(5, 14, 6, 2, '#3aa8a0');
    // chiller + vent slits
    p.r(w - 12, 3, 8, 5, '#b8c6c2'); p.outline(w - 12, 3, 8, 5, '#6e7e7a');
    for (let i = 0; i < 3; i++) p.r(w - 11 + i * 2, 4, 1, 3, '#8a9a96');
    // facade: records vault door + status wall
    p.r(4, h - 5, 3, 3, '#6e7e7a');
    for (let i = 0; i < 4; i++) p.r(12 + i * 4, h - 4, 2, 1, '#9cc3dd');
    e.r(7, 12, 2, 6, '#5affe0'); e.r(5, 14, 6, 2, '#5affe0'); // glowing cross
    for (let i = 0; i < 4; i++) e.r(12 + i * 4, h - 4, 2, 1, '#7ae9ff');
  },

  community_dc: (p, e, w, h, seed) => {
    const rand = rng(seed);
    p.r(0, 0, w, h, '#7d8a5e'); p.dither(0, 0, w, h, '#8a9a6a', 0.3, seed);
    // patchwork shed: reused panels in mismatched colors
    boxBuilding(p, 1, 2, w - 2, h - 4, { wall: '#a8926a', wallDark: '#86744e', roof: '#8a7a5c', roofHi: '#9e8e6e', roofLo: '#6e6046' });
    const patches = ['#7a8ac9', '#c97a5a', '#6aa86a', '#c9b05a'];
    for (let i = 0; i < 6; i++) {
      p.r(3 + Math.floor(rand() * (w - 10)), 4 + Math.floor(rand() * 8), 4, 3, patches[i % patches.length]);
    }
    // rooftop: salvaged panel + box fan
    p.r(4, 4, 8, 5, '#1e3a5f'); p.r(4, 4, 8, 1, '#3d6a9e'); p.outline(4, 4, 8, 5, '#101c2e');
    p.r(w - 10, 5, 5, 5, '#86744e'); p.r(w - 9, 6, 3, 3, '#5e5036'); p.p(w - 8, 7, '#2e2a20');
    // mural stripe + open door + bikes
    p.r(2, h - 6, w - 12, 1, '#c97ab0'); p.r(2, h - 5, w - 12, 1, '#7ac9c9');
    p.r(w - 8, h - 6, 3, 4, '#5e5036');
    p.r(3, h - 2, 4, 1, '#3a3a40'); p.p(4, h - 3, '#3a3a40'); p.p(6, h - 3, '#3a3a40');
    e.r(w - 8, h - 5, 3, 2, '#ffd9a0'); // warm open doorway
    for (let i = 0; i < 3; i++) e.p(14 + i * 3, h - 4, '#7aff9a'); // mismatched status LEDs
  },

  ai_campus: (p, e, w, h, seed) => {
    p.r(0, 0, w, h, '#6a6a74'); p.dither(0, 0, w, h, '#76767e', 0.25, seed);
    // main slab
    boxBuilding(p, 1, 1, w - 2, 40, { wall: '#3a3e4a', wallDark: '#2a2e38', roof: '#333744', roofHi: '#454a58', roofLo: '#23262e', outlineC: '#14161c' });
    // roof: dense chiller field
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 6; col++) {
        const x = 4 + col * 10, y = 5 + row * 11;
        p.r(x, y, 7, 7, '#2e323e'); p.outline(x, y, 7, 7, '#171a20');
        p.r(x + 2, y + 2, 3, 3, '#454a58'); p.p(x + 3, y + 3, '#1e2128');
      }
    // cooling towers (steam sources) along south yard
    for (let i = 0; i < 3; i++) {
      const x = 6 + i * 20;
      p.r(x, 44, 12, 14, '#8a8a92'); p.r(x + 2, 46, 8, 10, '#6e6e78'); p.r(x + 3, 47, 6, 6, '#3a4a5a');
      p.outline(x, 44, 12, 14, '#2a2a32');
    }
    // substation corner
    p.r(w - 14, 44, 12, 14, '#54545e'); p.outline(w - 14, 44, 12, 14, '#2a2a32');
    for (let i = 0; i < 3; i++) p.r(w - 12 + i * 4, 46, 1, 8, '#8a8a92');
    // facade: blue-white server-light strips
    for (let i = 0; i < 14; i++) e.p(3 + i * 4, 38, i % 4 === 0 ? '#d0f0ff' : '#4aa8ff');
    for (let i = 0; i < 14; i++) e.p(5 + i * 4, 39, i % 3 === 0 ? '#7ae9ff' : '#2a6aff');
    // roof beacon + logo
    p.r(w - 10, 3, 6, 4, '#e8e8f0'); p.r(w - 9, 4, 4, 2, '#4aa8ff');
    e.r(w - 9, 4, 4, 2, '#7ac0ff');
    e.r(2, 2, 1, 1, '#ff6a6a');
  },
};

export function makeBuildingSprites(): Map<BuildingType, Sprite> {
  const out = new Map<BuildingType, Sprite>();
  for (const type of Object.keys(DRAWERS) as BuildingType[]) {
    if (BUILDING_DEFS[type].roadType !== undefined) continue;
    const def = BUILDING_DEFS[type];
    const w = def.w * TILE, h = def.h * TILE;
    const [ac, actx] = canvas(w, h);
    const [ec, ectx] = canvas(w, h);
    DRAWERS[type](new Px(actx), new Px(ectx), w, h, type.length * 31 + 7);
    out.set(type, { albedo: ac, emissive: ec });
  }
  return out;
}

/** Construction-site overlay for a w×h tile footprint. */
export function makeConstructionSprite(wTiles: number, hTiles: number): HTMLCanvasElement {
  const w = wTiles * TILE, h = hTiles * TILE;
  const [c, ctx] = canvas(w, h);
  const p = new Px(ctx);
  p.r(0, 0, w, h, '#7d6a50');
  p.dither(0, 0, w, h, '#8d7a5e', 0.35, 999);
  p.dither(0, 0, w, h, '#6a5a44', 0.25, 998);
  // perimeter fencing
  for (let i = 0; i < w; i += 3) { p.p(i, 0, '#c9a84a'); p.p(i + 1, 0, '#3a3a40'); p.p(i, h - 1, '#c9a84a'); p.p(i + 1, h - 1, '#3a3a40'); }
  for (let i = 0; i < h; i += 3) { p.p(0, i, '#c9a84a'); p.p(0, i + 1, '#3a3a40'); p.p(w - 1, i, '#c9a84a'); p.p(w - 1, i + 1, '#3a3a40'); }
  // materials + frame
  p.r(3, h - 7, 6, 4, '#9a8a6e'); p.r(4, h - 8, 4, 1, '#9a8a6e');
  p.r(w - 10, 3, 7, 5, '#8a8078');
  const fx = Math.floor(w / 2) - 4;
  p.r(fx, 6, 8, 1, '#b89b58'); p.r(fx, 10, 8, 1, '#b89b58');
  p.r(fx, 6, 1, 8, '#b89b58'); p.r(fx + 7, 6, 1, 8, '#b89b58'); p.r(fx + 3, 6, 1, 8, '#a8894a');
  return c;
}

// Small moving things -------------------------------------------------------

export function makeCarSprites(): HTMLCanvasElement[] {
  const colors = ['#c94f4f', '#4f8ac9', '#d9d9d0', '#3a3a40', '#c9a84a', '#5f9a54'];
  return colors.map((col, i) => {
    const [c, ctx] = canvas(5, 3);
    const p = new Px(ctx);
    p.r(0, 0, 5, 3, col);
    p.r(1, 0, 1, 3, '#cfe0f0');
    p.p(0, 0, '#00000055'); p.p(0, 2, '#00000055');
    p.p(4, 0, '#00000033'); p.p(4, 2, '#00000033');
    return c;
  });
}

export function makePedestrianSprites(): HTMLCanvasElement[] {
  const tones = ['#d9b08c', '#a8795a', '#8c5a3c', '#e8c9a0'];
  const shirts = ['#c94f4f', '#4f8ac9', '#5f9a54', '#c9a84a', '#8a5fc9', '#d9d9d0'];
  const out: HTMLCanvasElement[] = [];
  for (let i = 0; i < 8; i++) {
    const [c, ctx] = canvas(2, 3);
    const p = new Px(ctx);
    p.r(0, 1, 2, 2, shirts[i % shirts.length]);
    p.r(0, 0, 2, 1, tones[i % tones.length]);
    out.push(c);
  }
  return out;
}

// Kept copies ---------------------------------------------------------------
//
// Every atlas above is drawn once and then only ever read from — `drawImage`
// sources, never draw targets — so there is no reason for two of anything.
// Until now there were: the guide builds a second Renderer for its walkthrough
// scene, and paid for the whole set again to do it.
//
// The reason they are here rather than inlined into the Renderer's constructor
// is the boot screen. It draws these while the player is reading the title, and
// the Renderer built afterwards has to get *those* canvases rather than an
// identical second set — otherwise the loading bar is measuring work that gets
// thrown away, which is a worse lie than not having a loading bar.

let _terrain: TerrainSprites | null = null;
let _roads: HTMLCanvasElement[][] | null = null;
let _buildings: Map<BuildingType, Sprite> | null = null;
let _cars: HTMLCanvasElement[] | null = null;
let _peds: HTMLCanvasElement[] | null = null;

export function terrainSprites(): TerrainSprites { return (_terrain ??= makeTerrain()); }
export function roadSprites(): HTMLCanvasElement[][] { return (_roads ??= makeRoads()); }
export function buildingSprites(): Map<BuildingType, Sprite> { return (_buildings ??= makeBuildingSprites()); }
export function carSprites(): HTMLCanvasElement[] { return (_cars ??= makeCarSprites()); }
export function pedestrianSprites(): HTMLCanvasElement[] { return (_peds ??= makePedestrianSprites()); }

/** True once every atlas has been drawn. The boot bar's last honest word. */
export function spritesReady(): boolean {
  return !!(_terrain && _roads && _buildings && _cars && _peds);
}
