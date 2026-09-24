# Visual overhaul — Execution 5

Branch: `codex/visual-overhaul`. Execution 5 base: `dec8906`.
Scope: interface and presentation overhaul. No gameplay,
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
| `src/render/height.ts` | Explicit per-type heights and five facade families: glass, masonry, industrial, civic, compute. Occupied walls use material pigments rather than sampled lawn/paving edges. Midrise is masonry; highrise/arcology are glass. Keep exhaustive height mapping and occlusion relief. |
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

## Execution 3 architecture and exceptions

The first 30% checkpoint (`0d4f219`) introduced sealed compute facades and M64.
This 95% continuation treats all 29 non-road building drawers. Existing heights
(including zero-height park/plaza and 3px solar fields), legal footprints,
parallax strength, base-depth sorting and x-ray behavior are preserved.

| Types | Material and detail decisions |
|---|---|
| House, apartment, midrise | Warm masonry, door lintels, sparse windows; chimney/porch at low density, roof terrace at apartment density, framed courtyard at midrise density. Apartment/midrise balconies provide a horizontal rhythm. |
| Highrise, arcology, office | Glass mullions distinguish highrise/arcology, with a recessed crown/lift plant and planted arcology bands. Office gains an atrium/service spine but retains the existing industrial-category ribbed facade. Heights remain 48/72/32px. |
| School, library, community center | Approachable pale civic walls with pilasters and clear entrances; brick clerestory school, stone portico/skylight library, and ribbed timber community hall roofs. |
| Sports complex, museum, hospital | Stepped spectator seating/pool bands; pale museum wing/atrium/steps; hospital roof plant, cross and explicit H-shaped helipad. Existing night symbols remain separate emitters. |
| Park, plaza, retail | Layered shrub canopy, planters and plinth; warm retail awnings/sign lettering with dark daytime glazing. Park/plaza stay flat. Retail retains its existing industrial facade classification and service bays. |
| Solar farm, solar array, coal plant | Low panel fields gain an inverter and service routes; farm LED moves off the solar glass to its inverter. Coal retains twin stacks and gains a conveyor/service structure. |
| Nuclear plant, water plant, water reclamation | Chamfered containment crowns/tower rim; connected treatment pipes and pump plant; membrane works gain pipe couplings and rooftop plant. All remain industrial utilities. |
| Factory, automated factory | Warm sawtooth roof and dock lintel versus cool, repeated roof plant and logistics details. Generated walls have ribbing and loading doors. |
| Edge, cloud, AI compute | Existing sealed graphite/cyan facade language; raised fan units, connected cooling lines, cloud service spine, and repeated campus chiller highlights. Campus stays monolithic. |
| Government, medical, community compute | Navy security bunker/fence posts; pale medical roof/teal routing; reused patchwork panels with salvaged equipment and warm roof doorway. Their compute facade status lights remain cool. |

- `roofPlant()` supplies a shared casing, shadow, lit edge and grille. Lot-wide
  noise is quieter so architectural detail dominates. No asset dependency added.
- Construction retains the original progress values and late cladding fade;
  concrete footings and a 25%-progress frame make earlier stages distinct.
- Existing age thresholds still add cooling equipment; new contact shadows,
  casing lips and connecting pipes make that accretion readable.
- Corporate influence retains its existing thresholds and palettes, with
  mounted glyph signage. Local tile pollution adds restrained facade runoff.
- Fixed a genuine edge-culling defect: projected roofs remain drawn when their
  footprint has passed below the view. M65 reproduced the missing roof before
  the fix and passed afterwards. No simulation or camera geometry changed.

## Execution 3 validation and budget

- Budget: 95% × 20 = 19 minutes. Start 2026-09-23 22:15:17 UTC;
  implementation cutoff 22:30:17; hard stop 22:34:17; save buffer 4 minutes.
- `npm run check`, build via the runner, `npm test -- m64 m65`, MJS syntax
  checks and `git diff --check` passed. M65 covers all 29 distinct atlases,
  footprint/emissive dimensions, state preservation and viewport-edge drawing.
- Final architecture review: 68 captures and deterministic replay passed;
  all 29 types are represented and all eight lifecycle canvas hashes differ.
  Day/night contact sheets and representative close/normal/overview images
  were visually inspected. The ordinary gallery passed 21 captures and replay;
  every building-state hash matches E2.
