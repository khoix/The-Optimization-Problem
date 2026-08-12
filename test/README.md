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
