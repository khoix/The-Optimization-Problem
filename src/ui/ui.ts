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
import { AUTO_SLOT, MANUAL_SLOT, peek, saveTo } from '../game/save';
import { tierOf, tierProgress, buildingCondition, cashflow, demolishBuilding, demolitionRefund, NET_WINDOW } from '../game/sim';
import { ROAD_DEFS } from '../game/network';
import { INTRO_BODY, INTRO_TITLE } from '../game/tutorial';
import { CORP_DEFS, CORP_ORDER, GROUP_DEFS, GROUP_ORDER, RESISTANCE_STAGES, weightedApproval } from '../game/politics';
import type { Soundscape } from '../audio/soundscape';
import type { OverlayId, XrayKey } from '../render/renderer';
import { SCENARIOS, SCENARIO_ORDER, type ScenarioId } from '../game/scenarios';
import { previewChoice } from '../game/preview';
import { EXPLAIN } from './explain';
import { DEFAULT_PREFS, loadPrefs, savePrefs, type Prefs } from './prefs';
import { Guide } from './guide';

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingType } | { kind: 'demolish' };

/**
 * A request to put a different region on screen. The UI names what it wants;
 * main.ts owns how it happens, because it holds the state everything else
 * points at.
 */
export type SessionRequest =
  | { kind: 'menu' }
  | { kind: 'load'; slot: string }
  | { kind: 'new'; scenario: ScenarioId };

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

