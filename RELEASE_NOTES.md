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

## A note on testing

Several fixes in this history were found only after a green test was distrusted.
The sound preference passed a test that read the mute button's icon rather than the
audio. The car jitter passed two different measurements before one was built that
could tell motion from progress. The audio recovery test reported a false failure
because a synthetic click is not a trusted gesture — and that false failure
exposed a real gap.

The standing rule that came out of it: **make the assertion touch real state, not a
proxy for it**, and when a test passes over a symptom the player can still see,
the test is the thing that is wrong.
