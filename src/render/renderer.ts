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

export interface UiRenderState {
  hoverTile: [number, number] | null;
  buildType: BuildingType | null;
  canPlaceHere: boolean;
  selectedBuildingId: number | null;
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
  private blurTmp!: HTMLCanvasElement;
  private bctx!: CanvasRenderingContext2D;

  private terrain: TerrainSprites;
  private roads: HTMLCanvasElement[];
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
    this.blurTmp = document.createElement('canvas');
    this.blurTmp.width = this.screen.width;
    this.blurTmp.height = this.screen.height;
    this.bctx = this.blurTmp.getContext('2d')!;
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

  update(g: GameState, dt: number, simSpeedMul: number): void {
    this.t += dt * Math.max(0.2, simSpeedMul);
    // Weather drifts; observer mode is meteorologically serene.
    this.weatherTimer -= dt * simSpeedMul;
    if (this.weatherTimer <= 0) {
      this.weatherTimer = 25 + Math.random() * 40;
      this.rainTarget = g.asi.observer ? 0 : (Math.random() < 0.3 ? 0.4 + Math.random() * 0.6 : 0);
    }
    this.rain += (this.rainTarget - this.rain) * dt * 0.4;
    if (this.rain < 0.01) this.rain = 0;
    this.life.update(g, dt * simSpeedMul, this.rain);
  }

