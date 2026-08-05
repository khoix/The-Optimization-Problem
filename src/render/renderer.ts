// The HD-2D pipeline. Pixel art is rendered crisp at native resolution onto a
// low-res canvas, then passed through a modern grading stack: dynamic ambient
// light, point lights, emissive bloom, weather, tilt-shift depth of field,
// era-based color grading, and a vignette.

import type { BuildingType, GameState } from '../game/types';
import { BUILDING_DEFS } from '../game/buildings';
import {
  TILE, makeTerrain, makeRoads, makeBuildingSprites, makeConstructionSprite,
  makeCarSprites, makePedestrianSprites, type TerrainSprites, type Sprite,
} from './sprites';
import { AmbientLife } from './agents';
import { computeConnectivity, computeCoverage, covered } from '../game/network';
import { heightOf, makeFacade, parallaxShift, OCCLUDING_HEIGHT, type Facade } from './height';

/** Diagnostic map layers. Each answers one question a dark district raises. */
export type OverlayId = 'power' | 'water' | 'roads' | 'pollution';

export interface UiRenderState {
  hoverTile: [number, number] | null;
  buildType: BuildingType | null;
  canPlaceHere: boolean;
  selectedBuildingId: number | null;
  overlay: OverlayId | null;
}

interface PointLight { x: number; y: number; r: number; color: string; intensity: number; }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Ambient light keyframes across 24h: [hour, r, g, b]. */
const AMBIENT_KEYS: Array<[number, number, number, number]> = [
  [0, 44, 54, 96],
  [4.5, 50, 58, 104],
  [6, 200, 140, 110],
  [8, 244, 226, 200],
  [12, 255, 250, 238],
  [16, 250, 236, 210],
  [18.5, 235, 160, 110],
  [20, 110, 90, 140],
  [21.5, 54, 62, 106],
  [24, 44, 54, 96],
];

function ambientAt(hour: number): [number, number, number] {
  for (let i = 0; i < AMBIENT_KEYS.length - 1; i++) {
    const a = AMBIENT_KEYS[i], b = AMBIENT_KEYS[i + 1];
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / (b[0] - a[0] || 1);
      return [lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
    }
  }
  return [255, 255, 255];
}

export class Renderer {
  camX = 0; camY = 0; zoom = 2;
  hour = 9;               // time of day, driven by main loop
  rain = 0;               // 0..1
  snowing = false;        // winter precipitation renders as snow
  private rainTarget = 0;
  private weatherTimer = 20;

  life = new AmbientLife();

  private screen: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  private world!: HTMLCanvasElement;
  private wctx!: CanvasRenderingContext2D;
  private light!: HTMLCanvasElement;
  private lctx!: CanvasRenderingContext2D;
  private emiss!: HTMLCanvasElement;
  private ectx!: CanvasRenderingContext2D;
  private blurTmp!: HTMLCanvasElement;   // half-res, for tilt-shift
  private bctx!: CanvasRenderingContext2D;
  private bloomTmp!: HTMLCanvasElement;  // low-res, pre-blurred emissive
  private blctx!: CanvasRenderingContext2D;

  private terrain: TerrainSprites;
  private roads: HTMLCanvasElement[][];
  private terrainCache: HTMLCanvasElement | null = null;
  private cachedMapVersion = -1;
  private buildings: Map<BuildingType, Sprite>;
  private construction = new Map<string, HTMLCanvasElement>();
  private cars: HTMLCanvasElement[];
  private peds: HTMLCanvasElement[];
  private clouds: HTMLCanvasElement;
  private t = 0; // animation clock (real seconds, scaled by game speed)

  constructor(screen: HTMLCanvasElement) {
    this.screen = screen;
    this.sctx = screen.getContext('2d')!;
    this.terrain = makeTerrain();
    this.roads = makeRoads();
    this.buildings = makeBuildingSprites();
    this.cars = makeCarSprites();
    this.peds = makePedestrianSprites();
    this.clouds = this.makeCloudShadow();
    this.resize();
  }

