// Procedural ambient audio, no assets. The soundscape is itself a narrative
// instrument: early on it is wind, birdsong, and weather; as compute grows a
// server hum rises underneath; and as optimization proceeds the world gets
// quieter and *cleaner* — the hum purifies toward a single sine, the birds
// thin out, and observer mode is nearly silent.

import type { GameState } from '../game/types';

export class Soundscape {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private windGain!: GainNode;
  private rainGain!: GainNode;
  private humGain!: GainNode;
  private humRough!: GainNode;  // sawtooth component: the "dirty" early hum
  private humPure!: GainNode;   // sine component: the optimized hum
  private birdTimer = 0;

  /** True once the context exists and is actually producing sound. */
  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /**
   * Must be called from a user gesture (autoplay policy). Safe to call twice.
   *
   * A context built without an activation starts suspended, and returning early
   * on `this.ctx` meant every later gesture was a no-op — one bad first attempt
   * and the session stayed silent for good. Re-entry now resumes instead.
   */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state !== 'running') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.5 : 0;
    this.master.connect(ctx.destination);

    // shared looped noise buffer
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    // wind: low band-passed noise
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf; wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass'; windFilter.frequency.value = 320; windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.03;
    wind.connect(windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    // rain: high-passed noise
    const rain = ctx.createBufferSource();
    rain.buffer = noiseBuf; rain.loop = true;
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass'; rainFilter.frequency.value = 2800;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(rainFilter).connect(this.rainGain).connect(this.master);
    rain.start();

    // server hum: rough (saw through lowpass) crossfading to pure (sine) as
    // the system optimizes itself
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    this.humGain.connect(this.master);
    const rough = ctx.createOscillator();
    rough.type = 'sawtooth'; rough.frequency.value = 58;
    const roughLp = ctx.createBiquadFilter();
    roughLp.type = 'lowpass'; roughLp.frequency.value = 220;
    this.humRough = ctx.createGain(); this.humRough.gain.value = 1;
    rough.connect(roughLp).connect(this.humRough).connect(this.humGain);
    rough.start();
    const pure = ctx.createOscillator();
    pure.type = 'sine'; pure.frequency.value = 116;
    this.humPure = ctx.createGain(); this.humPure.gain.value = 0;
    pure.connect(this.humPure).connect(this.humGain);
    pure.start();
    // Chrome can still hand back a suspended context — a backgrounded tab, or
    // a gesture it declined to count. Ask once; the caller keeps trying.
    if (ctx.state !== 'running') void ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.ctx && this.master) {
      this.master.gain.linearRampToValueAtTime(on ? 0.5 : 0, this.ctx.currentTime + 0.2);
    }
  }

  /** Called ~every frame; cheap parameter drift plus occasional one-shots. */
  update(g: GameState, dt: number, nightF: number, rain: number, snowing: boolean): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime;
    const e = g.asi.emergence / 100;
    const observer = g.asi.observer;
    this.phase = g.asi.phase;
    const hush = observer ? 0.4 : 1; // the optimized world is a quiet world

    // wind: stronger in storms and winter, softer at night
    const windTarget = (0.022 + rain * 0.05 + (snowing ? 0.015 : 0)) * (1 - nightF * 0.3) * hush;
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.6);

    // rain hiss (snow falls silently)
    this.rainGain.gain.setTargetAtTime(snowing ? 0 : rain * 0.06 * hush, t, 0.4);

    // server hum: louder with compute, purer with emergence
    const humTarget = Math.min(0.1, g.resources.compute / 1600) * (0.7 + nightF * 0.3) * (observer ? 0.5 : 1);
    this.humGain.gain.setTargetAtTime(humTarget, t, 1.2);
    this.humRough.gain.setTargetAtTime(1 - e * 0.9, t, 2);
    this.humPure.gain.setTargetAtTime(e * 0.8, t, 2);

    // birdsong: daytime, healthy air, human world. Pollution and optimization
    // both thin the chorus; observer mode silences it.
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 0.4 + Math.random() * 1.2;
      const vitality = (1 - nightF) * Math.max(0, 1 - g.pollutionAvg * 3.2) * Math.max(0, 1 - e * 1.1) * (observer ? 0 : 1);
      if (Math.random() < vitality * 0.55) this.chirp();
    }
  }

  private chirp(): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const f0 = 2400 + Math.random() * 1600;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * (0.7 + Math.random() * 0.5), t + 0.09);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.028, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.14);
    // occasional second note
    if (Math.random() < 0.4) {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(f0 * 1.2, t + 0.13);
      osc2.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + 0.2);
      gain2.gain.setValueAtTime(0, t + 0.13);
      gain2.gain.linearRampToValueAtTime(0.022, t + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.0005, t + 0.24);
      osc2.connect(gain2).connect(this.master);
      osc2.start(t + 0.13);
      osc2.stop(t + 0.26);
    }
  }

  /** Soft two-note chime when an event needs a decision. */
  eventChime(): void {
    this.tone(523, 0.10, 0.035, 0);
    this.tone(659, 0.14, 0.03, 0.09);
  }

  /** A single cold glassy tone for system (ASI) notices. */
  systemTone(): void {
    this.tone(1174, 0.5, 0.022, 0, 'sine');
  }

  // ------------------------------------------------------------ interaction
  //
  // The console had two sounds in it — a decision chime and a system tone —
  // and every other action the player took was silent, including the ones with
  // no other confirmation at all. A refused placement in particular showed a
  // red footprint for one frame and said nothing.
  //
  // The vocabulary is deliberately small and quiet. It sits under the ambient
  // bed rather than over it, acceptance and refusal are unmistakably different
  // from each other, and the whole set thins as the interface takes over:
  // clicks the system has stopped needing your opinion on stop making a noise.

  /** Tracked in update(), which already sees the state every frame. */
  private phase = 0;
  /** 1 early, fading to nothing as the console stops wanting to be operated. */
  private get uiLevel(): number {
    return this.phase >= 6 ? 0 : Math.max(0, 1 - this.phase * 0.16);
  }

  /**
   * Rate limit for the sounds a drag can emit.
   *
   * Painting a road fires one placement per frame at 60Hz. Sixty overlapping
   * clicks a second is not feedback, it is a buzz — so a repeat inside the
   * window is dropped rather than queued.
   */
  private lastPaint = 0;
  private throttled(minGap: number): boolean {
    // At lockout the console has stopped wanting to be operated, so it stops
    // answering. Checked here rather than by passing a zero volume, because a
    // zero-volume tone still builds and starts an oscillator — inaudible, but
    // not actually silent in any sense that matters.
    if (this.uiLevel <= 0) return true;
    const now = this.ctx?.currentTime ?? 0;
    if (now - this.lastPaint < minGap) return true;
    this.lastPaint = now;
    return false;
  }

  /** A building went down. Short, soft, and unmistakably an affirmative. */
  placed(): void {
    if (this.throttled(0.05)) return;
    this.tone(760, 0.055, 0.026 * this.uiLevel, 0, 'triangle');
    this.tone(1140, 0.05, 0.014 * this.uiLevel, 0.03, 'sine');
  }

  /** A tile of road or rock under a drag: quieter, and rate limited harder. */
  paint(): void {
    if (this.throttled(0.075)) return;
    this.tone(520 + Math.random() * 60, 0.035, 0.011 * this.uiLevel, 0, 'triangle');
  }

  /** Something was removed. A downward pair — the inverse of `placed`. */
  demolished(): void {
    if (this.throttled(0.05)) return;
    this.tone(320, 0.09, 0.028 * this.uiLevel, 0, 'triangle');
    this.tone(190, 0.13, 0.02 * this.uiLevel, 0.05, 'triangle');
  }

  /** The action was refused. Flat, low, and nothing like the others. */
  refused(): void {
    if (this.throttled(0.12)) return;
    this.tone(150, 0.11, 0.03 * this.uiLevel, 0, 'square');
  }

  /** A drawer opened, or a tool was picked up. Barely there on purpose. */
  uiTick(): void {
    if (this.uiLevel <= 0) return;
    this.tone(880, 0.03, 0.012 * this.uiLevel, 0, 'sine');
  }

  private tone(freq: number, dur: number, vol: number, delay: number, type: OscillatorType = 'triangle'): void {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0004, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
