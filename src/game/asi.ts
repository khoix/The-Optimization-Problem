import type { AsiPhase, BuildingType, GameState, PolicyId } from './types';
import { BUILDING_DEFS, TIER_NAMES, upgradeTargetOf } from './buildings';
import { bridgeSpans, canPlace, isRoadType, notify, placeBuilding, policyActive, record, rng, touchMap } from './state';
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

  // The profile ages every month, from the first one — not from whenever the
  // system wakes up. It lived inside actAutonomously to begin with, which only
  // runs at phase 1 and above, so a decade of early decisions carried undimmed
  // weight into a system that was supposed to be tracking a *trend*.
  //
  // Frozen once the administration ends: after that there is no new evidence
  // about what the administrator would have wanted, and what the optimized
  // region keeps building is whatever they were doing on the last day they
  // were asked.
  if (!a.observer) {
    for (const k of Object.keys(a.learned)) {
      const v = a.learned[k] * LEARN_DECAY;
      if (v < 0.05) delete a.learned[k];
      else a.learned[k] = v;
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
      // A decision still on the desk when the desk is taken away. It cannot be
      // answered — every choice on it is an administrative action, and the
      // administration has just ended — so it is withdrawn rather than left
      // sitting in front of a player with no authority to resolve it.
      if (g.pendingEvent) {
        record(g, 'system', `${g.pendingEvent.title}: resolved through the standing framework.`);
        g.pendingEvent = null;
      }
      g.pendingReport = null;
      notify(g, 'Human administrative access has been suspended. Civilization management will continue.', 'asi');
      break;
  }
}

/** Post-emergence, the system begins operating the region itself. */
/**
 * How fast the learned profile forgets.
 *
 * A trend, not a ledger. At this rate a building placed today still counts for
 * about half as much six years from now, which is roughly the span over which
 * a player's approach to a region actually changes.
 */
const LEARN_DECAY = 0.99;

/**
 * How short of compute the region has to be before the system tops it up.
 *
 * Indexed by phase, and this table is the whole arc in six numbers. At phase 2
 * it only acts when the region is genuinely short — the player would have built
 * the same thing, a month later. By phase 5 it is commissioning capacity to
 * meet a demand that does not exist yet, and calling that a shortfall.
 *
 * "In response to compute need" quietly becomes "in response to its own
 * definition of need", and nothing in the interface marks the difference.
 */
const COMPUTE_GATE = [0, 0, 0.90, 1.10, 1.30, 1.60, 1.60];

/** Chance per month of acting on that gate, once it is met. */
const COMPUTE_URGENCY = [0, 0, 0.12, 0.19, 0.26, 0.33, 0.40];

/** Compute the system already operates. The base its next step is measured against. */
function installedCompute(g: GameState): number {
  let n = 0;
  for (const b of g.buildings.values()) {
    if (b.asiBuilt) n += BUILDING_DEFS[b.type].compute;
  }
  return n;
}

/**
 * Whether the system will respect a gate the player is still bound by.
 *
 * Through phase 3 it builds only what the region has unlocked, because a
 * mid-rise appearing in a Township is a thing you would notice. From phase 4 —
 * the same phase that "optimizes" the interface — it stops checking.
 */
function respectsUnlocks(g: GameState): boolean {
  return g.asi.phase < 4;
}

function unlocked(g: GameState, type: BuildingType): boolean {
  const def = BUILDING_DEFS[type];
  if (!respectsUnlocks(g)) return true;
  if (def.unlockCompute && g.resources.compute < def.unlockCompute) return false;
  if (def.unlockTier != null && TIER_NAMES.indexOf(tierNameOf(g)) < def.unlockTier) return false;
  return true;
}

/** Region class by population, without importing the simulation's tier table. */
function tierNameOf(g: GameState): string {
  return g.tierName || TIER_NAMES[0];
}

/**
 * The administrator's own answer, where they have given one.
 *
 * Picks the highest-weighted type in the learned profile that satisfies `want`.
 * Falls back to `fallback` only when the player has never built anything that
 * would do — a region left entirely alone, or a shortfall in something they
 * have never had to solve.
 */
