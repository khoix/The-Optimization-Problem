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

## E2 — 20% budget checkpoint (2026-09-25)

E1 is complete and synchronized at `3bb0a26efa2356ed58324ab6805b2a5deadcaeaa` on `astra/parallax-rework`. A fresh fetch at 23:42 UTC confirmed the remote matches that commit and the worktree was clean.

This E2 turn started at 23:40:14 UTC. The requested 20% budget is four minutes total. Under `Execution-Time-Budget.md`, the mandatory four-minute save buffer leaves zero implementation minutes: implementation cutoff 23:40:14 UTC, hard stop 23:44:14 UTC. No E2 production or test changes were started. E2 is not complete; E3 has not started.

Resume E2 with the building-catalog audit: distinguish each building's visual mass from its gameplay footprint, then extend the E1 fixed-base volume helpers across elevated types, lifecycle rendering, emissives, and auxiliary projection consumers as specified in the E2 plan. Preserve ground placement and selection anchors. The preceding E1 handoff describes the current three reference types and remaining legacy paths.

This checkpoint changes only this handoff. Verification for this turn consists of remote identity, clean initial worktree, and whitespace validation; E1's recorded 21/21 passing suites are prior evidence and were not rerun for this documentation-only checkpoint.

## E2 — initial visual-mass audit (2026-09-26, 25%)

Budget: start 00:24:39 UTC, implementation cutoff 00:25:39, hard stop 00:29:39. Five minutes total provide one minute of implementation/audit and four minutes for preservation. The first unfinished E2 requirement was the visual-mass audit; this turn records a partial source audit, with no renderer changes and no claim of complete catalog conversion.

`renderer.ts:volumeFor()` currently derives its entire base from `BUILDING_DEFS` occupancy. `sprites.ts:makeBuildingSprites()` produces one combined lot/building albedo and emissive pair at that same size. Therefore simply enabling volumes for all types would lift yards and fields. Even the E1 reference house needs its ground art separated before this is a correct visual-mass catalog.

Coordinates below are native sprite pixels (`TILE = 16`), written as x, y, width, height. They describe observed sprite drawing regions, not approved final extrusion masks.

| Type | Gameplay sprite size | Observed mass / open-space evidence | Conversion implication |
| --- | --- | --- | --- |
| house | 16 × 16 | Full lawn backing; body at (2,5,12,8), gable at (1,1,14,5). | Retain lawn on ground; define body and roof overhang separately. |
| school | 48 × 32 | Playing field at (2,20,18,10); main block drawn with `boxBuilding(22,3,23,22)`. | Field stays grounded; main block is offset within the lot. |
| arcology | 64 × 64 | Three terraces at (2,6,60,54), (8,12,48,42), (15,18,34,30) over a full backing. | Preserve capacity for multiple masses/setbacks; do not treat backing pixels as proof of solid structure. |
| solar_farm | 48 × 48 | Sixteen 9 × 6 panels, spaced 11 px apart, with mounts and a separate inverter. | Keep ground between panels; existing height is only 3 px. |
| solar_array | 64 × 64 | Twenty-five 10 × 7 panels, spaced 12 px apart; tracker posts and a separate transformer area. | Avoid extruding the full field; preserve the existing 3 px scale. |
| nuclear_plant | 64 × 64 | Two containment regions, separate turbine hall at (22,6,38,26), cooling-tower region at (24,38,18,18), and switchyard. | Needs distinct masses or masks; a full-lot solid prism would fill substantial open space. |

Source evidence: the corresponding named drawers in `src/render/sprites.ts`, dimensions in `src/game/buildings.ts`, height entries in `src/render/height.ts`, and `Renderer.volumeFor()` in `src/render/renderer.ts`. These are source observations; no new visual regression result is claimed.

Exact continuation: finish the remaining type-by-type visual-mass audit, then introduce explicit ground/top separation and per-type visual mass definitions before expanding the volume dispatch. A crop of the existing combined sprite alone is insufficient: elevated artwork must not remain duplicated in the ground layer. Preserve gameplay occupancy. No geometry, lifecycle, auxiliary path, or E3 conversion was performed this turn.

Verification this turn: a Python source cross-check passed for all six documented drawer patterns, the 16 px tile scale, and the occupancy-derived volume base; `git diff --check` passed. The fresh remote fetch matched the prior `401e55e` checkpoint. No production code or tests changed, so build/browser suites were not rerun; E1's results above remain historical evidence. The initial lookup of `src/sim/buildings.ts` failed because that path does not exist; file discovery located the actual definitions at `src/game/buildings.ts` before the audit. Source inspection ended within the one-minute work window; its handoff was written during the save buffer.

