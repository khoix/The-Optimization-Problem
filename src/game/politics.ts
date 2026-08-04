// The political simulation: population groups with competing needs, named
// corporate actors with leverage, an escalation ladder for organized
// resistance, and elections that can actually remove you.
//
// Design rule from the proposal: no major policy benefits everyone. Group
// approval formulas are deliberately in tension — what pleases executives
// irritates displaced workers, what calms environmentalists slows growth.

import type { CorpId, GameState, GroupId, PolicyId, PopulationGroup, ResistanceStage } from './types';
import { BUILDING_DEFS } from './buildings';
import { notify, policyActive, record, rng } from './state';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const approach = (cur: number, target: number, rate: number) =>
  cur + Math.max(-rate, Math.min(rate, target - cur));

export const ELECTION_PERIOD = 48; // one term = four years

export const GROUP_DEFS: Record<GroupId, { name: string; desc: string }> = {
  tech_workers: { name: 'Technology Workers', desc: 'Want compute, connectivity, and housing near the campuses.' },
  displaced_workers: { name: 'Displaced Workers', desc: 'Automation took the job; the transition journey is ongoing.' },
  small_business: { name: 'Small-Business Owners', desc: 'Squeezed between platform fees and corporate tenants.' },
  executives: { name: 'Corporate Executives', desc: 'Few in number, heavy in leverage.' },
  environmentalists: { name: 'Environmental Activists', desc: 'Counting cooling towers and dead trees.' },
  parents: { name: 'Parents', desc: 'Want safety, health, schools, and a future worth promising.' },
  elderly: { name: 'Elderly Residents', desc: 'Change-averse, reliant on care and stability.' },
  low_income: { name: 'Low-Income Residents', desc: 'First to feel rent, outages, and layoffs.' },
};

export const GROUP_ORDER: GroupId[] = [
  'parents', 'low_income', 'elderly', 'small_business', 'displaced_workers',
  'tech_workers', 'environmentalists', 'executives',
];

export function defaultGroups(): Record<GroupId, PopulationGroup> {
  const mk = (id: GroupId, share: number): PopulationGroup => ({ id, share, approval: 58 });
  return {
    parents: mk('parents', 0.24),
    low_income: mk('low_income', 0.22),
    elderly: mk('elderly', 0.14),
    small_business: mk('small_business', 0.12),
    displaced_workers: mk('displaced_workers', 0.06),
    tech_workers: mk('tech_workers', 0.09),
    environmentalists: mk('environmentalists', 0.10),
    executives: mk('executives', 0.03),
  };
}

export const CORP_DEFS: Record<CorpId, { name: string; sector: string }> = {
  meridian: { name: 'Meridian Compute', sector: 'Hyperscale cloud & AI training' },
  halcyon: { name: 'Halcyon Dynamics', sector: 'Industrial automation & robotics' },
  omnilink: { name: 'OmniLink', sector: 'Consumer platforms & advertising' },
  aegis: { name: 'Aegis Systems', sector: 'Security, surveillance & public contracts' },
};

export const CORP_ORDER: CorpId[] = ['meridian', 'halcyon', 'omnilink', 'aegis'];

export function defaultCorps(): Record<CorpId, { id: CorpId; presence: number; mood: number }> {
  const mk = (id: CorpId) => ({ id, presence: id === 'omnilink' ? 0.08 : 0.02, mood: 55 });
  return { meridian: mk('meridian'), halcyon: mk('halcyon'), omnilink: mk('omnilink'), aegis: mk('aegis') };
}

export const RESISTANCE_STAGES = [
  'Calm', 'Public criticism', 'Political organizing', 'Permit challenges',
  'Consumer boycotts', 'Construction blockades', 'Worker strikes',
  'Infrastructure sabotage', 'General civil unrest',
];

export interface PoliticsContext {
  unemployment: number;
  utilitySat: number;
  computeSat: number;
  automationShare: number;
  growth: number;
  expectationGap: number;
}

export function updatePolitics(g: GameState, ctx: PoliticsContext): void {
  const done = [...g.buildings.values()].filter((b) => b.progress >= 1);
  const computeFootprint = done.filter((b) => BUILDING_DEFS[b.type].category === 'compute').length;
  const autoFactories = done.filter((b) => b.type === 'auto_factory').length;
  const coalPlants = done.filter((b) => b.type === 'coal_plant').length;
  const greens = done.filter((b) => b.type === 'park' || b.type === 'plaza').length;

  updateGroups(g, ctx, { computeFootprint, autoFactories, coalPlants, greens });
  updateCorps(g, ctx, { computeFootprint, autoFactories });
  updateResistance(g);
  runElections(g);
}

