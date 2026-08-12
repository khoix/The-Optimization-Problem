// M51 — the icon.
//   A. three files, served, and decodable by something that is not us
//   B. what iOS needs of an apple-touch-icon
//   C. the markup points at them, from a build that lives on a subpath
//   D. one artwork at three sizes, with room around it for the corner mask
//   E. and the PNGs in the repo are the master in the repo, resized
import { chromium } from 'playwright';
import { launchOptions } from './browser.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The repo, found from this file rather than written down: a suite that only
// runs from one absolute path is a suite that only runs on one machine.
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
// Guarded: on a build without M51 there is no such module, and a harness that
// dies on the import proves only that the file is new — it never reaches the
// assertions it exists to make.
let IMG = null;
try { IMG = await import(new URL('../../tools/image.mjs', import.meta.url).href); } catch { /* pre-M51 */ }
const MASTER = ROOT + 'assets/icon-master.png';

const ORIGIN = 'http://localhost:4173';
const PUB = ROOT + 'public/';
const FILES = [['apple-touch-icon.png', 180], ['favicon-32.png', 32], ['favicon-16.png', 16]];

const browser = await chromium.launch(launchOptions);
const pass = [], fail = [], errs = [];
const check = (n, ok, d = '') => (ok ? pass : fail).push(`${n}${d ? ' — ' + d : ''}`);

const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(ORIGIN);

// ============ A. SERVED, AND DECODABLE BY SOMETHING THAT IS NOT US
//
// The encoder in tools/icon.mjs is forty lines written from the PNG spec. The
// only assertion worth making about it is that a decoder nobody here wrote
// accepts what it produces — so every measurement below goes through the
// browser's own image pipeline rather than through a second parser of mine,
// which would agree with my encoder about a malformed file.
const decoded = {};
for (const [name, size] of FILES) {
  const res = await fetch(ORIGIN + '/' + name).catch(() => null);
  check(`${name} is served`, !!res && res.ok && (res.headers.get('content-type') ?? '').includes('image/png'),
    res ? `${res.status} ${res.headers.get('content-type')}` : 'no response');

  decoded[name] = await page.evaluate(async ([url, expect]) => {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch (e) { return { error: String(e) }; }
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let minAlpha = 255;
    for (let i = 3; i < d.length; i += 4) minAlpha = Math.min(minAlpha, d[i]);
    // Sampled in normalised coordinates so the three sizes can be compared to
    // each other without any of them being resized to do it.
    const at = (fx, fy) => {
      const x = Math.min(c.width - 1, Math.floor(fx * c.width));
      const y = Math.min(c.height - 1, Math.floor(fy * c.height));
      const i = (y * c.width + x) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    const patch = (fx0, fy0, fx1, fy1) => {
      let r = 0, g2 = 0, b = 0, n = 0;
      for (let y = Math.floor(fy0 * c.height); y < Math.ceil(fy1 * c.height); y++) {
        for (let x = Math.floor(fx0 * c.width); x < Math.ceil(fx1 * c.width); x++) {
          const i = (y * c.width + x) * 4;
          r += d[i]; g2 += d[i + 1]; b += d[i + 2]; n++;
        }
      }
      return [Math.round(r / n), Math.round(g2 / n), Math.round(b / n)];
    };
    return {
      w: c.width, h: c.height, expect, minAlpha,
      corners: [at(0, 0), at(0.99, 0), at(0, 0.99), at(0.99, 0.99)],
      // The whole picture, reduced to an 8×8 grid of region means. This is the
      // only shape of "same artwork" claim that survives three resolutions of
      // a filtered image: a corner pixel means a thousandth of the 180 and a
      // hundredth of the 16, and a corner *region* still lands on a different
      // amount of antialiased block edge at each size. A grid of means is the
      // composition, sampled the same way regardless of how many pixels each
      // cell happens to contain.
      grid: Array.from({ length: 64 }, (_, i) => {
        const gx = i % 8, gy = (i / 8) | 0;
        return patch(gx / 8, gy / 8, (gx + 1) / 8, (gy + 1) / 8);
      }),
      // The outer eighth all the way round, and the middle half: an app icon
      // is a subject on a field, and the mask eats the field.
      ring: (() => {
        let r2 = 0, g3 = 0, b2 = 0, n2 = 0;
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const inner = x > c.width * 0.12 && x < c.width * 0.88 && y > c.height * 0.12 && y < c.height * 0.88;
            if (inner) continue;
            const i = (y * c.width + x) * 4;
            r2 += d[i]; g3 += d[i + 1]; b2 += d[i + 2]; n2++;
          }
        }
        return [Math.round(r2 / n2), Math.round(g3 / n2), Math.round(b2 / n2)];
      })(),
      middle: patch(0.25, 0.25, 0.75, 0.75),
    };
  }, [ORIGIN + '/' + name, size]);

  const im = decoded[name];
  check(`${name} decodes in a browser, at ${size}×${size}`,
    !im.error && im.w === size && im.h === size,
    im.error ?? `${im.w}×${im.h}`);
  if (im.error || im.w !== size) decoded[name] = null;
}

