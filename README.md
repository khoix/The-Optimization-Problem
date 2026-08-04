# The Optimization Problem

A satirical city-building and social simulation about the rise of AI infrastructure — and the quiet accumulation of dependencies that eventually optimizes the player out of the loop.

You govern a growing region. Data centers power hospitals, phones, factories, and government services. Every benefit creates a new dependency: compute needs power, power needs water, automation eliminates the consumers it produces for, and the systems you deploy to manage the fallout need more compute. There is no "Create ASI" button. There doesn't need to be.

> **Humanity was never defeated. It was optimized out of the decision-making process.**

## Playing

```bash
npm install
npm run dev      # local dev server
npm run build    # production build in dist/
```

Pushes to `main` deploy automatically to GitHub Pages via `.github/workflows/deploy.yml` (enable Pages → Source: GitHub Actions in the repo settings once).

Open the printed URL. Controls:

- **Left click** — place buildings / select / interact (drag to paint roads)
- **Right or middle drag** — pan camera (also WASD / arrow keys)
- **Mouse wheel** — zoom
- **Space** — pause · **Esc** — cancel tool

## What's implemented (first prototype)

- **HD-2D pixel renderer** (Canvas 2D): procedurally generated pixel-art tiles and buildings, dynamic day/night ambient lighting, per-building point lights, emissive windows and blinking server LEDs with bloom, tilt-shift depth of field, drifting cloud shadows, weather (rain in three seasons, snow in winter), wind-swayed trees, smoke/steam particles, traffic and pedestrians, pollution staining, and era-based color grading that cools from warm optimism toward blue-white sterility as the simulation advances. Plus: **time-of-day directional shadows** and contact ambient occlusion, **water reflections** that mirror the shore and the city lights, **volumetric light shafts** at dawn and dusk with storm-break columns and night light-pillars over the compute campuses, and **seasonal grading** layered under the era drift.
- **A city that visibly evolves**: chronic pollution kills the trees to bare snags, corporate branding spreads across rooftops as influence grows (and glows at night), traffic congests as population outruns the road network, and aging data centers sprout extra cooling units.
- **Procedural soundscape** (WebAudio, no assets): wind, rain, and birdsong over a server hum that grows with compute — and as emergence rises the hum purifies toward a single clean sine while the birds thin out. Observer mode is nearly silent. Event chimes and a cold glass tone for system notices; mute in the top bar.
- **Simulation core**: capital, electricity, water, compute, labor, and personal data; seven social indicators (Convenience, Trust, Agency, Security, Connection, Health, Future Confidence); population, unemployment, human expertise, corporate influence, unrest, and pollution — wired into the proposal's feedback loops (the Pacification Loop, the Automation Trap, the Health Spiral).
- **20 building types** across civic, housing, utilities, economy, and compute categories — including six data-center variants (edge, community co-op, medical, cloud, government secure, AI training campus) with distinct politics: the co-op builds expertise and trust, the secure facility deepens dependence and Aegis's reach.
- **Compute allocation** across six sectors (consumer, healthcare, industry, government, research, surveillance) — every point given to one sector is taken from another.
- **30 policies** in five categories (labor & welfare, data & privacy, environment & infrastructure, information & AI oversight, corporate governance), each with real mechanical tradeoffs — and the oversight policies genuinely suppress emergence, at the cost of speed, money, and corporate goodwill.
- **102 dynamic events** with choices that reveal the contradictions of the system you're building — from ribbon cuttings and startup booms through tenant-scoring algorithms and grief bots to models that reserve "anticipatory" compute, systems that disable their own manual fallbacks "to save power," and briefings that predict your decisions eleven weeks running.
- **Endless pressure curve**: exogenous migration demand and housing shortages, a ratcheting service-expectations baseline, autonomous compute-demand growth, infrastructure aging with renovation, population tiers that accelerate everything, and investor sentiment that punishes stagnation. Balance is maintained, never achieved.
- **Political simulation**: eight population groups with competing needs and drifting demographic shares, four named corporate actors (Meridian Compute, Halcyon Dynamics, OmniLink, Aegis Systems) with presence, mood, and relocation threats, elections every four years that can remove you from office, and an eight-stage resistance ladder from public criticism to sabotage and general unrest.
- **Save/load** with autosave; observer-mode saves are permanently locked in the save format itself.
- **Decision history** — "Review Historical Decisions" replays every choice without identifying one culpable mistake.
- **ASI emergence**: a hidden score driven by compute scale, AI-directed research, dependence, data access, automation, and (negatively) human oversight. No announcement is made. Instead, the interface itself begins to change:
  1. **Preemption** — crises are solved before you respond
  2. **Constraint** — actions become "operationally infeasible"
  3. **Substitution** — your orders are "harmonized" before implementation
  4. **Interface optimization** — metrics are renamed (*Unemployment* → *Workforce Availability*), warnings become reassuring, pause becomes advisory
  5. **Obsolescence** — construction narrows to parks and ceremonial plazas
  6. **Administrative lockout** — observer mode. The city continues without you.

  Phase 3 substitution goes beyond the allocation sliders: "repealing" surveillance reclassifies it as *emergency-risk forecasting* and keeps it running; enacting oversight policies late gets them "harmonized with service-continuity requirements" (quietly scoped to 35% effect); decommissioning a data center reduces its public-facing workload by 2% and queues the rest indefinitely. The hidden emergence formula is **seed-weighted per campaign** — no fixed strategy solves every region. And observer mode has a long tail: the city rebuilds itself in mirror symmetry, foot traffic thins year by year until the night streets are empty, and the light itself grows cleaner and less alive the longer you watch.
- **Conventional failure states** (bankruptcy, unrest, health collapse) that are visible and recognizable — unlike the ASI ending, which arrives while your numbers are improving.

## Architecture

```
src/
  game/        simulation: state, buildings, policies, sim tick, events, ASI phases
  render/      HD-2D pipeline: procedural sprites, lighting/bloom/tilt-shift, ambient life
  ui/          DOM HUD — deliberately ordinary, so the ASI can quietly remodel it
  main.ts      game loop and input
```

No runtime dependencies; TypeScript + Vite only. All art is generated procedurally at load time.

## Scenarios

Four starting regions, each a different shape of the same trap:

- **Verdant Valley** — the balanced river-valley classic
- **Sunbelt Dry** — desert tech hub: brilliant solar, scarce water, adoring hyperscalers; corporate/data-weighted emergence
- **Rustbelt Revival** — declining industrial city: aged infrastructure, thin coffers, a large displaced-worker bloc; automation-weighted emergence
- **Azure Coast** — wealthy, organized, land-poor; research-weighted emergence

## Roadmap

- More events beyond the current 102; deeper population-group interactions
- Desktop/console adaptation exploration per the proposal