  resize(): void {
    this.screen.width = this.screen.clientWidth;
    this.screen.height = this.screen.clientHeight;
    const w = Math.ceil(this.screen.width / this.zoom) + TILE * 2;
    const h = Math.ceil(this.screen.height / this.zoom) + TILE * 2;
    const mk = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      return [c, ctx];
    };
    [this.world, this.wctx] = mk();
    [this.light, this.lctx] = mk();
    [this.emiss, this.ectx] = mk();
    // Half-res scratch for the tilt-shift blur: 4× cheaper than full-screen.
    this.blurTmp = document.createElement('canvas');
    this.blurTmp.width = Math.ceil(this.screen.width / 2);
    this.blurTmp.height = Math.ceil(this.screen.height / 2);
    this.bctx = this.blurTmp.getContext('2d')!;
    // Low-res scratch for bloom: blur once at world resolution, scale after.
    [this.bloomTmp, this.blctx] = mk();
    this.sctx.imageSmoothingEnabled = false;
  }

  setZoom(z: number, cx: number, cy: number): void {
    const [wx, wy] = this.screenToWorld(cx, cy);
    this.zoom = Math.max(2, Math.min(5, z));
    this.resize();
    // keep the point under the cursor fixed
    this.camX = wx - cx / this.zoom;
    this.camY = wy - cy / this.zoom;
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [this.camX + sx / this.zoom, this.camY + sy / this.zoom];
  }

  centerOn(tx: number, ty: number): void {
    this.camX = tx * TILE - this.screen.width / this.zoom / 2;
    this.camY = ty * TILE - this.screen.height / this.zoom / 2;
  }

  /** 0 winter, 1 spring, 2 summer, 3 autumn — from the simulation month. */
  static seasonOf(tick: number): number {
    const m = tick % 12;
    return m === 11 || m < 2 ? 0 : m < 5 ? 1 : m < 8 ? 2 : 3;
  }

  update(g: GameState, dt: number, simSpeedMul: number): void {
    this.t += dt * Math.max(0.2, simSpeedMul);
    this.snowing = Renderer.seasonOf(g.tick) === 0 && this.rain > 0.05;
    // Weather drifts; observer mode is meteorologically serene.
    this.weatherTimer -= dt * simSpeedMul;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 25 + Math.random() * 40;
      const wetChance = Renderer.seasonOf(g.tick) === 2 ? 0.22 : 0.34;
      this.rainTarget = g.asi.observer ? 0 : (Math.random() < wetChance ? 0.4 + Math.random() * 0.6 : 0);
    }
    this.rain += (this.rainTarget - this.rain) * dt * 0.4;
    if (this.rain < 0.01) this.rain = 0;
    this.life.update(g, dt * simSpeedMul, this.rain, this.nightFactor(), this.snowing);
  }

  /** Lazily built front walls, keyed off each roof sprite's own palette. */
  private facades = new Map<BuildingType, Facade | null>();
  private facadeFor(type: BuildingType): Facade | null {
    if (!this.facades.has(type)) {
      const spr = this.buildings.get(type);
      this.facades.set(type, spr ? makeFacade(type, spr.albedo) : null);
    }
    return this.facades.get(type) ?? null;
  }

  render(g: GameState, ui: UiRenderState): void {
    const W = this.world.width, H = this.world.height;
    this.clampCamera(g);
    const camX = Math.floor(this.camX), camY = Math.floor(this.camY);
    const w = this.wctx;

    // ------------------------------------------------------------ terrain
    // Static ground (grass/sand/rock + roads) is baked into a full-map cache
    // and blitted in one draw; only animated water and dynamic overlays are
    // drawn per-frame. The cache rebuilds when the map actually changes.
    const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(g.mapW - 1, Math.ceil((camX + W) / TILE)), y1 = Math.min(g.mapH - 1, Math.ceil((camY + H) / TILE));
    w.fillStyle = '#1a2430';
    w.fillRect(0, 0, W, H);
    if (g.mapVersion !== this.cachedMapVersion) this.rebuildTerrainCache(g);
    w.drawImage(this.terrainCache!, camX, camY, W, H, 0, 0, W, H);

    const waterFrame = ((Math.floor(this.t * 2.2) % 3) + 3) % 3;
    const wetRoads = this.rain > 0.25 && !this.snowing;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = g.map[ty * g.mapW + tx];
        const dx = tx * TILE - camX, dy = ty * TILE - camY;
        if (tile.terrain === 'water') {
          w.drawImage(this.terrain.water[waterFrame], dx, dy);
        } else if (wetRoads && tile.road) {
          w.fillStyle = `rgba(150,180,230,${(0.09 * this.rain).toFixed(3)})`;
          w.fillRect(dx, dy, TILE, TILE);
        }
      }
    }

    const nightF = this.nightFactor();

    // ------------------------------------------------------------ agents
    // Drawn before the buildings, not after: with the height axis a tall
    // building's mass now covers ground behind it, and a car on that street
    // must be hidden by the tower rather than painted over its facade. Mass
    // only ever extends upward from a footprint, so anything in front of a
    // building is still drawn over it by the building pass that follows.
    for (const a of this.life.agents) {
      const dx = Math.round(a.x - camX), dy = Math.round(a.y - camY);
      if (dx < -8 || dy < -8 || dx > W + 8 || dy > H + 8) continue;
      if (a.kind === 'car') {
        const spr = this.cars[a.variant % this.cars.length];
        w.save();
        w.translate(dx, dy);
        if (a.dir === 0) w.rotate(-Math.PI / 2);
        else if (a.dir === 2) w.rotate(Math.PI / 2);
        else if (a.dir === 3) w.scale(-1, 1);
        w.drawImage(spr, -2, -1);
        w.restore();
        if (nightF > 0.3) { // headlights
          this.ectx.globalAlpha = nightF * 0.8;
          this.ectx.fillStyle = '#ffe9b0';
          this.ectx.fillRect(dx + (a.dir === 1 ? 2 : a.dir === 3 ? -3 : 0), dy + (a.dir === 2 ? 2 : a.dir === 0 ? -3 : 0), 1, 1);
          this.ectx.globalAlpha = 1;
        }
      } else {
        w.drawImage(this.peds[a.variant % this.peds.length], dx - 1, dy - 1);
      }
    }

    // ------------------------------------------------------------ buildings
    this.ectx.clearRect(0, 0, W, H);
    // Sorted by the base of the footprint: with roofs lifted, what matters for
    // occlusion is where a building stands, not where its top is drawn.
    const sorted = [...g.buildings.values()]
      .sort((a, b) => (a.y + BUILDING_DEFS[a.type].h) - (b.y + BUILDING_DEFS[b.type].h));

    // Shadow & ambient-occlusion pass: contact AO hugs every footprint, and
    // the cast shadow tracks the sun — long to the west at dawn, short at
    // noon, long to the east at dusk. This is the height-map response the
    // sprites themselves can't bake in.
    const sunT = Math.max(-1, Math.min(1, (this.hour - 12) / 6)); // -1 dawn .. +1 dusk
    const dayF = 1 - nightF;
    for (const b of sorted) {
      if (b.progress < 1) continue;
      const def = BUILDING_DEFS[b.type];
      const dx = b.x * TILE - camX, dy = b.y * TILE - camY;
      const bw = def.w * TILE, bh = def.h * TILE;
      if (dx + bw < -20 || dy + bh < -20 || dx > W + 20 || dy > H + 20) continue;
      // contact AO: three feathered rings
      for (let ring = 1; ring <= 3; ring++) {
        w.fillStyle = `rgba(8,12,18,${(0.16 / ring).toFixed(3)})`;
        w.fillRect(dx - ring, dy - ring, bw + ring * 2, ring);              // top
        w.fillRect(dx - ring, dy + bh, bw + ring * 2, ring);                // bottom
        w.fillRect(dx - ring, dy, ring, bh);                                // left
        w.fillRect(dx + bw, dy, ring, bh);                                  // right
      }
      // directional sun shadow (none at night; the point lights take over)
      if (dayF > 0.1) {
        // Shadow length now comes from the building's actual height, not from
        // its footprint depth — a tower throws a tower's shadow.
        const bhPx = heightOf(b.type);
        const len = (2 + Math.abs(sunT) ** 1.5 * 4) * (0.5 + bhPx * 0.14);
        const sdx = sunT * len;
        w.fillStyle = `rgba(10,14,22,${(0.24 * dayF).toFixed(3)})`;
        w.fillRect(dx + sdx, dy + 2 + bh * 0.12, bw, bh);
      }
    }

    for (const b of sorted) {
      const def = BUILDING_DEFS[b.type];
      const dx = b.x * TILE - camX, dy = b.y * TILE - camY;
      if (dx + def.w * TILE < 0 || dy + def.h * TILE < 0 || dx > W || dy > H) continue;
      const spr = this.buildings.get(b.type);
      if (!spr) continue;
      if (b.progress < 1) {
        w.drawImage(this.constructionFor(def.w, def.h), dx, dy);
        if (b.progress > 0.5) {
          w.globalAlpha = (b.progress - 0.5) * 2 * 0.8;
          w.drawImage(spr.albedo, dx, dy);
          w.globalAlpha = 1;
        }
        continue;
      }
      // Height pass. The roof rises by the building's height, sheared by its
      // distance off the optical axis; the facade fills the gap down to the
      // footprint the building actually stands on.
      const bhPx = heightOf(b.type);
      const [px, py] = parallaxShift(dx, dy, bhPx, W, H);
      const rx = dx + px, ry = dy - bhPx + py;
      const fac = this.facadeFor(b.type);
      // Occlusion relief. Mass that can hide ground goes translucent while a
      // build tool is out, so a tower never costs the player the tiles behind
      // it. Without this the height axis would make the map less usable than
      // it was flat.
      const occluding = bhPx >= OCCLUDING_HEIGHT;
      const relief = occluding && ui.buildType !== null ? 0.42 : 1;
      if (relief < 1) w.globalAlpha = relief;
      if (fac) {
        // Wall spans from the lifted roof's lower edge to the ground footprint,
        // stretched so it stays attached under any parallax offset.
        const wallTop = ry + def.h * TILE;
        const wallBottom = dy + def.h * TILE;
        if (wallBottom > wallTop) {
          w.drawImage(fac.albedo, rx, wallTop, def.w * TILE, wallBottom - wallTop);
        }
      }
      w.drawImage(spr.albedo, rx, ry);
      // sun-facing rim light + far-side shade: the poor man's normal map
      if (dayF > 0.15 && Math.abs(sunT) > 0.15) {
        const bw = def.w * TILE, bh = def.h * TILE;
        const sunEdge = sunT < 0 ? rx + bw - 1 : rx; // sun east at dawn lights the east edge
        const darkEdge = sunT < 0 ? rx : rx + bw - 1;
        // The lit edge runs the full mass, roof and wall together.
        const lit = bh + Math.max(0, (dy + bh) - (ry + bh));
        w.fillStyle = `rgba(255,240,205,${(0.16 * dayF * Math.abs(sunT)).toFixed(3)})`;
        w.fillRect(sunEdge, ry + 1, 1, lit - 2);
        w.fillStyle = `rgba(10,16,30,${(0.18 * dayF * Math.abs(sunT)).toFixed(3)})`;
        w.fillRect(darkEdge, ry + 1, 1, lit - 2);
      }
      this.drawEvolutionDetails(g, b, rx, ry, nightF);
      if (!b.active) {
        w.fillStyle = 'rgba(20,20,28,0.45)';
        w.fillRect(rx, ry, def.w * TILE, def.h * TILE);
        if (fac) w.fillRect(rx, ry + def.h * TILE, def.w * TILE, Math.max(0, (dy + def.h * TILE) - (ry + def.h * TILE)));
      }
      if (relief < 1) w.globalAlpha = 1;
      // The footprint is where the building legally stands, which is no longer
      // where its mass is drawn. Tall buildings get a base line so placement,
      // demolition and the service radius are never ambiguous.
      if (occluding) {
        w.fillStyle = `rgba(150,180,220,${ui.buildType !== null ? 0.5 : 0.16})`;
        w.fillRect(dx, dy + def.h * TILE - 1, def.w * TILE, 1);
      }
      // emissive: windows at night; server LEDs always, blinking
      if (spr.emissive && b.active) {
        const isCompute = def.category === 'compute';
        const blink = isCompute ? 0.55 + 0.45 * Math.sin(this.t * 6 + b.id * 2.1) : 1;
        const strength = isCompute ? 0.35 + nightF * 0.65 : nightF;
        if (strength > 0.05) {
          const a = strength * blink;
          w.globalAlpha = a;
          w.drawImage(spr.emissive, rx, ry);
          w.globalAlpha = 1;
          this.ectx.globalAlpha = a;
          this.ectx.drawImage(spr.emissive, rx, ry);
          this.ectx.globalAlpha = 1;
          // Facade windows join the same bloom pass, so towers light up at night.
          if (fac) {
            const wallTop = ry + def.h * TILE, wallBottom = dy + def.h * TILE;
            if (wallBottom > wallTop) {
              w.globalAlpha = a;
              w.drawImage(fac.emissive, rx, wallTop, def.w * TILE, wallBottom - wallTop);
              w.globalAlpha = 1;
              this.ectx.globalAlpha = a;
              this.ectx.drawImage(fac.emissive, rx, wallTop, def.w * TILE, wallBottom - wallTop);
              this.ectx.globalAlpha = 1;
            }
          }
        }
      }
      if (b.asiBuilt && g.asi.phase < 6) {
        // a barely-noticeable marker: these were not commissioned by you
        w.fillStyle = 'rgba(122,233,255,0.5)';
        w.fillRect(dx, dy, 2, 1);
      }
    }

    // ------------------------------------------------------------ trees (with wind sway)
    const wind = 0.7 + this.rain * 1.6;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = g.map[ty * g.mapW + tx];
        if (tile.terrain !== 'forest') continue;
        // Chronic pollution kills the canopy: past the threshold the tree
        // stands bare, and bare trees barely sway.
        const dead = tile.pollution > 0.22;
        const sway = dead ? 0 : Math.round(Math.sin(this.t * 1.6 + (tx * 7 + ty * 13) * 0.37) * wind);
        const dx = tx * TILE - camX + sway, dy = ty * TILE - camY - 4;
        w.drawImage((dead ? this.terrain.treeDead : this.terrain.tree)[tile.variant % 3], dx, dy);
      }
    }

    // ------------------------------------------------------------ water reflections
    // Screen-space reflections, pixel-art style: each water tile mirrors the
    // strip above it with a slow wobble. At night the mirrored emissives read
    // as city lights on the river.
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = g.map[ty * g.mapW + tx];
        if (tile.terrain !== 'water') continue;
        const above = ty > 0 ? g.map[(ty - 1) * g.mapW + tx] : null;
        if (!above || (above.terrain === 'water' && above.buildingId === -1)) continue;
        const dx = tx * TILE - camX, dy = ty * TILE - camY;
        if (dy - TILE < 0) continue; // source strip must be on-canvas
        const wob = Math.round(Math.sin(this.t * 1.7 + ty * 0.8) * 1);
        w.save();
        w.globalAlpha = 0.15 + nightF * 0.12;
        w.translate(dx, dy);
        w.scale(1, -1);
        w.drawImage(this.world, dx + wob, dy - TILE, TILE, TILE, 0, -TILE, TILE, TILE);
        w.restore();
      }
    }

    // ------------------------------------------------------------ pollution haze
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const pol = g.map[ty * g.mapW + tx].pollution;
        if (pol > 0.04) {
          w.fillStyle = `rgba(82,78,68,${Math.min(0.26, pol * 0.38)})`;
          w.fillRect(tx * TILE - camX, ty * TILE - camY, TILE, TILE);
        }
      }
    }

    // ------------------------------------------------------------ particles
    for (const pt of this.life.particles) {
      const dx = Math.round(pt.x - camX), dy = Math.round(pt.y - camY);
      if (dx < -4 || dy < -4 || dx > W || dy > H) continue;
      const lifeT = pt.life / pt.maxLife;
      if (pt.kind === 'rain') {
        w.strokeStyle = 'rgba(180,200,230,0.5)';
        w.beginPath(); w.moveTo(dx, dy); w.lineTo(dx - 1, dy + 3); w.stroke();
      } else if (pt.kind === 'snow') {
        w.fillStyle = `rgba(240,246,252,${(0.75 * lifeT + 0.2).toFixed(2)})`;
        w.fillRect(dx, dy, 1, 1);
        if (pt.life > pt.maxLife * 0.5) w.fillRect(dx + 1, dy, 1, 1);
      } else {
        const size = pt.kind === 'steam' ? 2 + (1 - lifeT) * 4 : 2 + (1 - lifeT) * 3;
        w.fillStyle = pt.kind === 'steam'
          ? `rgba(235,240,245,${0.4 * lifeT})`
          : `rgba(70,68,66,${0.45 * lifeT})`;
        w.fillRect(dx - size / 2, dy - size / 2, size, size);
      }
    }

    // ------------------------------------------------------------ cloud shadows
    if (this.rain < 0.4) {
      const cw = this.clouds.width;
      w.globalAlpha = 0.5 * (1 - nightF * 0.8);
      const drift = (this.t * 4) % (g.mapW * TILE + cw * 2);
      w.drawImage(this.clouds, drift - cw - camX, g.mapH * TILE * 0.2 - camY);
      w.drawImage(this.clouds, drift * 0.7 - cw - camX + 300, g.mapH * TILE * 0.6 - camY);
      w.globalAlpha = 1;
    }

    // ------------------------------------------------------------ diagnostics
    // Drawn under the build cursor so placing while a layer is up still reads.
    if (ui.overlay) this.drawOverlay(w, g, ui.overlay, camX, camY, x0, y0, x1, y1);

    // ------------------------------------------------------------ build cursor
    if (ui.buildType && ui.hoverTile) {
      const def = BUILDING_DEFS[ui.buildType];
      const dx = ui.hoverTile[0] * TILE - camX, dy = ui.hoverTile[1] * TILE - camY;
      const spr = this.buildings.get(ui.buildType);
      // Utilities preview the area they would serve.
      if (def.serviceRadius) {
        this.drawServiceArea(w, ui.hoverTile[0], ui.hoverTile[1], def.w, def.h, def.serviceRadius,
          camX, camY, def.power > 0 ? 'power' : 'water');
      }
      // The ghost previews the mass it will actually occupy — lifted, with its
      // wall — while the coloured footprint stays on the ground, because that
      // is the tile the click lands on. Showing only one of the two would make
      // either the placement or the skyline a surprise.
      const ghostH = heightOf(ui.buildType);
      const [gpx, gpy] = parallaxShift(dx, dy, ghostH, W, H);
      const grx = dx + gpx, gry = dy - ghostH + gpy;
      const gFac = this.facadeFor(ui.buildType);
      w.globalAlpha = 0.55;
      if (gFac) {
        const top = gry + def.h * TILE, bottom = dy + def.h * TILE;
        if (bottom > top) w.drawImage(gFac.albedo, grx, top, def.w * TILE, bottom - top);
      }
      if (spr) w.drawImage(spr.albedo, grx, gry);
      w.globalAlpha = 1;
      w.fillStyle = ui.canPlaceHere ? 'rgba(110,220,130,0.3)' : 'rgba(220,80,80,0.4)';
      w.fillRect(dx, dy, def.w * TILE, def.h * TILE);
      w.strokeStyle = ui.canPlaceHere ? '#6edc82' : '#dc5050';
      w.strokeRect(dx + 0.5, dy + 0.5, def.w * TILE - 1, def.h * TILE - 1);
    }
    if (ui.selectedBuildingId != null) {
      const b = g.buildings.get(ui.selectedBuildingId);
      if (b) {
        const def = BUILDING_DEFS[b.type];
        if (def.serviceRadius) {
          this.drawServiceArea(w, b.x, b.y, def.w, def.h, def.serviceRadius, camX, camY,
            def.power > 0 ? 'power' : 'water');
        }
        const sdx = b.x * TILE - camX, sdy = b.y * TILE - camY;
        const sh = heightOf(b.type);
        const [spx, spy] = parallaxShift(sdx, sdy, sh, W, H);
        // Solid on the ground it occupies, faint around the mass above it.
        w.strokeStyle = '#ffffff';
        w.strokeRect(sdx + 0.5, sdy + 0.5, def.w * TILE - 1, def.h * TILE - 1);
        if (sh > 0) {
          w.strokeStyle = 'rgba(255,255,255,0.4)';
          w.strokeRect(sdx + spx + 0.5, sdy - sh + spy + 0.5, def.w * TILE - 1, def.h * TILE - 1);
        }
      }
    }

    // Buildings that are complete but idle get a diagnostic badge, so a dark
    // district explains itself without a click.
    for (const b of sorted) {
      if (b.progress < 1 || b.active || !b.offlineReason) continue;
      const def = BUILDING_DEFS[b.type];
      const dx = b.x * TILE - camX, dy = b.y * TILE - camY;
      if (dx + def.w * TILE < 0 || dy + def.h * TILE < 0 || dx > W || dy > H) continue;
      const bh2 = heightOf(b.type);
      const [bpx, bpy] = parallaxShift(dx, dy, bh2, W, H);
      const cx = dx + bpx + def.w * TILE / 2 - 3;
      const cy = dy - bh2 + bpy + def.h * TILE / 2 - 4;
      const color = b.offlineReason === 'road' || b.offlineReason === 'labor' ? '#e8c85a' : '#e86a5a';
      w.fillStyle = 'rgba(12,14,20,0.72)';
      w.fillRect(cx - 2, cy - 2, 10, 12);
      w.fillStyle = color;
      w.fillRect(cx + 2, cy, 2, 6);
      w.fillRect(cx + 2, cy + 7, 2, 2);
    }

    // ------------------------------------------------------------ lighting pass
    const [ar, ag, ab] = ambientAt(this.hour);
    const rainDim = 1 - this.rain * 0.25;
    const l = this.lctx;
    l.globalCompositeOperation = 'source-over';
    l.fillStyle = `rgb(${Math.round(ar * rainDim)},${Math.round(ag * rainDim)},${Math.round(ab * rainDim)})`;
    l.fillRect(0, 0, W, H);
    if (nightF > 0.05) {
      l.globalCompositeOperation = 'lighter';
      for (const pl of this.collectLights(g, camX, camY, W, H)) {
        const grad = l.createRadialGradient(pl.x, pl.y, 1, pl.x, pl.y, pl.r);
        grad.addColorStop(0, pl.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        l.globalAlpha = pl.intensity * nightF;
        l.fillStyle = grad;
        l.fillRect(pl.x - pl.r, pl.y - pl.r, pl.r * 2, pl.r * 2);
      }
      l.globalAlpha = 1;
      l.globalCompositeOperation = 'source-over';
    }
    w.globalCompositeOperation = 'multiply';
    w.drawImage(this.light, 0, 0);
    w.globalCompositeOperation = 'source-over';

    // ------------------------------------------------------------ compose to screen
    const s = this.sctx;
    const sw = this.screen.width, sh = this.screen.height;
    s.imageSmoothingEnabled = false;
    // era + season grading applied at world resolution (cheap), then a crisp
    // unfiltered pixel upscale
    this.blctx.clearRect(0, 0, W, H);
    this.blctx.filter = this.gradeFilter(g);
    this.blctx.drawImage(this.world, 0, 0);
    this.blctx.filter = 'none';
    const fx = (this.camX - camX) * this.zoom, fy = (this.camY - camY) * this.zoom;
    s.drawImage(this.bloomTmp, 0, 0, W, H, -fx, -fy, W * this.zoom, H * this.zoom);

    // bloom: blur the emissive once at low (world) resolution, then let the
    // pixel upscale spread it — far cheaper than filtering at screen size.
    const bloomStrength = 0.25 + nightF * 0.75;
    this.blctx.clearRect(0, 0, W, H);
    this.blctx.filter = 'blur(3px)';
    this.blctx.drawImage(this.emiss, 0, 0);
    this.blctx.filter = 'none';
    s.imageSmoothingEnabled = true; // smooth scale sells the glow
    s.globalCompositeOperation = 'lighter';
    s.globalAlpha = bloomStrength * 0.55;
    s.drawImage(this.bloomTmp, 0, 0, W, H, -fx, -fy, W * this.zoom, H * this.zoom);
    s.globalAlpha = bloomStrength * 0.5;
    s.drawImage(this.emiss, 0, 0, W, H, -fx, -fy, W * this.zoom, H * this.zoom);
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';
    s.imageSmoothingEnabled = false;

    // volumetric light: dawn/dusk shafts, storm breaks, night compute pillars
    this.drawLightShafts(g, camX, camY);

    // tilt-shift: blur a half-res copy (the downscale is half the blur
    // already), mask to the top/bottom bands, and scale back up.
    const hw = this.blurTmp.width, hh = this.blurTmp.height;
    this.bctx.clearRect(0, 0, hw, hh);
    this.bctx.filter = 'blur(1.5px)';
    this.bctx.drawImage(this.screen, 0, 0, sw, sh, 0, 0, hw, hh);
    this.bctx.filter = 'none';
    this.bctx.globalCompositeOperation = 'destination-in';
    const mask = this.bctx.createLinearGradient(0, 0, 0, hh);
    mask.addColorStop(0, 'rgba(0,0,0,0.9)');
    mask.addColorStop(0.3, 'rgba(0,0,0,0)');
    mask.addColorStop(0.7, 'rgba(0,0,0,0)');
    mask.addColorStop(1, 'rgba(0,0,0,0.9)');
    this.bctx.fillStyle = mask;
    this.bctx.fillRect(0, 0, hw, hh);
    this.bctx.globalCompositeOperation = 'source-over';
    s.imageSmoothingEnabled = true;
    s.drawImage(this.blurTmp, 0, 0, hw, hh, 0, 0, sw, sh);
    s.imageSmoothingEnabled = false;

    // vignette
    const vg = s.createRadialGradient(sw / 2, sh / 2, Math.min(sw, sh) * 0.45, sw / 2, sh / 2, Math.max(sw, sh) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(8,10,18,0.32)');
    s.fillStyle = vg;
    s.fillRect(0, 0, sw, sh);
  }

  nightFactor(): number {
    const h = this.hour;
    if (h >= 8 && h <= 17) return 0;
    if (h >= 21 || h <= 4.5) return 1;
    if (h > 17 && h < 21) return (h - 17) / 4;
    return 1 - (h - 4.5) / 3.5; // dawn
  }

  /**
   * Render-time details that make the city visibly evolve: corporate branding
   * creeping across ordinary buildings as influence grows, and data centers
   * sprouting extra cooling capacity as they age under load.
   */
  private drawEvolutionDetails(g: GameState, b: { id: number; type: string; age: number }, dx: number, dy: number, nightF: number): void {
    const w = this.wctx;
    const def = BUILDING_DEFS[b.type as keyof typeof BUILDING_DEFS];
    // Corporate branding spreads through districts.
    if (g.corporateInfluence > 0.22 && (def.category === 'zone' || def.category === 'industry' || def.category === 'civic')) {
      if ((b.id * 7 + 3) % 10 < g.corporateInfluence * 13) {
        const palette: Array<[string, string]> = [
          ['#1e3a5f', '#4aa8ff'], // Meridian
          ['#5f3a1e', '#e8883a'], // Halcyon
          ['#4a1e3f', '#d94fb0'], // OmniLink
          ['#2e2e34', '#a8a8b2'], // Aegis
        ];
        const [bg, fg] = palette[b.id % 4];
        const cx = dx + def.w * TILE - 6, cy = dy + 2;
        w.fillStyle = bg; w.fillRect(cx, cy, 5, 4);
        w.fillStyle = fg; w.fillRect(cx + 1, cy + 1, 3, 2);
        if (nightF > 0.3) {
          this.ectx.globalAlpha = nightF * 0.8;
          this.ectx.fillStyle = fg;
          this.ectx.fillRect(cx + 1, cy + 1, 3, 2);
          this.ectx.globalAlpha = 1;
        }
      }
    }
    // Data centers grow cooling infrastructure as they age under load.
    if ((b.type === 'cloud_dc' || b.type === 'ai_campus' || b.type === 'edge_dc') && b.age > 60) {
      const extra = Math.min(4, 1 + Math.floor((b.age - 60) / 70));
      const baseY = dy + def.h * TILE - 5;
      for (let i = 0; i < extra; i++) {
        const ux = dx + 3 + i * 8;
        if (ux + 6 > dx + def.w * TILE - 2) break;
        w.fillStyle = '#8c9298'; w.fillRect(ux, baseY, 6, 4);
        w.fillStyle = '#5e646a'; w.fillRect(ux + 1, baseY + 1, 4, 2);
        w.fillStyle = '#33383e'; w.fillRect(ux + 2, baseY + 2, 2, 1);
      }
    }
  }

  /**
   * Volumetric light: dawn/dusk shafts angled with the sun, soft break-light
   * columns in half-clouded storms, and at night thin pillars of glow rising
   * from the compute campuses.
   */
  private drawLightShafts(g: GameState, camX: number, camY: number): void {
    const s = this.sctx;
    const sw = this.screen.width, sh = this.screen.height;
    const nightF = this.nightFactor();
    const dawn = Math.max(0, 1 - Math.abs(this.hour - 7) / 1.6);
    const dusk = Math.max(0, 1 - Math.abs(this.hour - 18) / 1.6);
    const golden = Math.max(dawn, dusk) * (1 - this.rain * 0.8);

    if (golden > 0.03) {
      s.save();
      s.globalCompositeOperation = 'screen';
      s.translate(sw / 2, -40);
      s.rotate(dawn > dusk ? -0.42 : 0.42); // sun in the east lights shafts leaning west, and vice versa
      for (let i = 0; i < 6; i++) {
        const x = -sw * 0.75 + i * sw * 0.26 + Math.sin(this.t * 0.25 + i * 1.7) * 26;
        const bandW = 34 + (i % 3) * 30;
        const grad = s.createLinearGradient(0, 0, 0, sh * 1.1);
        grad.addColorStop(0, `rgba(255,214,150,${(0.10 * golden).toFixed(3)})`);
        grad.addColorStop(0.75, 'rgba(255,214,150,0)');
        s.fillStyle = grad;
        s.fillRect(x, 0, bandW, sh * 1.4);
      }
      s.restore();
    }

    // storm-break shafts: vertical columns through torn cloud
    if (this.rain > 0.12 && this.rain < 0.55 && nightF < 0.6) {
      s.save();
      s.globalCompositeOperation = 'screen';
      for (let i = 0; i < 3; i++) {
        const x = ((this.t * 6 + i * sw * 0.37) % (sw + 200)) - 100;
        const grad = s.createLinearGradient(0, 0, 0, sh);
        grad.addColorStop(0, 'rgba(220,230,245,0.055)');
        grad.addColorStop(0.85, 'rgba(220,230,245,0)');
        s.fillStyle = grad;
        s.fillRect(x, 0, 60 + i * 26, sh);
      }
      s.restore();
    }

    // night: light pillars over the compute campuses
    if (nightF > 0.35) {
      s.save();
      s.globalCompositeOperation = 'lighter';
      let drawn = 0;
      for (const b of g.buildings.values()) {
        if (drawn >= 10) break;
        if (b.progress < 1 || !b.active) continue;
        const def = BUILDING_DEFS[b.type];
        if (def.category !== 'compute' || def.compute < 20) continue;
        const px = (b.x * TILE + def.w * TILE / 2 - this.camX) * this.zoom;
        const py = (b.y * TILE - this.camY) * this.zoom;
        if (px < -60 || px > sw + 60 || py < -100 || py > sh + 100) continue;
        const blink = 0.8 + 0.2 * Math.sin(this.t * 2.5 + b.id);
        const hgt = (60 + def.w * 22) * this.zoom * 0.7;
        const grad = s.createLinearGradient(0, py, 0, py - hgt);
        grad.addColorStop(0, `rgba(120,185,255,${(0.085 * nightF * blink).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(120,185,255,0)');
        s.fillStyle = grad;
        s.fillRect(px - def.w * TILE * this.zoom * 0.45, py - hgt, def.w * TILE * this.zoom * 0.9, hgt);
        drawn++;
      }
      s.restore();
    }
  }

  private gradeFilter(g: GameState): string {
    // Early: warm & saturated. Mid: neutral. Late: cool, clinical. Observer: pristine.
    const e = g.asi.emergence / 100;
    const pol = Math.min(1, g.pollutionAvg * 4);
    if (g.asi.observer) {
      // Perfection accumulates: the longer the system runs, the cleaner,
      // brighter, and less alive the light becomes.
      const t = Math.min(1, Math.max(0, g.tick - g.asi.phaseTick) / 120);
      return `saturate(${(0.92 - t * 0.14).toFixed(2)}) brightness(${(1.04 + t * 0.05).toFixed(2)}) hue-rotate(${(-6 - t * 6).toFixed(1)}deg)`;
    }
    // Seasonal grading layered under the era drift: crisp desaturated winters,
    // green springs, warm summers, amber autumns.
    const SEASONS = [
      { sat: -0.12, hue: 6, bright: 0.03 },   // winter
      { sat: 0.04, hue: -2, bright: 0.0 },    // spring
      { sat: 0.07, hue: -5, bright: 0.01 },   // summer
      { sat: 0.03, hue: -12, bright: -0.01 }, // autumn
    ];
    const sea = SEASONS[Renderer.seasonOf(g.tick)];
    const sat = 1.12 - e * 0.25 - pol * 0.15 + sea.sat;
    const hue = -e * 10 + sea.hue;
    const bright = 1.02 - pol * 0.05 + sea.bright;
    return `saturate(${sat.toFixed(2)}) hue-rotate(${hue.toFixed(1)}deg) brightness(${bright.toFixed(2)})`;
  }

  private collectLights(g: GameState, camX: number, camY: number, W: number, H: number): PointLight[] {
    const out: PointLight[] = [];
    for (const b of g.buildings.values()) {
      if (b.progress < 1 || !b.active) continue;
      const def = BUILDING_DEFS[b.type];
      const x = (b.x + def.w / 2) * TILE - camX, y = (b.y + def.h / 2) * TILE - camY;
      if (x < -60 || y < -60 || x > W + 60 || y > H + 60) continue;
      switch (def.category) {
        case 'compute':
          out.push({ x, y, r: def.w * TILE * 1.2, color: 'rgba(90,160,255,0.55)', intensity: 0.9 });
          break;
        case 'zone':
          out.push({ x, y, r: def.w * TILE * 1.4, color: 'rgba(255,190,120,0.5)', intensity: 0.6 });
          break;
        case 'industry':
          out.push({ x, y, r: def.w * TILE * 1.2, color: 'rgba(255,210,150,0.45)', intensity: 0.55 });
          break;
        case 'power':
          out.push({ x, y, r: def.w * TILE, color: 'rgba(255,230,180,0.35)', intensity: 0.4 });
          break;
        case 'civic':
          out.push({ x, y, r: def.w * TILE * 1.3, color: 'rgba(255,235,200,0.45)', intensity: 0.5 });
          break;
      }
    }
    return out;
  }

  /**
   * Diagnostic layers. Each one answers a question the map raises but cannot
   * otherwise answer: why is that district dark, why is nothing being built
   * there, why are the doctors going on record. Coverage grids and road
   * components are recomputed only while a layer is actually up.
   */
  private drawOverlay(
    w: CanvasRenderingContext2D, g: GameState, id: OverlayId,
    camX: number, camY: number, x0: number, y0: number, x1: number, y1: number,
  ): void {
    w.save();
    if (id === 'pollution') {
      // Continuous field: yellow through red, transparent where the air is clean.
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const p = Math.min(1, g.map[ty * g.mapW + tx].pollution * 2);
          if (p <= 0.02) continue;
          const r = 232, gg = Math.round(200 - 140 * p), b = Math.round(90 - 60 * p);
          w.fillStyle = `rgba(${r},${gg},${b},${(0.14 + p * 0.5).toFixed(3)})`;
          w.fillRect(tx * TILE - camX, ty * TILE - camY, TILE, TILE);
        }
      }
    } else if (id === 'power' || id === 'water') {
      const cov = computeCoverage(g);
      const grid = id === 'power' ? cov.power : cov.water;
      const tint = id === 'power' ? '255,214,110' : '110,200,255';
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const inside = grid[ty * g.mapW + tx];
          w.fillStyle = inside ? `rgba(${tint},0.20)` : 'rgba(10,14,22,0.45)';
          w.fillRect(tx * TILE - camX, ty * TILE - camY, TILE, TILE);
        }
      }
      // A building that needs this utility and sits outside every service area
      // is the actual fault — mark it rather than making the player infer it.
      for (const b of g.buildings.values()) {
        if (b.progress < 1) continue;
        const def = BUILDING_DEFS[b.type];
        const needs = id === 'power' ? def.power < 0 : def.water < 0;
        if (!needs || covered(g, b, grid)) continue;
        this.markFault(w, b.x, b.y, def.w, def.h, camX, camY);
      }
    } else {
      // roads: everything the labour network reaches, and everything it doesn't.
      const conn = computeConnectivity(g);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (g.map[ty * g.mapW + tx].road) continue;
          w.fillStyle = 'rgba(10,14,22,0.42)';
          w.fillRect(tx * TILE - camX, ty * TILE - camY, TILE, TILE);
        }
      }
      for (const b of g.buildings.values()) {
        if (b.progress < 1) continue;
        const def = BUILDING_DEFS[b.type];
        const wants = def.jobs > 0 || def.housing > 0;
        if (!wants) continue;
        const ok = conn.onRoad.has(b.id) && (def.jobs === 0 || conn.labourReachable.has(b.id));
        const dx = b.x * TILE - camX, dy = b.y * TILE - camY;
        w.fillStyle = ok ? 'rgba(110,220,130,0.26)' : 'rgba(232,106,90,0.34)';
        w.fillRect(dx, dy, def.w * TILE, def.h * TILE);
        if (!ok) this.markFault(w, b.x, b.y, def.w, def.h, camX, camY);
      }
    }
    w.restore();
  }

  /** Hatched red box: this building is the thing that is wrong. */
  private markFault(
    w: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number,
    camX: number, camY: number,
  ): void {
    const dx = bx * TILE - camX, dy = by * TILE - camY;
    const pw = bw * TILE, ph = bh * TILE;
    w.fillStyle = 'rgba(232,106,90,0.34)';
    w.fillRect(dx, dy, pw, ph);
    w.strokeStyle = 'rgba(255,150,130,0.9)';
    w.lineWidth = 1;
    w.strokeRect(dx + 0.5, dy + 0.5, pw - 1, ph - 1);
  }

  /** Soft footprint of a utility's service radius, drawn under the cursor. */
  private drawServiceArea(
    w: CanvasRenderingContext2D, bx: number, by: number, bw: number, bh: number,
    radius: number, camX: number, camY: number, kind: 'power' | 'water',
  ): void {
    const cx = (bx + bw / 2) * TILE - camX;
    const cy = (by + bh / 2) * TILE - camY;
    const r = (radius + Math.max(bw, bh) / 2) * TILE;
    const grad = w.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    const tint = kind === 'power' ? '255,214,110' : '110,200,255';
    grad.addColorStop(0, `rgba(${tint},0.14)`);
    grad.addColorStop(1, `rgba(${tint},0)`);
    w.fillStyle = grad;
    w.fillRect(cx - r, cy - r, r * 2, r * 2);
    w.strokeStyle = `rgba(${tint},0.45)`;
    w.beginPath();
    w.arc(cx, cy, r, 0, Math.PI * 2);
    w.stroke();
  }

  private rebuildTerrainCache(g: GameState): void {
    if (!this.terrainCache) {
      this.terrainCache = document.createElement('canvas');
      this.terrainCache.width = g.mapW * TILE;
      this.terrainCache.height = g.mapH * TILE;
    }
    const c = this.terrainCache.getContext('2d')!;
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, this.terrainCache.width, this.terrainCache.height);
    for (let ty = 0; ty < g.mapH; ty++) {
      for (let tx = 0; tx < g.mapW; tx++) {
        const tile = g.map[ty * g.mapW + tx];
        const dx = tx * TILE, dy = ty * TILE;
        switch (tile.terrain) {
          case 'water': break; // animated, drawn live
          case 'sand': c.drawImage(this.terrain.sand[tile.variant], dx, dy); break;
          case 'rock': c.drawImage(this.terrain.rock[tile.variant], dx, dy); break;
          default: c.drawImage(this.terrain.grass[tile.variant], dx, dy);
        }
        if (tile.road) {
          let mask = 0;
          if (g.map[(ty - 1) * g.mapW + tx]?.road) mask |= 1;
          if (g.map[ty * g.mapW + tx + 1]?.road && tx + 1 < g.mapW) mask |= 2;
          if (g.map[(ty + 1) * g.mapW + tx]?.road) mask |= 4;
          if (g.map[ty * g.mapW + tx - 1]?.road && tx - 1 >= 0) mask |= 8;
          c.drawImage(this.roads[tile.roadType ?? 1][mask], dx, dy);
        }
      }
    }
    this.cachedMapVersion = g.mapVersion;
  }

  private constructionFor(w: number, h: number): HTMLCanvasElement {
    const key = `${w}x${h}`;
    let c = this.construction.get(key);
    if (!c) { c = makeConstructionSprite(w, h); this.construction.set(key, c); }
    return c;
  }

  private clampCamera(g: GameState): void {
    const vw = this.screen.width / this.zoom, vh = this.screen.height / this.zoom;
    const maxX = g.mapW * TILE - vw, maxY = g.mapH * TILE - vh;
    this.camX = maxX > 0 ? Math.max(0, Math.min(maxX, this.camX)) : maxX / 2;
    this.camY = maxY > 0 ? Math.max(0, Math.min(maxY, this.camY)) : maxY / 2;
  }

  private makeCloudShadow(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 90;
    const ctx = c.getContext('2d')!;
    ctx.filter = 'blur(14px)';
    ctx.fillStyle = 'rgba(20,26,40,0.5)';
    ctx.beginPath(); ctx.ellipse(80, 45, 60, 26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(140, 38, 50, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(110, 55, 45, 18, 0, 0, Math.PI * 2); ctx.fill();
    return c;
  }
}
