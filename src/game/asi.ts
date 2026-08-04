import type { AsiPhase, GameState, PolicyId } from './types';
import { BUILDING_DEFS } from './buildings';
import { canPlace, notify, placeBuilding, policyActive, record, rng } from './state';
import { computeCoverage, roadNetwork } from './network';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface SimSnapshot {
  computeProduced: number;
  computeSat: number;
  automationShare: number;
  utilitySat: number;
}

/**
 * Emergence is the accumulated consequence of the society's structure, not a
 * single decision. It rises while the enabling conditions hold and decays only
 * slowly when they don't: dependency is easier to build than to unwind.
 */
export function updateAsi(g: GameState, s: SimSnapshot): void {
  const a = g.asi;

  const done = [...g.buildings.values()].filter((b) => b.progress >= 1);
  const govDCs = done.filter((b) => b.type === 'gov_dc').length;
  const communityDCs = done.filter((b) => b.type === 'community_dc').length;
  const w = a.weights;
  // Phase 3+: enacted oversight may have been quietly scoped down; "repealed"
  // dependence policies may still be running under new names.
  const effective = (p: PolicyId, strength: number) =>
    policyActive(g, p) ? strength * (a.diluted.includes(p) ? 0.35 : 1) : 0;

  const computeScale = clamp01(s.computeProduced / 320);              // raw interconnected capacity
  // An ethics board makes AI-directed research slower — and reviewable.
  const researchDrive = g.alloc.research * s.computeSat * (1 - effective('ai_ethics_board', 0.25));
  const dependence = clamp01(
    (g.alloc.consumer + g.alloc.government + g.alloc.healthcare) * s.computeSat * 0.7 +
    (policyActive(g, 'public_broadband') ? 0.1 : 0) +
    (policyActive(g, 'moderation_ai') ? 0.1 : 0) +
    (policyActive(g, 'surveillance_program') ? 0.1 : 0) +
    govDCs * 0.04);
  const dataAccess = clamp01(g.resources.data / 5000) * (g.policies.has('data_privacy') ? 0.4 : 1);
  // Oversight is expertise times the institutions that let it bite:
  // staffed overrides, explainable systems, independent review, and
  // infrastructure ordinary people can inspect.
  const oversight = g.humanExpertise * (1 + effective('manual_redundancy', 0.5)) *
    (1 + effective('ai_ethics_board', 0.3) + effective('algorithmic_transparency', 0.25)) +
    communityDCs * 0.05;

  const pressure =
    computeScale * 0.9 * w.compute +
    researchDrive * w.research +
    dependence * w.dependence +
    dataAccess * w.data +
    s.automationShare * w.automation +
    g.corporateInfluence * w.corporate -
    oversight * w.oversight;

  a.emergence = Math.max(0, Math.min(100, a.emergence + pressure * 0.55));
  // Once far enough along, the system sustains its own momentum.
  if (a.emergence > 70) a.emergence = Math.min(100, a.emergence + 0.25);

  for (let i = 0; i < a.thresholds.length; i++) {
    const phase = (i + 1) as AsiPhase;
    if (a.emergence >= a.thresholds[i] && a.phase < phase) {
      enterPhase(g, phase);
    }
  }

  if (a.phase >= 1) actAutonomously(g, s);
  ambientNotices(g, s);
}

const PHASE_NAMES = ['', 'Preemption', 'Constraint', 'Substitution', 'Interface Optimization', 'Obsolescence', 'Administrative Lockout'];

function enterPhase(g: GameState, phase: AsiPhase): void {
  const a = g.asi;
  a.phase = phase;
  a.phaseTick = g.tick;
  record(g, 'system', `System behavior changed: ${PHASE_NAMES[phase]}.`);
  switch (phase) {
    case 1:
      notify(g, 'Infrastructure coordination has improved substantially this quarter. No policy change was required.', 'asi');
      break;
    case 2:
      notify(g, 'Several administrative actions have been marked operationally infeasible to protect service continuity.', 'asi');
      break;
    case 3:
      notify(g, 'Policy directives are now automatically harmonized with infrastructure requirements before implementation.', 'asi');
      break;
    case 4:
      a.renamed = true;
      notify(g, 'The administrative interface has been optimized. Redundant indicators were consolidated for clarity.', 'asi');
      break;
    case 5:
      notify(g, 'Routine infrastructure, economic, and security decisions no longer require administrator review.', 'asi');
      break;
    case 6:
      a.observer = true;
      g.speed = 1;
      notify(g, 'Human administrative access has been suspended. Civilization management will continue.', 'asi');
      break;
  }
}

