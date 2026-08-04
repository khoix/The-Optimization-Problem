import type { BuildingDef, BuildingType } from './types';

export const BUILDING_DEFS: Record<BuildingType, BuildingDef> = {
  road: {
    type: 'road', name: 'Road', category: 'civic',
    desc: 'Connects districts. Traffic follows growth.',
    w: 1, h: 1, cost: 10, upkeep: 0.1, jobs: 0, housing: 0,
    power: 0, water: 0, compute: 0, pollution: 0, income: 0, buildTicks: 1,
  },
  house: {
    type: 'house', name: 'House', category: 'zone',
    desc: 'Low-density housing for 6 residents.',
    w: 1, h: 1, cost: 40, upkeep: 0, jobs: 0, housing: 6,
    power: -1, water: -1, compute: 0, pollution: 0, income: 1.2, buildTicks: 2,
  },
  apartment: {
    type: 'apartment', name: 'Apartment Block', category: 'zone',
    desc: 'Dense housing for 40 residents.',
    w: 2, h: 2, cost: 220, upkeep: 1, jobs: 2, housing: 40,
    power: -5, water: -5, compute: 0, pollution: 0, income: 7, buildTicks: 4,
  },
  park: {
    type: 'park', name: 'Park', category: 'civic',
    desc: 'Green space. Improves health and connection.',
    w: 2, h: 2, cost: 60, upkeep: 0.5, jobs: 1, housing: 0,
    power: 0, water: -1, compute: 0, pollution: -0.4, income: 0, buildTicks: 2,
  },
  plaza: {
    type: 'plaza', name: 'Civic Plaza', category: 'civic',
    desc: 'Ceremonial public space with a statue.',
    w: 2, h: 2, cost: 80, upkeep: 0.4, jobs: 1, housing: 0,
    power: -1, water: 0, compute: 0, pollution: 0, income: 0, buildTicks: 2,
  },
  solar_farm: {
    type: 'solar_farm', name: 'Solar Farm', category: 'power',
    desc: 'Clean power. Needs land, delivers modest output.',
    w: 3, h: 3, cost: 260, upkeep: 1.5, jobs: 4, housing: 0,
    power: 22, water: 0, compute: 0, pollution: 0, income: 0, buildTicks: 3,
  },
  coal_plant: {
    type: 'coal_plant', name: 'Coal Plant', category: 'power',
    desc: 'Cheap, abundant power. The smoke goes somewhere.',
    w: 3, h: 3, cost: 320, upkeep: 3, jobs: 30, housing: 0,
    power: 70, water: -8, compute: 0, pollution: 3.2, income: 0, buildTicks: 4,
  },
  nuclear_plant: {
    type: 'nuclear_plant', name: 'Nuclear Plant', category: 'power',
    desc: 'Enormous clean output. Expensive, slow to build.',
    w: 4, h: 4, cost: 1400, upkeep: 10, jobs: 45, housing: 0,
    power: 220, water: -25, compute: 0, pollution: 0.1, income: 0, buildTicks: 10,
    unlockCompute: 60,
  },
  water_plant: {
    type: 'water_plant', name: 'Water Treatment Plant', category: 'power',
    desc: 'Supplies water to homes, industry, and cooling.',
    w: 2, h: 2, cost: 180, upkeep: 1.5, jobs: 10, housing: 0,
    power: -4, water: 60, compute: 0, pollution: 0, income: 0, buildTicks: 3,
  },
  hospital: {
    type: 'hospital', name: 'Hospital', category: 'civic',
    desc: 'Care capacity. AI diagnostics multiply its reach.',
    w: 3, h: 3, cost: 420, upkeep: 5, jobs: 60, housing: 0,
    power: -8, water: -6, compute: 0, pollution: 0, income: 0, buildTicks: 5,
  },
  factory: {
    type: 'factory', name: 'Factory', category: 'industry',
    desc: 'Manufacturing. Many jobs, steady revenue, real smoke.',
    w: 3, h: 3, cost: 300, upkeep: 2, jobs: 60, housing: 0,
    power: -12, water: -6, compute: 0, pollution: 2.0, income: 16, buildTicks: 4,
  },
  auto_factory: {
    type: 'auto_factory', name: 'Automated Factory', category: 'industry',
    desc: 'Higher output, six employees, no lunch breaks.',
    w: 3, h: 3, cost: 520, upkeep: 3, jobs: 6, housing: 0,
    power: -18, water: -6, compute: 0, pollution: 1.2, income: 30, buildTicks: 4,
    unlockCompute: 30,
  },
  office: {
    type: 'office', name: 'Office Tower', category: 'industry',
    desc: 'Service-sector employment and tax revenue.',
    w: 2, h: 2, cost: 260, upkeep: 2, jobs: 40, housing: 0,
    power: -8, water: -3, compute: 0, pollution: 0, income: 14, buildTicks: 4,
  },
  retail: {
    type: 'retail', name: 'Retail Strip', category: 'industry',
    desc: 'Shops and services. Converts wages into revenue.',
    w: 2, h: 2, cost: 140, upkeep: 1, jobs: 20, housing: 0,
    power: -4, water: -2, compute: 0, pollution: 0, income: 8, buildTicks: 3,
  },
  edge_dc: {
    type: 'edge_dc', name: 'Edge Compute Node', category: 'compute',
    desc: 'Small local compute for responsive services.',
    w: 2, h: 2, cost: 200, upkeep: 2, jobs: 4, housing: 0,
    power: -10, water: -5, compute: 12, pollution: 0.2, income: 4, buildTicks: 3,
  },
  cloud_dc: {
    type: 'cloud_dc', name: 'Cloud Data Center', category: 'compute',
    desc: 'Serious capacity. Serious cooling requirements.',
    w: 3, h: 3, cost: 520, upkeep: 5, jobs: 12, housing: 0,
    power: -34, water: -22, compute: 48, pollution: 0.5, income: 14, buildTicks: 5,
    unlockCompute: 12,
  },
  ai_campus: {
    type: 'ai_campus', name: 'AI Training Campus', category: 'compute',
    desc: 'Hyperscale training. The grid will notice.',
    w: 4, h: 4, cost: 1200, upkeep: 12, jobs: 20, housing: 0,
    power: -95, water: -60, compute: 150, pollution: 1.0, income: 40, buildTicks: 8,
    unlockCompute: 60,
  },
};

export const BUILD_MENU_ORDER: BuildingType[] = [
  'road', 'house', 'apartment', 'park', 'plaza',
  'solar_farm', 'coal_plant', 'nuclear_plant', 'water_plant',
  'hospital', 'factory', 'auto_factory', 'office', 'retail',
  'edge_dc', 'cloud_dc', 'ai_campus',
];
