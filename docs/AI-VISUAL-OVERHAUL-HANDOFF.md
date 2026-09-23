# Visual overhaul — Execution 2

Branch: `codex/visual-overhaul`. Execution 2 base: `9d32abf`.
Scope: world surfaces, vegetation, roads, tool feedback, and visual review. No gameplay,
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
| `src/render/sprites.ts` | Deterministic procedural albedo/emissive atlases, cached lazily. Quiet clustered grass, layered stone plates, sand bands, distinct forest floor and stepped material edges replace the noisy ground treatment. Roads have five materials × sixteen connectivity masks. Preserve mask/bridge semantics. |
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
`AMBIENT_KEYS`, `LIGHTING`, and `MOTION`. Execution 2 changes only the ground/road
material families; icon colors, ambient light and timing retain their E1 values.
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

- Default output: ignored `artifacts/visual-review/index.html`, 21 PNGs and `manifest.json`.
- Seven states: early day, populated day, night, rain, snow, phase 5, observer.
- Viewports: 1340×860, 390×844 touch portrait, 844×390 touch landscape; DPR 1.
- Seed 90210, Verdant scenario, zoom 2, fixed camera/hour/month/phase; reduced motion.
- Freeze browser RAF/timers after boot. Reset renderer; seed and warm ambient life
  for exactly 120 steps. Capture real canvas and DOM. Restore `Math.random` afterwards.
- Manifest records actual placed buildings, weather, camera, agents/particles,
  phase classes, and canvas/building-state hashes. Assert population, phase,
  precipitation, no document overflow, and no page errors. Repeat the first
  fixture in a new context and assert identical state and canvas on the same host.
- Surface matrix: `VISUAL_SURFACES=1 npm run review:visual` creates 20 desktop
  captures: all four scenarios at 0.5×/2×/4×, four overlays and four tool previews.
  Uses 1280×800 so 0.5× actually fits the buffer budget; asserts requested zoom.
  River/coast captures center on real shorelines; dry Sunbelt centers on its town.
  Choose another output directory to keep both galleries (see below).
- Optional: `VISUAL_SCENES=early,night npm run review:visual`;
  `VISUAL_REVIEW_DIR=artifacts/comparison npm run review:visual` for another output.
  `-- --no-build` reuses a known current build; never use it after code changes.
- Compare images visually, not against committed cross-platform pixel goldens.
  Fonts, GPU/backend and browser versions can change hashes between hosts.

These are deliberately **staged art fixtures**, not save files or proof of economic
reachability: late phase, building activity/age and month are set directly; dense
sites use real placement rules and instant/free construction. Utilities and HUD
totals are not economically reconciled. M57 remains the simulation-invariant test.
The surface matrix covers scenario terrain, close/normal/overview scales and
placement/removal feedback; it does not cover all input gestures, panel states,
long-running motion, or physical mobile GPUs. Extend only as the next pass needs.

## Execution 2 decisions and primitives

- Grass keeps over 80% of each tile in its base value, with sparse connected
  clusters; sand uses wind-laid bands; rock uses lit plates and shaded lower lips.
- Forest has a separate floor palette. Trees have layered canopy masses, NW
  highlights and contact shadows; dead trees retain bare branching and bark accents.
- Water holds a stable body across its three frames, animating only sparse glints.
  Per-tile phase variation avoids every glint moving together. Sixteen cardinal
  shore masks create a shallow shelf on the water side, below bridge/reflection
  passes. Land-side banks and material fringes are contained in their own tile.
- Dirt keeps wheel ruts. Paved roads gain quiet asphalt and lit curb/shoulder
  edges. Street dashes, avenue markings and highway double lines remain distinct.
  Junction centers are cleared with approach stop bars; bridges retain transparent
  water margins and gain capped rails/supports. Connectivity masks are unchanged.
- Placement and demolition use a dark keyline for contrast on sand/roads. Refused
  placement adds an X; demolition retains diagonal hatching and the mass outline.
  Utility/pollution washes are lighter so ground detail and roads remain readable.
- New primitives: `Px.clusters()` in `sprites.ts`; `TerrainSprites.shore[mask]`;
  `Renderer.outlineFootprint()`. The existing cardinal dirty-neighbor expansion
  handles material-edge redraws; no new cache invalidation or simulation rules.
- Changed code: `src/render/visual.ts`, `src/render/sprites.ts`,
  `src/render/renderer.ts`, `test/visual-review.mjs`, `test/suites/m63.mjs`.
  This handoff and `test/README.md` document the new review mode.
- Existing terrain layout, coast stair-stepping and tile grid are preserved.
  This pass softens and articulates boundaries; it does not regenerate the map.
  Scenario-picker thumbnail colors stay unchanged with the existing UI.

## Execution record

- Budget: 95% × 20 = 19 minutes. Start 2026-09-23 17:14:32 UTC;
  implementation cutoff 17:29:32; hard stop 17:33:32; save buffer 4 minutes.
- Harness values: entry points `src/`, `test/`; conventions `README.md` and
  `test/README.md`; typecheck `npm run check`; build `npm run build`;
  full test `npm test`; targeted `npm test -- m44 m62` and `npm test -- m63`.
- No lint/formatter configured: surrounding style, `git diff --check` and
  `node --check` for changed MJS. No runtime assets or dependencies added.
- Typecheck, build, M44/M62 and new M63 pass. M63 checks quiet material coverage,
  coherent animated water, distinct live/dead vegetation, every shoreline mask,
  all 80 road masks, transparent bridge edges, and incremental versus full ground
  cache rebuilding after real rock clearance. Rendering preserves the map.
- Default gallery: 21 captures and same-host replay passed. Surface matrix:
  20 captures including all scenarios, actual 0.5×/2×/4×, overlays and previews.
- Two review setup issues were corrected: Sunbelt deliberately has no river, so
  its camera targets the dry town; the larger 1340px viewport clamps overview to
  1×, so the surface matrix uses 1280px and asserts the actual zoom. One gallery
  launch timed out before the game API loaded; rerun against the settled build
  passed. Do not rebuild dist while a capture run is starting.
- Full regression: `npm test` passed all 16 suites, including M63. All 21
  original gallery building-state hashes match E1; their canvas hashes change
  with the new art. Both galleries passed their same-host repeatability checks.
- Browser uses the existing `PLAYWRIGHT_CHROMIUM` override. Physical devices,
  browser engines other than Chromium and sustained-animation performance remain
  untested. Settings/observer-ticker findings above remain out of scope.

## Exact continuation

Execution 3 starts with the building drawers in `src/render/sprites.ts` and
`makeFacade` / the height table in `src/render/height.ts`. Keep the completed
terrain/road language and review workflow. Build stronger per-class silhouettes,
roof equipment and material identity while preserving footprints, sorting,
parallax and occlusion relief. Use the dense/day/night/late/observer fixtures;
add targeted building views where needed. Do not reopen terrain or begin the
later lighting/post-processing/HUD redesigns. Execution 3 has not started.