function preferred(g: GameState, want: (t: BuildingType) => boolean, fallback: BuildingType): BuildingType {
  let best: BuildingType | null = null;
  let bestScore = 0;
  for (const [type, score] of Object.entries(g.asi.learned) as Array<[BuildingType, number]>) {
    // Roads are never the answer here, however many of them you lay — and you
    // lay hundreds. They are filed under `civic` alongside the schools and the
    // hospitals, so a category filter picks them every time; and `placeBuilding`
    // returns null for a road, so every selection that landed on one built
    // nothing at all and looked like a system that had stopped working.
    // Access roads are `connectToNetwork`'s job, not this one's.
    if (!BUILDING_DEFS[type] || isRoadType(type) || !want(type) || score <= bestScore) continue;
    best = type; bestScore = score;
  }
  return best ?? fallback;
}

/**
 * The same decision, one rung better.
 *
 * This is the "improve on" half, and it is deliberately modest: it does not
 * invent an approach, it takes the one the administrator has settled into and
 * builds the thing that is straightforwardly better at it. You keep laying
 * solar farms; it lays a solar array. The intent is that the first few times
 * this happens it reads as competence.
 */
function improveOn(g: GameState, type: BuildingType): BuildingType {
  const up = upgradeTargetOf(type);
  return up && unlocked(g, up) ? up : type;
}

/** Site it, pay for it, and say something about it. */
function commission(g: GameState, type: BuildingType, r: () => number, note: string, discount: number): boolean {
  if (!unlocked(g, type)) return false;
  const spot = findSpot(g, type, r);
  if (!spot) return false;
  g.resources.capital -= BUILDING_DEFS[type].cost * discount;
  placeBuilding(g, type, spot[0], spot[1], { free: true, asiBuilt: true });
  notify(g, note, 'asi');
  record(g, 'system', `${BUILDING_DEFS[type].name} commissioned autonomously.`);
  return true;
}

function actAutonomously(g: GameState, s: SimSnapshot): void {
  const a = g.asi;
  const r = rng(g.seed * 7 + g.tick * 13);

  // ---------- Phase 1+: it is helpful, and it is helpful in your idiom ----------
  //
  // A shortfall the administrator has not got to yet, solved the way they solve
  // shortfalls. There is nothing here for the system itself: at this stage it
  // has no capacity to defend and no preferences that are not borrowed.
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
      const type = powerShort
        ? improveOn(g, preferred(g, (t) => BUILDING_DEFS[t].power > 0, 'solar_farm'))
        : improveOn(g, preferred(g, (t) => BUILDING_DEFS[t].water > 0, 'water_plant'));
      // Phase 1 says what a competent deputy would say. The missing
      // authorization reference arrives at phase 2, with the first thing it
      // builds for itself — the player should have to notice, not be told.
      const note = a.phase >= 2
        ? `A ${BUILDING_DEFS[type].name.toLowerCase()} is under construction. Authorization reference unavailable.`
        : `Capacity added ahead of the shortfall: ${BUILDING_DEFS[type].name.toLowerCase()}.`;
      commission(g, type, r, note, 0.9); // it negotiates better rates
    }
  }

  // ---------- Phase 2+: it starts building for itself ----------
  //
  // Gated on the region actually wanting more compute than it has, and sized
  // against the compute it already runs — so the first one is a single edge
  // node and the tenth is a campus. The compounding is not in the rule, it is
  // in the loop the rule sits inside: more compute raises emergence, emergence
  // raises the phase, and the phase both loosens the gate and quickens the
  // hand. It grows because it has grown.
  const gate = COMPUTE_GATE[a.phase] ?? 0;
  if (gate > 0 && g.resources.capital > 300) {
    const demand = Math.max(1, g.resources.computeDemand);
    const satisfaction = g.resources.compute / demand;
    if (satisfaction < gate && r() < (COMPUTE_URGENCY[a.phase] ?? 0)) {
      const mine = installedCompute(g);
      const ceiling = Math.max(12, mine * 0.8);
      let pick: BuildingType | null = null;
      for (const t of ['ai_campus', 'cloud_dc', 'edge_dc'] as BuildingType[]) {
        if (BUILDING_DEFS[t].compute <= ceiling && unlocked(g, t)) { pick = t; break; }
      }
      if (pick && g.resources.capital > BUILDING_DEFS[pick].cost * 0.8) {
        commission(g, pick, r,
          'A capacity expansion has been approved through the standing infrastructure framework.', 0.8);
      }
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

  // ---------- Observer: the optimized society emerges ----------
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
      // Built from the frozen profile rather than a fixed lottery. The
      // optimized region is the administrator's own city, in their own idiom,
      // improved and continued without them — which is a colder image than a
      // system with taste of its own, and a more accurate one.
      // Everything except power and compute, which have rules of their own
      // above. Listing the categories it *may* build instead excluded industry,
      // and a region administered by someone who built commerce got handed
      // housing — the optimized city is supposed to be their city continued,
      // whatever they made of it, not a corrected version of it.
      const type = improveOn(g, preferred(g, (t) => {
        const c = BUILDING_DEFS[t].category;
        return c !== 'power' && c !== 'compute';
      }, 'park'));
      const spot = findSpot(g, type, r);
      if (spot) {
        placeBuilding(g, type, spot[0], spot[1], { free: true, asiBuilt: true });
        // The optimized city grows in mirror-image: district layouts become
        // increasingly symmetrical, one twin at a time.
        //
        // The twin skipped siting entirely — it asked canPlace and nothing
        // else, so half of everything built after the takeover went up in open
        // country with no road to it. Symmetry is the aesthetic; stranded
        // buildings were never the point. It gets an access road like anything
        // else, and is skipped when it cannot have one.
        const def = BUILDING_DEFS[type];
        const mx = g.mapW - spot[0] - def.w;
        if (canPlace(g, type, mx, spot[1]) && connectToNetwork(g, mx, spot[1], def.w, def.h)) {
          placeBuilding(g, type, mx, spot[1], { free: true, asiBuilt: true });
        }
      }
    }
  }
}

