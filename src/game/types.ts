// Core data model for The Optimization Problem.

export type TerrainType = 'grass' | 'forest' | 'water' | 'sand' | 'rock';

export interface Tile {
  terrain: TerrainType;
  variant: number;      // deterministic per-tile art variation
  road: boolean;
  buildingId: number;   // -1 = none
  pollution: number;    // 0..1 local ground pollution
}

export type BuildingType =
  | 'road'
  | 'house'
  | 'apartment'
  | 'park'
  | 'plaza'
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
  | 'ai_campus';

export interface BuildingDef {
  type: BuildingType;
  name: string;
  desc: string;
  category: 'civic' | 'power' | 'industry' | 'compute' | 'zone';
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
  | 'ubi'
  | 'automation_tax'
  | 'data_privacy'
  | 'surveillance_program'
  | 'renewable_subsidy'
  | 'manual_redundancy'
  | 'retraining'
  | 'corporate_incentives'
  | 'moderation_ai'
  | 'public_broadband';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  desc: string;
  costPerTick: number;
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

export interface AsiState {
  emergence: number;       // hidden 0..100
  phase: AsiPhase;
  phaseTick: number;       // tick at which current phase began
  noticesShown: string[];  // one-shot flavour notices already delivered
  renamed: boolean;
  observer: boolean;
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

export interface Notification {
  tick: number;
  text: string;
  kind: 'info' | 'warn' | 'system' | 'asi';
}

export interface GameState {
  tick: number;            // 1 tick = 1 month
  seed: number;
  map: Tile[];
  mapW: number;
  mapH: number;
  buildings: Map<number, Building>;
  nextBuildingId: number;

  resources: Resources;
  indicators: Indicators;
  alloc: ComputeAllocation;
  policies: Set<PolicyId>;

  population: number;
  jobsFilled: number;
  jobsTotal: number;
  unemployment: number;    // 0..1
  humanExpertise: number;  // 0..1, decays with automation
  corporateInfluence: number; // 0..1
  unrest: number;          // 0..1
  pollutionAvg: number;    // 0..1

  asi: AsiState;
  notifications: Notification[];
  pendingEvent: GameEvent | null;
  firedEvents: Set<string>;

  speed: 0 | 1 | 2 | 3;
  gameOver: string | null; // conventional failure description, if any
}
