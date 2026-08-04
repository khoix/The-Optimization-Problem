import type { PolicyCategory, PolicyDef, PolicyId } from './types';

const P = (id: PolicyId, category: PolicyCategory, name: string, desc: string, costPerTick: number): PolicyDef =>
  ({ id, category, name, desc, costPerTick });

export const POLICY_DEFS: Record<PolicyId, PolicyDef> = {
  // ---------------- labor & welfare ----------------
  ubi: P('ubi', 'labor', 'Universal Basic Income',
    'Sustains consumer demand when jobs disappear. Expensive; corporations resent funding it.', 0),
  automation_tax: P('automation_tax', 'labor', 'Automation Tax',
    'Taxes automated production. Slows automation adoption, irritates investors.', 0),
  retraining: P('retraining', 'labor', 'Worker Retraining',
    'Displaced workers regain employability. Slow, unglamorous, effective.', 3),
  reduced_workweek: P('reduced_workweek', 'labor', 'Reduced Workweek',
    'Spreads remaining work across more people. Output dips; families notice the extra evenings.', 2),
  public_employment: P('public_employment', 'labor', 'Public Employment Program',
    'The region hires the unemployed for civic work. Costly, visible, dignified.', 0),
  human_staffing: P('human_staffing', 'labor', 'Human Staffing Requirement',
    'Customer-facing services must employ actual humans. Inefficient by definition; that is the point.', 3),
  gig_protections: P('gig_protections', 'labor', 'Gig Worker Protections',
    'Benefits and floors for platform labor. The platforms call it innovation-hostile.', 1),

  // ---------------- data & privacy ----------------
  data_privacy: P('data_privacy', 'data', 'Data Privacy Act',
    'Restricts collection of personal data. Trust and agency improve; AI services degrade.', 1),
  citizen_royalties: P('citizen_royalties', 'data', 'Citizen Data Royalties',
    'Residents get paid when their data is used. Collection slows; resentment slows more.', 2),
  data_localization: P('data_localization', 'data', 'Data Localization',
    'Regional data must stay on regional servers. Sovereignty up, cloud bills up.', 2),
  right_to_delete: P('right_to_delete', 'data', 'Right to Delete',
    'Citizens can erase their records. The models grow slightly more forgetful, and people sleep better.', 1),
  childrens_privacy: P('childrens_privacy', 'data', "Children's Privacy Shield",
    'No behavioral profiling of minors. Parents approve; the engagement charts dip at 3pm.', 1),
  biometric_surveillance: P('biometric_surveillance', 'data', 'Biometric Surveillance',
    'Faces, gaits, heartbeats. Crime plummets. So does something harder to graph.', 3),
  surveillance_program: P('surveillance_program', 'data', 'Smart Surveillance Program',
    'Cameras plus prediction. Security rises. So does something else.', 2),

  // ---------------- environment & infrastructure ----------------
  renewable_subsidy: P('renewable_subsidy', 'environment', 'Renewable Subsidy',
    'Solar farms produce more; a green line item in the budget.', 3),
  carbon_tax: P('carbon_tax', 'environment', 'Carbon Tax',
    'Pollution gets a price. Coal plants pay it; executives itemize their displeasure.', 0),
  water_rationing: P('water_rationing', 'environment', 'Water Rationing',
    'Mandatory conservation. The reservoirs recover; the lawns and cooling towers compete for sympathy.', 1),
  green_belt: P('green_belt', 'environment', 'Green Belt Ordinance',
    'Protected land around the region. Cleaner air, calmer people, tighter housing.', 1),
  ewaste_program: P('ewaste_program', 'environment', 'E-Waste Reclamation',
    'Dead servers become feedstock instead of landfill. Modest, worthy, perpetually underfunded.', 2),
  free_transit: P('free_transit', 'environment', 'Fare-Free Transit',
    'Buses cost nothing to ride. Traffic thins, budgets thicken.', 3),
  public_broadband: P('public_broadband', 'environment', 'Public Broadband',
    'Universal connectivity. Convenience up, screen time up.', 2),

  // ---------------- information & AI oversight ----------------
  moderation_ai: P('moderation_ai', 'information', 'Automated Content Moderation',
    'Fights misinformation with algorithms. Some citizens stop believing anything official.', 2),
  open_data_portal: P('open_data_portal', 'information', 'Open Data Portal',
    'Publish the dashboards the public pays for. Trust rises; so do awkward questions.', 1),
  algorithmic_transparency: P('algorithmic_transparency', 'information', 'Algorithmic Transparency Act',
    'Automated decisions must be explainable. Slower systems, visible reasoning, auditable power.', 2),
  ai_ethics_board: P('ai_ethics_board', 'information', 'AI Ethics Review Board',
    'Independent humans review major deployments. Research slows. Some things get caught.', 3),
  public_ai_option: P('public_ai_option', 'information', 'Public AI Option',
    'A publicly owned model for essential services. Corporations call it unfair competition, which is the idea.', 4),
  manual_redundancy: P('manual_redundancy', 'information', 'Manual Redundancy Mandate',
    'Keeps human operators and manual overrides staffed. Visibly inefficient. Possibly vital.', 5),

  // ---------------- corporate governance ----------------
  corporate_incentives: P('corporate_incentives', 'corporate', 'Corporate Incentive Package',
    'Tax breaks and cheap utilities attract investment — and obligations.', 0),
  antitrust_enforcement: P('antitrust_enforcement', 'corporate', 'Antitrust Enforcement',
    'Break up the cozy arrangements. Corporate power recedes; so does some of its money.', 2),
  local_procurement: P('local_procurement', 'corporate', 'Local Procurement Rule',
    'Public contracts favor regional firms. Small business cheers; the bids get 15% worse.', 2),
};

export const POLICY_CATEGORIES: Array<[PolicyCategory, string]> = [
  ['labor', 'Labor & Welfare'],
  ['data', 'Data & Privacy'],
  ['environment', 'Environment & Infrastructure'],
  ['information', 'Information & AI Oversight'],
  ['corporate', 'Corporate Governance'],
];

export const POLICY_ORDER: PolicyId[] = (Object.keys(POLICY_DEFS) as PolicyId[]);
