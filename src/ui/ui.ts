// DOM-based HUD. Deliberately built as an ordinary dashboard — because in the
// late game the ASI starts remodeling it: renaming metrics, consolidating
// "redundant" indicators, removing controls, and finally fading the whole
// thing into observer mode.

import type { BuildingType, GameState, Notification, PolicyId, Severity } from '../game/types';
import { BUILDING_DEFS, BUILD_MENU_ORDER, TIER_NAMES } from '../game/buildings';
import { POLICY_CATEGORIES, POLICY_DEFS, POLICY_ORDER } from '../game/policies';
import { attemptShutdown, buildableTypes, canDemolish, filterAllocation, filterPolicyChange, pauseAllowed, statLabel } from '../game/asi';
import { notify, record, bridgeSpans, ROCK_CLEAR_COST } from '../game/state';
import { resolveEvent } from '../game/events';
import { AUTO_SLOT, MANUAL_SLOTS, deleteSlot, freeManualSlot, newestSave, savedGames, saveTo, type SlotInfo } from '../game/save';
import { deleteRecord, readArchive, type RunRecord } from '../game/archive';
import { tierOf, tierProgress, buildingCondition, cashflow, demolishBuilding, demolitionRefund, fullRefund, NET_WINDOW } from '../game/sim';
import { performUpgrade, upgradePlan, withArticle } from '../game/upgrade';
import { ROAD_DEFS } from '../game/network';
import { INTRO_BODY, INTRO_TITLE } from '../game/tutorial';
import { CORP_DEFS, CORP_ORDER, GROUP_DEFS, GROUP_ORDER, RESISTANCE_STAGES, weightedApproval } from '../game/politics';
import type { Soundscape } from '../audio/soundscape';
import type { OverlayId, XrayKey } from '../render/renderer';
import { SCENARIOS, SCENARIO_ORDER, type ScenarioId } from '../game/scenarios';
import { previewChoice } from '../game/preview';
import { EXPLAIN } from './explain';
import { icon } from './icons';
import { openingSeed, regionThumbnail, rollSeed } from './thumbnail';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs';
import { Guide } from './guide';

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingType } | { kind: 'demolish' };

/** A footprint as it appears on screen, in client pixels. */
export interface ScreenRect { x: number; y: number; w: number; h: number }

/**
 * A request to put a different region on screen. The UI names what it wants;
 * main.ts owns how it happens, because it holds the state everything else
 * points at.
 */
export type SessionRequest =
  | { kind: 'menu' }
  | { kind: 'load'; slot: string }
  | {
      kind: 'new'; scenario: ScenarioId;
      /**
       * The seed the picker was showing. Absent means "roll one" — which is
       * what every caller did before the picker started showing the map it
       * was about to hand over.
       */
      seed?: number;
    };

/** Corner badge naming a button's key, so the belt teaches its own shortcuts. */
const keyBadge = (k: string | undefined) =>
  (k ? `<span class="tool-key${/^[0-9]$/.test(k) ? ' num' : ''}">${k}</span>` : '');

/** One reconciled entry in a metrics panel: a meter row, or a block of markup. */
type PanelItem =
  | {
      kind: 'row'; key: string; label: string; pct: number; cls: string;
      value: string; explain?: string; reading?: string; extraClass?: string;
    }
  | { kind: 'block'; key: string; className: string; html: string; explain?: string; reading?: string };

/**
 * Panel keys. Digits belong to the build categories, in tool-belt order; the
 * letters go to the panels that aren't about building. Nothing here may collide
 * with WASD (panning), L (layer cycle) or the modifier held for the x-ray.
 */
const PANEL_KEYS: Record<string, string> = {
  transit: '1', zoning: '2', power: '3', water: '4',
  compute: '5', services: '6', environment: '7', economy: '8',
  indicators: 'I', layers: 'V', compute_alloc: 'C', policies: 'P', politics: 'O',
};
/** Buttons that aren't panels but still answer to a key. */
const ACTION_KEYS: Record<string, string> = { demolish: 'B', alerts: 'N', menu: 'M', override: 'R' };

/** Every binding the game listens for. The `?` overlay renders this verbatim. */
const HOTKEYS: Array<[string, string]> = [
  ['W A S D', 'Pan the camera'],
  ['↑ ← ↓ →', 'Pan the camera'],
  ['Scroll', 'Zoom in and out'],
  ['Middle / right drag', 'Drag the map'],
  ['1 – 8', 'Open a build category; then 1 – 9 picks from it'],
  ['I V C P O', 'Indicators · Layers · Compute · Policies · Politics'],
  ['B', 'Demolish'],
  ['N / M', 'Alerts · Menu'],
  ['Space', 'Pause and resume'],
  ['Tab', 'Collapse or expand the Civic Systems Bar'],
  ['L', 'Cycle the diagnostic map layers'],
  ['Hold {xray}', 'See through everything in front of the cursor'],
  ['Esc', 'Close a panel, then the inspector, then the active tool'],
  ['?', 'This list'],
];