- Regression: all 18 suites passed across runs. The full `npm test` log passed
  M44–M49 but stopped advancing in M50's unbounded boot-progress sampling loop;
  it did not produce a full-suite summary. M50 passed alone (31 assertions).
  A bounded continuation passed M51–M55 and M57 before its time limit; a final
  `npm test -- --no-build m57 m58 m61 m62 m63 m64 m65` passed 7/7. No tests were
  weakened or skipped. Treat the uninterrupted runner stall as a harness caveat.
- New review mode: `VISUAL_ARCHITECTURE=1 npm run review:visual` uses a staged,
  flattened lot. Ten groups cover every type at 0.5×, 2× and 4×, day and night.
  Eight additional plates cover foundation/frame/cladding, offline, aged,
  polluted, corporate and build-tool relief states. Use `VISUAL_REVIEW_DIR`
  to retain it separately from the unchanged 21-scene scenario review.
- The first close-up review clipped its leftmost building. The corrected
  fixtures use closer spacing and assert complete projected bounds above the
  desktop controls. An initial edge-test coordinate was also corrected to use
  the renderer's overscanned view bounds before reproducing the actual bug.
- No configured lint/formatter; surrounding style and syntax/diff checks apply.
  The existing npm http-proxy environment warning persists. Physical devices,
  non-Chromium engines and sustained-animation performance remain untested.
  The previous settings/observer ticker findings remain for the UI pass.

## Exact continuation

Execution 4 starts with `src/render/renderer.ts` lighting/post-processing passes,
`src/render/visual.ts` ambient/light constants and `src/render/agents.ts` motion.
Reuse the completed terrain and architecture; do not redesign them. Review
day/night transitions, shadow/contact treatment, point lights, bloom, reflections,
weather, ambient life, grading, depth and observer atmosphere against the existing
galleries. Museum/large skylight emitters can saturate under the current bloom;
assess light intensity in E4 rather than repainting their architecture.
Execution 4 supersedes that starting point; see the current handoff below.

## Execution 4 — lighting, atmosphere and motion

Budget: 83% of 20 minutes = 16m36s. Start 03:18:33 UTC; implementation cutoff
03:31:09; hard stop 03:35:09 on 2026-09-24. No Execution 5 work was started.

### Decisions and thresholds

- Preserve the warm-day/blue-night palette, directional shadows, contact AO,
  sodium street lamps, building point lights, coast reflections, precipitation,
  pollution haze, smoke/steam and seasonal presentation. No new renderer pass,
  full-size buffer, dependency, sprite redesign or simulation rule was added.
- Ease ambient keys and dawn/dusk night factors with clamped smoothstep.
  Existing day/night endpoints (04:30, 08:00, 17:00, 21:00) remain unchanged.
- Bloom now uses screen blending with 0.34 blurred / 0.18 sharp contributions;
  civic emission tops out at 0.8, compute at 0.82. This retains roof/skylight
  boundaries instead of washing them out. Overview detail gates remain intact.
- Compute activity is a restrained 1.8-radian/sec pulse (0.76–1.0), gradually
  phase-aligning with emergence and fully synchronized in observer mode.
  Pedestrian stride shifts only the drawn sprite by one world pixel; observer
  pedestrians glide. Existing traffic speed, routing, capacity and counts stay
  unchanged, retaining the established organic/observer contrast.
- Cloud shadow opacity eases to zero at rain 0.55. Storm-break shafts fade in
  across 0.12–0.24 and out across 0.35–0.55, with a night fade through 0.6.
  Golden shafts ease in/out; compute pillars fade from night factor 0.35 and
  originate at the actual elevated/parallax-shifted roof, not the footprint.
- Tilt-shift opacity is 72% of the existing zoom detail factor; vignette edge
  alpha is 0.24. Observer brightness rises only from 1.02 to 1.04, retaining
  the established progressive cool/desaturated grade without pale clipping.

### Review and performance

`VISUAL_LIGHTING=1 VISUAL_PROFILE=1 npm run review:visual` adds nine staged
lighting states across desktop, phone and landscape. Compute and industrial
districts deliberately concentrate their relevant building types. Profiling
preserves a native performance clock while animation is frozen, discards four
warmups, and records 12 CPU submission samples with existing per-pass marks.
Transition strips include 11 light/weather boundaries and four animation frames.
M66 asserts smooth day/night boundaries, small pixel deltas around thresholds,
actual animation, unchanged simulation state, and the existing buffer budget.

Same-host median CPU submission milliseconds (baseline → final repeat):

