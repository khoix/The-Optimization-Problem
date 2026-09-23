# Visual overhaul — Execution 1

Branch: `codex/visual-overhaul`. Base: `94395c7` (main).
Scope: visual direction, shared foundation, deterministic review. No gameplay,
save-format, footprint, controls, narrative timing, or asset dependency changes.

## Settled direction

**Human civic optimism → infrastructure complexity → immaculate optimized sterility.**
Keep crisp procedural HD-2D; achieve hierarchy by simplifying competing detail,
not by adding another effect layer. The city is the subject, the console its instrument.

| System | Direction and implementation rule |
|---|---|
| Core palette | Warm earth and vegetation against charcoal/steel. Existing material swatches now live in `src/render/visual.ts`; start there rather than inventing per-feature colors. |
| Semantics | Preserve CSS `--good` green, `--mid` amber, `--bad` coral, `--accent` blue, `--asi` ice cyan. Color accompanies shape, text, or a pattern; never use material color alone to communicate state. |
| Civic / compute | Civic: warm masonry, amber occupied windows, asymmetric small details. Compute: graphite, cool glass, cyan indicators, repeated modules. Reserve the brightest cyan for system authorship and focus. |
| Materials | Vegetation: clustered organic masses; masonry: warm matte planes and punched windows; civic: pale stone/render with clear entrances; industrial: ribbed steel and service equipment; compute: dark glass and regular emissive seams; water: broad blue masses with sparse horizontal glints; roads: dark matte surfaces with readable verges. |
| Light | Preserve the warm day / blue night ambient curve. Albedo describes material; emissive describes a light source. Daytime glass stays dark. Street lamps remain sodium warm; do not increase bloom to compensate for weak silhouettes. |
| Contrast | Selection, faults and placement > building silhouettes > road network > ground texture. UI labels and values > icons > borders. Keep color-coded warnings intelligible even as late phases soften their presentation. |
| Shape / depth | Pixel-aligned 16px ground tiles; legible roof outline, darker facade, contact shadow. Preserve ground footprint, height sorting, parallax and x-ray relief. Large compute blocks must not resemble enlarged houses. |
| Motion | Civic motion irregular but restrained; system motion increasingly synchronized. Favor slow environmental movement; no decorative whole-screen pulse. Respect existing reduced-motion preferences. Water's existing 2.2 frames/sec is centralized without changing it. |
| Detail density | Use 2–4 value clusters per material. Texture must disappear before silhouettes at overview zoom; avoid evenly distributed high-contrast single-pixel noise. Landmark details belong at entrances, corners and roof equipment. |
| UI hierarchy | Reuse `style.css` root tokens and `.console-panel`, `.row-btn`, `.flyout-head`. A 4px spacing unit, 8px control gaps, 12–16px panel padding, and existing 44px touch targets guide later restyling. Preserve title/value/secondary-text distinction and drawer anchoring. |
| Progression | Phases 0–2: warmth and variety. Phase 3: more repetition with intact civic identity. Phases 4–5: cool and simplify existing controls in step with current authority changes. Phase 6: quiet, orderly monitoring; retain the observer exit/history controls. Never change transition thresholds. |

## Audit and architecture

| Area / entry point | Finding and constraint for subsequent work |
|---|---|
| `src/render/sprites.ts` | Deterministic procedural albedo/emissive atlases, cached lazily. Grass/rock dither competes with small buildings; terrain boundaries are hard steps. Roads have five materials × sixteen connectivity masks. Preserve mask/bridge semantics. |
| `src/render/height.ts` | Explicit per-type heights and four facade families: glass, masonry, industrial, civic. Roof-edge-derived facade colors keep volumes coherent, but roof/window rhythms need stronger type identity. Keep exhaustive height mapping and occlusion relief. |
| `src/render/renderer.ts` | Pass order: cached terrain → lamps → agents → trees → depth-sorted buildings → water reflection → haze/particles/clouds → diagnostics/light → placement/selection → grade/upscale → tilt-shift → bloom/shafts/vignette. Do not reorder casually; earlier emissives feed later passes. |
| Renderer caches / performance | `mapVersion` + dirty tiles govern ground invalidation; building ordering also caches by state. `resetSession()` must accompany fixture swaps. Overview detail fades from zoom 0.55 to 1.0; world-buffer budget is 4.4M pixels. Preserve these controls. |
| `src/render/agents.ts` | Traffic, pedestrians, smoke, steam and precipitation use real-time randomness. Observer mode regularizes traffic and thins people. Review fixtures seed randomness locally; production randomness is unchanged. |
| `src/ui/ui.ts`, `src/style.css` | Civic bar, construction drawer, indicators, policies, politics, menu, inspector, settings, feed/toasts, and title share console materials. Dense values and tiny secondary copy compete for attention. The phone bar occupies substantial vertical space. Existing layout/interaction tests are valuable guards. |
| `src/ui/icons.ts` | Two-tone SVG subjects already encode resource semantics; palette extracted without changing paths. Do not replace with an unrelated icon family. |
| `src/boot.ts`, `src/boot.css`, `src/render/titlecity.ts` | Boot independently stages a city and sweeps warm lights cold before the sprite renderer is ready. Title/menu use the live city and the same console panel. Preserve early paint, staged load and audio-unlock gesture. |
| ASI / observer | Renderer grading follows emergence and observer age. UI `refresh()` applies phase classes and restructures controls; fixtures exercise this code rather than adding classes directly. Short landscape observer ticker is visibly cramped/clipped; review in Execution 6. |
| Other layout finding | Settings' tall modal can extend above the desktop viewport in the inspected state. Recheck with ordinary navigation in the UI/responsive pass; no fix attempted here. |

