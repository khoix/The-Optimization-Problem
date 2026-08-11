// The walkthrough: how the region works, for somebody who has never seen it.
//
// Written as the first hour of the job rather than as a manual. The reader is
// an administrator who has just been handed a small town, and each page is the
// next thing they would actually need to know — roads before utilities,
// utilities before growth, growth before the politics of it.
//
// The illustrations are live. Every sprite in this project is generated at
// load and nothing is fetched, so committed screenshots would be both the
// first assets in the repo and the first thing to go stale the next time the
// HUD moves. Instead there is one small region, built once, drawn by the same
// renderer the game uses, with the camera moving to whatever the page is
// talking about. It cannot fall out of date with the game because it *is* the
// game. The HUD figures are the same idea from the other side: real markup in
// the real classes, so a restyled bar restyles the guide with it.

import { newGame, placeBuilding, tileAt, MAP_W, MAP_H } from '../game/state';
import type { GameState } from '../game/types';
import { Renderer, type OverlayId, type UiRenderState } from '../render/renderer';
import { icon } from './icons';

interface MapFigure {
  kind: 'map';
  /** Tile the camera centres on. */
  at: [number, number];
  zoom: number;
  hour: number;
  overlay?: OverlayId;
}
interface HtmlFigure {
  kind: 'html';
  html: string;
}

interface GuidePage {
  key: string;
  title: string;
  /** Body copy. Kept short: a page nobody finishes teaches nothing. */
  body: string;
  figure: MapFigure | HtmlFigure;
  caption: string;
}

/** The illustrative region: one town, seen from different angles. */
const SCENE_SEED = 20260805;
/** Where the scene's founding settlement sits, in tiles. */
const CX = Math.floor(MAP_W * 0.52);
const CY = Math.floor(MAP_H * 0.5);

const el = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

/** A capacity gauge, in the bar's own markup. Need first, then capacity. */
const fig_gauge = (icon: string, need: string, have: string, pct: number, cls: string, note: string) =>
  `<div class="fig-vital">
     <span class="vital-ico">${icon}</span>
     <span class="vital-body">
       <span class="vital-num">${need}<span class="vital-cap">/${have}</span></span>
       <span class="gauge"><span class="gauge-fill ${cls}" style="width:${Math.min(100, pct)}%"></span></span>
     </span>
     <span class="fig-note">${note}</span>
   </div>`;

const fig_meter = (icon: string, label: string, value: number, text: string, cls: string, note: string) =>
  `<div class="fig-vital">
     <span class="vital-ico">${icon}</span>
     <span class="vital-body">
       <span class="vital-num">${text}<span class="vital-label-inline">${label}</span></span>
       <span class="gauge"><span class="gauge-fill ${cls}" style="width:${value}%"></span></span>
     </span>
     <span class="fig-note">${note}</span>
   </div>`;

/** The capital rate bar, in the same markup the bar builds it from. */
const fig_rate = (text: string, frac: number, cls: string, note: string) => {
  const pct = Math.abs(frac) * 50;
  return `<div class="fig-vital">
     <span class="vital-ico">§</span>
     <span class="vital-body">
       <span class="vital-num">${text}<span class="vital-label-inline">Capital</span></span>
       <span class="gauge gauge-rate"><span class="gauge-zero"></span>
         <span class="gauge-fill ${cls}" style="left:${frac < 0 ? 50 - pct : 50}%;width:${pct}%"></span></span>
     </span>
     <span class="fig-note">${note}</span>
   </div>`;
};

