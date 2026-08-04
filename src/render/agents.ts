// Ambient life: traffic, pedestrians, smoke, steam, rain. Everything moves in
// world-pixel space on the low-res canvas so it stays on the pixel grid.

import type { GameState } from '../game/types';
import { BUILDING_DEFS } from '../game/buildings';
import { TILE } from './sprites';
import { tileAt } from '../game/state';

export interface Agent {
  x: number; y: number;        // world px
  tx: number; ty: number;      // current target tile
  dir: number;                 // 0 N, 1 E, 2 S, 3 W
  kind: 'car' | 'ped';
  variant: number;
  speed: number;
}

export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number;
  kind: 'smoke' | 'steam' | 'rain' | 'leaf';
}

const DIRS: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

export class AmbientLife {
  agents: Agent[] = [];
  particles: Particle[] = [];
  private spawnTimer = 0;

  update(g: GameState, dt: number, weatherRain: number): void {
    const uniform = g.asi.observer; // motion becomes eerily regular
    const roadTiles = this.collectRoads(g);
    const targetCars = Math.min(60, Math.floor(g.population / 24) + Math.floor(roadTiles.length / 18));
    const targetPeds = uniform
      ? Math.min(30, Math.floor(g.population / 60))          // quieter streets
      : Math.min(80, Math.floor(g.population / 14));

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && roadTiles.length > 0) {
      this.spawnTimer = 0.4;
      const cars = this.agents.filter((a) => a.kind === 'car').length;
      const peds = this.agents.filter((a) => a.kind === 'ped').length;
      if (cars < targetCars) this.spawn(g, roadTiles, 'car');
      if (peds < targetPeds) this.spawn(g, roadTiles, 'ped');
      if (cars > targetCars + 4) this.agents.splice(this.agents.findIndex((a) => a.kind === 'car'), 1);
      if (peds > targetPeds + 4) this.agents.splice(this.agents.findIndex((a) => a.kind === 'ped'), 1);
    }

    for (const a of this.agents) this.moveAgent(g, a, dt, uniform);

    // Particles ---------------------------------------------------------
    for (const b of g.buildings.values()) {
      if (b.progress < 1 || !b.active) continue;
      const def = BUILDING_DEFS[b.type];
      if (b.type === 'coal_plant' && Math.random() < dt * 6) {
        this.particles.push(this.puff((b.x + def.w - 0.9) * TILE, (b.y + 0.4) * TILE, 'smoke'));
        if (Math.random() < 0.5) this.particles.push(this.puff((b.x + def.w - 0.4) * TILE, (b.y + 0.5) * TILE, 'smoke'));
      }
      if (b.type === 'factory' && Math.random() < dt * 3) {
        this.particles.push(this.puff((b.x + def.w - 0.5) * TILE, (b.y + 0.25) * TILE, 'smoke'));
      }
      if (b.type === 'ai_campus' && Math.random() < dt * 8) {
        const tower = Math.floor(Math.random() * 3);
        this.particles.push(this.puff((b.x + 0.75 + tower * 1.25) * TILE, (b.y + 3.1) * TILE, 'steam'));
      }
      if (b.type === 'nuclear_plant' && Math.random() < dt * 5) {
        this.particles.push(this.puff((b.x + 2.05) * TILE, (b.y + 2.9) * TILE, 'steam'));
      }
    }
    if (weatherRain > 0) {
      const n = Math.floor(weatherRain * 26);
      for (let i = 0; i < n; i++) {
        this.particles.push({
          x: Math.random() * g.mapW * TILE, y: Math.random() * g.mapH * TILE,
          vx: -14, vy: 90, life: 0.35, maxLife: 0.35, kind: 'rain',
        });
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.kind === 'smoke' || pt.kind === 'steam') { pt.vx += (Math.random() - 0.3) * 6 * dt; pt.vy -= 4 * dt; }
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  private puff(x: number, y: number, kind: 'smoke' | 'steam'): Particle {
    return {
      x: x + (Math.random() - 0.5) * 2, y,
      vx: 3 + Math.random() * 4, vy: -7 - Math.random() * 6,
      life: kind === 'steam' ? 1.6 : 2.6, maxLife: kind === 'steam' ? 1.6 : 2.6, kind,
    };
  }

  private collectRoads(g: GameState): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let y = 0; y < g.mapH; y++)
      for (let x = 0; x < g.mapW; x++)
        if (g.map[y * g.mapW + x].road) out.push([x, y]);
    return out;
  }

  private spawn(g: GameState, roads: Array<[number, number]>, kind: 'car' | 'ped'): void {
    const [tx, ty] = roads[Math.floor(Math.random() * roads.length)];
    this.agents.push({
      x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      tx, ty, dir: Math.floor(Math.random() * 4), kind,
      variant: Math.floor(Math.random() * 8),
      speed: kind === 'car' ? 26 + Math.random() * 14 : 6 + Math.random() * 4,
    });
  }

  private moveAgent(g: GameState, a: Agent, dt: number, uniform: boolean): void {
    const speed = uniform ? (a.kind === 'car' ? 30 : 8) : a.speed; // lockstep speeds
    // lane offset: cars keep right, pedestrians walk the verge
    const laneOff = a.kind === 'car' ? 3 : 6;
    const [dx, dy] = DIRS[a.dir];
    const targetX = a.tx * TILE + TILE / 2 + (a.kind === 'car' ? -dy * laneOff * 0.5 : dy * laneOff);
    const targetY = a.ty * TILE + TILE / 2 + (a.kind === 'car' ? dx * laneOff * 0.5 : -dx * laneOff);
    const distX = targetX - a.x, distY = targetY - a.y;
    const dist = Math.hypot(distX, distY);
    if (dist < 1.5) {
      // arrived at tile center: choose next road tile
      const options: number[] = [];
      for (let d = 0; d < 4; d++) {
        if (d === (a.dir + 2) % 4) continue; // no U-turns unless stuck
        const nx = a.tx + DIRS[d][0], ny = a.ty + DIRS[d][1];
        const t = tileAt(g, nx, ny);
        if (t?.road) options.push(d);
      }
      let dir: number;
      if (options.length === 0) dir = (a.dir + 2) % 4;
      else if (uniform) dir = options.includes(a.dir) ? a.dir : options[0]; // deterministic, no wandering
      else dir = Math.random() < 0.65 && options.includes(a.dir) ? a.dir : options[Math.floor(Math.random() * options.length)];
      a.dir = dir;
      a.tx += DIRS[dir][0];
      a.ty += DIRS[dir][1];
    } else {
      a.x += (distX / dist) * speed * dt;
      a.y += (distY / dist) * speed * dt;
    }
  }
}