## Shared foundation

`src/render/visual.ts` owns `TERRAIN_PALETTE`, `ROAD_MATERIALS`, `ICON_PALETTE`,
`AMBIENT_KEYS`, `LIGHTING`, and `MOTION`. All consumed values were moved unchanged.
It has no DOM work, runtime dependencies, or simulation imports. CSS semantic and
panel tokens remain canonical in `style.css :root`; boot keeps its independent
critical styling. Do not merge distinct material and semantic roles just because
two current swatches look similar. Building-specific pigments remain with their
drawers until the architectural pass needs shared material abstractions.

## Reproduce the review

```sh
npm ci
npx playwright install chromium
npm run review:visual
npm test -- m62
```

Use the existing `PLAYWRIGHT_CHROMIUM` environment override if Chromium is installed
elsewhere. The runner builds and serves the actual bundle, owns its preview/dev
servers, and closes them afterwards. No production debug API was added.

- Output: ignored `artifacts/visual-review/index.html`, 21 PNGs and `manifest.json`.
- Seven states: early day, populated day, night, rain, snow, phase 5, observer.
- Viewports: 1340×860, 390×844 touch portrait, 844×390 touch landscape; DPR 1.
- Seed 90210, Verdant scenario, zoom 2, fixed camera/hour/month/phase; reduced motion.
- Freeze browser RAF/timers after boot. Reset renderer; seed and warm ambient life
  for exactly 120 steps. Capture real canvas and DOM. Restore `Math.random` afterwards.
- Manifest records actual placed buildings, weather, camera, agents/particles,
  phase classes, and canvas/building-state hashes. Assert population, phase,
  precipitation, no document overflow, and no page errors. Repeat the first
  fixture in a new context and assert identical state and canvas on the same host.
- Optional: `VISUAL_SCENES=early,night npm run review:visual`;
  `VISUAL_REVIEW_DIR=artifacts/comparison npm run review:visual` for another output.
  `-- --no-build` reuses a known current build; never use it after code changes.
- Compare images visually, not against committed cross-platform pixel goldens.
  Fonts, GPU/backend and browser versions can change hashes between hosts.

These are deliberately **staged art fixtures**, not save files or proof of economic
reachability: late phase, building activity/age and month are set directly; dense
sites use real placement rules and instant/free construction. Utilities and HUD
totals are not economically reconciled. M57 remains the simulation-invariant test.
The gallery does not cover all scenarios, zooms, input gestures, panel states,
long-running motion, or physical mobile GPUs. Extend only as the next pass needs.

## Execution record

- Budget: 95% × 20 = 19 minutes. Start 2026-09-23 11:59:24 UTC;
  implementation cutoff 12:14:24; hard stop 12:18:24; save buffer 4 minutes.
- Derived harness values: entry points `src/`, `test/`; conventions `README.md`
  and `test/README.md`; typecheck `npm run check`; build `npm run build`;
  full test `npm test`; targeted test `npm test -- <suite>`.
- No lint or formatter is configured; use surrounding style, `git diff --check`,
  and `node --check` for changed MJS files. Protected scope: simulation/save/input
  behavior. VCS: commit and push this branch, as explicitly required by the plan.
- Local tooling: `npm ci`; standard browser download failed with a corrupt archive.
  A separately installed scratch-only Chromium package enabled real-browser checks;
  no runtime or project dependency was added. Existing npm proxy warning predates edits.
- Verified: typecheck, build, M62, full 21-state gallery and same-host replay.
  All 21 pre/post-refactor canvas hashes AND building-state hashes match exactly.
- Baseline and updated presentation inspected: daytime/night, phone, short landscape
  observer; additional boot, title, construction drawer, indicators, policies,
  politics, menu, settings and inspector audit.
- Full regression: `npm test` passed all 15 suites (M44–M62, existing suite gaps
  retained), including M57 simulation/save invariants and M61 console/phase checks.
  `node --check` passed for all three changed MJS files; `git diff --check` passed.
  The filtered capture command also passed three viewports plus replay after
  making the CLI entry-point detection safe for paths with spaces and Windows.
- Execution 1 implementation and validation complete. No remaining blocker.
  Execution 2 has not started. No lint/formatter gate exists in this repository;
  platform-specific rendering and physical-device behavior remain untested.

## Exact continuation

Execution 2 starts in `src/render/sprites.ts:makeTerrain`, using
`TERRAIN_PALETTE` and the early/day/night/rain/snow review scenes. First reduce
ground noise and establish clustered terrain value shapes; then work through
terrain boundaries, vegetation, water, roads, placement/demolition and overlays
in the supplied Execution 2 order. Preserve atlas sizes, seeds, connectivity,
cache invalidation and footprints. Add scenario/zoom captures when those become
the next required comparison. Do not begin buildings, effects or full UI redesign.