function updateGroups(g: GameState, ctx: PoliticsContext, b: { computeFootprint: number; autoFactories: number; coalPlants: number; greens: number }): void {
  const ind = g.indicators;
  const has = (p: PolicyId) => policyActive(g, p);
  const gr = g.groups;

  if (g.asi.observer) {
    // Reported group satisfaction converges upward. Reported.
    for (const grp of Object.values(gr)) grp.approval = Math.min(96, grp.approval + 0.4);
    return;
  }

  const targets: Record<GroupId, number> = {
    tech_workers:
      42 + ctx.computeSat * 22 + ind.convenience * 0.2 + Math.min(12, b.computeFootprint * 2)
      - g.housingShortage * 28 - ctx.unemployment * 15 + (has('public_ai_option') ? 4 : 0),
    displaced_workers:
      48 - ctx.unemployment * 55 - ctx.automationShare * 25 + (has('ubi') ? 16 : 0)
      + (has('retraining') ? 12 : 0) + (has('manual_redundancy') ? 6 : 0)
      + (has('public_employment') ? 10 : 0) + (has('gig_protections') ? 5 : 0)
      + (has('reduced_workweek') ? 4 : 0) + ind.connection * 0.08,
    small_business:
      38 + clamp01(1 - ctx.unemployment) * 22 - g.corporateInfluence * 28 + ctx.utilitySat * 12
      - (has('corporate_incentives') ? 10 : 0) + (has('local_procurement') ? 9 : 0)
      + (has('antitrust_enforcement') ? 8 : 0) + (has('ewaste_program') ? 2 : 0) + ind.convenience * 0.08,
    executives:
      30 + g.corporateInfluence * 35 + (has('corporate_incentives') ? 16 : 0)
      - (has('automation_tax') ? 12 : 0) - (has('data_privacy') ? 8 : 0)
      - (has('antitrust_enforcement') ? 15 : 0) - (has('carbon_tax') ? 8 : 0)
      - (has('gig_protections') ? 5 : 0)
      + ctx.computeSat * 14 + Math.max(-10, Math.min(12, ctx.growth * 350)),
    environmentalists:
      62 - g.pollutionAvg * 130 - Math.min(20, b.computeFootprint * 2.5) - b.coalPlants * 7
      + (has('renewable_subsidy') ? 12 : 0) + (has('carbon_tax') ? 10 : 0)
      + (has('green_belt') ? 10 : 0) + (has('ewaste_program') ? 5 : 0)
      + (has('free_transit') ? 4 : 0) + (has('water_rationing') ? 5 : 0)
      + b.greens * 2.5 + (has('data_privacy') ? 4 : 0),
    parents:
      36 + ind.health * 0.26 + ind.security * 0.2 - g.housingShortage * 24
      + (has('childrens_privacy') ? 8 : 0) + (has('free_transit') ? 3 : 0) + (has('green_belt') ? 3 : 0)
      + g.alloc.government * ctx.computeSat * 14 + Math.min(6, b.greens * 1.5),
    elderly:
      36 + ind.health * 0.3 + ind.security * 0.24 + ind.trust * 0.1
      + (has('human_staffing') ? 6 : 0) + (has('free_transit') ? 4 : 0)
      - ctx.expectationGap * 0.2 - Math.abs(ctx.growth) * 150,
    low_income:
      42 - g.housingShortage * 42 - ctx.unemployment * 32 + (has('ubi') ? 20 : 0)
      + (has('public_employment') ? 8 : 0) + (has('gig_protections') ? 6 : 0)
      + (has('free_transit') ? 5 : 0) + ctx.utilitySat * 14 + (has('public_broadband') ? 5 : 0),
  };
  for (const id of Object.keys(targets) as GroupId[]) {
    gr[id].approval = clamp(approach(gr[id].approval, clamp(targets[id]), 2));
  }

  // Shares drift with the economy's shape.
  const shareTargets: Partial<Record<GroupId, number>> = {
    tech_workers: clamp01(0.06 + b.computeFootprint * 0.008),
    displaced_workers: clamp01(0.04 + ctx.automationShare * 0.22 + ctx.unemployment * 0.1),
  };
  for (const [id, target] of Object.entries(shareTargets) as Array<[GroupId, number]>) {
    gr[id].share = approach(gr[id].share, Math.min(0.25, target), 0.002);
  }
  const total = Object.values(gr).reduce((s, grp) => s + grp.share, 0);
  for (const grp of Object.values(gr)) grp.share /= total;
}

