// Core data model for The Optimization Problem.

export type TerrainType = 'grass' | 'forest' | 'water' | 'sand' | 'rock';

export interface Tile {
  terrain: TerrainType;
  variant: number;      // deterministic per-tile art variation
  road: boolean;
  roadType: number;     // 0 dirt, 1 street, 2 avenue, 3 highway
  buildingId: number;   // -1 = none
  pollution: number;    // 0..1 local ground pollution
}

export type BuildingType =
  | 'road'
  | 'dirt_road'
  | 'avenue'
  | 'highway'
  | 'bridge'
  | 'house'
  | 'apartment'
  | 'midrise'
  | 'highrise'
  | 'arcology'
  | 'park'
  | 'plaza'
  | 'school'
  | 'library'
  | 'sports_complex'
  | 'museum'
  | 'community_center'
  | 'solar_array'
  | 'water_reclamation'
  | 'solar_farm'
  | 'coal_plant'
  | 'nuclear_plant'
  | 'water_plant'
  | 'hospital'
  | 'factory'
  | 'auto_factory'
  | 'office'
  | 'retail'
  | 'edge_dc'
  | 'cloud_dc'
  | 'ai_campus'
  | 'gov_dc'
  | 'med_dc'
  | 'community_dc';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  desc: string;
  category: 'civic' | 'power' | 'industry' | 'compute' | 'zone' | 'amenity';
  w: number;
  h: number;
  cost: number;
  upkeep: number;        // capital per tick
  jobs: number;          // labor demand (staffing)
  housing: number;
  power: number;         // + produces, - consumes
  water: number;         // + produces, - consumes
  compute: number;       // compute produced
  pollution: number;     // emitted per tick, spread locally
  income: number;        // tax/corporate revenue per tick when active
  buildTicks: number;    // construction duration in ticks
  unlockCompute?: number; // total compute required before available
  unlockTier?: number;    // region-class index required (0 Township .. 3 Megaregion)
  /** Producers only: tiles from the footprint edge that this facility serves. */
  serviceRadius?: number;
  /** Roads only: traffic capacity per tile, and the road tier it paints. */
  roadCapacity?: number;
  roadType?: number;
  /** Contribution to the amenity component of regional attractiveness. */
  amenity?: number;
  /** Contribution to the services component (education, care, civic capacity). */
  services?: number;
}

/**
 * Why people do or don't want to live here. Every component is named and
 * inspectable: growth should never be a number that simply happens.
 */
export interface Attractiveness {
  jobs: number;
  housing: number;
  amenities: number;
  services: number;
  environment: number;
  safety: number;
  cost: number;
  overall: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  progress: number;      // 0..1, 1 = complete
  active: boolean;       // has power/water/staff
  age: number;
  asiBuilt?: boolean;    // constructed autonomously by the system
  /** Why this building is offline, for the inspector. Empty when running. */
  offlineReason?: 'road' | 'labor' | 'power' | 'water' | 'utility';
}

/** Where scarce compute is allocated, as fractions summing to 1. */
export interface ComputeAllocation {
  consumer: number;
  healthcare: number;
  industry: number;
  government: number;
  research: number;
  surveillance: number;
}

export type PolicyId =
  // labor & welfare
  | 'ubi'
  | 'automation_tax'
  | 'retraining'
  | 'reduced_workweek'
  | 'public_employment'
  | 'human_staffing'
  | 'gig_protections'
  // data & privacy
  | 'data_privacy'
  | 'citizen_royalties'
  | 'data_localization'
  | 'right_to_delete'
  | 'childrens_privacy'
  | 'biometric_surveillance'
  | 'surveillance_program'
  // environment & infrastructure
  | 'renewable_subsidy'
  | 'carbon_tax'
  | 'water_rationing'
  | 'green_belt'
  | 'ewaste_program'
  | 'free_transit'
  | 'public_broadband'
  // information & AI oversight
  | 'moderation_ai'
  | 'open_data_portal'
  | 'algorithmic_transparency'
  | 'ai_ethics_board'
  | 'public_ai_option'
  | 'manual_redundancy'
  // corporate governance
  | 'corporate_incentives'
  | 'antitrust_enforcement'
  | 'local_procurement';

export type PolicyCategory = 'labor' | 'data' | 'environment' | 'information' | 'corporate';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  desc: string;
  costPerTick: number;
  category: PolicyCategory;
}

export interface Indicators {
  convenience: number;
  trust: number;
  agency: number;
  security: number;
  connection: number;
  health: number;
  futureConfidence: number;
}

export interface Resources {
  capital: number;
  powerCapacity: number;
  powerDemand: number;
  waterCapacity: number;
  waterDemand: number;
  compute: number;        // total produced
  computeDemand: number;  // what society wants
  data: number;           // accumulated personal data (abstract units)
}

/** 0 = none .. 6 = administrative lockout / observer mode */
export type AsiPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Per-campaign weights on the hidden emergence drivers, generated from the
 * map seed — so no fixed formula solves every campaign.
 */
export interface EmergenceWeights {
  compute: number;
  research: number;
  dependence: number;
  data: number;
  automation: number;
  corporate: number;
  oversight: number;
}

export interface AsiState {
  emergence: number;       // hidden 0..100
  phase: AsiPhase;
  phaseTick: number;       // tick at which current phase began
  noticesShown: string[];  // one-shot flavour notices already delivered
  renamed: boolean;
  observer: boolean;
  weights: EmergenceWeights;
  thresholds: number[];    // per-campaign phase thresholds (6 entries)
  /** Policies the player "repealed" that the system still runs under new names. */
  shadowPolicies: PolicyId[];
  /** Oversight policies the player enacted that were quietly scoped down. */
  diluted: PolicyId[];
}