## E2 — house layer separation (2026-09-26, 24%)

Start 01:19:41 UTC; user explicitly overrode the save buffer to two minutes. Total 4m48s, implementation cutoff 01:22:29, hard stop 01:24:29. Production edits finished before 01:22:13; targeted validation completed at 01:22:18 (results inspected at 01:22:27).

The remaining source-level catalog audit is complete. In addition to the six types above, these observations cover all remaining non-road types. Coordinates are drawing regions in native pixels; w/h mean the sprite dimensions. They are not final approved extrusion masks.

| Types | Mass / ground separation required |
| --- | --- |
| apartment, office, edge_dc, med_dc | Main box (1,1,w-2,h-3); retain outer ground margins. |
| midrise | Main box (1,1,w-2,h-4); courtyard and shopfront details need deliberate layer assignment. |
| highrise | Tower (6,2,w-12,h-12), separate plaza apron, crown mast extends above the box. |
| library | Main box (2,3,w-4,h-8), portico/columns, grounded steps and planting. |
| sports_complex | Pool hall (w-17,4,15,18), distinct stands/floodlights; pitch and courts remain ground. |
| museum | Wing (16,2,w-19,h-8), atrium and banners; separate sculpture garden. |
| community_center | Hall with roof overhang and outline (1,2,w-2,h-6); noticeboard/picnic area remains ground. |
| park, plaza | Existing height zero; preserve flat rendering. |
| coal_plant | Hall (1,10,w-2,h-11); separate stacks, coal pile and industrial yard. |
| water_plant | Two basins, control building (2,18,12,12), and connecting pipes; no solid full-lot extrusion. |
| water_reclamation | Three 12x12 basins; membrane hall (4,20,w-8,h-24), pipe gallery and open gaps. |
| hospital, cloud_dc | Main box (1,1,w-2,h-4); hospital roof details stay elevated, cloud fence/gate require ground separation. |
| factory | Main hall (1,8,w-2,h-9), separate stack and loading/service details. |
| auto_factory | Main box (1,3,w-2,h-5), grounded logistics markings. |
| retail | Main box (1,4,w-2,h-6), rooftop sign extends above it. |
| gov_dc | Bunker (5,5,w-10,h-12), gatehouse, two fences and security gap. |
| community_dc | Shed (1,2,w-2,h-4), bikes at the grounded edge. |
| ai_campus | Main slab (1,1,w-2,40), three separate cooling towers and substation in south yard. |

Implemented the first catalog conversion: house. `Sprite.volume` holds cached ground/top layers and an explicit local visual base. The house lawn/path are drawn into the ground layer; its existing outlined building occupies (1,1,14,13). `volumeFor()` uses that inset base, the renderer keeps the ground at the gameplay origin, and roof/emissive coordinates retain the sprite-local offset. Culling includes the ground layer; inactive shading uses the inset top. The original combined albedo is regenerated through the original drawer path for existing thumbnails, construction and other consumers. No new per-frame canvases or gameplay changes.

M68 now checks transparent top-layer yard/path pixels, opaque ground pixels, actual fixed-origin ground draws, and the house's inset anchored facade edges across its existing pan/day/night/zoom cases. Other reference geometry checks remain unchanged.

Validation: `npm run check` passed; `npm test -- m64 m65 m68` passed 3/3 with the existing `PLAYWRIGHT_CHROMIUM` environment override, including production build. `node --check test/suites/m68.mjs` and `git diff --check` passed. The first M68 attempt built successfully and passed pure geometry but failed to launch because the default Playwright browser cache was absent; using the already-installed browser resolved that environment issue. No dependency was installed. Full 21-suite regression and manual screenshot inspection were not run in this budget. Existing npm environment warning only.

Exact continuation: extend cached ground/top separation and explicit visual mass definitions beyond house, starting with a compact single-block type, then handle multi-mass sites. House retains one outlined rectangular mass (including roof overhang); more exact setbacks remain future work. Construction, ghosts, selection/demolition, x-ray, roof effects and legacy parallax consumers still require E2 conversion. The material caches still use gameplay footprint dimensions, scaled onto the narrower house faces; refine per-mass material dimensions as conversion expands. E2 is incomplete; E3 has not started.

## E2 recovery and catalog expansion (2026-10-02, 80%)

Budget: start 21:02:54 UTC, sixteen minutes total, retaining the user's two-minute post-implementation buffer. Implementation cutoff 21:16:54; hard stop 21:18:54.

Workspace maintenance removed the prior checkout. The remote still pointed to `72fa264` (house conversion), so the interrupted September 26 50% turn had not synchronized its work. This turn restored its eight additional types and M69 checks from the recorded edits, then extended the catalog. Previous unsaved test logs were not treated as current validation.