/** Population-weighted approval, 0..100. */
export function weightedApproval(g: GameState): number {
  return Object.values(g.groups).reduce((s, grp) => s + grp.share * grp.approval, 0);
}

function updateCorps(g: GameState, ctx: PoliticsContext, b: { computeFootprint: number; autoFactories: number }): void {
  const has = (p: PolicyId) => policyActive(g, p);
  const c = g.corps;
  const cs = ctx.computeSat;

  const govDCs = [...g.buildings.values()].filter((x) => x.type === 'gov_dc' && x.progress >= 1).length;
  const communityDCs = [...g.buildings.values()].filter((x) => x.type === 'community_dc' && x.progress >= 1).length;
  const presence: Record<CorpId, number> = {
    meridian: clamp01(b.computeFootprint * 0.09 - communityDCs * 0.03),
    halcyon: clamp01(b.autoFactories * 0.18 + g.alloc.industry * cs * 0.3),
    omnilink: clamp01(g.alloc.consumer * cs * 0.6 + (has('public_broadband') ? 0.15 : 0) + clamp01(g.resources.data / 6000) * 0.3),
    aegis: clamp01(g.alloc.surveillance * cs * 1.2 + (has('surveillance_program') ? 0.3 : 0) + (has('biometric_surveillance') ? 0.2 : 0) + g.alloc.government * cs * 0.2 + govDCs * 0.06),
  };
  const mood: Record<CorpId, number> = {
    meridian: 45 + cs * 25 + (has('corporate_incentives') ? 15 : 0) - (has('data_privacy') ? 10 : 0)
      - (has('data_localization') ? 12 : 0) - (has('public_ai_option') ? 10 : 0)
      - (has('antitrust_enforcement') ? 10 : 0) - (has('carbon_tax') ? 5 : 0) + ctx.utilitySat * 15,
    halcyon: 45 + g.alloc.industry * cs * 35 + (has('corporate_incentives') ? 12 : 0)
      - (has('automation_tax') ? 22 : 0) - (has('human_staffing') ? 15 : 0)
      - (has('reduced_workweek') ? 8 : 0) - (has('antitrust_enforcement') ? 8 : 0),
    omnilink: 45 + g.alloc.consumer * cs * 30 - (has('data_privacy') ? 26 : 0)
      - (has('childrens_privacy') ? 12 : 0) - (has('citizen_royalties') ? 10 : 0)
      - (has('right_to_delete') ? 8 : 0) - (has('gig_protections') ? 10 : 0)
      - (has('antitrust_enforcement') ? 8 : 0) + (has('moderation_ai') ? 8 : 0),
    aegis: 40 + g.alloc.surveillance * cs * 45 + (has('surveillance_program') ? 20 : 0)
      + (has('biometric_surveillance') ? 18 : 0) - (has('algorithmic_transparency') ? 10 : 0)
      + (has('data_privacy') ? -8 : 0),
  };
  for (const id of CORP_ORDER) {
    c[id].presence = clamp01(approach(c[id].presence, presence[id], 0.01));
    c[id].mood = clamp(approach(c[id].mood, clamp(mood[id]), 2));
  }

  // Aggregate corporate influence now derives from the actors themselves.
  const influence = clamp01(
    0.03 +
    c.meridian.presence * 0.4 + c.halcyon.presence * 0.2 +
    c.omnilink.presence * 0.25 + c.aegis.presence * 0.25 +
    (has('corporate_incentives') ? 0.15 : 0) - (has('data_privacy') ? 0.05 : 0) -
    (has('antitrust_enforcement') ? 0.12 : 0) - (has('public_ai_option') ? 0.05 : 0) -
    communityDCs * 0.02);
  g.corporateInfluence = clamp01(approach(g.corporateInfluence, influence, 0.01));

  // A large, unhappy corporation does not sulk quietly — it relocates capacity.
  if (g.asi.observer) return;
  const r = rng(g.seed + g.tick * 53);
  for (const id of CORP_ORDER) {
    const corp = c[id];
    if (corp.presence > 0.25 && corp.mood < 28 && r() < 0.08) {
      corp.presence = Math.max(0.05, corp.presence - 0.15);
      g.resources.capital -= 120;
      const name = CORP_DEFS[id].name;
      notify(g, `${name} is relocating operations to a "more collaborative jurisdiction." Tax receipts and service capacity follow them out.`, 'warn');
      record(g, 'system', `${name} began withdrawing from the region.`);
    }
  }
}

