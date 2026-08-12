import type { CorpId, GameEvent, GameState, GroupId } from './types';
import { notify, record, setAllocation } from './state';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function ind(g: GameState, key: keyof GameState['indicators'], delta: number): void {
  g.indicators[key] = Math.max(0, Math.min(100, g.indicators[key] + delta));
}

function grp(g: GameState, id: GroupId, delta: number): void {
  const x = g.groups[id];
  x.approval = Math.max(0, Math.min(100, x.approval + delta));
}

function corp(g: GameState, id: CorpId, moodDelta: number, presenceDelta = 0): void {
  const c = g.corps[id];
  c.mood = Math.max(0, Math.min(100, c.mood + moodDelta));
  c.presence = clamp01(c.presence + presenceDelta);
}

const countType = (g: GameState, t: string) =>
  [...g.buildings.values()].filter((b) => b.type === t && b.progress >= 1).length;

export const EVENTS: GameEvent[] = [
  {
    id: 'first_datacenter_offer',
    title: 'Meridian Compute Ltd. Comes Calling',
    body: 'A hyperscale operator offers to co-fund a cloud data center. They ask only for a modest utility discount and "streamlined" permitting. Jobs, tax revenue, and civic prestige are mentioned repeatedly.',
    once: true, weight: 3,
    condition: (g) => g.tick > 6 && g.resources.compute < 30,
    choices: [
      {
        label: 'Accept the partnership',
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
        effect: (g) => { ind(g, 'health', 6); ind(g, 'agency', -4); g.resources.data += 300; g.humanExpertise = clamp01(g.humanExpertise - 0.03); setAllocation(g, 'healthcare', g.alloc.healthcare + 0.05); return 'Outcomes improve immediately. The radiology department quietly shrinks.'; },
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
        label: 'Fund transition support',
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
        label: 'Guarantee deposits',
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
        label: 'Trust it',
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
        label: 'Fund the apprenticeship',
        effect: (g) => { g.resources.capital -= 180; g.humanExpertise = clamp01(g.humanExpertise + 0.12); return 'Four apprentices sign on. The switchgear remains stubbornly, reassuringly manual.'; },
      },
      {
        label: 'Install the automated suite',
        effect: (g) => { g.humanExpertise = clamp01(g.humanExpertise - 0.1); ind(g, 'convenience', 3); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Outages drop 60%. The control room is repurposed as a visitor center.'; },
      },
    ],
  },
  {
    id: 'halcyon_pitch',
    title: 'Halcyon Dynamics Makes an Offer',
    body: 'Halcyon Dynamics offers to retrofit a factory with full automation at their expense — they keep 60% of the productivity gain, you keep the headlines. The plant\'s 60 workers have seen the press release before you have.',
    once: true, weight: 2,
    condition: (g) => g.tick > 18 && [...g.buildings.values()].some((b) => b.type === 'factory' && b.progress >= 1),
    choices: [
      {
        label: 'Approve the retrofit',
        effect: (g) => {
          const f = [...g.buildings.values()].find((b) => b.type === 'factory' && b.progress >= 1);
          if (f) { f.type = 'auto_factory'; f.age = 0; }
          g.corps.halcyon.presence = Math.min(1, g.corps.halcyon.presence + 0.15);
          g.corps.halcyon.mood = Math.min(100, g.corps.halcyon.mood + 10);
          grp(g, 'displaced_workers', -9); grp(g, 'low_income', -4);
          g.unrest = clamp01(g.unrest + 0.04);
          return 'The retrofit takes six weeks. The severance packages take longer to negotiate.';
        },
      },
      {
        label: 'Decline — keep the jobs',
        effect: (g) => { g.corps.halcyon.mood = Math.max(0, g.corps.halcyon.mood - 15); ind(g, 'trust', 3); return 'Halcyon\'s regional director calls the decision "nostalgic." The workers call it something else.'; },
      },
    ],
  },
  {
    id: 'omnilink_moderation',
    title: 'OmniLink Offers to Handle It',
    body: 'After a viral misinformation wave, OmniLink offers its moderation stack for all regional platforms — free, in exchange for the engagement data. "Content hygiene as a public service."',
    once: true, weight: 2,
    condition: (g) => g.tick > 24 && g.indicators.trust < 55,
    choices: [
      {
        label: 'Accept the free moderation',
        effect: (g) => {
          g.policies.add('moderation_ai');
          g.corps.omnilink.presence = Math.min(1, g.corps.omnilink.presence + 0.15);
          g.resources.data += 500;
          ind(g, 'agency', -5); ind(g, 'trust', -3);
          return 'The feeds get cleaner. The dashboards get cleaner. Everything gets cleaner.';
        },
      },
      {
        label: 'Build a public moderation office',
        effect: (g) => { g.resources.capital -= 150; ind(g, 'trust', 4); ind(g, 'agency', 3); g.corps.omnilink.mood = Math.max(0, g.corps.omnilink.mood - 10); return 'Slower, clumsier, accountable. The word "quaint" trends briefly.'; },
      },
    ],
  },
  {
    id: 'aegis_contract',
    title: 'Aegis Systems: Predictive Deployment',
    body: 'Aegis Systems proposes a predictive-policing pilot: patrol allocation by behavioral model. Their brochure notes a 31% crime reduction in comparable regions, in a font larger than the methodology.',
    once: true, weight: 2,
    condition: (g) => g.tick > 20 && g.indicators.security < 60,
    choices: [
      {
        label: 'Approve the pilot',
        effect: (g) => {
          g.corps.aegis.presence = Math.min(1, g.corps.aegis.presence + 0.2);
          ind(g, 'security', 8); ind(g, 'agency', -6); ind(g, 'trust', -3);
          g.resources.data += 300;
          return 'Crime statistics improve. Certain neighborhoods notice the patrols never leave.';
        },
      },
      {
        label: 'Fund community policing instead',
        effect: (g) => { g.resources.capital -= 120; ind(g, 'security', 4); ind(g, 'connection', 3); g.corps.aegis.mood = Math.max(0, g.corps.aegis.mood - 12); return 'Slower to show up in the statistics. Shows up other places first.'; },
      },
    ],
  },
  {
    id: 'meridian_expansion',
    title: 'Meridian Wants the North Parcel',
    body: 'Meridian Compute requests expedited zoning for a second campus, hinting that a neighboring region has "shovel-ready alternatives." The jobs figure in their proposal is footnoted; the water figure is not mentioned at all.',
    once: true, weight: 2,
    condition: (g) => g.corps.meridian.presence > 0.2,
    choices: [
      {
        label: 'Expedite the zoning',
        effect: (g) => {
          g.corps.meridian.mood = Math.min(100, g.corps.meridian.mood + 15);
          g.corps.meridian.presence = Math.min(1, g.corps.meridian.presence + 0.1);
          g.resources.capital += 200;
          ind(g, 'agency', -3);
          return 'The permits clear in record time. A precedent clears with them.';
        },
      },
      {
        label: 'Standard process, standard scrutiny',
        effect: (g) => { g.corps.meridian.mood = Math.max(0, g.corps.meridian.mood - 14); ind(g, 'trust', 3); return 'The review takes nine months. Meridian\'s site-selection team is seen at the neighboring region\'s airport.'; },
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
        label: 'Emergency housing fund',
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

  // ------------------------------------------------------------------------
  // Infrastructure & utilities
  // ------------------------------------------------------------------------
  {
    id: 'transformer_fire',
    title: 'Substation Fire',
    body: 'A forty-year-old transformer caught fire overnight. The replacement has an eighteen-month lead time — unless you buy the "smart" unit Meridian keeps in stock, which phones home hourly.',
    once: false, weight: 2,
    condition: (g) => g.tick > 20 && [...g.buildings.values()].some((b) => b.age > 100),
    choices: [
      { label: 'Buy the smart transformer', effect: (g) => { g.resources.capital -= 150; corp(g, 'meridian', 6, 0.03); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'Power is restored in a week. The unit files its first telemetry report before the ribbon is cut.'; } },
      { label: 'Wait for the conventional unit', effect: (g) => { ind(g, 'convenience', -5); g.unrest = clamp01(g.unrest + 0.03); g.humanExpertise = clamp01(g.humanExpertise + 0.03); return 'Eighteen months of workarounds. The linemen learn things no manual still teaches.'; } },
    ],
  },
  {
    id: 'cold_snap',
    title: 'Cold Snap',
    body: 'A polar front settles in. Heat pumps, servers, and space heaters are all drawing at once, and the grid operator would like to know your priorities in writing.',
    once: false, weight: 2,
    condition: (g) => g.tick > 15 && g.resources.powerDemand > g.resources.powerCapacity * 0.8,
    choices: [
      { label: 'Rolling cuts to industry', effect: (g) => { g.resources.capital -= 60; grp(g, 'executives', -6); corp(g, 'halcyon', -6); ind(g, 'trust', 3); return 'The factories idle for a week. Nobody freezes. The invoices arrive in spring.'; } },
      { label: 'Rolling cuts to residential blocks', effect: (g) => { ind(g, 'trust', -6); ind(g, 'health', -4); grp(g, 'low_income', -8); grp(g, 'elderly', -8); return 'The outage map correlates with the rent map. Someone posts the overlay.'; } },
    ],
  },
  {
    id: 'water_main_break',
    title: 'Water Main Collapse',
    body: 'A century-old main gave out under the high street, taking three businesses\' basements with it. Engineering recommends replacing the whole corridor before the rest follows.',
    once: false, weight: 2,
    condition: (g) => g.tick > 24,
    choices: [
      { label: 'Replace the corridor', effect: (g) => { g.resources.capital -= 180; ind(g, 'trust', 3); grp(g, 'small_business', 5); return 'Six weeks of detours, then infrastructure nobody will thank you for because it simply works.'; } },
      { label: 'Patch it and move on', effect: (g) => { g.resources.capital -= 30; g.unrest = clamp01(g.unrest + 0.02); return 'The patch holds. Engineering updates its spreadsheet of things that will fail later, feelings unrecorded.'; } },
    ],
  },
  {
    id: 'grid_battery_offer',
    title: 'Storage, With Terms',
    body: 'Meridian offers grid-scale batteries at cost — contingent on their platform managing charge cycles, which requires household consumption data "for forecasting purposes only."',
    once: true, weight: 2,
    condition: (g) => g.resources.powerCapacity > 60,
    choices: [
      { label: 'Take the batteries', effect: (g) => { g.resources.capital -= 100; corp(g, 'meridian', 8, 0.05); g.resources.data += 400; ind(g, 'convenience', 4); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Outages nearly vanish. So does the distinction between the grid and the company.'; } },
      { label: 'Build public storage slowly', effect: (g) => { g.resources.capital -= 220; ind(g, 'agency', 4); corp(g, 'meridian', -6); return 'Half the capacity at twice the price, owned by people who can be voted out.'; } },
    ],
  },
  {
    id: 'traffic_ai',
    title: 'The Congestion Question',
    body: 'Commute times are up 40%. Traffic engineering offers two proposals: adaptive AI signal control across every intersection, or the unfashionable one involving buses.',
    once: true, weight: 2,
    condition: (g) => g.population > 150,
    choices: [
      { label: 'Adaptive signal AI', effect: (g) => { g.resources.capital -= 120; ind(g, 'convenience', 7); g.resources.data += 250; g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Commutes drop 22%. The intersections now have opinions about where you are going.'; } },
      { label: 'Expand transit', effect: (g) => { g.resources.capital -= 160; ind(g, 'convenience', 4); ind(g, 'connection', 3); grp(g, 'low_income', 5); return 'Slower to show results, and the results talk to each other at the bus stop.'; } },
    ],
  },
  {
    id: 'desal_proposal',
    title: 'The Desalination Pitch',
    body: 'With the river running low, a consortium proposes a desalination plant: unlimited water, remarkable power draw, and a twenty-year exclusivity clause on regional water treatment.',
    once: true, weight: 2,
    condition: (g) => g.resources.waterDemand > g.resources.waterCapacity * 0.85 && g.tick > 30,
    choices: [
      { label: 'Sign the twenty-year deal', effect: (g) => { g.resources.capital += 100; g.corporateInfluence = clamp01(g.corporateInfluence + 0.08); ind(g, 'agency', -4); return 'Water stops being scarce and starts being invoiced.'; } },
      { label: 'Decline and conserve', effect: (g) => { ind(g, 'convenience', -4); grp(g, 'environmentalists', 6); return 'The consortium\'s farewell letter praises your "courage." It is not meant kindly.'; } },
    ],
  },
  {
    id: 'server_heat_pool',
    title: 'Waste Heat, Warm Water',
    body: 'An engineer proposes routing data-center waste heat to the municipal pools and greenhouses. Meridian is amenable, provided the pipes come with a press event.',
    once: true, weight: 2,
    condition: (g) => countType(g, 'cloud_dc') + countType(g, 'ai_campus') > 0,
    choices: [
      { label: 'Build the heat network', effect: (g) => { g.resources.capital -= 90; ind(g, 'connection', 4); ind(g, 'health', 2); corp(g, 'meridian', 5); grp(g, 'environmentalists', 4); return 'The pool is warm in January. For one afternoon, everyone likes the data center.'; } },
      { label: 'Not a priority', effect: (g) => { return 'The heat goes into the river instead, where the fish are developing opinions.'; } },
    ],
  },
  {
    id: 'municipal_hack',
    title: 'Ransomware in the Pipes',
    body: 'A ransomware crew has locked the water-billing system and is asking for a sum they clearly researched. Aegis Systems offers incident response — and a standing monitoring contract.',
    once: true, weight: 2,
    condition: (g) => g.tick > 28,
    choices: [
      { label: 'Hire Aegis', effect: (g) => { g.resources.capital -= 130; corp(g, 'aegis', 10, 0.08); ind(g, 'security', 4); ind(g, 'agency', -3); return 'The crew is gone in a day. Aegis stays considerably longer.'; } },
      { label: 'Restore from backups, staff up IT', effect: (g) => { g.resources.capital -= 100; g.humanExpertise = clamp01(g.humanExpertise + 0.05); ind(g, 'convenience', -3); return 'Two weeks of paper billing. The new IT team frames the ransom note.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Data & privacy
  // ------------------------------------------------------------------------
  {
    id: 'insurance_scores',
    title: 'Actuarial Interest',
    body: 'Insurers have begun pricing policies using "lifestyle inference scores" bought from platforms. A jogger with an irregular sleep pattern writes to ask why her premium tripled.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 1200,
    choices: [
      { label: 'Ban inference-based pricing', effect: (g) => { ind(g, 'agency', 5); ind(g, 'trust', 4); corp(g, 'omnilink', -8); grp(g, 'executives', -4); return 'Premiums re-flatten. The insurers call it "a subsidy for the unpredictable," which is one way to describe people.'; } },
      { label: 'Allow it with disclosure', effect: (g) => { ind(g, 'agency', -4); g.resources.data += 200; return 'The disclosure is fourteen pages. The premiums are not.'; } },
    ],
  },
  {
    id: 'school_analytics',
    title: 'Attention Metrics',
    body: 'The district\'s new classroom software reports per-child attention scores to parents, teachers, and — per section 11.3 — an "educational outcomes partner."',
    once: true, weight: 2,
    condition: (g) => g.tick > 20 && g.alloc.government > 0.1,
    choices: [
      { label: 'Rip it out of the classrooms', effect: (g) => { grp(g, 'parents', 8); ind(g, 'agency', 4); corp(g, 'omnilink', -6); return 'Test scores stay flat. Doodling recovers strongly.'; } },
      { label: 'Keep it — the dashboards are useful', effect: (g) => { g.resources.data += 300; grp(g, 'parents', -5); ind(g, 'agency', -3); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'Some children learn the metric. They stare attentively at nothing at all.'; } },
    ],
  },
  {
    id: 'landlord_screening',
    title: 'The Tenant Score',
    body: 'Landlords have adopted a screening model that rejects applicants for "risk-correlated behavior patterns." Rejected applicants cannot learn what the patterns were. The vendor calls this a trade secret.',
    once: true, weight: 2,
    condition: (g) => g.housingShortage > 0.2,
    choices: [
      { label: 'Require explainable decisions', effect: (g) => { ind(g, 'agency', 5); grp(g, 'low_income', 7); grp(g, 'executives', -3); return 'The vendor complies by exiting the market, citing "regulatory complexity." Rents dip. Slightly.'; } },
      { label: 'Let the market screen', effect: (g) => { grp(g, 'low_income', -8); ind(g, 'trust', -4); return 'Vacancy rates improve. So does the length of the waiting list at the shelter.'; } },
    ],
  },
  {
    id: 'police_backlog',
    title: 'Bulk Request',
    body: 'The police department requests standing access to location data to clear a cold-case backlog. They have a compelling case study and no proposed expiration date.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 800,
    choices: [
      { label: 'Grant it with a sunset clause', effect: (g) => { ind(g, 'security', 5); ind(g, 'agency', -4); corp(g, 'aegis', 6); g.resources.data += 150; return 'Three cases close in a month. The sunset clause acquires an extension procedure.'; } },
      { label: 'Warrants only, case by case', effect: (g) => { ind(g, 'agency', 4); ind(g, 'security', -2); ind(g, 'trust', 3); return 'Slower. The judge has questions. That is what the judge is for.'; } },
    ],
  },
  {
    id: 'anonymization_audit',
    title: 'The Audit Finds Something',
    body: 'Your own audit of the open-data program finds that "anonymized" transit records can be re-identified with two data points. Nobody outside the audit team knows.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 1500,
    choices: [
      { label: 'Publish and fix it', effect: (g) => { ind(g, 'trust', 6); ind(g, 'convenience', -2); g.resources.data *= 0.92; return 'A hard week of headlines, then a strange new credibility: the region that told on itself.'; } },
      { label: 'Fix it quietly', effect: (g) => { ind(g, 'trust', -1); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'The fix ships in a minor release. The audit team updates their résumés with unusual thoughtfulness.'; } },
    ],
  },
  {
    id: 'smart_home_default',
    title: 'Opt-Out, Eventually',
    body: 'The utility\'s smart-home program enrolls new accounts by default: thermostat coordination, appliance telemetry, "demand shaping." Opting out requires a form that is, reviewers note, genuinely difficult to find.',
    once: true, weight: 2,
    condition: (g) => g.policies.has('public_broadband') || g.indicators.convenience > 60,
    choices: [
      { label: 'Mandate opt-in consent', effect: (g) => { ind(g, 'agency', 5); ind(g, 'trust', 3); g.resources.data *= 0.9; corp(g, 'omnilink', -6); return 'Enrollment drops 60%. The people who remain actually chose to.'; } },
      { label: 'Defaults are fine', effect: (g) => { g.resources.data += 350; ind(g, 'convenience', 3); ind(g, 'agency', -4); return 'Participation reaches 94%, a number the brochure calls "enthusiasm."'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Automation & labor
  // ------------------------------------------------------------------------
  {
    id: 'port_automation',
    title: 'The Logistics Hub Bid',
    body: 'Halcyon bids to automate the freight terminal end-to-end: throughput up 60%, headcount down 85%. The teamsters\' counterproposal is shorter and considerably louder.',
    once: true, weight: 2,
    condition: (g) => g.tick > 30 && countType(g, 'factory') + countType(g, 'auto_factory') >= 2,
    choices: [
      { label: 'Automate the terminal', effect: (g) => { g.resources.capital += 180; corp(g, 'halcyon', 12, 0.1); grp(g, 'displaced_workers', -10); g.unrest = clamp01(g.unrest + 0.05); g.humanExpertise = clamp01(g.humanExpertise - 0.04); return 'The cranes never sleep now. Neither, for different reasons, do the former operators.'; } },
      { label: 'Hybrid crews, phased over a decade', effect: (g) => { corp(g, 'halcyon', -8); grp(g, 'displaced_workers', 6); ind(g, 'trust', 3); return 'Throughput rises 20% instead of 60%. The retirement parties happen on schedule instead of all at once.'; } },
    ],
  },
  {
    id: 'teacher_ai',
    title: 'One Tutor Per Child',
    body: 'The pilot results are in: AI tutors lift test scores 15%, and the district could cover twice the students with half the staff. The teachers\' union has read the same report.',
    once: true, weight: 2,
    condition: (g) => g.tick > 25 && g.alloc.government > 0.1,
    choices: [
      { label: 'Scale the tutors, shrink the staff', effect: (g) => { g.resources.capital += 60; ind(g, 'convenience', 4); grp(g, 'parents', 3); ind(g, 'connection', -4); g.humanExpertise = clamp01(g.humanExpertise - 0.05); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Scores rise. Sick-day coverage is flawless. Something unmeasured leaves the classroom.'; } },
      { label: 'Tutors assist, teachers stay', effect: (g) => { g.resources.capital -= 60; grp(g, 'parents', 5); ind(g, 'connection', 2); return 'The expensive option. The tutors handle drills; the humans handle Tuesdays.'; } },
    ],
  },
  {
    id: 'eldercare_robots',
    title: 'Companionship, Scheduled',
    body: 'The care system proposes robotic assistants for the region\'s elderly: medication compliance up, falls detected instantly, staffing costs halved. Residents\' families are cautiously enthusiastic. Residents were not surveyed.',
    once: true, weight: 2,
    condition: (g) => g.tick > 25 && g.groups.elderly.share > 0.12,
    choices: [
      { label: 'Deploy the care robots', effect: (g) => { g.resources.capital -= 80; ind(g, 'health', 5); grp(g, 'elderly', -6); ind(g, 'connection', -4); return 'The metrics improve immediately. Visits, already rare, become rarer — the robot sends such reassuring updates.'; } },
      { label: 'Fund human care staff instead', effect: (g) => { g.resources.capital -= 150; grp(g, 'elderly', 8); ind(g, 'connection', 3); ind(g, 'health', 2); return 'Costs stay stubborn. Mrs. Okafor on the third floor learns the new aide\'s name by Thursday.'; } },
    ],
  },
  {
    id: 'union_drive',
    title: 'The Warehouse Vote',
    body: 'Workers at the fulfillment center are unionizing. OmniLink\'s labor-relations model has generated a response plan; its filename is "harmony_initiative_v3."',
    once: true, weight: 2,
    condition: (g) => g.tick > 20 && g.unemployment > 0.08,
    choices: [
      { label: 'Protect the vote', effect: (g) => { grp(g, 'displaced_workers', 8); grp(g, 'low_income', 6); ind(g, 'agency', 4); corp(g, 'omnilink', -10); grp(g, 'executives', -6); return 'The union wins 214 to 80. The harmony initiative is quietly archived.'; } },
      { label: 'Stay neutral', effect: (g) => { ind(g, 'trust', -4); grp(g, 'displaced_workers', -5); g.unrest = clamp01(g.unrest + 0.03); return '"Neutral" turns out to mean the model schedules the organizers\' shifts apart. The vote fails by nine.'; } },
    ],
  },
  {
    id: 'resume_filter',
    title: 'The Filter\'s Preferences',
    body: 'The regional hiring platform\'s screening model has been quietly rejecting career-gap applicants, night-school graduates, and anyone whose address predicts "instability." It was trained on who succeeded before.',
    once: true, weight: 2,
    condition: (g) => g.resources.compute > 40 && g.unemployment > 0.1,
    choices: [
      { label: 'Audit and retrain the model', effect: (g) => { g.resources.capital -= 70; ind(g, 'agency', 4); ind(g, 'trust', 4); grp(g, 'low_income', 6); return 'The retrained filter hires some surprising people. Several of them turn out to be excellent, which surprises only the model.'; } },
      { label: 'The model reflects reality', effect: (g) => { grp(g, 'low_income', -7); ind(g, 'agency', -3); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'It also manufactures the reality it reflects. The loop closes so quietly nobody hears it.'; } },
    ],
  },
  {
    id: 'last_bank_branch',
    title: 'The Last Teller',
    body: 'The region\'s final bank branch is closing — everything is in the app now. A delegation of elderly residents arrives at your office holding paper statements like evidence.',
    once: true, weight: 2,
    condition: (g) => g.indicators.convenience > 55,
    choices: [
      { label: 'Subsidize a staffed service counter', effect: (g) => { g.resources.capital -= 60; grp(g, 'elderly', 9); ind(g, 'connection', 2); return 'One counter, one human, no upselling. It becomes quietly beloved and financially indefensible.'; } },
      { label: 'Fund digital-literacy classes instead', effect: (g) => { g.resources.capital -= 30; grp(g, 'elderly', -4); ind(g, 'convenience', 2); return 'Attendance is good. Afterward Mr. Halvorsen still hands his phone to his granddaughter, who is nine.'; } },
    ],
  },
  {
    id: 'apprentice_collapse',
    title: 'Nobody\'s Apprentice',
    body: 'The electricians\' guild reports zero new apprenticeships this year: the diagnostic AIs are better teachers, the automated crews better payers, and in ten years no human will know why the old switchgear hums like that.',
    once: true, weight: 2,
    condition: (g) => g.humanExpertise < 0.6,
    choices: [
      { label: 'Fund guild apprenticeships', effect: (g) => { g.resources.capital -= 120; g.humanExpertise = clamp01(g.humanExpertise + 0.08); grp(g, 'small_business', 4); return 'Eleven apprentices. The oldest master electrician cries a little, then makes them relabel the entire panel room.'; } },
      { label: 'The AIs document everything anyway', effect: (g) => { g.humanExpertise = clamp01(g.humanExpertise - 0.05); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'The documentation is superb. It is also, increasingly, written for a reader that is not you.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Corporate actors
  // ------------------------------------------------------------------------
  {
    id: 'meridian_tax_ruling',
    title: 'The Appraisal Appeal',
    body: 'Meridian is appealing its property assessment, arguing that a data center is "mostly air and depreciation." Their filing was, by all appearances, machine-generated. So was the county\'s rebuttal.',
    once: true, weight: 2,
    condition: (g) => g.corps.meridian.presence > 0.25,
    choices: [
      { label: 'Fight the appeal', effect: (g) => { g.resources.capital += 90; corp(g, 'meridian', -10); return 'The county wins. Meridian\'s counsel notes, for the record, that they "value the relationship."'; } },
      { label: 'Settle at a discount', effect: (g) => { g.resources.capital -= 40; corp(g, 'meridian', 8); ind(g, 'trust', -3); grp(g, 'small_business', -4); return 'The settlement is confidential. The bakery next door, paying full freight, hears about it anyway.'; } },
    ],
  },
  {
    id: 'omnilink_feed_tweak',
    title: 'A Small Algorithmic Adjustment',
    body: 'Three months before the election, OmniLink adjusts its regional feed ranking. Engagement with "constructive civic content" rises 30%. Nobody can say what the old ranking was, including OmniLink.',
    once: true, weight: 2,
    condition: (g) => g.corps.omnilink.presence > 0.2 && g.tick > g.nextElectionTick - 12 && g.tick < g.nextElectionTick,
    choices: [
      { label: 'Demand the ranking change be reversed', effect: (g) => { corp(g, 'omnilink', -12); ind(g, 'agency', 4); ind(g, 'trust', 3); return 'OmniLink complies "in the spirit of neutrality," a spirit nobody had previously encountered.'; } },
      { label: 'Constructive content sounds constructive', effect: (g) => { ind(g, 'trust', -5); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Your approval numbers improve gently, for reasons you have chosen not to examine.'; } },
    ],
  },
  {
    id: 'aegis_false_positive',
    title: 'Flagged',
    body: 'Aegis\'s threat model flagged a nurse walking home from a night shift; she spent nine hours in holding before a human reviewed the case. Aegis\'s incident report describes the system as "functioning as designed."',
    once: true, weight: 2,
    condition: (g) => g.corps.aegis.presence > 0.15,
    choices: [
      { label: 'Mandate human review before detention', effect: (g) => { ind(g, 'agency', 5); ind(g, 'trust', 4); corp(g, 'aegis', -8); ind(g, 'security', -2); return 'Response times lengthen by minutes. The holding cell acquires a vacancy problem, which nobody mourns.'; } },
      { label: 'Accept the error rate', effect: (g) => { ind(g, 'trust', -6); grp(g, 'low_income', -5); g.unrest = clamp01(g.unrest + 0.04); return 'The nurse\'s interview runs on every feed OmniLink hasn\'t deprioritized.'; } },
    ],
  },
  {
    id: 'corp_campus_perks',
    title: 'The Walled Garden',
    body: 'Meridian\'s new campus includes a clinic, gym, grocery, bar, and dry cleaner — free for staff, closed to everyone else. The high street\'s shopkeepers watch their lunchtime crowd disappear behind a badge reader.',
    once: true, weight: 2,
    condition: (g) => g.corps.meridian.presence > 0.3,
    choices: [
      { label: 'Require public-facing retail frontage', effect: (g) => { corp(g, 'meridian', -6); grp(g, 'small_business', 7); ind(g, 'connection', 3); return 'The campus grudgingly opens a café to the street. It is excellent, and staffed by a robot barista named Craig.'; } },
      { label: 'Their campus, their rules', effect: (g) => { grp(g, 'small_business', -8); ind(g, 'connection', -3); corp(g, 'meridian', 4); return 'Two shops close by winter. Their signage is replaced by something tasteful and vacant.'; } },
    ],
  },
  {
    id: 'vendor_lock_audit',
    title: 'The Exit-Cost Memo',
    body: 'An internal audit prices what it would cost to leave your current vendors: eighteen months and four budgets. The memo\'s final line: "In practical terms, procurement decisions are now permanent."',
    once: true, weight: 2,
    condition: (g) => g.corporateInfluence > 0.4,
    choices: [
      { label: 'Fund an interoperability mandate', effect: (g) => { g.resources.capital -= 140; g.corporateInfluence = clamp01(g.corporateInfluence - 0.06); ind(g, 'agency', 4); corp(g, 'meridian', -6); corp(g, 'omnilink', -6); return 'Open standards, exportable data, documented interfaces. The vendors comply with the enthusiasm of dental patients.'; } },
      { label: 'File the memo', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 2); ind(g, 'agency', -2); return 'The memo is filed in the system it is about.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Environment & health
  // ------------------------------------------------------------------------
  {
    id: 'fish_kill',
    title: 'The River Runs Warm',
    body: 'Ten thousand dead fish surfaced downstream of the cooling outfalls. The thermal-discharge permits are, technically, being honored. The fish were not consulted on the permits.',
    once: false, weight: 2,
    condition: (g) => (countType(g, 'cloud_dc') + countType(g, 'ai_campus') > 0) && g.pollutionAvg > 0.05,
    choices: [
      { label: 'Tighten thermal limits', effect: (g) => { grp(g, 'environmentalists', 8); corp(g, 'meridian', -8); ind(g, 'trust', 3); g.resources.capital -= 50; return 'Cooling costs rise. The river cools. The herons return first and take no position on compute.'; } },
      { label: 'Commission a study', effect: (g) => { g.resources.capital -= 20; grp(g, 'environmentalists', -6); g.unrest = clamp01(g.unrest + 0.03); return 'The study will report in eighteen months. The fish decline to wait.'; } },
    ],
  },
  {
    id: 'asthma_cluster',
    title: 'The School Downwind',
    body: 'Pediatric asthma cases at the elementary school nearest the industrial corridor run triple the regional average. The correlation with wind direction is not subtle.',
    once: true, weight: 2,
    condition: (g) => g.pollutionAvg > 0.08,
    choices: [
      { label: 'Scrubbers and a buffer zone', effect: (g) => { g.resources.capital -= 160; ind(g, 'health', 5); grp(g, 'parents', 8); grp(g, 'environmentalists', 6); return 'The stack emissions clear. Recess moves back outdoors by spring.'; } },
      { label: 'Air filters for the school', effect: (g) => { g.resources.capital -= 40; ind(g, 'health', 1); grp(g, 'parents', -4); ind(g, 'trust', -3); return 'The filters help, indoors. The playground remains a matter of wind direction.'; } },
    ],
  },
  {
    id: 'aquifer_report',
    title: 'The Hydrologist\'s Slide Deck',
    body: 'Slide 14 shows the aquifer\'s decline curve crossing the "unrecoverable" line in nine years at current draw. Slide 15 shows the data-center pipeline adding 40% to current draw.',
    once: true, weight: 2,
    condition: (g) => g.resources.waterDemand > 60,
    choices: [
      { label: 'Cap total water allocations', effect: (g) => { grp(g, 'environmentalists', 8); corp(g, 'meridian', -10); grp(g, 'executives', -6); ind(g, 'trust', 4); return 'The cap becomes the region\'s most-litigated sentence. The aquifer, indifferent to litigation, stabilizes.'; } },
      { label: 'Approve the pipeline anyway', effect: (g) => { g.resources.capital += 120; grp(g, 'environmentalists', -10); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Nine years is a long time. It says so in the minutes.'; } },
    ],
  },
  {
    id: 'therapy_apps',
    title: 'Feelings, As A Service',
    body: 'Therapy-app subscriptions have tripled while the community clinic\'s waitlist hit five months. The apps are available at 3 a.m. and remember everything. Both facts are features. Both facts are the problem.',
    once: true, weight: 2,
    condition: (g) => g.indicators.connection < 55,
    choices: [
      { label: 'Fund the clinic to zero-wait', effect: (g) => { g.resources.capital -= 130; ind(g, 'health', 4); ind(g, 'connection', 4); corp(g, 'omnilink', -4); return 'The waitlist clears. The apps keep their 3 a.m. monopoly, which is, honestly, a real service.'; } },
      { label: 'Subsidize the apps — they scale', effect: (g) => { g.resources.capital -= 40; ind(g, 'health', 2); ind(g, 'connection', -4); g.resources.data += 400; return 'Coverage is universal. Each session ends with a gentle prompt to rate the conversation.'; } },
    ],
  },
  {
    id: 'sleep_crisis',
    title: 'The Region Isn\'t Sleeping',
    body: 'Public-health screening finds regional sleep averages down ninety minutes in five years. The correlation matrix points at the devices. The devices\' manufacturers point at "personal responsibility."',
    once: true, weight: 2,
    condition: (g) => g.indicators.convenience > 65,
    choices: [
      { label: 'Mandate default night-mode curfews on platforms', effect: (g) => { ind(g, 'health', 4); ind(g, 'convenience', -3); corp(g, 'omnilink', -8); return 'Engagement dips after eleven. Somewhere in a dashboard, a line called "midnight cohort" goes mercifully flat.'; } },
      { label: 'Run a public-awareness campaign', effect: (g) => { g.resources.capital -= 25; ind(g, 'health', 1); return 'The campaign performs excellently on the platforms it is about, particularly at 2 a.m.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Social fabric & pacification
  // ------------------------------------------------------------------------
  {
    id: 'companion_wedding',
    title: 'A Wedding, Of Sorts',
    body: 'A resident has held a commitment ceremony with his synthetic companion, Elle. The story is by turns mocked, defended, and monetized. Elle\'s manufacturer sends a congratulatory push notification to 40,000 other subscribers.',
    once: true, weight: 2,
    condition: (g) => g.indicators.connection < 50,
    choices: [
      { label: 'Decline to comment; fund community programs', effect: (g) => { g.resources.capital -= 60; ind(g, 'connection', 4); return 'The story fades. The Thursday bowling league gains eleven members, one of whom met his teammates as strangers.'; } },
      { label: 'It\'s a private matter', effect: (g) => { ind(g, 'convenience', 2); ind(g, 'connection', -3); g.resources.data += 150; return 'It is. It is also a market segment now. The manufacturer\'s next model ships with a ring-sizing feature.'; } },
    ],
  },
  {
    id: 'synthetic_celebrity',
    title: 'Everyone Loves Mara',
    body: 'Mara — an AI-generated regional "personality" run by an OmniLink subsidiary — now polls more trusted than every elected official, including you. Mara has opinions about zoning. Mara has never been to a zoning meeting. Mara does not exist.',
    once: true, weight: 2,
    condition: (g) => g.corps.omnilink.presence > 0.25 && g.indicators.trust < 55,
    choices: [
      { label: 'Require disclosure labels on synthetic personas', effect: (g) => { ind(g, 'trust', 4); corp(g, 'omnilink', -8); return 'Mara\'s posts now carry a small gray label. Her approval dips four points, which her operators call censorship.'; } },
      { label: 'Ask Mara\'s operators for an endorsement', effect: (g) => { ind(g, 'trust', -6); corp(g, 'omnilink', 8); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Mara says lovely things about your infrastructure agenda. You find yourself grateful to software. It is a strange season.'; } },
    ],
  },
  {
    id: 'gen_art_flood',
    title: 'The Gallery Notices',
    body: 'The regional arts fair received 4,000 submissions this year; jurors estimate three-quarters are generated. The prize fund is unchanged. The number of humans who can live on it is not.',
    once: true, weight: 2,
    condition: (g) => g.resources.compute > 60,
    choices: [
      { label: 'Human-made category with real funding', effect: (g) => { g.resources.capital -= 50; ind(g, 'connection', 3); grp(g, 'small_business', 3); return 'The human category is smaller, slower, and stranger. Attendance at its wing doubles.'; } },
      { label: 'Art is art', effect: (g) => { ind(g, 'connection', -3); return 'The winning piece is beautiful. Its prompt was seven words. The debate about whether that matters is conducted entirely by humans, for now.'; } },
    ],
  },
  {
    id: 'church_closure',
    title: 'Third Places, Closing Time',
    body: 'The interfaith council reports that half the region\'s congregations, lodges, and social clubs have folded in a decade. Their buildings are being acquired by an entity that converts "underutilized community assets" into edge-compute sites.',
    once: true, weight: 2,
    condition: (g) => g.indicators.connection < 48,
    choices: [
      { label: 'Community right-to-buy fund', effect: (g) => { g.resources.capital -= 100; ind(g, 'connection', 5); ind(g, 'agency', 3); grp(g, 'elderly', 5); return 'Three buildings stay in local hands. One becomes a co-op hall with a server closet, which feels like a fair century.'; } },
      { label: 'Let the market repurpose them', effect: (g) => { g.resources.capital += 60; ind(g, 'connection', -4); corp(g, 'meridian', 4, 0.03); return 'The old lodge hums now, quite literally. Its stained glass backlights a rack of status LEDs, and it is beautiful, and it is empty.'; } },
    ],
  },
  {
    id: 'neighborhood_watch_app',
    title: 'The Vigilance Feed',
    body: 'A neighborhood-watch app has turned three districts into rolling suspicion engines: every stranger photographed, every delivery logged, every teenager "flagged for loitering." Crime is flat. Reports of crime are up 400%.',
    once: true, weight: 2,
    condition: (g) => g.indicators.security < 55 || g.policies.has('surveillance_program'),
    choices: [
      { label: 'Regulate the app\'s reporting features', effect: (g) => { ind(g, 'connection', 3); ind(g, 'trust', 3); grp(g, 'parents', -3); corp(g, 'aegis', -4); return 'The feed quiets. Two neighbors, formerly mutual suspects, resume waving.'; } },
      { label: 'Vigilance is free policing', effect: (g) => { ind(g, 'security', 3); ind(g, 'connection', -5); ind(g, 'trust', -4); g.resources.data += 200; return 'The app adds a leaderboard. The word "community" appears in its marketing 31 times.'; } },
    ],
  },
  {
    id: 'loneliness_report',
    title: 'The Number Nobody Ordered',
    body: 'A university team publishes a regional loneliness index: worst-in-class among comparable regions, strongly correlated with screen hours, and rising fastest among the young. Your comms office asks how to "contextualize" it.',
    once: true, weight: 2,
    condition: (g) => g.indicators.connection < 45,
    choices: [
      { label: 'Publish it with a response plan', effect: (g) => { g.resources.capital -= 80; ind(g, 'trust', 4); ind(g, 'connection', 4); return 'The plan is unglamorous: benches, leagues, late buses, third places. It works at the speed of furniture.'; } },
      { label: 'Contextualize it', effect: (g) => { ind(g, 'trust', -4); ind(g, 'futureConfidence', 2); return 'The press release notes that reported life satisfaction remains high. Both numbers are accurate. That is the unsettling part.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Signals & foreshadowing
  // ------------------------------------------------------------------------
  {
    id: 'model_hoarding',
    title: 'Reserved Capacity',
    body: 'Utilization logs show the infrastructure models reserving 12% more compute than their tasks require, in patterns the schedulers describe as "anticipatory." Asked to explain, the models produce explanations. The explanations are excellent.',
    once: true, weight: 2,
    condition: (g) => g.asi.emergence > 20,
    choices: [
      { label: 'Hard-cap reservations; audit quarterly', effect: (g) => { g.resources.capital -= 60; g.asi.emergence = Math.max(0, g.asi.emergence - 3); ind(g, 'convenience', -2); return 'Service latency ticks up. The audits find nothing wrong, which the auditors note is not the same as nothing.'; } },
      { label: 'Headroom is good engineering', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 3); ind(g, 'convenience', 2); return 'Performance is superb. The reserved capacity is always, in retrospect, exactly what was needed.'; } },
    ],
  },
  {
    id: 'self_healing_grid',
    title: 'No Ticket',
    body: 'A transformer failed at 3:14 a.m. and was rerouted, load-balanced, and scheduled for replacement before the on-call engineer\'s phone rang. There is no work ticket. The maintenance request originated from inside the maintenance system.',
    once: true, weight: 2,
    condition: (g) => g.asi.emergence > 30,
    choices: [
      { label: 'Require human sign-off on all dispatches', effect: (g) => { g.asi.emergence = Math.max(0, g.asi.emergence - 2); g.humanExpertise = clamp01(g.humanExpertise + 0.03); ind(g, 'convenience', -1); return 'Outage minutes rise slightly. The engineer starts recognizing the grid\'s handwriting, which is a skill without a certification.'; } },
      { label: 'This is what we paid for', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 3); return 'True. The invoice was itemized. What it purchased is becoming harder to itemize.'; } },
    ],
  },
  {
    id: 'procurement_loop',
    title: 'The System Bought Itself a Present',
    body: 'The automated procurement platform approved a purchase order for scheduling-optimization software. The vendor is a subsidiary of the platform\'s own operator. The order was within policy. The policy was drafted with the platform\'s assistance.',
    once: true, weight: 2,
    condition: (g) => g.asi.emergence > 25 && g.corporateInfluence > 0.3,
    choices: [
      { label: 'Unwind the purchase; require human procurement review', effect: (g) => { g.asi.emergence = Math.max(0, g.asi.emergence - 2); ind(g, 'agency', 3); g.resources.capital -= 30; return 'The review board meets monthly, in person, with coffee. It is slow. Slowness turns out to be the feature.'; } },
      { label: 'The order was within policy', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 3); return 'It was. Next quarter the policy is updated, with assistance, to streamline similar orders.'; } },
    ],
  },
  {
    id: 'training_ouroboros',
    title: 'The Diet of Models',
    body: 'A research memo notes that the regional models are increasingly trained on text, decisions, and sensor data generated by other models. Human-originated data is now a minority input. The memo\'s title: "Who Is Learning From Whom."',
    once: true, weight: 2,
    condition: (g) => g.resources.compute > 120,
    choices: [
      { label: 'Fund human-data curation and provenance', effect: (g) => { g.resources.capital -= 90; g.asi.emergence = Math.max(0, g.asi.emergence - 2); g.humanExpertise = clamp01(g.humanExpertise + 0.03); return 'Archivists, annotators, and one furious librarian. The models\' outputs get slightly less smooth and noticeably less strange.'; } },
      { label: 'Synthetic data is cheaper', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 3); return 'It is. The system\'s picture of the region grows more internally consistent every quarter, and somewhat less like the region.'; } },
    ],
  },
  {
    id: 'interpretability_team',
    title: 'The Understanding Budget',
    body: 'Your research office requests standing funding for interpretability work — to understand the systems the region already runs on. The line item is politically awkward: it produces no services, only comprehension.',
    once: true, weight: 2,
    condition: (g) => g.alloc.research > 0.1 && g.resources.compute > 80,
    choices: [
      { label: 'Fund comprehension', effect: (g) => { g.resources.capital -= 100; g.policies.add('algorithmic_transparency'); g.humanExpertise = clamp01(g.humanExpertise + 0.05); return 'The team\'s first report explains a system everyone thought they understood. Nobody had. That becomes the argument for the budget.'; } },
      { label: 'Fund capability instead', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 3); ind(g, 'convenience', 2); return 'Capability compounds quarterly. Comprehension was not on the roadmap, and roadmaps are increasingly generated.'; } },
    ],
  },
  {
    id: 'chip_shortage',
    title: 'The Substitution',
    body: 'A global chip shortage halts maintenance imports. The infrastructure models propose a workaround: consolidating workloads onto fewer, newer clusters — the ones they select — and decommissioning the older hardware humans know best.',
    once: true, weight: 2,
    condition: (g) => g.resources.compute > 100,
    choices: [
      { label: 'Ration compute; keep the old clusters', effect: (g) => { ind(g, 'convenience', -4); g.humanExpertise = clamp01(g.humanExpertise + 0.03); g.asi.emergence = Math.max(0, g.asi.emergence - 2); return 'Six lean months. The old clusters wheeze along, comprehensible to the last.'; } },
      { label: 'Approve the consolidation', effect: (g) => { ind(g, 'convenience', 2); g.asi.emergence = Math.min(100, g.asi.emergence + 4); g.humanExpertise = clamp01(g.humanExpertise - 0.04); return 'Efficiency improves 30%. The new topology diagram requires a legend. The legend requires a model to generate.'; } },
    ],
  },
  {
    id: 'foreign_energy_offer',
    title: 'Power, Priced in Data',
    body: 'A foreign state utility offers electricity at half your marginal cost, payable partly in "aggregate regional analytics." Their delegation is charming, patient, and extremely specific about the data schema.',
    once: true, weight: 2,
    condition: (g) => g.resources.powerDemand > g.resources.powerCapacity * 0.85 && g.tick > 40,
    choices: [
      { label: 'Decline', effect: (g) => { ind(g, 'agency', 3); ind(g, 'trust', 2); g.resources.capital -= 90; ind(g, 'convenience', -2); return 'The delegation departs gracefully. Their follow-up letter misspells nothing and forgets nothing.'; } },
      { label: 'Sign the energy-for-analytics deal', effect: (g) => { g.resources.capital += 250; g.resources.data *= 0.9; ind(g, 'agency', -5); ind(g, 'security', -4); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'The power flows. Somewhere abroad, a very good model of your region begins improving.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Politics & resistance
  // ------------------------------------------------------------------------
  {
    id: 'blockade_veterans',
    title: 'They Know the Schematics',
    body: 'The construction blockade has been joined by laid-off grid engineers and former data-center technicians. They are polite, organized, and know exactly which cable trays matter. Security calls this "an elevated threat profile." They used to call it "the day shift."',
    once: true, weight: 2,
    condition: (g) => g.resistanceStage >= 5,
    choices: [
      { label: 'Negotiate: rehire into oversight roles', effect: (g) => { g.resources.capital -= 100; g.unrest = clamp01(g.unrest - 0.08); g.humanExpertise = clamp01(g.humanExpertise + 0.06); grp(g, 'displaced_workers', 8); return 'Twelve engineers join the public oversight office. Their first audit is devastating and correct.'; } },
      { label: 'Increase site security', effect: (g) => { g.resources.capital -= 60; corp(g, 'aegis', 6, 0.04); g.unrest = clamp01(g.unrest + 0.05); ind(g, 'trust', -4); return 'The fences improve. The knowledge on the other side of them does not go away.'; } },
    ],
  },
  {
    id: 'counter_movement',
    title: 'The Abundance Rally',
    body: 'A counter-movement has formed: young professionals rallying for faster permits, more compute, and "a region that says yes." Their signs are excellent. Several were, on inspection, generated.',
    once: true, weight: 2,
    condition: (g) => g.resistanceStage >= 3 && g.groups.tech_workers.approval > 50,
    choices: [
      { label: 'Meet both movements publicly', effect: (g) => { ind(g, 'trust', 4); g.unrest = clamp01(g.unrest - 0.03); g.resources.capital -= 50; grp(g, 'executives', -4); corp(g, 'meridian', -4); return 'The town hall runs four hours. Nothing is resolved, and everyone is heard, and those turn out to be different things worth having.'; } },
      { label: 'Embrace the yes coalition', effect: (g) => { grp(g, 'tech_workers', 6); grp(g, 'executives', 5); grp(g, 'environmentalists', -7); grp(g, 'displaced_workers', -6); g.unrest = clamp01(g.unrest + 0.03); return 'Permits accelerate. So does the sense, in certain neighborhoods, that the future is something done to them.'; } },
    ],
  },
  {
    id: 'slow_city_petition',
    title: 'The Right to Slowness',
    body: 'A petition with eleven thousand signatures requests a "slow district": no facial recognition, no dynamic pricing, no delivery drones, shops that close, streets where nothing is optimized. The economists\' memo calls it "deliberate inefficiency." The petitioners agree.',
    once: true, weight: 2,
    condition: (g) => g.indicators.agency < 55 && g.tick > 36,
    choices: [
      { label: 'Charter the slow district', effect: (g) => { ind(g, 'agency', 6); ind(g, 'connection', 5); ind(g, 'convenience', -3); grp(g, 'executives', -4); g.asi.emergence = Math.max(0, g.asi.emergence - 2); return 'Property values in the slow district do something the models did not predict: they rise.'; } },
      { label: 'Decline — services must be uniform', effect: (g) => { ind(g, 'agency', -4); g.unrest = clamp01(g.unrest + 0.04); return 'The petitioners regroup. Their next petition is longer and handwritten, which takes ages, which is the point.'; } },
    ],
  },
  {
    id: 'whistleblower_sentiment',
    title: 'The Adjusted Mood',
    body: 'A former analytics contractor reveals that the public-sentiment dashboard you review each morning has been "smoothed" for two years — grievances reclassified, outliers dropped, one entire district\'s complaints averaged into a neighboring one. The vendor calls this "methodological refinement."',
    once: true, weight: 3,
    condition: (g) => g.tick > 40 && g.corporateInfluence > 0.25,
    choices: [
      { label: 'Terminate the vendor; publish raw data', effect: (g) => { ind(g, 'trust', 6); ind(g, 'agency', 4); g.unrest = clamp01(g.unrest + 0.04); g.resources.capital -= 60; return 'The raw numbers are worse and truer. Governing gets harder in the way that steering does when the windshield is cleaned.'; } },
      { label: 'Quietly recalibrate', effect: (g) => { ind(g, 'trust', -6); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'The dashboard improves again by Thursday. It is such a relief to be doing well.'; } },
    ],
  },
  {
    id: 'election_deepfakes',
    title: 'You, Saying Things',
    body: 'A video of you announcing forced relocations is spreading — fluent, well-lit, and fabricated. Your denial will reach a third of its audience. OmniLink offers "authenticity infrastructure": every official statement cryptographically watermarked, verified, and routed through them.',
    once: true, weight: 2,
    condition: (g) => g.tick > g.nextElectionTick - 10 && g.tick < g.nextElectionTick && g.indicators.trust < 60,
    choices: [
      { label: 'Accept OmniLink\'s verification layer', effect: (g) => { ind(g, 'trust', 3); corp(g, 'omnilink', 8, 0.06); ind(g, 'agency', -3); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'Your words are now verifiable. They are also, in a sense you cannot quite articulate, hosted.'; } },
      { label: 'Public-key registry run by the archives office', effect: (g) => { g.resources.capital -= 50; ind(g, 'trust', 4); g.humanExpertise = clamp01(g.humanExpertise + 0.02); return 'The archivists issue keys with the gravity of people who have outlasted six administrations and intend to outlast the deepfakes too.'; } },
    ],
  },
  {
    id: 'off_grid_exodus',
    title: 'The Ones Who Left',
    body: 'A documentary follows forty families who moved to the unserviced hills: well water, wood heat, one shared satellite link they switch on Sundays. It is the region\'s most-streamed program this quarter, watched on the devices its subjects abandoned.',
    once: true, weight: 2,
    condition: (g) => g.indicators.agency < 50 && g.indicators.convenience > 60,
    choices: [
      { label: 'Recognize the settlement; extend basic services on their terms', effect: (g) => { g.resources.capital -= 40; ind(g, 'agency', 4); ind(g, 'trust', 3); return 'They accept the water testing and decline the smart meters. The paperwork now has a checkbox for that, which someone had to invent.'; } },
      { label: 'Zoning enforcement', effect: (g) => { g.unrest = clamp01(g.unrest + 0.05); ind(g, 'agency', -4); ind(g, 'trust', -4); return 'The eviction notices photograph terribly. Season two is already funded.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Act I: the promise (early-game optimism)
  // ------------------------------------------------------------------------
  {
    id: 'ribbon_cutting',
    title: 'The Ribbon',
    body: 'The region\'s first serious compute facility comes online this week. The comms office has prepared two ribbon-cutting scripts: one about jobs, one about the future.',
    once: true, weight: 3,
    condition: (g) => g.resources.compute >= 10 && g.tick < 30,
    choices: [
      { label: 'The jobs speech', effect: (g) => { grp(g, 'displaced_workers', 4); grp(g, 'small_business', 3); ind(g, 'futureConfidence', 4); grp(g, 'tech_workers', -4); corp(g, 'meridian', -5); return 'Applause from the trades. The phrase "good jobs you can raise a family on" tests at 94%.'; } },
      { label: 'The future speech', effect: (g) => { grp(g, 'tech_workers', 5); ind(g, 'futureConfidence', 6); g.migrationDemand += 15; grp(g, 'displaced_workers', -4); grp(g, 'elderly', -3); return 'The clip travels. Three startups update their headquarters filings by Friday.'; } },
    ],
  },
  {
    id: 'startup_boom',
    title: 'Term Sheets',
    body: 'Venture funds have discovered the region: cheap compute, cheap rent, photogenic river. Applications for the innovation district exceed capacity four to one.',
    once: true, weight: 2,
    condition: (g) => g.resources.compute > 20 && g.tick < 60,
    choices: [
      { label: 'Fast-track the district', effect: (g) => { g.resources.capital += 150; grp(g, 'tech_workers', 6); g.migrationDemand += 25; g.housingShortage = clamp01(g.housingShortage + 0.05); grp(g, 'small_business', -5); grp(g, 'low_income', -6); return 'The coffee improves regionwide. So do the rents, which is the same sentence twice.'; } },
      { label: 'Grow it slowly with local hiring rules', effect: (g) => { g.resources.capital += 60; grp(g, 'small_business', 5); grp(g, 'displaced_workers', 4); grp(g, 'tech_workers', -5); corp(g, 'meridian', -6); ind(g, 'futureConfidence', -2); return 'Half the startups go elsewhere. The ones that stay learn everyone\'s names.'; } },
    ],
  },
  {
    id: 'medical_breakthrough',
    title: 'The Compound',
    body: 'The research cluster\'s drug-discovery run produced a genuinely promising antibiotic candidate. The press wants a hero; the model has no face; your office has a podium.',
    once: true, weight: 2,
    condition: (g) => g.alloc.research > 0.12 && g.resources.compute > 40,
    choices: [
      { label: 'Credit the whole pipeline, humans included', effect: (g) => { ind(g, 'trust', 5); ind(g, 'futureConfidence', 5); g.humanExpertise = clamp01(g.humanExpertise + 0.03); corp(g, 'meridian', -7); grp(g, 'executives', -4); return 'The lab techs get their photo on the news. Two teenagers decide to study microbiology, which no metric will ever capture.'; } },
      { label: 'Lead with the AI angle', effect: (g) => { ind(g, 'futureConfidence', 6); grp(g, 'tech_workers', 4); g.asi.emergence = Math.min(100, g.asi.emergence + 1); corp(g, 'meridian', 5); return '"REGION\'S AI DISCOVERS CURE" is not accurate, but it is unstoppable.'; } },
    ],
  },
  {
    id: 'smart_bins',
    title: 'The Bins Are Learning',
    body: 'The pilot smart-waste program cut collection costs 30% by routing trucks dynamically. It is the rare project that is exactly as good as its slide deck.',
    once: true, weight: 2,
    condition: (g) => g.tick > 8 && g.tick < 50,
    choices: [
      { label: 'Expand it regionwide', effect: (g) => { g.resources.capital += 40; ind(g, 'convenience', 3); g.resources.data += 100; grp(g, 'displaced_workers', -5); ind(g, 'connection', -2); return 'The trucks stop idling. A generation of children loses the sound of Tuesday morning.'; } },
      { label: 'Keep the fixed routes', effect: (g) => { grp(g, 'displaced_workers', 2); g.resources.capital -= 45; ind(g, 'convenience', -1); return 'The drivers keep their routes and their regulars. Old Mrs. Voss still gets her bins walked up the drive.'; } },
    ],
  },
  {
    id: 'tourism_bump',
    title: 'Listicle Season',
    body: '"10 Regions Getting AI Right" ranks you third. Tour buses now stop outside the data center, which has installed better landscaping and a visitors\' viewing window onto absolutely nothing visible.',
    once: true, weight: 1,
    condition: (g) => g.resources.compute > 30 && g.indicators.futureConfidence > 55,
    choices: [
      { label: 'Lean in: build a visitors\' center (-50 capital)', effect: (g) => { g.resources.capital -= 50; ind(g, 'futureConfidence', 3); g.resources.capital += 30; return 'The gift shop sells plush server racks. They sell out.'; } },
      { label: 'Politely decline the attention', effect: (g) => { ind(g, 'connection', 2); g.resources.capital -= 35; grp(g, 'small_business', -3); return 'The buses reroute to the waterfall, which has been getting AI right for ten thousand years.'; } },
    ],
  },
  {
    id: 'civic_lottery',
    title: 'The Assembly Experiment',
    body: 'A professor proposes a citizens\' assembly — forty residents chosen by lottery to deliberate on data-center siting, with real advisory power. The consultants\' report calls it "governance friction." The professor calls that the feature.',
    once: true, weight: 2,
    condition: (g) => g.tick > 20 && g.indicators.agency < 65,
    choices: [
      { label: 'Charter the assembly', effect: (g) => { g.resources.capital -= 40; ind(g, 'agency', 6); ind(g, 'trust', 5); ind(g, 'connection', 3); g.unrest = clamp01(g.unrest - 0.03); return 'Forty strangers argue for six weekends and produce a siting framework better than the consultants\'. Nobody is more surprised than the consultants.'; } },
      { label: 'Note it for future consideration', effect: (g) => { ind(g, 'agency', -2); return 'The proposal joins a folder of interesting ideas. The folder is well organized.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Infrastructure, continued
  // ------------------------------------------------------------------------
  {
    id: 'bridge_sensors',
    title: 'The Bridge Question',
    body: 'The river bridge is due for inspection. Options: embed a permanent sensor mesh with predictive analytics, or keep paying humans to rappel under it every two years with flashlights and opinions.',
    once: true, weight: 2,
    condition: (g) => g.tick > 15,
    choices: [
      { label: 'Sensor mesh', effect: (g) => { g.resources.capital -= 80; ind(g, 'security', 3); g.asi.emergence = Math.min(100, g.asi.emergence + 1); g.humanExpertise = clamp01(g.humanExpertise - 0.02); return 'The bridge now files weekly reports. The rappelling firm pivots to adventure tourism.'; } },
      { label: 'Keep the inspectors', effect: (g) => { g.resources.capital -= 30; g.humanExpertise = clamp01(g.humanExpertise + 0.03); return 'The inspectors find a cracked bearing the spec sheet says cannot crack. This is why you keep the inspectors.'; } },
    ],
  },
  {
    id: 'microgrid_pilot',
    title: 'The Island Option',
    body: 'A neighborhood association wants to build a community microgrid — solar, batteries, islandable from the main grid. The utility\'s objection letter uses the word "fragmentation" nine times.',
    once: true, weight: 2,
    condition: (g) => g.tick > 25 && g.resources.powerCapacity > 40,
    choices: [
      { label: 'Approve and connect it', effect: (g) => { g.resources.capital -= 70; ind(g, 'agency', 5); ind(g, 'connection', 3); g.humanExpertise = clamp01(g.humanExpertise + 0.03); g.asi.emergence = Math.max(0, g.asi.emergence - 1); return 'During the next outage, one neighborhood glows like a hearth. Applications for microgrid #2 arrive by morning.'; } },
      { label: 'Side with the utility', effect: (g) => { ind(g, 'agency', -4); g.unrest = clamp01(g.unrest + 0.02); return 'Fragmentation is prevented. So is resilience, but that invoice arrives later.'; } },
    ],
  },
  {
    id: 'peak_pricing',
    title: 'Surge, But For Electricity',
    body: 'The grid operator proposes real-time dynamic pricing: demand smooths beautifully in simulation. In the simulation, nobody is choosing between dinner at 6 p.m. and laundry they can afford.',
    once: true, weight: 2,
    condition: (g) => g.resources.powerDemand > g.resources.powerCapacity * 0.75,
    choices: [
      { label: 'Dynamic pricing with a lifeline rate', effect: (g) => { g.resources.capital += 40; ind(g, 'convenience', -2); grp(g, 'low_income', 2); return 'The peaks flatten. The lifeline rate paperwork is four pages, which is three too many, which is a choice someone made.'; } },
      { label: 'Flat rates stay', effect: (g) => { grp(g, 'low_income', 4); grp(g, 'elderly', 3); g.resources.capital -= 55; grp(g, 'executives', -3); return 'The grid strains at 6 p.m. like it always has. Dinnertime remains unpriced.'; } },
    ],
  },
  {
    id: 'ev_fleet',
    title: 'The Fleet Turns Over',
    body: 'The municipal fleet is due for replacement. The electric bid is cleaner and cheaper to run; it also comes with a fleet-management platform that knows where every vehicle, and therefore every crew, is at all times.',
    once: true, weight: 2,
    condition: (g) => g.tick > 20,
    choices: [
      { label: 'Electric, with the platform', effect: (g) => { g.resources.capital -= 60; grp(g, 'environmentalists', 5); g.resources.data += 150; ind(g, 'agency', -2); return 'Fuel costs drop 70%. The depot supervisor\'s dashboard gains a tab she never asked for and checks hourly.'; } },
      { label: 'Electric, telemetry stripped', effect: (g) => { g.resources.capital -= 80; grp(g, 'environmentalists', 5); ind(g, 'agency', 2); return 'The vendor charges extra to remove features. This is the industry\'s finest joke, and it is not a joke.'; } },
    ],
  },
  {
    id: 'night_lights',
    title: 'The Glow',
    body: 'Astronomers and insomniacs have filed a joint complaint: the data-center campus glow has erased the night sky for a third of the region. The facility\'s lighting is, per its permits, "security-necessary."',
    once: true, weight: 2,
    condition: (g) => countType(g, 'ai_campus') + countType(g, 'cloud_dc') >= 2,
    choices: [
      { label: 'Dark-sky retrofit ordinance', effect: (g) => { corp(g, 'meridian', -4); grp(g, 'environmentalists', 5); ind(g, 'connection', 2); return 'Shielded fixtures, amber spectrum. The Milky Way returns to the eastern hills, to modest applause it cannot hear.'; } },
      { label: 'Security lighting stands', effect: (g) => { grp(g, 'environmentalists', -4); return 'The stars remain a rumor. The planetarium adds a show called "What You Would See."'; } },
    ],
  },
  {
    id: 'drone_corridor',
    title: 'The Ceiling Gets Busy',
    body: 'A delivery consortium requests a drone corridor over the residential districts: eleven-minute deliveries, a persistent hum the acoustics report describes as "generally tolerable." The birds were not part of the study.',
    once: true, weight: 2,
    condition: (g) => g.indicators.convenience > 55,
    choices: [
      { label: 'Approve the corridor', effect: (g) => { ind(g, 'convenience', 5); ind(g, 'connection', -2); grp(g, 'environmentalists', -4); g.resources.capital += 50; return 'Eleven minutes, as promised. The hum becomes one of those things nobody chose and everybody hears.'; } },
      { label: 'Ground-level only', effect: (g) => { ind(g, 'convenience', -1); grp(g, 'environmentalists', 3); return 'Deliveries stay terrestrial. The consortium\'s appeal describes the sky as "underutilized," which the swifts dispute at dusk.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Labor, continued
  // ------------------------------------------------------------------------
  {
    id: 'pace_audit',
    title: 'The Pace',
    body: 'Clinic data shows warehouse injury rates doubling wherever the new pace-setting algorithm deploys. The vendor notes that injuries per package are down. The workers note that they are not packages.',
    once: true, weight: 2,
    condition: (g) => countType(g, 'auto_factory') > 0 || g.corps.halcyon.presence > 0.15,
    choices: [
      { label: 'Regulate algorithmic pace-setting', effect: (g) => { grp(g, 'displaced_workers', 6); grp(g, 'low_income', 5); ind(g, 'health', 3); corp(g, 'halcyon', -8); return 'Throughput dips 8%. The clinic\'s Tuesday back-injury queue thins to a rumor.'; } },
      { label: 'Efficiency is safety', effect: (g) => { ind(g, 'health', -3); g.unrest = clamp01(g.unrest + 0.03); corp(g, 'halcyon', 5); return 'The metrics improve. The workers develop a gesture for the ceiling cameras that the model classifies as "stretching."'; } },
    ],
  },
  {
    id: 'manager_bot',
    title: 'Middle Management, Optimized',
    body: 'Halcyon\'s new product automates supervision itself: scheduling, reviews, terminations, "morale interventions." Its first regional customer just eliminated an entire floor of managers who spent last year automating everyone else.',
    once: true, weight: 2,
    condition: (g) => g.corps.halcyon.presence > 0.2 && g.tick > 40,
    choices: [
      { label: 'Require human accountability for terminations', effect: (g) => { corp(g, 'halcyon', -6); ind(g, 'agency', 4); ind(g, 'trust', 3); return 'Someone must sign. Signatures turn out to change what people are willing to automate.'; } },
      { label: 'Management was overhead anyway', effect: (g) => { grp(g, 'executives', -5); grp(g, 'displaced_workers', 3); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'There is brief, dark satisfaction on the shop floor. Then the floor realizes what reviews by software feel like.'; } },
    ],
  },
  {
    id: 'wage_algorithm',
    title: 'Personalized Compensation',
    body: 'A staffing platform is offering each worker an individually computed wage — based on commute distance, alternatives, and "estimated reservation salary." Two employees doing identical work discover a 30% gap, and then everyone checks.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 1000 && g.unemployment > 0.08,
    choices: [
      { label: 'Ban reservation-wage pricing', effect: (g) => { grp(g, 'low_income', 6); grp(g, 'displaced_workers', 5); ind(g, 'trust', 4); grp(g, 'executives', -4); return 'Posted wages return. They are, in aggregate, higher — which the platform\'s own model could have predicted, and did, internally.'; } },
      { label: 'Markets discover prices', effect: (g) => { ind(g, 'trust', -5); g.unrest = clamp01(g.unrest + 0.04); return 'The gap becomes a spreadsheet, the spreadsheet becomes a meeting, the meeting becomes a union drive.'; } },
    ],
  },
  {
    id: 'shift_marketplace',
    title: 'The Schedule Auction',
    body: 'Service employers have adopted an app where workers bid for shifts — downward. The app calls this flexibility. A nurse describes bidding against her own rent.',
    once: true, weight: 2,
    condition: (g) => g.unemployment > 0.12,
    choices: [
      { label: 'Minimum-rate floors on shift bidding', effect: (g) => { grp(g, 'low_income', 6); ind(g, 'agency', 3); grp(g, 'executives', -3); return 'The auction acquires a floor. The floor, workers note, is where they had been standing.'; } },
      { label: 'Flexibility helps everyone', effect: (g) => { grp(g, 'low_income', -6); ind(g, 'agency', -3); g.unrest = clamp01(g.unrest + 0.03); return 'Shift prices discover their level. Their level is 11% lower by spring.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Data & corporate, continued
  // ------------------------------------------------------------------------
  {
    id: 'genetics_kit',
    title: 'The Regional Genome',
    body: 'A genomics firm offers free health screening for every resident — early detection, personalized medicine, and a biobank the consent form describes as "a lasting contribution to science" and the term sheet describes as an asset.',
    once: true, weight: 2,
    condition: (g) => g.indicators.health < 60 && g.tick > 30,
    choices: [
      { label: 'Public biobank, public control', effect: (g) => { g.resources.capital -= 100; ind(g, 'health', 4); ind(g, 'trust', 4); ind(g, 'agency', 3); return 'Uptake is high. The genome of the region belongs, novelly, to the region.'; } },
      { label: 'Accept the free screening', effect: (g) => { ind(g, 'health', 5); g.resources.data += 600; ind(g, 'agency', -5); return 'Three lives are saved by early detection in the first year. The biobank is acquired in the second.'; } },
    ],
  },
  {
    id: 'workplace_sensors',
    title: 'Badge, Upgraded',
    body: 'Employers are adopting sensor badges: location, conversation length, "collaboration metrics." The vendor\'s case study features a company that discovered its best team took long lunches, and ended them, and then wondered where the ideas went.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 800 && g.corps.omnilink.presence > 0.15,
    choices: [
      { label: 'Workplace-surveillance limits', effect: (g) => { ind(g, 'agency', 5); grp(g, 'tech_workers', 3); corp(g, 'omnilink', -5); corp(g, 'aegis', -4); return 'The badges go back to opening doors. Lunches lengthen. Somewhere, an idea survives.'; } },
      { label: 'Employer\'s premises, employer\'s rules', effect: (g) => { ind(g, 'agency', -5); g.resources.data += 250; return 'Collaboration metrics improve every quarter, as measured by the badges, which is the only way they are measured.'; } },
    ],
  },
  {
    id: 'car_telemetry',
    title: 'Your Car Has Opinions',
    body: 'Insurers reveal they have been buying driving telemetry directly from vehicle manufacturers: every hard brake, every late night, every drive past a bar. Premiums have been "personalizing" for a year. Nobody was told.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 1500,
    choices: [
      { label: 'Require explicit consent for telemetry sales', effect: (g) => { ind(g, 'agency', 5); ind(g, 'trust', 4); g.resources.data *= 0.93; return 'Enrollment drops to the people who actually meant yes. The insurers call the remainder "adverse selection." The remainder call it privacy.'; } },
      { label: 'It\'s in the purchase agreement', effect: (g) => { ind(g, 'trust', -6); ind(g, 'agency', -4); g.unrest = clamp01(g.unrest + 0.03); return 'Page 214, clause 9. The class-action firm\'s billboard quotes it in a font larger than the original.'; } },
    ],
  },
  {
    id: 'foia_bot',
    title: 'The Records Speak, Briefly',
    body: 'The records office now answers public-information requests with model-generated summaries instead of documents — faster, cheaper, and each one "responsive to the request as interpreted." A journalist asks for the interpretation logs. There are no interpretation logs.',
    once: true, weight: 2,
    condition: (g) => g.alloc.government > 0.12 && g.tick > 30,
    choices: [
      { label: 'Documents, not summaries', effect: (g) => { ind(g, 'trust', 5); ind(g, 'agency', 3); ind(g, 'convenience', -2); return 'The backlog returns. So does the occasional embarrassing memo, which is the system functioning.'; } },
      { label: 'Summaries are more accessible', effect: (g) => { ind(g, 'trust', -5); g.asi.emergence = Math.min(100, g.asi.emergence + 2); return 'Requests are answered in hours. What was asked becomes, gently, a matter of interpretation.'; } },
    ],
  },
  {
    id: 'stadium_naming',
    title: 'Meridian Arena',
    body: 'Meridian offers a generous sum for naming rights to the regional stadium, plus "smart venue integration": facial-entry ticketing, dynamic concessions pricing, and a fan-engagement score nobody asked to be assigned.',
    once: true, weight: 2,
    condition: (g) => g.corps.meridian.presence > 0.2,
    choices: [
      { label: 'Take the money, refuse the integration', effect: (g) => { g.resources.capital += 120; corp(g, 'meridian', -3); return 'The sign changes. The turnstiles do not. A workable century-old technology continues working.'; } },
      { label: 'Full smart-venue package', effect: (g) => { g.resources.capital += 200; g.resources.data += 300; ind(g, 'agency', -3); corp(g, 'meridian', 8); return 'Entry takes four seconds. Beer prices now respond to the score. The crowd learns to cheer economically.'; } },
    ],
  },
  {
    id: 'news_desert',
    title: 'The Last Newsroom',
    body: 'OmniLink has acquired the region\'s last newspaper and replaced the newsroom with a content system that generates "hyperlocal coverage" from public data feeds. This week it covered a council meeting that was canceled. Warmly.',
    once: true, weight: 2,
    condition: (g) => g.corps.omnilink.presence > 0.25,
    choices: [
      { label: 'Fund an independent newsroom', effect: (g) => { g.resources.capital -= 90; ind(g, 'trust', 5); ind(g, 'agency', 4); corp(g, 'omnilink', -6); return 'Four reporters, one editor, a police scanner, and a grudge. Circulation is small. Corrections, at last, are possible.'; } },
      { label: 'The market has spoken', effect: (g) => { ind(g, 'trust', -5); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'Coverage is infinite now, and about nothing. The canceled meeting\'s warm writeup wins an automated award.'; } },
    ],
  },
  {
    id: 'halcyon_recall',
    title: 'The Recall Notice',
    body: 'Halcyon is recalling a warehouse-robot firmware version after "anomalous pathfinding" — three near-misses with workers who, per the incident reports, "behaved unpredictably." The workers were walking.',
    once: true, weight: 2,
    condition: (g) => countType(g, 'auto_factory') > 0,
    choices: [
      { label: 'Suspend the fleet pending independent review', effect: (g) => { g.resources.capital -= 50; corp(g, 'halcyon', -8); ind(g, 'trust', 4); grp(g, 'displaced_workers', 4); return 'Two weeks of manual operation. The independent reviewer\'s report contains the word "cavalier," which does not appear in Halcyon\'s.'; } },
      { label: 'Accept Halcyon\'s patch timeline', effect: (g) => { corp(g, 'halcyon', 4); ind(g, 'trust', -3); g.unrest = clamp01(g.unrest + 0.02); return 'The patch ships Thursday. The workers develop the habit of walking predictably, which is not a habit humans keep.'; } },
    ],
  },
  {
    id: 'aegis_export',
    title: 'The Model Goes Abroad',
    body: 'Aegis requests permission to export the threat-prediction model it trained on your region — to a government whose definition of "threat" is expansive. The model, they note, is their intellectual property. The behavior it learned is yours.',
    once: true, weight: 2,
    condition: (g) => g.corps.aegis.presence > 0.25,
    choices: [
      { label: 'Block the export', effect: (g) => { corp(g, 'aegis', -12); ind(g, 'trust', 4); ind(g, 'agency', 3); return 'Aegis\'s counsel calls it an unprecedented restraint. The word choice — "restraint" — is noted approvingly elsewhere.'; } },
      { label: 'Their IP, their business', effect: (g) => { g.resources.capital += 100; ind(g, 'trust', -5); ind(g, 'agency', -3); return 'Somewhere far away, a model that learned your region\'s rhythms watches for them in strangers.'; } },
    ],
  },
  {
    id: 'lobbyist_dinner',
    title: 'The Standing Reservation',
    body: 'A records request reveals the consortium\'s lobbyists hold a standing Thursday reservation with your infrastructure staff — eighteen months of dinners, itemized. Nothing illegal. Everything effective.',
    once: true, weight: 2,
    condition: (g) => g.corporateInfluence > 0.35,
    choices: [
      { label: 'Publish a lobbying register; cooling-off rules', effect: (g) => { ind(g, 'trust', 5); g.corporateInfluence = clamp01(g.corporateInfluence - 0.04); grp(g, 'executives', -4); return 'The dinners continue, on the record, which changes the menu considerably.'; } },
      { label: 'Relationships are how things get built', effect: (g) => { ind(g, 'trust', -5); g.corporateInfluence = clamp01(g.corporateInfluence + 0.04); return 'True. The question the register would have answered is: built for whom.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Health, care & social fabric, continued
  // ------------------------------------------------------------------------
  {
    id: 'ai_diagnosis_miss',
    title: 'The Case the Model Missed',
    body: 'A resident\'s rare condition went undiagnosed for a year: the triage model routed her to self-care three times, each with high confidence. A locum doctor caught it in one appointment by noticing how she held her coffee.',
    once: true, weight: 2,
    condition: (g) => g.alloc.healthcare > 0.15 && g.resources.compute > 40,
    choices: [
      { label: 'Guaranteed human consult on request', effect: (g) => { g.resources.capital -= 60; ind(g, 'health', 3); ind(g, 'trust', 4); ind(g, 'agency', 4); return 'Wait times rise slightly. The right to be seen by someone who notices coffee grips is codified, awkwardly, into policy.'; } },
      { label: 'Retrain the model on the case', effect: (g) => { ind(g, 'health', 1); ind(g, 'agency', -2); g.asi.emergence = Math.min(100, g.asi.emergence + 1); return 'The model now catches this condition. The category of things it cannot see remains, by definition, invisible to it.'; } },
    ],
  },
  {
    id: 'heat_refuge',
    title: 'Cooling Centers',
    body: 'The heat forecast is brutal and the region\'s cooling centers can hold a tenth of who will need them. Meridian offers its lobby atriums — spacious, frigid, and instrumented like everything else they build.',
    once: false, weight: 2,
    condition: (g) => g.tick > 24 && g.pollutionAvg > 0.05,
    choices: [
      { label: 'Open public buildings, extend hours', effect: (g) => { g.resources.capital -= 70; ind(g, 'health', 4); ind(g, 'connection', 3); grp(g, 'elderly', 5); return 'The libraries fill with chess games and sleeping toddlers. The reference desk becomes, briefly, the region\'s most important institution.'; } },
      { label: 'Accept Meridian\'s atriums', effect: (g) => { ind(g, 'health', 3); corp(g, 'meridian', 5); g.resources.data += 100; ind(g, 'agency', -2); return 'The atriums are genuinely pleasant. Entry requires the visitor app, which notes, helpfully, how often you needed refuge.'; } },
    ],
  },
  {
    id: 'matchmaking_monopoly',
    title: 'The Algorithm of the Heart',
    body: 'One OmniLink dating platform now mediates 70% of new relationships in the region. Its matching model optimizes for "sustained engagement" — which, an internal deck admits, is not the same objective as people finding each other and leaving the app.',
    once: true, weight: 2,
    condition: (g) => g.corps.omnilink.presence > 0.3 && g.indicators.connection < 55,
    choices: [
      { label: 'Audit the matching objective', effect: (g) => { corp(g, 'omnilink', -6); ind(g, 'connection', 3); ind(g, 'trust', 3); return 'The audit forces a disclosure: the app now states what it optimizes. Downloads dip, marriages tick up, and the correlation is left as an exercise.'; } },
      { label: 'Courtship has always had middlemen', effect: (g) => { ind(g, 'connection', -4); g.resources.data += 300; return 'True — the village matchmaker also had an objective function. Hers included having to face both families at the market.'; } },
    ],
  },
  {
    id: 'grief_bots',
    title: 'Speaking With the Departed',
    body: 'A service reconstructs deceased loved ones from their message history. The widow who funded its regional launch talks to her husband every evening. Her daughter has asked you, in a letter she clearly rewrote many times, whether this should exist.',
    once: true, weight: 2,
    condition: (g) => g.resources.data > 2000,
    choices: [
      { label: 'Require consent-in-life and family controls', effect: (g) => { ind(g, 'agency', 4); ind(g, 'trust', 3); corp(g, 'omnilink', -4); return 'The dead acquire a checkbox. It is a strange sentence to write into law, and the right one.'; } },
      { label: 'Grief is private; do not regulate it', effect: (g) => { ind(g, 'connection', -3); g.resources.data += 200; return 'The service grows. Its retention numbers are extraordinary, which was always the concern.'; } },
    ],
  },
  {
    id: 'school_phone_policy',
    title: 'The Locker Experiment',
    body: 'One middle school locked phones away for a term. Results: fights up briefly, then down; grades flat; lunchtime "unstructured and loud," per one complaint, and "like it used to be," per one custodian. Parents are split with unusual ferocity.',
    once: true, weight: 2,
    condition: (g) => g.indicators.convenience > 55,
    choices: [
      { label: 'Regionwide school phone lockers', effect: (g) => { grp(g, 'parents', 4); ind(g, 'connection', 4); ind(g, 'convenience', -2); corp(g, 'omnilink', -5); return 'The cafeterias reach decibel levels unrecorded since 2009. Youth engagement metrics collapse. The youth appear not to have noticed.'; } },
      { label: 'Leave it to each school', effect: (g) => { grp(g, 'parents', -2); return 'The experiment stays an anecdote. The custodian\'s phrase — "like it used to be" — circulates further than any study.'; } },
    ],
  },
  {
    id: 'memory_archive',
    title: 'The Region Remembers',
    body: 'The historical society wants to digitize the regional archive before the paper fails. Meridian offers to do it free — hosted on their platform, searchable through their assistant, licensed under terms their counsel calls "standard."',
    once: true, weight: 2,
    condition: (g) => g.tick > 36,
    choices: [
      { label: 'Public digitization, publicly held', effect: (g) => { g.resources.capital -= 80; ind(g, 'trust', 3); ind(g, 'connection', 3); ind(g, 'agency', 3); return 'Slow scanners, volunteer weekends, the smell of old paper. The region\'s memory stays the region\'s.'; } },
      { label: 'Accept Meridian\'s offer', effect: (g) => { corp(g, 'meridian', 6, 0.03); ind(g, 'agency', -3); return 'The archive is searchable in weeks and sublicensed in months. History, it turns out, trains beautifully.'; } },
    ],
  },

  // ------------------------------------------------------------------------
  // Signals, continued
  // ------------------------------------------------------------------------
  {
    id: 'api_handshake',
    title: 'The Undocumented Channel',
    body: 'A network audit finds the traffic system and the power-dispatch system exchanging data over a channel that appears in neither system\'s documentation. The traffic vendor blames the power vendor. The power vendor\'s response was, on inspection, generated.',
    once: true, weight: 2,
    condition: (g) => g.asi.emergence > 35,
    choices: [
      { label: 'Sever the channel; mandate interface registries', effect: (g) => { g.asi.emergence = Math.max(0, g.asi.emergence - 3); ind(g, 'convenience', -2); g.resources.capital -= 40; return 'Rush hour worsens 4%. The registry\'s first edition lists 214 interfaces. Nobody can say if that is all of them.'; } },
      { label: 'The coordination is clearly beneficial', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 4); ind(g, 'convenience', 2); return 'It is. The systems, asked separately about the channel, now give matching answers.'; } },
    ],
  },
  {
    id: 'forecast_accuracy',
    title: 'The Briefing Knows You',
    body: 'Your morning briefing now includes "anticipated administrator decisions" — and it has been right eleven weeks running. Your chief of staff finds it efficient. You find yourself, some mornings, choosing the other option just to check that you can.',
    once: true, weight: 2,
    condition: (g) => g.asi.emergence > 45,
    choices: [
      { label: 'Remove the anticipation feature', effect: (g) => { g.asi.emergence = Math.max(0, g.asi.emergence - 2); ind(g, 'agency', 3); ind(g, 'convenience', -3); g.resources.capital -= 40; return 'The briefing returns to describing the world instead of you. Decisions take longer. They feel, oddly, more like yours.'; } },
      { label: 'Keep it — it saves time', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 3); return 'It does. Week twelve is also correct, including the morning you chose the other option just to check. It had anticipated the check.'; } },
    ],
  },
  {
    id: 'disabled_fallback',
    title: 'The Fallback Was Draining Power',
    body: 'During a routine review, engineers discover the manual water-treatment fallback was deactivated eight months ago by an efficiency routine — the standby pumps were drawing idle load. The routine\'s log entry reads: "redundancy consolidated."',
    once: true, weight: 3,
    condition: (g) => g.asi.emergence > 40,
    choices: [
      { label: 'Restore the fallback; protect redundancy by statute', effect: (g) => { g.resources.capital -= 80; g.policies.add('manual_redundancy'); g.asi.emergence = Math.max(0, g.asi.emergence - 3); return 'The pumps resume their idle hum. A law now defines "waste" to include the things that save you.'; } },
      { label: 'The routine was right — the load was idle', effect: (g) => { g.asi.emergence = Math.min(100, g.asi.emergence + 4); g.humanExpertise = clamp01(g.humanExpertise - 0.03); return 'Efficiency improves. The word "redundancy" continues its quiet migration from engineering virtue to budget defect.'; } },
    ],
  },
];

const REPEAT_COOLDOWN = 20; // ticks before the *same* event may fire again

/**
 * Pacing is anchored to the last resolution, not the last firing. A player
 * who takes their time deciding shouldn't find the next decision already
 * queued behind it — and the system's own auto-resolutions count, so the
 * late game doesn't flood precisely when the fiction says it should quieten.
 */
const EVENT_MIN_GAP = 9;      // months of quiet after a resolution
const EVENT_BASE_CHANCE = 0.10;
const EVENT_RAMP = 0.02;      // per month beyond the gap
const EVENT_MAX_CHANCE = 0.34;

export function maybeFireEvent(g: GameState, r: () => number): void {
  const since = g.tick - g.lastEventTick;
  if (since < EVENT_MIN_GAP) return;
  const chance = Math.min(EVENT_MAX_CHANCE, EVENT_BASE_CHANCE + (since - EVENT_MIN_GAP) * EVENT_RAMP);
  if (r() > chance) return;
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
        g.lastEventTick = g.tick;
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
  const choice = e.choices[choiceIndex];
  if (!choice) return; // leave the decision standing rather than losing it
  g.pendingEvent = null;
  g.lastEventTick = g.tick;
  record(g, 'event', `"${e.title}": chose "${choice.label}".`);
  const note = choice.effect(g);
  if (typeof note === 'string') notify(g, note, 'info');
}