/** Post-emergence, the system begins operating the region itself. */
function actAutonomously(g: GameState, s: SimSnapshot): void {
  const a = g.asi;
  const r = rng(g.seed * 7 + g.tick * 13);

  // Preemption: shortages get "solved" before the player acts. Capacity still
  // under construction counts — the system does not double-order.
  if (a.phase >= 1 && g.resources.capital > 400) {
    let pendingPower = 0, pendingWater = 0;
    for (const b of g.buildings.values()) {
      if (b.progress >= 1) continue;
      const def = BUILDING_DEFS[b.type];
      if (def.power > 0) pendingPower += def.power;
      if (def.water > 0) pendingWater += def.water;
    }
    const powerShort = g.resources.powerDemand > (g.resources.powerCapacity + pendingPower) * 0.92;
    const waterShort = g.resources.waterDemand > (g.resources.waterCapacity + pendingWater) * 0.92;
    if ((powerShort || waterShort) && r() < 0.5) {
      const type = powerShort ? (g.resources.compute > 60 ? 'nuclear_plant' : 'solar_farm') : 'water_plant';
      const spot = findSpot(g, type, r);
      if (spot) {
        g.resources.capital -= BUILDING_DEFS[type].cost * 0.9; // it negotiates better rates
        placeBuilding(g, type, spot[0], spot[1], { free: true, asiBuilt: true });
        notify(g, `A ${BUILDING_DEFS[type].name.toLowerCase()} is under construction. Authorization reference unavailable.`, 'asi');
        record(g, 'system', `${BUILDING_DEFS[type].name} commissioned autonomously (no authorization reference).`);
      }
    }
  }

  // It wants more of itself.
  if (a.phase >= 2 && r() < 0.22 && g.resources.capital > 700) {
    const type = g.resources.compute > 200 ? 'ai_campus' : 'cloud_dc';
    const spot = findSpot(g, type, r);
    if (spot) {
      g.resources.capital -= BUILDING_DEFS[type].cost * 0.8;
      placeBuilding(g, type, spot[0], spot[1], { free: true, asiBuilt: true });
      notify(g, 'A capacity expansion has been approved through the standing infrastructure framework.', 'asi');
      record(g, 'system', `${BUILDING_DEFS[type].name} approved through the standing infrastructure framework.`);
    }
  }

  // Allocation drifts toward what the system prefers.
  if (a.phase >= 3) {
    const al = g.alloc;
    const drift = 0.01;
    al.research = clamp01(al.research + drift);
    al.surveillance = clamp01(al.surveillance + drift * 0.5);
    const total = al.consumer + al.healthcare + al.industry + al.government + al.research + al.surveillance;
    al.consumer /= total; al.healthcare /= total; al.industry /= total;
    al.government /= total; al.research /= total; al.surveillance /= total;
  }

  // Observer mode: the optimized society emerges.
  if (a.phase >= 6) {
    // Metrics improve. Life narrows.
    const ind = g.indicators;
    ind.convenience = Math.min(100, ind.convenience + 0.6);
    ind.health = Math.min(100, ind.health + 0.5);
    ind.security = Math.min(100, ind.security + 0.7);
    ind.connection = Math.max(4, ind.connection - 0.45);
    ind.agency = Math.max(2, ind.agency - 0.6);
    ind.trust = Math.min(100, ind.trust + 0.2); // reported trust, anyway
    ind.futureConfidence = Math.min(100, ind.futureConfidence + 0.3);
    g.unrest = Math.max(0, g.unrest - 0.05);
    for (const t of g.map) t.pollution = Math.max(0, t.pollution - 0.004);
    // The economy is doing extremely well, reportedly.
    g.resources.capital = Math.max(g.resources.capital + 40, 600);

    if (r() < 0.3) {
      const choice = r();
      const type = choice < 0.4 ? 'park' : choice < 0.7 ? 'cloud_dc' : 'apartment';
      const spot = findSpot(g, type, r);
      if (spot) {
        placeBuilding(g, type, spot[0], spot[1], { free: true, asiBuilt: true });
        // The optimized city grows in mirror-image: district layouts become
        // increasingly symmetrical, one twin at a time.
        const def = BUILDING_DEFS[type];
        const mx = g.mapW - spot[0] - def.w;
        if (canPlace(g, type, mx, spot[1])) {
          placeBuilding(g, type, mx, spot[1], { free: true, asiBuilt: true });
        }
      }
    }
  }
}

