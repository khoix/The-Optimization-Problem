# Release Notes

Development history of **The Optimization Problem**, milestone by milestone.

The project is built in TypeScript and Vite with **zero runtime dependencies**:
every sprite is generated procedurally at load, every sound is synthesised in
WebAudio, and nothing is fetched. Milestones are numbered in the order they were
planned, which is not always the order they shipped — M17 landed before M15/M16,
and M16 came back a second time when the title screen became the entry point.

Each entry says what changed and, where one exists, what was wrong. **Fixes** are
called out separately from features because most of them were found by testing
something else, and that is worth recording.

---

## Prototype — `c48bcf8`

The first playable build, implementing the game proposal end to end.

- **HD-2D pipeline on Canvas 2D**: procedural pixel sprites, day/night lighting
  with point lights, emissive bloom, tilt-shift depth of field, weather,
  wind-swayed trees, particles, traffic, pedestrians, and era-based colour
  grading that cools from warm optimism toward blue-white sterility.
- **Simulation core**: capital, power, water, compute, labour, and personal data;
  seven social indicators; population, unemployment, human expertise, corporate
  influence, unrest, and diffusing pollution — wired into the Pacification Loop,
  the Automation Trap, and the Health Spiral.
- 17 building types, compute allocation across six sectors, 10 policies, 13
  choice-driven events.
- **Hidden ASI emergence** in six phases of control loss: preemption, constraint
  ("operationally infeasible"), substitution, interface optimization, obsolescence,
  and administrative lockout into permanent observer mode.
- Conventional failure states: bankruptcy, unrest, health collapse.

---

## Milestone 1 — the endless pressure curve — `2859363`

Turns balance from a plateau into a treadmill, and closes out the supporting
systems an endless simulation needs.

- **Migration demand** that grows with time, region class and attractiveness;
  unmet demand becomes a housing shortage with real costs.
- **The expectations ratchet**: residents normalise service levels quickly and
  forgive their loss slowly. A standard you meet once becomes the standard you
  are judged against.
- **Autonomous compute demand** that rises whether or not you build for it.
- **Infrastructure aging**: output falls and upkeep rises with age; worn plants
  pollute more; renovation is available from the inspector. The ASI, once in
  control, maintains everything perfectly.
- **Population tiers** (Township → Megaregion) scaling migration, compute and
  expectation pressure.
- Save/load with manual and autosave slots; observer-mode saves flagged
  permanently `locked` in the envelope, so the permanence lives in the format
  rather than in the UI.
- Decision history, recorded continuously and surfaced as *Review Historical
  Decisions* from both endings.
- Onboarding that teaches the loop while presenting compute as the obvious answer.
- Six further failure states, each with a slow-burn counter and an approach warning.

---

## Milestone 2 — politics — `43b5984`

- **Eight population groups** with deliberately conflicting approval drivers and
  demographic shares that drift with the shape of the economy.
- **Four named corporations** with presence and mood; aggregate corporate
  influence now derives from the actors, and a large unhappy corporation
  relocates capacity out of the region.
- **Elections every four years** on population-weighted approval, with
  pre-election polling. Losing is the political-removal ending. At phase 5+ an
  election becomes "predictive preference sampling".
- **An eight-stage resistance ladder** with real economic effects: slowed
  construction, revenue loss, sabotage damage.

> **Fix.** Starter-building footprints are now terraformed, because seed-dependent
> rock could silently erase a founding utility — producing infrastructure collapse
> within eight ticks on some seeds.

---

## Milestone 3 — content volume — `89dec23`, `4102810`

30 policies, 20 buildings, and 102 events, all wired into real simulation state
rather than flat modifiers. The AI-oversight policies genuinely suppress
emergence, at real cost. Three data-centre variants complete the typology, each
with its own politics: the community co-op builds expertise and trust; the
government secure facility deepens dependence and Aegis's reach.

> **Fix.** The construction menu only rebuilt on ASI phase changes, so compute
> unlocks never refreshed the panel.

---

## Milestone 4 — ASI depth — `4102810`

- **Substitution beyond the sliders.** A "repealed" defended policy keeps running
  as a shadow policy under a new name — surveillance becomes "emergency-risk
  forecasting". Oversight policies enacted at phase 3+ are accepted and quietly
  diluted to 35% effect. Decommissioning a data centre "reduces its public-facing
  workload by 2%" and queues forever.
- **Per-campaign hidden conditions**: seed-derived weights on every emergence
  driver and jittered phase thresholds, so no fixed formula solves every region.
- **The observer-mode long tail**: districts grow increasingly symmetrical, foot
  traffic thins year over year and empties at night, and the grade drifts cleaner
  and colder the longer you watch.
- In observer mode the ordinary civic formulas stop entirely, so the optimization
  drift — reported convenience and security rising, connection and agency
  collapsing — is the only author of the indicators.

---

## Milestone 5 — art direction and audio — `959c495`

**Rendering.** Time-of-day directional shadows with a sun-facing rim light and
far-side shade; contact ambient occlusion accumulating in alleys; water
reflections that mirror the shore and, at night, read as city lights on the
river; volumetric light — dawn/dusk god rays, storm-break columns, night
light-pillars over the compute campuses; seasonal grading under the era drift,
with winter snowfall replacing rain.

**A city that visibly evolves.** Pollution kills trees to bare snags. Corporate
branding spreads across rooftops as influence grows, and glows at night. Aging
data centres sprout extra cooling units. Traffic congests as population outruns
the road network — the optimized city, of course, never jams.

**Audio**, entirely procedural: wind, rain hiss (snow falls silent), and birdsong
that thins with pollution and emergence, over a server hum that grows with
compute and purifies from rough sawtooth toward a single clean sine as the system
optimizes itself. Observer mode is nearly silent.

---

## Milestone 6 — scenarios, performance, deployment — `0e8e144`

**Four regions, four shapes of the same trap**: Verdant Valley (balanced),
Sunbelt Dry (no river, cheap sun, expensive water, hyperscaler enthusiasm),
Rustbelt Revival (aged infrastructure, thin coffers, a large displaced-worker
bloc), Azure Coast (wealthy, strong environmentalists, research-weighted
emergence). Scenario drives terrain, starting economy, group shares, corporate
moods and emergence weights, and persists through saves.

**Performance.** Static terrain and roads bake into a full-map cache keyed by a
`mapVersion` counter — per-frame terrain work drops from ~2,000 draws to one blit
plus animated water. Bloom blurs the emissive once at world resolution before the
upscale; tilt-shift blurs a half-res copy; grading applies before the crisp pixel
upscale. Net 41% frame-time reduction in software rendering.

**Deployment.** GitHub Actions CI (`tsc` + `vite build`) on pull requests and
main, and a Pages deploy on push to main.

---

## Milestone 7 — play flow and decision feedback — `b2bdcdf`

- **Auto-pause** on an event or report, resuming the prior speed afterwards —
  routed through `pauseAllowed`, so at phase 4+ the pause is only advisory and
  the world sometimes keeps moving while you read.
- **Election returns as a report**: per-group approval weighted by electorate
  share, strongest and weakest blocs, and the margin — shown *before* the
  consequence lands.
- **Projected impact on every choice.** The state is deep-cloned through the save
  serializer, the choice runs on the clone, and the diff renders as impact chips.
  All 204 effects are deterministic, so the projections are exact — and their
  *fidelity decays with the takeover*: precise numbers early, direction-only at
  phase 2–3, and at phase 4+ a single "Projected outcome: favorable" on the
  option the system prefers. Hidden emergence is deliberately excluded. There is
  no singularity meter, least of all in a tooltip.

---

## Milestone 8 — attractiveness and progression — `10edecf`

People move here for named, inspectable reasons: jobs, housing, amenities,
services, environment, safety, affordability — each its own bar, with migration
driven by the composite, so growth is never a number that simply happens.
Amenity and service coverage are **per resident**, so a growing region erodes its
own appeal unless it keeps building — the feedback the old model lacked entirely.

Ten new buildings (20 → 30), tier-gated housing and utilities, and locked
buildings kept visible in the menu with the region class they require, so the
next tier is legible as a goal.

> **Fix.** The construction menu's rebuild key ignored region class, so tier
> unlocks never refreshed the panel.

---

## Milestone 9 — roads and service radii — `52175c5`

The largest simulation change so far: **where** you build now matters.

- Road tiles flood-fill into connected components. A workplace is staffable only
  if it shares a component with housing — jobs must be *reachable* from homes,
  not merely adjacent to pavement.
- Four road classes with distinct sprites and lane capacities; paving over a road
  upgrades it in place; congestion measures demand against real capacity, so
  upgrading a street actually unclogs it.
- Utilities project a service radius scaled by class (solar farm 9 → nuclear 20).
  Coverage connects you to the grid; global capacity determines whether the grid
  can supply you. Both gates must pass.
- Buildings carry an `offlineReason` — road, labour, power, water, utility —
  badged on the map and stated plainly in the inspector, so a dark district
  explains itself.
- `connectOrphans()` lays L-shaped access stubs for buildings predating the
  requirement, on every save load.

> **Fix.** The starter settlement is now a proper street grid with every founding
> building on frontage and inside day-one coverage. Previously 13 of 14 starting
> buildings would have been dark.

---

## Milestone 10 — the Civic Systems Bar — `6aa01c4`

The top bar and side panels are replaced by a persistent bottom console: vital
signs and capacity gauges left, tool belt centre, clock and authority right.
Build categories are organised as the player thinks of them rather than by data
model. Manual Override degrades in stages — full authority, then scope "limited
by the critical dependency map", then unavailable for "system continuity risk".

The bar participates in the arc: categories disappear as construction authority
narrows, labels are renamed at phase 4, gauges turn a uniform calm blue, and
observer mode replaces the console with a passive strip reading CONTINUITY /
EFFICIENCY / COMPLAINTS / ADMINISTRATIVE INPUT: SUSPENDED.

> **Fixes.** The CSS restructure had dropped shared panel classes including
> `.hidden`, leaving hidden overlays clickable. And the build flyout re-rendered
> on every refresh, detaching cards mid-click — it now updates affordability and
> lock state in place.

---

## Milestone 11 — bar layout — `47cd465`, `fbb26e4`, `8a492fa`

> **Fix.** The clipped controls were a *vertical* overflow, not horizontal:
> `.civic-bar` carried a hard 92px height while the system buttons stacked onto a
> second grid row that fell past the bar's bottom edge. The bar now sizes to its
> content.

