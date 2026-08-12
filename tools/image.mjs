// Reading a PNG, and resizing one well.
//
// The icon is now a supplied master image rather than something this repo
// draws, but the three sizes it ships at still have to come from somewhere:
// 180 for iOS, 32 and 16 for tabs. Handing the browser one large PNG and
// letting it scale is how a detailed icon turns to soup in a tab strip, and
// scaling with a naive box filter is only slightly better.
//
// So: a PNG decoder, a Lanczos-3 resampler that works in linear light on
// premultiplied alpha, and nothing else. Node's zlib does the inflating.
// Still zero dependencies.

import { inflateSync } from 'node:zlib';

// ------------------------------------------------------------------- colour
const S2L = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  S2L[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
const toSrgb = (v) => {
  const c = v < 0 ? 0 : v > 1 ? 1 : v;
  return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055));
};

// ------------------------------------------------------------------- decode
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a non-interlaced PNG to 8-bit RGBA.
 *
 * Handles the colour types anything is likely to hand us — greyscale, RGB,
 * palette, and either with alpha — at 8 or 16 bits. Interlaced files are
 * rejected rather than half-supported: a wrong picture is worse than an error.
 */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8;
  let width = 0, height = 0, depth = 0, colour = 0;
  let palette = null, trns = null;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colour = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG is not supported');
      if (depth !== 8 && depth !== 16) throw new Error(`bit depth ${depth} is not supported`);
      if (!(colour in CHANNELS)) throw new Error(`colour type ${colour} is not supported`);
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') trns = Buffer.from(data);
    else if (type === 'IDAT') idat.push(Buffer.from(data));
    else if (type === 'IEND') break;
    p += 12 + len;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const chan = CHANNELS[colour];
  const bpp = chan * (depth / 8);            // bytes per pixel
  const stride = width * bpp;
  const img = Buffer.alloc(height * stride);

  // Undo the per-scanline filters. All five, because an encoder picks whichever
  // is cheapest per row and most of them use more than one.
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i];
      const a = i >= bpp ? img[dst + i - bpp] : 0;
      const b = y > 0 ? img[dst - stride + i] : 0;
      const c = y > 0 && i >= bpp ? img[dst - stride + i - bpp] : 0;
      let v;
      switch (ft) {
        case 0: v = x; break;
        case 1: v = x + a; break;
        case 2: v = x + b; break;
        case 3: v = x + ((a + b) >> 1); break;
        case 4: {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown row filter ${ft}`);
      }
      img[dst + i] = v & 0xff;
    }
  }

  // And out to RGBA. 16-bit samples are taken by their high byte: the icon is
  // going to 8 bits regardless and the low byte cannot survive that.
  const step = depth === 16 ? 2 : 1;
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * bpp;
    let r, g, b, a = 255;
    if (colour === 3) {
      const idx = img[s];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      if (trns && idx < trns.length) a = trns[idx];
    } else if (colour === 0 || colour === 4) {
      r = g = b = img[s];
      if (colour === 4) a = img[s + step];
    } else {
      r = img[s]; g = img[s + step]; b = img[s + 2 * step];
      if (colour === 6) a = img[s + 3 * step];
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width, height, rgba };
}

// ----------------------------------------------------------------- resample
const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos3 = (x) => (Math.abs(x) >= 3 ? 0 : sinc(x) * sinc(x / 3));

/**
 * Mitchell–Netravali, B = C = 1/3. The default, and the reason is visible.
 *
 * Lanczos overshoots at a hard edge, which on this kind of picture — small
 * bright lights on a dark ground — puts a dark ring around every one of them.
 * At an eleven-to-one reduction those rings are a third of the icon. Mitchell
 * is the filter designed to trade a little sharpness for not doing that.
 */
function mitchell(x) {
  const B = 1 / 3, C = 1 / 3;
  const a = Math.abs(x), a2 = a * a, a3 = a2 * a;
  if (a < 1) return ((12 - 9 * B - 6 * C) * a3 + (-18 + 12 * B + 6 * C) * a2 + (6 - 2 * B)) / 6;
  if (a < 2) {
    return ((-B - 6 * C) * a3 + (6 * B + 30 * C) * a2 + (-12 * B - 48 * C) * a + (8 * B + 24 * C)) / 6;
  }
  return 0;
}

export const FILTERS = {
  mitchell: { fn: mitchell, support: 2 },
  lanczos3: { fn: lanczos3, support: 3 },
};

/**
 * Weights for one output axis: which input samples each output pixel reads.
 *
 * When shrinking, the filter widens by the scale factor — that is the whole
 * difference between a resize that keeps detail and one that aliases it into
 * moiré, and at 180 to 16 the factor is eleven.
 */
function weights(srcN, dstN, filter) {
  const scale = dstN / srcN;
  const support = filter.support / Math.min(1, scale);
  const rows = [];
  for (let i = 0; i < dstN; i++) {
    const centre = (i + 0.5) / scale;
    const lo = Math.max(0, Math.floor(centre - support));
    const hi = Math.min(srcN - 1, Math.ceil(centre + support));
    const idx = [], w = [];
    let sum = 0;
    for (let j = lo; j <= hi; j++) {
      const t = filter.fn((j + 0.5 - centre) * Math.min(1, scale));
      if (t === 0) continue;
      idx.push(j); w.push(t); sum += t;
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    rows.push([idx, w]);
  }
  return rows;
}

/**
 * Resize RGBA to `dw`×`dh`, separably, in linear light on premultiplied alpha.
 *
 * Both of those matter and both are usually skipped. Averaging sRGB values
 * darkens every edge; averaging un-premultiplied colour lets the colour of
 * fully transparent pixels bleed into the visible ones, which is where the
 * grey halo around a resized logo comes from.
 */
export function resize(src, sw, sh, dw, dh, filterName = 'mitchell') {
  const filter = FILTERS[filterName];
  if (!filter) throw new Error(`unknown filter ${filterName}`);
  const lin = new Float32Array(sw * sh * 4);
  for (let i = 0; i < sw * sh; i++) {
    const al = src[i * 4 + 3] / 255;
    lin[i * 4] = S2L[src[i * 4]] * al;
    lin[i * 4 + 1] = S2L[src[i * 4 + 1]] * al;
    lin[i * 4 + 2] = S2L[src[i * 4 + 2]] * al;
    lin[i * 4 + 3] = al;
  }

  const wx = weights(sw, dw, filter);
  const tmp = new Float32Array(dw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < dw; x++) {
      const [idx, w] = wx[x];
      let r = 0, g = 0, b = 0, al = 0;
      for (let k = 0; k < idx.length; k++) {
        const s = (y * sw + idx[k]) * 4, t = w[k];
        r += lin[s] * t; g += lin[s + 1] * t; b += lin[s + 2] * t; al += lin[s + 3] * t;
      }
      const d = (y * dw + x) * 4;
      tmp[d] = r; tmp[d + 1] = g; tmp[d + 2] = b; tmp[d + 3] = al;
    }
  }

  const wy = weights(sh, dh, filter);
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const [idx, w] = wy[y];
    for (let x = 0; x < dw; x++) {
      let r = 0, g = 0, b = 0, al = 0;
      for (let k = 0; k < idx.length; k++) {
        const s = (idx[k] * dw + x) * 4, t = w[k];
        r += tmp[s] * t; g += tmp[s + 1] * t; b += tmp[s + 2] * t; al += tmp[s + 3] * t;
      }
      const d = (y * dw + x) * 4;
      const A = al < 0 ? 0 : al > 1 ? 1 : al;
      out[d] = A > 0 ? toSrgb(r / A) : 0;
      out[d + 1] = A > 0 ? toSrgb(g / A) : 0;
      out[d + 2] = A > 0 ? toSrgb(b / A) : 0;
      out[d + 3] = Math.round(A * 255);
    }
  }
  return out;
}

/**
 * Composite over an opaque background, in linear light.
 *
 * iOS composites a transparent `apple-touch-icon` onto black itself, which
 * puts a dark ring inside the home screen's corner mask when the source has
 * its own rounded corners. Flattening onto the icon's own background colour
 * first is what stops that.
 */
export function flatten(rgba, hex) {
  const n = parseInt(hex.slice(1), 16);
  const bg = [S2L[(n >> 16) & 255], S2L[(n >> 8) & 255], S2L[n & 255]];
  const out = new Uint8Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++) out[i + c] = toSrgb(S2L[rgba[i + c]] * a + bg[c] * (1 - a));
    out[i + 3] = 255;
  }
  return out;
}

/** The mean colour of the outer ring, for guessing a background to flatten onto. */
export function edgeColour(rgba, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  const take = (x, y) => {
    const i = (y * w + x) * 4;
    const a = rgba[i + 3] / 255;
    if (a < 0.5) return;
    r += S2L[rgba[i]]; g += S2L[rgba[i + 1]]; b += S2L[rgba[i + 2]]; n++;
  };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y++) { take(0, y); take(w - 1, y); }
  if (!n) return '#000000';
  return '#' + [r / n, g / n, b / n].map((v) => toSrgb(v).toString(16).padStart(2, '0')).join('');
}
