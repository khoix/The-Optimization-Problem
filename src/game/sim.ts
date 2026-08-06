import type { Building, GameState } from './types';
import { BUILDING_DEFS } from './buildings';
import { POLICY_DEFS } from './policies';
import { notify, policyActive, record, removeBuilding, rng, tileAt } from './state';
import { updateAsi } from './asi';
import { maybeFireEvent } from './events';
import { updatePolitics, weightedApproval } from './politics';
import { scenarioDef } from './scenarios';
import { computeConnectivity, computeCoverage, covered } from './network';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Move `cur` toward `target` by at most `rate`. */
function approach(cur: number, target: number, rate: number): number {
  return cur + Math.max(-rate, Math.min(rate, target - cur));
}

/**
 * Output multiplier from age: full for the first five years, then declining
 * toward 55%. Renovation resets age; neglect is a real ongoing cost.
 */
export function buildingCondition(b: Building): number {
  return Math.max(0.55, Math.min(1, 1 - (b.age - 60) * 0.0022));
}

/**
 * What comes back when a building is demolished.
 *
 * Removing a building used to return nothing at all, which made correcting a
 * placement mistake cost the full price twice — once to build it and once to
 * be rid of it. A partial refund scaled by condition keeps demolition a real
 * loss without making the map unforgiving to learn on: a worn-out plant is
 * worth scrapping, a new one you misplaced is worth moving.
 */
export const DEMOLITION_REFUND = 0.35;

export function demolitionRefund(b: Building): number {
  return Math.round(BUILDING_DEFS[b.type].cost * DEMOLITION_REFUND * buildingCondition(b));
}

/** Demolish and credit the refund. Returns what came back. */
export function demolishBuilding(g: GameState, id: number): number {
  const b = g.buildings.get(id);
  if (!b) return 0;
  const refund = demolitionRefund(b);
  g.resources.capital += refund;
  removeBuilding(g, id);
  return refund;
}

/** Upkeep multiplier: old infrastructure costs more to keep limping along. */
function upkeepWear(b: Building): number {
  return 1 + Math.max(0, b.age - 60) / 400;
}

/** Population tier: bigger regions live on a faster treadmill. */
const TIERS = [
  { name: 'Township', min: 0, mig: 1.0, comp: 1.0, exp: 1.0 },
  { name: 'City', min: 150, mig: 1.7, comp: 1.5, exp: 1.25 },
  { name: 'Metropolis', min: 400, mig: 2.6, comp: 2.3, exp: 1.6 },
  { name: 'Megaregion', min: 900, mig: 3.8, comp: 3.4, exp: 2.1 },
];
/** How far the region has come toward its next class, 0..1 (1 at the top). */
export function tierProgress(pop: number): number {
  const i = TIERS.findIndex((t) => t === tierOf(pop));
  const next = TIERS[i + 1];
  if (!next) return 1;
  const from = TIERS[i].min;
  return Math.max(0, Math.min(1, (pop - from) / (next.min - from)));
}

export function tierOf(pop: number): (typeof TIERS)[number] {
  let t = TIERS[0];
  for (const cand of TIERS) if (pop >= cand.min) t = cand;
  return t;
}

/**
 * How many months the rate bar averages over.
 *
 * A single tick's net is noise: one event or one construction slams it to a
 * rail and back. Half a year of mean is still responsive to a real change in
 * the region's finances and stops the bar flickering at something the player
 * cannot act on.
 */
export const NET_WINDOW = 6;