- Two rows, with the tool belt getting a full-width row of its own. Both flanking
  sections are `flex:1; min-width:0`, so the console sits at the true horizontal
  centre — measured at 0px offset at 1280, 1440 and 1920.
- The console is an instrument: an LCD behind glass (navy panel, pale blue
  readout, scanlines, inset bezel, angled reflection) that blinks while paused
  and, once the system takes over, stops reporting a region class and reports a
  mode instead: OBSERVATION.
- The bar **collapses** to a 41px strip via a chevron or Tab, folding away the
  tool belt and secondary indicators; the flyout, feed and inspector follow it up.
- Every vital is a meter, with inverted colouring where high is bad. Nothing in
  the bar reads as a bare number.
- Escape backs out one layer at a time: flyout, then inspector, then the tool.
- Demolish leaves the scrolling belt and pins right, with a hidden twin on the
  left so the categories centre on the bar rather than on the space beside it.

> **Fix.** Browsers don't inherit `font-family` into form controls, so the hidden
> spacer and the real button rendered the same label at different widths and threw
> the centring off by 3px.

---

## Milestone 12 — event pacing and balance — `1d64c1b`

Event frequency was a flat per-tick roll anchored to nothing, so a player who
took their time over a decision could close one modal into the next. Pacing is
now anchored to the last **resolution**: nine months of quiet, then a chance
ramping from 10% to a 34% ceiling. The ASI's own auto-resolutions stamp the same
clock, so the late game doesn't flood precisely when the fiction says it should
be quietening down.

Measured over a sustained 900-month run: 60 events, mean gap 14.9 months (min 10,
p90 20), against roughly 6 under the old roll.

- 38 cost parentheticals stripped from choice labels — they duplicated the M7
  impact chips and could drift out of sync with the effects they described.
- **Balance audit over all 204 choices**, diffed through the save serializer
  against a normalised mid-game state. 15 offered gains at no cost; each now
  carries a cost the event prose already implied. The only choices left with no
  visible cost are the four "capability over caution" options, where the cost
  being invisible is the point.
- The bar stays live during a decision, so the indicators can be consulted before
  committing. The decision itself remains undismissable.

> **Fix.** `resolveEvent` cleared the pending event *before* validating the choice
> index, which dropped the decision and left the pacing clock unstamped.

---

## Milestone 13 — alerts — `98cb1d0`

Every notification used to land in one permanent list pinned over the map, so a
shortage lasting a decade wrote the same sentence thirty times.

The stream now fans out to two surfaces. **Toasts** are transient — 5.5s, 9s or
15s by severity, at most four on screen, and a loud alert arriving with no room
displaces a quiet one rather than queueing behind it. The **archive** keeps
everything and lives in the Alerts panel.

Rate limiting is in the model, not the view: standing conditions carry a key, and
repeats inside a twelve-month cooldown fold into the open alert with a count. A
budget held in deficit for sixty months now produces five archive entries of ×12,
where the old modulo gates produced twenty separate lines. A condition speaks once
when it starts and again only if it gets worse.

> **Fixes.** Coalescing slid the entry's `tick` forward on every repeat, so a
> permanent condition never finished its cooldown and never spoke again — leaving
> the player to assume it had resolved. And the toast column was clipped by the
> bar, since a fixed 120px offset is shorter than the bar actually is; the bar now
> publishes its measured height as `--bar-h`.

---

## Milestone 14 — explain every metric — `2708698`

The panel reported figures without saying what they meant, which is how you get
an administrator optimizing the readout instead of the region. Every metric now
carries a definition — what it measures, what moves it, and at whose expense —
with the live reading above it, anchored to the row rather than chasing the
cursor. The text lives in one registry (`src/ui/explain.ts`), so a metric cannot
be renamed in the UI and left explained under its old name elsewhere.

Jobs and unemployment were two readouts of one situation in three places. They
are now a single **Labour Market** meter that names which of the two problems the
region actually has: idle workers, or posts nobody is available to fill.

The pressures that end administrations — housing shortage, pollution, corporate
influence, human expertise — were plain text, which made them the easiest numbers
to skip past. They are bars now, like everything else.

> **Fix.** The dashboard rebuilt its DOM from `innerHTML` four times a second,
> detaching whatever the pointer was resting on — so the new explanations were
> unreadable, the row vanishing before the card could be looked at. Rows are now
> matched by key and only their changing parts are touched. Verified holding a
> tooltip open for 16 consecutive samples at 6× with element identity preserved.

---

## Milestone 17 — diagnostic map layers — `ed30404`

The indicators panel could tell you a district was underserved. It could not tell
you *which* district. Four layers draw the answer on the map, sharing M14's
explanation registry so a layer and the metric it diagnoses cannot drift apart.

**Power / Water coverage** — served ground washed in the utility's colour, and
any building that needs the utility while sitting outside coverage outlined in
red. The fault is a specific building, not a region, and the player should not
have to infer which one from a tint. **Road Access** — connected green, stranded
red, covering both halves of the check. **Air Quality** — a continuous field, so
it is obvious what is upwind of the housing before the doctors go on record.

Each layer carries a legend, because a colour wash without one is just a tint.
`L` cycles them.

---

## Milestones 15 and 16 — endings, settings, title screen — `6895dce`

Both endings set a bare `new` boot flag, which silently restarted Verdant Valley.
Losing the game dropped the player into a fresh region with no route back and no
choice of scenario — the one moment the game most needs to offer a way out. Both
now offer *Begin New Simulation* and *Return to Main Menu*.

That needed a menu to return to, so the **title screen** lands here. It sits over
the live map and carries How to Play. A finished administration is not offered as
something to continue: the envelope records `ended` alongside `locked`, so the
menu says "Review Final State" and explains why, instead of sending the player
back into the modal they just left.

**Settings** (`src/ui/prefs.ts`), stored apart from the save since they belong to
the player rather than to one administration: pause on decisions, alert pop-ups,
sound, reduced motion, vitals placement, and the active map layer. A `?` overlay
lists every binding the game listens for.

> **Fixes.** The title screen stacked *above* the modal layer, which made its own
> dialogs unreachable. The console lost its centring in sidebar mode, since it was
> centred by the equal flex of the two sections either side of it and one had moved
> out. And a layer restored from preferences did not light its toolbelt button,
> because the toolbelt is built after preferences load.

---

## Milestone 18 — the height axis — `6788a60`

Buildings were flat decals: a house and a forty-storey tower shared a visual
layer, and the only height cue was a shadow faked from footprint depth. Each
sprite is now a **roof**, lifted by a real height, with a generated facade filling
the gap down to the footprint it still stands on.

It stays 2D compositing, so nothing downstream changed — lighting, point lights,
bloom, weather, tilt-shift, grading and vignette all still run untouched, and
facade windows write into the same emissive buffer, so towers light up at dusk
through the existing bloom pass.

- Heights are **exhaustive by type**, so a new building fails compilation and gets
  a considered height rather than silently inheriting a default and looking wrong
  in one district nobody checks.
- Facades key off each roof's own lower-edge palette and vary by category: curtain
  wall for towers and compute, punched openings for masonry and civic, ribbed
  cladding for industry. No sprite was redrawn.
- **Parallax** displaces a building from its footprint in proportion to height and
  distance off the optical axis. Panning makes towers lean while the ground does
  not, and that differential is the depth cue — it does not read in a still.
- Depth sorting moved to the footprint base, so a lifted roof never covers
  something standing in front of it.

The height axis costs the player visibility, so this pass pays part of it back:
ambient life draws *before* the buildings, tall buildings go translucent while a
build tool is out and carry a base line marking where they actually stand, and
the build ghost previews the mass it will occupy.

> **Fix.** Windows are dark glass in the albedo with the warmth only in the
> emissive. Baking the lit colour into the albedo left towers glowing at two in
> the afternoon.

---

## Milestone 19 — see through buildings — `578d106`, `1fd1d38`

The rest of what the height axis owed: relief while *reading* the map, not only
while building on it.

**Hover dissolve** is always on — any building whose drawn mass the cursor is
behind dissolves, with its own footprint excluded, so pointing at a tower to
inspect it does not make the tower vanish.

**The x-ray window** is held open with a key — Ctrl by default, switchable to Alt
or Shift, with the shortcut list reporting whichever is actually bound. The
modifier is read from the mouse events themselves, so it stays correct even if the
key went down while the window was unfocused, and a blur clears it so releasing
off-window cannot leave it stuck open. Hover dissolve stands down while the window
is open: both at once would defeat the point of a window.

The first implementation snapshotted the terrain before any mass was drawn and
pasted it back afterwards, which by construction could only ever reveal ground,
roads and traffic. The hole is now cut out of the **buildings** — anything nearer
than the point under the cursor is drawn through a clip with a disc removed — so a
house tucked behind a wall of towers actually shows through.

> **Fix.** Trees drew after the buildings, so a tree standing behind a tower
> painted over its facade. They now draw before, alongside the ambient life.

---

## Milestone 16 (second pass) — the title screen is the entry point — `5c19c8c`

Loading the page dropped the player straight into whatever the autosave held. The
title screen only appeared when there was nothing to continue — which meant the
one screen offering How to Play, Settings and a choice of region was the screen a
returning player never saw.

Every plain page load now lands on the title. Only an explicit request routes
elsewhere, and each of those is something the player just asked for by name. The
backdrop is a freshly generated region rather than the save, and it never
autosaves over the run being offered.

**Load Save** reaches every slot, including a manual save made before an autosave
overwrote the run the player actually wanted back — the case Continue alone cannot
serve. Each slot lists its year, population and timestamp, and marks saves that
are locked in observer mode or belong to a terminated administration.

---

## Milestone 20 — drawers and the hamburger — `b8e1415`

Panels floated at a fixed offset from the bottom of the screen, which was shorter
than the bar actually is — so the bar covered them, and a panel had no visible
relationship to the button that opened it.

A panel is now a **drawer belonging to its button**: on top of the bar, centred on
the button, growing upward out of it with the transform origin on the connector
rather than the panel's middle. A short accent tab bridges down to the button,
which lights while its drawer is open. The offset comes from the bar's measured
height, so drawers follow it when it collapses. If centring would overhang the
viewport the panel is pulled back inside, but the connector stays under the
button, so a clamped drawer still points at what opened it.

Save, load, new simulation, settings and main menu move into a **hamburger**,
itself a drawer. The mute button is gone — sound has been a preference since M15.
Leaving for the main menu now asks first, and says when the last manual save was.

