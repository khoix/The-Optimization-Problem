import type { Building, BuildingDef, BuildingType, GameState } from './types';
import { BUILDING_DEFS, TIER_NAMES, UPGRADE_PATH, upgradeTargetOf } from './buildings';
import { canDemolish } from './asi';
import { placeBuilding, record, removeBuilding, tileAt } from './state';
import { buildingCondition, tierOf } from './sim';

// ---------------------------------------------------------------------------
// Growing in place.
//
// Until now the only way to get a denser block was to demolish the one you had
// and draw the next one over the hole: two clicks, a confirmation, a refund
// worth a third of nothing, and a site that anyone — including the system —
// could take while it stood empty. Regions grew outward because outward was the
// only direction the interface offered.
//
// An upgrade is that same replacement, done as one decision, with the
// foundations and the connections counted as worth something.
//
// It is a player action. Nothing in the simulation calls into this file, and
// nothing in `asi.ts` does either: `performUpgrade` has exactly one caller, an
// onclick handler in the inspector. The system takes plenty in this game, and
// it will build over your region without asking — but it never quietly
// replaces a building you put there with a bigger one and hands you the bill.
// ---------------------------------------------------------------------------

/**
 * What the old building is worth against the new one, before wear.
 *
 * Deliberately better than the 35% demolition refund. Scrapping a block gets
 * you scrap value; upgrading it keeps the site, the frontage and the service
 * hookups, and the price should say so — otherwise the feature is a shortcut
 * for something the player could already do, which is not worth a button.
 */
export const UPGRADE_CREDIT = 0.5;

/**
 * How much of the replacement is already standing on the day work starts.
 *
 * Not a discount — a head start. The ground is cleared, the road is there and
 * the trenches are dug, so the new building arrives sooner than one raised on
 * open grass. It still takes months, and the housing is still gone for those
 * months: upgrading a full apartment block empties it, and the population
 * figure will say so.
 */
export const UPGRADE_HEAD_START = 0.3;

/** An upgrade never costs less than this fraction of the replacement. */
const MIN_PRICE = 0.1;

// The ladders themselves live in buildings.ts, next to the definitions they
// describe and out of the import cycle this module sits in.
export { UPGRADE_PATH, upgradeTargetOf };

export interface UpgradePlan {
  from: BuildingType;
  to: BuildingType;
  toDef: BuildingDef;
  /** What the player pays: replacement cost less the trade-in. */
  cost: number;
  /** The trade-in itself, scaled by how well the old building was kept. */
  credit: number;
  /** Where the replacement is anchored. Not always where the old one was. */
  x: number;
  y: number;
  /** False when the step exists but cannot be taken right now. */
  ok: boolean;
  reason?: string;
}

/** "a Mid-Rise Block", "an Apartment Block". Only ever fed building names. */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}


/**
 * Can the replacement's footprint sit at this anchor?
 *
 * Not `canPlace`, because the tiles the old building occupies are exactly the
 * tiles the new one wants, and `canPlace` would refuse every one of them. The
 * rest of the rules are the same ones placement uses.
 */
function fits(g: GameState, b: Building, def: BuildingDef, ax: number, ay: number): boolean {
  for (let dy = 0; dy < def.h; dy++) {
    for (let dx = 0; dx < def.w; dx++) {
      const t = tileAt(g, ax + dx, ay + dy);
      if (!t) return false;
      if (t.buildingId === b.id) continue;
      if (t.terrain === 'water' || t.terrain === 'rock') return false;
      if (t.buildingId !== -1) return false;
      if (t.road) return false;
    }
  }
  return true;
}

/**
 * Where a bigger replacement goes.
 *
 * A 2×2 block becoming 3×3 has four anchors that still cover the original, and
 * insisting on the top-left one would refuse an upgrade whenever the room
 * happened to be on the other side. All four are tried; the one that keeps the
 * new building closest to centred on the old wins, so a block grows around
 * itself rather than lurching down and right.
 */