export function simTick(g: GameState): void {
  if (g.gameOver && !g.asi.observer) return;
  g.tick++;
  const capitalBefore = g.resources.capital;
  const r = rng(g.seed + g.tick * 31);
  const has = (p: Parameters<GameState['policies']['has']>[0]) => policyActive(g, p);

  const T = tierOf(g.population);

  // ---------- Construction & aging ----------
  for (const b of g.buildings.values()) {
    // Under the ASI, infrastructure is maintained to a standard no human
    // budget ever managed. Until then, everything decays.
    if (!g.asi.observer) b.age++;
    else if (b.age > 0) b.age--;
    if (b.progress < 1) {
      const def = BUILDING_DEFS[b.type];
      // Industry compute allocation speeds construction; ASI builds even faster.
      let speedup = 1 + g.alloc.industry * computeSatisfaction(g) * 0.8 + (g.asi.phase >= 1 ? 0.5 : 0);
      // Organized resistance slows the permits, then blocks the gates.
      if (g.resistanceStage >= 5) speedup *= 0.35;
      else if (g.resistanceStage >= 3) speedup *= 0.7;
      b.progress = Math.min(1, b.progress + speedup / def.buildTicks);
      if (b.progress >= 1 && !b.asiBuilt) {
        notify(g, `${def.name} completed.`, 'info');
      }
    }
  }

  // ---------- Utility capacity & demand ----------
  let powerCap = 0, powerDem = 0, waterCap = 0, waterDem = 0;
  let computeProduced = 0, jobsTotal = 0, housing = 0, income = 0, upkeep = 0;
  const renewableBoost = has('renewable_subsidy') ? 1.3 : 1;

  // Scenario climate: desert sun makes solar sing; desert aquifers do not.
  const scen = scenarioDef(g.scenario);
  const done = [...g.buildings.values()].filter((b) => b.progress >= 1);

  // Spatial infrastructure: who is on the network, and who is in range.
  const conn = computeConnectivity(g);
  const cov = computeCoverage(g);

  for (const b of done) {
    const def = BUILDING_DEFS[b.type];
    const cond = buildingCondition(b);
    if (def.power > 0) powerCap += def.power * cond * (b.type === 'solar_farm' ? renewableBoost * scen.solarFactor : 1);
    // A building outside the service area draws nothing: it isn't connected.
    else if (covered(g, b, cov.power)) powerDem += -def.power;
    if (def.water > 0) waterCap += def.water * cond * scen.waterFactor;
    else if (covered(g, b, cov.water)) waterDem += -def.water;
  }
  powerCap = Math.round(powerCap);
  waterCap = Math.round(waterCap);
  // Population baseline demand.
  powerDem += g.population * 0.04;
  waterDem += g.population * 0.05;
  if (has('water_rationing')) waterDem *= 0.85;

  const powerSat = powerDem > 0 ? clamp01(powerCap / powerDem) : 1;
  const waterSat = waterDem > 0 ? clamp01(waterCap / waterDem) : 1;
  const utilitySat = Math.min(powerSat, waterSat);

  // ---------- Building activity, jobs, output ----------
  // Three gates now stand between a building and operation: it must be on
  // the road network, reachable by workers, and inside a service area for
  // whatever it consumes. Placement is a real decision.
  for (const b of done) {
    const def = BUILDING_DEFS[b.type];
    const cond = buildingCondition(b);
    b.offlineReason = undefined;
    const needsRoad = def.jobs > 0 || def.housing > 0;
    const needsPower = def.power < 0;
    const needsWater = def.water < 0;
    if (needsRoad && !conn.onRoad.has(b.id)) b.offlineReason = 'road';
    else if (def.jobs > 0 && !conn.labourReachable.has(b.id)) b.offlineReason = 'labor';
    else if (needsPower && !covered(g, b, cov.power)) b.offlineReason = 'power';
    else if (needsWater && !covered(g, b, cov.water)) b.offlineReason = 'water';
    else if ((needsPower || needsWater) && utilitySat <= 0.35) b.offlineReason = 'utility';
    b.active = b.offlineReason === undefined;
    if (!b.active) continue;
    jobsTotal += def.jobs;
    housing += def.housing;
    upkeep += def.upkeep * upkeepWear(b);
    if (def.compute > 0) computeProduced += def.compute * utilitySat * cond;
  }
  if (has('manual_redundancy')) jobsTotal = Math.round(jobsTotal * 1.15);
  if (has('human_staffing')) jobsTotal = Math.round(jobsTotal * 1.1);
  if (has('reduced_workweek')) jobsTotal = Math.round(jobsTotal * 1.12);

  const labourForce = Math.floor(g.population * 0.55);
  let jobsFilled = Math.min(jobsTotal, labourForce);
  // Public employment hires from whoever remains.
  let publicHires = 0;
  if (has('public_employment')) {
    publicHires = Math.min(labourForce - jobsFilled, Math.floor(g.population * 0.06));
    jobsFilled += publicHires;
  }
  const unemployment = labourForce > 0 ? clamp01(1 - jobsFilled / labourForce) : 0;

  // ---------- Compute market ----------
  // The demand floor grows on its own: chips get cheaper, services get
  // hungrier, and the wider economy digitizes whether or not this region does.
  g.computeBase = Math.min(2500, g.computeBase * (1 + 0.0035 * T.comp + g.corporateInfluence * 0.004));
  const computeDemand =
    g.computeBase +
    g.expectations * 0.12 +
    g.population * 0.03 * (1 + g.indicators.convenience / 150) + // consumer appetite grows with convenience
    (has('public_broadband') ? 6 : 0) +
    (has('surveillance_program') ? 8 : 0) +
    (has('moderation_ai') ? 6 : 0) +
    (has('data_localization') ? 5 : 0) +
    (has('public_ai_option') ? 6 : 0) +
    g.corporateInfluence * 30;
  const computeSat = computeDemand > 0 ? clamp01(computeProduced / computeDemand) : 1;

  // ---------- Money ----------
  for (const b of done) {
    if (!b.active) continue;
    const def = BUILDING_DEFS[b.type];
    let inc = def.income;
    if (b.type === 'auto_factory' || b.type === 'factory') {
      // Consumer purchasing power gates industrial revenue: the automation trap.
      const purchasing = clamp01(1 - unemployment * 1.4) * (has('ubi') ? 1.05 : 1);
      inc *= 0.4 + 0.6 * purchasing;
      if (b.type === 'auto_factory' && has('automation_tax')) inc *= 0.8;
    }
    if (b.type === 'retail') {
      inc *= clamp01(1 - unemployment * 1.6) * (has('ubi') ? 1.1 : 1);
    }
    if (def.category === 'compute') {
      inc *= 0.5 + 0.5 * computeSat;
      if (has('corporate_incentives')) inc *= 0.7; // we gave away the margin
    }
    income += inc * buildingCondition(b);
  }
  income += g.population * 0.06 * clamp01(1 - unemployment); // income tax
  // A tight housing market extracts rent — and the rent gets taxed.
  income += g.population * 0.02 * g.housingShortage;
  if (has('automation_tax')) {
    income += [...g.buildings.values()].filter((b) => b.type === 'auto_factory' && b.active).length * 6;
  }
  if (has('corporate_incentives')) income += 10; // attracted investment

  // Output-shaping policies trade revenue for other goods.
  if (has('reduced_workweek')) income *= 0.95;
  if (has('human_staffing')) income *= 0.96;
  if (has('local_procurement')) income *= 0.97;
  if (has('antitrust_enforcement')) income *= 0.94;
  if (has('carbon_tax')) income += done.filter((b) => b.type === 'coal_plant' && b.active).length * 5;

  // Boycotts hit revenue; strikes hit output on top of that.
  if (g.resistanceStage >= 6) income *= 0.78;
  else if (g.resistanceStage >= 4) income *= 0.88;

  let expenses = upkeep;
  for (const p of g.policies) expenses += POLICY_DEFS[p].costPerTick;
  if (has('ubi')) expenses += g.population * unemployment * 0.22;
  if (has('public_employment')) expenses += publicHires * 0.3;
  if (has('citizen_royalties')) expenses += g.population * 0.012;

  g.resources.capital += income - expenses;

  // ---------- Personal data ----------
  const dataRate =
    g.population * 0.02 * (0.5 + g.indicators.convenience / 100) *
    (has('data_privacy') ? 0.35 : 1) *
    (has('citizen_royalties') ? 0.7 : 1) *
    (has('childrens_privacy') ? 0.9 : 1) *
    (has('surveillance_program') ? 1.6 : 1) *
    (has('biometric_surveillance') ? 1.5 : 1);
  g.resources.data += dataRate;
  if (has('right_to_delete')) g.resources.data *= 0.995;

  // ---------- Pollution field ----------
  diffusePollution(g);

  // ---------- Attractiveness: why people do or don't want to live here ----------
  // Every component is named and inspectable. Amenities and services are
  // measured as coverage per capita, so a growing region must keep building
  // them or watch its own appeal decay.
  let amenityPoints = 0, servicePoints = 0;
  for (const b of done) {
    if (!b.active) continue;
    const def = BUILDING_DEFS[b.type];
    const cond = buildingCondition(b);
    amenityPoints += (def.amenity ?? 0) * cond;
    servicePoints += (def.services ?? 0) * cond;
  }
  const perCapita = (points: number, per: number) => clamp01(points / Math.max(1, g.population / per));

  const att = g.attractiveness;
  // Jobs: are there openings, and are people in them?
  att.jobs = clamp01(0.35 * clamp01(jobsTotal / Math.max(1, labourForce)) + 0.65 * clamp01(1 - unemployment * 1.6));
  att.housing = clamp01(1 - g.housingShortage * 1.15);
  att.amenities = perCapita(amenityPoints, 90) * (has('green_belt') ? 1.05 : 1);
  att.services = perCapita(servicePoints, 110);
  att.environment = clamp01(1 - g.pollutionAvg * 2.4);
  att.safety = clamp01(g.indicators.security / 100 - g.unrest * 0.5);
  // Cost of living: scarcity is priced, and someone always pays it.
  att.cost = clamp01(1 - g.housingShortage * 0.8 - Math.max(0, 1 - utilitySat) * 0.4
    - (has('carbon_tax') ? 0.05 : 0) + (has('ubi') ? 0.12 : 0) + (has('free_transit') ? 0.06 : 0));
  att.overall = clamp01(
    att.jobs * 0.24 + att.housing * 0.2 + att.amenities * 0.14 + att.services * 0.12 +
    att.environment * 0.11 + att.safety * 0.09 + att.cost * 0.1);

  // ---------- Population: exogenous migration pressure ----------
  // The wider world keeps producing people who want in. Demand grows with
  // time and tier, accelerates when the region is attractive, and only bleeds
  // away slowly when it isn't — growth is absorbed, not authorized.
  const desirability = att.overall;
  const pull = 0.35 + desirability;
  g.migrationDemand += (1.4 + g.tick * 0.012) * T.mig * pull;
  if (desirability < 0.35) g.migrationDemand -= g.migrationDemand * (0.05 - desirability * 0.07);
  g.migrationDemand = Math.max(20, Math.min(g.migrationDemand, g.population * 3 + 500));

  // The green belt protects land housing would otherwise sprawl into.
  const capacity = Math.max(20, housing) * (has('green_belt') ? 0.96 : 1);
  // People squeeze in ~10% past nominal capacity when they're desperate.
  const target = Math.min(g.migrationDemand, capacity * 1.1) * (0.5 + desirability * 0.55);
  g.population = Math.max(10, Math.round(approach(g.population, target, Math.max(2, g.population * 0.03))));
  g.peakPopulation = Math.max(g.peakPopulation, g.population);

  // Unmet demand is not a tidy cap — it is a shortage with consequences.
  g.housingShortage = clamp01((g.migrationDemand - capacity) / Math.max(60, g.migrationDemand));

  // Stagnation is a choice with costs: investment follows growth.
  const growth = (g.population - g.lastPopulation) / Math.max(20, g.lastPopulation);
  g.lastPopulation = g.population;
  g.resources.capital += income * Math.max(-0.12, Math.min(0.18, growth * 6)); // investor sentiment on top of base income

  // ---------- Region reclassification ----------
  const tierNow = tierOf(g.population).name;
  if (tierNow !== g.tierName) {
    const upgraded = tierOf(g.population).min > (TIERS.find((x) => x.name === g.tierName)?.min ?? 0);
    g.tierName = tierNow;
    record(g, 'system', `Region reclassified: ${tierNow}.`);
    if (g.asi.observer) {
      // nothing to announce; nobody to announce it to
    } else if (g.asi.phase >= 4) {
      notify(g, 'Regional classification updated for administrative efficiency.', 'asi');
    } else if (upgraded) {
      notify(g, `The region has been reclassified as a ${tierNow}.`, 'system');
      g.pendingReport = {
        title: `Region Reclassified: ${tierNow}`,
        body: `The census bureau confirms it: this is a <b>${tierNow}</b> now.<br><br>` +
          'Congratulations are in order, and so is a warning. Larger regions attract migrants faster, ' +
          'normalize services quicker, and demand more compute for everything. The treadmill does not slow down at the next class. It speeds up.',
      };
    } else {
      notify(g, `The region has been reclassified as a ${tierNow}. The census is unsentimental.`, 'warn');
      g.pendingReport = {
        title: `Reclassification: ${tierNow}`,
        body: `Population decline has moved the region down a class. Investors read the census too.<br><br>` +
          'Migration pressure eases at this size — which is another way of saying fewer people want to be here.',
      };
    }
  }

  // ---------- Human expertise ----------
  const automationShare = jobsTotal > 0 ? clamp01(done.filter((b) => b.type === 'auto_factory').length * 0.1 + computeSat * g.alloc.industry) : 0;
  let expertiseTarget = clamp01(0.9 - automationShare * 0.5 - g.asi.emergence / 300);
  if (has('manual_redundancy')) expertiseTarget += 0.15;
  if (has('retraining')) expertiseTarget += 0.1;
  if (has('human_staffing')) expertiseTarget += 0.05;
  // Schools and libraries make expertise renewable rather than inherited.
  expertiseTarget += clamp01(done.filter((b) => (b.type === 'school' || b.type === 'library') && b.active).length / Math.max(1, g.population / 200)) * 0.12;
  expertiseTarget += done.filter((b) => b.type === 'community_dc' && b.active).length * 0.03;
  g.humanExpertise = clamp01(approach(g.humanExpertise, clamp01(expertiseTarget), 0.008));

  // ---------- Social indicators ----------
  const ind = g.indicators;
  const a = g.alloc;
  const cs = computeSat;
  const medDCs = done.filter((b) => b.type === 'med_dc' && b.active).length;
  const govDCs = done.filter((b) => b.type === 'gov_dc' && b.active).length;
  const communityDCs = done.filter((b) => b.type === 'community_dc' && b.active).length;

  // The expectations ratchet: citizens quickly normalize whatever service
  // level they get, and only very slowly forgive its loss. Yesterday's luxury
  // is today's baseline and tomorrow's grievance.
  if (!g.asi.observer) {
    if (ind.convenience > g.expectations) {
      g.expectations = Math.min(100, g.expectations + (ind.convenience - g.expectations) * 0.05 * T.exp);
    } else {
      g.expectations = Math.max(25, g.expectations - 0.05);
    }
  }
  const expectationGap = Math.max(0, g.expectations - ind.convenience);

  // In observer mode the social indicators belong to the system: its
  // optimization drift (in updateAsi) is the only author, and the ordinary
  // civic formulas below no longer apply. The society is not responding to
  // conditions anymore. It is being conditioned.
  if (!g.asi.observer) {

  // Convenience: consumer compute + broadband; hurt by outages and rationing.
  ind.convenience = clamp(approach(ind.convenience,
    30 + a.consumer * cs * 90 + (has('public_broadband') ? 8 : 0) + (has('free_transit') ? 6 : 0)
      - (has('water_rationing') ? 6 : 0) + utilitySat * 10, 2.2));

  // Health: hospitals + dedicated medical compute − pollution − psych toll of heavy consumer tech.
  const hospitals = done.filter((b) => b.type === 'hospital' && b.active).length;
  const careCapacity = clamp01(
    (hospitals * 260 * (0.6 + a.healthcare * cs * 1.2) + medDCs * 150 * (0.5 + a.healthcare * cs)) / Math.max(1, g.population));
  // Recreation keeps people well in ways clinics can't.
  const sportsCoverage = clamp01(done.filter((b) => b.type === 'sports_complex' && b.active).length / Math.max(1, g.population / 300));
  ind.health = clamp(approach(ind.health,
    35 + careCapacity * 45 - g.pollutionAvg * 55 - Math.max(0, ind.convenience - 70) * 0.25 - g.housingShortage * 9
      + (has('green_belt') ? 3 : 0) + (has('ewaste_program') ? 2 : 0)
      + sportsCoverage * 7 + g.attractiveness.amenities * 4, 1.6));

  // Connection: shared physical institutions are what make strangers into
  // neighbors; heavy consumer tech isolates.
  ind.connection = clamp(approach(ind.connection,
    52 + g.attractiveness.amenities * 18 + communityDCs * 2
      + (has('reduced_workweek') ? 4 : 0) + (has('green_belt') ? 2 : 0)
      - Math.max(0, ind.convenience - 55) * 0.5 - (has('public_broadband') ? 4 : 0), 1.2));

  // Security: employment + surveillance + police-by-algorithm.
  ind.security = clamp(approach(ind.security,
    45 + clamp01(1 - unemployment) * 25 + (has('surveillance_program') ? 18 : 0) + (has('biometric_surveillance') ? 15 : 0)
      + (has('data_localization') ? 3 : 0) + govDCs * 3 + a.surveillance * cs * 25 - g.unrest * 30, 1.8));

  // Agency: eroded by surveillance, data harvesting, automation of decisions;
  // rebuilt by rights citizens can actually exercise.
  ind.agency = clamp(approach(ind.agency,
    70 - (has('surveillance_program') ? 15 : 0) - (has('biometric_surveillance') ? 16 : 0) - a.surveillance * cs * 20
      - clamp01(g.resources.data / 4000) * 20 - g.corporateInfluence * 20 - g.asi.emergence * 0.25 - govDCs * 2
      + (has('data_privacy') ? 12 : 0) + (has('citizen_royalties') ? 6 : 0) + (has('right_to_delete') ? 5 : 0)
      + (has('algorithmic_transparency') ? 5 : 0) + (has('public_ai_option') ? 5 : 0) + communityDCs * 3, 1.2));

  // Trust: transparency vs scandal; moderation cuts both ways.
  ind.trust = clamp(approach(ind.trust,
    55 + (has('data_privacy') ? 8 : 0) + (has('open_data_portal') ? 6 : 0) + (has('algorithmic_transparency') ? 4 : 0)
      + (has('citizen_royalties') ? 3 : 0) + communityDCs * 2 - g.corporateInfluence * 25
      - (has('moderation_ai') ? 6 : 0) + (has('moderation_ai') ? 6 * cs * a.government : 0)
      - (has('biometric_surveillance') ? 8 : 0)
      - g.unrest * 20 - g.housingShortage * 8 - Math.max(0, g.asi.emergence - 40) * 0.2, 1.2));

  // Future confidence follows the blend — plus visible momentum, minus the
  // gap between what people have and what they now consider normal.
  ind.futureConfidence = clamp(approach(ind.futureConfidence,
    (ind.convenience * 0.2 + ind.health * 0.25 + ind.security * 0.2 + ind.trust * 0.2 + clamp01(1 - unemployment) * 100 * 0.15)
      + Math.max(-10, Math.min(8, growth * 300)) - expectationGap * 0.2 - g.housingShortage * 6, 1.5));

  // ---------- Unrest ----------
  const grievance =
    Math.max(0, 55 - ind.trust) / 100 +
    Math.max(0, 50 - ind.agency) / 120 +
    unemployment * (has('ubi') ? 0.3 : 0.8) +
    Math.max(0, g.pollutionAvg - 0.15) * 1.2 +
    Math.max(0, 1 - utilitySat) * 0.8 +
    g.housingShortage * 0.35 +
    expectationGap / 140 +
    Math.max(0, 45 - weightedApproval(g)) / 160; // angry coalitions organize
  const pacification = a.consumer * cs * 0.5 + (has('surveillance_program') ? 0.1 : 0);
  g.unrest = clamp01(approach(g.unrest, clamp01(grievance - pacification), 0.04));

  } // end !observer indicator block

  g.jobsTotal = jobsTotal;
  g.jobsFilled = jobsFilled;
  g.labourForce = labourForce;
  // Unemployment and vacancies are two ends of one axis: with more posts than
  // workers the region cannot staff them, which is a different problem with a
  // different fix, and the interface should say which one you have.
  g.jobVacancies = Math.max(0, jobsTotal - jobsFilled + publicHires);
  g.unemployment = unemployment;
  g.resources.powerCapacity = powerCap;
  g.resources.powerDemand = Math.round(powerDem);
  g.resources.waterCapacity = waterCap;
  g.resources.waterDemand = Math.round(waterDem);
  g.resources.compute = Math.round(computeProduced);
  g.resources.computeDemand = Math.round(computeDemand);

  // ---------- Warnings (the optimized society has nothing to warn about) ----------
  if (!g.asi.observer) {
    // Standing conditions are keyed, so a shortage that lasts a decade is one
    // alert that keeps updating rather than thirty copies of the same sentence.
    if (powerSat < 0.85) {
      notify(g, 'Grid strain: electricity demand is outpacing capacity.', 'warn',
        { key: 'power', severity: powerSat < 0.6 ? 'high' : 'medium' });
    }
    if (waterSat < 0.85) {
      notify(g, 'Water reserves are running low. Cooling towers are thirsty.', 'warn',
        { key: 'water', severity: waterSat < 0.6 ? 'high' : 'medium' });
    }
    if (g.resources.capital < 0) {
      notify(g, `The budget is in deficit: §${Math.round(-g.resources.capital)} in the red.`, 'warn',
        { key: 'deficit', severity: g.resources.capital < -2000 ? 'high' : 'medium' });
    }
    if (g.housingShortage > 0.3) {
      notify(g, `Housing shortage: ${Math.round(g.migrationDemand - capacity)} would-be residents cannot find homes.`, 'warn',
        { key: 'housing', severity: g.housingShortage > 0.6 ? 'high' : 'medium' });
    }
    const stranded = done.filter((b) => b.offlineReason === 'road' || b.offlineReason === 'labor').length;
    const unserved = done.filter((b) => b.offlineReason === 'power' || b.offlineReason === 'water').length;
    if (stranded > 0) {
      notify(g, `${stranded} building${stranded > 1 ? 's are' : ' is'} idle for want of a road connection to housing.`, 'warn',
        { key: 'stranded', severity: stranded > 5 ? 'high' : 'medium' });
    }
    if (unserved > 0) {
      notify(g, `${unserved} building${unserved > 1 ? 's sit' : ' sits'} outside every utility service area.`, 'warn',
        { key: 'unserved', severity: unserved > 5 ? 'high' : 'medium' });
    }
  }

  // ---------- Slow-burn failure counters ----------
  const fc = g.failCounters;
  fc.blackout = utilitySat < 0.5 ? fc.blackout + 1 : 0;
  fc.environment = g.pollutionAvg > 0.35 ? fc.environment + 1 : 0;
  const inactiveShare = done.length > 4 ? done.filter((b) => !b.active).length / done.length : 0;
  fc.inactive = inactiveShare > 0.5 ? fc.inactive + 1 : 0;

  if (!g.asi.observer) {
    if (fc.blackout === 5) notify(g, 'Sustained blackouts and dry taps. The region cannot absorb much more of this.', 'warn', { severity: 'high' });
    if (fc.environment === 6) notify(g, 'Air-quality alerts have become a daily fixture. Doctors are going on record.', 'warn', { severity: 'high' });
  }

  // ---------- Conventional failure states ----------
  // Visible, recognizable failures — unlike the other ending, which arrives
  // while the numbers are improving.
  if (!g.gameOver && !g.asi.observer) {
    if (g.resources.capital < -600) g.gameOver = 'Bankruptcy. The region enters receivership; a consortium of technology firms offers to administer essential services.';
    else if (g.unrest > 0.92) g.gameOver = 'Uncontrolled civil unrest. The regional government is dissolved after months of blockades and blackouts.';
    else if (g.indicators.health < 8) g.gameOver = 'Public-health collapse. The region empties as those who can afford to leave do so.';
    else if (fc.blackout >= 10) g.gameOver = 'Grid and water-system failure. After months of cascading outages, essential services cannot be restarted with the staff that remain.';
    else if (fc.inactive >= 8) g.gameOver = 'Infrastructure collapse. Most of the region\'s facilities have gone dark, and there is no capacity left to bring them back.';
    else if (fc.environment >= 12) g.gameOver = 'Environmental catastrophe. The region is declared unfit for habitation; remediation is projected in decades.';
    else if (g.corporateInfluence > 0.85) g.gameOver = 'Corporate takeover. The consortium now operates every essential system. Your office is retained for signatures.';
    else if (g.peakPopulation > 150 && g.population < g.peakPopulation * 0.3) g.gameOver = 'Mass migration. The region empties; the last census team does not bother finishing.';
    if (g.gameOver) {
      notify(g, g.gameOver, 'system', { severity: 'high' });
      record(g, 'system', `Administration terminated: ${g.gameOver}`);
    }
  }

  // ---------- Politics: groups, corporations, resistance, elections ----------
  updatePolitics(g, { unemployment, utilitySat, computeSat, automationShare, growth, expectationGap });

  // ---------- ASI & events ----------
  updateAsi(g, { computeProduced, computeSat, automationShare, utilitySat });
  if (!g.pendingEvent && g.asi.phase < 6) maybeFireEvent(g, r);

  // ---------- Cashflow, for the bar ----------
  // Measured as the treasury's real change across the whole tick, so whatever
  // moved it — trading, sentiment, an event resolved into this month — is in
  // the figure the player is shown.
  g.lastNet = g.resources.capital - capitalBefore;
  g.lastIncome = income;
  g.lastOutgoings = expenses;
  if (!g.netHistory) g.netHistory = [];
  g.netHistory.push(g.lastNet);
  if (g.netHistory.length > NET_WINDOW) g.netHistory.shift();
}