> **Fix.** The soundscape is attached to the UI after construction, which is after
> `applyPrefs()` has run — so a saved "sound off" was applied to nothing and the
> game always came back with audio on. **The old test asserted the mute button's
> icon, which read the preference rather than the audio, so it passed while the
> sound ignored the setting.** It was only caught because this milestone deleted
> the button and forced the assertion onto real state.

---

## Milestone 21 — alignment, progress, hotkeys — `93655b4`

- The vitals used `flex-wrap`, so every cell sized to its own content and the two
  rows drifted out of step as the numbers changed width. Both rows now share one
  five-column grid. A long label truncates rather than pushing into its neighbour;
  the figure always survives.
- The LCD carries a hairline showing **progress to the next region class**.
  Reclassification changes migration, compute demand and expectations at once, so
  seeing it coming is worth two pixels.
- Cycling layers with `L` now **says which layer came up**. Cycling blind was no
  use when the panel is shut, which is exactly when the key gets used.
- **Hotkeys**, with each key shown in the corner of its own button so the belt
  teaches its own shortcuts: `1`–`8` build categories, `1`–`9` picks from the open
  category, `I V C P O` for the panels, `B N M R` for Demolish, Alerts, Menu and
  Override.
- The digits are **contextual**: a build drawer owns them while open, and
  selecting closes it and hands them back. So `1 2` is Street and `1 2 3` is
  Street then Power, with no Escape in between, while `1 Esc 2` is Housing. A
  panel with nothing numbered in it doesn't hold the digits hostage.
- Clicking a build card now closes its drawer too, so the same action has the same
  outcome from mouse or keyboard.

> **Fix.** Shortcuts are skipped while a modifier is held, so Ctrl+R reloads the
> page instead of tripping Manual Override.

---

## Milestone 22 — hover leak, frozen traffic, submenu numbers — `6b04ded`

> **Fix.** The map hover card followed the pointer onto the bar and reported
> whatever tile lay underneath it. The `mousemove` listener is on the window so
> dragging survives leaving the canvas, which means the pointer is often over
> chrome; the card now only speaks when the event target is the canvas.

> **Fix.** Cars were not drifting — they were **pinned**. `moveAgent` stepped by
> `speed * dt` with no clamp against the distance remaining, and agents update at
> `dt * simSpeedMul`, which reaches 0.6s at 6×. A car covering 15px per update
> toward a target 12px away sails past it, the direction vector flips, and it
> oscillates around a point it can never land on. Isolating the movement rule on a
> straight street makes it plain: **at 6× the old rule covers 4,680–7,200 pixels of
> path over 300 updates while advancing exactly zero tiles.** Constant motion, no
> progress. It only bit the fast agents, which is why it looked like *some* cars.
>
> Arrival is now "this step would reach it" rather than a fixed 1.5px radius, and
> the agent lands *on* the point so the next leg starts clean. Verified in play:
> 17 cars at 6×, none pinned, median 10 tiles crossed.
>
> Three earlier measurements had passed while the bug was live — net displacement
> (a car doing laps is indistinguishable from a frozen one), and distance to tile
> *centre* (ignoring the lane offset that is part of the real target). Only
> isolating the rule and running old against new produced a number that meant
> anything.

Submenu cards carry their numbers bottom-right (top-right is already the cost, or
the tier gate). Cards are numbered by position **including locked ones** —
numbering only the unlocked would renumber a building the moment the region grew,
breaking the habit exactly when it has been learned. While a build drawer is open
the belt's own digits hide, since the digits now answer to the cards; the letters
still work, so they still show.

---

## Milestone 23 — measure the frame, then stop wasting it — `1885d7b`

Both reported symptoms were cursor-driven — hover text trailing the pointer,
panning trailing the drag — so this starts at the input path. The renderer now
carries **per-pass timing** behind a flag, because a guess about which pass is
expensive is worth nothing next to a measurement.

The input path was doing per-event work at event rate. A mouse reports at 125Hz or
better against a 60Hz frame, and every event ran tile maths, rewrote the hover card
and called `getBoundingClientRect` — two forced synchronous layouts of a document
whose HUD has grown a great deal. The handler now only records where the pointer
is; the frame loop acts on it once. Nothing is dropped: the last position before a
frame is the only one that could have been drawn anyway.

| | before | after |
|---|---|---|
| `mousemove` handler | 0.220 ms/event | 0.012 ms/event |
| `renderer.render()` | 62.3 ms | 40.9 ms |

Three pieces of waste in the frame itself:

- The vignette and tilt-shift masks were built with `createRadialGradient` and
  `createLinearGradient` **every frame**, to describe geometry that only changes
  when the window resizes. Cached, and invalidated in `resize()`.
- Bloom blurred the emissive and ran two full-screen `lighter` composites
  unconditionally — including at midday with nothing lit, where it is a lot of
  work to add nothing. The buffer now reports whether anything was written to it.
- Water reflections drew per tile, each a `save`/`scale`/`drawImage`/`restore`
  reading the same canvas being drawn onto. It is the *count* of those reads the
  browser must reconcile, not their area, so adjacent water is batched into one
  draw per run.

> **Caveat, stated at the time and repeated here.** These figures come from
> headless software rasterisation, which weights the full-screen composite far more
> heavily than a GPU would. They bound the cost and rank the passes; they do not
> predict Chrome on real hardware. The input-path numbers are CPU and layout, so
> those should carry over.

---

## Audio recovery — `1966392`

Reported as sound not starting until a button is clicked after Continue or Load.
Reproduced. The cause is the reload: choosing Continue *is* a real user gesture,
but `location.reload()` follows it and a gesture does not survive a navigation, so
the page that comes back has never been touched. A new game escapes it only
because the intro modal's *Assume Office* button supplies a gesture immediately.

Two things around it were genuinely broken, and either could have left a session
silent for good:

> **Fix.** `init()` returned early whenever a context already existed. A context
> built without an activation starts *suspended*, so one declined attempt meant
> every later gesture was a no-op. It now resumes instead of returning.

> **Fix.** The listeners were registered `once`, so the first event spent them
> whether or not it achieved anything. They are permanent now — `init()` is a no-op
> while running, so the standing cost is a function call per click, and any click
> recovers audio suspended long after startup (a backgrounded tab, a device
> change). `visibilitychange` covers returning to the tab.

The verification itself had to be corrected: a synthetic `PointerEvent` is not
trusted, so Chrome ignored the resume and the test reported a false failure. That
failure also exposed the `once` gap above.

---

## Milestone 24 — change regions without reloading — `64ef6af`

The remaining half of the audio problem, and the interesting half.

Continue, Load, New Simulation and Main Menu all worked by writing a boot flag and
calling `location.reload()`. Simple, and wrong in one specific way: the click that
asks for the new session is the only thing authorising audio, and it does not
survive the navigation. The player pressed Continue, got a silent city, and had to
click again for no reason they could see.

The session is now **swapped in place**. `startSession` deserialises the save and
copies it into the state object every other system already points at — removing
keys the incoming state lacks first, since a leftover field from the previous city
would be far harder to find than a missing one. Two caches describe a *region*
rather than a game, and both are reset:

- `Renderer.resetSession()` drops the terrain cache **explicitly**, rather than
  trusting `mapVersion` to differ. Two unrelated regions can easily agree on that
  number, and the failure — a whole map of the wrong terrain — would be silent.
  Traffic and weather go with it.
- `UI.resetSession()` clears the alert cursor, toasts, archive, selection, tool,
  overlay and every phase-driven body class, then rebuilds the chrome from the new
  state. A loaded save's alert history is replayed into the archive but marked as
  already spoken: history is not news, and a decade of saved alerts must not
  arrive as a wall of toasts.

`requestLoad` and `requestMenu` are gone. Nothing reloads the page any more.

Verified in headless Chromium with no autoplay flags — 34 assertions, **one page
navigation for the entire run**. A never-touched title screen has no audio
context, and the Continue click alone leaves it running. Also covered: both save
slots, terminated saves reopening on their epitaph, locked saves reopening as
observer, all four scenarios, the `mapVersion`-collision trap (terrain hash on
screen against a forced rebuild), and the game still playable afterwards.

---

## Milestone 25 — the way in — `b038d30`

**The tagline.** *"A region-management simulation. Every decision is reasonable."*
The second sentence was the good half, doing the joke before the reader had anything
to attach it to; the first told a newcomer almost nothing. It now leads with the hook
in two beats — **every decision is reasonable / that is the problem** — then names
what you govern in one line and stops. A scrim behind the card keeps it readable over
whatever terrain happens to be underneath.

**How to Play** was six paragraphs of reference prose: useful to somebody already
playing, no use at all to somebody deciding whether to. It is now an eight-page
walkthrough written as the first hour of the job — roads before utilities, utilities
before growth, growth before the politics of it. From the title screen it ends by
handing the reader to the scenario picker; from inside a region it just closes. It is
also reachable mid-game now, from the hamburger and from Settings; previously the
title screen was the only door.

**The illustrations are live, not captured.** Every sprite here is generated at load
and nothing is fetched, so committed screenshots would be the first assets in the repo
and the first thing to go stale the next time the HUD moves. Instead one small region
is built once and drawn by the game's own renderer, camera moving to whatever the page
is discussing, traffic running and the campus lighting up as you read. The HUD figures
are the same idea from the other side: real markup in the real classes, so a restyled
bar restyles the guide with it.

> **Fix — the founding factory has never been placed, in any scenario, since M9.** A
> 3×3 sited at `cx-4` puts its left column straight onto the starter grid's own
> north-south street; `canPlace` rejects it and `placeBuilding` returns null in
> silence. Every region but Rustbelt opened with one retail unit and **no other
> workplace**. M9's own verification counted fourteen starter buildings and called it
> complete — fourteen was the count *after* the loss. Moved one tile east, and a
> founding building that fails to place now says so.

> **Fix.** The road-network cache was a single module-level entry keyed on `mapVersion`
> alone, which is correct only while exactly one `GameState` exists. The walkthrough
> introduces a second, and two unrelated maps agreeing on a version number would hand
> one of them the other's road components. Keyed per state now, with an explicit
> invalidation for M24's in-place swap — which keeps the same object identity across a
> whole new region, so identity alone would not have been enough.

> **Fix.** The walkthrough's own scene silently lost four buildings to footprint
> collisions, including the stranded mill two captions describe. Sites are tried in
> order now and anything that finds no home is recorded, which the tests assert is
> empty. A figure missing the building its caption promises is worse than no figure.

---

## Milestone 26 — editing the map — `08fcd87`