`VISUAL_INSETS` now defines fifteen separated ground/top types. Their front/back materials use visual mass width and their side materials use visual mass depth. The cached original composite sprite remains available to existing consumers; gameplay footprints are unchanged. Ground details include the school field and bike racks, high-rise plaza, museum garden/sculpture, library steps/planters, factory logistics stripe, and community noticeboard/bikes.

| Catalog status | Types |
| --- | --- |
| Ground/top separation and inset projected volume | house, apartment, midrise, highrise, office, retail, school, library, museum, hospital, community_center, auto_factory, edge_dc, med_dc, community_dc |
| E1 projected reference geometry; combined lot art still needs separation | factory, arcology |
| Intentionally flat | park, plaza |
| Elevated conversion remaining | sports_complex, solar_farm, coal_plant, nuclear_plant, water_plant, solar_array, water_reclamation, cloud_dc, gov_dc, ai_campus |

For the six newly converted types (midrise, highrise, retail, school, library, museum), the structural rectangle follows the existing main building box. Roof signs, masts, canopies, shopfront and portico details retain their existing sprite positions. Culling conservatively unions the structural volume, complete translated top canvas, and stationary lot, so attachments outside the structural rectangle cannot disappear early. M69 includes an actual render with only the high-rise mast inside the viewport while the structural top and base are below it.

Validation observed this turn:

- `npm run check`: passed after restoration and after the six-type expansion.
- `npm test -- m64 m65 m68 m69`: 4/4 passed, including production build, on the final production source. M64 explicitly expects the narrower converted compute materials while retaining all lighting/material assertions. M65 still covers all 29 composite atlases.
- Final `node test/suites/m69.mjs` against the running production preview: passed at 21:13:44, including the added mast-only culling case. M69 exercises fifteen types in 240 pan/zoom/day-night render cases, fixed bases, ground/top origins, ground pixels, front/side texture dimensions, actual face transforms, roof and wall emissives/bloom, conservative bounds, and unchanged gameplay state.
- `node --check test/suites/m69.mjs` and `git diff --check`: passed.
- Thirty centered day/night catalog captures were generated, plus the sixteen M68 reference captures. Inspected school and museum in daylight and highrise at night: open grounds remain at the base, walls connect, and roof details/emissives remain attached.

Environment recovery: restored locked dependencies with `npm ci`. Standard Playwright browser downloads returned invalid archives. An isolated `@sparticuz/chromium` runtime was obtained outside the repo; its default extractor encountered an ownership error, so its bundled archives were unpacked locally without restoring archive ownership. Chromium 153 then ran all targeted tests. The first sandboxed preview attempt could not open its server; the authorized local-server execution succeeded. No project dependency or lockfile changed. The existing npm proxy-environment warning remains.

Exact continuation: convert the ten remaining elevated types and separate factory/arcology lot art. These include multiple masses and grounded lights, so extend the layer representation as needed instead of extruding their full occupancy rectangle. All E2 construction/lifecycle/auxiliary parallax consumers remain to be converted; no legacy parallax API was retired. Existing flat sprites remain flat. E2 is incomplete, E3 has not begun. Full all-type lifecycle gallery, physical-device performance, and other browsers remain unverified.

Full-regression limit: `timeout 290 npm test -- --no-build` exited 124 at 21:17:13. Suites M44, M46–M56 completed with zero reported failures; execution was stopped during M57 by the allotted test timeout, which closed its browser. This is an incomplete full run, not a full-suite pass. Resume full regression with enough time, alongside the remaining E2 work. The separately completed targeted suites and final M69 result above remain valid. Production code was complete by 21:09:50; the final test edit was complete by 21:13:29, before cutoff.

## E2 — Cloud DC and grounded emitters (2026-10-02, 45%)

Start 21:28:38 UTC; nine-minute budget, retaining the user's two-minute save buffer. Implementation cutoff 21:35:38; hard stop 21:37:38. Initial local and remote heads both matched `4160087`; the worktree was clean. The prior checkpoint was published after the user explicitly approved project pushes for the remainder of this chat.

Cloud DC is now the sixteenth ground/top-separated volume. Its visual base is `(1,1,w-2,h-4)`. Yard backing, perimeter fence, and gate stay in the ground layer; the hall and original roof details use the projected top. Its front/side materials follow the visual base dimensions. The original composite albedo and emissive remain available to unchanged consumers.

The cached volume layers now include their own roof emissive and an optional ground emissive. Drawers can direct ground lights separately; Cloud DC's green gate light is the first user. World and bloom passes draw it at the fixed lot origin while roof emitters follow the projected top. Empty ground-emissive canvases are discarded after initialization; no canvas or pixel readback is added to the frame loop. Original brightness, compute blinking, inactive gating, and construction gating remain intact.