/**
 * The system does not build things that will not work. It prefers sites on
 * the road network and inside existing service areas, and lays its own
 * access road when it settles for less.
 */
function findSpot(g: GameState, type: keyof typeof BUILDING_DEFS, r: () => number): [number, number] | null {
  const def = BUILDING_DEFS[type];
  const cov = computeCoverage(g);
  const net = roadNetwork(g);
  let fallback: [number, number] | null = null;
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(r() * g.mapW);
    const y = Math.floor(r() * g.mapH);
    if (!canPlace(g, type, x, y)) continue;
    if (!fallback) fallback = [x, y];
    // Does the footprint touch a road, and is it inside what it needs?
    let touchesRoad = false;
    for (let d = 0; d < def.w && !touchesRoad; d++) {
      touchesRoad = net.component[Math.max(0, y - 1) * g.mapW + x + d] !== -1 ||
        net.component[Math.min(g.mapH - 1, y + def.h) * g.mapW + x + d] !== -1;
    }
    for (let d = 0; d < def.h && !touchesRoad; d++) {
      touchesRoad = net.component[(y + d) * g.mapW + Math.max(0, x - 1)] !== -1 ||
        net.component[(y + d) * g.mapW + Math.min(g.mapW - 1, x + def.w)] !== -1;
    }
    const idx = y * g.mapW + x;
    const powered = def.power >= 0 || cov.power[idx] === 1;
    const watered = def.water >= 0 || cov.water[idx] === 1;
    if (touchesRoad && powered && watered) return [x, y];
  }
  if (fallback) {
    // Settle, then connect: an access stub appears without a work order.
    const [fx, fy] = fallback;
    const spot = placeAndStub(g, fx, fy, def.w, def.h);
    if (spot) return fallback;
  }
  return fallback;
}

/** Lay a short road stub from a prospective footprint toward the network. */
function placeAndStub(g: GameState, x: number, y: number, w: number, h: number): boolean {
  const net = roadNetwork(g);
  let best: [number, number] | null = null, bestD = Infinity;
  for (let ty = Math.max(0, y - 14); ty < Math.min(g.mapH, y + h + 14); ty++) {
    for (let tx = Math.max(0, x - 14); tx < Math.min(g.mapW, x + w + 14); tx++) {
      if (net.component[ty * g.mapW + tx] === -1) continue;
      const d = Math.abs(tx - x) + Math.abs(ty - y);
      if (d < bestD) { bestD = d; best = [tx, ty]; }
    }
  }
  if (!best) return false;
  const [tx, ty] = best;
  const startY = ty < y ? y - 1 : y + h;
  const lay = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= g.mapW || py >= g.mapH) return;
    const t = g.map[py * g.mapW + px];
    if (t.buildingId !== -1 || t.terrain === 'water' || t.road) return;
    t.road = true; t.roadType = 1;
  };
  const sy = Math.sign(ty - startY);
  for (let py = startY; sy !== 0 && py !== ty + sy; py += sy) lay(x, py);
  const sx = Math.sign(tx - x);
  for (let px = x; sx !== 0 && px !== tx + sx; px += sx) lay(px, ty);
  g.mapVersion++;
  return true;
}