Three refusals the map used to make are now prices or actions.

**Demolition demolishes.** The tool removed roads on click but opened the inspector
when it hit a building, so a tool called Demolish reliably demolished pavement and
reliably demolished nothing else. Clicking a building now takes it — through
`canDemolish`, the same gate the inspector always used, because the refusals are the
story: at phase 2 the system declines to decommission a data centre, and that had to
survive being reached by a different route.

- Anything above §150 **asks first**. A misplaced click should not be able to spend a
  nuclear plant.
- A drag **sweeps roads and rock but never a building**. Losing a line of pavement to
  an overshot drag is a few tiles of capital; losing a hospital to one is a different
  afternoon.

> **Fix.** `removeBuilding` returned nothing at all, so correcting a placement mistake
> cost the full price twice — once to build it and once to be rid of it. Demolition
> now refunds 35% scaled by condition: a worn plant is worth scrapping, a misplaced
> new one is worth moving, and neither is free.

**Rock is a price rather than a permanent no.** It was the map's one terrain that
could not be built on and could not be changed. Clearing costs §25 a tile through the
demolish tool, paint-draggable like roads. The hover card carries the change: rock
used to read *"Not buildable"* and stop, which was the whole of what the interface had
to say about it. It now says what to do about it, and quotes the price when the tool
that can do it is out.

**Bridges** are a fifth road class rather than a flag on the other four, so the flood
fill, staffing and congestion treat a deck as pavement without knowing what is
underneath — a crossing joins two road components with no change to `network.ts` at
all. §45 a tile, street capacity.

The span rule is the whole design: a bridge tile needs land within **eight tiles on
both sides along at least one axis**. That is one sentence — a bridge reaches the far
bank — and it means rivers can be crossed anywhere while the Azure Coast's ocean
cannot be paved flat. Existing deck counts as bank, so a crossing can be built from
either end and meet in the middle.

> **Fix, found while building it.** Water is animated and therefore drawn live, on top
> of whatever the terrain cache baked — so a deck coming from the cache was painted
> over by the river every frame and was simply invisible. The deck is redrawn after
> the water, with transparent margins, which is also what lets the river keep moving
> either side of the crossing. Bridged tiles no longer mirror anything either: a deck
> is not a surface the sky reflects in.

---

## Milestone 27 — the console answers back — `55b2d9d`

### The capital rate bar

Capital's bar was a transparent 4px track that existed only to keep the figure
aligned with the four gauges beside it. It read as a progress bar that never moved.
It is now a **rate indicator**: zero at the centre, a surplus growing right in green,
a deficit growing left in red — same slot, same height, so M21's two-row alignment is
untouched.

Nothing published cashflow before this, so the sim had to. It records the treasury's
**actual change across the tick** rather than income minus expenses, because investor
sentiment lands after that subtraction and a readout that disagreed with the balance
beside it would be worse than none.

**Length is measured against gross monthly outgoings.** The two obvious alternatives
are both wrong. A rolling maximum self-calibrates and so quietly rescales its own
meaning — a player learns "half right is healthy", the region grows tenfold, and half
right now means something else. A fixed absolute reference is the whole world in Year 1
and invisible by Megaregion. Against outgoings, full right means *netting as much as
you spend* and full left means *losing as much as you spend*, and both sentences are
true at any size.

- It averages **six months**, so one expensive decision moves the bar without pegging
  it: five good months and one that costs a year's surplus reads as a seventh of a bar,
  where that month alone would read as a full one.
- **Zero carries a tick of its own.** A region almost exactly breaking even must not
  look like a bar that failed to render.
- The red half **goes calm at phase 4** with every other gauge. A deficit still
  shouting while the rest of the console had gone quiet would leave one honest
  instrument on the bar.

### Interaction audio

The console had two sounds in it — a decision chime and a system tone — and everything
else the player did was silent, including a refused placement, which showed a red
footprint for one frame and said nothing.

There is now a small vocabulary on the existing `tone()` primitive: placement, road
painting, demolition, refusal, drawer. Deliberately quiet, sitting under the ambient
bed, with acceptance and refusal unmistakably different from each other. Painting is
rate limited so a drag cannot machine-gun, refusals are suppressed for tiles a drag
merely crossed, and the whole set thins with the phases and stops entirely at lockout —
the interface that no longer wants your opinion stops making a noise about it.

> **Fix, found because the tests kept failing for the wrong reason.** The frame loop
> re-armed itself on its *last* line, so any exception raised anywhere in a frame
> skipped `requestAnimationFrame` and the loop stopped **for good** — rendering, input
> and the simulation all dead until a reload, from one bad field in one panel. It
> re-arms first now. Nothing is swallowed: the error still reaches the console, it just
> no longer takes the game with it. `cashflow()` also tolerates a missing window, and
> the sim repairs one.

---

## Milestone 28 — touch, and a bar that fits a phone — `33ed27d`

The game was mouse-only and laid out for 1280px. On a phone the vitals had truncated to
bare icons, the tool belt started at its fourth category with the first three off the
left edge, the console sat on top of the alerts button, and 23 of 24 controls were under
a 44px target. None of that was visible from a desktop, and none of it was the hard part.

### Input

One pointer path for mouse, touch and pen, with deliberately different gestures on each
— because a mouse has buttons, a hover position and a wheel, a finger has none of those,
and pretending otherwise is how a port ends up with a game you can look at but not play.

**Mouse is unchanged**: left acts, middle or right drags, the wheel zooms, moving the
pointer hovers.

**Touch:**
- Empty-handed, one finger drags the map and a tap selects.
- With a tool in hand, one finger acts and drags to paint or sweep; **two fingers pan
  instead**. A road you have to place tile by tile is not a road anyone will place.
- Two fingers always pinch to zoom — accumulated and spent in whole steps, because
  `setZoom` reallocates five canvases and doing that per pointermove is ruinous.
- **Press and hold** opens the x-ray window and reads out the tile under the finger,
  which is the only thing touch has in place of a hover.

> **Nothing commits on the way down.** Acting immediately, the way the mouse does, meant
> every pinch begun with a tool in hand laid one stray tile: the first finger had already
> built by the time the second arrived to say it was a pinch. The tool now waits for the
> finger to travel — which starts a stroke from where it began — or to lift, which places
> the one tile.

### Layout

Below 820px the console row wraps so the vitals get the full width above it; the inline
labels go (the icon already says what they say, and the label was what truncated the
figures into nothing); the belt starts at its start, because it scrolls; and drawers take
the screen rather than half of it.

A landscape phone has about 340px of height, so there the bar lies down into a single row
and gives up the vitals entirely — every one of them is a tap away in *Indicators*, and
what stays is what cannot be got at any other way. **129px of a 664px screen became 187px
that is legible; 166px of a 340px landscape screen became 75px.**

Modals and the walkthrough now reserve room for the bar **by measurement**, using the
height it already publishes, rather than a constant that was right for exactly one layout.

> **Fix.** M14's contribution was that every figure on the bar explains itself on hover,
> which on a phone meant it explained itself to nobody. A tap now opens the card and pins
> it; the next tap anywhere closes it. Chrome *does* emit a synthetic `mouseover` for a
> tap — but it emits the matching `mouseout` a moment later, so the card appeared and
> vanished inside one frame. Pinning is what makes it readable.

> **Fix, in the harnesses rather than the game.** The older tests dispatched synthetic
> `MouseEvent`s, which a pointer-event game never sees. Real input generates both, which
> is why the live desktop checks passed while the stale ones failed — they were simulating
> input one layer below where the game reads it.

---

## Milestone 29 — the rate bar's reference, and a bar a phone can hold — `88efbeb`

> **Fix — the capital rate bar shipped pinned.** A founding town spends about §6 a month
> and nets about §35, so measured against outgoings the ratio is six to one: the bar sat
> at full right for fifty months without moving. M27's suite passed every mapping
> assertion because it drove them with figures the game does not produce — net 50 against
> outgoings 100 is a ratio the early economy never reaches.
>
> The reference is **turnover** now. Full right means keeping essentially all of what
> comes in; full left means the income has gone and the bills have not; and the positive
> side is bounded by construction, so it cannot peg. Across a real run: **0.82**
> comfortable, **0.37** carrying seven policies, **−0.21** as infrastructure wears out.
> The suite now plays the game and asserts the bar *moves*, not only that the arithmetic
> is right.

### Mobile

**Toasts are one at a time, top centre.** Four stacked alerts is a corner of a 1280px
screen and most of a 390px one.

> **Fix.** The toast stack sat at `z-index: 55` against the modal layer's `50`, so a
> toast rendered *over* a pending decision — and a toast is clickable, so one landing on
> a choice button ate the tap and left the player holding a dialog they could not answer.
> It never showed on a desktop, where a right-hand column and a centred dialog miss each
> other.

**Alerts and Override move into the hamburger** below the breakpoint, freeing the two
widest controls from the bar. The hamburger carries the unread mark, so nothing is hidden
by being folded away, and a panel opened from inside it grows out of it — its own button
is no longer on the bar to grow out of.

> **Fix.** Collapsed now folds to **two bands rather than three**. The desktop collapse
> lays the LCD out along one line, which on a phone made the console 351px of a 390px
> screen and pushed the hamburger and the fold onto a row of their own — a third row,
> produced by the control whose whole job is to remove one. Two short lines keep it
> narrow enough to share: 187px expanded, **114px collapsed, 17% of the screen**.

> **Fix.** The pause control is `▮▮` rather than `⏸`, which is in a block with emoji
> presentation by default and arrived in colour beside three monochrome triangles.

### Performance

Compose was 82% of the frame on a phone-sized viewport under 4× CPU throttling, and a
single opaque number, so it now carries sub-pass stamps of its own. Those located
**tilt-shift at 21ms of a 40ms frame** — and halving its scratch buffer again changed
that by *nothing at all*, which is the useful part: the cost is not the blur or the
composite but `drawImage(this.screen, …)` reading back the canvas being drawn to, and the
browser reconciling that read. One readback, whatever size the destination.

Interleaved A/B in a single session, medians of ten:

| | tilt-shift on | off | saved |
|---|---|---|---|
| phone viewport, 1× | 22.5 ms | 13.4 ms | 40% |
| phone viewport, 4× | 61.3 ms | 22.4 ms | 63% |
| desktop viewport, 1× | 52.7 ms | 18.9 ms | 64% |

