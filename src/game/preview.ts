// Projected-impact preview for event choices. Rather than hand-annotating
// every choice, we deep-clone the state through the save serializer, apply
// the choice to the clone, and diff the outcome. Effects are deterministic,
// so the projection is exact — while the interface still chooses to be.
//
// Deliberate omission: hidden ASI emergence never appears in a projection.
// There is no singularity meter, least of all in a tooltip.

import type { GameEvent, GameState } from './types';
import { deserialize, serialize } from './save';
import { POLICY_DEFS } from './policies';
import { CORP_DEFS } from './politics';

export interface ImpactChip {
  text: string;
  dir: 'up' | 'down' | 'flat';
  good: boolean; // whether this direction is desirable, for coloring
}

/** Metrics a civic briefing would report. Larger |delta| wins the chip slots. */
const METRICS: Array<{
  label: string;
  get: (g: GameState) => number;
  goodWhenUp: boolean;
  threshold: number;
  format: (d: number) => string;
}> = [
  { label: 'Capital', get: (g) => g.resources.capital, goodWhenUp: true, threshold: 15, format: (d) => `§${Math.round(Math.abs(d))}` },
  { label: 'Trust', get: (g) => g.indicators.trust, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Agency', get: (g) => g.indicators.agency, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Health', get: (g) => g.indicators.health, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Security', get: (g) => g.indicators.security, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Connection', get: (g) => g.indicators.connection, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Convenience', get: (g) => g.indicators.convenience, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Confidence', get: (g) => g.indicators.futureConfidence, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}` },
  { label: 'Unrest', get: (g) => g.unrest * 100, goodWhenUp: false, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}%` },
  { label: 'Corp. influence', get: (g) => g.corporateInfluence * 100, goodWhenUp: false, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}%` },
  { label: 'Expertise', get: (g) => g.humanExpertise * 100, goodWhenUp: true, threshold: 1, format: (d) => `${Math.abs(Math.round(d))}%` },
  { label: 'Data reserves', get: (g) => g.resources.data, goodWhenUp: true, threshold: 60, format: (d) => `${Math.round(Math.abs(d))}` },
];

function cloneState(g: GameState): GameState {
  // JSON round-trip through the save envelope gives a true deep clone with
  // Maps/Sets restored and no live functions.
  return deserialize(JSON.parse(JSON.stringify(serialize(g))));
}

/**
 * Project a choice's immediate impact. Returns chips for the significant
 * deltas, most significant first. Fidelity decays with ASI phase:
 *  - phase ≤ 1: direction and magnitude
 *  - phase 2–3: direction only
 *  - phase ≥ 4: no numbers at all — handled by the caller, which shows a
 *    single reassurance on the recommended option instead.
 */
export function previewChoice(g: GameState, event: GameEvent, choiceIndex: number): ImpactChip[] {
  const clone = cloneState(g);
  const choice = event.choices[choiceIndex];
  if (!choice) return [];
  try {
    choice.effect(clone);
  } catch {
    return [];
  }

  const chips: Array<ImpactChip & { salience: number }> = [];
  for (const m of METRICS) {
    const before = m.get(g);
    const after = m.get(clone);
    const d = after - before;
    if (Math.abs(d) < m.threshold) continue;
    const up = d > 0;
    chips.push({
      text: g.asi.phase >= 2 ? m.label : `${m.label} ${m.format(d)}`,
      dir: up ? 'up' : 'down',
      good: up === m.goodWhenUp,
      salience: Math.abs(d) / m.threshold,
    });
  }
  chips.sort((a, b) => b.salience - a.salience);

  // Policy enactments read as their own chip.
  for (const p of clone.policies) {
    if (!g.policies.has(p)) {
      chips.unshift({ text: `Enacts ${POLICY_DEFS[p].name}`, dir: 'up', good: true, salience: 99 });
    }
  }
  // A corporation growing its footprint is worth flagging.
  for (const id of Object.keys(clone.corps) as Array<keyof GameState['corps']>) {
    const d = clone.corps[id].presence - g.corps[id].presence;
    if (Math.abs(d) >= 0.03) {
      chips.push({
        text: g.asi.phase >= 2 ? `${CORP_DEFS[id].name} presence` : `${CORP_DEFS[id].name} presence ${Math.round(Math.abs(d) * 100)}%`,
        dir: d > 0 ? 'up' : 'down',
        good: d < 0,
        salience: Math.abs(d) * 40,
      });
    }
  }

  return chips.slice(0, 5).map(({ salience: _s, ...chip }) => chip);
}