// ============ B. WHAT iOS NEEDS
{
  const apple = decoded['apple-touch-icon.png'];
  check('The Apple icon is the 180×180 iOS asks for',
    !!apple && apple.w === 180 && apple.h === 180, apple ? `${apple.w}×${apple.h}` : 'no such file');
  // A transparent icon is composited onto black by iOS, and a source with its
  // own rounded corners gets rounded a second time by the home screen mask.
  check('It is fully opaque, with square corners for iOS to round itself',
    !!apple && apple.minAlpha === 255 && apple.corners.every((c) => c.some((v) => v > 0)),
    apple ? `lowest alpha ${apple.minAlpha}, corners ${apple.corners.map((c) => c.join(',')).join(' | ')}`
      : 'no such file');
}

// ============ C. THE MARKUP, FROM A BUILD THAT LIVES ON A SUBPATH
{
  const links = await page.evaluate(() => [...document.querySelectorAll('link[rel*="icon"]')].map((l) => ({
    rel: l.getAttribute('rel'), href: l.getAttribute('href'),
    sizes: l.getAttribute('sizes'), type: l.getAttribute('type'), resolved: l.href,
  })));
  const apple = links.find((l) => l.rel === 'apple-touch-icon');
  const favicons = links.filter((l) => l.rel === 'icon');
  check('There is an apple-touch-icon link, pointing at the 180',
    !!apple && apple.href.endsWith('apple-touch-icon.png') && apple.sizes === '180x180',
    apple ? `${apple.href} (${apple.sizes})` : 'none');
  check('And two favicon links, one per drawn size',
    favicons.length === 2 && favicons.every((l) => l.type === 'image/png') &&
      favicons.map((l) => l.sizes).sort().join(',') === '16x16,32x32',
    favicons.map((l) => `${l.sizes} ${l.href}`).join(' · '));
  // `base: './'` in vite.config.ts: this build is meant to run from a subpath,
  // and a root-absolute icon href is the sort of thing that works locally and
  // 404s on GitHub Pages, where nobody is looking at the favicon anyway.
  check('Every icon href is relative, so a subpath deploy still finds them',
    links.length === 3 && links.every((l) => l.href.startsWith('./')),
    links.map((l) => l.href).join(' '));
  check('And the old inline SVG favicon is gone rather than left alongside',
    !links.some((l) => l.href.startsWith('data:')),
    links.map((l) => l.href.slice(0, 24)).join(' '));

  // The declarations are worth nothing if the files behind them 404.
  const fetched = await page.evaluate(async (hrefs) => {
    const out = [];
    for (const h of hrefs) {
      const r = await fetch(h).catch(() => null);
      out.push(r ? r.status : 0);
    }
    return out;
  }, links.map((l) => l.resolved));
  check('And each link resolves to a file that is actually there',
    fetched.length === 3 && fetched.every((s) => s === 200), fetched.join(','));
}