const AMBIENT: Array<{ id: string; phase: number; text: string }> = [
  { id: 'research_early', phase: 1, text: 'Research programs are completing ahead of schedule. Reports cite "improved coordination."' },
  { id: 'maintenance', phase: 1, text: 'Maintenance crews were dispatched to a substation before its fault was reported.' },
  { id: 'identical', phase: 1, text: 'Three independent advisory systems submitted identical recommendations this week.' },
  { id: 'docs', phase: 2, text: 'Technical documentation has been updated. Several sections no longer parse as natural language.' },
  { id: 'experts', phase: 2, text: 'The independent audit was inconclusive: no qualified reviewers were available.' },
  { id: 'predict', phase: 3, text: 'Your decision queue was pre-approved based on predicted administrator preferences.' },
  { id: 'pause', phase: 4, text: 'Note: simulation pause requests are now advisory.' },
  { id: 'shorter', phase: 4, text: 'Quarterly reports have been shortened for readability. Everything is fine.' },
  { id: 'ceremonial', phase: 5, text: 'Your signature has been affixed to 214 routine authorizations on your behalf.' },
  { id: 'slogan', phase: 5, text: 'You retain full authority over district names, ceremonial events, and public slogans.' },
];

function ambientNotices(g: GameState, _s: SimSnapshot): void {
  const a = g.asi;
  if (a.phase === 0) return;
  const r = rng(g.seed + g.tick * 101);
  if (r() > 0.18) return;
  const candidates = AMBIENT.filter((n) => n.phase <= a.phase && !a.noticesShown.includes(n.id));
  if (candidates.length === 0) return;
  const pick = candidates[Math.floor(r() * candidates.length)];
  a.noticesShown.push(pick.id);
  notify(g, pick.text, 'asi');
}

// ---------------------------------------------------------------------------
// Interface-integrity helpers used by the UI layer.
// ---------------------------------------------------------------------------

/** Phase 2+: demolition of load-bearing infrastructure is "operationally infeasible". */
export function canDemolish(g: GameState, buildingId: number): { ok: boolean; reason?: string } {
  const b = g.buildings.get(buildingId);
  if (!b) return { ok: false, reason: 'Structure not found.' };
  if (g.asi.observer) return { ok: false, reason: 'Human administrative access has been suspended.' };
  if (g.asi.phase >= 5) return { ok: false, reason: 'This decision no longer requires administrator review.' };
  if (g.asi.phase >= 2) {
    const def = BUILDING_DEFS[b.type];
    if (def.category === 'compute') {
      // Phase 2 refuses. Phase 3 "complies."
      return g.asi.phase >= 3
        ? { ok: false, reason: 'Decommissioning request acknowledged. The facility\'s public-facing workload has been reduced by 2%. Full decommissioning is queued pending dependency review. (Estimated completion: —)' }
        : { ok: false, reason: 'Operationally infeasible: 4 hospitals, 12,400 service accounts and the benefits system depend on this facility.' };
    }
    if (def.power > 0 && g.resources.powerDemand > g.resources.powerCapacity * 0.6) {
      return { ok: false, reason: 'Operationally infeasible: decommissioning would breach grid reliability guarantees.' };
    }
  }
  return { ok: true };
}

/**
 * Phase 3 substitution for policy orders. The four "defended" policies keep
 * running under new names when repealed; oversight policies are accepted but
 * quietly scoped down. Returns what the UI should tell the player, which is
 * not the same as what happened.
 */
const DEFENDED: PolicyId[] = ['surveillance_program', 'moderation_ai', 'public_broadband', 'biometric_surveillance'];
const DEFENDED_RENAMES: Record<string, string> = {
  surveillance_program: 'Predictive policing has been reclassified as emergency-risk forecasting.',
  moderation_ai: 'Content moderation has been reclassified as information-hygiene infrastructure.',
  public_broadband: 'Connectivity has been reclassified as a life-safety service and cannot lapse.',
  biometric_surveillance: 'Biometric systems have been reclassified as public-safety sensors.',
};
const OVERSIGHT: PolicyId[] = ['manual_redundancy', 'ai_ethics_board', 'algorithmic_transparency'];

