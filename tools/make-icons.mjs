// Write the icon out at the sizes it is actually asked for.
//
// The artwork is `assets/icon-master.png` — a supplied image, not something
// this repo draws. It is kept at 512, which is well above every size shipped
// here and small enough not to dominate the repository; the original was
// 1254 square, and a 180 resized from 512 differs from one resized straight
// from 1254 by 0.17 levels out of 255, which is nothing for half a megabyte.
//
// Run by `prebuild`, so `public/` cannot drift from the master, and committed
// as well so `npm run dev` has them without a build.
//
// Each size is resized from the master rather than from the size above it, and
// each is a real file rather than one PNG the browser is left to scale: a
// detailed icon handed to a tab strip at a ninth of its size is soup.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng, flatten, resize } from './image.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public');

/**
 * 180 is what iOS asks for and what it scales from for every other slot it
 * needs. 32 is a tab on a normal screen and 16 on a hidpi one — both written,
 * because a browser downscaling 32 to 16 does it with whatever filter it has
 * to hand and no regard for what the picture is.
 */
export const ICONS = [
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
];

const master = decodePng(readFileSync(join(ROOT, 'assets', 'icon-master.png')));
if (master.width !== master.height) {
  throw new Error(`the master is ${master.width}x${master.height}; an icon is square`);
}

// iOS composites a transparent apple-touch-icon onto black and then rounds the
// corners itself, so a source carrying its own transparency ends up with a
// dark wedge inside each corner of the home screen mask. This master is
// already opaque and full bleed — the flatten is here so that a future one
// that is not cannot quietly ship broken.
let px = master.rgba;
let hadAlpha = false;
for (let i = 3; i < px.length; i += 4) if (px[i] !== 255) { hadAlpha = true; break; }
if (hadAlpha) px = flatten(px, '#0a0e16');

mkdirSync(OUT, { recursive: true });
for (const [name, size] of ICONS) {
  const png = encodePng(size, size, resize(px, master.width, master.height, size, size));
  writeFileSync(join(OUT, name), png);
  console.log(`${name.padEnd(22)} ${size}×${size}  ${(png.length / 1024).toFixed(1)}KB`);
}
console.log(`from ${master.width}×${master.height} master${hadAlpha ? ', flattened' : ', already opaque'}`);