const PAGES: GuidePage[] = [
  {
    key: 'post',
    title: 'You have the post',
    body: `<p>The board has given you a river town of about sixty people and full authority
      over everything in it: what gets built, where the power comes from, which policies
      apply, and what the region does about the technology sector that keeps asking to
      invest here.</p>
      <p><b>Keep it in balance as it grows.</b> It ends two ways: you let something
      collapse, or the electorate replaces you at an election.</p>`,
    figure: { kind: 'map', at: [CX, CY], zoom: 3, hour: 7.5 },
    caption: 'Your region, the morning you take office.',
  },
  {
    key: 'roads',
    title: 'Everything starts with a road',
    body: `<p>Pick a category from the tool belt, then click the map. Roads come first, and
      not as decoration: <b>a building with no road frontage cannot be staffed</b>, and a
      workplace has to trace a route along the network back to somebody's housing. Jobs
      have to be reachable, not merely next to pavement.</p>
      <p>Drag to paint. Paving over a road upgrades it — a dirt track carries four lanes'
      worth of traffic, a highway forty-five — so congestion is something you can build
      your way out of.</p>
      <p>Anything stranded says so: a badge on the map, and the reason in plain words in
      the inspector.</p>`,
    figure: { kind: 'map', at: [CX - 3, CY - 1], zoom: 2, hour: 11, overlay: 'roads' },
    caption: 'Road Access layer: green is connected, red is stranded, and that outlying mill is nobody\'s commute.',
  },
  {
    key: 'utilities',
    title: 'Power and water only reach so far',
    body: `<p>Every utility projects a <b>service area</b> that scales with its class — a solar
      farm covers nine tiles' radius, a nuclear plant twenty. A building outside every
      service area draws nothing at all, however much spare capacity the region has.</p>
      <p>So there are two separate questions, and both have to pass: is this building
      <em>inside</em> a service area, and does the region have enough total capacity to
      supply it? The gauges on the bar answer the second. These layers answer the first.</p>`,
    figure: { kind: 'map', at: [CX - 3, CY - 1], zoom: 2, hour: 11, overlay: 'power' },
    caption: 'Power Coverage: lit ground is served, dark ground is not, and a red outline is a building that needs power and has none.',
  },
  {
    key: 'console',
    title: 'Reading the console',
    body: `<p>The bar along the bottom is the whole instrument panel. Capacity gauges read the
      same way round every time — <b>need first, then what you have</b> — so a glance never
      has to work out which number is which.</p>
      <p><b>Capital reads differently.</b> Its bar is a rate, not a proportion: it grows
      out of the centre, right when the treasury is gaining and left when it is losing,
      and the length is that rate measured against everything the region takes in. It
      averages half a year, so one expensive decision does not swing it.</p>
      <p>Hover anything on the bar or in <i>Indicators</i> and it will tell you what it
      measures, what moves it, and at whose expense. Nothing here expects you to already
      know what it means.</p>`,
    figure: {
      kind: 'html',
      html: `<div class="fig-hud">
        ${fig_gauge(icon('power'), '412', '500', 82, 'gauge-ok', 'Comfortable — 82% of capacity in use.')}
        ${fig_gauge(icon('water'), '340', '300', 113, 'gauge-bad', 'Over capacity. Something is about to go dark.')}
        ${fig_rate('4,180', 0.52, 'gauge-ok', 'Capital, gaining — keeping about half of what comes in.')}
        ${fig_rate('1,905', -0.7, 'gauge-bad', 'The same bar, going the other way. This region has months, not years.')}
        ${fig_meter(icon('trust'), 'Trust', 61, '61', 'gauge-ok', 'An indicator, same visual language.')}
        ${fig_meter(icon('unrest'), 'Unrest', 38, '38', 'gauge-warn', 'Inverted: for this one, low is the good end.')}
      </div>`,
    },
    caption: 'The gauges, as they appear on the bar.',
  },
  {
    key: 'growth',
    title: 'Why people move here',
    body: `<p>Migration is not a dice roll. People arrive for seven named reasons — jobs,
      housing, amenities, services, environment, safety, affordability — and every one of
      them is a bar you can go and look at in <i>Indicators</i>.</p>
      <p>Two of those are measured <b>per resident</b>, which is the trap. A town with one
      school is well served; the same town at four times the size, with one school, is
      not. Growth erodes your own appeal unless you keep building into it.</p>
      <p>And residents normalise whatever you deliver. <b>A standard you meet once becomes
      the standard you are judged against</b> — quickly on the way up, slowly on the way
      back down.</p>`,
    figure: { kind: 'map', at: [CX, CY + 2], zoom: 2, hour: 17.5 },
    caption: 'The same region, a few years in.',
  },
  {
    key: 'decisions',
    title: 'Decisions, and the people who judge them',
    body: `<p>Every so often something arrives that needs an answer, and the clock stops while
      you give one. Each option shows its projected impact, calculated by actually running
      the choice — so the numbers are exact, not indicative.</p>
      <p>There is rarely a clean option. Eight population groups want incompatible things,
      and their approval is weighted by how much of the region each one is. <b>An election
      every four years</b>: below 50% weighted support, your administration ends.</p>
      <p>If an option looks free, the cost is somewhere you are not being shown.</p>`,
    figure: {
      kind: 'html',
      html: `<div class="fig-choice">
        <div class="fig-choice-btn">Approve the expansion
          <span class="chips"><span class="chip chip-good">▲ Capital +240</span><span class="chip chip-good">▲ Jobs +85</span><span class="chip chip-bad">▼ Environment −6</span><span class="chip chip-bad">▼ Trust −3</span></span>
        </div>
        <div class="fig-choice-btn">Require an environmental review first
          <span class="chips"><span class="chip chip-good">▲ Trust +4</span><span class="chip chip-bad">▼ Capital −60</span></span>
        </div>
      </div>
      <div class="fig-groups">
        <div class="fig-group"><span>Environmentalists</span><span class="gauge"><span class="gauge-fill gauge-bad" style="width:22%"></span></span></div>
        <div class="fig-group"><span>Small business</span><span class="gauge"><span class="gauge-fill gauge-ok" style="width:71%"></span></span></div>
        <div class="fig-group"><span>Displaced workers</span><span class="gauge"><span class="gauge-fill gauge-warn" style="width:44%"></span></span></div>
      </div>`,
    },
    caption: 'A decision, with its projected impact — and three of the eight blocs who will remember it.',
  },
  {
    key: 'compute',
    title: 'The compute',
    body: `<p>Demand for computing rises whether or not you build for it, and meeting it is
      usually the reasonable thing to do. Data centres pay well, employ people, and make
      the services residents like measurably better.</p>
      <p>You allocate what you produce between six sectors in the <i>Compute</i> panel.
      Everything given to one is taken from another — healthcare against industry against
      research against surveillance — and the region will have opinions about the split.</p>
      <p>It draws power and water like a small city of its own. Plan for that.</p>`,
    figure: { kind: 'map', at: [CX + 9, CY + 5], zoom: 3, hour: 21.5 },
    caption: 'The compute campus after dark.',
  },
  {
    key: 'first',
    title: 'Your first year',
    body: `<p>Nothing below is urgent. The region is stable the day you arrive, and the first
      few years are yours to spend however you like.</p>
      <ul class="fig-list">
        <li><b>Pave before you build.</b> Extend the grid first, then place into it.</li>
        <li><b>Watch the housing gauge.</b> People arrive whether or not there is
          anywhere to put them, and a shortage costs you trust, health and confidence.</li>
        <li><b>Build power and water ahead of demand,</b> and check the coverage layers
          rather than assuming reach.</li>
        <li><b>Hover anything you don't recognise.</b> Every figure explains itself.</li>
        <li><b>Press <kbd>?</kbd></b> for the full list of keys, and <kbd>Space</kbd>
          to pause and think.</li>
      </ul>
      <p class="fig-sign">Good luck, Administrator. There is no reason to expect any
      difficulty.</p>`,
    figure: { kind: 'map', at: [CX, CY], zoom: 2, hour: 6.5 },
    caption: 'Year one, month one.',
  },
];

