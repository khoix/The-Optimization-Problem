// Write the icon out at the sizes it is actually asked for.
//
// Run by `prebuild`, so the PNGs in `public/` cannot drift from the artwork in
// `icon.mjs` — a build always regenerates them. They are committed as well, so
// `npm run dev` has them without a build and so a reviewer can see what the
// icon looks like without running anything.
//
// Each size is *drawn* at its own resolution rather than scaled down from the
// largest. This is pixel art on an eleven-unit grid: a 180px icon resampled to
// 16px is a grey smear where the streets used to be, and the one thing that has
// to survive at 16px is the line down the middle.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { iconPng } from './icon.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * 180 is what iOS asks for and what it scales from for every other slot it
 * needs. 32 is a tab on a normal screen and 16 on a hidpi one — both drawn,
 * because a browser downscaling 32 to 16 does it with smoothing.
 */
export const ICONS = [
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
];

mkdirSync(OUT, { recursive: true });
for (const [name, size] of ICONS) {
  const png = iconPng(size);
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(22)} ${size}×${size}  ${png.length} bytes`);
}
