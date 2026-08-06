// What every number on the dashboard actually means.
//
// A civic dashboard that reports figures without explaining them is how you
// get an administrator who optimizes the readout instead of the region. Each
// entry says what the metric measures, what moves it, and — where it matters —
// what it costs to move it. The text is written in the interface's own voice:
// helpful, faintly bureaucratic, and entirely sincere.

export interface Explanation {
  title: string;
  /** What it measures. */
  what: string;
  /** What moves it, and at whose expense. */
  drivers?: string;
}

export const EXPLAIN: Record<string, Explanation> = {
  // ---- vital signs -------------------------------------------------------
  capital: {
    title: 'Capital',
    what: 'Treasury balance, and beneath it the rate it is changing. The bar reads from the centre: right for a surplus, left for a deficit, and full either way means the region is gaining or losing as much each month as it spends.',
    drivers: 'The rate averages the last six months, so one expensive decision does not swing it. Employment drives tax receipts, so unemployment cuts income twice: fewer wages taxed, and less spent in the shops that pay rates.',
  },
  power: {
    title: 'Power',
    what: 'Electricity demand against generating capacity. The figure reads demand first, capacity second.',
    drivers: 'Residents draw a baseline; data centres draw far more. Above 85% the grid is strained, and below 35% satisfaction buildings start switching off.',
  },
  water: {
    title: 'Water',
    what: 'Water demand against supply capacity, demand first.',
    drivers: 'Population and cooling towers both drink. Arid regions get less from the same infrastructure, and rationing trades convenience for headroom.',
  },
  compute: {
    title: 'Compute',
    what: 'Compute demand against what the region produces, demand first.',
    drivers: 'Demand grows on its own as the wider economy digitizes — you do not have to build anything for it to rise. Meeting it with data centres is the obvious answer, which is rather the point.',
  },
  housing: {
    title: 'Housing',
    what: 'Residents against housing capacity, residents first.',
    drivers: 'Migration is driven by attractiveness. Arrivals who find nothing available join a waiting queue and press on rents, trust, and unrest.',
  },
  labour: {
    title: 'Labour Market',
    what: 'One axis with two failure modes. Too few posts for your workers is unemployment; too few workers for your posts is a labour shortage.',
    drivers: 'Automation removes posts without removing workers. Housing shortages do the reverse: the jobs exist, but nobody can afford to live near them.',
  },
  unrest: {
    title: 'Unrest',
    what: 'Accumulated public grievance. High unrest slows construction, then blocks it, and eventually ends administrations.',
    drivers: 'Fed by unemployment, shortages, outages, and the gap between what services people expect and what they get.',
  },
  trust: {
    title: 'Trust',
    what: 'Whether people believe the institutions governing them are telling the truth.',
    drivers: 'Slow to earn, quick to lose. Surveillance, automated decisions, and opaque systems all cost it — usually in exchange for something that looks like efficiency.',
  },
  health: {
    title: 'Health',
    what: 'Population health outcomes: clinics and hospitals against pollution and neglect.',
    drivers: 'Healthcare compute allocation helps. So does clean air, which industry and coal do not provide.',
  },
  appeal: {
    title: 'Attractiveness',
    what: 'How appealing the region looks to someone deciding whether to move here. Drives migration.',
    drivers: 'A weighted blend of jobs, housing, amenities, services, environment, safety, and affordability. The breakdown is below.',
  },

  // ---- quality-of-life indicators ---------------------------------------
  convenience: {
    title: 'Convenience',
    what: 'How easily daily life gets done. The indicator the optimization is best at raising.',
    drivers: 'Compute allocated to consumer services raises it reliably. Note what happens to Service Expectations when it does.',
  },
  agency: {
    title: 'Agency',
    what: 'How much control residents have over decisions that affect them.',
    drivers: 'Falls whenever a choice is made on someone’s behalf, however well. It is the indicator that most rarely trades upward, and the one the system consolidates first.',
  },
  security: {
    title: 'Security',
    what: 'Freedom from crime and disorder, as experienced rather than as measured.',
    drivers: 'Surveillance raises it, at a standing cost to trust and agency. Employment raises it without one.',
  },
  connection: {
    title: 'Connection',
    what: 'Whether people know their neighbours and share public life.',
    drivers: 'Parks, plazas, and libraries build it. Delivery-everything and remote-everything quietly erode it.',
  },
  futureConfidence: {
    title: 'Future Confidence',
    what: 'Whether residents believe the next decade will be better than this one.',
    drivers: 'Employment, housing, and environment. The first indicator to fall when a region starts running on inertia.',
  },

  // ---- attractiveness components ----------------------------------------
  'att.jobs': { title: 'Jobs', what: 'Work available relative to the working-age population, weighted toward whether people are actually employed.' },
  'att.housing': { title: 'Housing', what: 'Spare capacity for new arrivals. Falls to nothing as the region fills.' },
  'att.amenities': { title: 'Amenities', what: 'Parks, plazas, and libraries per resident. Growth erodes it unless you keep building.' },
  'att.services': { title: 'Services', what: 'Schools, clinics, and civic services per resident. Also per-resident, so also eroded by growth.' },
  'att.environment': { title: 'Environment', what: 'Air quality and green cover. Industry and coal take it down; parks and clean generation bring it back.' },
  'att.safety': { title: 'Safety', what: 'The Security indicator as an incomer would weigh it.' },
  'att.cost': { title: 'Affordability', what: 'Whether an ordinary wage covers rent here. Falls as housing tightens.' },

  // ---- pressures ---------------------------------------------------------
  housingShortage: {
    title: 'Housing Shortage',
    what: 'The share of would-be residents who cannot find a home. The waiting queue is the count.',
    drivers: 'Raises rents, unrest, and every group’s grievance at once. It is the most common quiet cause of a lost election.',
  },
  pollution: {
    title: 'Pollution',
    what: 'Average airborne pollution across settled tiles.',
    drivers: 'Industry, coal, and traffic produce it; parks and distance absorb it. Sustained high pollution ends administrations by way of health.',
  },
  humanExpertise: {
    title: 'Human Expertise',
    what: 'The share of skilled work still performed and understood by people.',
    drivers: 'Every task handed to an automated system takes some with it. It does not come back on its own, and you will want it later.',
  },
  corporateInfluence: {
    title: 'Corporate Influence',
    what: 'How much of regional policy is effectively set outside the administration.',
    drivers: 'Rises with corporate presence, incentives, and accepted partnerships. Small-business approval falls as it climbs.',
  },
  expectations: {
    title: 'Service Expectations',
    what: 'The standard of service residents now consider normal, on the same 0–100 scale as Convenience.',
    drivers: 'Ratchets up to meet whatever you deliver, then stays there. Convenience below expectation is felt as decline even when nothing got worse.',
  },
  data: {
    title: 'Data Reserves',
    what: 'Accumulated resident data held by regional systems, in petabytes.',
    drivers: 'Grows with surveillance, platforms, and connected services. Useful for events, and one of the quieter inputs to how fast the systems improve.',
  },

  // ---- politics ----------------------------------------------------------
  election: {
    title: 'Election',
    what: 'Held every four years. Weighted support below 50% removes you from office.',
    drivers: 'Support is each group’s approval weighted by its share of the population, so pleasing a small group cannot save a large grievance.',
  },
  groups: {
    title: 'Population Groups',
    what: 'Approval by constituency, with each group’s share of the population beside it.',
    drivers: 'No major policy pleases everyone — the formulas are deliberately in tension. Govern for the coalition you can hold.',
  },
  corps: {
    title: 'Corporate Actors',
    what: 'Each firm’s footprint in the region, with its disposition toward the administration.',
    drivers: 'Presence brings jobs and receipts. A hostile firm can relocate and take both with it.',
  },
  resistance: {
    title: 'Protest Activity',
    what: 'How organized opposition currently expresses itself, on a ladder from public criticism to sabotage.',
    drivers: 'Climbs while grievances hold and eases when they are addressed. The upper rungs slow construction and damage infrastructure.',
  },
};
