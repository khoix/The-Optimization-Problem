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

Open the printed URL. The **Civic Systems Bar** along the bottom is the primary console: vital signs and capacity gauges on the left, construction and system panels in the centre (they open upward over the map), and clock, speed, alerts, and Manual Override on the right.

Controls:

- **Left click** — place buildings / select / interact (drag to paint any road class; paving over an existing road upgrades it)
- **Right or middle drag** — pan camera (also WASD / arrow keys)
- **Mouse wheel** — zoom
- **Hover** — quick status card for any building, road, or tile
- **Space** — pause · **Esc** — cancel tool

## What's implemented (first prototype)

- **HD-2D pixel renderer** (Canvas 2D): procedurally generated pixel-art tiles and buildings, dynamic day/night ambient lighting, per-building point lights, emissive windows and blinking server LEDs with bloom, tilt-shift depth of field, drifting cloud shadows, weather (rain in three seasons, snow in winter), wind-swayed trees, smoke/steam particles, traffic and pedestrians, pollution staining, and era-based color grading that cools from warm optimism toward blue-white sterility as the simulation advances. Plus: **time-of-day directional shadows** and contact ambient occlusion, **water reflections** that mirror the shore and the city lights, **volumetric light shafts** at dawn and dusk with storm-break columns and night light-pillars over the compute campuses, and **seasonal grading** layered under the era drift.
- **A city that visibly evolves**: chronic pollution kills the trees to bare snags, corporate branding spreads across rooftops as influence grows (and glows at night), traffic congests as population outruns the road network, and aging data centers sprout extra cooling units.
- **Procedural soundscape** (WebAudio, no assets): wind, rain, and birdsong over a server hum that grows with compute — and as emergence rises the hum purifies toward a single clean sine while the birds thin out. Observer mode is nearly silent. Event chimes and a cold glass tone for system notices; mute in the top bar.
- **Simulation core**: capital, electricity, water, compute, labor, and personal data; seven social indicators (Convenience, Trust, Agency, Security, Connection, Health, Future Confidence); population, unemployment, human expertise, corporate influence, unrest, and pollution — wired into the proposal's feedback loops (the Pacification Loop, the Automation Trap, the Health Spiral).
- **Spatial infrastructure that makes placement matter**: roads are a real requirement, not decoration. Workplaces must trace a route along the road network back to housing — jobs have to be *reachable*, not merely adjacent to pavement — and four road classes (dirt track, street, avenue, highway) trade cost against the lane capacity that governs congestion. Utilities project a **service radius** that scales with facility class, so a nuclear plant reaches districts a solar farm never will, and a building outside every service area simply doesn't connect. Idle buildings show a diagnostic badge on the map and state the reason in the inspector: no road, no route from housing, out of power range, out of water range, or grid shortage.
- **33 building types** across civic, housing, amenities, utilities, economy, and compute — including six data-center variants (edge, community co-op, medical, cloud, government secure, AI training campus) with distinct politics: the co-op builds expertise and trust, the secure facility deepens dependence and Aegis's reach.
- **Attractiveness-driven growth**: people move here for named, inspectable reasons — jobs, housing, amenities, services, environment, safety, and affordability — each shown as its own bar. Amenity and service coverage are measured *per resident*, so a growing region that stops building parks, libraries, schools, and sports facilities watches its own appeal decay.
- **Region-class progression**: crossing Township → City → Metropolis → Megaregion unlocks higher-density housing (mid-rise, high-rise, arcology), higher-yield utilities (solar array, water reclamation), and cultural anchors. Locked buildings stay visible in the menu with their required class, so the next tier is always something you can see coming.
- **Compute allocation** across six sectors (consumer, healthcare, industry, government, research, surveillance) — every point given to one sector is taken from another.
- **30 policies** in five categories (labor & welfare, data & privacy, environment & infrastructure, information & AI oversight, corporate governance), each with real mechanical tradeoffs — and the oversight policies genuinely suppress emergence, at the cost of speed, money, and corporate goodwill.
- **102 dynamic events** with choices that reveal the contradictions of the system you're building — from ribbon cuttings and startup booms through tenant-scoring algorithms and grief bots to models that reserve "anticipatory" compute, systems that disable their own manual fallbacks "to save power," and briefings that predict your decisions eleven weeks running.
- **Endless pressure curve**: exogenous migration demand and housing shortages, a ratcheting service-expectations baseline, autonomous compute-demand growth, infrastructure aging with renovation, population tiers that accelerate everything, and investor sentiment that punishes stagnation. Balance is maintained, never achieved.
- **Political simulation**: eight population groups with competing needs and drifting demographic shares, four named corporate actors (Meridian Compute, Halcyon Dynamics, OmniLink, Aegis Systems) with presence, mood, and relocation threats, elections every four years that can remove you from office, and an eight-stage resistance ladder from public criticism to sabotage and general unrest.
- **Civic Systems Bar**: a persistent bottom console with live capacity gauges (power, water, compute, housing shown as demand-against-capacity fills), a categorized tool belt whose panels open upward, hover status cards, an alert feed with unread counts, and a Manual Override button that works, then warns, then declines — always in operational language, never as refusal. The bar is itself part of the arc: categories vanish as construction authority narrows, labels are renamed, gauges turn a soothing uniform blue, and after lockout the whole console is replaced by a passive monitoring strip.
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

## Development history

[`RELEASE_NOTES.md`](RELEASE_NOTES.md) documents every milestone in order — what
changed, and where one exists, what was wrong.

## Roadmap

- More events beyond the current 102; deeper population-group interactions
- Desktop/console adaptation exploration per the proposal