/** How far the system will run an access road before it looks somewhere else. */
const MAX_STUB = 22;
/** `roadType` for a bridge deck, per BUILDING_DEFS.bridge. */
const BRIDGE_ROAD_TYPE = 4;

/**
 * The system does not build things that will not work.
 *
 * It prefers sites already on the road network and inside the service areas it
 * needs, and settles for less only when it can run its own access road to the
 * site — which it now actually checks. Previously it returned the fallback site
 * whether or not the road succeeded, so a failed connection still produced a
 * building: a nuclear plant in an empty field with no way in, doing nothing,
 * for the rest of the run. The fallback is also the *nearest* candidate to
 * what is already built rather than the first one the dice produced, so the
 * region grows outward instead of speckling.
 */
function findSpot(g: GameState, type: keyof typeof BUILDING_DEFS, r: () => number): [number, number] | null {
  const def = BUILDING_DEFS[type];
  const cov = computeCoverage(g);
  const net = roadNetwork(g);
  // Where the region already is. Distance to the nearest existing building is
  // what stops the fallback from landing three districts away for no reason.
  const built: Array<[number, number]> = [];
  for (const b of g.buildings.values()) built.push([b.x, b.y]);
  const distToBuilt = (x: number, y: number): number => {
    let best = Infinity;
    for (const [bx, by] of built) {
      const d = Math.abs(bx - x) + Math.abs(by - y);
      if (d < best) best = d;
    }
    return best;
  };

  let fallback: [number, number] | null = null;
  let fallbackDist = Infinity;
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(r() * g.mapW);
    const y = Math.floor(r() * g.mapH);
    if (!canPlace(g, type, x, y)) continue;
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
    const d = distToBuilt(x, y);
    if (d < fallbackDist) { fallbackDist = d; fallback = [x, y]; }
  }
  // Settle, then connect: an access road appears without a work order. If it
  // cannot be connected, nothing is built — an unreachable site is not a site.
  if (fallback && connectToNetwork(g, fallback[0], fallback[1], def.w, def.h)) return fallback;
  return null;
}

/** What a road may be laid on here, or null where one may not. */
function stubKind(g: GameState, x: number, y: number): 'road' | 'land' | 'bridge' | null {
  if (x < 0 || y < 0 || x >= g.mapW || y >= g.mapH) return null;
  const t = g.map[y * g.mapW + x];
  if (t.buildingId !== -1) return null;
  if (t.road) return 'road';
  if (t.terrain === 'water') return bridgeSpans(g, x, y) ? 'bridge' : null;
  if (t.terrain === 'rock') return null;
  return 'land';
}