/**
 * The rate bar's reading: mean recent net, as a fraction of turnover.
 *
 * The reference has to be something that means the same thing at sixty
 * residents and sixty thousand, which rules out a fixed figure, and something
 * that does not quietly rescale itself out from under a player who has learned
 * to read it, which rules out a rolling maximum.
 *
 * It was gross *outgoings*, and that was wrong in a way only play could show:
 * a founding town spends about §6 a month and nets about §35, so the ratio is
 * six to one and the bar pinned at full right — for fifty months, never
 * moving, which is exactly no use as an indicator. The tests missed it because
 * they drove the mapping with figures the game does not produce.
 *
 * Turnover is bounded by construction on the side that was pegging: net can
 * never exceed income by more than the investor-sentiment margin, so a full
 * right bar means "spending nothing" and is genuinely rare. Full left means
 * income has collapsed to nothing while the bills continue.
 */
export function cashflow(g: GameState): { net: number; frac: number; income: number; outgoings: number; months: number } {
  // Tolerates a state that has never ticked, or one loaded from a save written
  // before any of this existed. A missing window reads as zero, which is both
  // honest and a great deal better than throwing from inside the bar.
  const h = g.netHistory ?? [];
  const net = h.length ? h.reduce((a, b) => a + b, 0) / h.length : 0;
  const outgoings = Math.max(1, g.lastOutgoings || 0);
  const income = Math.max(1, g.lastIncome || 0);
  return { net, income, outgoings, months: h.length, frac: Math.max(-1, Math.min(1, net / income)) };
}