export interface EventChoice {
  label: string;
  effect: (g: GameState) => string | void; // returns optional follow-up note
}

export interface GameEvent {
  id: string;
  title: string;
  body: string;
  once: boolean;
  weight: number;
  condition: (g: GameState) => boolean;
  choices: EventChoice[];
}

export type NotifyKind = 'info' | 'warn' | 'system' | 'asi';

/**
 * How loudly an alert asks to be looked at. Drives toast lifetime and how
 * readily a toast is dropped when the feed is busy — the archive keeps
 * everything regardless.
 */
export type Severity = 'low' | 'medium' | 'high';

export interface Notification {
  /** Stable identity, assigned once. */
  id: number;
  /** Bumped on every raise, including coalesced repeats, so the UI can diff. */
  seq: number;
  tick: number;
  text: string;
  kind: NotifyKind;
  severity: Severity;
  /** Identity of an ongoing condition, so repeats fold together. */
  key?: string;
  /** Times this condition has re-reported since it was first raised. */
  count: number;
}

export interface HistoryEntry {
  tick: number;
  kind: 'build' | 'demolish' | 'policy' | 'alloc' | 'event' | 'system';
  text: string;
}

export type GroupId =
  | 'tech_workers' | 'displaced_workers' | 'small_business' | 'executives'
  | 'environmentalists' | 'parents' | 'elderly' | 'low_income';

export interface PopulationGroup {
  id: GroupId;
  share: number;    // fraction of population, drifts with the economy
  approval: number; // 0..100
}

export type CorpId = 'meridian' | 'halcyon' | 'omnilink' | 'aegis';

export interface CorporateActor {
  id: CorpId;
  presence: number; // 0..1 footprint in the region
  mood: number;     // 0..100 willingness to stay and invest
}

/** Escalation ladder from the proposal: 0 = calm .. 8 = general unrest. */
export type ResistanceStage = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Rolling counters for slow-burn failure conditions. */
export interface FailCounters {
  blackout: number;     // consecutive ticks of severe utility shortfall
  approval: number;     // consecutive ticks of collapsed public approval
  environment: number;  // consecutive ticks of extreme pollution
  inactive: number;     // consecutive ticks with most buildings offline
}

export interface GameState {
  tick: number;            // 1 tick = 1 month
  seed: number;
  scenario: string;        // ScenarioId; string here to avoid an import cycle
  map: Tile[];
  mapW: number;
  mapH: number;
  mapVersion: number;      // bumped on any tile change; renderer cache key
  buildings: Map<number, Building>;
  nextBuildingId: number;

  resources: Resources;
  indicators: Indicators;
  alloc: ComputeAllocation;
  policies: Set<PolicyId>;

  population: number;
  jobsFilled: number;
  jobsTotal: number;
  /** Working-age residents available to fill jobs. */
  labourForce: number;
  /** Posts the region cannot staff — the other end of the unemployment axis. */
  jobVacancies: number;
  unemployment: number;    // 0..1
  humanExpertise: number;  // 0..1, decays with automation
  corporateInfluence: number; // 0..1
  unrest: number;          // 0..1
  pollutionAvg: number;    // 0..1

  // Endless-pressure systems: balance is a treadmill, not a plateau.
  migrationDemand: number;   // people who want to live here, grows exogenously
  housingShortage: number;   // 0..1, unmet demand as a share of demand
  attractiveness: Attractiveness;
  expectations: number;      // 0..100 ratcheting service-level baseline
  computeBase: number;       // autonomous floor of compute demand, always growing
  peakPopulation: number;
  lastPopulation: number;    // for growth-rate / stagnation effects
  /**
   * Cashflow, published for the bar's rate indicator.
   *
   * `lastNet` is the treasury's *actual* change across the last tick, not
   * income minus expenses — investor sentiment lands after that subtraction,
   * and a readout that disagreed with the balance beside it would be worse
   * than none. `lastOutgoings` is the gross spend it is measured against, so
   * the bar means the same thing at sixty residents and sixty thousand.
   */
  lastNet: number;
  lastOutgoings: number;
  /** Recent net figures, newest last. The bar reads their mean, not one tick. */
  netHistory: number[];
  failCounters: FailCounters;

  history: HistoryEntry[];
  tutorialDone: string[];

  // Political simulation.
  groups: Record<GroupId, PopulationGroup>;
  corps: Record<CorpId, CorporateActor>;
  resistanceStage: ResistanceStage;
  resistancePressure: number;  // accumulates while grievances hold, decays otherwise
  nextElectionTick: number;
  lastElectionResult: string | null;

  asi: AsiState;
  notifications: Notification[];
  /** Monotonic counter behind Notification.id / .seq. */
  notificationSeq: number;
  pendingEvent: GameEvent | null;
  /** A one-button informational modal (election results, region reclassification). */
  pendingReport: { title: string; body: string } | null;
  firedEvents: Set<string>;
  eventCooldowns: Record<string, number>; // last-fired tick for repeatable events
  lastEventTick: number;   // tick the last event was *resolved*, not fired
  tierName: string; // last announced region class

  speed: 0 | 1 | 2 | 3;
  gameOver: string | null; // conventional failure description, if any
}