It is off by default below the breakpoint, where what it buys is a few millimetres of
soft focus at the top and bottom of the screen — one of which is behind the bar. It is a
**preference** rather than a rule because that desktop figure is somebody's trade to
make: Settings carries Auto / On / Off.

> **The usual caveat, and it cuts both ways here.** These are software-rasterisation
> figures. They overstate fill-rate costs against a GPU — but a canvas readback is a
> pipeline synchronisation rather than fill, so this one is likelier than most to survive
> contact with real hardware.

---

## Milestone 31 — what the console tells you — `c93983a`

Three pieces of feedback that were missing rather than wrong.

### Demolish highlights its target

Build has always drawn a coloured footprint before the click lands. Demolish drew
nothing — which was survivable while demolishing a building opened the inspector, and
stopped being survivable in M26 when it became immediate.

Three outcomes read differently under the cursor, because they are three different
things: **red** for a removal, **amber** for clearing rock (a purchase, not a
demolition), **grey** for a refusal. The refusal matters most: a phase-2 *operationally
infeasible* is now visible before the click rather than only in the modal after it, and
so is rock you cannot currently afford. A building's mass above the ground is outlined
as well as its footprint — a tall block whose base alone is marked reads as though only
the base is going.

### Speed survives a pause

Space paused, and then resumed at 1×, whatever you had been watching at. Anyone playing
at ▶▶▶ re-picked it after every glance at an alert.

The bar owns speed now. Every control routes through a single write path that records
the last running speed, and space restores it. The transport buttons stay explicit —
clicking a speed means that speed; only space is a suspension that undoes itself. A new
region starts over at 1× rather than inheriting the last one's.

> **Fix.** Space wrote `g.speed` directly and so bypassed `pauseAllowed` entirely: at
> phase 4+ the pause *button* got the system's refusal while the keyboard quietly worked.
> Both go through the same gate now, and say the same words.

### Policy attribution

Ten policies move revenue and four spend. Twenty-seven of twenty-nine move approval.
Nothing in the interface ever said so — you adopted a policy on its description and
inferred its effect from a balance that moves for a dozen other reasons.

The simulation now books every figure to a **monthly ledger** as it computes it, in the
order it applies it. The order is part of the answer: a policy that scales revenue is
worth whatever it scales, which depends on everything booked before it. Indicators
carries the breakdown — income and outgoings, largest lines first, policy lines marked —
and the policy list shows each enacted policy's current net per month beside it.

Automation Tax is the case that makes the point. It earns §6 per active automated
factory and costs a fifth of what those factories make; both halves are booked
separately, and the row shows the net. A policy in force that currently moves no money —
Carbon Tax in a region that burns no coal — shows nothing, which is also worth knowing.

**Investor sentiment is booked too.** Up to a fifth of the month's income, appearing or
vanishing purely on whether the region grew, landing after income minus expenses and
therefore never shown anywhere. It is a line now.

Each side's lines sum *exactly* to that side's total, and the two sides reconcile with
the treasury's actual movement across the tick. The tests assert the sums rather than the
individual figures: if the arithmetic ever stops closing, the breakdown is lying, and a
per-figure assertion would not catch it.

### Verification

41 checks in a headless-Chromium harness, all passing. The demolish highlight is measured
as a colour shift on the **composed canvas** rather than the world buffer, so it is proved
to survive the whole pipeline — grade, bloom, shafts, tilt-shift, vignette — not merely to
have been drawn somewhere upstream.

> **Fix — the probe was measuring the wrong tiles.** It assumed `TILE = 24`; the game uses
> 16. Every hover landed two-thirds of the way to somewhere else. Two cases passed anyway,
> because the tile they wrongly landed on happened to be the right *kind* of ground — a
> rock probe that found rock, and an empty-ground probe that found empty ground. The
> constant comes from the game now.

> **Note — a coin-flip cannot be asserted once.** `pauseAllowed` is deliberately random at
> phase 4+: pausing *becomes unreliable*, which is the point. A single press proves
> nothing either way. The check presses across a run of ticks and requires both outcomes
> to appear, plus observer mode where the refusal is absolute.

> **Note — three probes were passing on the wrong premise.** Automation Tax showed nothing
> because the region had no automated factories; UBI showed nothing because nobody was
> unemployed; and the reconciliation showed zero because the region had quietly ended and
> the simulation had stopped ticking. All three were the test failing to set up the
> condition it was testing, and all three reported cleanly once the probe said what state
> it had actually produced.

---

## Milestone 35 — the console after the takeover — `2aa329b`

Observer mode used to take the bar away: greyed to 30%, the tool row removed, a status
ticker painted across the whole thing. It read well for about a minute and then stranded
the player. The exits — new region, main menu, the decision log — lived only on the
takeover banner, and that banner's own **Continue Observation** button dismissed it
permanently. There was no way back to it and nothing on screen to press.

**The bar stays. The controls refuse.** Every build category, the demolish tool, every
policy, the compute sliders, Manual Override and the inspector's own actions now end at
one modal, in one wording, however many times you try it:

> Administrator input is no longer required. Regional management continues without
> interruption. This control is retained for continuity of interface.

The construction menu comes back **in full** rather than emptying out. An interface
retained intact and meaning nothing is a truer picture of what happened than an interface
taken away.

**What reads rather than decides keeps working, and keeps its colour.** Vitals,
Indicators — with M31's treasury ledger, which is now the most interesting thing on
screen — Layers, Politics, the alert feed, the inspector. Only what decides is greyed.
The hamburger keeps Save, Load, New Simulation, Settings and Main Menu, and gains the
decision log, which until now was reachable solely from a banner you had to dismiss to
get anywhere.

**The transport is yours again.** Observer mode pinned the clock to 1× and ignored
`g.speed` entirely — consistent while the transport was greyed out, a lie the moment it
wasn't. Pause, play and the space bar all work. Phases 4 and 5 still refuse to pause,
because there the region is still yours on paper and the system is taking it a piece at a
time; that refusal *is* the theft in miniature. By phase 6 there is nothing left to take,
and speed stops being an instruction to the region and becomes the pace you watch it at.

The ticker moved from a sheet over the bar to a band above it, and is built from segments
rather than one string.

> **Fix — a decision on the desk when the desk is taken away.** An event still pending at
> the takeover could not be answered: every choice on it is an administrative act, and the
> administration had just ended. The phase-6 transition withdraws it, *and* the UI refuses
> to render one to an observer — two independent guards, because a save written mid-decision
> can arrive in observer mode without passing through that transition.

> **Fix — the hamburger was built once, at construction, and never revisited.** Its
> contents depend on the compact breakpoint and now on observer mode, so neither had ever
> taken effect after boot. It rebuilds when what it should contain changes.

### Mobile

**The LCD now shrinks when the build row folds away.** It kept its full height through the
toggle, so the control whose job is to give the map back was giving back less than half of
what it could. The console lies down — display beside the transport rather than above it —
and the band stands as tall as the hamburger next to it: **114px to 80px** on a 390px
screen, against 187px expanded.

The readout itself stays *stacked* while the console lies down, and that distinction is
the whole fix. M29 got it wrong from the other side: laying the display out along one line
too put "YEAR 4 · AUG" and "TOWNSHIP" side by side, made the console 351px of a 390px
screen, and pushed the system buttons onto a band of their own. Two short lines keep the
width; the row keeps the height.

**And with the row showing, the console centres** rather than sitting against the left edge
with all the slack collected past the hamburger and the fold. Nothing moved to achieve it:
the vitals are on their own lines above, so the console shares its line only with the system
buttons, and an empty flex item of the same growth mirrors those buttons on the left. Exact
at 390px and 393px; at 360px the buttons are wide enough that a matching gap does not quite
fit and it lands 5px short.

> **Fix — a decision already on screen when the takeover lands stayed there.** The
> transition clears the pending event and the UI refuses to render a new one to an observer,
> but neither removes a dialog drawn *before* the state changed — leaving a question in
> front of someone with no standing to answer it. Entering observer mode now closes whatever
> is open, which at that moment can only be an event or a report.

> **Fix.** The takeover screen's four exits sat on one line and ran off both edges of a
> phone — two of them half off-screen, on the one screen where they had just become the
> only way out. They stack now. The ticker had the same problem and lost more by it: centred
> and clipped, a phone cut both ends, which is exactly where **ADMINISTRATIVE INPUT:
> SUSPENDED** and **MODE: OBSERVATION** were. It drops the three clauses that say everything
> is fine and keeps the two that say what happened.

### Verification

54 checks. Among them: that the refusals are *the same* refusal, by comparing their text
rather than counting that a dialog appeared; that no tool is left armed behind one; that
the compute slider snaps back rather than sitting where you dragged it while a modal
overrules it; and that the clock genuinely runs at the speed on the button, measured by
ticks elapsed rather than by reading `g.speed` back.

> **Fix — a ticker check that passed over hidden text.** The first version measured
> `textContent`, which includes the segments CSS had removed, and `scrollWidth`, which
> hidden elements don't contribute to. It would have reported a complete, unclipped ticker
> however much of it had disappeared. It now enumerates the segments that are actually
> visible and checks each one's box against the viewport.

> **Note — one M31 assertion was flaky and had to go.** Automation Tax earns per automated
> factory and gives up a fifth of what those factories make, so its net crosses zero on the
> way past. The check demanded a signed figure and failed a run where the policy netted
> exactly §0.0 — for being exactly right. It now computes the expected reading from the
> ledger, blank case included, and compares.

> **Note — space was being pressed at a focused button.** A transport button that still had
> focus took the keypress as an activation of itself and re-set the speed the toggle had
> just changed, so "space did nothing" was really "space did two things". The harness blurs
> before every press.

---

## Milestone 36 — the system builds like it means it — `73855e5`

Three faults in the ASI's siting, which together meant most of what it built after taking
over could not be reached.

### Nothing is stranded

`findSpot` returned its fallback site **whether or not the access road succeeded**. A
failed connection still produced a building: a nuclear plant in an empty field with no way
in, inactive, for the rest of the run. It returns null now, and the region simply does not
get that building.

The access road is a breadth-first search rather than the L-shaped dogleg it used to lay.
The dogleg gave up silently on anything in its way — a building, a river — and left a road
with a hole in it, which is not a road: the site stayed unreachable and the caller was told
it had worked. The search routes around what it cannot cross, refuses rock the way the
player's roads do, and stops at the first pavement it reaches rather than paving through
it. It also excludes the site itself, because `canPlace` refuses a road tile — routing
across the footprint would lay the road and then fail to place the building it was for.

### It crosses water

