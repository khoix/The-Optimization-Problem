# Parallax rework — Execution 1

Branch: `astra/parallax-rework`. Base: `01bb17e` on `origin/main`, the merge
of the completed visual-overhaul branch. Its tree matches `9daebec`; no newer
structure branch or structure handoff was present in the fetched remote refs.
The older checkout's uncommitted E5 work was preserved in place; this execution
uses an isolated worktree. No simulation, save, footprint, placement, control,
terrain, road or progression changes are included.

## Budget and scope

75% of 20 minutes = 15 minutes. Start 2026-09-25 22:16:39 UTC;
implementation cutoff 22:27:39; hard stop 22:31:39. Four minutes are reserved
for handoff, commit, synchronization and verification. E2 is not started.

Only completed houses (7px), factories (17px) and arcologies (72px) use the new
volume path. Other types and construction remain on their established paths.
This is a geometry/face foundation, not a new architecture or whole-scene sort.

## Settled model

- `src/render/volume.ts` is the pure rectangular-volume model. It records a
  fixed base rectangle, height, integer Z vector, projected top, base/top corners,
  four possible wall polygons, visibility, per-face shade and depth, complete
  projected bounds, and ground-depth key.
- `projectHeightVector()` retains the existing optical-axis strengths (0.34
  horizontal, 0.42 vertical factor) and rounds the Z displacement to native
  pixels. It changes only the roof. The supplied base remains unchanged.
- A negative X vector exposes east; positive X exposes west. Negative Y exposes
  south; positive Y exposes north. Zero height collapses to a flat rectangle.
  Every wall joins the corresponding base edge and top edge continuously.
- Geometry takes rectangles, not building types. Several overlapping or separate
  rectangular masses can represent a podium/core or setbacks without replacing
  this model. Building-to-mass catalog definitions are deferred to E2.
- `drawFace()` maps a cached texture onto each visible parallelogram using a
  Canvas2D affine transform, with smoothing disabled. Albedo receives directional
  face shade and local pollution streaks; emissives use the same face transform
  without the albedo shade. No face canvas is created during drawing.
- `height.ts:makeFacade()` accepts an optional material width. Existing callers
  preserve their width. The renderer caches north/south material by footprint
  width and east/west material by footprint depth, with separate emissive layers.
- The reference render path uses projected bounds for culling, draws walls then
  the existing roof, preserves roof evolution details, and shades inactive wall
  polygons. Facade emitters join the existing light/bloom buffers at night.
  Existing ground-depth sorting and the overall pass order are unchanged.

## Reproduction and verification

The initial built-browser M68 check failed on the original arcology: with a
ground south edge from `(48,248)` to `(112,248)`, the stretched facade ended
at approximately `(27.017,248)` to `(91.017,248)`. Its base had slid about
21 world pixels left. A baseline screenshot also captured the displaced mass.

After conversion the same edge test passes. An intermediate fixture failure
was caused by placing the optical test too close to the map boundary: camera
clamping changed the requested position. The fixture was moved into the map
interior; the anchoring assertion and tolerance were preserved.

`test/suites/m68.mjs` combines pure TypeScript geometry tests with real production
bundle rendering in Chromium. It checks fixed bases, top vectors, every wall's
connecting corners, bounds containment, zero height, axis visibility and a
top-only viewport intersection. Browser checks measure the actual transformed
texture corners for all three reference types, verify state preservation and
day/night face emitters, and repeat renders for determinism.

```sh
npm test -- m64 m65 m68
PARALLAX_REVIEW_DIR=artifacts/parallax-review npm test -- m68
```

The second command writes 16 deterministic views: left/right/top/bottom at
2x/4x and noon/night. The tower has stationary trees and road markers on all
sides, with a house and factory nearby. The bottom case deliberately keeps the
base beyond the viewport to exercise projected-mass culling. Selected left,
right and close night images were inspected at full size: side exposure changes
while the wall bottoms remain at the ground markers.

Harness values: source roots `src/render/`, `test/`; conventions `README.md`,
`test/README.md`; typecheck `npm run check`; build `npm run build`; full test
`npm test`; targeted `npm test -- m64 m65 m68`. No lint/formatter is configured;
MJS syntax and `git diff --check` are the derived checks. No dependencies added.

## Exact E2 starting point and limits

Extend the reference dispatch in `renderer.ts` into a building-to-mass catalog,
then convert construction, previews, demolition/selection outlines and the
remaining building types to shared projected geometry. Reuse `volume.ts` and
the cached facade textures. Do not repaint roofs or change gameplay footprints.

The legacy parallax helper remains for unconverted types and auxiliary paths;
its subpixel roof positions can differ slightly from rounded reference roofs.
Hover/x-ray mass tests still use their established approximations. Interleaving
trees, agents and props with volumes is E3, not solved by this execution. The
test lot proves grounding and face connectivity, not complete scene occlusion.
Physical devices, other browsers and sustained performance remain unverified.
The prior visual-overhaul E6 isolated-performance follow-up remains independent.

## Final validation record

- `npm run check`: passed after the production and test edits.
- `npm run build`: passed through the browser runner, including the final
  reference-face material changes.
- `npm test -- m64 m65 m68`: 3/3 passed on the final production source.
- `npm test -- --no-build m68`: passed after the final determinism and face-light
  assertions were added; all three reference structures were actually drawn.
- `npm test`: 21/21 suites passed, completion observed at 22:29:26 UTC.
- `node --check test/suites/m68.mjs` and `git diff --check`: passed.
- Sixteen reference screenshots were captured; selected full-size views were
  inspected as described above. No physical-device performance claim is made.

The initial M68 failure was the expected reproduction of the disconnected wall
base; the intermediate camera-boundary fixture failure is documented above.
No test was skipped or weakened. The existing npm environment warning persists;
no new build warning was introduced. The last production edit was complete by
22:24:28 and the last test edit by 22:25:07, before the 22:27:39 cutoff.
Finalization records test outcomes and synchronizes this six-file E1 change.