| Viewport | Noon | Midnight | Extended observer |
|---|---:|---:|---:|
| 1340×860 desktop | 33.90 → 33.45 | 46.50 → 41.20 | 44.85 → 41.80 |
| 390×844 phone | 3.85 → 4.30 | 8.70 → 9.80 | 8.50 → 10.10 |
| 844×390 landscape | 5.15 → 6.25 | 10.95 → 12.25 | 10.25 → 10.20 |

All six measured canvas buffer dimensions match the baseline exactly. These
are software-rendered host measurements, not GPU presentation or device FPS.
An initial concurrent capture run was noisier; the table uses the subsequent
repeat. Phone increases of 0.45–1.60 ms warrant physical-device verification in
E6; no hardware or cross-browser performance claim is made.

### Validation and continuation

- Typecheck and production build passed; changed MJS syntax and diff whitespace
  checks passed. No lint/formatter script is configured in this repository.
- M66 failed against the unchanged E3 build at the dawn easing assertion, then
  passed on desktop and phone after the renderer changes. M62/M66 passed 2/2.
- Original 21-scene matrix, new 27-scene lighting matrix, and two 4× civic-roof
  night plates passed with deterministic replays. Inspected dawn/night, compute,
  phone storm, civic skylights and transition strips; silhouettes remain legible.
- A truncated local Chromium executable initially crashed with SIGSEGV before
  page load. Restoring the existing local compressed package fixed it; no project
  dependency or test configuration changed.
- `npm test` completed with **19/19 suites passing**, including M50, M57
  simulation invariants, all earlier visual suites and M66. No tests were
  skipped, weakened or suppressed. The existing npm environment warning about
  `http-proxy` remains unrelated to this change.
- Final animation capture/replay passed on all three viewports: four distinct
  animation frames each; near-boundary mean RGB differences were 0.002–0.717
  levels on a 0–255 scale. Final diff review maps every hunk to E4.
- Save protocol: commit locally, create the identical Git tree through the
  connected repository API, fast-forward `codex/visual-overhaul`, fetch and
  verify matching local/remote commit and clean tree. The local pre-sync commit
  is retained on `codex/visual-overhaul-e4-local` because API commit metadata
  differs; file contents and tree identity must match before switching branches.

Execution 5 starts at the HUD/UI scope in the supplied six-execution plan, using
the existing tokens, console panels and semantic controls described above.
Do not alter authority progression or observer controls. Remaining E4 limitations:
physical mobile GPU/browser review and continuous interactive feel remain human
review tasks; precipitation quantities and traffic mechanics intentionally retain
their existing behavior. No unresolved implementation item is scheduled for E4.

## Execution 5 — interface and presentation

Budget: 95% of 20 minutes = 19 minutes. Start 10:51:07 UTC on 2026-09-24;
implementation cutoff 11:06:07; hard stop 11:10:07. Execution 6 is not started.
That attempt left its changes in the working tree without a commit or remote
synchronization. This continuation starts at 21:15:20 UTC on the same date,
again at 95%: implementation cutoff 21:30:20 and hard stop 21:34:20. The final
four minutes are reserved for preservation and verification.

### Interface language

- The early administration uses warm graphite panels, parchment-white primary
  text, lighter secondary copy, and restrained brass control accents. Semantic
  good/warning/bad colors and the established cyan title/hairline motifs remain.
  Cyan therefore accents the initial instrument rather than coloring every
  selected setting and primary action.
- Shared panel/row tokens reach drawers, inspector, explanation/hover cards,
  menus, save/load/archive, events, reports, alerts, treasury and guide. Existing
  two-tone SVG icons and the incoming-event versus player-opened panel distinction
  remain intact; no icons, narrative copy, controls or information were removed.
- Construction descriptions, policy text, settings descriptions and secondary
  copy are more readable. Financial/resource values explicitly use tabular digits.
  Active controls gain a solid underline/edge in addition to color. Generic
  buttons, role-buttons, inputs and selects receive keyboard focus treatment.
- Boot progress and its entry button share the brass accent. The independent
  early stylesheet retains identical shared variables with the main CSS.
  Warm title-city roofs/facades have stronger material separation; animation
  timing, procedural generation, cold sweep and audio-unlock flow are unchanged.
- Scenario thumbnails now reuse the established terrain and street pigments.
  M49's independent expected color table was updated; all terrain identity,
  seed/region matching, reroll and cache assertions remain unchanged.

### Progression and responsive behavior

