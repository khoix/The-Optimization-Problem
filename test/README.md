# Tests

```
npm run check      # types only, no build
npm test           # build, serve, drive a browser through every suite
npm test -- m54    # one suite
npm test -- --no-build
```

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