function anchorFor(g: GameState, b: Building, from: BuildingDef, to: BuildingDef): { x: number; y: number } | null {
  const idealX = b.x + (from.w - to.w) / 2;
  const idealY = b.y + (from.h - to.h) / 2;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (let ay = b.y + from.h - to.h; ay <= b.y; ay++) {
    for (let ax = b.x + from.w - to.w; ax <= b.x; ax++) {
      if (!fits(g, b, to, ax, ay)) continue;
      const score = Math.abs(ax - idealX) + Math.abs(ay - idealY);
      if (score < bestScore) { bestScore = score; best = { x: ax, y: ay }; }
    }
  }
  return best;
}

/**
 * Everything the interface needs to draw the button and everything the action
 * needs to run, from one place, so the label can never promise a price the
 * click does not charge.
 *
 * Returns null when the type has no successor at all — no button. Returns a
 * plan with `ok: false` when there is a step and it is currently out of reach,
 * because "this becomes a Mid-Rise Block, once the region is a City" is worth
 * saying and an absent button says nothing.
 */
export function upgradePlan(g: GameState, buildingId: number): UpgradePlan | null {
  const b = g.buildings.get(buildingId);
  if (!b) return null;
  const to = upgradeTargetOf(b.type);
  if (!to) return null;
  const fromDef = BUILDING_DEFS[b.type];
  const toDef = BUILDING_DEFS[to];

  const credit = Math.round(fromDef.cost * UPGRADE_CREDIT * buildingCondition(b));
  const cost = Math.max(Math.round(toDef.cost * MIN_PRICE), toDef.cost - credit);
  const anchor = anchorFor(g, b, fromDef, toDef);
  const base: UpgradePlan = {
    from: b.type, to, toDef, cost, credit,
    x: anchor?.x ?? b.x, y: anchor?.y ?? b.y, ok: true,
  };
  const no = (reason: string): UpgradePlan => ({ ...base, ok: false, reason });

  if (b.progress < 1) return no('Still under construction.');
  const tier = TIER_NAMES.indexOf(tierOf(g.population).name);
  if (toDef.unlockTier != null && tier < toDef.unlockTier) {
    return no(`${toDef.name} requires region class: ${TIER_NAMES[toDef.unlockTier]}.`);
  }
  if (toDef.unlockCompute && g.resources.compute < toDef.unlockCompute) {
    return no(`${toDef.name} requires ${toDef.unlockCompute} regional compute capacity.`);
  }
  // Replacing a building demolishes one. Anything the system will not let you
  // decommission is not something you may quietly rebuild either.
  const demo = canDemolish(g, buildingId);
  if (!demo.ok) return no(demo.reason ?? 'Unavailable.');
  if (!anchor) {
    return no(`No room to expand: ${withArticle(toDef.name)} needs ${toDef.w}×${toDef.h} clear tiles and they are not free here.`);
  }
  if (g.resources.capital < cost) return no('Insufficient capital.');
  return base;
}

/**
 * Take the step. Returns the replacement, or null if the plan was not viable.
 *
 * The single caller is the inspector's Upgrade button.
 */
export function performUpgrade(g: GameState, buildingId: number): Building | null {
  const plan = upgradePlan(g, buildingId);
  if (!plan || !plan.ok) return null;
  const b = g.buildings.get(buildingId)!;
  const from = BUILDING_DEFS[plan.from];
  const at = { x: b.x, y: b.y };

  removeBuilding(g, buildingId);
  const nb = placeBuilding(g, plan.to, plan.x, plan.y, { free: true });
  if (!nb) {
    // Should be unreachable — the plan checked the same tiles this placement
    // does. If it ever is reached, the player keeps their building rather than
    // losing it to a hole in the map.
    placeBuilding(g, plan.from, at.x, at.y, { free: true, instant: true });
    return null;
  }
  g.resources.capital -= plan.cost;
  nb.progress = UPGRADE_HEAD_START;
  // Whatever raised the old building, the new one is the player's decision.
  delete nb.asiBuilt;
  record(g, 'build', `Upgraded ${from.name} to ${plan.toDef.name} (§${plan.cost}).`);
  return nb;
}