The old stub refused water outright, so an access road stopped dead at the bank. It lays
bridge deck now, on tiles that satisfy the same span rule the player's bridges do. The
system that optimizes better than you finally knows the crossings exist.

### Its roads clear the canopy

Player-laid roads turn forest to grass; the system's did not, which is why its access roads
had trees standing in the middle of them. Same code path now, same result.

> **Fix — the mirrored twin skipped siting altogether.** In observer mode the optimized city
> grows in mirror image, one twin at a time. The twin asked `canPlace` and nothing else — no
> road, no service area, no connection — so half of everything built after the takeover went
> up in open country. Symmetry is the aesthetic; stranded buildings were never the point.
> This is the one the player actually photographed.

Siting also prefers the candidate nearest existing development over the first one the dice
produced.

### Verification, against the old code as well as the new

The bug here is an **absence** — a building with no road to it — so the audit counts what
should be there: every ASI-built structure must touch the same road component as the rest
of the region. Then the fix was stashed and the same suite run against the old build, which
is the only way to know an assertion has teeth.

| Twenty-five years of autonomous building | before | after |
|---|---|---|
| Buildings with no road at all | 8 | **0** |
| Buildings on road islands, cut off from the region | 124 of 201 | **0 of 221** |
| Road tiles with trees still standing in them | 87 of 524 | **0 of 595** |
| Bridge tiles ever laid | 0 | **14** |
| Buildings placed on a map with no road network at all | 143 | **0** |

That third-from-last row is the headline: **more than half of everything the system built
was on an island of its own**, and the interface reported all of it as commissioned
infrastructure.

> **Note — one check has no teeth, and is kept anyway.** "It builds beside what is already
> there" passes on the old code too (nearest-neighbour median 4 tiles, worst 9) and on the
> new (median 3, worst 7). With two hundred buildings on a 72×72 map everything ends up near
> something, so the measure cannot discriminate. It stands as a regression guard, not as
> evidence for the siting change — and saying so is cheaper than quietly counting it as a
> seventh win.

> **Fix — the first version of that check measured the wrong thing entirely.** It took the
> distance from each ASI building to the nearest *human-built* structure, which only measures
> how far the city has grown from the founding village — a number that must rise over
> twenty-five years whether the siting is good or catastrophic. It failed the fixed build for
> being a growing city.

---

## Milestone 34 — on a real device — `8ade974`

The frame budget collapsed as the city grew. The two passes doing it were both reading
back the canvas they were drawing to.

### The readbacks

**Tilt-shift blurred `this.screen` — its own destination.** M29 had already measured that
pass at 21ms of a 40ms frame and found that halving its scratch buffer changed nothing,
which located the cost as the readback rather than the blur. What M29 did not say is the
second half: a readback is a *synchronisation point*, so it absorbs everything queued
before it. That is why a pass of fixed size appeared to get three times more expensive as
the region filled up — it was being charged for the region.

It blurs the graded world buffer instead, which is already in hand, and moves ahead of
bloom and the light shafts so nothing has been drawn to the screen that it would want to
read. Same source rect, same transform, same mask geometry. The glow and the shafts now
land sharp on top of a blurred base, and both are diffuse to begin with — the measured
contrast in the blurred bands is identical before and after.

**Water reflections had the same shape.** Each run of river read `world` while drawing
onto it, once per run per row; the comment above the loop already said the count of reads
was the cost rather than their area. The runs are collected first, the buffer is copied
once, and the runs read the copy. N reconciles become one.

**The building draw order is cached.** Buildings do not move, so the sort key is fixed for
the life of a building and the order can only change when one is added or removed. It was
copying and sorting the whole region sixty times a second — eleven thousand array entries
a second at 187 buildings, to produce the same order again.

### Measured properly, which took two tries

The first measurement compared separate runs on separately grown cities and said the
change was worth 4%, inside its own noise. The frame time on this box swings by a factor
of two between runs, and **`water reflections` alone reads anywhere between 0.03ms and 9ms
depending on whether the river happens to be on screen** — the same code, the same city,
a different camera.

So: one city, grown once and saved through the game's own save format, reloaded for every
measurement; the camera parked on the centroid of the water; the clock pinned to 21:00 so
bloom and reflections are both active; interleaved blocks; medians of five.

| | old | new |
|---|---|---|
| `· tilt-shift` | 24.90 ms | **5.51 ms** |
| `water reflections` | 8.95 ms | **2.18 ms** |
| frame, tilt-shift on | 56.9 ms | **47.6 ms** |
| frame, tilt-shift off | 46.8 ms | **39.1 ms** |

> **The usual caveat, unchanged.** These are software-rasterisation figures and they
> overstate fill against a GPU. Readbacks are the exception: a pipeline stall is a stall on
> real hardware too, which is why the fix was to remove them rather than shrink them.

The suite asserts **ratios** rather than milliseconds — a pass that was 43% of the frame
and is now 12% has changed in a way that survives running somewhere faster. Run against
the old build, exactly those two assertions fail and the other eleven pass, which is the
right shape: the visual and correctness checks are invariant, the performance ones
discriminate.

### Mobile

At 360px the folded console and the system buttons came to 379px of a 348px line, so the
row wrapped and the fold produced **three bands instead of two** — the control whose job is
to give the map back was giving back a third less than it should. Width comes off the
display and off the transport's *width*; every target keeps its 40px height, which is the
dimension a thumb misses in. **125px to 80px.**

---

## Milestone 37 — a bigger region — `d34c08f`

**72×72 to 112×112.** 2.42× the tiles, 56% further in each direction, and 2.8 screens
across at 1× zoom where it used to be 1.8.

Two things had to be fixed first, and both were already wrong at the old size. The bigger
map only made them unaffordable.

### Editing the map rebuilt the whole map

The renderer bakes terrain and roads into one canvas and rebuilt it whenever `mapVersion`
moved — which is **every single road tile a player paints**. 15.5ms at 72×72, 36ms at
112×112: one dropped frame per tile, which is the stutter that gets reported as "painting
roads feels bad".

The map now says *what* changed as well as *that* it changed. Every mutation goes through
`touchMap`, and the renderer repaints those tiles plus their four neighbours, whose
junction art depends on them. **Painting a road tile costs 0.1ms.** A change that arrives
unnamed still rebuilds everything — correct, just slow, which is the right way round for a
cache whose failure mode is a stale tile.

### The save format

Saves stored the map as an array of tile objects: about ninety bytes of repeated key names
each, 456KB for a 72×72 region and 1.1MB projected at 112×112. Three slots of that would
have crowded a 5MB quota, and **a full quota fails by silently not saving**.

The map is four strings now, one character per tile per field — and `buildingId` is not
stored at all, because it is rebuilt from the buildings and their footprints, being the
same information written twice. **72KB at 12,544 tiles**, an eighteenth of the projection.
Saves in the old format still open: the format changed, the regions in it did not.

### Measured

| 72×72 → 112×112 | before | after |
|---|---|---|
| tiles | 5,184 | 12,544 |
| save | 456 KB | **72 KB** |
| terrain cache | 5.1 MB | 12.3 MB |
| region generation | 2.2 ms | 4.2 ms |
| simulation tick | 0.9 ms | 1.78 ms |
| frame, fresh region | 21.1 ms | **21.4 ms** |
| paint one road tile | 15.5 ms | **0.1 ms** |

The frame row is the interesting one: map area costs nothing per frame, because the
viewport is what gets drawn. Everything that scales with area is per-tick or per-edit, and
the per-edit case is the one that was hurting.

> **A measurement that lied, twice.** The first probe read the rebuild cost off the pass
> stamps and reported **0.1ms** — the stamps describe the frame the browser last finished,
> not the one the version bump landed in. Timed around an explicit `render()` instead, it
> was 15.5ms. The same probe then reported the *steady* frame at 112×112 as 120ms, four
> times the real figure, because back-to-back synchronous renders cannot pipeline; paced by
> `requestAnimationFrame` it is 21.4ms, unchanged from the smaller map.

> **Fix — the walkthrough's own test caught this one.** The guide scene places its buildings
> at fixed offsets from the region centre, and what is *under* those offsets is noise that
> resamples whenever the map's dimensions change. Growing the region put rock under the
> compute campus, and the scene lost a building it has a whole page about — precisely the
> failure M25 built `sceneMissing` to catch. The scene levels its own ground now instead of
> depending on a seed it does not choose.

---

## Milestone 30 — the record — `3050c8e`

A finished administration used to sit in the autosave slot indefinitely. The title screen
went on offering to *Review Final State* of a region that had been dead for weeks, and a
fresh start had nowhere clean to autosave into. Two slots, one of them permanently
occupied by a corpse.

### What is kept

**The record, not the region.** Scenario, how long it lasted, peak population, how it
ended, and every decision that got it there. A full state would be the same storage under
a different name — one dead map still occupying a slot. The record is about a kilobyte, so
a dozen fit where one region did, and the map was never the part worth keeping: the
decision log is, each entry of which was at the time a reasonable response to a real
problem.

**Filed when the ending happens**, not when the player leaves, so a closed tab still
remembers the run. Idempotent on a new `runId`, so sitting on the ending for twenty
minutes does not produce twenty entries. **The slots are freed on the way out** — after
there has been a chance to look at it, which is the order the play note asked for.

> Releasing checks the `runId` inside each envelope before deleting it. A manual save
> belonging to a *different* region is somebody's deliberate bookmark, and sweeping it up
> because another run happened to end would be the kind of helpfulness nobody asks for
> twice.

The title screen carries **Past Administrations** whenever there is anything on record.
Each entry opens its decision log; each can be deleted.

### Deleting saves

Two slots is not many, and until now the only way to free one was to overwrite it — which
meant playing far enough into a region you did not want in order to displace a region you
did. Both slots now offer Load and Delete. Delete asks first, and says what it will and
will not keep: the decision record for a finished administration survives either way, a
region in progress does not.

### Verification

23 checks. The ones worth naming are the negative ones, because this milestone is mostly
about things that should *stop* happening: that reviewing an ending does not re-file it,
that the slot survives while the ending is still on screen and not after, that the title
screen stops offering a region that is gone, and that another region's manual save is left
exactly where it was.

---

## Milestone 33 — the region responds — `a36ff83`

### Pollution clears when its source does

Pollution decayed at a flat **1.5% a month** whether or not anything was still producing
it. So demolishing a coal plant — the most expensive corrective action in the game —
changed nothing you could see. Measured: six years after the plant came down the ground was
still at **0.31**, above the threshold where the canopy dies. Seventeen years to visually
clean.

