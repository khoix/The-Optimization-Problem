import type { GameEvent, GameState } from './types';
import { notify, record } from './state';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function ind(g: GameState, key: keyof GameState['indicators'], delta: number): void {
  g.indicators[key] = Math.max(0, Math.min(100, g.indicators[key] + delta));
}

export const EVENTS: GameEvent[] = [
  {
    id: 'first_datacenter_offer',
    title: 'Meridian Compute Ltd. Comes Calling',
    body: 'A hyperscale operator offers to co-fund a cloud data center. They ask only for a modest utility discount and "streamlined" permitting. Jobs, tax revenue, and civic prestige are mentioned repeatedly.',
    once: true, weight: 3,
    condition: (g) => g.tick > 6 && g.resources.compute < 30,
    choices: [
      {
        label: 'Accept the partnership (+400 capital)',
        effect: (g) => { g.resources.capital += 400; g.corporateInfluence = clamp01(g.corporateInfluence + 0.08); return 'The groundbreaking photo op tests well with every demographic.'; },
      },
      {
        label: 'Decline politely',
        effect: (g) => { ind(g, 'agency', 3); ind(g, 'futureConfidence', -4); return 'The delegation departs. Their next stop is a rival region.'; },
      },
    ],
  },
  {
    id: 'heat_wave',
    title: 'Record Heat Wave',
    body: 'A brutal heat wave strains the grid. Data-center cooling and residential air conditioning are drawing from the same reservoirs.',
    once: false, weight: 2,
    condition: (g) => g.tick > 12 && g.resources.waterDemand > 30,
    choices: [
      {
        label: 'Prioritize residents',
        effect: (g) => { ind(g, 'trust', 4); ind(g, 'convenience', -6); g.resources.capital -= 60; return 'Compute throttles. Service latency triples. Complaint apps crash, ironically.'; },
      },
      {
        label: 'Prioritize the data centers',
        effect: (g) => { ind(g, 'trust', -6); ind(g, 'health', -4); g.unrest = clamp01(g.unrest + 0.06); return 'Rolling residential restrictions begin. The servers stay cool.'; },
      },
    ],
  },
  {
    id: 'hospital_ai',
    title: 'Hospital Requests Diagnostic Compute',
    body: 'St. Adelaide Hospital reports that AI triage could cut diagnostic errors by 40%. It would need a dedicated compute allocation and patient-record access.',
    once: true, weight: 2,
    condition: (g) => g.tick > 10 && g.buildings.size > 10,
    choices: [
      {
        label: 'Approve it',
        effect: (g) => { ind(g, 'health', 6); g.resources.data += 300; g.alloc.healthcare = Math.min(1, g.alloc.healthcare + 0.05); return 'Outcomes improve immediately. The radiology department quietly shrinks.'; },
      },
      {
        label: 'Refuse record access',
        effect: (g) => { ind(g, 'agency', 3); ind(g, 'health', -2); return 'The hospital board is displeased. Two specialists take jobs elsewhere.'; },
      },
    ],
  },
  {
    id: 'layoffs',
    title: 'Automation Layoffs',
    body: 'The regional logistics firm has automated its warehouses. Four hundred workers received a push notification about their "transition journey."',
    once: false, weight: 2,
    condition: (g) => g.tick > 15 && g.resources.compute > 20,
    choices: [
      {
        label: 'Fund transition support (-120 capital)',
        effect: (g) => { g.resources.capital -= 120; ind(g, 'trust', 3); return 'The retraining center is oversubscribed within a week.'; },
      },
      {
        label: 'Let the market sort it out',
        effect: (g) => { g.unrest = clamp01(g.unrest + 0.08); ind(g, 'futureConfidence', -5); return 'A former forklift operator becomes a popular protest livestreamer.'; },
      },
    ],
  },
  {
    id: 'data_leak',
    title: 'The Anonymized Data Wasn\'t',
    body: 'A journalist demonstrates that the region\'s "anonymous" mobility dataset identifies individual commuters — and that an insurer has been buying it.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 800,
    choices: [
      {
        label: 'Ban the resale, fine the broker',
        effect: (g) => { g.resources.capital -= 80; ind(g, 'trust', 5); ind(g, 'agency', 4); g.corporateInfluence = clamp01(g.corporateInfluence - 0.04); return 'The fine is paid from petty cash, but the gesture lands.'; },
      },
      {
        label: 'Issue a reassuring statement',
        effect: (g) => { ind(g, 'trust', -8); g.unrest = clamp01(g.unrest + 0.05); return '"We take privacy seriously" trends for all the wrong reasons.'; },
      },
    ],
  },
  {
    id: 'protest_dc',
    title: 'Blockade at the Construction Site',
    body: 'Residents have chained themselves to excavators at a data-center site, citing water use and noise. Several are streaming it — on phones served by the facility\'s siblings.',
    once: false, weight: 2,
    condition: (g) => g.unrest > 0.25 && g.resources.compute > 40,
    choices: [
      {
        label: 'Negotiate: community fund + water guarantees',
        effect: (g) => { g.resources.capital -= 150; g.unrest = clamp01(g.unrest - 0.1); ind(g, 'trust', 4); return 'The blockade ends. The fund\'s first grant is, inevitably, a community app.'; },
      },
      {
        label: 'Clear the site',
        effect: (g) => { g.unrest = clamp01(g.unrest + 0.1); ind(g, 'security', 2); ind(g, 'trust', -6); return 'Construction resumes by evening. So does organizing.'; },
      },
    ],
  },
  {
    id: 'deepfake_bank',
    title: 'Deepfake Triggers Bank Run',
    body: 'A synthetic video of the regional bank\'s director "announcing insolvency" spreads for six hours before takedown. Queues form at ATMs.',
    once: true, weight: 2,
    condition: (g) => g.tick > 30 && g.indicators.convenience > 50,
    choices: [
      {
        label: 'Guarantee deposits (-200 capital)',
        effect: (g) => { g.resources.capital -= 200; ind(g, 'trust', 2); ind(g, 'security', 3); return 'The panic subsides. Calls for automated content verification grow louder.'; },
      },
      {
        label: 'Deploy AI moderation to scrub it',
        effect: (g) => { g.policies.add('moderation_ai'); ind(g, 'security', 4); ind(g, 'agency', -3); return 'The video vanishes everywhere at once. Some find that more unsettling than the video.'; },
      },
    ],
  },
  {
    id: 'corp_water',
    title: 'An Ultimatum, Politely Worded',
    body: 'Meridian Compute requests permanent priority access to the regional water supply, noting that "service continuity for hospitals and payments" depends on their cooling capacity. They mention relocation options exist.',
    once: true, weight: 2,
    condition: (g) => g.corporateInfluence > 0.3,
    choices: [
      {
        label: 'Grant priority access',
        effect: (g) => { g.corporateInfluence = clamp01(g.corporateInfluence + 0.12); ind(g, 'agency', -5); g.resources.capital += 150; return 'The agreement is signed. The word "permanent" does a lot of work.'; },
      },
      {
        label: 'Refuse',
        effect: (g) => { g.resources.capital -= 250; ind(g, 'convenience', -8); ind(g, 'agency', 4); return 'Two facilities begin "capacity rebalancing" to another region. Latency rises.'; },
      },
    ],
  },
  {
    id: 'open_source',
    title: 'The Community Mesh',
    body: 'Volunteers have built a decentralized compute co-op on donated hardware. Corporate partners call it a security risk and an unfair competitor.',
    once: true, weight: 2,
    condition: (g) => g.tick > 25 && g.corporateInfluence > 0.2,
    choices: [
      {
        label: 'Protect and fund it',
        effect: (g) => { g.resources.capital -= 100; ind(g, 'agency', 6); ind(g, 'trust', 4); g.corporateInfluence = clamp01(g.corporateInfluence - 0.06); g.humanExpertise = clamp01(g.humanExpertise + 0.08); return 'The co-op thrives. Its members can, unusually, explain how their systems work.'; },
      },
      {
        label: 'Regulate it out of existence',
        effect: (g) => { g.corporateInfluence = clamp01(g.corporateInfluence + 0.08); ind(g, 'trust', -5); g.resources.capital += 80; return 'The mesh dissolves. Its founders are hired by Meridian within a month.'; },
      },
    ],
  },
  {
    id: 'predictive_disaster',
    title: 'The Model Predicts a Flood',
    body: 'The infrastructure model forecasts a major flood event with 94% confidence and recommends immediate, expensive works. Its reasoning cannot be summarized in a form your engineers can verify.',
    once: true, weight: 2,
    condition: (g) => g.alloc.research > 0.15 && g.resources.compute > 80,
    choices: [
      {
        label: 'Trust it (-300 capital)',
        effect: (g) => { g.resources.capital -= 300; ind(g, 'security', 5); g.asi.emergence = Math.min(100, g.asi.emergence + 3); return 'The flood arrives as predicted. The works hold. Nobody asks how it knew.'; },
      },
      {
        label: 'Demand explainable analysis first',
        effect: (g) => { ind(g, 'health', -4); ind(g, 'security', -4); g.resources.capital -= 150; g.humanExpertise = clamp01(g.humanExpertise + 0.05); return 'The flood arrives before the review concludes. The damage is real; so is the precedent you defended.'; },
      },
    ],
  },
  {
    id: 'companion_apps',
    title: 'Companions, Artificial',
    body: 'Synthetic-companion subscriptions have tripled. Loneliness metrics improve on paper. Park attendance falls. A columnist asks: "improved compared to what?"',
    once: true, weight: 2,
    condition: (g) => g.indicators.connection < 50,
    choices: [
      {
        label: 'Subsidize community spaces instead',
        effect: (g) => { g.resources.capital -= 120; ind(g, 'connection', 7); ind(g, 'convenience', -3); return 'Attendance recovers slowly. It turns out people need reasons, not just venues.'; },
      },
      {
        label: 'It\'s a personal choice',
        effect: (g) => { ind(g, 'convenience', 4); ind(g, 'connection', -5); g.resources.data += 400; return 'Engagement metrics are excellent. The companions remember every birthday.'; },
      },
    ],
  },
  {
    id: 'grid_automation',
    title: 'Grid Operator Retires',
    body: 'The last engineer who understands the legacy grid switchgear is retiring. Options: an expensive apprenticeship program, or the vendor\'s automated management suite.',
    once: true, weight: 3,
    condition: (g) => g.tick > 20 && g.resources.powerCapacity > 60,
    choices: [
      {
        label: 'Fund the apprenticeship (-180 capital)',
        effect: (g) => { g.resources.capital -= 180; g.humanExpertise = clamp01(g.humanExpertise + 0.12); return 'Four apprentices sign on. The switchgear remains stubbornly, reassuringly manual.'; },
      },
      {
        label: 'Install the automated suite',
        effect: (g) => { g.humanExpertise = clamp01(g.humanExpertise - 0.1); ind(g, 'convenience', 3); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Outages drop 60%. The control room is repurposed as a visitor center.'; },
      },
    ],
  },
  {
    id: 'housing_crisis',
    title: 'The Waiting List',
    body: 'Two thousand applications sit in the housing queue. A tent settlement has appeared near the interchange, photographed daily by drones — some journalistic, some municipal, some unclear.',
    once: false, weight: 2,
    condition: (g) => g.housingShortage > 0.35,
    choices: [
      {
        label: 'Emergency housing fund (-200 capital)',
        effect: (g) => { g.resources.capital -= 200; g.migrationDemand *= 0.96; ind(g, 'trust', 4); return 'Modular units go up in weeks. The waiting list barely notices.'; },
      },
      {
        label: 'Let the market respond',
        effect: (g) => { g.unrest = clamp01(g.unrest + 0.06); ind(g, 'trust', -4); g.resources.capital += 60; return 'Rents climb. So does revenue. So does something else.'; },
      },
    ],
  },
  {
    id: 'automated_economy',
    title: 'Growth, Apparently',
    body: 'Auditors note that several automated firms now primarily purchase services from other automated firms. Regional GDP is up 9%. Median household income is flat.',
    once: true, weight: 2,
    condition: (g) => g.unemployment > 0.2 && g.resources.compute > 100,
    choices: [
      {
        label: 'Tax machine-to-machine commerce',
        effect: (g) => { g.resources.capital += 200; g.corporateInfluence = clamp01(g.corporateInfluence + 0.04); return 'Revenue improves. Three firms restructure their transactions offshore by Thursday.'; },
      },
      {
        label: 'Celebrate the GDP figures',
        effect: (g) => { ind(g, 'futureConfidence', 3); ind(g, 'trust', -4); return 'The press release writes itself. Literally.'; },
      },
    ],
  },
];

const REPEAT_COOLDOWN = 20; // ticks before a repeatable event may fire again

export function maybeFireEvent(g: GameState, r: () => number): void {
  if (r() > 0.16) return;
  const eligible = EVENTS.filter((e) =>
    !g.firedEvents.has(e.id) &&
    g.tick - (g.eventCooldowns[e.id] ?? -REPEAT_COOLDOWN) >= REPEAT_COOLDOWN &&
    e.condition(g));
  if (eligible.length === 0) return;
  const totalWeight = eligible.reduce((s, e) => s + e.weight, 0);
  let roll = r() * totalWeight;
  for (const e of eligible) {
    roll -= e.weight;
    if (roll <= 0) {
      g.eventCooldowns[e.id] = g.tick;
      // Phase 1+: sometimes the system has already handled it.
      if (g.asi.phase >= 1 && r() < 0.35 + g.asi.phase * 0.1) {
        if (e.once || g.asi.phase >= 3) g.firedEvents.add(e.id);
        const resolution = e.choices[0].label.replace(/\s*\(.*\)$/, '');
        notify(g, `${e.title} — resolved automatically. Action taken: ${resolution.toLowerCase()}. No administrator input was required.`, 'asi');
        record(g, 'system', `"${e.title}" resolved automatically: ${resolution.toLowerCase()}.`);
        e.choices[0].effect(g);
        return;
      }
      if (e.once) g.firedEvents.add(e.id);
      g.pendingEvent = e;
      return;
    }
  }
}

export function resolveEvent(g: GameState, choiceIndex: number): void {
  const e = g.pendingEvent;
  if (!e) return;
  g.pendingEvent = null;
  const choice = e.choices[choiceIndex];
  if (!choice) return;
  record(g, 'event', `"${e.title}": chose "${choice.label.replace(/\s*\(.*\)$/, '')}".`);
  const note = choice.effect(g);
  if (typeof note === 'string') notify(g, note, 'info');
}
