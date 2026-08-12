// The backdrop of the boot screen: a region that founds itself, then gets
// optimized.
//
// This is the game's whole arc in about four seconds, and it is the only
// honest thing to put behind the title. Roads spread out from a founding point
// as a wavefront, blocks fill in beside them, and the windows come on amber.
// Then a cold line crosses the region from the left, and everything behind it
// is the same city rendered in blue-white — which is exactly what the era
// colour grading does to the real map over forty years, compressed into the
// time it takes to read a tagline.
//
// No sprites and no dependency on the renderer: this runs before the sprite
// atlases exist, because drawing them is one of the things the bar is counting.
// Cells are painted once into an offscreen buffer and blitted; only the cells
// that changed this frame are repainted, so a full region costs one drawImage
// and a handful of small fills.

/** Cell kinds. Ground is the unbuilt field the region is founded on. */
const GROUND = 0, ROAD = 1, BLOCK = 2, PARK = 3, WATER = 4;

// A region at night, from above — which is both the most legible thing to put
// behind large white type and the game's own signature: the map after dark is
// nearly black with constellations of lit windows and street lamps over it.
// Almost everything here is a silhouette. The light is the picture.
const C = {
  ground: '#0c121b',
  groundAlt: '#0f1622',
  road: '#151c27',
  dash: '#222c3c',
  lamp: 'rgba(255, 200, 130, 0.55)',
  lampCold: 'rgba(190, 232, 255, 0.5)',
  water: '#0d1c2c',
  waterLit: 'rgba(70, 150, 210, 0.5)',
  park: '#0f1c11',
  parkCold: '#121a1c',
  warm: '#ffc266',
  warmGlow: 'rgba(255, 168, 60, 0.20)',
  cold: '#dcf2ff',
  coldGlow: 'rgba(140, 216, 255, 0.22)',
  sweep: '#7ae9ff',
};
const ROOFS = ['#1f2733', '#24262b', '#1c2431', '#242730', '#1e252d'];
/** The same roofs after the sweep: the warmth taken out of the grey. */
const ROOFS_COLD = ['#212a35', '#232932', '#1f2833', '#232a34', '#212832'];
/** The lit face below each roof. Darker, because it is not facing the sky. */
const SIDES = ['#12181f', '#16171a', '#111720', '#15161c', '#12171c'];
const SIDES_COLD = ['#131a22', '#151a21', '#121922', '#141a21', '#131921'];

const SECONDS_TO_BUILD = 1.5;
const SWEEP_START = 1.15;
const SWEEP_SECONDS = 1.5;

