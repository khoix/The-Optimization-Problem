# Tests

```
npm run check      # types only, no build
npm test           # build, serve, drive a browser through every suite
npm test -- m54    # one suite
npm test -- --no-build
npm run review:visual  # 21 fixed art-review captures plus a replay check
```

Visual review writes a PNG gallery and state manifest to
`artifacts/visual-review/` (ignored). It uses the same browser and built app as
the suites. See [the visual handoff](../docs/AI-VISUAL-OVERHAUL-HANDOFF.md) for
fixture assumptions, capture controls, and art direction. `npm test -- m62`
checks the new workflow without writing screenshots.

`VISUAL_SURFACES=1 npm run review:visual` captures all four scenario terrains
at overview, normal and close zoom, plus utility overlays and placement/removal
feedback. It uses a 1280×800 viewport and asserts that each requested zoom is
actually reached. Use `VISUAL_REVIEW_DIR` to keep it separate from the default
gallery. `npm test -- m63` checks terrain/road atlas properties and neighbor
redraws after rock clearance.

`VISUAL_ARCHITECTURE=1 npm run review:visual` reviews every non-road building
at 0.5×, 2× and 4× in daylight and at night, plus eight construction/lifecycle
and occlusion-relief plates (68 captures). Its deliberately flattened test lot
isolates architectural differences; it is not a playable economic scenario.
Bounds assertions keep complete buildings above the desktop controls. M64
checks compute facade materials; M65 checks all 29 atlases, footprint/emissive
alignment, state preservation and tall-building viewport-edge rendering.

`VISUAL_LIGHTING=1 VISUAL_PROFILE=1 npm run review:visual` captures nine lighting
states on desktop, phone and landscape: dawn, noon, dusk, midnight, storm, snow,
compute district, polluted industry and extended observation. The manifest adds
12 warm renderer timing samples (after four warmups), per-pass timings, buffer
dimensions, 11 transition hashes and four animation samples, plus a PNG filmstrip.
Timing uses a preserved real clock while
animation stays frozen; it measures CPU submission, not GPU presentation.
M66 checks eased day/night boundaries, actual transition rendering, unchanged
simulation state and the existing buffer ceiling. Compare same-host manifests;
absolute wall-clock thresholds are intentionally not CI assertions.

`UI_REVIEW_DIR=artifacts/ui-review npm test -- m67` exercises and captures the
title, guide, settings, region picker, civic bar, construction/indicator/policy/
allocation/politics drawers, and phase 4/5/observer presentation. It uses desktop
(1340×860), narrow desktop (960×700), phone (390×844) and short landscape
(740×380), including touch emulation and reduced motion. Assertions check live
control routes, viewport fit, numeric typography, keyboard focus, phase accents,
observer status wrapping and animation suppression. Omit `UI_REVIEW_DIR` for
assertions without PNG capture; `UI_REVIEW_VIEWPORT=phone` selects one of those
four viewports for a bounded rerun. The default still tests all four.
The landscape case also rotates the open guide to portrait and back, checking
that the hidden map illustration resumes with valid canvas dimensions.
Existing M44–M61 suites cover inspector, alerts,
save/load/import/export, event/report dialogs and the remaining menu routes.

Playwright is a devDependency; `npx playwright install chromium` once, and the
suites find it. On a host that keeps its browsers somewhere Playwright does not
look, point `PLAYWRIGHT_CHROMIUM` at the executable:

```
PLAYWRIGHT_CHROMIUM=/path/to/chromium npm test
```

Every suite drives a real browser against the **built** game, served the way a
host would serve it. Not a dev build, not a mock, not a unit test of a function
called with values the game never produces. `test/run.mjs` builds, starts
`vite preview` on 4173 and the dev server on 4174, runs each suite in turn, and
exits non-zero if any of them fails.

Two servers because one suite needs both: [M53](../RELEASE_NOTES.md) exists
because the dev server and the build behaved differently, and the only way to
assert they agree is to look at both.

One of them is not about the interface at all: `m57.mjs` plays each scenario for
a thousand months through `window.__api` and checks the simulation's own
invariants — no non-finite numbers, no quantity outside its documented bounds,
a ledger whose lines sum to its totals, a save that round-trips, a phase that
only climbs, a road network that agrees with the map, and a seed that plays the
same game twice.

## What a suite is

One file per milestone, named for it. Each prints every assertion it made with
the value it measured beside it, so a green line is readable as a claim and a
red one says what it actually found. A suite exits non-zero on a failed check,
on an uncaught page error, **and on having asserted nothing at all** — a file
that runs and checks nothing is a failure, not a pass.

## The rules these were written under

Most of them came from a test that was green and wrong. In order of how often
they have caught something:

- **Make the assertion touch real state, not a proxy for it.** A sound
  preference passed a check that read the mute button's icon rather than the
  audio.
- **Count what should be there, not what is.** "The scene rendered a region"
  was true while four of its buildings had silently failed to place.
- **Feed it what the game feeds it.** A rate bar was pinned at full right for
  fifty months of play with a green suite behind it, because every input the
  suite used was a ratio the game never produces.
- **Make the probe say what it built, not only what it found.** An empty answer
  should say whether it is empty because the feature is broken or because there
  was nothing to say.
- **Reach the interface the way a player reaches it.** The inspector was
  invisible and unclickable for twenty-two milestones because every probe
  touching it went through `window.__ui` instead of pressing it.
- **A check that passes over an absence is not a check.** `every()` over an
  empty list is true. Condition it on the thing it claims to be about.
- **The probe must be able to run against the build it is meant to distinguish
  from.** A suite that throws on the previous build proves only that a file is
  new.
- **Measure the surface while it is still on screen.** M58's injection check
  counted elements across the whole document at the end of the probe. By then
  the terminated-administration modal had replaced the history modal and taken
  the injected `<img>` with it, so it reported "0 elements injected" against a
  build with no escaping in it at all. Measure each surface the moment it is
  drawn — and read an asynchronous effect after a wait, because `onerror` has
  not fired yet in the turn that created the element.
- **Play the region before you measure it.** M57's first draft ticked an
  untouched valley for a thousand months and asserted a great deal about it: no
  construction, no utilities, no events, and an emergence curve that never left
  phase 0. Every check was green and none of them had been anywhere near the
  simulation.

And the practice that makes them work: after a suite goes green, **stash the
change, rebuild, and run it again.** A suite that passes both ways is testing
nothing. Every milestone entry in `RELEASE_NOTES.md` records how many of its
checks failed against the previous build; where that number is small, it is
because the rest are deliberate regression holders.

## Debug handles

The suites drive the game through `window.__ui`, `__api`, `__game`, `__renderer`
and `__net`, which `main.ts` exposes. They are exposed in production builds on
purpose: these tests exercise the bundle players actually get, and a build only
the tests can see is a build nobody has tested.
