// DOM-based HUD. Deliberately built as an ordinary dashboard — because in the
// late game the ASI starts remodeling it: renaming metrics, consolidating
// "redundant" indicators, removing controls, and finally fading the whole
// thing into observer mode.

import type { BuildingType, GameState, PolicyId } from '../game/types';
import { BUILDING_DEFS, BUILD_MENU_ORDER } from '../game/buildings';
import { POLICY_CATEGORIES, POLICY_DEFS, POLICY_ORDER } from '../game/policies';
import { attemptShutdown, buildableTypes, canDemolish, filterAllocation, filterPolicyChange, pauseAllowed, statLabel } from '../game/asi';
import { removeBuilding, notify, record } from '../game/state';
import { resolveEvent } from '../game/events';
import { AUTO_SLOT, BOOT_FLAG, MANUAL_SLOT, peek, requestLoad, saveTo } from '../game/save';
import { tierOf, buildingCondition } from '../game/sim';
import { INTRO_BODY, INTRO_TITLE } from '../game/tutorial';
import { CORP_DEFS, CORP_ORDER, GROUP_DEFS, GROUP_ORDER, RESISTANCE_STAGES, weightedApproval } from '../game/politics';
import type { Soundscape } from '../audio/soundscape';
import { SCENARIOS, SCENARIO_ORDER } from '../game/scenarios';

