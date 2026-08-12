// The icon, as source.
//
// An `apple-touch-icon` has to be a real PNG at a real URL — iOS ignores SVG
// there, and it ignores `data:` URIs — so unlike every other picture in this
// project this one cannot be drawn at load. It is drawn at build instead, by
// the code below, and the PNGs it produces are committed the way a compiled
// asset is. What is *not* committed is a binary somebody drew in a paint
// program and nobody can now change: the artwork is thirty lines of rectangles
// and the encoder underneath it is Node's own zlib.
//
// Zero dependencies, same as the game.

import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------- the artwork
//
// The game's one idea, at the smallest size it survives: a city block plan cut
// down the middle, warm on the side that is still being lived in and cold on
// the side that has been optimized, with the ASI's own colour on the street
// between them. It is the boot screen's sweep, stopped halfway and cropped to
// a square.
//
// Laid out on an 11-unit grid: four columns of blocks two units wide with a
// one-unit street between them, and three rows three units tall. The sweep
// runs down the middle street, so two whole columns have been through it and
// two have not.
//
// Two earlier layouts did not survive being looked at. Sixteen blocks of three
// units is a texture at 16px rather than a town. Nine blocks with the sweep
// cutting through the middle column left that column as a one-unit sliver of
// warm beside a one-unit sliver of cold, which at any size reads as a gap.
//
// Full bleed, because iOS masks the corners itself and a square with corners
// already rounded into it gets rounded twice.
const GRID = 11;
/** The middle street. Five units of region either side of it. */
const SWEEP = 5;
const COLS = [0, 3, 6, 9];   // two units wide
const ROWS = [0, 4, 8];      // three units tall

const GROUND = [10, 14, 22];        // #0a0e16, the field the region stands on
const ASI = [122, 233, 255];        // #7ae9ff, the line doing the optimizing

// On the boot screen the architecture is identical either side of the sweep
// and only the light changes, which is the point being made there. Here the
// roofs carry some of it too: at sixteen pixels a lit window is one pixel, and
// one pixel cannot be relied on to say which half of the icon it is in.
const WARM_ROOF = [88, 71, 52];
const WARM_LIGHT = [255, 190, 92];
const COLD_ROOF = [50, 63, 84];
const COLD_LIGHT = [214, 240, 255];
const WARM_STREET = [30, 24, 18];
const COLD_STREET = [18, 25, 36];

/**
 * Where the lit window sits in each of the twelve blocks: [col, row, dx, dy].
 *
 * Fixed rather than random. An icon is the one picture in this project that
 * has to come out the same every time it is generated, so that a diff of the
 * committed PNGs is a diff of the artwork rather than of a seed.
 */
const LIGHTS = [
  [0, 0, 0, 1], [1, 0, 1, 0], [2, 0, 0, 2], [3, 0, 1, 1],
  [0, 1, 1, 2], [1, 1, 0, 0], [2, 1, 1, 1], [3, 1, 0, 0],
  [0, 2, 0, 0], [1, 2, 1, 2], [2, 2, 0, 1], [3, 2, 1, 2],
];

/**
 * Draw the icon into an RGBA buffer at `size` pixels square.
 *
 * Everything lands on whole pixels: this is pixel art, and a block whose edge
 * falls halfway across a pixel comes out with a grey fringe that at 16px is a
 * quarter of the building.
 */
export function drawIcon(size) {
  const px = new Uint8Array(size * size * 4);
  const u = size / GRID;
  const at = (n) => Math.round(n * u);

  const fill = (ux, uy, uw, uh, [r, g, b]) => {
    const x0 = at(ux), y0 = at(uy), x1 = at(ux + uw), y1 = at(uy + uh);
    for (let y = Math.max(0, y0); y < Math.min(size, y1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x1); x++) {
        const i = (y * size + x) * 4;
        px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 255;
      }
    }
  };
  /** Which side of the sweep a unit column is on. */
  const cold = (ux) => ux < SWEEP;

  fill(0, 0, GRID, GRID, GROUND);
  // Streets, a column at a time, because they change colour where the sweep is.
  for (let ux = 0; ux < GRID; ux++) {
    fill(ux, 0, 1, GRID, cold(ux) ? COLD_STREET : WARM_STREET);
  }

  for (const ry of ROWS) {
    for (const cx of COLS) {
      fill(cx, ry, 2, 3, cold(cx) ? COLD_ROOF : WARM_ROOF);
    }
  }

  // One lit window per block: the only thing on this icon carrying real
  // colour, which is why the roofs underneath are so close to each other.
  for (const [c, r, dx, dy] of LIGHTS) {
    const ux = COLS[c] + dx;
    fill(ux, ROWS[r] + dy, 1, 1, cold(ux) ? COLD_LIGHT : WARM_LIGHT);
  }

  // And the line itself, straight down the middle street, over everything.
  fill(SWEEP, 0, 1, GRID, ASI);
  return px;
}

// ---------------------------------------------------------------- PNG, by hand
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 8-bit RGBA, no interlace, one deflate stream. The whole of what we need. */
export function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // colour type: RGBA
  // 10, 11, 12 are compression, filter and interlace methods: all zero, all
  // the only values PNG defines.

  // One filter byte per scanline. Filter 0 — none — because the picture is
  // flat rectangles of a handful of colours, which deflate already handles
  // better than any per-row predictor would.
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** The icon at one size, as PNG bytes. */
export function iconPng(size) {
  return encodePng(size, drawIcon(size));
}