// ============ D. ONE ARTWORK, AND ROOM FOR THE CORNER MASK
{
  // Not a pixel comparison — the three are resized from one master, so they
  // are not the same pixels and never will be. What has to hold is that they
  // are the same picture, and that the picture has enough margin to survive
  // the mask iOS puts over it.
  const grids = FILES.map(([n]) => decoded[n]?.grid ?? null);
  let worst = 999, mean = 999;
  if (grids.every(Boolean)) {
    worst = 0; let total = 0, n = 0;
    for (let cell = 0; cell < 64; cell++) {
      for (let ch = 0; ch < 3; ch++) {
        const vals = grids.map((g) => g[cell][ch]);
        const d = Math.max(...vals) - Math.min(...vals);
        worst = Math.max(worst, d); total += d; n++;
      }
    }
    mean = +(total / n).toFixed(1);
  }
  check('All three are the same picture, cell for cell',
    mean < 12, `mean difference ${mean} levels, worst cell ${worst}`);

  for (const [name] of FILES) {
    const im = decoded[name];
    // The home screen rounds the corners off. Anything the artwork puts out
    // there is cropped, so the ring has to be background and the subject has
    // to be inside it — measured as: the outer ring is much darker than the
    // middle, and its four corners agree with each other.
    const ring = im?.ring, mid = im?.middle;
    const contrast = ring && mid ? (mid[0] + mid[1] + mid[2]) - (ring[0] + ring[1] + ring[2]) : -1;
    check(`${name}: the subject sits inside the corner mask, not under it`,
      contrast > 30, im ? `middle is ${contrast} levels brighter than the outer ring` : 'no such file');
  }
  const corners = decoded['apple-touch-icon.png']?.corners ?? null;
  const spread = corners
    ? Math.max(...[0, 1, 2].map((ch) => Math.max(...corners.map((c) => c[ch])) - Math.min(...corners.map((c) => c[ch]))))
    : 999;
  check('And its four corners are the same background, so the mask has nothing to cut',
    spread <= 12, corners ? `${corners.map((c) => c.slice(0, 3).join(',')).join(' | ')} — spread ${spread}` : 'missing');
}

// ============ E. THE FILES ARE THE MASTER, RESIZED
{
  // A committed binary is the one asset in this repo that can silently stop
  // matching the source it claims to come from: nothing breaks, nothing fails
  // to build, the icon is just quietly out of date. Regenerating from the
  // master and comparing bytes is the only thing that catches it.
  const haveMaster = IMG && existsSync(MASTER);
  const master = haveMaster ? IMG.decodePng(readFileSync(MASTER)) : null;
  check('There is a master image in the repo, square',
    !!master && master.width === master.height && master.width >= 180,
    master ? `${master.width}×${master.height}` : 'none');

  for (const [name, size] of FILES) {
    const there = existsSync(PUB + name);
    const onDisk = there ? readFileSync(PUB + name) : null;
    const regenerated = master
      ? IMG.encodePng(size, size, IMG.resize(master.rgba, master.width, master.height, size, size))
      : null;
    check(`${name} on disk is byte-for-byte the master resized`,
      !!onDisk && !!regenerated && Buffer.compare(onDisk, regenerated) === 0,
      onDisk && regenerated ? `${onDisk.length} bytes on disk, ${regenerated.length} regenerated`
        : !onDisk ? 'nothing on disk' : 'no master to resize');
  }

  // The master is a working file, not a shipped one. Left in public/ it would
  // be served to every visitor for nothing.
  check('And the master itself is not shipped to the browser',
    !existsSync(PUB + 'icon-master.png'),
    `public/ holds ${FILES.length} icons`);

  const sizes = FILES.map(([f]) => (existsSync(PUB + f) ? readFileSync(PUB + f).length : 0));
  check('The icon set is small enough not to matter',
    sizes.every((n) => n > 0) && sizes.reduce((a, b) => a + b) < 200 * 1024,
    `${(sizes.reduce((a, b) => a + b) / 1024).toFixed(1)}KB for all three`);
  console.log(`  · icon set: ${FILES.map(([f], i) => `${f} ${(sizes[i] / 1024).toFixed(1)}KB`).join(', ')}`);
}

await ctx.close();
console.log('\nPASS');
for (const p of pass) console.log('  ✓ ' + p);
if (fail.length) { console.log('\nFAIL'); for (const f of fail) console.log('  ✗ ' + f); }
if (errs.length) { console.log('\nPAGE ERRORS'); for (const e of new Set(errs)) console.log('  ! ' + e); }
console.log(`\n${pass.length} passed, ${fail.length} failed, ${new Set(errs).size} distinct page errors`);
// Non-zero on a failure, and on a page error, and on a suite that asserted
// nothing at all. Without this a suite that printed a wall of red still exited
// 0, and the runner — and CI behind it — would have called it green.
if (fail.length || errs.length || !pass.length) process.exitCode = 1;
await browser.close();