export function computeSatisfaction(g: GameState): number {
  const d = g.resources.computeDemand;
  return d > 0 ? Math.min(1, g.resources.compute / d) : 1;
}

function diffusePollution(g: GameState): void {
  // Deposit pollution around emitting buildings, then decay + average.
  for (const b of g.buildings.values()) {
    if (b.progress < 1 || !b.active) continue;
    const def = BUILDING_DEFS[b.type];
    if (def.pollution === 0) continue;
    // Worn plants run dirtier; the carbon tax makes them run cleaner or less;
    // parks absorb regardless of age.
    const wear = def.pollution > 0
      ? (2 - buildingCondition(b)) * (g.policies.has('carbon_tax') ? 0.75 : 1)
      : 1;
    const radius = def.pollution > 0 ? 6 : 3;
    const cx = b.x + def.w / 2, cy = b.y + def.h / 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const t = tileAt(g, Math.floor(cx + dx), Math.floor(cy + dy));
        if (!t) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = (1 - dist / radius) * 0.012;
        t.pollution = Math.max(0, Math.min(1, t.pollution + def.pollution * wear * falloff));
      }
    }
  }
  let sum = 0;
  const decay = 0.985
    - (g.policies.has('green_belt') ? 0.004 : 0)
    - (g.policies.has('ewaste_program') ? 0.002 : 0)
    - (g.policies.has('free_transit') ? 0.002 : 0);
  for (const t of g.map) {
    t.pollution = Math.max(0, t.pollution * decay - 0.0004);
    sum += t.pollution;
  }
  g.pollutionAvg = sum / g.map.length;
}
