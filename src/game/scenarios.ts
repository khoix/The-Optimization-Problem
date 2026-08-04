// Starting scenarios: different regions, different pressures, different
// shapes of the same trap. Terrain, economy, politics, and the hidden
// emergence profile all vary — the proposal's rule is that the game should
// never be solvable by one fixed formula.

import type { CorpId, EmergenceWeights, GroupId } from './types';

export type ScenarioId = 'verdant' | 'sunbelt' | 'rustbelt' | 'coast';

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  desc: string;
  terrain: {
    river: boolean;        // meandering river vs dry wash
    coast: boolean;        // ocean along the eastern edge
    forestThreshold: number; // lower = more forest
    rockThreshold: number;   // lower = more rock
  };
  startCapital: number;
  startPopulation: number;
  migrationBase: number;   // initial migration demand
  waterFactor: number;     // water-plant output multiplier (scarcity)
  solarFactor: number;     // solar-farm output multiplier (climate)
  agedStart: boolean;      // founding infrastructure starts old
  extraIndustry: boolean;  // legacy factories and a coal plant
  shareTweaks: Partial<Record<GroupId, number>>;   // added to default group shares
  corpMoodTweaks: Partial<Record<CorpId, number>>; // added to starting moods
  emergenceBias: Partial<EmergenceWeights>;        // multiplied into rolled weights
}

export const SCENARIOS: Record<ScenarioId, ScenarioDef> = {
  verdant: {
    id: 'verdant',
    name: 'Verdant Valley',
    desc: 'A balanced river valley with room to grow. The classic start: good water, good land, and investors circling politely.',
    terrain: { river: true, coast: false, forestThreshold: 0.62, rockThreshold: 0.78 },
    startCapital: 900, startPopulation: 60, migrationBase: 70,
    waterFactor: 1, solarFactor: 1,
    agedStart: false, extraIndustry: false,
    shareTweaks: {}, corpMoodTweaks: {}, emergenceBias: {},
  },
  sunbelt: {
    id: 'sunbelt',
    name: 'Sunbelt Dry',
    desc: 'A desert technology hub. Endless sun, precious little water — and the hyperscalers love the tax climate as much as the real one.',
    terrain: { river: false, coast: false, forestThreshold: 0.8, rockThreshold: 0.68 },
    startCapital: 1100, startPopulation: 55, migrationBase: 90,
    waterFactor: 0.55, solarFactor: 1.45,
    agedStart: false, extraIndustry: false,
    shareTweaks: { tech_workers: 0.04, environmentalists: -0.02 },
    corpMoodTweaks: { meridian: 12, omnilink: 6 },
    emergenceBias: { corporate: 1.3, data: 1.2, oversight: 0.9 },
  },
  rustbelt: {
    id: 'rustbelt',
    name: 'Rustbelt Revival',
    desc: 'A declining industrial city seeking a second act. Aging plants, thin coffers, a workforce that has been promised transitions before.',
    terrain: { river: true, coast: false, forestThreshold: 0.7, rockThreshold: 0.8 },
    startCapital: 500, startPopulation: 90, migrationBase: 60,
    waterFactor: 1, solarFactor: 0.85,
    agedStart: true, extraIndustry: true,
    shareTweaks: { displaced_workers: 0.08, low_income: 0.05, tech_workers: -0.04, executives: -0.01 },
    corpMoodTweaks: { halcyon: 10, meridian: -5 },
    emergenceBias: { automation: 1.4, research: 0.85, dependence: 1.15 },
  },
  coast: {
    id: 'coast',
    name: 'Azure Coast',
    desc: 'A wealthy coastal region with pristine views and organized neighbors. Money is easy. Permission is not.',
    terrain: { river: false, coast: true, forestThreshold: 0.58, rockThreshold: 0.82 },
    startCapital: 1500, startPopulation: 70, migrationBase: 85,
    waterFactor: 1.15, solarFactor: 1.05,
    agedStart: false, extraIndustry: false,
    shareTweaks: { environmentalists: 0.05, executives: 0.02, low_income: -0.04 },
    corpMoodTweaks: { meridian: -5, aegis: -5 },
    emergenceBias: { research: 1.35, compute: 1.1, oversight: 1.1 },
  },
};

export const SCENARIO_ORDER: ScenarioId[] = ['verdant', 'sunbelt', 'rustbelt', 'coast'];

export function scenarioDef(id: string | undefined): ScenarioDef {
  return SCENARIOS[(id as ScenarioId) ?? 'verdant'] ?? SCENARIOS.verdant;
}
