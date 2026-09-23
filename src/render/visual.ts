// Shared visual vocabulary. Ground materials favor quiet masses and sparse detail.
// CSS console tokens remain in style.css :root; keep semantic roles distinct
// from material swatches. No simulation, DOM access, or sprite generation here.

export const TERRAIN_PALETTE = {
  grass: { base: '#526f43', light: '#597749', shade: '#4b673e', highlight: '#74935a' },
  sand: { base: '#bda575', light: '#cbb686', shade: '#b29a6d' },
  rock: { base: '#767b78', light: '#91968b', shade: '#626c68' },
  water: { base: '#2d5669', light: '#355f70', glint: '#6e9a9e', ripple: '#426e7d' },
  forest: { base: '#435d38', litter: '#526645' },
  foliage: { shade: '#283f30', base: '#38583b', light: '#507448', highlight: '#78945c', bark: '#705940', dead: '#8c8063' },
  shore: { shallow: '#4d777c', edge: '#7e9690', bank: '#827958' },
} as const;

export const ROAD_MATERIALS = [
  { surface: '#7d6a4e', surfaceHi: '#8a7658', edge: '#6a5940', line: '', width: 0 }, // dirt track
  { surface: '#343b40', surfaceHi: '#3b4245', edge: '#85877d', line: '#b8b25e', width: 1 }, // street
  { surface: '#30383e', surfaceHi: '#394148', edge: '#92958b', line: '#c9c36a', width: 2 }, // avenue
  { surface: '#293239', surfaceHi: '#333c43', edge: '#7f888c', line: '#d9d372', width: 3 }, // highway
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
