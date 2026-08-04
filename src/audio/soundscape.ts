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

  /** Must be called from a user gesture (autoplay policy). Safe to call twice. */
  init(): void {
    if (this.ctx) return;
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
