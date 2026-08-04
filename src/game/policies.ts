import type { PolicyDef, PolicyId } from './types';

export const POLICY_DEFS: Record<PolicyId, PolicyDef> = {
  ubi: {
    id: 'ubi', name: 'Universal Basic Income',
    desc: 'Sustains consumer demand when jobs disappear. Expensive; corporations resent funding it.',
    costPerTick: 0, // scales with unemployed population in sim
  },
  automation_tax: {
    id: 'automation_tax', name: 'Automation Tax',
    desc: 'Taxes automated production. Slows automation adoption, irritates investors.',
    costPerTick: 0,
  },
  data_privacy: {
    id: 'data_privacy', name: 'Data Privacy Act',
    desc: 'Restricts collection of personal data. Trust and agency improve; AI services degrade.',
    costPerTick: 1,
  },
  surveillance_program: {
    id: 'surveillance_program', name: 'Smart Surveillance Program',
    desc: 'Cameras plus prediction. Security rises. So does something else.',
    costPerTick: 2,
  },
  renewable_subsidy: {
    id: 'renewable_subsidy', name: 'Renewable Subsidy',
    desc: 'Solar farms produce more; a green line item in the budget.',
    costPerTick: 3,
  },
  manual_redundancy: {
    id: 'manual_redundancy', name: 'Manual Redundancy Mandate',
    desc: 'Keeps human operators and manual overrides staffed. Visibly inefficient. Possibly vital.',
    costPerTick: 5,
  },
  retraining: {
    id: 'retraining', name: 'Worker Retraining',
    desc: 'Displaced workers regain employability. Slow, unglamorous, effective.',
    costPerTick: 3,
  },
  corporate_incentives: {
    id: 'corporate_incentives', name: 'Corporate Incentive Package',
    desc: 'Tax breaks and cheap utilities attract investment — and obligations.',
    costPerTick: 0,
  },
  moderation_ai: {
    id: 'moderation_ai', name: 'Automated Content Moderation',
    desc: 'Fights misinformation with algorithms. Some citizens stop believing anything official.',
    costPerTick: 2,
  },
  public_broadband: {
    id: 'public_broadband', name: 'Public Broadband',
    desc: 'Universal connectivity. Convenience up, screen time up.',
    costPerTick: 2,
  },
};

export const POLICY_ORDER: PolicyId[] = [
  'ubi', 'automation_tax', 'retraining', 'renewable_subsidy', 'public_broadband',
  'data_privacy', 'moderation_ai', 'surveillance_program', 'corporate_incentives',
  'manual_redundancy',
];