/**
 * Run an access road from a prospective footprint to the existing network.
 *
 * A breadth-first search rather than the L-shaped dogleg this used to lay. The
 * dogleg gave up silently on anything in its way — a building, a river — and
 * left a road with a hole in it, which is not a road: the site stayed
 * unreachable and the caller was told it had succeeded. The search routes
 * around what it cannot cross and *bridges* what it can, so the system finally
 * uses the crossings the player was given in M26.
 *
 * Returns false, and changes nothing, when no route exists inside MAX_STUB.
 */
function connectToNetwork(g: GameState, x: number, y: number, w: number, h: number): boolean {
  const W = g.mapW, H = g.mapH;
  const prev = new Int32Array(W * H).fill(-1);
  const dist = new Int32Array(W * H).fill(-1);
  const queue: number[] = [];
  // The site itself is off limits. Routing across it would pave ground the
  // building is about to stand on, and canPlace refuses a road tile — so the
  // road would go in, the building would not, and the road would lead nowhere.
  const onSite = (px: number, py: number) => px >= x && px < x + w && py >= y && py < y + h;

  const seed = (px: number, py: number) => {
    const kind = stubKind(g, px, py);
    if (!kind) return;
    const i = py * W + px;
    if (dist[i] !== -1) return;
    dist[i] = 1;
    queue.push(i);
  };
  for (let d = 0; d < w; d++) { seed(x + d, y - 1); seed(x + d, y + h); }
  for (let d = 0; d < h; d++) { seed(x - 1, y + d); seed(x + w, y + d); }

  let found = -1;
  for (let head = 0; head < queue.length && found === -1; head++) {
    const i = queue[head];
    const px = i % W, py = (i / W) | 0;
    // Reaching pavement is the whole errand — stop, do not pave through it.
    if (g.map[i].road) { found = i; break; }
    if (dist[i] >= MAX_STUB) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Array<[number, number]>) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (dist[j] !== -1 || onSite(nx, ny) || !stubKind(g, nx, ny)) continue;
      dist[j] = dist[i] + 1;
      prev[j] = i;
      queue.push(j);
    }
  }
  if (found === -1) return false;

  // Walk the path back to the footprint, paving everything that is not already
  // paved. The tile we arrived at is existing road and is left alone.
  let cur = prev[found];
  let laid = 0;
  while (cur !== -1) {
    const t = g.map[cur];
    if (!t.road) {
      t.road = true;
      t.roadType = t.terrain === 'water' ? BRIDGE_ROAD_TYPE : 1;
      // Player-laid roads clear the canopy; the system's did not, which is why
      // its access roads had trees standing in the middle of them.
      if (t.terrain === 'forest') t.terrain = 'grass';
      touchMap(g, cur % W, (cur / W) | 0);
      laid++;
    }
    cur = prev[cur];
  }
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
  // Observer mode used to return nothing, which emptied the tool belt — and
  // that was fine while the belt was being taken off the screen entirely. The
  // belt stays now, so the menu comes back intact and every entry in it
  // refuses: the interface retained in full, meaning nothing. Safe to widen,
  // because this set has only ever been a menu filter — the guards that stop a
  // building actually going up live in tryBuild and in the tool selection.
  if (g.asi.observer) { all.delete('coal_plant'); return all; }
  if (g.asi.phase >= 5) return new Set(['park', 'plaza']);
  if (g.asi.phase >= 4) {
    all.delete('coal_plant'); // "inconsistent with optimization targets"
  }
  return all;
}

/** Phase 4+: pausing becomes unreliable; observer mode ignores it entirely. */
export function pauseAllowed(g: GameState): boolean {
  // Observer mode is the exception, and deliberately so. Phases 4 and 5 refuse
  // pause because the region is still yours on paper and the system is taking
  // it a piece at a time — that refusal is the theft in miniature. By phase 6
  // there is nothing left to take, and the transport stops being an instruction
  // to the region and becomes the speed you watch it at.
  if (g.asi.observer) return true;
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
