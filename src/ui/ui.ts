// DOM-based HUD. Deliberately built as an ordinary dashboard — because in the
// late game the ASI starts remodeling it: renaming metrics, consolidating
// "redundant" indicators, removing controls, and finally fading the whole
// thing into observer mode.

import type { BuildingType, GameState, PolicyId } from '../game/types';
import { BUILDING_DEFS, BUILD_MENU_ORDER, TIER_NAMES } from '../game/buildings';
import { POLICY_CATEGORIES, POLICY_DEFS, POLICY_ORDER } from '../game/policies';
import { attemptShutdown, buildableTypes, canDemolish, filterAllocation, filterPolicyChange, pauseAllowed, statLabel } from '../game/asi';
import { removeBuilding, notify, record } from '../game/state';
import { resolveEvent } from '../game/events';
import { AUTO_SLOT, BOOT_FLAG, MANUAL_SLOT, peek, requestLoad, saveTo } from '../game/save';
import { tierOf, buildingCondition } from '../game/sim';
import { ROAD_DEFS } from '../game/network';
import { INTRO_BODY, INTRO_TITLE } from '../game/tutorial';
import { CORP_DEFS, CORP_ORDER, GROUP_DEFS, GROUP_ORDER, RESISTANCE_STAGES, weightedApproval } from '../game/politics';
import type { Soundscape } from '../audio/soundscape';
import { SCENARIOS, SCENARIO_ORDER } from '../game/scenarios';
import { previewChoice } from '../game/preview';

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingType } | { kind: 'demolish' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  sound: Soundscape | null = null;

  private root: HTMLElement;
  private civicBar!: HTMLElement;
  private vitals!: HTMLElement;
  private toolbelt!: HTMLElement;
  private toolRow!: HTMLElement;
  private barRight!: HTMLElement;
  private barStatus!: HTMLElement;
  private flyout!: HTMLElement;
  private flyoutBody!: HTMLElement;
  private flyoutTitle!: HTMLElement;
  private openPanel: string | null = null;
  private panelBodies: Record<string, HTMLElement> = {};
  private feed!: HTMLElement;
  private modal!: HTMLElement;
  private inspector!: HTMLElement;
  private hoverCard!: HTMLElement;
  private observerOverlay!: HTMLElement;
  private shownNotifications = 0;
  private lastPhase = -1;
  private lastBuildMenuKey = '';
  private allocDragging = false;
  private resumeSpeed: 0 | 1 | 2 | 3 | null = null;
  private unreadAlerts = 0;
  private collapsed = localStorage.getItem('top:barCollapsed') === '1';

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
    lcd.append(this.barStatus, el('div', 'lcd-glass'));
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
    alertsBtn.onclick = () => this.togglePanel('alerts');
    const overrideBtn = el('button', 'sys-btn override-btn');
    overrideBtn.innerHTML = '<span class="sys-ico">⚠</span><span class="sys-text">Override</span>';
    overrideBtn.title = 'Manual Override — emergency administrative authority.';
    overrideBtn.onclick = () => this.manualOverride();
    const saveBtn = el('button', 'sys-btn');
    saveBtn.innerHTML = '<span class="sys-ico">💾</span><span class="sys-text">Save</span>';
    saveBtn.title = 'Save game';
    saveBtn.onclick = () => {
      if (this.g.asi.phase >= 5) {
        this.flashSystemNote('State persistence is managed automatically.');
        return;
      }
      this.flashSystemNote(saveTo(MANUAL_SLOT, this.g) ? 'Game saved.' : 'Save failed — storage unavailable.');
    };
    const loadBtn = el('button', 'sys-btn');
    loadBtn.innerHTML = '<span class="sys-ico">📂</span><span class="sys-text">Load</span>';
    loadBtn.title = 'Load game';
    loadBtn.onclick = () => this.showLoadMenu();
    const newBtn = el('button', 'sys-btn');
    newBtn.innerHTML = '<span class="sys-ico">✦</span><span class="sys-text">New</span>';
    newBtn.title = 'Begin a new simulation';
    newBtn.onclick = () => this.showScenarioPicker();
    const muteBtn = el('button', 'sys-btn mute-btn');
    muteBtn.innerHTML = '<span class="sys-ico">🔊</span>';
    muteBtn.title = 'Mute';
    muteBtn.onclick = () => {
      const so = this.sound;
      if (!so) return;
      so.init();
      so.setEnabled(!so.enabled);
      const ico = muteBtn.querySelector('.sys-ico');
      if (ico) ico.textContent = so.enabled ? '🔊' : '🔇';
    };
    const collapseBtn = el('button', 'sys-btn collapse-btn');
    collapseBtn.title = 'Collapse the bar (Tab)';
    collapseBtn.onclick = () => this.toggleCollapse();
    this.barRight.append(alertsBtn, overrideBtn, saveBtn, loadBtn, newBtn, muteBtn, collapseBtn);

    // Row 2: vitals | console | system, with the console genuinely centred.
    const consoleRow = el('div', 'bar-row bar-row-console');
    consoleRow.append(this.vitals, console_, this.barRight);
    this.civicBar.append(this.toolRow, consoleRow);

    this.feed = el('div', 'feed');
    this.modal = el('div', 'modal hidden');
    this.inspector = el('div', 'panel inspector hidden');
    this.hoverCard = el('div', 'hover-card hidden');
    this.observerOverlay = el('div', 'observer-overlay hidden');
    this.root.append(this.flyout, this.civicBar, this.feed, this.inspector,
      this.hoverCard, this.modal, this.observerOverlay);

    this.renderToolbelt();
    this.buildSystemPanels();
    this.applyCollapse();
  }

  /** Collapse the bar to a single row when the map matters more than the tools. */
  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    localStorage.setItem('top:barCollapsed', this.collapsed ? '1' : '0');
    if (this.collapsed) this.closePanel();
    this.applyCollapse();
  }

  private applyCollapse(): void {
    this.civicBar.classList.toggle('collapsed', this.collapsed);
    document.body.classList.toggle('bar-collapsed', this.collapsed);
    const btn = this.civicBar.querySelector<HTMLElement>('.collapse-btn');
    if (btn) {
      btn.innerHTML = `<span class="sys-ico">${this.collapsed ? '▲' : '▼'}</span>`;
      btn.title = this.collapsed ? 'Expand the bar (Tab)' : 'Collapse the bar (Tab)';
    }
  }

  /** The New Game dialog: always a scenario choice, never a silent restart. */
  showScenarioPicker(): void {
    this.showModal('Begin New Simulation',
      'Choose a region. Each has its own terrain, economy, politics — and its own shape of the problem. The autosave will be overwritten as the new game progresses.',
      [
        ...SCENARIO_ORDER.map((id) => ({
          label: `${SCENARIOS[id].name} — ${SCENARIOS[id].desc}`,
          action: () => { localStorage.setItem(BOOT_FLAG, `new:${id}`); location.reload(); },
        })),
        { label: 'Cancel', action: () => {} },
      ]);
  }

  /**
   * Escape backs out one layer at a time: flyout, then inspector, then the
   * active build tool. Modals handle their own dismissal.
   */
  handleEscape(): void {
    if (!this.modal.classList.contains('hidden')) return;
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
      btn.innerHTML = `<span class="tool-ico">${c.icon}</span><span class="tool-label">${c.label}</span>`;
      btn.dataset.panel = c.id;
      btn.onclick = () => this.togglePanel(c.id);
      this.toolbelt.append(btn);
    }
    const sep = el('div', 'bar-sep');
    this.toolbelt.append(sep);
    for (const [id, icon, label] of [
      ['indicators', '📊', 'Indicators'], ['compute_alloc', '⚙', 'Compute'],
      ['policies', '§', 'Policies'], ['politics', '🗳', 'Politics'],
    ] as Array<[string, string, string]>) {
      const btn = el('button', 'bar-tool');
      btn.innerHTML = `<span class="tool-ico">${icon}</span><span class="tool-label">${label}</span>`;
      btn.dataset.panel = id;
      btn.onclick = () => this.togglePanel(id);
      this.toolbelt.append(btn);
    }
    // Demolish sits outside the scrolling belt, pinned right, with a hidden
    // twin on the left keeping the centred group honestly centred.
    this.toolRow.querySelectorAll('.tool-spacer, .demolish').forEach((n) => n.remove());
    const demo = el('button', 'bar-tool demolish');
    demo.innerHTML = '<span class="tool-ico">⛏</span><span class="tool-label">Demolish</span>';
    demo.onclick = () => {
      this.closePanel();
      this.tool = this.tool.kind === 'demolish' ? { kind: 'none' } : { kind: 'demolish' };
      this.syncToolButtons();
    };
    const spacer = el('div', 'bar-tool tool-spacer');
    spacer.innerHTML = '<span class="tool-ico">⛏</span><span class="tool-label">Demolish</span>';
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
      btn.innerHTML = `<span class="card-name">${def.name}</span>` +
        `<span class="card-cost">${locked ? TIER_NAMES[def.unlockTier!] : '§' + def.cost}</span>` +
        `<span class="card-stats">${stats.join(' ')}</span>` +
        `<span class="card-desc">${def.desc}</span>`;
      btn.dataset.type = t;
      btn.onclick = () => {
        if (locked) {
          this.flashSystemNote(`${def.name} requires region class: ${TIER_NAMES[def.unlockTier!]}.`);
          return;
        }
        this.selectedBuildingId = null;
        this.inspector.classList.add('hidden');
        this.tool = this.tool.kind === 'build' && this.tool.type === t ? { kind: 'none' } : { kind: 'build', type: t };
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
    this.openPanel = id;
    this.flyout.classList.remove('hidden');
    const buildCat = this.hudCategories().find((c) => c.id === id);
    const titles: Record<string, string> = {
      alerts: 'Alert Feed', indicators: 'Regional Indicators', compute_alloc: 'Compute Allocation',
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
      this.feed.scrollTop = this.feed.scrollHeight;
    } else {
      const body = this.panelBodies[id];
      if (body) this.flyoutBody.append(body);
    }
    this.syncToolButtons();
  }

  private closePanel(): void {
    if (this.openPanel === 'alerts') {
      this.feed.classList.remove('in-flyout');
      this.root.append(this.feed);
    }
    this.openPanel = null;
    this.flyout.classList.add('hidden');
    this.syncToolButtons();
  }

  private syncToolButtons(): void {
    for (const b of this.civicBar.querySelectorAll<HTMLElement>('.bar-tool')) {
      const panel = b.dataset.panel;
      b.classList.toggle('open', panel != null && panel === this.openPanel);
      b.classList.toggle('active', this.tool.kind === 'demolish' && b.classList.contains('demolish'));
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
      compute_alloc: el('div', 'panel-body'),
      policies: el('div', 'panel-body'),
      politics: el('div', 'panel-body'),
    };
    this.panelBodies = bodies;
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
    const demo = el('button', 'small-btn', 'Demolish');
    demo.onclick = () => {
      const check = canDemolish(g, buildingId);
      if (!check.ok) {
        this.showModal('Action Unavailable', check.reason ?? '', [{ label: 'Acknowledge', action: () => {} }]);
        return;
      }
      removeBuilding(g, buildingId);
      record(g, 'demolish', `Demolished ${def.name}.`);
      this.selectedBuildingId = null;
      this.inspector.classList.add('hidden');
    };
    const close = el('button', 'small-btn', 'Close');
    close.onclick = () => { this.selectedBuildingId = null; this.inspector.classList.add('hidden'); };
    row.append(demo, close);
    this.inspector.append(row);
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

  private showLoadMenu(): void {
    const slots: Array<{ slot: string; label: string }> = [];
    for (const [slot, name] of [[MANUAL_SLOT, 'Manual save'], [AUTO_SLOT, 'Autosave']] as const) {
      const env = peek(slot);
      if (!env) continue;
      const when = new Date(env.savedAt).toLocaleString();
      const year = Math.floor(env.tick / 12) + 1;
      const lock = env.locked ? ' — OBSERVER (permanently locked)' : '';
      slots.push({ slot, label: `${name} · Year ${year} · pop ${env.population} · ${when}${lock}` });
    }
    if (slots.length === 0) {
      this.showModal('Load Game', 'No saved games found.', [{ label: 'Close', action: () => {} }]);
      return;
    }
    this.showModal('Load Game', 'Loading replaces the current session.', [
      ...slots.map((s) => ({ label: s.label, action: () => requestLoad(s.slot) })),
      { label: 'Cancel', action: () => {} },
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
      html = `<div class="hc-title">${terrainName}</div>
        <div class="hc-stats">${buildable ? 'Buildable' : 'Not buildable'}${t.pollution > 0.04 ? ` · Pollution ${Math.round(t.pollution * 100)}%` : ''}</div>`;
    }
    this.hoverCard.innerHTML = html;
    this.hoverCard.classList.remove('hidden');
    // Keep the card on-screen and clear of the bar.
    const w = this.hoverCard.offsetWidth || 190, h = this.hoverCard.offsetHeight || 60;
    const px = Math.min(sx + 16, window.innerWidth - w - 8);
    const py = Math.min(sy + 16, window.innerHeight - h - 120);
    this.hoverCard.style.left = `${px}px`;
    this.hoverCard.style.top = `${py}px`;
  }

  private flashSystemNote(text: string): void {
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
    // ---- Vital signs: capacity at a glance ----
    // Each utility reads as a fill bar of demand against capacity, so strain
    // is visible before it becomes an outage.
    const gauge = (icon: string, label: string, used: number, cap: number, unit = '') => {
      const pct = cap > 0 ? Math.min(150, (used / cap) * 100) : (used > 0 ? 150 : 0);
      const cls = pct > 100 ? 'gauge-bad' : pct > 85 ? 'gauge-warn' : 'gauge-ok';
      const shown = hideNegatives ? 'gauge-calm' : cls;
      return `<div class="vital" title="${label}: ${Math.round(used)} of ${Math.round(cap)}${unit}">
        <span class="vital-ico">${icon}</span>
        <span class="vital-body">
          <span class="vital-num">${Math.round(used)}<span class="vital-cap">/${Math.round(cap)}</span></span>
          <span class="gauge"><span class="gauge-fill ${shown}" style="width:${Math.min(100, pct)}%"></span></span>
        </span></div>`;
    };
    // A 0..100 indicator rendered in the same visual language as the gauges,
    // so nothing in the bar reads as a bare number.
    const meter = (icon: string, label: string, value: number, opts?: { invert?: boolean; suffix?: string }) => {
      const v = Math.max(0, Math.min(100, value));
      const good = opts?.invert ? 100 - v : v;
      const cls = good < 30 ? 'gauge-bad' : good < 55 ? 'gauge-warn' : 'gauge-ok';
      const shown = hideNegatives ? 'gauge-calm' : cls;
      const text = hideNegatives && opts?.invert ? '—' : `${Math.round(v)}${opts?.suffix ?? ''}`;
      return `<div class="vital" title="${label}">
        <span class="vital-ico">${icon}</span>
        <span class="vital-body">
          <span class="vital-num">${text}<span class="vital-label-inline">${label}</span></span>
          <span class="gauge"><span class="gauge-fill ${shown}" style="width:${v}%"></span></span>
        </span></div>`;
    };
    const housingCap = [...g.buildings.values()]
      .filter((b) => b.progress >= 1 && b.active)
      .reduce((sum, b) => sum + BUILDING_DEFS[b.type].housing, 0);
    const capitalCls = r.capital < 0 ? 'bad' : '';
    // Primary row survives collapse; secondary row is the first thing hidden.
    this.vitals.innerHTML =
      `<div class="vital-group vital-primary">` +
      `<div class="vital" title="Capital"><span class="vital-ico">§</span><span class="vital-body">
        <span class="vital-num ${capitalCls}">${Math.round(r.capital).toLocaleString()}<span class="vital-label-inline">Capital</span></span>
        <span class="gauge gauge-void"></span></span></div>` +
      gauge('⚡', 'Power', r.powerDemand, r.powerCapacity) +
      gauge('💧', 'Water', r.waterDemand, r.waterCapacity) +
      gauge('▣', 'Compute', r.computeDemand, r.compute) +
      gauge('🏠', 'Housing', g.population, housingCap) +
      `</div>` +
      `<div class="vital-group vital-secondary">` +
      meter('☺', 'Trust', g.indicators.trust) +
      meter('✚', 'Health', g.indicators.health) +
      meter('★', 'Appeal', g.attractiveness.overall * 100) +
      meter('👥', unempLabel, unemp, { invert: true, suffix: '%' }) +
      meter('✊', unrestLabel, g.unrest * 100, { invert: true, suffix: '%' }) +
      `</div>`;

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
      `Jobs: ${g.jobsFilled} filled of ${g.jobsTotal}\n` +
      `Attractiveness: ${Math.round(g.attractiveness.overall * 100)}\n` +
      `Year ${year}, ${month}`;
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
      const rows: Array<[string, number]> = [
        ['Convenience', g.indicators.convenience],
        ['Trust', g.indicators.trust],
        [statLabel(g, 'Agency'), g.indicators.agency],
        ['Security', g.indicators.security],
        ['Connection', g.indicators.connection],
        ['Health', g.indicators.health],
        ['Future Confidence', g.indicators.futureConfidence],
      ];
      let html = '';
      for (const [label, v] of rows) {
        const cls = v < 30 ? 'bar-bad' : v < 55 ? 'bar-mid' : 'bar-good';
        // Phase 4+: negative bars are quietly re-colored soothing blue.
        const shownCls = g.asi.phase >= 4 ? 'bar-calm' : cls;
        html += `<div class="ind-row"><span>${label}</span><div class="bar"><div class="fill ${shownCls}" style="width:${Math.round(v)}%"></div></div><span class="ind-val">${Math.round(v)}</span></div>`;
      }
      // Attractiveness breakdown: growth should never be a number that
      // simply happens.
      const att = g.attractiveness;
      const attRows: Array<[string, number]> = [
        ['Jobs', att.jobs], ['Housing', att.housing], ['Amenities', att.amenities],
        ['Services', att.services], ['Environment', att.environment],
        ['Safety', att.safety], ['Affordability', att.cost],
      ];
      html += `<div class="att-header">Attractiveness <b>${Math.round(att.overall * 100)}</b></div>`;
      for (const [label, v] of attRows) {
        const pct = Math.round(v * 100);
        const cls = g.asi.phase >= 4 ? 'bar-calm' : pct < 30 ? 'bar-bad' : pct < 55 ? 'bar-mid' : 'bar-good';
        html += `<div class="ind-row att-row"><span>${label}</span><div class="bar"><div class="fill ${cls}" style="width:${pct}%"></div></div><span class="ind-val">${pct}</span></div>`;
      }

      const queue = Math.max(0, Math.round(g.migrationDemand - g.population));
      html += `<div class="ind-extra">
        Region class: ${tierOf(g.population).name}<br>
        ${statLabel(g, 'Housing Shortage')}: ${g.asi.phase >= 4 ? 'optimized' : Math.round(g.housingShortage * 100) + '%'} (${queue} waiting)<br>
        Service expectations: ${Math.round(g.expectations)}<br>
        ${statLabel(g, 'Pollution')}: ${g.asi.phase >= 4 ? 'managed' : Math.round(g.pollutionAvg * 200) + '%'}<br>
        Human expertise: ${Math.round(g.humanExpertise * 100)}%<br>
        Corporate influence: ${Math.round(g.corporateInfluence * 100)}%<br>
        Data reserves: ${Math.round(g.resources.data)}<br>
        Jobs: ${g.jobsFilled}/${g.jobsTotal}</div>`;
      ind.innerHTML = html;
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
        ${electionLabel} in <b>${Math.floor(ticksLeft / 12)}y ${ticksLeft % 12}m</b> · weighted support <b>${approval}%</b><br>
        ${g.lastElectionResult ? `<small>Last result: ${g.lastElectionResult}</small><br>` : ''}
        ${statLabel(g, 'Protest Activity')}: <b>${stageName}</b></div>`;
      html += '<div class="cat-label">Population Groups</div>';
      for (const id of GROUP_ORDER) {
        const grp = g.groups[id];
        const v = grp.approval;
        const cls = calm ? 'bar-calm' : v < 30 ? 'bar-bad' : v < 55 ? 'bar-mid' : 'bar-good';
        html += `<div class="ind-row" title="${GROUP_DEFS[id].desc}"><span>${GROUP_DEFS[id].name} <small>${Math.round(grp.share * 100)}%</small></span><div class="bar"><div class="fill ${cls}" style="width:${Math.round(v)}%"></div></div><span class="ind-val">${Math.round(v)}</span></div>`;
      }
      html += '<div class="cat-label">Corporate Actors</div>';
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
    let asiNotices = 0;
    let newAlerts = 0;
    while (this.shownNotifications < g.notifications.length) {
      const n = g.notifications[this.shownNotifications++];
      if (n.kind === 'asi') asiNotices++;
      if (n.kind === 'asi' || n.kind === 'warn' || n.kind === 'system') newAlerts++;
      const item = el('div', `feed-item ${n.kind}`);
      const year2 = Math.floor(n.tick / 12) + 1;
      item.innerHTML = `<span class="feed-date">Y${year2} ${MONTHS[n.tick % 12]}</span> ${n.text}`;
      this.feed.append(item);
      while (this.feed.children.length > 60) this.feed.firstChild?.remove();
      this.feed.scrollTop = this.feed.scrollHeight;
    }
    if (asiNotices > 0) this.sound?.systemTone();
    if (this.openPanel !== 'alerts') {
      this.unreadAlerts = Math.min(99, this.unreadAlerts + newAlerts);
    }
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
        { label: 'Begin New Simulation', action: () => { localStorage.setItem(BOOT_FLAG, 'new'); location.reload(); } },
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
      localStorage.setItem(BOOT_FLAG, 'new');
      location.reload();
    };
  }
}
