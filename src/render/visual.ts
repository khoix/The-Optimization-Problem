// Shared visual vocabulary. Values are migrated unchanged from the original art.
// CSS console tokens remain in style.css :root; keep semantic roles distinct
// from material swatches. No simulation, DOM access, or sprite generation here.

export const TERRAIN_PALETTE = {
  grass: { base: '#4a7f3c', light: '#548c44', shade: '#3f7034', highlight: '#5d9a4d' },
  sand: { base: '#c9b06a', light: '#d6bf7c', shade: '#b89b58' },
  rock: { base: '#6e6f6a', light: '#7d7e78', shade: '#5c5d58' },
  water: { base: '#2e5f8f', light: '#356b9e', glint: '#6fa3cc', ripple: '#4c86b8' },
} as const;

export const ROAD_MATERIALS = [
  { surface: '#7d6a4e', surfaceHi: '#8a7658', edge: '#6a5940', line: '', width: 0 }, // dirt track
  { surface: '#3a3a40', surfaceHi: '#44444b', edge: '#6a6a72', line: '#b8b25e', width: 1 }, // street
  { surface: '#34343a', surfaceHi: '#3e3e45', edge: '#7a7a84', line: '#c9c36a', width: 2 }, // avenue
  { surface: '#2e2e34', surfaceHi: '#38383f', edge: '#8a8a94', line: '#d9d372', width: 3 }, // highway
  { surface: '#6b5a48', surfaceHi: '#7a6853', edge: '#4a3d31', line: '#b8b25e', width: 1 }, // bridge deck
] as const;

export const ICON_PALETTE = {
  steel: '#8494ad',
  steelLit: '#aebbd0',
  steelDim: '#5b6b85',
  ink: '#1b2331',
  paper: '#dfe7f3',
  amber: '#ffc23d',
  amberDeep: '#f08a1c',
  cyan: '#5cd0f0',
  cyanDeep: '#2f9cc4',
  green: '#5fc76c',
  greenDeep: '#3a9a4a',
  red: '#f2706d',
  redDeep: '#cc4a48',
  gold: '#ffd24a',
  goldInk: '#7a5a10',
  blue: '#6ea8fe',
  blueDeep: '#4179d6',
  brown: '#a4703f',
} as const;

/** Hour, red, green, blue: the existing 24-hour ambient light curve. */
export const AMBIENT_KEYS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 44, 54, 96],
  [4.5, 50, 58, 104],
  [6, 200, 140, 110],
  [8, 244, 226, 200],
  [12, 255, 250, 238],
  [16, 250, 236, 210],
  [18.5, 235, 160, 110],
  [20, 110, 90, 140],
  [21.5, 54, 62, 106],
  [24, 44, 54, 96],
];

export const LIGHTING = { streetLamp: '#ffe7b4', streetLampRadius: 19 } as const;
export const MOTION = { waterFramesPerSecond: 2.2 } as const;