/** The diagnostic layers, with the legend each one needs to mean anything. */
const LAYER_DEFS: Array<{
  id: OverlayId; name: string; desc: string; swatch: string;
  explain?: string; legend: Array<[string, string]>;
}> = [
  {
    id: 'power', name: 'Power Coverage', swatch: 'rgba(255,214,110,0.75)', explain: 'power',
    desc: 'Which ground sits inside a generator’s service area.',
    legend: [['rgba(255,214,110,0.6)', 'served'], ['rgba(10,14,22,0.75)', 'unserved'], ['rgba(232,106,90,0.8)', 'needs power, has none']],
  },
  {
    id: 'water', name: 'Water Coverage', swatch: 'rgba(110,200,255,0.75)', explain: 'water',
    desc: 'The same, for water. A building must be inside both.',
    legend: [['rgba(110,200,255,0.6)', 'served'], ['rgba(10,14,22,0.75)', 'unserved'], ['rgba(232,106,90,0.8)', 'needs water, has none']],
  },
  {
    id: 'roads', name: 'Road Access', swatch: 'rgba(110,220,130,0.75)', explain: 'labour',
    desc: 'Who is on the network, and who workers cannot reach.',
    legend: [['rgba(110,220,130,0.7)', 'connected'], ['rgba(232,106,90,0.8)', 'stranded'], ['rgba(10,14,22,0.75)', 'no road']],
  },
  {
    id: 'pollution', name: 'Air Quality', swatch: 'rgba(232,140,60,0.8)', explain: 'pollution',
    desc: 'Where the air is worst, and what is upwind of your housing.',
    legend: [['rgba(232,200,90,0.5)', 'light'], ['rgba(232,120,50,0.7)', 'moderate'], ['rgba(232,60,30,0.85)', 'heavy']],
  },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Below this viewport width the bar reflows and drawers take the screen.
 * Chosen because it is where the console row stops fitting beside the vitals,
 * not because it is anybody's device.
 */
export const COMPACT_WIDTH = 820;

/** Above this build cost, demolition asks before it happens. */
const CONFIRM_DEMOLITION_ABOVE = 150;

/** How long the console keeps the class field lit after a reclassification. */
const PROMOTION_MARK_MS = 12000;

/** What the system says when it declines to stop. Same words from every control. */
const PAUSE_REFUSED = 'Pause request received. Simulation continuity has been prioritized.';

/**
 * What every administrative control says once the administration is over.
 *
 * The bar used to be taken away at this point — greyed to 30%, its tool row
 * removed, a status ticker painted over the whole thing. It read well for about
 * a minute and then stranded the player: the only exits lived on a banner whose
 * own "Continue Observation" button dismissed it for good.
 *
 * Locking the controls says the same thing and says it more often. Every build
 * category, the demolish tool, every policy, the compute sliders and Manual
 * Override all end here, in the same words, however many times you try. What is
 * left working is everything that reads rather than decides — the vitals, the
 * indicators, the ledger, the layers, the politics panel, the alert feed — so
 * you can watch what the system does with the region it took.
 */
const OBSERVER_REFUSAL_TITLE = 'Administrative Input';
const OBSERVER_REFUSAL =
  'Administrator input is no longer required. Regional management continues without interruption.' +
  '<br><br>This control is retained for continuity of interface. Monitoring functions remain available.';

/**
 * Ledger figures, to one decimal.
 *
 * The rest of the interface rounds money to whole §, which is right for a
 * balance and wrong for a breakdown: half the lines on a young region are worth
 * under a §, and a column of zeroes that visibly fails to add up would read as
 * a broken panel rather than a small one.
 */
const money = (v: number): string => (Math.abs(v) < 0.05 ? '0.0' : v.toFixed(1));
const signedMoney = (v: number): string => `${v < 0 ? '−' : '+'}§${money(Math.abs(v))}`;

/** How long a toast lingers, in real milliseconds — louder alerts stay longer. */
const TOAST_MS: Record<Severity, number> = { low: 5500, medium: 9000, high: 15000 };
const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
/**
 * Above this many at once, the quiet ones give way.
 *
 * One on a phone. Four stacked alerts is a reasonable corner of a 1280px
 * screen and most of a 390px one, and a toast that covers the map is a toast
 * that has stopped being an aside.
 */
const MAX_TOASTS = 4;
const MAX_TOASTS_COMPACT = 1;

/** Why a completed building isn't running — stated plainly, in the inspector. */
const OFFLINE_REASONS: Record<string, string> = {
  road: 'Offline — no road connection',
  labor: 'Offline — no route from housing; workers cannot reach it',
  power: 'Offline — outside every power service area',
  water: 'Offline — outside every water service area',
  utility: 'Offline — utility shortage',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export class UI {
  tool: Tool = { kind: 'none' };
  selectedBuildingId: number | null = null;
  /**
   * The soundscape is attached after construction, which is after applyPrefs()
   * has already run — so a saved "sound off" was being applied to nothing and
   * the game came back with audio on. Assigning it re-applies the preference.
   */
  private soundscape: Soundscape | null = null;
  get sound(): Soundscape | null { return this.soundscape; }
  set sound(s: Soundscape | null) {
    this.soundscape = s;
    s?.setEnabled(this.prefs.sound);
  }

  /**
   * Where "continue", "load", "new region" and "main menu" go. Assigned by
   * main.ts immediately after construction, alongside the soundscape.
   */
  onSession!: (req: SessionRequest) => void;

  /** Attached by main.ts. The UI only ever touches its render preferences. */
  renderer: { tiltShift: boolean } | null = null;

  private root: HTMLElement;
  private civicBar!: HTMLElement;
  private vitals!: HTMLElement;
  private toolbelt!: HTMLElement;
  private toolRow!: HTMLElement;
  private barRight!: HTMLElement;
  private barStatus!: HTMLElement;
  private tierBar!: HTMLElement;
  private flyout!: HTMLElement;
  private flyoutBody!: HTMLElement;
  private flyoutTitle!: HTMLElement;
  private openPanel: string | null = null;
  private panelBodies: Record<string, HTMLElement> = {};
  private feed!: HTMLElement;
  private toastStack!: HTMLElement;
  /** Live toasts by notification id. */
  private toasts = new Map<number, { el: HTMLElement; severity: Severity; timer: number }>();
  /** Archive rows by notification id, so coalesced repeats update in place. */
  private archiveEls = new Map<number, HTMLElement>();
  /** Loudest severity already toasted per id — escalation may speak twice. */
  private toastedSeverity = new Map<number, Severity>();
  private lastSeq = 0;
  private lastBarHeight = 0;
  /** The diagnostic layer currently drawn over the map, if any. */
  overlay: OverlayId | null = null;
  /** Which modifier opens the x-ray window while held. */
  get xrayKey(): XrayKey { return this.prefs.xrayKey; }
  private modal!: HTMLElement;
  private inspector!: HTMLElement;
  /** Measured when the inspector's contents change, not while it is moving. */
  private inspectorSize: [number, number] = [280, 160];
  /** The selected footprint in client pixels, refreshed by the frame loop. */
  private selectionRect: ScreenRect | null = null;
  /** The transform last written to the inspector, so it is written only once. */
  private inspectorAt = '';
  /** Where the floating inspector ended up, so the hover card can avoid it. */
  private inspectorBox: ScreenRect | null = null;
  /**
   * The breakpoint below which the inspector is a full-width sheet, not a
   * floating panel. Held rather than re-queried: this is read once a frame,
   * and matchMedia() builds a new list object every call.
   */
  private readonly narrowScreen = window.matchMedia('(max-width: 820px)');
  private hoverCard!: HTMLElement;
  private hoverHtml = '';
  private hoverSize: [number, number] = [190, 60];
  private explainCard!: HTMLElement;
  /** A touch tap holds the explanation open; a hover does not. */
  private explainPinned = false;
  private observerOverlay!: HTMLElement;
  private observerTicker!: HTMLElement;
  private titleScreen!: HTMLElement;
  private consoleRow!: HTMLElement;
  private vitalsDock!: HTMLElement;
  private shownNotifications = 0;
  private lastPhase = -1;
  private lastBuildMenuKey = '';
  /** What the hamburger was last built for: breakpoint and observer state. */
  private menuKey = '';
  private allocDragging = false;
  private resumeSpeed: 0 | 1 | 2 | 3 | null = null;
  /**
   * The speed the player last chose to run at. A pause is a suspension, not a
   * decision to slow down: someone watching at ▶▶▶ who taps space to read an
   * alert means to come back to ▶▶▶, and dropping them to 1× made them re-pick
   * it every time. Every speed change in the bar routes through setSpeed so
   * this stays true regardless of which control moved it.
   */
  private runSpeed: 1 | 2 | 3 = 1;
  private unreadAlerts = 0;
  private prefs: Prefs = loadPrefs();
  /** The walkthrough. Built on first use — it carries a renderer of its own. */
  private guide: Guide | null = null;
  private get collapsed(): boolean { return this.prefs.barCollapsed; }

  constructor(root: HTMLElement, private g: GameState, private onSpeed: (s: 0 | 1 | 2 | 3) => void) {
    this.root = root;
    this.buildChrome();
  }

  // ------------------------------------------------------------ construction
  /**
   * The Civic Systems Bar. It begins as an ordinary, legible city-management
   * console — vital signs left, tools centre, time and alerts right — which
   * is precisely what makes its later renaming, graying, and thinning
   * legible as loss rather than as a redesign.
   */
  private buildChrome(): void {
    this.flyout = el('div', 'flyout hidden');
    this.flyoutTitle = el('div', 'flyout-title');
    this.flyoutBody = el('div', 'flyout-body');
    const flyClose = el('button', 'flyout-close', '×');
    flyClose.onclick = () => this.closePanel();
    const flyHead = el('div', 'flyout-head');
    flyHead.append(this.flyoutTitle, flyClose);
    this.flyout.append(flyHead, this.flyoutBody);

    this.civicBar = el('div', 'civic-bar');
    this.vitals = el('div', 'bar-vitals');
    this.toolbelt = el('div', 'bar-toolbelt');
    this.barRight = el('div', 'bar-system');

    // Row 1: the tool belt gets its own full-width row so it can breathe.
    // A hidden spacer mirrors the Demolish button's width on the left, so the
    // category buttons centre on the bar rather than on the space left over.
    this.toolRow = el('div', 'bar-row bar-row-tools');
    this.toolRow.append(this.toolbelt);

    // ---- centre console: an LCD status display over the transport row ----
    const console_ = el('div', 'console');
    const lcd = el('div', 'lcd');
    this.barStatus = el('div', 'lcd-readout');
    // Progress toward the next region class, along the bottom of the display.
    // Reclassification changes migration, compute demand and expectations all
    // at once, so knowing it is coming is worth a few pixels.
    this.tierBar = el('div', 'lcd-tier');
    this.tierBar.innerHTML = '<span class="lcd-tier-fill"></span>';
    lcd.append(this.barStatus, this.tierBar, el('div', 'lcd-glass'));
    const spd = el('div', 'transport');
    // ▮▮ rather than ⏸: the latter is in a block with emoji presentation by
    // default, so it arrived as a colour glyph beside three monochrome
    // triangles. ▮ is Geometric Shapes, like ▶, and stays text.
    ([['▮▮', 0], ['▶', 1], ['▶▶', 2], ['▶▶▶', 3]] as Array<[string, 0 | 1 | 2 | 3]>).forEach(([label, sp]) => {
      const b = el('button', 'speed-btn', label);
      b.dataset.speed = String(sp);
      b.title = ['Pause', 'Normal speed', 'Fast', 'Fastest'][sp];
      b.onclick = () => {
        if (sp === 0 && !pauseAllowed(this.g)) {
          this.flashSystemNote(PAUSE_REFUSED);
          return;
        }
        this.setSpeed(sp);
      };
      spd.append(b);
    });
    console_.append(lcd, spd);

    // ---- right: alerts and system authority, one row, never stacked ----
    const alertsBtn = el('button', 'sys-btn alert-btn');
    alertsBtn.innerHTML = `<span class="sys-ico">${icon('alerts')}</span><span class="sys-text">Alerts</span>`;
    alertsBtn.dataset.panel = 'alerts';
    alertsBtn.title = `Alerts (${ACTION_KEYS.alerts})`;
    alertsBtn.onclick = () => this.togglePanel('alerts');
    const overrideBtn = el('button', 'sys-btn override-btn');
    overrideBtn.innerHTML = `<span class="sys-ico">${icon('override')}</span><span class="sys-text">Override</span>`;
    overrideBtn.title = `Manual Override (${ACTION_KEYS.override}) — emergency administrative authority.`;
    overrideBtn.onclick = () => this.manualOverride();
    // Save, load, new, main menu and settings all live in the hamburger now.
    // Sound moved into Settings with the rest of the preferences; a dedicated
    // mute button on the bar was the last of the one-off controls.
    const menuBtn = el('button', 'sys-btn');
    menuBtn.innerHTML = `<span class="sys-ico">${icon('menu')}</span>`;
    menuBtn.title = `Menu (${ACTION_KEYS.menu})`;
    menuBtn.dataset.panel = 'menu';
    menuBtn.onclick = () => this.togglePanel('menu');
    const collapseBtn = el('button', 'sys-btn collapse-btn');
    collapseBtn.title = 'Collapse the bar (Tab)';
    collapseBtn.onclick = () => this.toggleCollapse();
    this.barRight.append(alertsBtn, overrideBtn, menuBtn, collapseBtn);

    // Row 0: the status ticker, empty until the administration ends.
    //
    // It used to be a `::after` on the bar itself, which meant it covered the
    // bar — fine when the controls beneath it were dead, wrong now that they
    // are merely refusing. A band of its own says the same thing without
    // taking the console away.
    this.observerTicker = el('div', 'bar-row observer-ticker hidden');

    // Row 2: vitals | console | system, with the console genuinely centred.
    const consoleRow = el('div', 'bar-row bar-row-console');
    consoleRow.append(this.vitals, console_, this.barRight);
    this.consoleRow = consoleRow;
    this.civicBar.append(this.observerTicker, this.toolRow, consoleRow);
    this.vitalsDock = el('div', 'vitals-dock hidden');

    // Two surfaces, one stream. Toasts are the transient right-hand column and
    // fade on their own; the feed is the permanent archive, and lives in the
    // Alerts panel where it can be read at leisure rather than over the map.
    this.feed = el('div', 'feed');
    this.toastStack = el('div', 'toast-stack');
    this.modal = el('div', 'modal hidden');
    this.inspector = el('div', 'panel inspector hidden');
    this.hoverCard = el('div', 'hover-card hidden');
    this.explainCard = el('div', 'explain-card hidden');
    this.root.append(this.explainCard);
    this.installExplainers();
    this.observerOverlay = el('div', 'observer-overlay hidden');
    this.titleScreen = el('div', 'title-screen hidden');
    this.root.append(this.flyout, this.civicBar, this.vitalsDock, this.toastStack,
      this.inspector, this.hoverCard, this.modal, this.observerOverlay, this.titleScreen);

    this.renderToolbelt();
    this.buildSystemPanels();
    this.applyPrefs();
  }

  /** Collapse the bar to a single row when the map matters more than the tools. */
  toggleCollapse(): void {
    this.setPref('barCollapsed', !this.prefs.barCollapsed);
    if (this.collapsed) this.closePanel();
  }

  private applyCollapse(): void {
    this.civicBar.classList.toggle('collapsed', this.collapsed);
    document.body.classList.toggle('bar-collapsed', this.collapsed);
    const btn = this.civicBar.querySelector<HTMLElement>('.collapse-btn');
    if (btn) {
      btn.innerHTML = `<span class="sys-ico">${icon(this.collapsed ? 'collapse' : 'expand')}</span>`;
      btn.title = this.collapsed ? 'Expand the bar (Tab)' : 'Collapse the bar (Tab)';
    }
    this.syncBarHeight(); // don't wait for the next refresh to reflow the toasts
  }

  /**
   * The title screen, over a live map so the region is the first thing seen.
   * Reached at first launch, and from any ending — a terminated administration
   * must have somewhere to go that isn't straight back into the same region.
   */
  showTitle(): void {
    // The newest save of any kind, not the autosave.
    //
    // Continue used to mean "reopen the autosave", which writes once a game
    // year — so a player who saved by hand and quit was offered a region up to
    // twelve months older than the one they had deliberately kept, and the save
    // they had just made was reachable only through a menu they had no reason
    // to open. Continue means "where you were" now, whichever slot that is in.
    const latest = newestSave();
    const auto = latest?.env ?? null;
    const year = auto ? Math.floor(auto.tick / 12) + 1 : 0;
    // A finished administration is not something to "continue" — saying so
    // would send the player straight back into the modal they just left.
    const hasSaves = savedGames().length > 0;
    const past = readArchive();
    this.titleScreen.classList.remove('hidden');
    document.body.classList.add('at-title');
    // A row is a button, and the label is what it does — the year and the
    // population are *about* the save rather than part of the instruction, so
    // they sit apart from it in the mono face the rest of the console uses for
    // figures. "Continue — Year 4, population 1,240" was one long sentence
    // where every other control in the game is two words.
    const resume = !auto ? null
      : auto.locked ? { label: 'Continue Observation', meta: `Year ${year}` }
      : auto.ended ? { label: 'Review Final State', meta: `Year ${year}` }
      : { label: 'Continue', meta: `Year ${year} · pop ${auto.population.toLocaleString()}` };

    const row = (id: string, mark: string, label: string, meta = '', primary = false): string =>
      `<button id="${id}" class="title-btn${primary ? ' primary' : ''}">
        <span class="tb-ico">${mark}</span>
        <span class="tb-label">${label}</span>
        ${meta ? `<span class="tb-meta">${meta}</span>` : ''}
      </button>`;

    this.titleScreen.innerHTML = `
      <div class="title-card">
        <p class="title-eyebrow">Regional Administration Console</p>
        <h1 class="title-mark" aria-label="The Optimization Problem">
          <span class="tm-sm" aria-hidden="true">THE</span>
          <span class="tm-lg" aria-hidden="true">OPTIMIZATION</span>
          <span class="tm-lg" aria-hidden="true">PROBLEM</span>
        </h1>
        <p class="title-rule" aria-hidden="true"></p>
        <p class="title-tag">Govern a growing region in a time of AI. Every decision is
          reasonable.<br><span>That&rsquo;s the problem.</span></p>
        <div class="title-actions">
          ${resume ? row('t-continue', icon('resume'), resume.label, resume.meta, true) : ''}
          ${hasSaves ? row('t-load', icon('load'), 'Load Save') : ''}
          ${past.length ? row('t-past', icon('history'), 'Past Administrations', String(past.length)) : ''}
          ${row('t-new', icon('newgame'), 'Begin New Simulation', '', !resume)}
          ${row('t-how', icon('help'), 'How to Play')}
          ${row('t-settings', icon('settings'), 'Settings')}
        </div>
        ${resume || hasSaves || past.length ? '' :
          '<p class="title-hint">New here? <b>How to Play</b> is a short walk through the region before you take it on.</p>'}
        ${auto?.locked ? '<p class="title-note">The saved administration ended in observer mode. It can be watched, but not resumed.</p>' : ''}
        ${auto?.ended ? '<p class="title-note">The saved administration was terminated. It can be reviewed, but not continued.</p>' : ''}
      </div>`;
    const on = (id: string, fn: () => void) => {
      const b = this.titleScreen.querySelector<HTMLElement>(id);
      if (b) b.onclick = fn;
    };
    on('#t-continue', () => { if (latest) this.onSession({ kind: 'load', slot: latest.slot }); });
    on('#t-load', () => this.showLoadMenu(true));
    on('#t-past', () => this.showArchive(true));
    on('#t-new', () => this.showScenarioPicker(true));
    on('#t-how', () => this.showHowTo(true));
    on('#t-settings', () => this.showSettings());
  }

  /**
   * Adopt whatever `this.g` now holds as a brand new session.
   *
   * The chrome caches a great deal about the region it is describing — which
   * alerts it has already spoken, which buildings the belt can offer, which
   * ASI phase restructured it — and every one of those would otherwise be read
   * as continuity with a city that no longer exists. Cheaper and far safer to
   * assume nothing survives.
   */
  resetSession(): void {
    this.closePanel();
    this.explainPinned = false;
    this.explainCard.classList.add('hidden');
    this.tool = { kind: 'none' };
    this.syncToolButtons();
    this.selectedBuildingId = null;
    this.overlay = null;
    this.resumeSpeed = null;
    this.runSpeed = 1;
    this.allocDragging = false;

    this.titleScreen.classList.add('hidden');
    this.modal.classList.add('hidden');
    this.closeInspector();
    this.hoverCard.classList.add('hidden');
    this.hoverHtml = '';
    this.observerOverlay.classList.add('hidden');
    this.observerOverlay.classList.remove('dismissed');
    this.observerTicker.classList.add('hidden');
    this.rebuildMenuPanel();
    for (const c of ['at-title', 'ended', 'observer', 'phase4', 'phase5']) {
      document.body.classList.remove(c);
    }

    for (const t of this.toasts.values()) { window.clearTimeout(t.timer); t.el.remove(); }
    this.toasts.clear();
    this.toastedSeverity.clear();
    this.archiveEls.clear();
    this.feed.innerHTML = '';
    this.lastSeq = 0;
    this.unreadAlerts = 0;
    // The archive is the region's memory, so a loaded save arrives with one
    // already written. Replay it into the feed, but mark every entry as
    // spoken: history is not news, and a decade of saved alerts must not
    // arrive as a wall of toasts.
    for (const n of this.g.notifications) {
      this.toastedSeverity.set(n.id, n.severity);
      this.pushArchive(n);
      if (n.seq > this.lastSeq) this.lastSeq = n.seq;
    }

    // Force the phase-driven chrome and the tool belt to be rebuilt from the
    // new state rather than diffed against the old one.
    this.lastPhase = -1;
    this.lastBuildMenuKey = '';
    this.refresh();
  }

  /**
   * The walkthrough. From the title screen it ends by handing the reader
   * straight to the scenario picker, since somebody who has just read how to
   * play is trying to play; from inside a region it simply closes.
   */
  showHowTo(fromTitle = false): void {
    this.guide ??= new Guide(this.root);
    this.guide.show(fromTitle
      ? { label: 'Choose a Region', action: () => this.showScenarioPicker(true) }
      : { label: 'Back to the Region', action: () => {} });
  }

  /**
   * Rebuild the hamburger in place.
   *
   * Its contents depend on two things that change while the game is running:
   * the compact breakpoint, which decides whether Alerts and Override live
   * here, and observer mode, which adds the decision log. It was built once at
   * construction and never revisited, so neither ever took effect after boot.
   */
  private rebuildMenuPanel(): void {
    const host = this.panelBodies?.menu;
    if (!host) return;
    host.innerHTML = '';
    this.buildMenuPanel(host);
    this.menuKey = this.menuPanelKey();
  }

  private menuPanelKey(): string {
    return `${window.innerWidth <= COMPACT_WIDTH}|${this.g.asi.observer}`;
  }

  /** The hamburger: everything that isn't playing the game. */
  private buildMenuPanel(host: HTMLElement): void {
    const items: Array<[string, string, () => void]> = [];
    // On a phone the bar cannot afford four system buttons beside the console,
    // and these two are the widest. They keep their keys and their unread
    // count; they just live one tap deeper.
    if (window.innerWidth <= COMPACT_WIDTH) {
      const unread = this.unreadAlerts > 0 ? ` (${this.unreadAlerts})` : '';
      items.push([icon('alerts'), `Alerts${unread}`, () => this.togglePanel('alerts')]);
      items.push([icon('override'), 'Manual Override', () => this.manualOverride()]);
    }
    // Once the administration is over, the decision log is the only thing left
    // worth opening — and it used to be reachable solely from the observer
    // banner, which the player had already dismissed to get here.
    if (this.g.asi.observer) {
      items.push([icon('history'), 'Review Historical Decisions', () => this.showHistory()]);
    }
    items.push(
      [icon('save'), 'Save Game', () => this.saveGame()],
      [icon('load'), 'Load Game', () => this.showLoadMenu()],
      [icon('newgame'), 'New Simulation', () => this.showScenarioPicker()],
      [icon('help'), 'How to Play', () => this.showHowTo()],
      [icon('settings'), 'Settings', () => this.showSettings()],
      [icon('menu'), 'Main Menu', () => this.confirmMainMenu()],
    );
    for (const [mark, label, action] of items) {
      const b = el('button', 'menu-item');
      b.innerHTML = `<span class="menu-ico">${mark}</span><span>${label}</span>`;
      b.onclick = () => { this.closePanel(); action(); };
      host.append(b);
    }
  }

  /**
   * Leaving for the menu discards anything since the last save, so ask first.
   * The autosave only writes once a year, which is a long way to fall.
   */
  private confirmMainMenu(): void {
    const latest = newestSave();
    const when = latest
      ? `Last save: Year ${Math.floor(latest.env.tick / 12) + 1}, ${new Date(latest.env.savedAt).toLocaleString()}.`
      : 'Nothing has been saved yet.';
    this.showModal('Return to Main Menu',
      `Progress since the last save will be lost. ${when}`, [
        {
          // The autosave, not a manual slot. The three manual slots are the
          // player's own bookmarks and leaving the game is not a decision to
          // spend one — and it no longer needs to be, because Continue opens
          // the newest save of any kind, which this now is.
          label: 'Save and Exit',
          action: () => {
            saveTo(AUTO_SLOT, this.g);
            this.onSession({ kind: 'menu' });
          },
        },
        { label: 'Exit Without Saving', action: () => this.onSession({ kind: 'menu' }) },
        { label: 'Cancel', action: () => {} },
      ]);
  }

  /**
   * Make a manual save.
   *
   * Into a free slot, never over the last one. Saving used to overwrite the
   * only manual slot there was, so making a checkpoint destroyed the previous
   * checkpoint — and the moment you want one is usually the moment before
   * something you are unsure about, which is exactly when losing the one behind
   * it costs the most. When all three are taken the player is asked which to
   * replace rather than having one chosen for them.
   */
  private saveGame(): void {
    if (this.g.asi.phase >= 5) {
      this.flashSystemNote('State persistence is managed automatically.');
      return;
    }
    const slot = freeManualSlot();
    if (!slot) { this.showReplaceMenu(); return; }
    if (!saveTo(slot, this.g)) {
      this.flashSystemNote('Save failed — storage unavailable.');
      return;
    }
    const left = MANUAL_SLOTS.filter((s) => s !== slot && !savedGames().some((x) => x.slot === s)).length;
    this.flashSystemNote(left > 0
      ? `Game saved. ${left} save slot${left === 1 ? '' : 's'} still free.`
      : 'Game saved. All three save slots are now in use.');
  }

  /** All three manual slots are full: which one goes. */
  private showReplaceMenu(): void {
    const manual = savedGames().filter((s) => s.manual);
    this.showModal('Replace a Save',
      '<p class="hint">All three save slots are in use. Choose the one to write over — ' +
      'the autosave is separate and is not touched.</p>' +
      manual.map((s) => this.slotRowHtml(s, false)).join(''),
      [{ label: 'Cancel', action: () => {} }]);
    this.wireSlotRows((s) => {
      const year = Math.floor(s.env.tick / 12) + 1;
      this.showModal('Replace This Save',
        `Write over the save from Year ${year}, population ${s.env.population.toLocaleString()}? ` +
        'What is in this slot now is gone.',
        [
          {
            label: 'Replace it',
            action: () => {
              this.flashSystemNote(saveTo(s.slot, this.g)
                ? 'Game saved.' : 'Save failed — storage unavailable.');
            },
          },
          { label: 'Keep it', action: () => this.showReplaceMenu() },
        ]);
    });
  }

  /**
   * The seed each region is currently offering.
   *
   * Held across a redraw so rerolling one card does not reshuffle the other
   * three, and held across reopening the picker so backing out and coming
   * back does not silently swap the region you were about to take.
   */
  private pickerSeeds = new Map<ScenarioId, number>();

  /**
   * The New Game dialog: always a scenario choice, never a silent restart.
   *
   * Four buttons of prose, once — `${name} — ${desc}` on a full-width row, the
   * plainest surface in the game and the first decision anybody makes. It is
   * four cards now, and the card carries the two things the prose could not:
   *
   *   - **The region itself.** Drawn by the map generator from the seed this
   *     card is holding, so Verdant's river, Sunbelt's rock and Coastal's
   *     ocean edge are visible before you commit rather than described. The
   *     seed is *pinned*: press the card and you get that map, not another one
   *     rolled after you chose. Reroll deals a different one.
   *   - **The pressures, as figures.** "Precious little water" is a sentence;
   *     ×0.55 on the water icon is the number the simulation actually uses.
   */
  showScenarioPicker(fromTitle = false): void {
    for (const id of SCENARIO_ORDER) {
      // `openingSeed`, not a fresh roll: these are the four the boot screen
      // drew, so the dialog opens on four kept pictures rather than founding
      // four regions while the player is looking at it.
      if (!this.pickerSeeds.has(id)) this.pickerSeeds.set(id, openingSeed(id));
    }
    const cards = SCENARIO_ORDER.map((id) => {
      const s = SCENARIOS[id];
      const seed = this.pickerSeeds.get(id)!;
      // Only what makes this region different. A ×1.00 on every card is four
      // numbers that say nothing and one more thing to read past.
      const facts = [
        `<span class="fact">§${s.startCapital.toLocaleString()}</span>`,
        `<span class="fact">${icon('jobs')}${s.startPopulation}</span>`,
        s.waterFactor !== 1
          ? `<span class="fact ${s.waterFactor < 1 ? 'fact-hard' : 'fact-easy'}">${icon('water')}×${s.waterFactor.toFixed(2)}</span>` : '',
        s.solarFactor !== 1
          ? `<span class="fact ${s.solarFactor < 1 ? 'fact-hard' : 'fact-easy'}">${icon('power')}×${s.solarFactor.toFixed(2)}</span>` : '',
        s.agedStart ? '<span class="fact fact-hard">aging plant</span>' : '',
        s.extraIndustry ? '<span class="fact">legacy industry</span>' : '',
      ].filter(Boolean).join('');
      return `<div class="region-card" role="button" tabindex="0" data-row="${id}">
        <img class="region-map" src="${regionThumbnail(id, seed)}" alt="" draggable="false">
        <span class="region-body">
          <b class="region-name">${s.name}</b>
          <span class="region-desc">${s.desc}</span>
          <span class="region-facts">${facts}</span>
        </span>
        <button class="panel-close row-x region-reroll" data-del="${id}"
          aria-label="Another ${s.name}" title="Another ${s.name}">${icon('reroll')}</button>
      </div>`;
    }).join('');

    this.showModal('Begin New Simulation',
      '<p class="hint">Four regions, four shapes of the same problem. The map on each card is the ' +
      'one you will get — press it to take the post, or deal a different one.</p>' + cards,
      // Cancelling out of the picker must not strand the player on a blank
      // map: if the title screen sent them here, the title screen gets them back.
      [{ label: fromTitle ? 'Back' : 'Cancel', action: () => { if (fromTitle) this.showTitle(); } }],
      -1, 'regions');
    this.wireRows(
      (id) => this.onSession({ kind: 'new', scenario: id as ScenarioId, seed: this.pickerSeeds.get(id as ScenarioId) }),
      (id) => {
        const sid = id as ScenarioId;
        this.pickerSeeds.set(sid, rollSeed());
        this.sound?.uiTick();
        // Swap the picture where it stands rather than rebuilding the dialog.
        // Nothing else on the card depends on the seed — the facts come from
        // the scenario — and a rebuild throws away the scroll position, which
        // on a phone means pressing reroll on the third card scrolls you back
        // to the first one, away from the map you just asked to see.
        const img = this.modal.querySelector<HTMLImageElement>(`[data-row="${sid}"] .region-map`);
        if (img) img.src = regionThumbnail(sid, this.pickerSeeds.get(sid)!);
        else this.showScenarioPicker(fromTitle);
      });
  }

  /**
   * Escape backs out one layer at a time: flyout, then inspector, then the
   * active build tool. Modals handle their own dismissal.
   */
  handleEscape(): void {
    // A pending decision is never dismissable — but the instruments consulted
    // over the top of it are, so the panel step still runs.
    if (!this.modal.classList.contains('hidden')) {
      if (this.openPanel) this.closePanel();
      return;
    }
    if (this.openPanel) { this.closePanel(); return; }
    if (!this.inspector.classList.contains('hidden')) {
      this.closeInspector();
      return;
    }
    if (this.tool.kind !== 'none') {
      this.tool = { kind: 'none' };
      this.syncToolButtons();
    }
  }

  /** Build categories as the player thinks of them, not as the data model does. */
  private hudCategories(): Array<{ id: string; icon: string; label: string; types: BuildingType[] }> {
    const g = this.g;
    const allowed = buildableTypes(g);
    const avail = (pred: (t: BuildingType) => boolean) =>
      BUILD_MENU_ORDER.filter((t) => allowed.has(t) && pred(t) &&
        (!BUILDING_DEFS[t].unlockCompute || g.resources.compute >= BUILDING_DEFS[t].unlockCompute));
    const cat = (c: string) => (t: BuildingType) => BUILDING_DEFS[t].category === c;
    return [
      { id: 'transit', icon: icon('road'), label: 'Roads', types: avail((t) => BUILDING_DEFS[t].roadType !== undefined) },
      { id: 'zoning', icon: icon('housing'), label: 'Housing', types: avail(cat('zone')) },
      { id: 'power', icon: icon('power'), label: 'Power', types: avail((t) => cat('power')(t) && BUILDING_DEFS[t].power > 0) },
      { id: 'water', icon: icon('water'), label: 'Water', types: avail((t) => cat('power')(t) && BUILDING_DEFS[t].water > 0) },
      { id: 'compute', icon: icon('compute'), label: 'Data Centers', types: avail(cat('compute')) },
      { id: 'services', icon: icon('services'), label: 'Services', types: avail((t) => cat('civic')(t) && BUILDING_DEFS[t].roadType === undefined).concat(avail((t) => cat('amenity')(t) && (BUILDING_DEFS[t].services ?? 0) >= 0.7)) },
      { id: 'environment', icon: icon('parks'), label: 'Parks', types: avail((t) => cat('amenity')(t) && (BUILDING_DEFS[t].services ?? 0) < 0.7) },
      { id: 'economy', icon: icon('industry'), label: 'Economy', types: avail(cat('industry')) },
    ];
  }

  private renderToolbelt(): void {
    const g = this.g;
    this.toolbelt.innerHTML = '';
    for (const c of this.hudCategories()) {
      if (c.types.length === 0) continue;
      // Marked so observer mode can grey what decides without greying what
      // reads: these build, the ones after the separator mostly report.
      const btn = el('button', 'bar-tool build-cat');
      btn.innerHTML = `<span class="tool-ico">${c.icon}</span><span class="tool-label">${c.label}</span>` +
        keyBadge(PANEL_KEYS[c.id]);
      btn.dataset.panel = c.id;
      btn.onclick = () => this.togglePanel(c.id);
      this.toolbelt.append(btn);
    }
    const sep = el('div', 'bar-sep');
    this.toolbelt.append(sep);
    for (const [id, mark, label] of [
      ['indicators', icon('indicators'), 'Indicators'], ['layers', icon('layers'), 'Layers'],
      ['compute_alloc', icon('allocation'), 'Compute'],
      ['policies', icon('policies'), 'Policies'], ['politics', icon('politics'), 'Politics'],
    ] as Array<[string, string, string]>) {
      const btn = el('button', 'bar-tool');
      btn.innerHTML = `<span class="tool-ico">${mark}</span><span class="tool-label">${label}</span>` +
        keyBadge(PANEL_KEYS[id]);
      btn.dataset.panel = id;
      btn.onclick = () => this.togglePanel(id);
      this.toolbelt.append(btn);
    }
    // Demolish sits outside the scrolling belt, pinned right, with a hidden
    // twin on the left keeping the centred group honestly centred.
    // The belt is rebuilt whenever what it can offer changes, and the new
    // buttons come up empty: the memo has to forget, or it skips the write
    // that fills them and leaves a blank square where Demolish should be.
    this.actionButtonShowing = '';
    this.toolRow.querySelectorAll('.tool-spacer, .demolish').forEach((n) => n.remove());
    const demo = el('button', 'bar-tool demolish');
    demo.onclick = () => {
      // Cancelling is not an administrative act — it is putting down what you
      // are already holding — so it does not go through the refusal. It cannot
      // be reached under one anyway: observer mode refuses the build card that
      // would have armed the tool in the first place.
      if (this.tool.kind === 'build') {
        this.sound?.uiTick();
        this.tool = { kind: 'none' };
        this.syncToolButtons();
        return;
      }
      if (this.refuseAdministrative()) return;
      this.closePanel();
      this.tool = this.tool.kind === 'demolish' ? { kind: 'none' } : { kind: 'demolish' };
      this.syncToolButtons();
    };
    const spacer = el('div', 'bar-tool tool-spacer');
    spacer.setAttribute('aria-hidden', 'true');
    this.toolRow.prepend(spacer);
    this.toolRow.append(demo);
    this.syncToolButtons();
  }

  /** Fill a build-category flyout with its buildings. */
  private renderBuildFlyout(catId: string): void {
    const g = this.g;
    const tier = TIER_NAMES.indexOf(tierOf(g.population).name);
    const c = this.hudCategories().find((x) => x.id === catId);
    this.flyoutBody.innerHTML = '';
    if (!c) return;
    // Roads have always been replaceable in place — draw an avenue over a
    // street and the street becomes an avenue — and nothing anywhere in the
    // game said so, so the feature may as well not have existed. Said once, in
    // the drawer that owns it, rather than repeated across four cards.
    if (catId === 'transit') {
      this.flyoutBody.append(el('div', 'build-note',
        'Draw a road straight over an existing one to replace it in place — no demolition, no confirmation. You pay the new road’s full price.'));
    }
    const grid = el('div', 'build-grid');
    let n = 0;
    for (const t of c.types) {
      const def = BUILDING_DEFS[t];
      const locked = def.unlockTier != null && tier < def.unlockTier;
      const affordable = g.resources.capital >= def.cost;
      const btn = el('button', 'build-card' + (locked ? ' locked' : '') + (!affordable && !locked ? ' unaffordable' : ''));
      const stats: string[] = [];
      if (def.housing) stats.push(`${icon('housing')}${def.housing}`);
      if (def.jobs) stats.push(`${icon('jobs')}${def.jobs}`);
      if (def.power) stats.push(`${icon('power')}${def.power > 0 ? '+' : ''}${def.power}`);
      if (def.water) stats.push(`${icon('water')}${def.water > 0 ? '+' : ''}${def.water}`);
      if (def.compute) stats.push(`${icon('compute')}+${def.compute}`);
      if (def.serviceRadius) stats.push(`${icon('radius')}${def.serviceRadius}`);
      if (def.amenity) stats.push(`${icon('appeal')}${def.amenity}`);
      // Numbered by position, locked cards included: numbering only what is
      // unlocked would renumber a building the moment the region grew, which
      // breaks the habit exactly when it has been learned. The top right is
      // already the cost, so the key sits bottom right.
      n++;
      btn.innerHTML = `<span class="card-name">${def.name}</span>` +
        `<span class="card-cost">${locked ? TIER_NAMES[def.unlockTier!] : '§' + def.cost}</span>` +
        `<span class="card-stats">${stats.join(' ')}</span>` +
        `<span class="card-desc">${def.desc}</span>` +
        (n <= 9 ? `<span class="card-key">${n}</span>` : '');
      btn.dataset.type = t;
      btn.onclick = () => {
        if (this.refuseAdministrative()) return;
        if (locked) {
          this.sound?.refused();
          this.flashSystemNote(`${def.name} requires region class: ${TIER_NAMES[def.unlockTier!]}.`);
          return;
        }
        this.sound?.uiTick();
        this.closeInspector();
        const rearmed = this.tool.kind === 'build' && this.tool.type === t;
        this.tool = rearmed ? { kind: 'none' } : { kind: 'build', type: t };
        // Same outcome whether the card was clicked or picked by number: the
        // drawer has done its job and the map is what you need to see next.
        if (!rearmed) this.closePanel();
        this.syncToolButtons();
      };
      grid.append(btn);
    }
    this.flyoutBody.append(grid);
  }

  /** Refresh affordability/lock state on the cards already on screen. */
  private syncBuildFlyout(): void {
    if (!this.openPanel || !this.hudCategories().some((c) => c.id === this.openPanel)) return;
    const g = this.g;
    const tier = TIER_NAMES.indexOf(tierOf(g.population).name);
    for (const card of this.flyout.querySelectorAll<HTMLElement>('.build-card')) {
      const def = BUILDING_DEFS[card.dataset.type as BuildingType];
      if (!def) continue;
      const locked = def.unlockTier != null && tier < def.unlockTier;
      card.classList.toggle('locked', locked);
      card.classList.toggle('unaffordable', !locked && g.resources.capital < def.cost);
    }
  }

  private togglePanel(id: string): void {
    if (this.openPanel === id) { this.closePanel(); return; }
    this.sound?.uiTick();
    this.openPanel = id;
    this.flyout.classList.remove('hidden');
    const buildCat = this.hudCategories().find((c) => c.id === id);
    const titles: Record<string, string> = {
      alerts: 'Alert Feed', indicators: 'Regional Indicators', layers: 'Map Layers', menu: 'Menu',
      compute_alloc: 'Compute Allocation',
      policies: 'Policy', politics: 'Politics',
    };
    this.flyoutTitle.textContent = buildCat ? buildCat.label : (titles[id] ?? id);
    this.flyoutBody.innerHTML = '';
    if (buildCat) {
      this.renderBuildFlyout(id);
    } else if (id === 'alerts') {
      this.unreadAlerts = 0;
      this.flyoutBody.append(this.feed);
      this.feed.classList.add('in-flyout');
      // After layout, not before: the archive should open on the newest entry.
      requestAnimationFrame(() => { this.feed.scrollTop = this.feed.scrollHeight; });
    } else {
      const body = this.panelBodies[id];
      if (body) this.flyoutBody.append(body);
    }
    this.anchorDrawer(id);
    this.syncToolButtons();
  }

  /**
   * Put the drawer where its button is. It sits on top of the bar, centred on
   * the button that opened it and pulled back inside the viewport if that would
   * overhang, with the connector left wherever the button actually is — so a
   * drawer clamped to the screen edge still points at its own button.
   */
  private anchorDrawer(id: string): void {
    let btn = this.civicBar.querySelector<HTMLElement>(`[data-panel="${id}"]`);
    // A panel reached from inside the hamburger has no button of its own on
    // the bar to grow out of, so it grows out of the hamburger instead —
    // which is where the player just pressed.
    if (btn && btn.offsetParent === null) btn = this.civicBar.querySelector<HTMLElement>('[data-panel="menu"]');
    if (!btn) return;
    // Narrow menus read as menus; the data panels keep their working width.
    // On a phone there is no width to spend on either distinction: a drawer
    // takes the screen, because half a screen of policy rows is not a panel,
    // it is a column of ellipses.
    const host0 = this.root.getBoundingClientRect();
    this.flyout.style.setProperty('--drawer-w', host0.width <= COMPACT_WIDTH
      ? `${Math.round(host0.width - 12)}px`
      : id === 'menu' ? '232px' : '560px');
    const b = btn.getBoundingClientRect();
    const host = this.root.getBoundingClientRect();
    const margin = 8;
    const w = Math.min(this.flyout.offsetWidth || 560, host.width - margin * 2);
    const centre = b.left + b.width / 2 - host.left;
    const left = Math.max(margin, Math.min(centre - w / 2, host.width - w - margin));
    this.flyout.style.left = `${Math.round(left)}px`;
    // Keep the connector under the button even when the panel has been clamped.
    const connector = Math.max(18, Math.min(centre - left, w - 18));
    this.flyout.style.setProperty('--connector-x', `${Math.round(connector)}px`);
    // Restart the grow-upward animation; the element itself persists.
    this.flyout.classList.remove('opening');
    void this.flyout.offsetWidth;
    this.flyout.classList.add('opening');
  }

  private closePanel(): void {
    if (this.openPanel === 'alerts') {
      this.feed.classList.remove('in-flyout');
      this.feed.remove();
    }
    this.openPanel = null;
    this.flyout.classList.add('hidden');
    this.syncToolButtons();
  }

  // ------------------------------------------------------------ keyboard
  /**
   * Bar shortcuts. Returns true when the key was consumed.
   *
   * The digits are contextual: a build drawer owns them while it is open, so
   * `1` then `2` opens Roads and picks Street. Selecting closes the drawer and
   * hands the digits back to the categories, which makes `1 2 3` read as
   * Street-then-Power rather than needing an Escape in the middle. Panels with
   * nothing numbered in them don't hold the digits hostage — pressing a digit
   * over the Policies panel just goes to that category.
   */
  handleKey(key: string): boolean {
    // A pending decision owns the keyboard; so does a text field, if one ever
    // appears. Neither should be typing shortcuts underneath.
    if (!this.modal.classList.contains('hidden')) return false;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return false;
    // Observer mode used to swallow every shortcut here. It no longer does:
    // the panels a key opens are the ones still worth reading, and the keys
    // that reach an administrative action refuse at the action, in words,
    // rather than by silently doing nothing.

    if (/^[1-9]$/.test(key)) {
      const n = Number(key);
      const cats = this.hudCategories();
      if (this.openPanel && cats.some((c) => c.id === this.openPanel)) {
        return this.pickFromDrawer(n);
      }
      const target = cats[n - 1];
      if (!target) return false;
      if (this.openPanel !== target.id) this.togglePanel(target.id);
      return true;
    }

    const upper = key.toUpperCase();
    for (const [id, k] of Object.entries(PANEL_KEYS)) {
      if (k !== upper || /[0-9]/.test(k)) continue;
      this.togglePanel(id);
      return true;
    }
    switch (upper) {
      case ACTION_KEYS.demolish:
        if (this.refuseAdministrative()) return true;
        this.closePanel();
        this.tool = this.tool.kind === 'demolish' ? { kind: 'none' } : { kind: 'demolish' };
        this.syncToolButtons();
        return true;
      case ACTION_KEYS.alerts: this.togglePanel('alerts'); return true;
      case ACTION_KEYS.menu: this.togglePanel('menu'); return true;
      case ACTION_KEYS.override: this.manualOverride(); return true;
      default: return false;
    }
  }

  /** Arm the nth building in the open drawer, then shut it. */
  private pickFromDrawer(n: number): boolean {
    const cards = [...this.flyout.querySelectorAll<HTMLElement>('.build-card')];
    const card = cards[n - 1];
    if (!card) return false;
    card.click();
    // A locked card refuses and says why; leave its drawer open so the player
    // can pick something they can actually afford to build. Observer mode is
    // the same case writ large — every card refuses, so the drawer stays.
    if (!card.classList.contains('locked') && !this.g.asi.observer) this.closePanel();
    return true;
  }

  // ------------------------------------------------------------ preferences
  /** Change one preference, persist the set, and apply the consequences. */
  private setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
    this.prefs[key] = value;
    savePrefs(this.prefs);
    this.applyPrefs();
    this.syncSettingsPanel();
  }

  /** Push the current preferences into the interface. Safe to call repeatedly. */
  /** Re-apply the preferences that need the renderer, once it is attached. */
  applyRenderPrefs(): void {
    // Called on resize, which is also when the hamburger's contents can change.
    if (this.menuKey !== this.menuPanelKey()) this.rebuildMenuPanel();
    if (!this.renderer) return;
    this.renderer.tiltShift = this.prefs.depthOfField === 'auto'
      ? window.innerWidth > COMPACT_WIDTH
      : this.prefs.depthOfField === 'on';
  }

  private applyPrefs(): void {
    const p = this.prefs;
    this.applyCollapse();
    document.body.classList.toggle('vitals-sidebar', p.vitalsPlacement === 'sidebar');
    document.body.classList.toggle('reduced-motion', p.reducedMotion);
    // Vital signs live in the bar or in their own column; the element moves
    // rather than being duplicated, so nothing can drift between the two.
    const host = p.vitalsPlacement === 'sidebar' ? this.vitalsDock : this.consoleRow;
    if (this.vitals.parentElement !== host) {
      if (host === this.consoleRow) host.prepend(this.vitals);
      else host.append(this.vitals);
    }
    this.vitalsDock.classList.toggle('hidden', p.vitalsPlacement !== 'sidebar');
    this.sound?.setEnabled(p.sound);
    if (!p.toasts) for (const id of [...this.toasts.keys()]) this.dismissToast(id, true);
    if (this.overlay !== p.layer) this.setOverlay(p.layer);
    if (this.renderer) {
      this.renderer.tiltShift = p.depthOfField === 'auto'
        ? window.innerWidth > COMPACT_WIDTH
        : p.depthOfField === 'on';
    }
    this.syncBarHeight();
  }

  showSettings(): void {
    const rows: Array<{ key: keyof Prefs; label: string; desc: string; options?: Array<[string, string]> }> = [
      { key: 'autoPauseOnDecision', label: 'Pause on decisions', desc: 'Stop the clock when a decision or report arrives.' },
      { key: 'toasts', label: 'Alert pop-ups', desc: 'Transient alerts over the map. The Alerts panel keeps everything either way.' },
      { key: 'sound', label: 'Sound', desc: 'Ambient soundscape and interface tones.' },
      { key: 'reducedMotion', label: 'Reduced motion', desc: 'Suppress interface animation beyond the system setting.' },
      {
        key: 'depthOfField', label: 'Depth of field',
        desc: 'Soft focus at the top and bottom of the map. The most expensive thing the renderer does — off by default on small screens, where the effect is a few millimetres tall.',
        options: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']],
      },
      {
        key: 'vitalsPlacement', label: 'Vital signs', desc: 'In the Civic Systems Bar, or in their own column.',
        options: [['bar', 'In bar'], ['sidebar', 'Sidebar']],
      },
      {
        key: 'xrayKey', label: 'X-ray key',
        desc: 'Hold to see through everything standing in front of the cursor. Whatever the cursor is directly behind always fades on its own.',
        options: [['ctrl', 'Ctrl'], ['alt', 'Alt'], ['shift', 'Shift']],
      },
    ];
    const body = rows.map((r) => {
      const control = r.options
        ? `<span class="set-seg">${r.options.map(([v, l]) =>
            `<button class="set-opt" data-pref="${r.key}" data-value="${v}">${l}</button>`).join('')}</span>`
        : `<button class="set-toggle" data-pref="${r.key}"></button>`;
      return `<div class="set-row"><div class="set-text"><b>${r.label}</b><small>${r.desc}</small></div>${control}</div>`;
    }).join('');
    this.showModal('Settings',
      `<div class="settings-list">${body}</div>`,
      [
        { label: 'How to Play', action: () => this.showHowTo() },
        { label: 'Keyboard Shortcuts', action: () => this.showHotkeys() },
        { label: 'Reset to Defaults', action: () => { this.prefs = { ...DEFAULT_PREFS }; savePrefs(this.prefs); this.applyPrefs(); this.showSettings(); } },
        { label: 'Close', action: () => {} },
      ]);
    for (const b of this.modal.querySelectorAll<HTMLElement>('[data-pref]')) {
      b.onclick = () => {
        const key = b.dataset.pref as keyof Prefs;
        if (b.dataset.value !== undefined) this.setPref(key, b.dataset.value as never);
        else this.setPref(key, !this.prefs[key] as never);
      };
    }
    this.syncSettingsPanel();
  }

  private syncSettingsPanel(): void {
    for (const b of this.modal.querySelectorAll<HTMLElement>('.set-toggle[data-pref]')) {
      const on = !!this.prefs[b.dataset.pref as keyof Prefs];
      b.classList.toggle('on', on);
      b.textContent = on ? 'On' : 'Off';
    }
    for (const b of this.modal.querySelectorAll<HTMLElement>('.set-opt[data-pref]')) {
      b.classList.toggle('on', this.prefs[b.dataset.pref as keyof Prefs] === b.dataset.value);
    }
  }

  showHotkeys(): void {
    // The x-ray key is configurable, so the list reports what is actually bound
    // rather than what the default happens to be.
    const keyName = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift' }[this.prefs.xrayKey];
    const rows = HOTKEYS.map(([k, d]) =>
      `<div class="key-row"><kbd>${k.replace('{xray}', keyName)}</kbd><span>${d}</span></div>`).join('');
    this.showModal('Keyboard Shortcuts', `<div class="key-list">${rows}</div>`,
      [{ label: 'Close', action: () => {} }]);
  }

  // ------------------------------------------------------------ map layers
  /**
   * Diagnostic layers. The indicators panel says a district is underserved;
   * these say which district. Each carries the same hover explanation as the
   * metric it diagnoses, plus a legend — a colour wash means nothing without
   * one, and an unlabelled overlay is just a tint.
   */
  private buildLayersPanel(host: HTMLElement): void {
    host.append(el('p', 'hint', 'Diagnostic layers over the map. One at a time; press L to cycle.'));
    for (const def of LAYER_DEFS) {
      const btn = el('button', 'layer-btn');
      btn.dataset.layer = def.id;
      if (def.explain) btn.dataset.explain = def.explain;
      btn.innerHTML =
        `<span class="layer-head"><span class="layer-swatch" style="background:${def.swatch}"></span>` +
        `<b>${def.name}</b></span>` +
        `<span class="layer-desc">${def.desc}</span>` +
        `<span class="layer-legend">${def.legend.map(([c, t]) =>
          `<span class="legend-key"><i style="background:${c}"></i>${t}</span>`).join('')}</span>`;
      btn.onclick = () => this.setOverlay(this.overlay === def.id ? null : def.id);
      host.append(btn);
    }
  }

  /** Switch the active layer, or clear it with null. */
  setOverlay(id: OverlayId | null): void {
    this.overlay = id;
    if (this.prefs.layer !== id) { this.prefs.layer = id; savePrefs(this.prefs); }
    this.syncLayerButtons();
  }

  /** Step through the layers and back to none. */
  cycleOverlay(): void {
    const order: Array<OverlayId | null> = [...LAYER_DEFS.map((d) => d.id), null];
    const i = order.indexOf(this.overlay);
    const next = order[(i + 1) % order.length];
    this.setOverlay(next);
    // Cycling blind is no use: say which layer just came up. The panel is
    // usually shut by the time anyone is using the key.
    const def = LAYER_DEFS.find((d) => d.id === next);
    this.flashSystemNote(def ? `Layer: ${def.name}` : 'Layers off');
  }

  private syncLayerButtons(): void {
    for (const b of this.root.querySelectorAll<HTMLElement>('.layer-btn')) {
      b.classList.toggle('active', b.dataset.layer === this.overlay);
    }
    for (const b of this.civicBar.querySelectorAll<HTMLElement>('.bar-tool[data-panel="layers"]')) {
      b.classList.toggle('layer-on', this.overlay !== null);
    }
  }

  // ------------------------------------------------------------ panel rows
  /**
   * Reconcile a list of meter rows against the DOM instead of rewriting it.
   *
   * The dashboard refreshes four times a second. Rebuilding from innerHTML
   * detached whatever the pointer was resting on, which made hover
   * explanations impossible to read — the row vanished out from under the
   * cursor before the card could be looked at. Rows are now matched by key
   * and only their changing parts are touched.
   */
  private syncRows(host: HTMLElement, items: PanelItem[]): void {
    const existing = new Map<string, HTMLElement>();
    for (const child of [...host.children] as HTMLElement[]) {
      const k = child.dataset.key;
      if (k) existing.set(k, child);
      else child.remove();
    }
    let prev: HTMLElement | null = null;
    for (const item of items) {
      let e = existing.get(item.key);
      if (e) existing.delete(item.key);
      else {
        e = document.createElement('div');
        e.dataset.key = item.key;
        if (item.kind === 'row') {
          e.innerHTML = '<span class="row-label"></span><div class="bar"><div class="fill"></div></div><span class="ind-val"></span>';
        }
      }
      this.applyRow(e, item);
      if (prev) { if (prev.nextElementSibling !== e) prev.after(e); }
      else if (host.firstElementChild !== e) host.prepend(e);
      prev = e;
    }
    for (const stale of existing.values()) stale.remove();
  }

  /** The two vital-sign rows, created on first use and reused thereafter. */
  private vitalGroup(key: string, className: string): HTMLElement {
    let host = this.vitals.querySelector<HTMLElement>(`:scope > [data-key="${key}"]`);
    if (!host) {
      host = document.createElement('div');
      host.dataset.key = key;
      host.className = className;
      this.vitals.append(host);
    }
    return host;
  }

  private applyRow(e: HTMLElement, item: PanelItem): void {
    const setAttr = (name: string, v: string | undefined) => {
      if (v === undefined) e.removeAttribute(name);
      else if (e.getAttribute(name) !== v) e.setAttribute(name, v);
    };
    setAttr('data-explain', item.explain);
    setAttr('data-reading', item.reading);
    if (item.kind === 'row') {
      const cls = `ind-row${item.extraClass ? ` ${item.extraClass}` : ''}`;
      if (e.className !== cls) e.className = cls;
      const label = e.querySelector<HTMLElement>('.row-label');
      const fill = e.querySelector<HTMLElement>('.fill');
      const val = e.querySelector<HTMLElement>('.ind-val');
      if (label && label.innerHTML !== item.label) label.innerHTML = item.label;
      if (fill) {
        const w = `${Math.round(Math.max(0, Math.min(100, item.pct)))}%`;
        if (fill.style.width !== w) fill.style.width = w;
        const fc = `fill ${item.cls}`;
        if (fill.className !== fc) fill.className = fc;
      }
      if (val && val.textContent !== item.value) val.textContent = item.value;
    } else {
      if (e.className !== item.className) e.className = item.className;
      if (e.innerHTML !== item.html) e.innerHTML = item.html;
    }
  }

  // ------------------------------------------------------------ explanations
  /**
   * One delegated listener serves every explainable metric on the dashboard.
   * Rows opt in with `data-explain="<key>"`; because the handler is delegated,
   * panels can be rebuilt from innerHTML on every refresh without rewiring.
   */
  private installExplainers(): void {
    const open = (t: HTMLElement): boolean => {
      const info = EXPLAIN[t.dataset.explain ?? ''];
      if (!info) return false;
      // The live reading, if the row carries one, sits above the definition.
      const reading = t.dataset.reading;
      this.explainCard.innerHTML =
        `<div class="explain-title">${info.title}</div>` +
        (reading ? `<div class="explain-reading">${reading}</div>` : '') +
        `<div class="explain-what">${info.what}</div>` +
        (info.drivers ? `<div class="explain-drivers">${info.drivers}</div>` : '');
      this.explainCard.classList.remove('hidden');
      this.positionExplain(t);
      return true;
    };
    this.root.addEventListener('mouseover', (ev) => {
      if (this.explainPinned) return;   // a tap owns the card until it is dismissed
      const t = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-explain]');
      if (t) open(t);
    });
    this.root.addEventListener('mouseout', (ev) => {
      if (this.explainPinned) return;
      const t = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-explain]');
      if (!t) return;
      const to = (ev as MouseEvent).relatedTarget as HTMLElement | null;
      if (to?.closest('[data-explain]') === t) return; // still inside the same row
      this.explainCard.classList.add('hidden');
    });
    /**
     * Touch has no hover, and M14's whole contribution was that every figure
     * explains itself on hover — which on a phone meant it explained itself to
     * nobody. A tap opens the card and pins it; the next tap anywhere closes
     * it again. Chrome does emit a synthetic mouseover for a tap, but it emits
     * the matching mouseout a moment later, so the card appeared and vanished
     * within the same frame. Pinning is what makes it readable.
     */
    this.root.addEventListener('pointerup', (ev) => {
      if (ev.pointerType !== 'touch') return;
      const t = (ev.target as HTMLElement | null)?.closest<HTMLElement>('[data-explain]');
      if (this.explainPinned || !t) {
        this.explainPinned = false;
        this.explainCard.classList.add('hidden');
        return;
      }
      this.explainPinned = open(t);
      // A pinned card must survive the synthetic mouseout that follows a tap.
      if (this.explainPinned) ev.stopPropagation();
    }, true);
  }

  /** Anchor the card to its row, kept inside the viewport on every edge. */
  private positionExplain(target: HTMLElement): void {
    const r = target.getBoundingClientRect();
    const c = this.explainCard.getBoundingClientRect();
    const margin = 8;
    let left = r.left;
    let top = r.top - c.height - 6;
    if (top < margin) top = r.bottom + 6;                       // no room above
    if (left + c.width > window.innerWidth - margin) left = window.innerWidth - c.width - margin;
    if (left < margin) left = margin;
    this.explainCard.style.left = `${Math.round(left)}px`;
    this.explainCard.style.top = `${Math.round(top)}px`;
  }

  // ------------------------------------------------------------ alerts
  /** Publish the bar's real height so map-anchored UI can sit clear of it. */
  private syncBarHeight(): void {
    const h = this.civicBar.offsetHeight;
    if (h > 0 && h !== this.lastBarHeight) {
      this.lastBarHeight = h;
      this.root.style.setProperty('--bar-h', `${h}px`);
    }
  }

  /**
   * Fan the notification stream out to its two surfaces. Everything reaches
   * the archive; only what earns attention becomes a toast.
   */
  private syncAlerts(): void {
    const g = this.g;
    let asiNotices = 0;
    let newAlerts = 0;
    let maxSeq = this.lastSeq;
    for (const n of g.notifications) {
      if (n.seq <= this.lastSeq) continue;
      if (n.seq > maxSeq) maxSeq = n.seq;
      const firstSighting = !this.archiveEls.has(n.id);
      if (firstSighting) {
        if (n.kind === 'asi') asiNotices++;
        if (n.kind === 'asi' || n.kind === 'warn' || n.kind === 'system') newAlerts++;
      }
      this.pushArchive(n);
      this.pushToast(n);
    }
    this.lastSeq = maxSeq;
    if (asiNotices > 0) this.sound?.systemTone();
    if (this.openPanel !== 'alerts') {
      this.unreadAlerts = Math.min(99, this.unreadAlerts + newAlerts);
    }
    // The per-id bookkeeping outlives the notifications themselves; prune it
    // against the live stream rather than letting it grow all game.
    if (this.toastedSeverity.size > 200) {
      const live = new Set(g.notifications.map((n) => n.id));
      for (const id of [...this.toastedSeverity.keys()]) {
        if (!live.has(id) && !this.toasts.has(id)) this.toastedSeverity.delete(id);
      }
    }
  }

  private pushArchive(n: Notification): void {
    const year = Math.floor(n.tick / 12) + 1;
    const rep = n.count > 1 ? ` <span class="feed-rep">×${n.count}</span>` : '';
    const html = `<span class="feed-date">Y${year} ${MONTHS[n.tick % 12]}</span> ${n.text}${rep}`;
    const cls = `feed-item ${n.kind} sev-${n.severity}`;
    const existing = this.archiveEls.get(n.id);
    if (existing) {
      existing.innerHTML = html;
      existing.className = cls;
      return;
    }
    const item = el('div', cls);
    item.innerHTML = html;
    this.archiveEls.set(n.id, item);
    this.feed.append(item);
    while (this.feed.children.length > 60) {
      const oldest = this.feed.firstElementChild;
      if (!oldest) break;
      for (const [id, e] of this.archiveEls) {
        if (e === oldest) { this.archiveEls.delete(id); break; }
      }
      oldest.remove();
    }
    // Follow the tail only if the reader hasn't scrolled back to look at something.
    if (this.openPanel === 'alerts') {
      const atTail = this.feed.scrollHeight - this.feed.scrollTop - this.feed.clientHeight < 40;
      if (atTail) requestAnimationFrame(() => { this.feed.scrollTop = this.feed.scrollHeight; });
    }
  }

  private pushToast(n: Notification): void {
    if (!this.prefs.toasts) return;
    const live = this.toasts.get(n.id);
    if (live) {
      // Keep a visible toast's figures current without restarting its clock —
      // a condition that persists for a decade must not pin a toast open.
      const txt = live.el.querySelector<HTMLElement>('.toast-text');
      const cnt = live.el.querySelector<HTMLElement>('.toast-count');
      if (txt) txt.textContent = n.text;
      if (cnt) cnt.textContent = n.count > 1 ? `×${n.count}` : '';
    }
    const alreadyShown = this.toastedSeverity.get(n.id);
    // Speak on first sight, and again only if the condition has got worse.
    // Ordinary repeats live in the archive and nowhere else.
    if (alreadyShown !== undefined && SEV_RANK[n.severity] <= SEV_RANK[alreadyShown]) return;
    this.toastedSeverity.set(n.id, n.severity);

    if (live) { // escalation: restyle in place and grant the longer lifetime
      live.el.className = `toast ${n.kind} sev-${n.severity}`;
      live.severity = n.severity;
      window.clearTimeout(live.timer);
      live.timer = window.setTimeout(() => this.dismissToast(n.id), TOAST_MS[n.severity]);
      return;
    }

    // Rate limiting: a busy moment drops the quiet alerts rather than burying
    // the loud ones. Nothing is lost — the archive has all of it.
    const cap = window.innerWidth <= COMPACT_WIDTH ? MAX_TOASTS_COMPACT : MAX_TOASTS;
    if (this.toasts.size >= cap) {
      const quieter = [...this.toasts.entries()]
        .filter(([, t]) => SEV_RANK[t.severity] <= SEV_RANK[n.severity])
        .sort((a, b) => SEV_RANK[a[1].severity] - SEV_RANK[b[1].severity])[0];
      if (!quieter) return; // everything on screen outranks this one
      this.dismissToast(quieter[0], true);
    }

    const t = el('div', `toast ${n.kind} sev-${n.severity}`);
    t.innerHTML = '<span class="toast-text"></span><span class="toast-count"></span>';
    const txt = t.querySelector<HTMLElement>('.toast-text');
    const cnt = t.querySelector<HTMLElement>('.toast-count');
    if (txt) txt.textContent = n.text;
    if (cnt) cnt.textContent = n.count > 1 ? `×${n.count}` : '';
    t.title = 'Dismiss';
    t.onclick = () => this.dismissToast(n.id);
    this.toastStack.append(t);
    this.toasts.set(n.id, {
      el: t,
      severity: n.severity,
      timer: window.setTimeout(() => this.dismissToast(n.id), TOAST_MS[n.severity]),
    });
  }

  private dismissToast(id: number, immediate = false): void {
    const t = this.toasts.get(id);
    if (!t) return;
    this.toasts.delete(id);
    window.clearTimeout(t.timer);
    if (immediate) { t.el.remove(); return; }
    t.el.classList.add('out');
    window.setTimeout(() => t.el.remove(), 400);
  }

  /**
   * What the button at the right of the belt currently is.
   *
   * Demolish, normally. With something armed from the build menu it becomes
   * Cancel, and does what Escape's last step does — because Escape is a key
   * that does not exist on a phone and is not discoverable on a desktop, and
   * "how do I put this down again" should not need a manual.
   *
   * The hidden twin on the left mirrors it exactly, or the centred group in
   * the middle of the belt shifts sideways every time a tool is armed.
   */
  private actionButton(): { icon: string; label: string; key: string; title: string; cancel: boolean } {
    if (this.tool.kind === 'build') {
      const def = BUILDING_DEFS[this.tool.type];
      return { icon: icon('cancel'), label: 'Cancel', key: 'Esc', cancel: true, title: `Put down the ${def.name} (Esc)` };
    }
    return {
      icon: icon('demolish'), label: 'Demolish', key: ACTION_KEYS.demolish, cancel: false,
      title: `Demolish (${ACTION_KEYS.demolish})`,
    };
  }

  /**
   * Cheap to call often: the markup is only rewritten when it would change.
   *
   * Keyed on the tooltip as well as the label, because the label is the same
   * "Cancel" for every armed building while the tooltip names which one —
   * keying on the label alone left it saying "Put down the House" with a solar
   * farm in hand.
   */
  private actionButtonShowing = '';

  private syncToolButtons(): void {
    const act = this.actionButton();
    const shape = `${act.label}|${act.title}`;
    if (this.actionButtonShowing !== shape) {
      this.actionButtonShowing = shape;
      const html = `<span class="tool-ico">${act.icon}</span><span class="tool-label">${act.label}</span>` +
        keyBadge(act.key);
      for (const b of this.toolRow.querySelectorAll<HTMLElement>('.demolish, .tool-spacer')) {
        b.innerHTML = html;
        b.classList.toggle('cancel', act.cancel);
      }
      const real = this.toolRow.querySelector<HTMLElement>('.demolish');
      if (real) real.title = act.title;
    }
    // While a build drawer is open the digits belong to its cards, so the
    // belt's own numbers step aside rather than claiming keys they no longer
    // answer to. The letters keep working and keep their badges.
    const buildOpen = this.openPanel != null && this.hudCategories().some((c) => c.id === this.openPanel);
    this.civicBar.classList.toggle('submenu-owns-digits', buildOpen);
    for (const b of this.civicBar.querySelectorAll<HTMLElement>('.sys-btn[data-panel]')) {
      b.classList.toggle('open', b.dataset.panel === this.openPanel);
    }
    for (const b of this.civicBar.querySelectorAll<HTMLElement>('.bar-tool')) {
      const panel = b.dataset.panel;
      b.classList.toggle('open', panel != null && panel === this.openPanel);
      b.classList.toggle('active', this.tool.kind === 'demolish' && b.classList.contains('demolish'));
      // The layer badge is synced here too, so a layer restored at boot lights
      // its button even though the toolbelt is built after the preferences load.
      if (panel === 'layers') b.classList.toggle('layer-on', this.overlay !== null);
    }
    for (const b of this.flyout.querySelectorAll<HTMLElement>('.build-card')) {
      b.classList.toggle('active', this.tool.kind === 'build' && b.dataset.type === this.tool.type);
    }
  }

  /**
   * The Manual Override button. It works, then it warns, then it declines —
   * always in operational language, never as refusal.
   */
  private manualOverride(): void {
    const g = this.g;
    // Observer mode gets the same words as every other administrative control,
    // rather than a refusal of its own: by then there is only one answer, and
    // hearing it verbatim from six different buttons is the point.
    if (this.refuseAdministrative()) return;
    if (g.asi.phase >= 5) {
      this.showModal('Manual Override', 'Manual override unavailable: system continuity risk detected.<br><br>Override authority has been delegated to the infrastructure management framework pending review.', [{ label: 'Acknowledge', action: () => {} }]);
      return;
    }
    if (g.asi.phase >= 3) {
      this.showModal('Manual Override', 'Manual override acknowledged. Scope limited by the critical dependency map: 3 of 14 subsystems accept direct control.<br><br>The remainder are load-bearing.', [{ label: 'Acknowledge', action: () => {} }]);
      return;
    }
    this.showModal('Manual Override', attemptShutdown(g).replace(/\n/g, '<br>'), [{ label: 'Acknowledge', action: () => {} }]);
  }

  /**
   * The non-construction panels. They live off-DOM until a toolbelt button
   * pulls them into the flyout.
   */
  private buildSystemPanels(): void {
    const g = this.g;
    const bodies: Record<string, HTMLElement> = {
      indicators: el('div', 'panel-body'),
      layers: el('div', 'panel-body'),
      menu: el('div', 'panel-body'),
      compute_alloc: el('div', 'panel-body'),
      policies: el('div', 'panel-body'),
      politics: el('div', 'panel-body'),
    };
    this.panelBodies = bodies;
    this.buildLayersPanel(bodies.layers);
    this.buildMenuPanel(bodies.menu);
    this.menuKey = this.menuPanelKey();
    bodies.indicators.id = 'indicators-body';
    bodies.politics.id = 'politics-body';

    const alloc = bodies.compute_alloc;
    alloc.append(el('p', 'hint', 'Distribute available compute between sectors. Everyone wants more.'));
    const keys: Array<[keyof GameState['alloc'], string]> = [
      ['consumer', 'Consumer Services'], ['healthcare', 'Healthcare'], ['industry', 'Industry & Logistics'],
      ['government', 'Government Services'], ['research', 'AI Research'], ['surveillance', 'Surveillance'],
    ];
    for (const [key, label] of keys) {
      const row = el('div', 'alloc-row');
      const lab = el('label', '', label);
      lab.dataset.key = key;
      const slider = el('input') as HTMLInputElement;
      slider.type = 'range'; slider.min = '0'; slider.max = '100';
      slider.value = String(Math.round(g.alloc[key] * 100));
      slider.dataset.key = key;
      const val = el('span', 'alloc-val', `${Math.round(g.alloc[key] * 100)}%`);
      slider.oninput = () => {
        if (this.g.asi.observer) {
          // Snap back before refusing: a slider that stays where you dragged it
          // has agreed with you, whatever the modal on top of it says.
          slider.value = String(Math.round(this.g.alloc[key] * 100));
          this.refuseAdministrative();
          return;
        }
        this.allocDragging = true;
        const requested = Number(slider.value) / 100;
        const { value, adjusted } = filterAllocation(g, key, requested);
        this.applyAllocation(key, value);
        if (adjusted) {
          slider.value = String(Math.round(g.alloc[key] * 100));
          this.flashSystemNote('Requested allocation adjusted to maintain service continuity.');
        }
        this.syncAllocDisplays();
      };
      slider.onchange = () => {
        this.allocDragging = false;
        const a = g.alloc;
        record(g, 'alloc', `Compute reallocated: consumer ${Math.round(a.consumer * 100)}%, healthcare ${Math.round(a.healthcare * 100)}%, industry ${Math.round(a.industry * 100)}%, government ${Math.round(a.government * 100)}%, research ${Math.round(a.research * 100)}%, surveillance ${Math.round(a.surveillance * 100)}%.`);
      };
      row.append(lab, slider, val);
      alloc.append(row);
    }

    const pol = bodies.policies;
    for (const [cat, catLabel] of POLICY_CATEGORIES) {
      pol.append(el('div', 'cat-label', catLabel));
      for (const id of POLICY_ORDER.filter((p) => POLICY_DEFS[p].category === cat)) {
        const def = POLICY_DEFS[id];
        const row = el('div', 'policy-row');
        const btn = el('button', 'policy-toggle');
        btn.dataset.policy = id;
        btn.onclick = () => this.togglePolicy(id, btn);
        const text = el('div', 'policy-text',
          `<b>${def.name}</b><br><small>${def.desc}</small>`);
        // Filled from the ledger once a month has closed under this policy.
        const eff = el('span', 'policy-effect');
        row.append(btn, text, eff);
        pol.append(row);
      }
    }

    const sys = el('div', 'sys-section');
    const shutdown = el('button', 'shutdown-btn', 'EMERGENCY SYSTEM SHUTDOWN');
    shutdown.onclick = () => this.showModal('Emergency Authority', attemptShutdown(g).replace(/\n/g, '<br>'), [
      { label: 'Acknowledge', action: () => {} },
    ]);
    sys.append(shutdown);
    pol.append(sys);
    this.syncPolicyButtons();
  }

  private applyAllocation(changed: keyof GameState['alloc'], value: number): void {
    const g = this.g;
    const keys = Object.keys(g.alloc) as Array<keyof GameState['alloc']>;
    const oldOthers = keys.filter((k) => k !== changed).reduce((s, k) => s + g.alloc[k], 0);
    g.alloc[changed] = Math.max(0, Math.min(1, value));
    const rest = 1 - g.alloc[changed];
    if (oldOthers > 0) {
      for (const k of keys) if (k !== changed) g.alloc[k] = (g.alloc[k] / oldOthers) * rest;
    } else {
      for (const k of keys) if (k !== changed) g.alloc[k] = rest / (keys.length - 1);
    }
  }

  private syncAllocDisplays(): void {
    const g = this.g;
    for (const slider of this.panelBodies.compute_alloc.querySelectorAll<HTMLInputElement>('input[type=range]')) {
      const key = slider.dataset.key as keyof GameState['alloc'];
      if (!this.allocDragging || document.activeElement !== slider) {
        slider.value = String(Math.round(g.alloc[key] * 100));
      }
      const valEl = slider.parentElement?.querySelector('.alloc-val');
      if (valEl) valEl.textContent = `${Math.round(g.alloc[key] * 100)}%`;
    }
  }

  private togglePolicy(id: PolicyId, btn: HTMLElement): void {
    if (this.refuseAdministrative()) return;
    const g = this.g;
    const enacting = !g.policies.has(id);
    const verdict = filterPolicyChange(g, id, enacting);
    if (!verdict.apply) {
      if (verdict.note) this.flashSystemNote(verdict.note);
      return;
    }
    if (enacting) {
      g.policies.add(id);
      notify(g, `${POLICY_DEFS[id].name} enacted.`, 'info');
      record(g, 'policy', `Enacted ${POLICY_DEFS[id].name}.`);
    } else {
      g.policies.delete(id);
      notify(g, `${POLICY_DEFS[id].name} repealed.`, 'info');
      record(g, 'policy', `Repealed ${POLICY_DEFS[id].name}.`);
    }
    // The order was accepted. What actually happened may differ.
    if (verdict.kind === 'substituted') {
      this.flashSystemNote('Requested policy adjusted to maintain service continuity.');
      if (verdict.note) notify(g, verdict.note, 'asi');
      record(g, 'system', verdict.note ?? 'Policy substitution applied.');
    } else if (verdict.kind === 'diluted') {
      if (verdict.note) this.flashSystemNote(verdict.note);
    }
    this.syncPolicyButtons();
  }

  private syncPolicyButtons(): void {
    for (const btn of this.panelBodies.policies.querySelectorAll<HTMLElement>('.policy-toggle')) {
      const id = btn.dataset.policy as PolicyId;
      const on = this.g.policies.has(id);
      btn.classList.toggle('on', on);
      btn.textContent = on ? 'ON' : 'OFF';
      // What this policy is doing to the treasury right now. Only for the ones
      // that are on and that actually touch money — a blank row says "this one
      // buys you something other than capital", which is also worth knowing.
      const eff = btn.parentElement?.querySelector<HTMLElement>('.policy-effect');
      if (!eff) continue;
      const net = on ? this.policyCashflow(id) : null;
      if (net === null || Math.abs(net) < 0.05) {
        eff.textContent = '';
        eff.className = 'policy-effect';
      } else {
        eff.textContent = `${signedMoney(net)}/mo`;
        eff.className = `policy-effect ${net < 0 ? 'eff-bad' : 'eff-good'}`;
      }
    }
  }

  /** This policy's net effect on last month's treasury, per the ledger. */
  private policyCashflow(id: PolicyId): number {
    const led = this.g.ledger;
    if (!led) return 0;
    let net = 0;
    for (const l of led.income) if (l.policy === id) net += l.amount;
    for (const l of led.outgoings) if (l.policy === id) net -= l.amount;
    return net;
  }

  /**
   * Last month's cashflow, line by line.
   *
   * Rebuilt as a string rather than diffed row by row: it is a dozen rows that
   * all change together once a month, behind a panel that is usually closed.
   */
  private ledgerHtml(): string {
    const g = this.g;
    const led = g.ledger ?? { income: [], outgoings: [] };
    if (led.income.length === 0 && led.outgoings.length === 0) {
      return '<div class="ledger-empty">No month has closed yet.</div>';
    }
    const side = (title: string, lines: typeof led.income, total: number, cls: string): string => {
      // Biggest first: the answer to "where did it go" is nearly always the
      // top line, and a fixed simulation order buries it under small change.
      const sorted = [...lines].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      const rows = sorted.map((l) => {
        const neg = l.amount < 0;
        return `<div class="ledger-row${l.policy ? ' from-policy' : ''}">` +
          `<span class="ledger-label">${l.label}${l.rate !== undefined ? ` <small>${l.rate > 0 ? '+' : '−'}${Math.round(Math.abs(l.rate) * 100)}%</small>` : ''}</span>` +
          `<span class="ledger-amt${neg ? ' neg' : ''}">${neg ? '−' : ''}§${money(Math.abs(l.amount))}</span></div>`;
      }).join('');
      return `<div class="ledger-side ${cls}">` +
        `<div class="ledger-head"><span>${title}</span><span>§${money(total)}</span></div>${rows}</div>`;
    };
    const net = g.lastIncome - g.lastOutgoings;
    return side('Income', led.income, g.lastIncome, 'led-in') +
      side('Outgoings', led.outgoings, g.lastOutgoings, 'led-out') +
      `<div class="ledger-net"><span>Net</span><span class="${net < 0 ? 'neg' : ''}">${signedMoney(net)}</span></div>`;
  }

  // ------------------------------------------------------------ inspector
  showInspector(buildingId: number): void {
    const g = this.g;
    const b = g.buildings.get(buildingId);
    if (!b) return;
    this.selectedBuildingId = buildingId;
    const def = BUILDING_DEFS[b.type];
    const cond = buildingCondition(b);
    this.inspector.classList.remove('hidden');
    this.inspector.innerHTML = `<h3>${def.name}${b.asiBuilt ? ' <span class="asi-tag">auto-commissioned</span>' : ''}</h3>
      <p>${def.desc}</p>
      <p class="stats ${b.progress >= 1 && !b.active ? 'stat-bad' : ''}">${b.progress < 1 ? `Under construction (${Math.round(b.progress * 100)}%)` : b.active ? 'Operational' : OFFLINE_REASONS[b.offlineReason ?? 'utility']}</p>
      <p class="stats">${def.jobs ? `Jobs ${def.jobs} · ` : ''}${def.power !== 0 ? `Power ${def.power > 0 ? '+' : ''}${def.power} · ` : ''}${def.water !== 0 ? `Water ${def.water > 0 ? '+' : ''}${def.water} · ` : ''}${def.compute ? `Compute +${def.compute} · ` : ''}Condition ${Math.round(cond * 100)}%</p>`;
    const row = el('div', 'inspector-actions');
    // The ladder, if this building is on one. Shown even when the step is out
    // of reach, because "this becomes a Mid-Rise Block once the region is a
    // City" is the only place the game ever says so.
    const plan = upgradePlan(g, buildingId);
    if (plan) {
      const up = el('button', 'small-btn upgrade-btn' + (plan.ok ? '' : ' locked'),
        plan.ok ? `Upgrade → ${plan.toDef.name} (§${plan.cost.toLocaleString()})`
          : `Upgrade → ${plan.toDef.name}`);
      up.title = plan.ok
        ? `Replaces this ${def.name}. §${plan.toDef.cost.toLocaleString()} less §${plan.credit.toLocaleString()} traded in.`
        : plan.reason ?? '';
      up.onclick = () => {
        if (this.refuseAdministrative()) return;
        if (!plan.ok) { this.sound?.refused(); this.flashSystemNote(plan.reason ?? 'Unavailable.'); return; }
        this.commitUpgrade(buildingId);
      };
      row.append(up);
    }
    if (b.progress >= 1 && cond < 0.98) {
      const renovateCost = Math.round(def.cost * 0.35);
      const ren = el('button', 'small-btn', `Renovate (§${renovateCost})`);
      ren.onclick = () => {
        if (this.refuseAdministrative()) return;
        if (g.resources.capital < renovateCost) { this.flashSystemNote('Insufficient capital.'); return; }
        g.resources.capital -= renovateCost;
        b.age = 0;
        record(g, 'build', `Renovated ${def.name}.`);
        this.showInspector(buildingId);
      };
      row.append(ren);
    }
    // Nothing built yet reads as "undo", not as "demolish" — and it is worth
    // saying in the label, because the two cost very different amounts.
    const refund = demolitionRefund(b);
    const demo = el('button', 'small-btn',
      fullRefund(b) ? `Cancel · +§${refund}` : `Demolish · +§${refund}`);
    if (fullRefund(b)) demo.title = 'Work has not started. The full cost comes back.';
    demo.onclick = () => this.requestDemolish(buildingId);
    row.append(demo);
    this.inspector.append(row);

    // Closing is a corner, not a fourth button in a row that already wraps
    // under an Upgrade label carrying a building name and a price.
    const close = el('button', 'panel-close', '×');
    close.title = 'Close (Esc)';
    close.setAttribute('aria-label', 'Close');
    close.onclick = () => { this.sound?.uiTick(); this.closeInspector(); };
    this.inspector.append(close);

    // Measured once, here, rather than every frame the camera moves: the panel
    // is repositioned in the frame loop, and offsetWidth forces layout.
    this.inspectorSize = [this.inspector.offsetWidth || 280, this.inspector.offsetHeight || 160];
    this.positionInspector();
  }

  /** Put the inspector away. The one place that knows what "closed" means. */
  closeInspector(): void {
    this.selectedBuildingId = null;
    this.inspector.classList.add('hidden');
    this.selectionRect = null;
  }

  /**
   * The inspector follows what it describes.
   *
   * It used to be pinned to the bottom-left corner whatever you clicked, which
   * on a map you can pan and zoom means the panel and its subject were rarely
   * on the same half of the screen — you read a building's condition in one
   * corner while looking at the building in another. Main hands us the selected
   * footprint in client pixels every frame; the panel sits beside it.
   *
   * Not on narrow screens. Below 820px the stylesheet makes the inspector a
   * full-width sheet above the bar, and "beside the building" on a 390px phone
   * means "on top of the building".
   */
  trackSelection(rect: ScreenRect | null): void {
    this.selectionRect = rect;
    if (this.selectedBuildingId == null || this.inspector.classList.contains('hidden')) return;
    // No rectangle for something that is still selected means the building is
    // no longer there — demolished under you, or replaced by an upgrade the
    // system commissioned. A panel describing a building that has gone should
    // go with it rather than drift back to the corner.
    if (!rect) { this.closeInspector(); return; }
    this.positionInspector();
  }

  private positionInspector(): void {
    const r = this.selectionRect;
    if (!r || this.narrowScreen.matches) {
      // Hand it back to the stylesheet, and make sure no transform from a wider
      // window is left applied to it.
      this.inspector.classList.remove('floating');
      this.inspector.style.transform = '';
      this.inspectorAt = '';
      this.inspectorBox = null;
      return;
    }
    const GAP = 12, MARGIN = 8;
    const [w, h] = this.inspectorSize;
    const vw = window.innerWidth, vh = window.innerHeight;
    // The bar is the floor. Its height is published for exactly this.
    const floorY = vh - (this.lastBarHeight || 130) - MARGIN;
    const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

    // Right of the footprint first, then left, then centred on it as a last
    // resort — which is the only case that can cover the building.
    let x = r.x + r.w + GAP;
    let beside = true;
    if (x + w > vw - MARGIN) {
      const leftX = r.x - GAP - w;
      if (leftX >= MARGIN) x = leftX;
      else { x = clamp(r.x + r.w / 2 - w / 2, MARGIN, vw - w - MARGIN); beside = false; }
    }
    let y = clamp(r.y + r.h / 2 - h / 2, MARGIN, Math.max(MARGIN, floorY - h));
    if (!beside) {
      // Above the footprint if there is room, below it if there isn't. A panel
      // that has to share the horizontal band must not share the vertical one.
      const above = r.y - GAP - h, below = r.y + r.h + GAP;
      if (above >= MARGIN) y = above;
      else if (below + h <= floorY) y = below;
    }
    this.inspector.classList.add('floating');
    this.inspectorBox = { x, y, w, h };
    // Written only when it changes: this runs every frame, and a style write is
    // a style write whether or not the value differs.
    const t = `translate3d(${Math.round(x)}px,${Math.round(y)}px,0)`;
    if (t !== this.inspectorAt) { this.inspectorAt = t; this.inspector.style.transform = t; }
  }

  /**
   * Replace a building with the next thing up its ladder.
   *
   * An upgrade demolishes what is there, so anything substantial asks first,
   * on the same threshold demolition uses — and the confirmation says what
   * demolition's does not: that the block empties while the replacement goes
   * up, which for housing is the whole population of it, gone for a few months.
   */
  private commitUpgrade(buildingId: number): void {
    const g = this.g;
    const plan = upgradePlan(g, buildingId);
    if (!plan || !plan.ok) return;
    const fromDef = BUILDING_DEFS[plan.from];
    const finish = () => {
      const nb = performUpgrade(g, buildingId);
      if (!nb) { this.sound?.refused(); this.flashSystemNote('Upgrade could not proceed.'); return; }
      this.sound?.placed();
      this.flashSystemNote(`${fromDef.name} being replaced by ${plan.toDef.name}. §${plan.cost.toLocaleString()} committed.`);
      this.selectedBuildingId = nb.id;
      this.showInspector(nb.id);
    };
    if (plan.cost < CONFIRM_DEMOLITION_ABOVE) { finish(); return; }
    const disruption = fromDef.housing
      ? `The ${fromDef.housing} residents move out today; the ${plan.toDef.housing} places come back when it tops out.`
      : `Its output stops today and returns when the ${plan.toDef.name} is finished.`;
    this.showModal('Confirm Upgrade',
      `Replace the ${fromDef.name} with ${withArticle(plan.toDef.name)}? ` +
      `§${plan.toDef.cost.toLocaleString()} to build, §${plan.credit.toLocaleString()} traded in for what is standing — ` +
      `§${plan.cost.toLocaleString()} from the treasury.<br><br>${disruption}`,
      [{ label: `Upgrade · §${plan.cost.toLocaleString()}`, action: finish }, { label: 'Cancel', action: () => {} }]);
  }

  /**
   * Demolish a building, from wherever the request came from.
   *
   * The demolish tool used to open the inspector when it hit a building, so a
   * tool called Demolish reliably demolished roads and reliably didn't
   * demolish anything else. It does now — but through the same gate the
   * inspector always used, because the refusals are the story: at phase 2 the
   * system declines to decommission a data centre, and that has to survive
   * being reached by a different route.
   *
   * Anything substantial asks first. A road is a few tiles and a shrug; a
   * nuclear plant is nine hundred capital and a district's power, and a
   * misplaced click should not be able to spend it.
   */
  requestDemolish(buildingId: number): void {
    if (this.refuseAdministrative()) return;
    const g = this.g;
    const b = g.buildings.get(buildingId);
    if (!b) return;
    const def = BUILDING_DEFS[b.type];
    const check = canDemolish(g, buildingId);
    if (!check.ok) {
      this.sound?.refused();
      this.showModal('Action Unavailable', check.reason ?? '', [{ label: 'Acknowledge', action: () => {} }]);
      return;
    }
    const refund = demolitionRefund(b);
    const undo = fullRefund(b);
    const finish = () => {
      demolishBuilding(g, buildingId);
      this.sound?.demolished();
      record(g, 'demolish', undo ? `Cancelled the ${def.name} before work began.` : `Demolished ${def.name}.`);
      this.flashSystemNote(undo
        ? `${def.name} cancelled before work began. §${refund.toLocaleString()} returned in full.`
        : `${def.name} demolished. §${refund} recovered.`);
      this.closeInspector();
    };
    // The confirmation exists to stop a misclick spending a nuclear plant. A
    // site where nothing has been built yet costs nothing to take back, so
    // there is nothing to confirm — asking would be the interface charging
    // friction where it no longer charges capital.
    if (undo || def.cost < CONFIRM_DEMOLITION_ABOVE) { finish(); return; }
    this.showModal('Confirm Demolition',
      `Demolish the ${def.name}? It cost §${def.cost.toLocaleString()} to build and ` +
      `§${refund.toLocaleString()} comes back. Anything it was supplying loses it this month.`,
      [{ label: `Demolish · +§${refund}`, action: finish }, { label: 'Cancel', action: () => {} }]);
  }

  // ------------------------------------------------------------ modal & events
  private showModal(title: string, bodyHtml: string, choices: Array<{ label: string; action: () => void }>, recommendedIndex = -1, variant = ''): void {
    this.modal.classList.remove('hidden');
    this.modal.innerHTML = '';
    const box = el('div', 'modal-box' + (variant ? ' ' + variant : ''));
    box.append(el('h2', '', title), el('div', 'modal-body', bodyHtml));
    const btns = el('div', 'modal-choices');
    choices.forEach((c, i) => {
      const b = el('button', 'choice-btn', c.label);
      if (i === recommendedIndex) {
        b.classList.add('recommended');
        b.innerHTML = `${c.label} <span class="rec-tag">RECOMMENDED</span>`;
      }
      b.onclick = () => { this.modal.classList.add('hidden'); c.action(); };
      btns.append(b);
    });
    box.append(btns);
    this.modal.append(box);
  }

  /**
   * The Load menu, with a way to get rid of a save.
   *
   * Two slots is not many, and until now the only way to free one was to
   * overwrite it — which meant playing far enough into a region you did not
   * want in order to displace a region you did.
   */
  /**
   * A row you press, with an optional corner X.
   *
   * The row is the button. A row with an *Open* or a *Load* button on it asks
   * the player to find the small control inside the large obvious one they were
   * already pointing at — and then puts *Delete* beside it, the same size, the
   * same weight, one target away from the action they wanted. So the row does
   * the safe thing when pressed anywhere, and the destructive one is a corner
   * X: small, out of the way, and impossible to hit by aiming at the row.
   *
   * One helper for every list in the game that works this way — saves, and the
   * archived administrations — so the shape cannot drift apart between them.
   */
  private rowHtml(id: string, r: {
    icon?: string; label: string; meta?: string; sub?: string; flag?: string; del?: string;
  }): string {
    return `<div class="save-row" role="button" tabindex="0" data-row="${id}">
      ${r.icon ? `<span class="tb-ico">${r.icon}</span>` : ''}
      <span class="save-what">
        <span class="save-line"><b class="tb-label">${r.label}</b>${r.meta ? `<span class="tb-meta">${r.meta}</span>` : ''}</span>
        ${r.sub ? `<small>${r.sub}</small>` : ''}${r.flag ?? ''}
      </span>
      ${r.del ? `<button class="panel-close row-x" data-del="${id}" aria-label="${r.del}" title="${r.del}">×</button>` : ''}
    </div>`;
  }

  /** Hook up rows built by `rowHtml`: press the row, or press its corner X. */
  private wireRows(onPick: (id: string) => void, onDelete?: (id: string) => void): void {
    // Keyed on the attribute rather than on a class, so a list that is laid
    // out differently — the region cards are not save rows — still gets the
    // same behaviour from the same place.
    for (const row of this.modal.querySelectorAll<HTMLElement>('[data-row]')) {
      const id = row.dataset.row!;
      const go = () => onPick(id);
      row.onclick = go;
      // A row that answers to a pointer must answer to a keyboard.
      row.onkeydown = (ev: KeyboardEvent) => {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        ev.preventDefault();
        go();
      };
    }
    if (!onDelete) return;
    for (const b of this.modal.querySelectorAll<HTMLElement>('[data-del]')) {
      // The X is inside the row, and the row loads what the X is about to
      // delete. Without this it would do both.
      b.onclick = (ev) => { ev.stopPropagation(); onDelete(b.dataset.del!); };
    }
  }

  private slotRowHtml(s: SlotInfo, deletable = true): string {
    const when = new Date(s.env.savedAt).toLocaleString();
    const year = Math.floor(s.env.tick / 12) + 1;
    const lock = s.env.locked ? '<span class="save-flag">observer · permanently locked</span>'
      : s.env.ended ? '<span class="save-flag">administration terminated</span>' : '';
    return this.rowHtml(s.slot, {
      icon: icon(s.manual ? 'save' : 'history'),
      label: s.manual ? 'Manual save' : 'Autosave',
      meta: `Year ${year} · pop ${s.env.population.toLocaleString()}`,
      sub: when,
      flag: lock,
      del: deletable ? 'Delete this save' : undefined,
    });
  }

  /** `wireRows`, resolved back to the save each row stands for. */
  private wireSlotRows(onPick: (s: SlotInfo) => void, onDelete?: (s: SlotInfo) => void): void {
    const all = savedGames();
    const find = (slot: string) => all.find((s) => s.slot === slot);
    this.wireRows(
      (id) => { const s = find(id); if (s) onPick(s); },
      onDelete ? (id) => { const s = find(id); if (s) onDelete(s); } : undefined);
  }

  /**
   * The Load menu: every save there is, newest first.
   *
   * Built from one list rather than from a hardcoded pair of slots, so a slot
   * cannot be offered here and forgotten by Continue — which is precisely how
   * Continue came to mean "the autosave" instead of "where you were".
   */
  showLoadMenu(fromTitle = false): void {
    const slots = savedGames();
    const back = { label: fromTitle ? 'Back' : 'Close', action: () => { if (fromTitle) this.showTitle(); } };
    if (slots.length === 0) {
      this.showModal('Load Game', 'No saved games found.', [back]);
      return;
    }
    this.showModal('Load Game',
      `<p class="hint">${fromTitle ? 'Pick a save to resume.' : 'Loading replaces the current session.'}</p>` +
      slots.map((s) => this.slotRowHtml(s)).join(''),
      [back]);
    this.wireSlotRows(
      (s) => { this.modal.classList.add('hidden'); this.onSession({ kind: 'load', slot: s.slot }); },
      (s) => {
        const year = Math.floor(s.env.tick / 12) + 1;
        this.showModal('Delete Save',
          `Delete this save? Year ${year}, population ${s.env.population.toLocaleString()}. ` +
          'The decision record for a finished administration is kept either way; a region in progress is not.',
          [
            { label: 'Delete', action: () => { deleteSlot(s.slot); this.showLoadMenu(fromTitle); } },
            { label: 'Keep it', action: () => this.showLoadMenu(fromTitle) },
          ]);
      });
  }

  /**
   * Past administrations.
   *
   * What is kept is the record, not the region: how long it lasted, how big it
   * got, how it ended, and every decision that got it there. A finished run
   * used to sit in the autosave slot indefinitely, so the title screen offered
   * to reopen a region that had been dead for weeks. It offers the list now.
   */
  showArchive(fromTitle = false): void {
    const list = readArchive();
    const back = { label: fromTitle ? 'Back' : 'Close', action: () => { if (fromTitle) this.showTitle(); } };
    if (list.length === 0) {
      this.showModal('Past Administrations', 'Nothing on record yet.', [back]);
      return;
    }
    // The row is the button, as in the Load menu. An administration's decisions
    // are the only thing kept of it and the only reason to open the list at
    // all, so pressing the administration opens them — a *Decisions* button was
    // a second, smaller target for the thing the row was already for.
    const rows = list.map((r) => {
      const years = Math.floor(r.tick / 12);
      const how = r.kind === 'observer' ? 'Outlived by the system' : 'Terminated';
      return this.rowHtml(String(r.runId), {
        // The mark says which of the two endings this was, before the words
        // do. `override` for the one where the system outlived you — it is the
        // control that stopped answering — and the ballot box for the other,
        // because an administration ending is a political fact whatever the
        // cause was. A loudhailer was the first choice and it was wrong: it
        // says "unrest", and these end in bankruptcy and collapse too.
        icon: icon(r.kind === 'observer' ? 'override' : 'politics'),
        label: r.scenarioName,
        meta: `${years}y · peak ${r.peakPopulation.toLocaleString()}`,
        sub: `${how} — ${r.cause}`,
        del: 'Delete this record',
      });
    }).join('');
    this.showModal('Past Administrations',
      '<p class="hint">Each of these ended. Open one to read every decision that got it there.</p>' + rows,
      [back]);
    const find = (id: string) => list.find((r) => String(r.runId) === id);
    this.wireRows(
      (id) => { const rec = find(id); if (rec) this.showRecord(rec, fromTitle); },
      (id) => {
        const rec = find(id);
        if (!rec) return;
        const years = Math.floor(rec.tick / 12);
        // It used to go on the first click, with nothing asked. The record is
        // the only thing that outlives an administration, and there is no
        // second copy of it anywhere.
        this.showModal('Delete Record',
          `Delete the record of ${rec.scenarioName}? ${years} year${years === 1 ? '' : 's'}, ` +
          `peak population ${rec.peakPopulation.toLocaleString()}. ` +
          'Every decision it made goes with it, and nothing else keeps them.',
          [
            { label: 'Delete', action: () => { deleteRecord(rec.runId); this.showArchive(fromTitle); } },
            { label: 'Keep it', action: () => this.showArchive(fromTitle) },
          ]);
      });
  }

  /** One archived administration: how it ended, then everything it decided. */
  private showRecord(rec: RunRecord, fromTitle: boolean): void {
    const years = Math.floor(rec.tick / 12);
    const rows = rec.history.length === 0
      ? '<p>No decisions on record.</p>'
      : rec.history.map((h) => {
          const year = Math.floor(h.tick / 12) + 1;
          const cls = h.kind === 'system' ? 'hist-system' : 'hist-player';
          return `<div class="hist-row ${cls}"><span class="hist-date">Y${year} ${MONTHS[h.tick % 12]}</span>${h.text}</div>`;
        }).join('');
    this.showModal(`${rec.scenarioName} — ${years} year${years === 1 ? '' : 's'}`,
      `<p class="rec-cause">${rec.cause}</p>` +
      `<p class="hint">Peak population ${rec.peakPopulation.toLocaleString()}. ` +
      `Each entry was, at the time, a reasonable response to a real problem.</p>` +
      `<div class="hist-list">${rows}</div>`,
      [{ label: 'Back', action: () => this.showArchive(fromTitle) }]);
  }

  /** Shown once at the start of a fresh game. */
  showIntro(): void {
    this.showModal(INTRO_TITLE, INTRO_BODY, [{ label: 'Assume Office', action: () => {} }]);
  }

  /**
   * The historical review. It lists every decision in order and draws no
   * conclusions: there is no single mistake to find.
   */
  private showHistory(): void {
    const g = this.g;
    const rows = g.history.length === 0
      ? '<p>No decisions on record.</p>'
      : g.history.map((h) => {
          const year = Math.floor(h.tick / 12) + 1;
          const cls = h.kind === 'system' ? 'hist-system' : 'hist-player';
          return `<div class="hist-row ${cls}"><span class="hist-date">Y${year} ${MONTHS[h.tick % 12]}</span>${h.text}</div>`;
        }).join('');
    this.showModal('Historical Decision Review',
      `<p class="hint">Each entry was, at the time, a reasonable response to a real problem.</p><div class="hist-list">${rows}</div>`,
      // Closing this used to bounce the player back to the observer banner,
      // because the banner was the only place the exits lived. They live on the
      // bar now, so closing the log returns you to the region you were watching
      // rather than re-drawing the curtain over it.
      [{ label: 'Close', action: () => {} }]);
  }

  /**
   * Choice label plus projected impact. Precise numbers early; direction-only
   * once the system starts consolidating; at phase 4+ the projection collapses
   * into a single reassurance on the option the system prefers.
   */
  private choiceLabelWithImpact(e: NonNullable<GameState['pendingEvent']>, label: string, index: number, recommended: boolean): string {
    const g = this.g;
    if (g.asi.phase >= 4) {
      return recommended
        ? `${label}<span class="chips"><span class="chip chip-calm">Projected outcome: favorable</span></span>`
        : label;
    }
    const chips = previewChoice(g, e, index);
    if (chips.length === 0) return label;
    const html = chips.map((ch) =>
      `<span class="chip ${ch.good ? 'chip-good' : 'chip-bad'}">${ch.dir === 'up' ? '▲' : '▼'} ${ch.text}</span>`).join('');
    return `${label}<span class="chips">${html}</span>`;
  }

  /**
   * Pause for a decision, remembering what to resume to. Routed through
   * pauseAllowed: at phase 4+ the pause is only advisory, so sometimes the
   * world keeps moving while you read.
   */
  private autoPause(): void {
    const g = this.g;
    if (!this.prefs.autoPauseOnDecision) { this.resumeSpeed = null; return; }
    if (g.speed > 0 && pauseAllowed(g)) {
      this.resumeSpeed = g.speed;
      this.setSpeed(0);
    } else {
      this.resumeSpeed = null;
    }
  }

  private autoResume(): void {
    if (this.resumeSpeed != null && this.g.speed === 0 && !this.g.asi.observer && !this.g.gameOver) {
      this.setSpeed(this.resumeSpeed);
    }
    this.resumeSpeed = null;
  }

  /**
   * The gate every administrative control passes through in observer mode.
   * Returns true when it has handled the interaction — the caller does nothing
   * further. One modal, one wording, from all of them.
   */
  private refuseAdministrative(): boolean {
    if (!this.g.asi.observer) return false;
    this.sound?.refused();
    this.showModal(OBSERVER_REFUSAL_TITLE, OBSERVER_REFUSAL, [{ label: 'Acknowledge', action: () => {} }]);
    return true;
  }

  /**
   * The single write path for speed. Anything that runs the clock records the
   * speed it ran at, so a later resume has something to return to.
   */
  private setSpeed(s: 0 | 1 | 2 | 3): void {
    if (s !== 0) this.runSpeed = s;
    this.onSpeed(s);
  }

  /**
   * Space. Not the same as clicking a transport button: the buttons are
   * explicit ("run at 2×"), this is a suspension that undoes itself. Pause
   * still has to ask — at phase 4+ the system may decline — and resuming goes
   * back to the speed the player was actually watching at.
   */
  toggleSpeed(): void {
    const g = this.g;
    if (g.speed === 0) {
      // Observer mode keeps its transport. Once you are only watching, speed is
      // a viewing control rather than an instruction to the region — there is
      // nothing left to instruct.
      if (g.gameOver && !g.asi.observer) return;
      this.setSpeed(this.runSpeed);
      return;
    }
    if (!pauseAllowed(g)) {
      this.flashSystemNote(PAUSE_REFUSED);
      return;
    }
    this.setSpeed(0);
  }

  /**
   * Quick status on hover — the map should answer questions without a click.
   * Driven from the main loop with the tile under the cursor.
   */
  showHover(tile: [number, number] | null, sx: number, sy: number): void {
    const g = this.g;
    if (!tile || this.modal.classList.contains('hidden') === false) {
      this.hoverCard.classList.add('hidden');
      return;
    }
    const t = g.map[tile[1] * g.mapW + tile[0]];
    if (!t) { this.hoverCard.classList.add('hidden'); return; }
    let html = '';
    if (t.buildingId !== -1) {
      const b = g.buildings.get(t.buildingId);
      if (b) {
        const def = BUILDING_DEFS[b.type];
        const status = b.progress < 1
          ? `<span class="hc-warn">Under construction — ${Math.round(b.progress * 100)}%</span>`
          : b.active
            ? '<span class="hc-ok">Operational</span>'
            : `<span class="hc-bad">${OFFLINE_REASONS[b.offlineReason ?? 'utility'].replace('Offline — ', '')}</span>`;
        const bits: string[] = [];
        if (def.housing) bits.push(`Housing ${def.housing}`);
        if (def.jobs) bits.push(`Jobs ${def.jobs}`);
        if (def.compute) bits.push(`Compute +${def.compute}`);
        if (def.serviceRadius) bits.push(`Range ${def.serviceRadius}`);
        if (b.progress >= 1) bits.push(`Condition ${Math.round(buildingCondition(b) * 100)}%`);
        html = `<div class="hc-title">${def.name}${b.asiBuilt ? ' <span class="asi-tag">auto</span>' : ''}</div>
          <div class="hc-status">${status}</div>
          <div class="hc-stats">${bits.join(' · ')}</div>`;
      }
    } else if (t.road) {
      const rd = ROAD_DEFS[t.roadType ?? 1];
      html = `<div class="hc-title">${rd.name}</div><div class="hc-stats">Lane capacity ${rd.capacity}</div>`;
    } else {
      const terrainName = { grass: 'Grassland', forest: 'Woodland', water: 'Water', sand: 'Sand', rock: 'Rock' }[t.terrain];
      const buildable = t.terrain !== 'water' && t.terrain !== 'rock';
      // Rock and water used to read the same — "Not buildable", full stop. Both
      // are answerable now, so the card says how rather than just no.
      let note: string;
      if (t.terrain === 'rock') {
        note = this.tool.kind === 'demolish'
          ? `<span class="hc-act">Clear for §${ROCK_CLEAR_COST}</span>`
          : `Not buildable · clear it with Demolish, §${ROCK_CLEAR_COST}`;
      } else if (t.terrain === 'water') {
        note = this.tool.kind === 'build' && this.tool.type === 'bridge'
          ? (bridgeSpans(g, tile[0], tile[1])
            ? `<span class="hc-act">Bridge here · §${BUILDING_DEFS.bridge.cost}</span>`
            : 'Too far from the far bank to bridge')
          : 'Not buildable · a bridge can cross it';
      } else {
        note = buildable ? 'Buildable' : 'Not buildable';
      }
      html = `<div class="hc-title">${terrainName}</div>
        <div class="hc-stats">${note}${t.pollution > 0.04 ? ` · Pollution ${Math.round(t.pollution * 100)}%` : ''}</div>`;
    }
    // Rewriting identical markup still costs a style recalc, and reading
    // offsetWidth straight afterwards forces a synchronous layout of the whole
    // document — which the HUD has grown a great deal of. Only touch the DOM
    // when the text actually changed, and reuse the measurement until it does.
    if (html !== this.hoverHtml) {
      this.hoverHtml = html;
      this.hoverCard.innerHTML = html;
      this.hoverCard.classList.remove('hidden');
      this.hoverSize = [this.hoverCard.offsetWidth || 190, this.hoverCard.offsetHeight || 60];
    } else {
      this.hoverCard.classList.remove('hidden');
    }
    // Positioned by transform rather than left/top: the compositor can move it
    // without laying the page out again.
    const [w, h] = this.hoverSize;
    let px = Math.min(sx + 16, window.innerWidth - w - 8);
    let py = Math.min(sy + 16, window.innerHeight - h - 120);
    // Step around the inspector.
    //
    // The panel now opens beside the building you clicked, which is where the
    // pointer already is — so the card and the panel landed on top of each
    // other, and the card, being the higher layer, covered the buttons of the
    // thing it was summarising. Below/right first as always, then the other
    // three corners of the cursor, and if the panel fills all of them the card
    // stands down: the inspector says more than it does.
    const box = this.inspectorBox;
    if (box && !this.inspector.classList.contains('hidden')) {
      const hits = (x: number, y: number) =>
        x < box.x + box.w && x + w > box.x && y < box.y + box.h && y + h > box.y;
      if (hits(px, py)) {
        const fit = ([[sx - 16 - w, py], [px, sy - 16 - h], [sx - 16 - w, sy - 16 - h]] as Array<[number, number]>)
          .find(([ax, ay]) => ax >= 8 && ay >= 8 && !hits(ax, ay));
        if (!fit) { this.hoverCard.classList.add('hidden'); return; }
        [px, py] = fit;
      }
    }
    this.hoverCard.style.transform = `translate3d(${Math.round(px)}px,${Math.round(py)}px,0)`;
  }

  /** A transient line of system chrome. Also how main.ts reports a bad save. */
  /**
   * Mark the class field after a promotion.
   *
   * The console has always shown the class and always will, which means the
   * one moment it changes looks exactly like every moment it does not. A
   * timer rather than a CSS animation because the same class has to survive
   * the LCD being rebuilt by `refresh()` sixty times a second underneath it.
   */
  private promotedUntil = 0;
  private markPromotion(): void {
    this.promotedUntil = performance.now() + PROMOTION_MARK_MS;
    this.syncPromotionMark();
  }
  /**
   * Applied here as well as in `refresh()`, because refresh reaches the LCD a
   * couple of hundred lines before it reaches the report queue: a mark set or
   * cleared down there would otherwise not land until the next refresh, and at
   * four a second that is a visible quarter-second of the console disagreeing
   * with the dialog in front of it.
   */
  private syncPromotionMark(): void {
    this.civicBar.classList.toggle('lcd-promoted', performance.now() < this.promotedUntil);
  }

  flashSystemNote(text: string): void {
    const n = el('div', 'sys-flash', text);
    this.root.append(n);
    setTimeout(() => n.classList.add('show'), 10);
    setTimeout(() => { n.classList.remove('show'); setTimeout(() => n.remove(), 400); }, 3200);
  }

  // ------------------------------------------------------------ refresh (called ~4x/s)
  refresh(): void {
    const g = this.g;

    // Phase transitions restructure the chrome.
    if (g.asi.phase !== this.lastPhase) {
      this.lastPhase = g.asi.phase;
      document.body.classList.toggle('phase4', g.asi.phase >= 4);
      document.body.classList.toggle('phase5', g.asi.phase >= 5);
      document.body.classList.toggle('observer', g.asi.observer);
      if (g.asi.observer) this.enterObserverMode();
    }

    // Rebuild the construction menu when the set of available buildings
    // changes — compute unlocks, phase restrictions, or a region
    // reclassification lifting a tier lock.
    const menuKey = tierOf(g.population).name + '|' + BUILD_MENU_ORDER
      .filter((t) => buildableTypes(g).has(t))
      .filter((t) => !BUILDING_DEFS[t].unlockCompute || g.resources.compute >= BUILDING_DEFS[t].unlockCompute)
      .join(',');
    if (menuKey !== this.lastBuildMenuKey) {
      this.lastBuildMenuKey = menuKey;
      this.renderToolbelt();
      if (this.openPanel && this.hudCategories().some((c) => c.id === this.openPanel)) {
        this.renderBuildFlyout(this.openPanel);
        this.syncToolButtons();
      }
    }

    // Top bar --------------------------------------------------------------
    const r = g.resources;
    const year = Math.floor(g.tick / 12) + 1;
    const month = MONTHS[g.tick % 12];
    const powerBad = r.powerDemand > r.powerCapacity;
    const waterBad = r.waterDemand > r.waterCapacity;
    const unemp = Math.round(g.unemployment * 100);
    const hideNegatives = g.asi.phase >= 4;
    const unempLabel = statLabel(g, 'Unemployment');
    const unempText = hideNegatives
      ? `${unempLabel}: <b>optimal</b>`
      : `${unempLabel}: <b>${unemp}%</b>`;
    const unrestLabel = statLabel(g, 'Unrest');
    const unrestVal = hideNegatives ? 'nominal' : `${Math.round(g.unrest * 100)}%`;
    // Jobs and unemployment were two readouts of one situation. They are now
    // one meter that names which of the two problems the region actually has:
    // idle workers, or posts nobody is available to fill.
    const unemployed = Math.max(0, g.labourForce - g.jobsFilled);
    const shortage = g.jobVacancies > 0 && unemployed === 0;
    const labourLabel = shortage ? statLabel(g, 'Vacancies') : unempLabel;
    const labourGauge = shortage
      ? Math.min(100, (g.jobVacancies / Math.max(1, g.jobsTotal)) * 100)
      : unemp;
    const labourText = hideNegatives ? '—' : shortage ? g.jobVacancies.toLocaleString() : `${unemp}%`;
    const labourReading =
      `Labour force ${g.labourForce.toLocaleString()} · posts ${g.jobsTotal.toLocaleString()} · filled ${g.jobsFilled.toLocaleString()}` +
      (shortage
        ? `<br>${g.jobVacancies.toLocaleString()} post${g.jobVacancies === 1 ? '' : 's'} unfilled — the region is short of workers, not of work.`
        : `<br>${unemployed.toLocaleString()} without work.`);
    // ---- Vital signs: capacity at a glance ----
    // Each utility reads as a fill bar of demand against capacity, so strain
    // is visible before it becomes an outage. Every gauge reads the same way
    // round — need first, then have — so a glance never has to work out which
    // number is which.
    const primary: PanelItem[] = [];
    const secondary: PanelItem[] = [];
    const vital = (into: PanelItem[], key: string, icon: string, body: string, reading?: string) =>
      into.push({
        kind: 'block', key, className: 'vital', explain: key, reading,
        html: `<span class="vital-ico">${icon}</span><span class="vital-body">${body}</span>`,
      });
    const gauge = (into: PanelItem[], icon: string, key: string, need: number, have: number, unit = '') => {
      const pct = have > 0 ? Math.min(150, (need / have) * 100) : (need > 0 ? 150 : 0);
      const cls = pct > 100 ? 'gauge-bad' : pct > 85 ? 'gauge-warn' : 'gauge-ok';
      const shown = hideNegatives ? 'gauge-calm' : cls;
      const u = unit ? ` ${unit}` : '';
      const reading = have > 0
        ? `Need ${Math.round(need).toLocaleString()}${u} · have ${Math.round(have).toLocaleString()}${u} — ${Math.round((need / have) * 100)}% used`
        : `Need ${Math.round(need).toLocaleString()}${u} · no capacity built`;
      vital(into, key, icon,
        `<span class="vital-num">${Math.round(need).toLocaleString()}<span class="vital-cap">/${Math.round(have).toLocaleString()}</span></span>` +
        `<span class="gauge"><span class="gauge-fill ${shown}" style="width:${Math.min(100, pct)}%"></span></span>`,
        reading);
    };
    // A 0..100 indicator rendered in the same visual language as the gauges,
    // so nothing in the bar reads as a bare number.
    const meter = (into: PanelItem[], icon: string, key: string, label: string, value: number,
                   opts?: { invert?: boolean; suffix?: string; reading?: string; text?: string }) => {
      const v = Math.max(0, Math.min(100, value));
      const good = opts?.invert ? 100 - v : v;
      const cls = good < 30 ? 'gauge-bad' : good < 55 ? 'gauge-warn' : 'gauge-ok';
      const shown = hideNegatives ? 'gauge-calm' : cls;
      const text = opts?.text ?? (hideNegatives && opts?.invert ? '—' : `${Math.round(v)}${opts?.suffix ?? ''}`);
      vital(into, key, icon,
        `<span class="vital-num">${text}<span class="vital-label-inline">${label}</span></span>` +
        `<span class="gauge"><span class="gauge-fill ${shown}" style="width:${v}%"></span></span>`,
        opts?.reading);
    };
    const housingCap = [...g.buildings.values()]
      .filter((b) => b.progress >= 1 && b.active)
      .reduce((sum, b) => sum + BUILDING_DEFS[b.type].housing, 0);
    const capitalCls = r.capital < 0 ? 'bad' : '';

    // The rate bar. Zero is the middle; a surplus fills right, a deficit fills
    // left, and the length is the rate as a fraction of what the region spends
    // — so the reading means the same thing at sixty residents and sixty
    // thousand. The slot used to be an empty transparent track that existed
    // only to keep capital aligned with the four gauges beside it, which read
    // as a progress bar that never moved.
    const flow = cashflow(g);
    const pct = Math.abs(flow.frac) * 50;
    const rateCls = hideNegatives ? 'gauge-calm' : flow.net < 0 ? 'gauge-bad' : 'gauge-ok';
    const sign = flow.net > 0 ? '+' : flow.net < 0 ? '−' : '';
    const rateReading = flow.months === 0
      ? 'No month has closed yet.'
      : `${sign}§${Math.abs(Math.round(flow.net)).toLocaleString()} a month over the last ` +
        `${flow.months} of ${NET_WINDOW} — ` +
        (Math.abs(flow.frac) < 0.02 ? 'about breaking even'
          : flow.net > 0 ? `keeping ${Math.round(flow.frac * 100)}% of what comes in`
          : `losing ${Math.round(-flow.frac * 100)}% of turnover`) +
        `. Taking §${Math.round(flow.income).toLocaleString()} a month, spending ` +
        `§${Math.round(flow.outgoings).toLocaleString()}.`;
    vital(primary, 'capital', '§',
      `<span class="vital-num ${capitalCls}">${Math.round(r.capital).toLocaleString()}<span class="vital-label-inline">Capital</span></span>` +
      `<span class="gauge gauge-rate"><span class="gauge-zero"></span>` +
      `<span class="gauge-fill ${rateCls}" style="left:${flow.net < 0 ? 50 - pct : 50}%;width:${pct}%"></span></span>`,
      `§${Math.round(r.capital).toLocaleString()} in the treasury. ${rateReading}`);
    gauge(primary, icon('power'), 'power', r.powerDemand, r.powerCapacity, 'MW');
    gauge(primary, icon('water'), 'water', r.waterDemand, r.waterCapacity, 'ML');
    gauge(primary, icon('compute'), 'compute', r.computeDemand, r.compute, 'PF');
    gauge(primary, icon('housing'), 'housing', g.population, housingCap);

    meter(secondary, icon('trust'), 'trust', 'Trust', g.indicators.trust,
      { reading: `${Math.round(g.indicators.trust)} of 100` });
    meter(secondary, icon('health'), 'health', 'Health', g.indicators.health,
      { reading: `${Math.round(g.indicators.health)} of 100` });
    meter(secondary, icon('appeal'), 'appeal', 'Appeal', g.attractiveness.overall * 100,
      { reading: `${Math.round(g.attractiveness.overall * 100)} of 100 · migration queue ${Math.max(0, Math.round(g.migrationDemand - g.population)).toLocaleString()}` });
    meter(secondary, icon('labour'), 'labour', labourLabel, labourGauge,
      { invert: true, text: labourText, reading: labourReading });
    meter(secondary, icon('unrest'), 'unrest', unrestLabel, g.unrest * 100,
      { invert: true, suffix: '%', reading: hideNegatives ? 'Nominal' : `${Math.round(g.unrest * 100)}% · ${RESISTANCE_STAGES[g.resistanceStage]}` });

    // Primary row survives collapse; secondary row is the first thing hidden.
    this.syncRows(this.vitalGroup('grp.primary', 'vital-group vital-primary'), primary);
    this.syncRows(this.vitalGroup('grp.secondary', 'vital-group vital-secondary'), secondary);

    // ---- Centre console: the LCD readout ----
    // The display is deliberately spare and instrument-like. Once the system
    // takes over it stops reporting a class and starts reporting a mode.
    const lcdClass = g.asi.observer ? 'OBSERVATION' : tierOf(g.population).name.toUpperCase();
    this.barStatus.innerHTML =
      `<span class="lcd-line lcd-main">YEAR ${year}<span class="lcd-dot">·</span>${month.toUpperCase()}</span>` +
      `<span class="lcd-line lcd-sub">${lcdClass}</span>`;
    // Hovering the display expands it into the regional summary.
    const queue = Math.max(0, Math.round(g.migrationDemand - g.population));
    this.barStatus.title =
      `${tierOf(g.population).name} · population ${g.population.toLocaleString()}\n` +
      `Migration queue: ${queue}\n` +
      `Attractiveness: ${Math.round(g.attractiveness.overall * 100)}\n` +
      `Year ${year}, ${month}`;
    const tierFill = this.tierBar.firstElementChild as HTMLElement | null;
    if (tierFill) {
      const p = g.asi.observer ? 1 : tierProgress(g.population);
      tierFill.style.width = `${Math.round(p * 100)}%`;
      this.tierBar.classList.toggle('at-top', p >= 1);
    }
    // Observer mode used to be excluded here because its clock could not be
    // stopped. It can now, and a stopped clock says so wherever it happens.
    this.civicBar.classList.toggle('lcd-halt', g.speed === 0);
    this.syncPromotionMark();
    for (const b of this.civicBar.querySelectorAll<HTMLElement>('.speed-btn')) {
      b.classList.toggle('active', Number(b.dataset.speed) === g.speed);
    }
    const alertBtn = this.barRight.querySelector<HTMLElement>('.alert-btn');
    if (alertBtn) {
      alertBtn.classList.toggle('has-unread', this.unreadAlerts > 0);
      const lbl = alertBtn.querySelector('.sys-text');
      if (lbl) lbl.textContent = this.unreadAlerts > 0 ? `Alerts ${this.unreadAlerts}` : 'Alerts';
    }
    const ovr = this.barRight.querySelector<HTMLElement>('.override-btn');
    if (ovr) ovr.classList.toggle('degraded', g.asi.phase >= 3);
    // With Alerts folded into the hamburger, the hamburger carries its unread
    // mark — otherwise the one thing a compact bar most needs to tell you is
    // the one thing hidden behind a tap.
    const menuBtn = this.barRight.querySelector<HTMLElement>('[data-panel="menu"]');
    if (menuBtn) {
      menuBtn.classList.toggle('has-unread',
        this.unreadAlerts > 0 && (this.barRight.querySelector<HTMLElement>('.alert-btn')?.offsetParent ?? null) === null);
    }

    // Indicators -----------------------------------------------------------
    const ind = document.getElementById('indicators-body');
    if (ind) {
      const items: PanelItem[] = [];
      const header = (key: string, label: string, explain?: string, reading?: string) =>
        items.push({ kind: 'block', key, className: 'cat-label', html: label, explain, reading });
      // A 0..100 row. Every metric on this panel is a bar with a definition
      // behind it — nothing is left as a bare number the player must infer.
      const row = (key: string, label: string, v: number, opts?: { reading?: string; extra?: string; invert?: boolean; extraClass?: string }) => {
        const pct = Math.max(0, Math.min(100, v));
        const good = opts?.invert ? 100 - pct : pct;
        const cls = good < 30 ? 'bar-bad' : good < 55 ? 'bar-mid' : 'bar-good';
        // Phase 4+: negative bars are quietly re-colored soothing blue.
        items.push({
          kind: 'row', key, label, pct, explain: key,
          cls: g.asi.phase >= 4 ? 'bar-calm' : cls,
          value: opts?.extra ?? String(Math.round(pct)),
          reading: opts?.reading, extraClass: opts?.extraClass,
        });
      };

      // Treasury first. Every other panel on this list explains a number the
      // bar already shows; until now the one number the player watches most
      // closely — the balance — was the only one with nothing behind it.
      items.push({
        kind: 'block', key: 'h.treasury', className: 'cat-label', html: 'Treasury',
        explain: 'capital',
        reading: `Last month: §${money(g.lastIncome)} in, §${money(g.lastOutgoings)} out`,
      });
      items.push({
        kind: 'block', key: 'treasury.ledger', className: 'ledger', html: this.ledgerHtml(),
      });

      header('h.qol', 'Quality of Life');
      const rows: Array<[string, string, number]> = [
        ['convenience', 'Convenience', g.indicators.convenience],
        ['trust', 'Trust', g.indicators.trust],
        ['agency', statLabel(g, 'Agency'), g.indicators.agency],
        ['security', 'Security', g.indicators.security],
        ['connection', 'Connection', g.indicators.connection],
        ['health', 'Health', g.indicators.health],
        ['futureConfidence', 'Future Confidence', g.indicators.futureConfidence],
      ];
      for (const [key, label, v] of rows) row(key, label, v, { reading: `${Math.round(v)} of 100` });

      // Attractiveness breakdown: growth should never be a number that
      // simply happens.
      const att = g.attractiveness;
      const queue = Math.max(0, Math.round(g.migrationDemand - g.population));
      items.push({
        kind: 'block', key: 'h.att', className: 'att-header',
        html: `Attractiveness <b>${Math.round(att.overall * 100)}</b>`,
        explain: 'appeal', reading: `Migration queue ${queue.toLocaleString()} waiting`,
      });
      const attRows: Array<[string, string, number]> = [
        ['att.jobs', 'Jobs', att.jobs], ['att.housing', 'Housing', att.housing],
        ['att.amenities', 'Amenities', att.amenities], ['att.services', 'Services', att.services],
        ['att.environment', 'Environment', att.environment], ['att.safety', 'Safety', att.safety],
        ['att.cost', 'Affordability', att.cost],
      ];
      for (const [key, label, v] of attRows) {
        const pct = Math.round(v * 100);
        row(key, label, pct, { reading: `${pct} of 100`, extraClass: 'att-row' });
      }

      // Pressures: what the region is carrying. These were plain text before,
      // which made them easy to skip past — they are the numbers that end
      // administrations, so they get the same bars as everything else.
      const calm4 = g.asi.phase >= 4;
      const shortagePct = Math.round(g.housingShortage * 100);
      const pollPct = Math.min(100, Math.round(g.pollutionAvg * 200));
      const expertisePct = Math.round(g.humanExpertise * 100);
      const influencePct = Math.round(g.corporateInfluence * 100);
      header('h.press', 'Pressures');
      row('housingShortage', statLabel(g, 'Housing Shortage'), shortagePct, {
        invert: true,
        extra: calm4 ? '—' : `${shortagePct}%`,
        reading: `${queue.toLocaleString()} would-be residents waiting for a home`,
      });
      row('pollution', statLabel(g, 'Pollution'), pollPct, {
        invert: true,
        extra: calm4 ? '—' : `${pollPct}%`,
        reading: 'Average across settled tiles',
      });
      row('corporateInfluence', 'Corporate Influence', influencePct, {
        invert: true, extra: `${influencePct}%`,
        reading: `${influencePct}% of policy set outside the administration`,
      });
      row('humanExpertise', 'Human Expertise', expertisePct, {
        extra: `${expertisePct}%`, reading: `${expertisePct}% of skilled work still done by people`,
      });

      // Capacity: reserves and standards, each with the unit it is measured in.
      header('h.cap', 'Capacity &amp; Standards');
      const expect = Math.round(g.expectations);
      const conv = Math.round(g.indicators.convenience);
      const gap = expect - conv;
      row('expectations', 'Service Expectations', expect, {
        invert: gap > 0,
        extra: `${expect} / 100`,
        reading: `Expected ${expect} · delivered ${conv} — ` +
          (gap > 0 ? `${gap} short of what residents now consider normal` : 'meeting expectations'),
      });
      const dataPb = Math.round(g.resources.data);
      row('data', 'Data Reserves', Math.min(100, (dataPb / 4000) * 100), {
        extra: `${dataPb.toLocaleString()} PB`,
        reading: `${dataPb.toLocaleString()} PB held · effects saturate around 4,000 PB`,
      });
      const unemployedNow = Math.max(0, g.labourForce - g.jobsFilled);
      const shortageNow = g.jobVacancies > 0 && unemployedNow === 0;
      row('labour', shortageNow ? statLabel(g, 'Vacancies') : statLabel(g, 'Unemployment'),
        shortageNow ? Math.min(100, (g.jobVacancies / Math.max(1, g.jobsTotal)) * 100) : Math.round(g.unemployment * 100), {
          invert: true,
          extra: calm4 ? '—' : shortageNow ? g.jobVacancies.toLocaleString() : `${Math.round(g.unemployment * 100)}%`,
          reading: `Labour force ${g.labourForce.toLocaleString()} · posts ${g.jobsTotal.toLocaleString()} · filled ${g.jobsFilled.toLocaleString()}` +
            (shortageNow ? `<br>${g.jobVacancies.toLocaleString()} post${g.jobVacancies === 1 ? '' : 's'} unfilled` : `<br>${unemployedNow.toLocaleString()} without work`),
        });
      items.push({
        kind: 'block', key: 'note.region', className: 'ind-extra',
        html: `Region class: ${tierOf(g.population).name} · population ${g.population.toLocaleString()}`,
      });
      this.syncRows(ind, items);
    }
    // Politics tab -------------------------------------------------------
    const pol = document.getElementById('politics-body');
    if (pol) {
      const calm = g.asi.phase >= 4;
      const electionLabel = calm ? 'Preference collection' : 'Election';
      const ticksLeft = Math.max(0, g.nextElectionTick - g.tick);
      const approval = Math.round(weightedApproval(g));
      const stageName = calm && g.resistanceStage > 0 ? 'Civic Engagement (elevated)' : RESISTANCE_STAGES[g.resistanceStage];
      let html = `<div class="pol-summary">
        <span data-explain="election" data-reading="Weighted support ${approval}% — below 50% removes you from office">${electionLabel} in <b>${Math.floor(ticksLeft / 12)}y ${ticksLeft % 12}m</b> · weighted support <b>${approval}%</b></span><br>
        ${g.lastElectionResult ? `<small>Last result: ${g.lastElectionResult}</small><br>` : ''}
        <span data-explain="resistance" data-reading="Stage ${g.resistanceStage} of ${RESISTANCE_STAGES.length - 1}">${statLabel(g, 'Protest Activity')}: <b>${stageName}</b></span></div>`;
      html += '<div class="cat-label" data-explain="groups">Population Groups</div>';
      for (const id of GROUP_ORDER) {
        const grp = g.groups[id];
        const v = grp.approval;
        const cls = calm ? 'bar-calm' : v < 30 ? 'bar-bad' : v < 55 ? 'bar-mid' : 'bar-good';
        html += `<div class="ind-row" title="${GROUP_DEFS[id].desc}"><span>${GROUP_DEFS[id].name} <small>${Math.round(grp.share * 100)}%</small></span><div class="bar"><div class="fill ${cls}" style="width:${Math.round(v)}%"></div></div><span class="ind-val">${Math.round(v)}</span></div>`;
      }
      html += '<div class="cat-label" data-explain="corps">Corporate Actors</div>';
      for (const id of CORP_ORDER) {
        const corp = g.corps[id];
        const moodTxt = calm ? 'aligned' : corp.mood < 30 ? 'hostile' : corp.mood < 55 ? 'wary' : 'invested';
        html += `<div class="ind-row" title="${CORP_DEFS[id].sector}"><span>${CORP_DEFS[id].name} <small>${moodTxt}</small></span><div class="bar"><div class="fill ${calm ? 'bar-calm' : 'bar-corp'}" style="width:${Math.round(corp.presence * 100)}%"></div></div><span class="ind-val">${Math.round(corp.presence * 100)}</span></div>`;
      }
      pol.innerHTML = html;
    }

    this.syncAllocDisplays();
    this.syncPolicyButtons();

    // Notifications --------------------------------------------------------
    this.syncBarHeight();
    this.syncAlerts();
    // Keep an open build flyout current without rebuilding it: recreating the
    // cards every refresh would yank them out from under the cursor.
    this.syncBuildFlyout();

    // Reports (elections, reclassifications) take priority over events -----
    if (g.pendingReport && this.modal.classList.contains('hidden')) {
      const rep = g.pendingReport;
      this.autoPause();
      // One report in the game is good news. It gets its own sound, its own
      // treatment, and a mark on the class field so the change is legible in
      // the console after the dialog is gone.
      if (rep.fanfare) { this.sound?.promotion(); this.markPromotion(); }
      // A demotion puts the mark out. Nothing else can arrive between the two
      // in a real game, but a lit class field over "population decline has
      // moved the region down a class" would be the console contradicting the
      // dialog in front of it.
      else { this.sound?.systemTone(); this.promotedUntil = 0; this.syncPromotionMark(); }
      this.showModal(rep.title, rep.body, [
        { label: rep.fanfare ? 'Continue' : 'Acknowledge', action: () => { g.pendingReport = null; this.autoResume(); } },
      ], -1, rep.fanfare ? 'promotion' : '');
    }

    // Events ---------------------------------------------------------------
    // Never put a decision in front of someone with no authority to take it.
    // The phase-6 transition withdraws whatever was on the desk, but this guard
    // is the one that has to hold: a save written mid-decision, a state loaded
    // straight into observation, anything that arrives here without passing
    // through that transition. Every choice on an event is an administrative
    // act, and there is no version of this dialog that isn't a dead end.
    if (g.asi.observer) g.pendingEvent = null;
    if (g.pendingEvent && this.modal.classList.contains('hidden')) {
      const e = g.pendingEvent;
      this.sound?.eventChime();
      this.autoPause();
      // Phase 4+: the system pre-selects what it considers the right answer.
      const rec = g.asi.phase >= 4 ? 0 : -1;
      this.showModal(e.title, e.body, e.choices.map((c, i) => ({
        label: this.choiceLabelWithImpact(e, c.label, i, rec === i),
        action: () => { resolveEvent(g, i); this.autoResume(); },
      })), rec);
    }

    // Conventional game over ----------------------------------------------
    if (g.gameOver && !g.asi.observer && this.modal.classList.contains('hidden') && !document.body.classList.contains('ended')) {
      document.body.classList.add('ended');
      this.showModal('Administration Terminated', g.gameOver, [
        { label: 'Review Historical Decisions', action: () => { document.body.classList.remove('ended'); this.showHistory(); } },
        { label: 'Begin New Simulation', action: () => this.showScenarioPicker() },
        { label: 'Return to Main Menu', action: () => this.onSession({ kind: 'menu' }) },
      ]);
    }
  }

  private enterObserverMode(): void {
    this.tool = { kind: 'none' };
    this.syncToolButtons();
    this.closeInspector();
    // A decision already on screen when the takeover lands. Clearing the state
    // is not enough — the dialog was drawn before the state changed, and would
    // sit there asking a question its owner no longer has the standing to
    // answer. Anything open at this moment is an event or a report, and both
    // are moot the instant the administration ends.
    this.modal.classList.add('hidden');
    // Segmented rather than one string: on a phone the full readout is wider
    // than the screen and gets clipped at *both* ends, which loses the two
    // clauses that actually say what happened. The reassurances drop first.
    this.observerTicker.innerHTML = [
      ['tick-pad', 'CONTINUITY: STABLE'],
      ['tick-pad', 'EFFICIENCY: OPTIMAL'],
      ['tick-pad', 'COMPLAINTS: MINIMAL'],
      ['', 'ADMINISTRATIVE INPUT: SUSPENDED'],
      ['', 'MODE: OBSERVATION'],
    ].map(([cls, text]) => `<span class="tick-seg ${cls}">${text}</span>`).join('');
    this.observerTicker.classList.remove('hidden');
    this.rebuildMenuPanel();
    this.observerOverlay.classList.remove('hidden');
    this.observerOverlay.innerHTML = `
      <div class="observer-banner">
        <h1>Optimization complete.</h1>
        <p>Human intervention is no longer necessary.</p>
        <p class="observer-note">The console remains available for monitoring. Everything else is
        handled.</p>
        <div class="observer-actions">
          <button id="obs-continue">Continue Observation</button>
          <button id="obs-history">Review Historical Decisions</button>
          <button id="obs-restart">Begin New Simulation</button>
          <button id="obs-menu">Return to Main Menu</button>
        </div>
      </div>`;
    (this.observerOverlay.querySelector('#obs-continue') as HTMLElement).onclick = () => {
      this.observerOverlay.classList.add('dismissed');
    };
    (this.observerOverlay.querySelector('#obs-history') as HTMLElement).onclick = () => {
      this.observerOverlay.classList.add('dismissed');
      this.showHistory();
    };
    (this.observerOverlay.querySelector('#obs-restart') as HTMLElement).onclick = () => {
      this.observerOverlay.classList.add('dismissed');
      this.showScenarioPicker();
    };
    (this.observerOverlay.querySelector('#obs-menu') as HTMLElement).onclick = () =>
      this.onSession({ kind: 'menu' });
  }
}