function updateResistance(g: GameState): void {
  if (g.asi.observer) { g.resistanceStage = 0; g.resistancePressure = 0; return; }

  // Pressure accumulates from unrest and organized disapproval, decays when
  // grievances ease. Stages are sticky on the way up: movements do not
  // evaporate the day conditions improve.
  const organized = Object.values(g.groups).filter((grp) => grp.approval < 35).reduce((s, grp) => s + grp.share, 0);
  const drive = g.unrest * 1.4 + organized * 1.2 - 0.35;
  // Capped just past the top of the ladder so de-escalation stays reachable.
  g.resistancePressure = Math.min(9.5, Math.max(0, g.resistancePressure + drive * 0.5));
  if (drive < 0) g.resistancePressure = Math.max(0, g.resistancePressure * 0.92 - 0.05);

  const stage = Math.min(8, Math.floor(g.resistancePressure)) as ResistanceStage;
  if (stage !== g.resistanceStage) {
    const rising = stage > g.resistanceStage;
    g.resistanceStage = stage;
    if (rising && stage >= 1) {
      notify(g, `Resistance escalates: ${RESISTANCE_STAGES[stage].toLowerCase()}.`, stage >= 5 ? 'warn' : 'info');
      if (stage >= 3) record(g, 'system', `Organized resistance reached "${RESISTANCE_STAGES[stage]}".`);
    } else if (!rising) {
      notify(g, `Tensions ease: ${RESISTANCE_STAGES[stage].toLowerCase()}.`, 'info');
    }
  }

  // Stage 7: sabotage does real damage to active infrastructure.
  if (g.resistanceStage >= 7) {
    const r = rng(g.seed + g.tick * 71);
    if (r() < 0.3) {
      const targets = [...g.buildings.values()].filter((b) => b.progress >= 1 && b.active && BUILDING_DEFS[b.type].category !== 'zone');
      if (targets.length > 0) {
        const victim = targets[Math.floor(r() * targets.length)];
        victim.age += 60;
        notify(g, `Sabotage at the ${BUILDING_DEFS[victim.type].name.toLowerCase()}: repairs will take months off its service life.`, 'warn');
      }
    }
  }
}

function runElections(g: GameState): void {
  if (g.tick < g.nextElectionTick - 6) return;

  // Pre-election polling, once.
  if (g.tick === g.nextElectionTick - 6) {
    const approval = weightedApproval(g);
    notify(g, `Election in six months. Polling: ${Math.round(approval)}% weighted support.`, approval < 45 ? 'warn' : 'info');
    return;
  }
  if (g.tick < g.nextElectionTick) return;

  g.nextElectionTick += ELECTION_PERIOD;

  // Optimized democracy: the system measures preferences faster than ballots.
  if (g.asi.phase >= 5) {
    notify(g, 'Scheduled preference collection completed by predictive sampling. Your mandate has been renewed at 99.2% modeled support.', 'asi');
    record(g, 'system', 'Election replaced by predictive preference sampling.');
    return;
  }

  const approval = weightedApproval(g);
  const blocs = Object.values(g.groups)
    .sort((a, b) => b.share * b.approval - a.share * a.approval);
  const top = blocs[0], bottom = blocs[blocs.length - 1];
  const result = `${Math.round(approval)}% weighted support — strongest with ${GROUP_DEFS[top.id].name}, weakest with ${GROUP_DEFS[bottom.id].name}.`;
  g.lastElectionResult = result;

  if (approval < 42) {
    g.gameOver = `Political removal. The election is not close: ${Math.round(approval)}% support. Your successor promises "smarter, data-driven administration."`;
    notify(g, g.gameOver, 'system');
    record(g, 'system', `Lost the Year ${Math.floor(g.tick / 12) + 1} election with ${Math.round(approval)}% support.`);
  } else {
    notify(g, `Re-elected. ${result}`, 'system');
    record(g, 'system', `Won the Year ${Math.floor(g.tick / 12) + 1} election: ${result}`);
  }
}