- Existing phase classes continue to come exclusively from UI refresh. Phase 4
  changes shared panel, row and control tokens to cool steel, including dialogs
  and guide surfaces. Phase 5 uses system cyan and reduces control/panel corner
  radii to 2px. Observer uses pale restrained accents; existing administrative
  lockout, warning treatment and readable monitoring controls are preserved.
- Dialogs are flex columns bounded by viewport and measured civic-bar height;
  their prose/settings region scrolls while headings/actions retain their size.
  Title dialogs get the full viewport allowance. No save/menu semantics changed.
- Observer status wraps instead of clipping. Short touch landscape reserves a
  full-width status line above the controls; the observer banner is also bounded
  and scrollable. Existing responsive toolbar and touch target rules remain.
- Both OS reduced motion and the in-game preference suppress interface
  animations/transitions, including pseudo-elements. World animation is unchanged.

### Files and review workflow

Production: `src/style.css`, `src/boot.css`, `src/render/titlecity.ts`,
`src/ui/thumbnail.ts`, and `src/ui/guide.ts`. Verification: `test/suites/m49.mjs`, new M67,
`test/README.md`, and this handoff. No dependency, simulation, save or UI action
handler changes were needed.

`UI_REVIEW_DIR=artifacts/ui-review npm test -- m67` captures the actual player
routes through title, guide, settings, scenario selection, construction and four
civic drawers, then stages phase 4/5/observer through the real refresh path.
It checks bounds, numeric typography, keyboard focus, phase accents, observer
status wrapping and reduced motion on four viewports. Use
`UI_REVIEW_VIEWPORT=desktop|narrow|phone|landscape` for one bounded viewport run
(choose one literal value); omitting it always exercises all four.

M67 first failed against E4's build on the absent civic accent. A subsequent
focus failure was a fixture error: `.bar-tool` matched the invisible spacer.
The check now focuses the real Roads control with keyboard modality, and also
waits for region navigation to finish before inspecting controls. Missing civic
controls are explicit failures, never silently skipped.

Short touch landscape exposed a real guide error: its hidden illustration had
a zero-sized canvas, and the renderer passed an empty blur buffer to `drawImage`.
M67 reproduced the page error before the fix. The guide now pauses map drawing
while hidden, keeps its frame loop alive, and resizes/recenters when visible
again. The regression also rotates landscape to portrait and back without
reopening the guide, checking that its canvas dimensions recover.

### Final validation and continuation

The continuation's full `npm test` completed successfully at 21:26:42 UTC:
**20/20 suites passed** (M44, M46–M55, M57, M58, M61–M67). This includes the
production build and every existing UI, simulation and renderer regression.
No assertions were skipped or weakened. Earlier E5 attempts that exhausted
their command timeouts did not constitute full-suite passes; this completed
run supersedes those incomplete validation attempts.

- `npm run check`: passed.
- `npm run build`, executed by `npm test`: passed.
- `npm test -- --no-build m67`: passed all four viewports on the final source.
- `UI_REVIEW_VIEWPORT=landscape npm test -- --no-build m67`: passed, including
  rotation recovery and zero browser page errors.
- `node --check test/suites/m49.mjs` and `node --check test/suites/m67.mjs`:
  passed. `git diff --check`: passed.
- No lint or formatter script is configured. Existing source style, syntax
  checks and whitespace checks are the derived harness checks. The existing
  npm `http-proxy` environment warning persists; no new build warning appeared.

Visual inspection covered desktop title, settings, guide, civic/indicator
surfaces; phone settings, region selection and observer; narrow desktop
politics; and short-landscape guide and observer. M67 exercises construction,
indicators, policies, allocation and politics through actual controls on all
four viewports, plus keyboard focus, phase accents and reduced motion. Existing
suites cover inspector, alerts, save/import/export, archive, reports and the
remaining menus. Physical-device touch feel and mobile GPU performance remain
human review tasks; browser touch emulation is not a physical-device check.

E5 implementation and validation are complete. The continuation made no further
production-code changes after the prior landscape fix. Save the nine-file
change as `Refine civic interface and late-game presentation`, synchronize
`codex/visual-overhaul`, and verify matching local/remote trees and a clean
working tree. The final execution report records the synchronized commit.

Next execution: start E6's final integration and visual validation from this
E5 branch. Reuse the established world and UI art, the M67 four-viewport review
command, and the existing visual-review fixtures. No E6 work was begun here;
no unresolved E5 regression was observed in the completed automated checks.