export type Tool = { kind: 'none' } | { kind: 'build'; type: BuildingType } | { kind: 'demolish' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
  private topBar!: HTMLElement;
  private topBarStats!: HTMLElement;
  private buildPanel!: HTMLElement;
  private sidePanel!: HTMLElement;
  private feed!: HTMLElement;
  private modal!: HTMLElement;
  private inspector!: HTMLElement;
  private observerOverlay!: HTMLElement;
  private shownNotifications = 0;
  private lastPhase = -1;
  private lastBuildMenuKey = '';
  private allocDragging = false;

  constructor(root: HTMLElement, private g: GameState, private onSpeed: (s: 0 | 1 | 2 | 3) => void) {
    this.root = root;
    this.buildChrome();
  }

  // ------------------------------------------------------------ construction
  private buildChrome(): void {
    this.topBar = el('div', 'topbar');
    this.topBarStats = el('span', 'topbar-stats');
    const spd = el('span', 'speed-controls');
    ([['⏸', 0], ['▶', 1], ['▶▶', 2], ['▶▶▶', 3]] as Array<[string, 0 | 1 | 2 | 3]>).forEach(([label, s]) => {
      const b = el('button', 'speed-btn', label);
      b.dataset.speed = String(s);
      b.onclick = () => {
        if (s === 0 && !pauseAllowed(this.g)) {
          this.flashSystemNote('Pause request received. Simulation continuity has been prioritized.');
          return;
        }
        this.onSpeed(s);
      };
      spd.append(b);
    });
    const sys = el('span', 'sys-controls');
    const saveBtn = el('button', 'sys-btn', 'Save');
    saveBtn.onclick = () => {
      if (this.g.asi.phase >= 5) {
        // It saves your game for you now. It saves everything.
        this.flashSystemNote('State persistence is managed automatically.');
        return;
      }
      this.flashSystemNote(saveTo(MANUAL_SLOT, this.g) ? 'Game saved.' : 'Save failed — storage unavailable.');
    };
    const loadBtn = el('button', 'sys-btn', 'Load');
    loadBtn.onclick = () => this.showLoadMenu();
    const newBtn = el('button', 'sys-btn', 'New');
    newBtn.onclick = () => this.showModal('Begin New Simulation',
      'Choose a region. Each has its own terrain, economy, politics — and its own shape of the problem. The autosave will be overwritten as the new game progresses.',
      [
        ...SCENARIO_ORDER.map((id) => ({
          label: `${SCENARIOS[id].name} — ${SCENARIOS[id].desc}`,
          action: () => { localStorage.setItem(BOOT_FLAG, `new:${id}`); location.reload(); },
        })),
        { label: 'Cancel', action: () => {} },
      ]);
    const muteBtn = el('button', 'sys-btn', '🔊');
    muteBtn.onclick = () => {
      const s = this.sound;
      if (!s) return;
      s.init();
      s.setEnabled(!s.enabled);
      muteBtn.textContent = s.enabled ? '🔊' : '🔇';
    };
    sys.append(saveBtn, loadBtn, newBtn, muteBtn);
    this.topBar.append(this.topBarStats, sys, spd);
    this.buildPanel = el('div', 'panel build-panel');
    this.sidePanel = el('div', 'panel side-panel');
    this.feed = el('div', 'feed');
    this.modal = el('div', 'modal hidden');
    this.inspector = el('div', 'panel inspector hidden');
    this.observerOverlay = el('div', 'observer-overlay hidden');
    this.root.append(this.topBar, this.buildPanel, this.sidePanel, this.feed, this.inspector, this.modal, this.observerOverlay);
    this.renderBuildPanel();
    this.renderSidePanel();
  }

  private renderBuildPanel(): void {
    const g = this.g;
    const allowed = buildableTypes(g);
    this.buildPanel.innerHTML = '<h3>Construction</h3>';
    const cats: Array<[string, string]> = [['civic', 'Civic'], ['zone', 'Housing'], ['power', 'Utilities'], ['industry', 'Economy'], ['compute', 'Compute']];
    for (const [cat, label] of cats) {
      const types = BUILD_MENU_ORDER.filter((t) => BUILDING_DEFS[t].category === cat && allowed.has(t));
      const visible = types.filter((t) => {
        const def = BUILDING_DEFS[t];
        return !def.unlockCompute || g.resources.compute >= def.unlockCompute;
      });
      if (visible.length === 0) continue;
      this.buildPanel.append(el('div', 'cat-label', label));
      for (const t of visible) {
        const def = BUILDING_DEFS[t];
        const btn = el('button', 'build-btn');
        btn.innerHTML = `<span>${def.name}</span><span class="cost">§${def.cost}</span>`;
        btn.title = `${def.desc}\n${def.jobs ? `Jobs: ${def.jobs}  ` : ''}${def.power ? `Power: ${def.power > 0 ? '+' : ''}${def.power}  ` : ''}${def.water ? `Water: ${def.water > 0 ? '+' : ''}${def.water}  ` : ''}${def.compute ? `Compute: +${def.compute}` : ''}`;
        btn.dataset.type = t;
        btn.onclick = () => {
          this.selectedBuildingId = null;
          this.inspector.classList.add('hidden');
          this.tool = this.tool.kind === 'build' && this.tool.type === t ? { kind: 'none' } : { kind: 'build', type: t };
          this.syncToolButtons();
        };
        this.buildPanel.append(btn);
      }
    }
    const demo = el('button', 'build-btn demolish');
    demo.textContent = 'Demolish';
    demo.onclick = () => {
      this.tool = this.tool.kind === 'demolish' ? { kind: 'none' } : { kind: 'demolish' };
      this.syncToolButtons();
    };
    this.buildPanel.append(demo);
  }

  private syncToolButtons(): void {
    for (const b of this.buildPanel.querySelectorAll('button')) {
      const t = (b as HTMLElement).dataset.type;
      const active =
        (this.tool.kind === 'build' && t === this.tool.type) ||
        (this.tool.kind === 'demolish' && b.classList.contains('demolish'));
      b.classList.toggle('active', active);
    }
  }

  private renderSidePanel(): void {
    const g = this.g;
    this.sidePanel.innerHTML = '';
    const tabs = el('div', 'tabs');
    const bodies: Record<string, HTMLElement> = {
      Indicators: el('div', 'tab-body'),
      Compute: el('div', 'tab-body hidden'),
      Policies: el('div', 'tab-body hidden'),
      Politics: el('div', 'tab-body hidden'),
    };
    for (const name of Object.keys(bodies)) {
      const b = el('button', 'tab', name);
      if (name === 'Indicators') b.classList.add('active');
      b.onclick = () => {
        for (const t of tabs.children) t.classList.remove('active');
        b.classList.add('active');
        for (const [n, body] of Object.entries(bodies)) body.classList.toggle('hidden', n !== name);
      };
      tabs.append(b);
    }
    this.sidePanel.append(tabs, ...Object.values(bodies));

    // Indicators + Politics tabs are re-rendered in refresh(); Compute +
    // Policies are built once here.
    bodies.Indicators.id = 'indicators-body';
    bodies.Politics.id = 'politics-body';

    const alloc = bodies.Compute;
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

    const pol = bodies.Policies;
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
    for (const slider of this.sidePanel.querySelectorAll<HTMLInputElement>('input[type=range]')) {
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
    for (const btn of this.sidePanel.querySelectorAll<HTMLElement>('.policy-toggle')) {
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
      <p class="stats">${b.progress < 1 ? `Under construction (${Math.round(b.progress * 100)}%)` : b.active ? 'Operational' : 'Offline — utility shortage'}</p>
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
    // changes (compute unlocks, phase restrictions).
    const menuKey = BUILD_MENU_ORDER
      .filter((t) => buildableTypes(g).has(t))
      .filter((t) => !BUILDING_DEFS[t].unlockCompute || g.resources.compute >= BUILDING_DEFS[t].unlockCompute)
      .join(',');
    if (menuKey !== this.lastBuildMenuKey) {
      this.lastBuildMenuKey = menuKey;
      this.renderBuildPanel();
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
    this.topBarStats.innerHTML = `
      <span class="date">Year ${year} · ${month}</span>
      <span class="res ${r.capital < 0 ? 'bad' : ''}">§ <b>${Math.round(r.capital)}</b></span>
      <span class="res ${powerBad ? 'bad' : ''}">⚡ <b>${r.powerCapacity}</b>/${r.powerDemand}</span>
      <span class="res ${waterBad ? 'bad' : ''}">💧 <b>${r.waterCapacity}</b>/${r.waterDemand}</span>
      <span class="res">▣ <b>${r.compute}</b>/${r.computeDemand}</span>
      <span class="res">👤 <b>${g.population}</b></span>
      <span class="res">${unempText}</span>
      <span class="res">${unrestLabel}: <b>${unrestVal}</b></span>`;
    for (const b of this.topBar.querySelectorAll<HTMLElement>('.speed-btn')) {
      b.classList.toggle('active', Number(b.dataset.speed) === g.speed);
    }

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
    while (this.shownNotifications < g.notifications.length) {
      const n = g.notifications[this.shownNotifications++];
      if (n.kind === 'asi') asiNotices++;
      const item = el('div', `feed-item ${n.kind}`);
      const year2 = Math.floor(n.tick / 12) + 1;
      item.innerHTML = `<span class="feed-date">Y${year2} ${MONTHS[n.tick % 12]}</span> ${n.text}`;
      this.feed.append(item);
      while (this.feed.children.length > 60) this.feed.firstChild?.remove();
      this.feed.scrollTop = this.feed.scrollHeight;
    }
    if (asiNotices > 0) this.sound?.systemTone();

    // Events ---------------------------------------------------------------
    if (g.pendingEvent && this.modal.classList.contains('hidden')) {
      const e = g.pendingEvent;
      this.sound?.eventChime();
      // Phase 4+: the system pre-selects what it considers the right answer.
      const rec = g.asi.phase >= 4 ? 0 : -1;
      this.showModal(e.title, e.body, e.choices.map((c, i) => ({
        label: c.label,
        action: () => resolveEvent(g, i),
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