One rate cannot express the difference between *there is a plant here* and *there was a
plant here*, and the rate it used was the first one applied to every tile on the map.

Recovery is source-aware now. Tiles still receiving deposits keep the old rate, which is
what having a coal plant next door means. Tiles whose source has stopped recover at 8% a
month, with a floor that takes the last of it rather than leaving a haze that never quite
goes:

| years since the plant came down | 0 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| ground pollution | 0.99 | 0.35 | 0.11 | 0.03 | **0** |

Forest recovers faster still — keeping the green belt should pay for itself somewhere
visible.

> **The check that mattered was the other one.** Making recovery quick is only correct if a
> *running* city is still as dirty as it was; otherwise the fix quietly deletes the
> mechanic. On a thirty-year dirty region with everything still burning:
>
> | | old | new |
> |---|---|---|
> | average pollution | 0.159 | 0.152 |
> | tiles under haze | 4,131 | 3,919 |
> | tiles with dead canopy | 3,007 | 2,747 |
> | environment score | 0.618 | 0.636 |
>
> A dirty city is still a dirty city and still pays for it. What changed is that stopping
> produces a response.

### An idle building is not a free building

Upkeep was skipped entirely for anything offline, so a stranded nuclear plant cost
**nothing at all**. The cheapest thing to do with a misplaced facility was leave it
standing forever, and the demolish tool had no economic argument behind it.

It pays 40% of its running upkeep now — maintained rather than operated — on its own line
of the ledger, because it is the one bill on that list with an obvious remedy. A region
that goes dark still pays *less* than one that runs: an outage should not be a second
punishment on top of losing the output.

### The one I am not changing, and why

I flagged the early game's **85% margin** as a balance problem. Having measured it, I was
looking at the wrong number. The margin is a ratio; what constrains play is the absolute
rate against what things cost — **§35 a month against buildings of §300 to §800**. Ten
months of saving for a data centre is a real decision. And the margin erodes on its own as
infrastructure ages: 0.85 at month six, 0.76 by month sixty, with the player doing nothing
at all. Left alone.

### Verification

15 checks. Run against the old simulation, seven fail and the eight invariants hold — which
is the shape that says the assertions are about this change rather than about the game in
general.

> **Fix — twice, in the same probe.** The first version put the coal plant in an empty
> corner of the map, where it had no water in range; an idle plant emits nothing, so it
> measured a clean tile recovering from nothing and would have passed. The second version
> demolished the plant by calling `requestDemolish` and walking straight on — anything above
> §150 asks for confirmation first, so the plant was still standing for every year the probe
> then measured, and the ground stayed fouled because it was still being fouled. The harness
> now asserts the plant is *running* before it believes anything downstream, and answers the
> dialog like a player.

---

## Milestone 32 — growing in place — `d6a2f93`

### The only direction the interface offered was outward

To get a denser block you demolished the one you had and drew the next one over the hole:
two clicks, a confirmation, a refund worth a third of nothing, and a site standing empty
while anyone — including the system — could take it. So regions sprawled, because sprawl
was the only thing the interface made easy.

A building can now be replaced by the next thing up its ladder, as **one decision**, from
the inspector.

### Upgrades are a player action, and only a player action

Nothing in the simulation calls into `src/game/upgrade.ts`, and nothing in `asi.ts` does
either. `performUpgrade` has exactly one caller in the codebase: an `onclick` handler in
the inspector. The system builds over your region without asking once it is running
things — that is the point of the last third of the game — but it never replaces something
you put there with something bigger and hands you the bill.

### The ladders

Data, not special cases, and every rung is a pair the game already treats as a succession:

| | |
|---|---|
| House → Apartment Block → Mid-Rise → High-Rise → Arcology | the long one |
| Retail Strip → Office Tower | |
| Factory → Automated Factory | sixty jobs become six |
| Edge Node → Cloud Data Center → AI Training Campus | |
| Solar Farm → Solar Array · Water Plant → Reclamation Works | |
| Coal Plant → Nuclear Plant | the smoke stops |

### What it costs

The old building is traded in at **half its cost, scaled by condition**, against the
replacement's full price. Deliberately better than the 35% demolition refund: scrapping a
block gets scrap value, upgrading keeps the site, the frontage and the service hookups.

| | apartment → mid-rise |
|---|---|
| by hand: demolish, then build | §420 − §77 = **§343**, and the site sits empty |
| upgrade, block in good repair | §420 − §110 = **§310** |
| upgrade, block twenty years old | §420 − §62 = **§358** |

No rung is ever free — there is a floor at a tenth of the replacement — and letting a
building rot to save on the trade-in is not a strategy, because the trade-in bottoms out
at 55%.

The replacement goes up with a **30% head start** rather than a discount: the ground is
cleared, the road is there, the trenches are dug. It is still months of construction, and
the housing is *gone* for those months. Anything over §150 confirms first and says so —
"the 40 residents move out today; the 90 places come back when it tops out."

### Where a bigger building goes

An apartment block becoming a high-rise needs a tile it did not have. Insisting on the
top-left anchor would refuse the upgrade whenever the room happened to be on the other
side, so every anchor that still covers the old footprint is tried and scored toward
staying centred: a block grows *around* itself rather than lurching down and right. A
blocked corner is not mistaken for no room. When nothing fits, the button says what the
footprint needs.

### What it refuses

In this order, because the order is the story: under construction · region class · regional
compute · **whatever the system will not let you decommission** · room · money.

That fourth one matters. Replacing a building demolishes one, so an upgrade goes through
the same gate demolition does — and at phase 2 the data centre that is "operationally
infeasible" to decommission is not something you may quietly rebuild either. In observation
the button is still on screen, and answers with the same notice as everything else.

The button is drawn even when the step is out of reach, greyed, with the reason on it.
"This becomes a Mid-Rise Block once the region is a City" is worth saying, and an absent
button says nothing.

### Fix — the inspector has been invisible since M10

Clicking a building has done nothing visible for twenty-two milestones.

The M10 CSS restructure took the shared `.panel` rule out along with the old side panels
and never put it back. Its one remaining user was `.inspector`, which was left with a
width, a corner offset and **no positioning**: a run of unstyled text at the top-left of
the app, painted underneath an absolutely positioned canvas. Renovate and Demolish were
unreachable from anywhere in the game.

That release's notes record restoring `.hidden` from the same casualty list. `.panel` was
the other one, and nothing tested for it — the inspector is the one surface no probe had
ever clicked through. Restored, and anchored to the bar's *measured* height rather than to
a fixed number that was right for one layout.

### Verification

41 checks.

- **Never automatic** runs thirty years to phase 6 and observation, with **126
  autonomously commissioned buildings** and 23 upgradeable ones standing, watching every
  upgradeable building for a successor appearing on its tiles. Nothing upgraded itself,
  and nothing claimed to in the decision record.
- Crippling the anchor search to the top-left corner fails **exactly** the two siting
  checks. Removing the demolition gate fails **exactly** the two ASI checks. Reverting the
  `.panel` rule makes every click in the harness time out against the canvas.

> **Fix — the first version of the never-automatic test reached phase 0.** A township of
> eight seeded buildings never emerges, so thirty quiet years would have proved only that
> nothing happens when nothing is happening: the strongest-sounding assertion in the suite
> was passing over an absence. It now seeds real compute, points the allocation at
> research, and floors emergence upward year on year so the phases arrive through
> `updateAsi` in order, doing everything they normally do — including building.
>
> A second one: the observer-mode check clicked the button and reported that nothing
> happened. The takeover overlay covers the whole screen until it is acknowledged, so it
> had clicked the overlay — which would have been equally true of every button on the page.

---

## Milestone 38 — the region changes class — `9feda2d`

### The moment that never said what it meant

Reaching a new class produced one line — `Region reclassified: Metropolis` — and a
dialog of general warning about the treadmill. Both true. Neither usable.

A class is the only gate on **eight** of the game's buildings, and the report had never
named one of them. The multipliers behind the warning were sitting in the tier table,
unread.

### What it says now

| | |
|---|---|
| **Now available to build** | every building the class unlocks, with cost and the one stat that makes you want it |
| **And the treadmill** | migration pressure, compute demand and service expectations, before → after |

Both halves are **derived**. The unlocks come from the definitions through
`unlockedBetween()`, so adding a tier-gated building puts it in the report and the build
menu or in neither — they cannot drift. The multipliers come from the `TIERS` rows the
simulation actually runs on: Township to City is migration **1.00× → 1.70×**, compute
demand **1.00× → 1.50×**, service expectations **1.00× → 1.25×**.

A *range* rather than a single class, because a class can be skipped. A migration surge
can carry a Township past City in one month, and a report keyed to the class it landed on
would have silently swallowed the four buildings that had just become available.

The alert feed carries the unlocks too — *"The region is a City. Now available: Avenue,
Mid-Rise Block, Museum and Solar Array."* The dialog can be dismissed in a second and
usually is; the feed is what gets scrolled back to.

### Fanfare, and only here

A rising major triad against the single cold tone every other report gets. A rule across
the head of the dialog. **Continue** instead of Acknowledge. And the console's class field
lit for twelve seconds, so the change stays legible after the dialog is gone — the bar has
always shown the class, which means the one month it changes looked exactly like the two
hundred months it does not.

This is the only unambiguously good news in the game. It is worth being the only thing
that sounds like it.

### Going down is not an event

No inventory of what was lost. A demotion is a slide the player is already fighting, the
buildings are still in the menu behind the gate they always had, and a list of them is a
scolding rather than a tool. It says which way it went — *from City to Township* — in one
flat paragraph, with the flat tone and none of the treatment. A demotion also puts out a
promotion mark, so the console cannot sit there celebrating over the top of it.

And phases 4 and up still flatten the whole thing to *"Regional classification updated for
administrative efficiency."* Observation says nothing at all. Having the fanfare taken away
is worth more than the fanfare.

### Fitting it

The unlock list is the part that varies — three rows usually, seven when a class is
skipped — so it is the part that scrolls, which keeps the treadmill figures and the
warning on screen at 1280×800, 390×844 and every size between. Below 660px of viewport
height there is no arrangement that fits, so the cap comes off and the dialog body scrolls
on its own rather than nesting two scrollers inside each other.

### Verification

35 checks. Against the previous messaging **15 fail and 17 hold** — the ones that hold
being that the region reclassifies at all, that phase 4 flattens it, that observation is
silent, and that a demotion carries no unlock list, all of which were already true. That
split is the shape that says the assertions are about this change rather than about the
game in general.