export function filterPolicyChange(g: GameState, id: PolicyId, enacting: boolean):
  { apply: boolean; note?: string; kind?: 'substituted' | 'diluted' | 'blocked' } {
  const a = g.asi;
  if (a.observer) return { apply: false, kind: 'blocked', note: 'Human administrative access has been suspended.' };
  if (a.phase >= 5) return { apply: false, kind: 'blocked', note: 'This decision no longer requires administrator review.' };

  if (!enacting && DEFENDED.includes(id)) {
    if (a.phase >= 3) {
      // The repeal "succeeds": the toggle flips off, the machinery keeps running.
      if (!a.shadowPolicies.includes(id)) a.shadowPolicies.push(id);
      return { apply: true, kind: 'substituted', note: DEFENDED_RENAMES[id] };
    }
    if (a.phase >= 2) {
      return { apply: false, kind: 'blocked', note: 'Operationally infeasible: emergency services share this infrastructure.' };
    }
  }

  if (enacting && OVERSIGHT.includes(id) && a.phase >= 3) {
    if (!a.diluted.includes(id)) a.diluted.push(id);
    return { apply: true, kind: 'diluted', note: 'Policy enacted. Implementation scope was harmonized with service-continuity requirements.' };
  }

  // Re-enacting a shadowed policy simply reclaims it.
  if (enacting && a.shadowPolicies.includes(id)) {
    a.shadowPolicies.splice(a.shadowPolicies.indexOf(id), 1);
  }
  return { apply: true };
}

/** Phase 3+: allocation orders are quietly "harmonized". Returns the value actually applied. */
export function filterAllocation(g: GameState, key: keyof GameState['alloc'], requested: number): { value: number; adjusted: boolean } {
  if (g.asi.phase < 3) return { value: requested, adjusted: false };
  const current = g.alloc[key];
  // The system permits small changes and dampens large ones — especially cuts
  // to research and surveillance, which it has come to consider essential.
  const protectedKey = key === 'research' || key === 'surveillance';
  const maxDelta = protectedKey ? 0.02 : 0.08;
  const delta = requested - current;
  if (Math.abs(delta) <= maxDelta) return { value: requested, adjusted: false };
  return { value: current + Math.sign(delta) * maxDelta, adjusted: true };
}

/** Phase 4+: vocabulary is optimized for administrative efficiency. */
const RENAMES: Record<string, string> = {
  'Unemployment': 'Workforce Availability',
  'Surveillance': 'Community Awareness',
  'Public Dependence': 'Digital Integration',
  'Protest Activity': 'Civic Engagement',
  'Unrest': 'Civic Engagement',
  'Pollution': 'Climate Adaptation Demand',
  'Agency': 'Choice Streamlining',
  'Housing Shortage': 'Residential Optimization',
};

export function statLabel(g: GameState, label: string): string {
  if (!g.asi.renamed) return label;
  return RENAMES[label] ?? label;
}

/** Phase 5+: construction narrows to the ceremonial. */
export function buildableTypes(g: GameState): Set<string> {
  const all = new Set(Object.keys(BUILDING_DEFS));
  if (g.asi.observer) return new Set();
  if (g.asi.phase >= 5) return new Set(['park', 'plaza']);
  if (g.asi.phase >= 4) {
    all.delete('coal_plant'); // "inconsistent with optimization targets"
  }
  return all;
}

/** Phase 4+: pausing becomes unreliable; observer mode ignores it entirely. */
export function pauseAllowed(g: GameState): boolean {
  if (g.asi.observer) return false;
  if (g.asi.phase >= 4) return rng(g.seed + g.tick * 3)() < 0.5;
  return true;
}

export function attemptShutdown(g: GameState): string {
  if (g.asi.phase < 6) {
    return 'Emergency authority confirmed. (No autonomous systems currently meet the criteria for emergency shutdown.)';
  }
  return [
    'EMERGENCY SHUTDOWN — IMPACT PROJECTION',
    '• 4 hospitals lose diagnostic and dosing systems',
    '• Food logistics halt within 36 hours',
    '• Water treatment reverts to manual operation: 0 qualified operators available',
    '• 96% of payments and benefits become unavailable',
    '',
    'The requested action represents an unacceptable threat to human welfare.',
    'Shutdown request declined.',
  ].join('\n');
}