/** Cheap deterministic hash, so window layout costs nothing to store. */
function h(i: number, salt: number): number {
  let x = (i * 374761393 + salt * 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

interface Car { lane: number; along: number; speed: number; horizontal: boolean }

export class TitleCity {
  private ctx: CanvasRenderingContext2D;
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private cols = 0;
  private rows = 0;
  private cell = 10;
  private dpr = 1;
  private kind = new Uint8Array(0);
  private order = new Int32Array(0);
  /** How far through `order` the wavefront has reached. */
  private shown = 0;
  /** Per-cell: has the wavefront painted this one yet. */
  private built = new Uint8Array(0);
  /** Per-cell storey count, in pixels of visible face. Tallest downtown. */
  private lift = new Uint8Array(0);
  /** Columns left of this one have been through the sweep. */
  private swept = 0;
  private cars: Car[] = [];
  private hRoads: number[] = [];
  private vRoads: number[] = [];
  private t = 0;
  private raf = 0;
  private last = 0;
  private running = false;
  private reduced = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.buf = document.createElement('canvas');
    this.bctx = this.buf.getContext('2d')!;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.layout();
  }

  /** Build the field. Called again on resize, which restarts the growth. */
  private layout(): void {
    // Capped at 2: a phone at 3× would be drawing nine times the pixels of a
    // laptop for a backdrop that is mostly behind a vignette.
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, this.canvas.clientWidth);
    const hgt = Math.max(240, this.canvas.clientHeight);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(hgt * this.dpr);
    // A fixed cell count would give a phone tiles the size of a fingernail and
    // a desktop a mosaic. A fixed cell *size* keeps the region at one scale and
    // simply shows more of it on a bigger screen, which is what the real map
    // does when you widen the window.
    // 14 rather than 11: at eleven the blocks were a texture rather than a
    // town — no room for a roof, a face and a lit window inside one plot, and
    // a road grid that read as noise between them.
    this.cell = Math.round(16 * this.dpr);
    this.cols = Math.ceil(this.canvas.width / this.cell) + 1;
    this.rows = Math.ceil(this.canvas.height / this.cell) + 1;
    this.buf.width = this.canvas.width;
    this.buf.height = this.canvas.height;

    const n = this.cols * this.rows;
    this.kind = new Uint8Array(n);
    this.built = new Uint8Array(n);
    this.lift = new Uint8Array(n);

    // The river first — it is the one feature that overrules everything, the
    // way it does in the generator.
    const rx = this.cols * 0.30;
    for (let y = 0; y < this.rows; y++) {
      const wob = Math.sin(y * 0.19) * 2.4 + Math.sin(y * 0.071 + 1.3) * 3.6;
      const cx = rx + wob;
      const halfW = 1.1 + Math.sin(y * 0.05) * 0.5;
      for (let x = 0; x < this.cols; x++) {
        if (Math.abs(x - cx) <= halfW) this.kind[y * this.cols + x] = WATER;
      }
    }

    // Then the street grid: blocks four to six cells on a side, so the town
    // reads as laid out rather than as noise.
    this.hRoads = []; this.vRoads = [];
    for (let y = 2; y < this.rows; y += 4 + Math.round(h(y, 11) * 2)) this.hRoads.push(y);
    for (let x = 2; x < this.cols; x += 5 + Math.round(h(x, 23) * 2)) this.vRoads.push(x);
    const isRoad = (x: number, y: number) => this.hRoads.includes(y) || this.vRoads.includes(x);

    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        if (this.kind[i] === WATER) continue;
        if (isRoad(x, y)) { this.kind[i] = ROAD; continue; }
        const r = h(i, 5);
        this.kind[i] = r < 0.13 ? PARK : r < 0.88 ? BLOCK : GROUND;
      }
    }

    // Reveal order: distance from the founding point, roughened so the edge of
    // the wavefront is ragged rather than a expanding circle drawn with a
    // compass. Founded east of the river, like every generated region.
    const fx = this.cols * 0.56, fy = this.rows * 0.5;
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    const cost = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i % this.cols, y = (i / this.cols) | 0;
      const dx = (x - fx) / this.cols, dy = (y - fy) / this.rows;
      cost[i] = Math.sqrt(dx * dx + dy * dy * 1.35) + h(i, 77) * 0.10;
    }
    idx.sort((a, b) => cost[a] - cost[b]);
    this.order = Int32Array.from(idx);

    // How tall each block is. Height falls off from the founding point, which
    // is what gives the picture a downtown and an edge of town rather than an
    // even carpet of identical roofs — and it is what the real map does, for
    // the same reason: the middle is where the demand went first.
    for (let i = 0; i < n; i++) {
      if (this.kind[i] !== BLOCK) continue;
      const x = i % this.cols, y = (i / this.cols) | 0;
      const dx = (x - fx) / this.cols, dy = (y - fy) / this.rows;
      const d = Math.sqrt(dx * dx * 2.4 + dy * dy * 3.0);
      const downtown = Math.max(0, 1 - d * 2.3);
      this.lift[i] = Math.round((h(i, 13) * 0.42 + downtown * 0.75) * this.cell * 0.34);
    }

    this.cars = [];
    for (let i = 0; i < 46; i++) {
      const horizontal = h(i, 3) < 0.5;
      const lanes = horizontal ? this.hRoads : this.vRoads;
      if (!lanes.length) break;
      this.cars.push({
        horizontal,
        lane: lanes[Math.floor(h(i, 9) * lanes.length)],
        along: h(i, 4) * (horizontal ? this.cols : this.rows),
        speed: (h(i, 6) < 0.5 ? -1 : 1) * (2.6 + h(i, 8) * 2.8),
      });
    }

    this.shown = 0;
    this.swept = 0;
    this.bctx.fillStyle = '#0a0e16';
    this.bctx.fillRect(0, 0, this.buf.width, this.buf.height);
    if (this.reduced) this.finish();
  }

  /** Paint one cell into the buffer, warm or cold. */
  private paint(i: number, cold: boolean): void {
    this.built[i] = 1;
    const x = (i % this.cols) * this.cell;
    const y = ((i / this.cols) | 0) * this.cell;
    const s = this.cell;
    const b = this.bctx;
    const k = this.kind[i];

    if (k === WATER) {
      b.fillStyle = C.water;
      b.fillRect(x, y, s, s);
      // One lit pixel of river per few cells: the water in the game is the
      // brightest thing on the map at dusk and it should not be flat here.
      // The river carries what is on the bank. Before the sweep that is warm
      // window light on the water; after it, it is not.
      if (h(i, 41) < 0.3) {
        b.fillStyle = cold ? C.coldGlow : C.waterLit;
        b.fillRect(x + s * 0.2, y + s * 0.3, Math.max(1, s * 0.4), Math.max(1, s * 0.18));
      }
      return;
    }
    if (k === ROAD) {
      b.fillStyle = C.road;
      b.fillRect(x, y, s, s);
      b.fillStyle = C.dash;
      const d = Math.max(1, Math.round(s * 0.08));
      const horizontal = this.hRoads.includes((i / this.cols) | 0);
      if (horizontal) b.fillRect(x + s * 0.18, y + s / 2 - d / 2, s * 0.5, d);
      else b.fillRect(x + s / 2 - d / 2, y + s * 0.18, d, s * 0.5);
      // A street lamp on the verge, one to a tile — the same rule the region
      // uses, and at this size the same picture: roads that are visible after
      // dark because they are lit, not because they are a lighter grey.
      const lp = Math.max(1, Math.round(s * 0.11));
      b.fillStyle = cold ? C.lampCold : C.lamp;
      if (horizontal) b.fillRect(Math.round(x + s * 0.42), Math.round(y + s * 0.14), lp, lp);
      else b.fillRect(Math.round(x + s * 0.14), Math.round(y + s * 0.42), lp, lp);
      return;
    }
    if (k === PARK) {
      b.fillStyle = cold ? C.parkCold : C.park;
      b.fillRect(x, y, s, s);
      b.fillStyle = cold ? '#18211f' : '#162a17';
      b.fillRect(x + s * 0.22, y + s * 0.18, s * 0.55, s * 0.55);
      return;
    }
    if (k === GROUND) {
      b.fillStyle = h(i, 17) < 0.5 ? C.ground : C.groundAlt;
      b.fillRect(x, y, s, s);
      return;
    }

    // A block: a plot, a building standing on it with a visible face, and lit
    // windows on the face. The face is the whole reason the sweep is legible —
    // a roof at this size holds one pixel of light and a face holds four.
    const v = Math.floor(h(i, 2) * ROOFS.length);
    b.fillStyle = C.ground;
    b.fillRect(x, y, s, s);
    const inset = Math.max(1, Math.round(s * 0.16));
    const bw = s - inset * 2;
    const lift = this.lift[i];
    const roofTop = y + inset - lift;

    b.fillStyle = (cold ? SIDES_COLD : SIDES)[v];
    b.fillRect(x + inset, roofTop + bw, bw, lift + Math.max(1, Math.round(s * 0.07)));
    b.fillStyle = (cold ? ROOFS_COLD : ROOFS)[v];
    b.fillRect(x + inset, roofTop, bw, bw);
    // The sky-facing edge, one pixel of it, so a roof is not a flat swatch.
    b.fillStyle = 'rgba(255,255,255,0.07)';
    b.fillRect(x + inset, roofTop, bw, Math.max(1, Math.round(s * 0.07)));

    // The lights. Each one is a bright pixel with a soft square of spill under
    // it — the cheapest thing that reads as a light rather than as a dot, and
    // the only reason a building this small is visible at all.
    const px = Math.max(1, Math.round(s * 0.13));
    const light = (lx: number, ly: number): void => {
      b.fillStyle = cold ? C.coldGlow : C.warmGlow;
      b.fillRect(Math.round(lx - px), Math.round(ly - px), px * 3, px * 3);
      b.fillStyle = cold ? C.cold : C.warm;
      b.fillRect(Math.round(lx), Math.round(ly), px, px);
    };
    // Windows down the face, in rows, because a lit window is a floor.
    const floors = Math.max(0, Math.floor(lift / (px + 1)));
    for (let f = 0; f < floors; f++) {
      for (let w = 0; w < 3; w++) {
        if (h(i, 90 + f * 5 + w) > 0.5) continue;
        light(x + inset + 1 + w * (bw - px - 1) / 2, roofTop + bw + 1 + f * (px + 1));
      }
    }
    // And on the roof: the plant, the mast, the beacon. Every building has one
    // or the region goes dark at the edges, where nothing is tall enough to
    // have a face worth lighting.
    if (h(i, 31) < 0.72) {
      light(x + inset + 1 + h(i, 50) * (bw - px - 2), roofTop + 1 + h(i, 70) * (bw - px - 2));
    }
  }

  /** Draw the whole region, finished and optimized. Reduced motion lands here. */
  private finish(): void {
    for (let i = 0; i < this.order.length; i++) this.paint(this.order[i], true);
    this.shown = this.order.length;
    this.swept = this.cols;
    this.t = SWEEP_START + SWEEP_SECONDS;
  }

  /**
   * Jump to the end of the piece.
   *
   * Pressed before the bar has finished, a tap means "I have seen enough" —
   * and it must never mean "wait, there is more". The animation is scenery; it
   * does not get to hold the door.
   */
  hurry(): void {
    if (this.t < SWEEP_START + SWEEP_SECONDS) this.finish();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    addEventListener('resize', this.onResize);
    const loop = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    removeEventListener('resize', this.onResize);
  }

  private onResize = (): void => { this.layout(); };

  private step(dt: number): void {
    this.t += dt;
    const s = this.cell;

    // Growth: however many cells this frame is worth, painted into the buffer
    // and never repainted. A dropped frame costs nothing but catch-up.
    const want = Math.min(this.order.length,
      Math.round(this.order.length * Math.min(1, this.t / SECONDS_TO_BUILD)));
    for (; this.shown < want; this.shown++) this.paint(this.order[this.shown], false);

    // The sweep: whole columns at a time, repainted cold.
    const sweepT = (this.t - SWEEP_START) / SWEEP_SECONDS;
    const wantSwept = Math.max(0, Math.min(this.cols, Math.round(this.cols * sweepT)));
    for (; this.swept < wantSwept; this.swept++) {
      for (let y = 0; y < this.rows; y++) {
        const i = y * this.cols + this.swept;
        // Only what has actually been built. A cell the wavefront has not
        // reached is not there to be optimized yet, and painting it here would
        // let the sweep outrun the city and build it in the wrong colour.
        if (this.wasShown(i)) this.paint(i, true);
      }
    }

    // A few windows going on and off, forever. Without this the region is a
    // still image the moment the sweep lands, which on a screen the player may
    // sit on for a while is just a picture.
    const cold = this.swept >= this.cols;
    const blinks = cold ? 2 : 5;
    for (let n = 0; n < blinks; n++) {
      const i = this.order[Math.floor(Math.random() * this.shown)] ?? 0;
      if (this.kind[i] === BLOCK) this.paint(i, this.swept > (i % this.cols));
    }

    const c = this.ctx;
    c.drawImage(this.buf, 0, 0);

    // Traffic, over the buffer rather than into it, because it moves.
    for (const car of this.cars) {
      car.along += car.speed * dt;
      const span = car.horizontal ? this.cols : this.rows;
      if (car.along < -1) car.along = span + 1;
      if (car.along > span + 1) car.along = -1;
      const x = car.horizontal ? car.along : car.lane;
      const y = car.horizontal ? car.lane : car.along;
      const i = ((y | 0) * this.cols + (x | 0));
      if (!this.wasShown(i)) continue;
      const past = this.swept > (x | 0);
      c.fillStyle = past ? C.cold : C.warm;
      c.globalAlpha = past ? 0.5 : 0.75;
      const d = Math.max(2, s * 0.22);
      c.fillRect(Math.round(x * s + s / 2 - d / 2), Math.round(y * s + s / 2 - d / 2), d, d);
    }
    c.globalAlpha = 1;

    // The line itself, while it is crossing. Two pixels of the ASI's own
    // colour, and a wash ahead of it so it reads as arriving rather than as a
    // divider that was always there.
    if (sweepT > 0 && sweepT < 1) {
      const x = this.swept * s;
      const g = c.createLinearGradient(x - s * 6, 0, x + s * 2, 0);
      g.addColorStop(0, 'rgba(122,233,255,0)');
      g.addColorStop(1, 'rgba(122,233,255,0.26)');
      c.fillStyle = g;
      c.fillRect(x - s * 6, 0, s * 8, this.canvas.height);
      c.fillStyle = C.sweep;
      c.globalAlpha = 0.8;
      c.fillRect(x, 0, Math.max(1, Math.round(this.dpr)) * 2, this.canvas.height);
      c.globalAlpha = 1;
    }
  }

  /** Has the wavefront reached this cell? */
  private wasShown(i: number): boolean {
    return i >= 0 && i < this.built.length && this.built[i] === 1;
  }
}