/** How long a toast lingers, in real milliseconds — louder alerts stay longer. */
const TOAST_MS: Record<Severity, number> = { low: 5500, medium: 9000, high: 15000 };
const SEV_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2 };
/** Above this many at once, the quiet ones give way. */
const MAX_TOASTS = 4;

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
  private hoverCard!: HTMLElement;
  private hoverHtml = '';
  private hoverSize: [number, number] = [190, 60];
  private explainCard!: HTMLElement;
  /** A touch tap holds the explanation open; a hover does not. */
  private explainPinned = false;
  private observerOverlay!: HTMLElement;
  private titleScreen!: HTMLElement;
  private consoleRow!: HTMLElement;
  private vitalsDock!: HTMLElement;
  private shownNotifications = 0;
  private lastPhase = -1;
  private lastBuildMenuKey = '';
  private allocDragging = false;
  private resumeSpeed: 0 | 1 | 2 | 3 | null = null;
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
    ([['⏸', 0], ['▶', 1], ['▶▶', 2], ['▶▶▶', 3]] as Array<[string, 0 | 1 | 2 | 3]>).forEach(([label, sp]) => {
      const b = el('button', 'speed-btn', label);
      b.dataset.speed = String(sp);
      b.title = ['Pause', 'Normal speed', 'Fast', 'Fastest'][sp];
      b.onclick = () => {
        if (sp === 0 && !pauseAllowed(this.g)) {
          this.flashSystemNote('Pause request received. Simulation continuity has been prioritized.');
          return;
        }
        this.onSpeed(sp);
      };
      spd.append(b);
    });
    console_.append(lcd, spd);

    // ---- right: alerts and system authority, one row, never stacked ----
    const alertsBtn = el('button', 'sys-btn alert-btn');
    alertsBtn.innerHTML = '<span class="sys-ico">🔔</span><span class="sys-text">Alerts</span>';
    alertsBtn.dataset.panel = 'alerts';
    alertsBtn.title = `Alerts (${ACTION_KEYS.alerts})`;
    alertsBtn.onclick = () => this.togglePanel('alerts');
    const overrideBtn = el('button', 'sys-btn override-btn');
    overrideBtn.innerHTML = '<span class="sys-ico">⚠</span><span class="sys-text">Override</span>';
    overrideBtn.title = `Manual Override (${ACTION_KEYS.override}) — emergency administrative authority.`;
    overrideBtn.onclick = () => this.manualOverride();
    // Save, load, new, main menu and settings all live in the hamburger now.
    // Sound moved into Settings with the rest of the preferences; a dedicated
    // mute button on the bar was the last of the one-off controls.
    const menuBtn = el('button', 'sys-btn');
    menuBtn.innerHTML = '<span class="sys-ico">☰</span>';
    menuBtn.title = `Menu (${ACTION_KEYS.menu})`;
    menuBtn.dataset.panel = 'menu';
    menuBtn.onclick = () => this.togglePanel('menu');
    const collapseBtn = el('button', 'sys-btn collapse-btn');
    collapseBtn.title = 'Collapse the bar (Tab)';
    collapseBtn.onclick = () => this.toggleCollapse();
    this.barRight.append(alertsBtn, overrideBtn, menuBtn, collapseBtn);

    // Row 2: vitals | console | system, with the console genuinely centred.
    const consoleRow = el('div', 'bar-row bar-row-console');
    consoleRow.append(this.vitals, console_, this.barRight);
    this.consoleRow = consoleRow;
    this.civicBar.append(this.toolRow, consoleRow);
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
      btn.innerHTML = `<span class="sys-ico">${this.collapsed ? '▲' : '▼'}</span>`;
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
    const auto = peek(AUTO_SLOT);
    const year = auto ? Math.floor(auto.tick / 12) + 1 : 0;
    // A finished administration is not something to "continue" — saying so
    // would send the player straight back into the modal they just left.
    const resumeLabel = !auto ? null
      : auto.locked ? `Continue Observation — Year ${year}`
      : auto.ended ? `Review Final State — Year ${year}`
      : `Continue — Year ${year}, population ${auto.population.toLocaleString()}`;
    // Continue is the autosave; Load reaches every slot, including a manual
    // save made before an autosave overwrote the run the player wanted back.
    const hasSaves = [MANUAL_SLOT, AUTO_SLOT].some((sl) => peek(sl) !== null);
    this.titleScreen.classList.remove('hidden');
    document.body.classList.add('at-title');
    this.titleScreen.innerHTML = `
      <div class="title-card">
        <h1>The Optimization Problem</h1>
        <p class="title-tag">Every decision is reasonable.<br><span>That is the problem.</span></p>
        <p class="title-what">Govern a growing region — housing, power, water, work, and
          the computing infrastructure everyone keeps asking you to approve.</p>
        <div class="title-actions">
          ${resumeLabel ? `<button id="t-continue" class="title-btn primary">${resumeLabel}</button>` : ''}
          ${hasSaves ? '<button id="t-load" class="title-btn">Load Save</button>' : ''}
          <button id="t-new" class="title-btn${resumeLabel ? '' : ' primary'}">Begin New Simulation</button>
          <button id="t-how" class="title-btn">How to Play</button>
          <button id="t-settings" class="title-btn">Settings</button>
        </div>
        ${resumeLabel || hasSaves ? '' :
          '<p class="title-hint">New here? <b>How to Play</b> is a short walk through the region before you take it on.</p>'}
        ${auto?.locked ? '<p class="title-note">The saved administration ended in observer mode. It can be watched, but not resumed.</p>' : ''}
        ${auto?.ended ? '<p class="title-note">The saved administration was terminated. It can be reviewed, but not continued.</p>' : ''}
      </div>`;
    const on = (id: string, fn: () => void) => {
      const b = this.titleScreen.querySelector<HTMLElement>(id);
      if (b) b.onclick = fn;
    };
    on('#t-continue', () => this.onSession({ kind: 'load', slot: AUTO_SLOT }));
    on('#t-load', () => this.showLoadMenu(true));
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
    this.selectedBuildingId = null;
    this.overlay = null;
    this.resumeSpeed = null;
    this.allocDragging = false;

    this.titleScreen.classList.add('hidden');
    this.modal.classList.add('hidden');
    this.inspector.classList.add('hidden');
    this.hoverCard.classList.add('hidden');
    this.hoverHtml = '';
    this.observerOverlay.classList.add('hidden');
    this.observerOverlay.classList.remove('dismissed');
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

  /** The hamburger: everything that isn't playing the game. */
  private buildMenuPanel(host: HTMLElement): void {
    const items: Array<[string, string, () => void]> = [
      ['💾', 'Save Game', () => {
        if (this.g.asi.phase >= 5) {
          this.flashSystemNote('State persistence is managed automatically.');
          return;
        }
        this.flashSystemNote(saveTo(MANUAL_SLOT, this.g) ? 'Game saved.' : 'Save failed — storage unavailable.');
      }],
      ['📂', 'Load Game', () => this.showLoadMenu()],
      ['✦', 'New Simulation', () => this.showScenarioPicker()],
      ['❓', 'How to Play', () => this.showHowTo()],
      ['⚙', 'Settings', () => this.showSettings()],
      ['☰', 'Main Menu', () => this.confirmMainMenu()],
    ];
    for (const [icon, label, action] of items) {
      const b = el('button', 'menu-item');
      b.innerHTML = `<span class="menu-ico">${icon}</span><span>${label}</span>`;
      b.onclick = () => { this.closePanel(); action(); };
      host.append(b);
    }
  }

  /**
   * Leaving for the menu discards anything since the last save, so ask first.
   * The autosave only writes once a year, which is a long way to fall.
   */
  private confirmMainMenu(): void {
    const saved = peek(MANUAL_SLOT);
    const when = saved ? `Last manual save: Year ${Math.floor(saved.tick / 12) + 1}.` : 'There is no manual save.';
    this.showModal('Return to Main Menu',
      `Progress since the last save will be lost. ${when}`, [
        {
          label: 'Save and Exit',
          action: () => {
            saveTo(MANUAL_SLOT, this.g);
            saveTo(AUTO_SLOT, this.g);
            this.onSession({ kind: 'menu' });
          },
        },
        { label: 'Exit Without Saving', action: () => this.onSession({ kind: 'menu' }) },
        { label: 'Cancel', action: () => {} },
      ]);
  }

  /** The New Game dialog: always a scenario choice, never a silent restart. */
  showScenarioPicker(fromTitle = false): void {
    this.showModal('Begin New Simulation',
      'Choose a region. Each has its own terrain, economy, politics — and its own shape of the problem. The autosave will be overwritten as the new game progresses.',
      [
        ...SCENARIO_ORDER.map((id) => ({
          label: `${SCENARIOS[id].name} — ${SCENARIOS[id].desc}`,
          action: () => this.onSession({ kind: 'new', scenario: id }),
        })),
        // Cancelling out of the picker must not strand the player on a blank
        // map: if the title screen sent them here, the title screen gets them back.
        { label: fromTitle ? 'Back' : 'Cancel', action: () => { if (fromTitle) this.showTitle(); } },
      ]);
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
      this.selectedBuildingId = null;
      this.inspector.classList.add('hidden');
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
      { id: 'transit', icon: '🛣', label: 'Roads', types: avail((t) => BUILDING_DEFS[t].roadType !== undefined) },
      { id: 'zoning', icon: '🏘', label: 'Housing', types: avail(cat('zone')) },
      { id: 'power', icon: '⚡', label: 'Power', types: avail((t) => cat('power')(t) && BUILDING_DEFS[t].power > 0) },
      { id: 'water', icon: '💧', label: 'Water', types: avail((t) => cat('power')(t) && BUILDING_DEFS[t].water > 0) },
      { id: 'compute', icon: '▣', label: 'Data Centers', types: avail(cat('compute')) },
      { id: 'services', icon: '✚', label: 'Services', types: avail((t) => cat('civic')(t) && BUILDING_DEFS[t].roadType === undefined).concat(avail((t) => cat('amenity')(t) && (BUILDING_DEFS[t].services ?? 0) >= 0.7)) },
      { id: 'environment', icon: '🌳', label: 'Parks', types: avail((t) => cat('amenity')(t) && (BUILDING_DEFS[t].services ?? 0) < 0.7) },
      { id: 'economy', icon: '🏭', label: 'Economy', types: avail(cat('industry')) },
    ];
  }

  private renderToolbelt(): void {
    const g = this.g;
    this.toolbelt.innerHTML = '';
    for (const c of this.hudCategories()) {
      if (c.types.length === 0) continue;
      const btn = el('button', 'bar-tool');
      btn.innerHTML = `<span class="tool-ico">${c.icon}</span><span class="tool-label">${c.label}</span>` +
        keyBadge(PANEL_KEYS[c.id]);
      btn.dataset.panel = c.id;
      btn.onclick = () => this.togglePanel(c.id);
      this.toolbelt.append(btn);
    }
    const sep = el('div', 'bar-sep');
    this.toolbelt.append(sep);
    for (const [id, icon, label] of [
      ['indicators', '📊', 'Indicators'], ['layers', '◈', 'Layers'],
      ['compute_alloc', '⚙', 'Compute'],
      ['policies', '§', 'Policies'], ['politics', '🗳', 'Politics'],
    ] as Array<[string, string, string]>) {
      const btn = el('button', 'bar-tool');
      btn.innerHTML = `<span class="tool-ico">${icon}</span><span class="tool-label">${label}</span>` +
        keyBadge(PANEL_KEYS[id]);
      btn.dataset.panel = id;
      btn.onclick = () => this.togglePanel(id);
      this.toolbelt.append(btn);
    }
    // Demolish sits outside the scrolling belt, pinned right, with a hidden
    // twin on the left keeping the centred group honestly centred.
    this.toolRow.querySelectorAll('.tool-spacer, .demolish').forEach((n) => n.remove());
    const demo = el('button', 'bar-tool demolish');
    demo.innerHTML = '<span class="tool-ico">⛏</span><span class="tool-label">Demolish</span>' +
      keyBadge(ACTION_KEYS.demolish);
    demo.onclick = () => {
      this.closePanel();
      this.tool = this.tool.kind === 'demolish' ? { kind: 'none' } : { kind: 'demolish' };
      this.syncToolButtons();
    };
    const spacer = el('div', 'bar-tool tool-spacer');
    spacer.innerHTML = '<span class="tool-ico">⛏</span><span class="tool-label">Demolish</span>' +
      keyBadge(ACTION_KEYS.demolish);
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
    const grid = el('div', 'build-grid');
    let n = 0;
    for (const t of c.types) {
      const def = BUILDING_DEFS[t];
      const locked = def.unlockTier != null && tier < def.unlockTier;
      const affordable = g.resources.capital >= def.cost;
      const btn = el('button', 'build-card' + (locked ? ' locked' : '') + (!affordable && !locked ? ' unaffordable' : ''));
      const stats: string[] = [];
      if (def.housing) stats.push(`🏠${def.housing}`);
      if (def.jobs) stats.push(`👤${def.jobs}`);
      if (def.power) stats.push(`⚡${def.power > 0 ? '+' : ''}${def.power}`);
      if (def.water) stats.push(`💧${def.water > 0 ? '+' : ''}${def.water}`);
      if (def.compute) stats.push(`▣+${def.compute}`);
      if (def.serviceRadius) stats.push(`◎${def.serviceRadius}`);
      if (def.amenity) stats.push(`★${def.amenity}`);
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
        if (locked) {
          this.sound?.refused();
          this.flashSystemNote(`${def.name} requires region class: ${TIER_NAMES[def.unlockTier!]}.`);
          return;
        }
        this.sound?.uiTick();
        this.selectedBuildingId = null;
        this.inspector.classList.add('hidden');
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
    const btn = this.civicBar.querySelector<HTMLElement>(`[data-panel="${id}"]`);
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
    if (this.g.asi.observer) return false;

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
    // can pick something they can actually afford to build.
    if (!card.classList.contains('locked')) this.closePanel();
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
    this.syncBarHeight();
  }

  showSettings(): void {
    const rows: Array<{ key: keyof Prefs; label: string; desc: string; options?: Array<[string, string]> }> = [
      { key: 'autoPauseOnDecision', label: 'Pause on decisions', desc: 'Stop the clock when a decision or report arrives.' },
      { key: 'toasts', label: 'Alert pop-ups', desc: 'Transient alerts over the map. The Alerts panel keeps everything either way.' },
      { key: 'sound', label: 'Sound', desc: 'Ambient soundscape and interface tones.' },
      { key: 'reducedMotion', label: 'Reduced motion', desc: 'Suppress interface animation beyond the system setting.' },
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
    if (this.toasts.size >= MAX_TOASTS) {
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

  private syncToolButtons(): void {
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
    if (g.asi.observer) {
      this.showModal('Manual Override', 'Administrative input has been suspended. This control is retained for continuity of interface.', [{ label: 'Acknowledge', action: () => {} }]);
      return;
    }
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
        const text = el('div', 'policy-text', `<b>${def.name}</b><br><small>${def.desc}</small>`);
        row.append(btn, text);
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
      btn.classList.toggle('on', this.g.policies.has(id));
      btn.textContent = this.g.policies.has(id) ? 'ON' : 'OFF';
    }
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
    if (b.progress >= 1 && cond < 0.98) {
      const renovateCost = Math.round(def.cost * 0.35);
      const ren = el('button', 'small-btn', `Renovate (§${renovateCost})`);
      ren.onclick = () => {
        if (g.asi.observer) return;
        if (g.resources.capital < renovateCost) { this.flashSystemNote('Insufficient capital.'); return; }
        g.resources.capital -= renovateCost;
        b.age = 0;
        record(g, 'build', `Renovated ${def.name}.`);
        this.showInspector(buildingId);
      };
      row.append(ren);
    }
    const demo = el('button', 'small-btn', `Demolish · +§${demolitionRefund(b)}`);
    demo.onclick = () => this.requestDemolish(buildingId);
    const close = el('button', 'small-btn', 'Close');
    close.onclick = () => { this.selectedBuildingId = null; this.inspector.classList.add('hidden'); };
    row.append(demo, close);
    this.inspector.append(row);
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
    const finish = () => {
      demolishBuilding(g, buildingId);
      this.sound?.demolished();
      record(g, 'demolish', `Demolished ${def.name}.`);
      this.flashSystemNote(`${def.name} demolished. §${refund} recovered.`);
      this.selectedBuildingId = null;
      this.inspector.classList.add('hidden');
    };
    if (def.cost < CONFIRM_DEMOLITION_ABOVE) { finish(); return; }
    this.showModal('Confirm Demolition',
      `Demolish the ${def.name}? It cost §${def.cost.toLocaleString()} to build and ` +
      `§${refund.toLocaleString()} comes back. Anything it was supplying loses it this month.`,
      [{ label: `Demolish · +§${refund}`, action: finish }, { label: 'Cancel', action: () => {} }]);
  }

  // ------------------------------------------------------------ modal & events
  private showModal(title: string, bodyHtml: string, choices: Array<{ label: string; action: () => void }>, recommendedIndex = -1): void {
    this.modal.classList.remove('hidden');
    this.modal.innerHTML = '';
    const box = el('div', 'modal-box');
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

  showLoadMenu(fromTitle = false): void {
    const slots: Array<{ slot: string; label: string }> = [];
    for (const [slot, name] of [[MANUAL_SLOT, 'Manual save'], [AUTO_SLOT, 'Autosave']] as const) {
      const env = peek(slot);
      if (!env) continue;
      const when = new Date(env.savedAt).toLocaleString();
      const year = Math.floor(env.tick / 12) + 1;
      const lock = env.locked ? ' — OBSERVER (permanently locked)'
        : env.ended ? ' — administration terminated' : '';
      slots.push({ slot, label: `${name} · Year ${year} · pop ${env.population} · ${when}${lock}` });
    }
    if (slots.length === 0) {
      this.showModal('Load Game', 'No saved games found.', [
        { label: fromTitle ? 'Back' : 'Close', action: () => { if (fromTitle) this.showTitle(); } },
      ]);
      return;
    }
    this.showModal('Load Game',
      fromTitle ? 'Pick a save to resume.' : 'Loading replaces the current session.', [
        ...slots.map((s) => ({ label: s.label, action: () => this.onSession({ kind: 'load', slot: s.slot }) })),
        { label: fromTitle ? 'Back' : 'Cancel', action: () => { if (fromTitle) this.showTitle(); } },
      ]);
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
      [{ label: 'Close', action: () => { if (g.asi.observer) this.observerOverlay.classList.remove('dismissed'); } }]);
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
      this.onSpeed(0);
    } else {
      this.resumeSpeed = null;
    }
  }

  private autoResume(): void {
    if (this.resumeSpeed != null && this.g.speed === 0 && !this.g.asi.observer && !this.g.gameOver) {
      this.onSpeed(this.resumeSpeed);
    }
    this.resumeSpeed = null;
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
    const px = Math.min(sx + 16, window.innerWidth - w - 8);
    const py = Math.min(sy + 16, window.innerHeight - h - 120);
    this.hoverCard.style.transform = `translate3d(${Math.round(px)}px,${Math.round(py)}px,0)`;
  }

  /** A transient line of system chrome. Also how main.ts reports a bad save. */
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
          : flow.net > 0 ? `a surplus of ${Math.round(flow.frac * 100)}% of outgoings`
          : `a deficit of ${Math.round(-flow.frac * 100)}% of outgoings`) +
        `. Spending §${Math.round(flow.outgoings).toLocaleString()} a month.`;
    vital(primary, 'capital', '§',
      `<span class="vital-num ${capitalCls}">${Math.round(r.capital).toLocaleString()}<span class="vital-label-inline">Capital</span></span>` +
      `<span class="gauge gauge-rate"><span class="gauge-zero"></span>` +
      `<span class="gauge-fill ${rateCls}" style="left:${flow.net < 0 ? 50 - pct : 50}%;width:${pct}%"></span></span>`,
      `§${Math.round(r.capital).toLocaleString()} in the treasury. ${rateReading}`);
    gauge(primary, '⚡', 'power', r.powerDemand, r.powerCapacity, 'MW');
    gauge(primary, '💧', 'water', r.waterDemand, r.waterCapacity, 'ML');
    gauge(primary, '▣', 'compute', r.computeDemand, r.compute, 'PF');
    gauge(primary, '🏠', 'housing', g.population, housingCap);

    meter(secondary, '☺', 'trust', 'Trust', g.indicators.trust,
      { reading: `${Math.round(g.indicators.trust)} of 100` });
    meter(secondary, '✚', 'health', 'Health', g.indicators.health,
      { reading: `${Math.round(g.indicators.health)} of 100` });
    meter(secondary, '★', 'appeal', 'Appeal', g.attractiveness.overall * 100,
      { reading: `${Math.round(g.attractiveness.overall * 100)} of 100 · migration queue ${Math.max(0, Math.round(g.migrationDemand - g.population)).toLocaleString()}` });
    meter(secondary, '👥', 'labour', labourLabel, labourGauge,
      { invert: true, text: labourText, reading: labourReading });
    meter(secondary, '✊', 'unrest', unrestLabel, g.unrest * 100,
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
    this.civicBar.classList.toggle('lcd-halt', g.speed === 0 && !g.asi.observer);
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
      this.sound?.systemTone();
      this.showModal(rep.title, rep.body, [
        { label: 'Acknowledge', action: () => { g.pendingReport = null; this.autoResume(); } },
      ]);
    }

    // Events ---------------------------------------------------------------
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
    this.selectedBuildingId = null;
    this.inspector.classList.add('hidden');
    this.observerOverlay.classList.remove('hidden');
    this.observerOverlay.innerHTML = `
      <div class="observer-banner">
        <h1>Optimization complete.</h1>
        <p>Human intervention is no longer necessary.</p>
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