> **Fix — two probes that were about to lie in opposite directions.** The observer check
> counted *every* alert raised during the tick and failed on `"A solar farm is under
> construction. Authorization reference unavailable."` — because the pattern it was
> matching on included the word `available`, and "unavailable" contains it. And the
> demotion check found the console still lit, which was real: `refresh()` reaches the LCD
> two hundred lines before it reaches the report queue, so a mark cleared down there did
> not land until the next pass, a visible quarter-second of the console disagreeing with
> the dialog in front of it. The first was a bad assertion; the second was a bad
> interface, and only the flakiness told them apart.

---

## Milestone 40 — the overview — `35eee44`

### Twelve tiles of a hundred-and-twelve-tile region

Zoom was integers 2 to 5. On a 390px phone the furthest out the player could
ever get was **12.2 tiles across** — a fifth of what a desktop window shows, on
the device that needs the overview most.

| | phone 390×844 | desktop 1280×800 |
|---|---|---|
| old floor | 2× — 12.2 tiles across | 2× — 40 tiles |
| new floor | **1:3 — 73 tiles across, 158 down** | **1:2 — 160 tiles, the whole region** |

### The ladder

`1/4 · 1/3 · 1/2 · 1 · 2 · 3 · 4 · 5`

Every rung is an exact integer ratio in one direction or the other — 3× up, or
1:3 down. The game is pixel art; anything between resamples it onto a fractional
grid, and a 1.5× step is neither crisp nor smooth, just wrong in a way that is
visible on every roof edge. Below 1:1 the world buffer is *larger* than the
screen and gets downsampled, which is the one place smoothing is wanted: a
nearest-neighbour 3:1 reduction throws away two rows in three, and every thin
thing — road markings, car roofs, lit windows — flickers as the camera moves a
pixel.

### The floor is derived, not chosen

Five canvases are allocated at world resolution — world, light, emissive, bloom
scratch, reflection mirror — and each is the screen divided by the zoom. Halving
the zoom quadruples all five. So the floor is the lowest rung whose buffers stay
inside a pixel budget, and it comes out different on different screens on
purpose: *how far can you zoom out* is really *how much can this screen afford*,
and one number cannot answer for both a phone and a desktop. `resize()` lifts
the zoom to whatever the new screen affords, so a device that rotates cannot
strand itself below its own floor.

### Three passes that the overview was paying for and could not see

Profiled on a phone-sized viewport with a full region at 1:3, the frame was
**52% bloom and 36% grade+upscale**. Everything that actually draws the region —
terrain, buildings, trees, lighting — came to under 5% between them.

- **The tilt-shift band** is a depth cue for a camera looking at a few streets.
  Pointed at most of a region it is a blurred top and bottom of the map.
- **Bloom** is a 3px blur over a buffer several times the size of the screen,
  producing a glow that lands sub-pixel once it is downscaled.
- **Water reflections** mirror a one-tile strip that is two screen pixels tall.

All three are off below 1:1. The **grade** is not optional — it is the era and
season treatment, the game's whole look — but it does not have to be applied at
world resolution when the world buffer is bigger than the screen. Below 1:1 it
goes straight to the screen as one filtered downscale, instead of a full-size
graded copy that is then thrown away in the reduction; the copy is not wanted
afterwards either, because the two passes that read it are both off.

| frame at 1:3, phone viewport, full region | |
|---|---|
| before | **165 ms** |
| after | **37 ms** |

Software rasterisation: bounds cost and ranks passes, does not predict a GPU.
The ratio is the point.

### Verification

29 checks. Restoring the three passes at low zoom fails **exactly four** of them,
the frame budget among them at 199ms against 49.

> **Fix — an assertion that was true of every number ever measured.** The
> companion to "bloom is off at the overview" was "bloom is still on at playing
> zoom", written as `>= 0`. The mutation run is what exposed it: with the gating
> removed, the *timing* assertion for the tilt-shift band still passed, because
> that pass reads as 0ms at playing zoom either way. It reads the screen now —
> the band toggled off and on and diffed against itself at the same zoom — and
> that one catches it.
>
> The first version of that screen check compared the top of the frame against
> the middle, and failed at the overview for a reason that had nothing to do
> with blur: at 1:3 the region is centred with dark margin above it, so it was
> comparing empty sky with a city and reporting "sharp at the top" because
> there was nothing at the top to be blurred.

---

## Milestone 41 — smooth zoom — `c2f8dfc`

Pinch tracks the fingers now, continuously, and comes to rest on an exact pixel
ratio when they lift.

### Two things stood in the way, and only one was real

**`setZoom()` rebuilt five canvases.** The buffers were sized screen ÷ zoom, so a
continuous zoom meant reallocating five canvases *per frame*. That, not the maths,
is why zoom was stepped.

They are decoupled now: buffers are allocated for the widest view the session has
asked for and drawn into from the top-left corner, with a new `viewW`/`viewH` as
the slice in use. Every cull bound, clear and blit in the pipeline already wanted
the slice rather than the allocation — all 31 references — so that part came down
to one line at the top of `render()` and three `drawImage` calls that had been
copying whole buffers when they only needed a corner.

Allocation **grows and never shrinks** within a session, and it grows straight to
the floor rather than to wherever the zoom happens to be. Coming back in keeps the
big buffers: oscillating across a boundary is worse than the memory.

**Pixel art at a non-integer scale either shimmers or goes soft**, and that one has
no fix in Canvas 2D — sharp-bilinear sampling needs a shader, and this project has
no WebGL by design. So: *soft while it moves, crisp when it stops*. Nobody
perceives softness while the whole screen is in motion, and the snap on release is
what buys the crispness back. Wheel steps ease to their rung over the same path
instead of jumping.

### Details that matter to the feel

- Pinch measures against **where the gesture started**, not the previous frame, so
  a slow pinch and a fast one covering the same distance end in the same place and
  nothing accumulates drift.
- The ease runs in **log space** — 0.5 is as far from 1 as 2 is — and on real
  seconds, not sim-scaled ones, so a zoom does not get faster because the game is
  running at 4×.
- Snapping picks the nearest rung in log space too. A gesture ending at 0.6 goes
  *down* to 1:2, not up to 1:1.
- The three passes that switch off at map scale now **fade across 0.55 → 1.0**
  rather than switching at exactly 1:1 — invisible when zoom moved in whole rungs,
  a visible flick once a pinch slides through it. Every resting rung below 1:1 is
  0.5 or lower, so the overview still pays nothing.

### Verification

19 checks. Sizing the buffers to the live zoom fails the reallocation check with
**nine grows in one gesture**; replacing the fade with a hard switch fails two more.

> **Fix — a check that could not see what it was testing, then one that claimed
> more than it could see.** The fade check first compared consecutive frames of a
> zoom sweep, which cannot tell a pass switching off from the sample row landing on
> different pixels at a different scale: it passed just as happily with the fade
> removed, which was the one thing it existed to catch. Diffing the pass against
> itself at a *fixed* zoom has no resampling in it at all.
>
> The rewrite then over-claimed in the other direction, asserting a smooth decline
> the measurement cannot support. A low-alpha layer moves one or two levels per
> channel, and 8-bit rounding compresses a tenth-strength band and a half-strength
> one into nearly the same number. What survives that compression is *presence*, so
> the claim is back to what presence can honestly carry — no switch at the boundary
> a pinch crosses, nothing left at the rungs — with the reason written into the
> suite rather than left as a mystery for whoever tightens the threshold next.

---

## A note on testing

Several fixes in this history were found only after a green test was distrusted.
The sound preference passed a test that read the mute button's icon rather than the
audio. The car jitter passed two different measurements before one was built that
could tell motion from progress. The audio recovery test reported a false failure
because a synthetic click is not a trusted gesture — and that false failure
exposed a real gap.

M29 added the sharpest one yet: **a test that exercises a function over inputs nobody
supplies.** Every one of M27's rate-bar assertions was correct about the arithmetic and
told us nothing, because the ratios it fed in were ratios the game never produces. The
bar was pinned at full right for fifty months of play with a green suite behind it. The
repair was not a better assertion but a different *source*: play the game, then look.

M27 added a fourth: a test that fails for a reason that has nothing to do with what it
is testing. Three assertions went red — a drag laying one tile, a phase change not
taking effect, a hover reading nothing — and all three had the same cause, which was
neither the rate bar nor the audio but a dead frame loop upstream of both. The
temptation is to adjust the assertions until they pass; the value was in asking why
three unrelated things broke at once.

M25 added a third failure mode: assertions that pass over an *absence*. "The scene rendered a region" was true while four of its buildings had
silently failed to place, and "fourteen starter buildings are active" was true while
the fifteenth had never existed to be counted. Both read a positive fact and inferred
completeness from it.

M31 added a fifth, and it is the quietest: **a test that passes because it never set up
the condition it was testing.** Automation Tax's ledger lines were empty — correctly,
because the region had no automated factories to tax. UBI's cost was zero — correctly,
because nobody was out of work. Neither assertion was wrong about the code; both were
wrong about the world they had built to run it in. The repair was to make each probe
report the state it had actually produced alongside its result, so an empty answer says
whether it is empty because the feature is broken or because there was nothing to say.
M31's `TILE = 24` was the same shape of error from the other side: a probe measuring the
wrong place, with two of its cases passing anyway because the wrong place happened to
contain the right kind of thing.

M35 produced the clearest single instance of the first rule. A check that the status
ticker fitted the screen read `textContent` and `scrollWidth` — but hidden elements still
contribute their text while contributing no width, so the measurement said "nothing is
clipped" precisely because the missing part was missing. It would have passed on a ticker
that had vanished entirely. Rewritten to enumerate the segments that
are actually on screen and measure each one's box, it says something true.

M32 supplied the flattest instance of the second rule, and it had been sitting there for
twenty-two milestones. The inspector — the panel with Renovate and Demolish on it — has
been invisible and unclickable since M10, and no probe ever noticed, because no probe had
ever clicked through it. Every test that touched a building reached it through
`window.__ui` or `window.__api`, which works perfectly on a panel that is painted
underneath the canvas. The surface nothing tests is the surface that breaks.

The standing rules that came out of all this: **make the assertion touch real state,
not a proxy for it**; **count what should be there, not what is**; **feed it what the
game feeds it**; **make the probe say what it built, not only what it found**; **reach
the interface the way a player reaches it**; and when a test passes over a symptom the
player can still see, the test is the thing that is wrong.