Validation this turn:

- `npm run check`: passed after production edits and again after the final test extension.
- `npm test -- m64 m65 m68 m69`: 4/4 passed, including `npm run build` on the final production source. M64 retains all existing material/light assertions while adding the Cloud DC inset width.
- Final `node test/suites/m69.mjs`: passed against the production preview after adding inactive/construction light suppression assertions. M69 now covers sixteen types in 256 pan/zoom/day-night cases, exact ground-light/world/bloom coordinates, no lost or duplicated original emissive pixels, and the earlier grounding/face/bounds/state assertions.
- `node --check test/suites/m69.mjs` and `git diff --check`: passed. No lint/formatter is configured; these are the derived syntax/whitespace checks.
- Thirty-two centered catalog screenshots plus sixteen M68 captures were generated. Cloud DC day/night captures were inspected: the fence stays at the ground and roof/face emitters remain attached. This is not a complete lifecycle gallery.

Production edits were complete by 21:32:18; the final test edit was complete by 21:33:59. No dependency or configuration changes. The existing npm proxy-environment warning persists. Source roots and conventions remain `src/render/`, `test/`, `README.md`, and `test/README.md`; the authorized VCS destination remains `astra/parallax-rework`.

Exact continuation: nine elevated types remain unconverted (sports_complex, solar_farm, coal_plant, nuclear_plant, water_plant, solar_array, water_reclamation, gov_dc, ai_campus), plus factory/arcology still need separation of their combined lot art. Introduce multiple visual masses for those sites; the new ground-light layer can carry their grounded emitters. Lifecycle/auxiliary projection, broader occlusion ordering, and legacy API retirement remain outstanding. E2 is incomplete; E3 has not started. Physical devices, other browsers, sustained performance, and a complete full-suite run on this exact commit remain unverified.

Follow-up regression: `timeout 145 npm test -- --no-build m57 m58 m59 m60 m61 m62 m63 m66 m67` completed successfully before 21:35:36. All seven matched suites (M57, M58, M61, M62, M63, M66, M67) passed; there are no separate M59/M60 suite files. This includes the scenario, import, visual fixture, terrain, lighting/buffer, and four-viewport UI checks that were beyond the prior timeout. Combined with the four targeted suites, eleven distinct suites passed on this production source. Earlier suites were not rerun this turn; their prior results remain historical evidence.

## E2 — solar farm multi-mass checkpoint (2026-10-02, 20%)

Start 21:41:04 UTC; four minutes total with the explicitly requested one-minute save buffer. Implementation cutoff 21:44:04; hard stop 21:45:04. Initial local/remote commit was `20288c7`, with a clean worktree. Production and test edits were finished before 21:43:05.

The solar farm is the seventeenth separated type. Sixteen 9x6 panel masses share the existing 3px height and one top translation, each retaining its own anchored four-face geometry. The bounding visual rectangle is (2,2,42,39); it is used for projection/culling, not extruded as a solid wall. Front/side materials use individual panel dimensions. Inactive shading follows the separate panel tops. Mounts, open dirt, inverter, and inverter LED remain grounded. The original composite assets and gameplay footprint remain unchanged.

This is equal-height multi-mass support: differing heights/setbacks still need independent top layers and per-mass material selection. The first mass supplies material dimensions, appropriate to these identical panels; do not use that assumption for heterogeneous structures. Geometry uses existing projectVolume/drawFace helpers, with no per-frame canvas generation. Additional per-panel geometry allocation has not been performance-profiled.

Validation: `npm run check`, `node --check test/suites/m69.mjs`, and `git diff --check` passed. `timeout 48 npm test -- m65 m68 m69` passed 3/3 including production build, observed at 21:43:58. M69 now runs 272 cases across seventeen types and checks all sixteen panel bases, all 64 panel faces, actual material transforms, grounded inverter lighting/bloom, preserved emitters and gameplay state. Existing tests were retained. No full regression, new screenshot inspection, inactive solar shading capture, physical-device check, or sustained performance run fit this budget. Existing npm environment warning only; no dependencies changed.

Continuation: extend the equal-height pattern to solar_array, then handle heterogeneous multi-mass sites. Eight elevated types remain (sports_complex, coal_plant, nuclear_plant, water_plant, solar_array, water_reclamation, gov_dc, ai_campus); factory and arcology still require lot separation. Lifecycle and auxiliary consumers remain outstanding, as does legacy parallax retirement. E2 remains incomplete; E3 has not started. Harness commands, conventions, and authorized branch are unchanged from the preceding checkpoint.
