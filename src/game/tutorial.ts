// Onboarding. A sequence of advisor prompts that teaches the core loop —
// assess, build, allocate, respond — while doing exactly what the design
// calls for: presenting compute as the fast, cheap, obviously-correct answer
// to every problem. The tutorial never warns. That is the point.

import type { GameState } from './types';
import { notify } from './state';

interface TutorialStep {
  id: string;
  condition: (g: GameState) => boolean;
  text: string;
}

const STEPS: TutorialStep[] = [
  {
    id: 'housing',
    condition: (g) => g.tick >= 2,
    text: 'Advisor: Migration pressure is rising — people want to live here. Keep housing ahead of demand or the shortage will show up in Trust and Unrest.',
  },
  {
    id: 'utilities',
    condition: (g) => g.resources.powerDemand > g.resources.powerCapacity * 0.8,
    text: 'Advisor: The grid is tightening. Solar is clean but slow; coal is cheap and fast. Investors care about uptime, not provenance.',
  },
  {
    id: 'first_compute',
    condition: (g) => g.tick >= 8 && g.resources.compute < 5,
    text: 'Advisor: Meridian reports rising consumer latency. An Edge Compute Node would fix it — and compute revenue is excellent. You can find it under Construction → Compute.',
  },
  {
    id: 'allocate',
    condition: (g) => g.resources.compute >= 5,
    text: 'Advisor: Compute is online. Open the Compute tab and allocate it — every sector wants more than exists. That is normal. That is fine.',
  },
  {
    id: 'expectations',
    condition: (g) => g.expectations > 55,
    text: 'Advisor: Citizen satisfaction surveys are strong, but note the baseline drift: what delighted them last year is now the expected minimum. The projections all say the same thing — capacity must keep growing.',
  },
  {
    id: 'maintenance',
    condition: (g) => [...g.buildings.values()].some((b) => b.age > 90),
    text: 'Advisor: Early infrastructure is starting to age. Renovate it from the inspector, or accept declining output — either way, it will not maintain itself. Yet.',
  },
  {
    id: 'politics',
    condition: (g) => g.tick >= 14,
    text: 'Advisor: Elections run every four years, and the coalition math is in the Politics tab. No policy pleases every group — govern for the coalition you can keep.',
  },
  {
    id: 'events',
    condition: (g) => g.firedEvents.size > 0,
    text: 'Advisor: When situations demand a decision, there is rarely a clean option. Pick the tradeoff you can live with. The consequences will find you either way.',
  },
];

export const INTRO_TITLE = 'Regional Development Authority';
export const INTRO_BODY =
  'Administrator — welcome. The board has granted you full authority over zoning, infrastructure, utilities, and technology policy for the region.<br><br>' +
  'Your mandate is simple: <b>grow the region and keep it in balance.</b> Population, employment, health, environment, budget — none may collapse, and none stays solved. ' +
  'The technology sector is eager to invest here. Their computing infrastructure is the fastest lever you have: it creates jobs, revenue, and services people love.<br><br>' +
  'Use it well. There is no reason to expect any difficulty.';

/** Fire at most one pending tutorial toast per call. */
export function updateTutorial(g: GameState): void {
  if (g.asi.phase >= 4) return; // the optimized interface has no advice to give
  for (const step of STEPS) {
    if (g.tutorialDone.includes(step.id)) continue;
    if (!step.condition(g)) continue;
    g.tutorialDone.push(step.id);
    notify(g, step.text, 'system');
    return;
  }
}
