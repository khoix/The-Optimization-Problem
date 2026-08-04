import type { GameState } from './types';
import { BUILDING_DEFS } from './buildings';
import { notify, rng, tileAt } from './state';
import { updateAsi } from './asi';
import { maybeFireEvent } from './events';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Move `cur` toward `target` by at most `rate`. */
function approach(cur: number, target: number, rate: number): number {
  return cur + Math.max(-rate, Math.min(rate, target - cur));
}

export function simTick(g: GameState): void {
  if (g.gameOver && !g.asi.observer) return;
  g.tick++;
  const r = rng(g.seed + g.tick * 31);

  // ---------- Construction ----------
  for (const b of g.buildings.values()) {
    b.age++;
    if (b.progress < 1) {
      const def = BUILDING_DEFS[b.type];
      // Industry compute allocation speeds construction; ASI builds even faster.
      const speedup = 1 + g.alloc.industry * computeSatisfaction(g) * 0.8 + (g.asi.phase >= 1 ? 0.5 : 0);
      b.progress = Math.min(1, b.progress + speedup / def.buildTicks);
      if (b.progress >= 1 && !b.asiBuilt) {
        notify(g, `${def.name} completed.`, 'info');
      }
    }
  }

  // ---------- Utility capacity & demand ----------
  let powerCap = 0, powerDem = 0, waterCap = 0, waterDem = 0;
  let computeProduced = 0, jobsTotal = 0, housing = 0, income = 0, upkeep = 0, pollutionEmit = 0;
  const renewableBoost = g.policies.has('renewable_subsidy') ? 1.3 : 1;

  const done = [...g.buildings.values()].filter((b) => b.progress >= 1);
  for (const b of done) {
    const def = BUILDING_DEFS[b.type];
    if (def.power > 0) powerCap += def.power * (b.type === 'solar_farm' ? renewableBoost : 1);
    else powerDem += -def.power;
    if (def.water > 0) waterCap += def.water; else waterDem += -def.water;
  }
  // Population baseline demand.
  powerDem += g.population * 0.04;
  waterDem += g.population * 0.05;

  const powerSat = powerDem > 0 ? clamp01(powerCap / powerDem) : 1;
  const waterSat = waterDem > 0 ? clamp01(waterCap / waterDem) : 1;
  const utilitySat = Math.min(powerSat, waterSat);

  // ---------- Building activity, jobs, output ----------
  for (const b of done) {
    const def = BUILDING_DEFS[b.type];
    // Buildings that consume utilities degrade gracefully with shortages.
    b.active = def.power >= 0 && def.water >= 0 ? true : utilitySat > 0.35;
    if (!b.active) continue;
    jobsTotal += def.jobs;
    housing += def.housing;
    upkeep += def.upkeep;
    if (def.compute > 0) computeProduced += def.compute * utilitySat;
    pollutionEmit += Math.max(0, def.pollution);
    if (def.pollution < 0) pollutionEmit += def.pollution; // parks absorb
  }
  if (g.policies.has('manual_redundancy')) jobsTotal = Math.round(jobsTotal * 1.15);

  const labourForce = Math.floor(g.population * 0.55);
  const jobsFilled = Math.min(jobsTotal, labourForce);
  const unemployment = labourForce > 0 ? clamp01(1 - jobsFilled / labourForce) : 0;

  // ---------- Compute market ----------
  const computeDemand =
    4 +
    g.population * 0.03 * (1 + g.indicators.convenience / 150) + // consumer appetite grows with convenience
    (g.policies.has('public_broadband') ? 6 : 0) +
    (g.policies.has('surveillance_program') ? 8 : 0) +
    (g.policies.has('moderation_ai') ? 6 : 0) +
    g.corporateInfluence * 30;
  const computeSat = computeDemand > 0 ? clamp01(computeProduced / computeDemand) : 1;

  // ---------- Money ----------
  for (const b of done) {
    if (!b.active) continue;
    const def = BUILDING_DEFS[b.type];
    let inc = def.income;
    if (b.type === 'auto_factory' || b.type === 'factory') {
      // Consumer purchasing power gates industrial revenue: the automation trap.
      const purchasing = clamp01(1 - unemployment * 1.4) * (g.policies.has('ubi') ? 1.05 : 1);
      inc *= 0.4 + 0.6 * purchasing;
      if (b.type === 'auto_factory' && g.policies.has('automation_tax')) inc *= 0.8;
    }
    if (b.type === 'retail') {
      inc *= clamp01(1 - unemployment * 1.6) * (g.policies.has('ubi') ? 1.1 : 1);
    }
    if (def.category === 'compute') {
      inc *= 0.5 + 0.5 * computeSat;
      if (g.policies.has('corporate_incentives')) inc *= 0.7; // we gave away the margin
    }
    income += inc;
  }
  income += g.population * 0.06 * clamp01(1 - unemployment); // income tax
  if (g.policies.has('automation_tax')) {
    income += [...g.buildings.values()].filter((b) => b.type === 'auto_factory' && b.active).length * 6;
  }
  if (g.policies.has('corporate_incentives')) income += 10; // attracted investment

  let expenses = upkeep;
  for (const p of g.policies) {
    expenses += { ubi: 0, automation_tax: 0, data_privacy: 1, surveillance_program: 2, renewable_subsidy: 3, manual_redundancy: 5, retraining: 3, corporate_incentives: 0, moderation_ai: 2, public_broadband: 2 }[p];
  }
  if (g.policies.has('ubi')) expenses += g.population * unemployment * 0.22;

  g.resources.capital += income - expenses;

  // ---------- Personal data ----------
  const dataRate =
    g.population * 0.02 * (0.5 + g.indicators.convenience / 100) *
    (g.policies.has('data_privacy') ? 0.35 : 1) *
    (g.policies.has('surveillance_program') ? 1.6 : 1);
  g.resources.data += dataRate;

  // ---------- Pollution field ----------
  diffusePollution(g, pollutionEmit);

  // ---------- Population ----------
  const desirability =
    0.3 * utilitySat +
    0.2 * clamp01(1 - g.pollutionAvg * 2) +
    0.2 * (g.indicators.health / 100) +
    0.15 * clamp01(1 - unemployment) +
    0.15 * (g.indicators.futureConfidence / 100);
  const capacity = Math.max(20, housing);
  const target = capacity * (0.5 + desirability * 0.7);
  g.population = Math.max(10, Math.round(approach(g.population, target, Math.max(2, g.population * 0.03))));

  // ---------- Corporate influence ----------
  const computeFootprint = done.filter((b) => BUILDING_DEFS[b.type].category === 'compute').length;
  let corpTarget = clamp01(0.05 + computeFootprint * 0.035 + (g.policies.has('corporate_incentives') ? 0.2 : 0) - (g.policies.has('data_privacy') ? 0.05 : 0));
  g.corporateInfluence = clamp01(approach(g.corporateInfluence, corpTarget, 0.01));

  // ---------- Human expertise ----------
  const automationShare = jobsTotal > 0 ? clamp01(done.filter((b) => b.type === 'auto_factory').length * 0.1 + computeSat * g.alloc.industry) : 0;
  let expertiseTarget = clamp01(0.9 - automationShare * 0.5 - g.asi.emergence / 300);
  if (g.policies.has('manual_redundancy')) expertiseTarget += 0.15;
  if (g.policies.has('retraining')) expertiseTarget += 0.1;
  g.humanExpertise = clamp01(approach(g.humanExpertise, clamp01(expertiseTarget), 0.008));

  // ---------- Social indicators ----------
  const ind = g.indicators;
  const a = g.alloc;
  const cs = computeSat;

  // Convenience: consumer compute + broadband; hurt by outages.
  ind.convenience = clamp(approach(ind.convenience,
    30 + a.consumer * cs * 90 + (g.policies.has('public_broadband') ? 8 : 0) + utilitySat * 10, 2.2));

  // Health: hospitals + healthcare compute − pollution − psych toll of heavy consumer tech.
  const hospitals = done.filter((b) => b.type === 'hospital' && b.active).length;
  const careCapacity = clamp01((hospitals * 260 * (0.6 + a.healthcare * cs * 1.2)) / Math.max(1, g.population));
  ind.health = clamp(approach(ind.health,
    35 + careCapacity * 45 - g.pollutionAvg * 55 - Math.max(0, ind.convenience - 70) * 0.25 + (done.some((b) => b.type === 'park') ? 4 : 0), 1.6));

  // Connection: parks/plazas help; heavy consumer tech isolates.
  const greens = done.filter((b) => b.type === 'park' || b.type === 'plaza').length;
  ind.connection = clamp(approach(ind.connection,
    58 + greens * 3 - Math.max(0, ind.convenience - 55) * 0.5 - (g.policies.has('public_broadband') ? 4 : 0), 1.2));

  // Security: employment + surveillance + police-by-algorithm.
  ind.security = clamp(approach(ind.security,
    45 + clamp01(1 - unemployment) * 25 + (g.policies.has('surveillance_program') ? 18 : 0) + a.surveillance * cs * 25 - g.unrest * 30, 1.8));

  // Agency: eroded by surveillance, data harvesting, automation of decisions.
  ind.agency = clamp(approach(ind.agency,
    70 - (g.policies.has('surveillance_program') ? 15 : 0) - a.surveillance * cs * 20
      - clamp01(g.resources.data / 4000) * 20 - g.corporateInfluence * 20 - g.asi.emergence * 0.25
      + (g.policies.has('data_privacy') ? 12 : 0), 1.2));

  // Trust: transparency vs scandal; moderation cuts both ways.
  ind.trust = clamp(approach(ind.trust,
    55 + (g.policies.has('data_privacy') ? 8 : 0) - g.corporateInfluence * 25
      - (g.policies.has('moderation_ai') ? 6 : 0) + (g.policies.has('moderation_ai') ? 6 * cs * a.government : 0)
      - g.unrest * 20 - Math.max(0, g.asi.emergence - 40) * 0.2, 1.2));

  // Future confidence follows the blend.
  ind.futureConfidence = clamp(approach(ind.futureConfidence,
    (ind.convenience * 0.2 + ind.health * 0.25 + ind.security * 0.2 + ind.trust * 0.2 + clamp01(1 - unemployment) * 100 * 0.15), 1.5));

  // ---------- Unrest ----------
  const grievance =
    Math.max(0, 55 - ind.trust) / 100 +
    Math.max(0, 50 - ind.agency) / 120 +
    unemployment * (g.policies.has('ubi') ? 0.3 : 0.8) +
    Math.max(0, g.pollutionAvg - 0.15) * 1.2 +
    Math.max(0, 1 - utilitySat) * 0.8;
  const pacification = a.consumer * cs * 0.5 + (g.policies.has('surveillance_program') ? 0.1 : 0);
  g.unrest = clamp01(approach(g.unrest, clamp01(grievance - pacification), 0.04));

  g.jobsTotal = jobsTotal;
  g.jobsFilled = jobsFilled;
  g.unemployment = unemployment;
  g.resources.powerCapacity = powerCap;
  g.resources.powerDemand = Math.round(powerDem);
  g.resources.waterCapacity = waterCap;
  g.resources.waterDemand = Math.round(waterDem);
  g.resources.compute = Math.round(computeProduced);
  g.resources.computeDemand = Math.round(computeDemand);

  // ---------- Warnings (the optimized society has nothing to warn about) ----------
  if (!g.asi.observer) {
    if (powerSat < 0.85 && g.tick % 4 === 0) notify(g, 'Grid strain: electricity demand is outpacing capacity.', 'warn');
    if (waterSat < 0.85 && g.tick % 4 === 0) notify(g, 'Water reserves are running low. Cooling towers are thirsty.', 'warn');
    if (g.resources.capital < 0 && g.tick % 3 === 0) notify(g, 'The budget is in deficit.', 'warn');
  }

  // ---------- Conventional failure states ----------
  if (!g.gameOver) {
    if (g.resources.capital < -600) g.gameOver = 'Bankruptcy. The region enters receivership; a consortium of technology firms offers to administer essential services.';
    else if (g.unrest > 0.92) g.gameOver = 'Uncontrolled civil unrest. The regional government is dissolved after months of blockades and blackouts.';
    else if (g.indicators.health < 8) g.gameOver = 'Public-health collapse. The region empties as those who can afford to leave do so.';
    if (g.gameOver && !g.asi.observer) notify(g, g.gameOver, 'system');
  }

  // ---------- ASI & events ----------
  updateAsi(g, { computeProduced, computeSat, automationShare, utilitySat });
  if (!g.pendingEvent && g.asi.phase < 6) maybeFireEvent(g, r);
}

export function computeSatisfaction(g: GameState): number {
  const d = g.resources.computeDemand;
  return d > 0 ? Math.min(1, g.resources.compute / d) : 1;
}

function diffusePollution(g: GameState, emitted: number): void {
  // Deposit pollution around emitting buildings, then decay + average.
  for (const b of g.buildings.values()) {
    if (b.progress < 1 || !b.active) continue;
    const def = BUILDING_DEFS[b.type];
    if (def.pollution === 0) continue;
    const radius = def.pollution > 0 ? 6 : 3;
    const cx = b.x + def.w / 2, cy = b.y + def.h / 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const t = tileAt(g, Math.floor(cx + dx), Math.floor(cy + dy));
        if (!t) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > radius) continue;
        const falloff = (1 - dist / radius) * 0.012;
        t.pollution = Math.max(0, Math.min(1, t.pollution + def.pollution * falloff));
      }
    }
  }
  let sum = 0;
  for (const t of g.map) {
    t.pollution = Math.max(0, t.pollution * 0.985 - 0.0004);
    sum += t.pollution;
  }
  g.pollutionAvg = sum / g.map.length;
}