  render(g: GameState, ui: UiRenderState): void {
    const W = this.world.width, H = this.world.height;
    this.clampCamera(g);
    const camX = Math.floor(this.camX), camY = Math.floor(this.camY);
    const w = this.wctx;

    // ------------------------------------------------------------ terrain
    const x0 = Math.max(0, Math.floor(camX / TILE)), y0 = Math.max(0, Math.floor(camY / TILE));
    const x1 = Math.min(g.mapW - 1, Math.ceil((camX + W) / TILE)), y1 = Math.min(g.mapH - 1, Math.ceil((camY + H) / TILE));
    w.fillStyle = '#1a2430';
    w.fillRect(0, 0, W, H);
    const waterFrame = ((Math.floor(this.t * 2.2) % 3) + 3) % 3;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = g.map[ty * g.mapW + tx];
        const dx = tx * TILE - camX, dy = ty * TILE - camY;
        let img: HTMLCanvasElement;
        switch (tile.terrain) {
          case 'water': img = this.terrain.water[waterFrame]; break;
          case 'sand': img = this.terrain.sand[tile.variant]; break;
          case 'rock': img = this.terrain.rock[tile.variant]; break;
          default: img = this.terrain.grass[tile.variant];
        }
        w.drawImage(img, dx, dy);
        if (tile.road) {
          let mask = 0;
          if (g.map[(ty - 1) * g.mapW + tx]?.road) mask |= 1;
          if (g.map[ty * g.mapW + tx + 1]?.road && tx + 1 < g.mapW) mask |= 2;
          if (g.map[(ty + 1) * g.mapW + tx]?.road) mask |= 4;
          if (g.map[ty * g.mapW + tx - 1]?.road && tx - 1 >= 0) mask |= 8;
          w.drawImage(this.roads[mask], dx, dy);
        }
      }
    }

    // ------------------------------------------------------------ buildings
    const nightF = this.nightFactor();
    this.ectx.clearRect(0, 0, W, H);
    const sorted = [...g.buildings.values()].sort((a, b) => a.y - b.y);
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
      // drop shadow to the SE (sun from NW)
      w.fillStyle = 'rgba(10,14,20,0.28)';
      w.fillRect(dx + 2, dy + def.h * TILE - 1, def.w * TILE - 1, 2);
      w.fillRect(dx + def.w * TILE - 1, dy + 2, 2, def.h * TILE - 2);
      w.drawImage(spr.albedo, dx, dy);
      if (!b.active) {
        w.fillStyle = 'rgba(20,20,28,0.45)';
        w.fillRect(dx, dy, def.w * TILE, def.h * TILE);
      }
      // emissive: windows at night; server LEDs always, blinking
      if (spr.emissive && b.active) {
        const isCompute = def.category === 'compute';
        const blink = isCompute ? 0.55 + 0.45 * Math.sin(this.t * 6 + b.id * 2.1) : 1;
        const strength = isCompute ? 0.35 + nightF * 0.65 : nightF;
        if (strength > 0.05) {
          const a = strength * blink;
          w.globalAlpha = a;
          w.drawImage(spr.emissive, dx, dy);
          w.globalAlpha = 1;
          this.ectx.globalAlpha = a;
          this.ectx.drawImage(spr.emissive, dx, dy);
          this.ectx.globalAlpha = 1;
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
        const sway = Math.round(Math.sin(this.t * 1.6 + (tx * 7 + ty * 13) * 0.37) * wind);
        const dx = tx * TILE - camX + sway, dy = ty * TILE - camY - 4;
        w.drawImage(this.terrain.tree[tile.variant % 3], dx, dy);
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

    // ------------------------------------------------------------ agents
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

    // ------------------------------------------------------------ particles
    for (const pt of this.life.particles) {
      const dx = Math.round(pt.x - camX), dy = Math.round(pt.y - camY);
      if (dx < -4 || dy < -4 || dx > W || dy > H) continue;
      const lifeT = pt.life / pt.maxLife;
      if (pt.kind === 'rain') {
        w.strokeStyle = 'rgba(180,200,230,0.5)';
        w.beginPath(); w.moveTo(dx, dy); w.lineTo(dx - 1, dy + 3); w.stroke();
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

    // ------------------------------------------------------------ build cursor
    if (ui.buildType && ui.hoverTile) {
      const def = BUILDING_DEFS[ui.buildType];
      const dx = ui.hoverTile[0] * TILE - camX, dy = ui.hoverTile[1] * TILE - camY;
      const spr = this.buildings.get(ui.buildType);
      w.globalAlpha = 0.6;
      if (spr) w.drawImage(spr.albedo, dx, dy);
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
        w.strokeStyle = '#ffffff';
        w.strokeRect(b.x * TILE - camX + 0.5, b.y * TILE - camY + 0.5, def.w * TILE - 1, def.h * TILE - 1);
      }
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
    // era grading via filter on the upscale draw
    s.filter = this.gradeFilter(g);
    const fx = (this.camX - camX) * this.zoom, fy = (this.camY - camY) * this.zoom;
    s.drawImage(this.world, 0, 0, W, H, -fx, -fy, W * this.zoom, H * this.zoom);
    s.filter = 'none';

    // bloom: emissive layer, blurred + additive, scaled by darkness
    const bloomStrength = 0.25 + nightF * 0.75;
    s.globalCompositeOperation = 'lighter';
    s.globalAlpha = bloomStrength * 0.55;
    s.filter = `blur(${3 * this.zoom}px)`;
    s.drawImage(this.emiss, 0, 0, W, H, -fx, -fy, W * this.zoom, H * this.zoom);
    s.filter = `blur(${this.zoom}px)`;
    s.globalAlpha = bloomStrength * 0.5;
    s.drawImage(this.emiss, 0, 0, W, H, -fx, -fy, W * this.zoom, H * this.zoom);
    s.filter = 'none';
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';

    // tilt-shift: blurred copy masked to top/bottom bands
    this.bctx.clearRect(0, 0, sw, sh);
    this.bctx.filter = 'blur(3px)';
    this.bctx.drawImage(this.screen, 0, 0);
    this.bctx.filter = 'none';
    this.bctx.globalCompositeOperation = 'destination-in';
    const mask = this.bctx.createLinearGradient(0, 0, 0, sh);
    mask.addColorStop(0, 'rgba(0,0,0,0.9)');
    mask.addColorStop(0.3, 'rgba(0,0,0,0)');
    mask.addColorStop(0.7, 'rgba(0,0,0,0)');
    mask.addColorStop(1, 'rgba(0,0,0,0.9)');
    this.bctx.fillStyle = mask;
    this.bctx.fillRect(0, 0, sw, sh);
    this.bctx.globalCompositeOperation = 'source-over';
    s.drawImage(this.blurTmp, 0, 0);

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

  private gradeFilter(g: GameState): string {
    // Early: warm & saturated. Mid: neutral. Late: cool, clinical. Observer: pristine.
    const e = g.asi.emergence / 100;
    const pol = Math.min(1, g.pollutionAvg * 4);
    if (g.asi.observer) return 'saturate(0.92) brightness(1.04) hue-rotate(-6deg)';
    const sat = 1.12 - e * 0.25 - pol * 0.15;
    const hue = -e * 10; // drift toward blue
    const bright = 1 + 0.02 - pol * 0.05;
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