export class Guide {
  private overlay: HTMLElement;
  private figureHost!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private htmlFigure!: HTMLElement;
  private titleEl!: HTMLElement;
  private bodyEl!: HTMLElement;
  private captionEl!: HTMLElement;
  private dots!: HTMLElement;
  private backBtn!: HTMLButtonElement;
  private nextBtn!: HTMLButtonElement;

  private page = 0;
  private open = false;
  private raf = 0;
  private lastFrame = 0;
  /** Built on first open — the sprite atlases are not worth paying for twice. */
  private scene: GameState | null = null;
  /** Anything the scene asked for and could not place. Should always be empty. */
  readonly sceneMissing: string[] = [];
  private renderer: Renderer | null = null;

  /** What the last page's button says and does. Set per opening. */
  private finish: { label: string; action: () => void } = { label: 'Close', action: () => {} };

  constructor(private root: HTMLElement) {
    this.overlay = el('div', 'guide hidden');
    this.build();
    this.root.append(this.overlay);
  }

  private build(): void {
    const box = el('div', 'guide-box');

    this.figureHost = el('div', 'guide-figure');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'guide-canvas hidden';
    this.htmlFigure = el('div', 'guide-html hidden');
    this.figureHost.append(this.canvas, this.htmlFigure);
    this.captionEl = el('div', 'guide-caption');

    const text = el('div', 'guide-text');
    this.titleEl = el('h2', 'guide-title');
    this.bodyEl = el('div', 'guide-body');
    text.append(this.titleEl, this.bodyEl);

    const foot = el('div', 'guide-foot');
    this.dots = el('div', 'guide-dots');
    this.backBtn = el('button', 'guide-btn', 'Back') as HTMLButtonElement;
    this.nextBtn = el('button', 'guide-btn primary', 'Next') as HTMLButtonElement;
    const skip = el('button', 'guide-skip', 'Close') as HTMLButtonElement;
    skip.onclick = () => this.hide();
    this.backBtn.onclick = () => this.go(this.page - 1);
    this.nextBtn.onclick = () => {
      if (this.page < PAGES.length - 1) { this.go(this.page + 1); return; }
      // The last page ends the walkthrough by doing the thing it has spent
      // eight pages preparing the reader for, rather than dumping them back
      // where they started with no next step.
      const done = this.finish.action;
      this.hide();
      done();
    };
    foot.append(skip, this.dots, this.backBtn, this.nextBtn);

    for (let i = 0; i < PAGES.length; i++) {
      const d = el('button', 'guide-dot');
      d.title = PAGES[i].title;
      d.onclick = () => this.go(i);
      this.dots.append(d);
    }

    box.append(this.figureHost, this.captionEl, text, foot);
    this.overlay.append(box);
    this.overlay.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowRight') this.go(this.page + 1);
      else if (ev.key === 'ArrowLeft') this.go(this.page - 1);
      else if (ev.key === 'Escape') this.hide();
      else return;
      ev.preventDefault();
      ev.stopPropagation();
    });
  }

  /**
   * The illustrative region. Founded like any other, then grown by hand into
   * something with each of the situations the pages talk about actually present
   * in it — including one deliberately stranded building, because a page about
   * road access with nothing stranded on it teaches the wrong lesson.
   */
  private buildScene(): GameState {
    const g = newGame(SCENE_SEED, 'verdant');
    g.speed = 0;
    // Level the ground the scene is drawn on.
    //
    // Every site below is a fixed offset from the region's centre, chosen to
    // compose. What is *under* those offsets is noise, and the noise resamples
    // whenever the map's dimensions change — so growing the region from 72 to
    // 112 tiles put rock under the compute campus and the scene lost a building
    // it has a whole page about. The illustration should not be at the mercy of
    // a seed it does not choose. Water is left alone: the river is scenery, and
    // it runs a long way west of anything placed here.
    for (let y = CY - 10; y <= CY + 10; y++) {
      for (let x = CX - 9; x <= CX + 15; x++) {
        const t = tileAt(g, x, y);
        if (t && (t.terrain === 'rock' || t.terrain === 'forest')) t.terrain = 'grass';
      }
    }
    const road = (x: number, y: number) => {
      const t = tileAt(g, x, y);
      // Never pave a building's own footprint: the tile would claim to be both,
      // and the building it belonged to would be neither placed nor removed.
      if (!t || t.terrain === 'water' || t.buildingId !== -1) return;
      t.road = true; t.roadType = 1;
      if (t.terrain === 'forest') t.terrain = 'grass';
    };
    // Extend the founding grid east and south, into the space the campus wants.
    for (const row of [CY - 8, CY + 4, CY + 8]) for (let x = CX - 7; x <= CX + 13; x++) road(x, row);
    for (const col of [CX + 8, CX + 12]) for (let y = CY - 8; y <= CY + 8; y++) road(col, y);
    for (let x = CX + 4; x <= CX + 8; x++) road(x, CY - 4);

    /**
     * Place one building, trying each candidate site in turn.
     *
     * Sites are given rather than searched, so the layout stays deliberate —
     * but a site can fail for reasons this code cannot see from here (the
     * seed put rock there, the founding grid already owns the tile), and a
     * figure quietly missing the building its caption describes is worse than
     * a wrong one. Anything that finds no home at all is recorded, and the
     * tests assert the list is empty.
     */
    const put = (type: Parameters<typeof placeBuilding>[1], ...sites: Array<[number, number]>) => {
      for (const [x, y] of sites) {
        if (placeBuilding(g, type, x, y, { free: true, instant: true })) return;
      }
      this.sceneMissing.push(type);
    };

    // Housing along the northern street, and the services that keep it attractive.
    for (const x of [CX - 3, CX - 1, CX + 1, CX + 3]) put('apartment', [x, CY - 7]);
    put('hospital', [CX - 7, CY - 3], [CX - 7, CY + 1]);
    put('school', [CX - 7, CY + 1], [CX - 7, CY - 3]);
    put('park', [CX + 2, CY - 2], [CX - 3, CY - 2]);
    put('library', [CX + 2, CY + 5], [CX + 5, CY + 5]);
    put('retail', [CX - 6, CY + 5], [CX - 6, CY + 1]);
    // A second solar farm and reservoir, out east where the campus will sit.
    put('solar_farm', [CX + 9, CY - 3]);
    put('water_plant', [CX + 9, CY + 2]);
    // The compute campus, far enough out to be its own district.
    put('edge_dc', [CX + 10, CY + 5]);
    put('cloud_dc', [CX + 13, CY + 5]);
    // And one mill with no road anywhere near it, close enough west that it and
    // the town share a frame — a page about stranded buildings whose stranded
    // building is off-screen teaches nothing. It also sits outside every power
    // service area, which is what the page after it is pointing at.
    put('factory', [CX - 12, CY - 3], [CX - 12, CY + 1], [CX - 13, CY - 1]);

    for (const b of g.buildings.values()) { b.progress = 1; b.active = true; }
    g.population = 420;
    // Built in one go and never edited afterwards, so the whole scene is new to
    // the renderer: bump the version and leave the dirty list saying "all".
    g.mapVersion++;
    g.dirtyTiles = null;
    return g;
  }

  show(finish?: { label: string; action: () => void }): void {
    this.finish = finish ?? { label: 'Close', action: () => {} };
    if (!this.scene) this.scene = this.buildScene();
    if (!this.renderer) {
      this.renderer = new Renderer(this.canvas);
    }
    this.open = true;
    this.overlay.classList.remove('hidden');
    this.overlay.tabIndex = -1;
    this.go(0);
    this.overlay.focus();
    this.lastFrame = performance.now();
    this.loop(this.lastFrame);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.overlay.classList.add('hidden');
  }

  get isOpen(): boolean { return this.open; }

  private go(n: number): void {
    this.page = Math.max(0, Math.min(PAGES.length - 1, n));
    const p = PAGES[this.page];
    this.titleEl.textContent = p.title;
    this.bodyEl.innerHTML = p.body;
    this.captionEl.textContent = p.caption;
    const isMap = p.figure.kind === 'map';
    this.canvas.classList.toggle('hidden', !isMap);
    this.htmlFigure.classList.toggle('hidden', isMap);
    // A map figure wants the full 16:6 frame; a diagram wants exactly its own
    // height, rather than a third of the box left blank around it.
    this.figureHost.classList.toggle('compact', !isMap);
    if (p.figure.kind === 'html') this.htmlFigure.innerHTML = p.figure.html;
    else if (this.renderer) {
      // The canvas only has a size once it is visible, so measure after the
      // class flip rather than before it.
      this.renderer.resize();
      this.renderer.zoom = p.figure.zoom;
      this.renderer.resize();
      this.renderer.hour = p.figure.hour;
      this.renderer.centerOn(p.figure.at[0], p.figure.at[1]);
    }
    [...this.dots.children].forEach((d, i) => d.classList.toggle('on', i === this.page));
    this.backBtn.disabled = this.page === 0;
    this.nextBtn.textContent = this.page === PAGES.length - 1 ? this.finish.label : 'Next';
  }

  /** Live, so the traffic moves and the campus lights come on as you read. */
  private loop = (now: number): void => {
    if (!this.open || !this.renderer || !this.scene) return;
    const dt = Math.max(0, Math.min(0.1, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    const p = PAGES[this.page];
    if (p.figure.kind === 'map') {
      this.renderer.update(this.scene, dt, 1);
      // The illustration's weather is not a variable the reader can act on,
      // and rain over a page about road access is just noise.
      this.renderer.rain = 0;
      this.renderer.hour = p.figure.hour;
      const ui: UiRenderState = {
        hoverTile: null, buildType: null, buildTile: null, canPlaceHere: false, buildReplaces: false,
        demolish: null, selectedBuildingId: null,
        overlay: p.figure.overlay ?? null, cursorWorld: null, xrayRadial: false,
      };
      this.renderer.render(this.scene, ui);
    }
    this.raf = requestAnimationFrame(this.loop);
  };
}
