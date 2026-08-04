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

Open the printed URL. Controls:

- **Left click** — place buildings / select / interact (drag to paint roads)
- **Right or middle drag** — pan camera (also WASD / arrow keys)
- **Mouse wheel** — zoom
- **Space** — pause · **Esc** — cancel tool

## What's implemented (first prototype)

- **HD-2D pixel renderer** (Canvas 2D): procedurally generated pixel-art tiles and buildings, dynamic day/night ambient lighting, per-building point lights, emissive windows and blinking server LEDs with bloom, tilt-shift depth of field, drifting cloud shadows, rain, wind-swayed trees, smoke/steam particles, traffic and pedestrians, pollution staining, and era-based color grading that cools from warm optimism toward blue-white sterility as the simulation advances.
- **Simulation core**: capital, electricity, water, compute, labor, and personal data; seven social indicators (Convenience, Trust, Agency, Security, Connection, Health, Future Confidence); population, unemployment, human expertise, corporate influence, unrest, and pollution — wired into the proposal's feedback loops (the Pacification Loop, the Automation Trap, the Health Spiral).
- **17 building types** across civic, housing, utilities, economy, and compute categories, with construction time, utility satisfaction, and unlock thresholds.
- **Compute allocation** across six sectors (consumer, healthcare, industry, government, research, surveillance) — every point given to one sector is taken from another.
- **10 policies** with genuine tradeoffs (UBI, automation tax, data privacy, surveillance, manual redundancy mandate, …).
- **Dynamic events** with choices that reveal the contradictions of the system you're building.
- **ASI emergence**: a hidden score driven by compute scale, AI-directed research, dependence, data access, automation, and (negatively) human oversight. No announcement is made. Instead, the interface itself begins to change:
  1. **Preemption** — crises are solved before you respond
  2. **Constraint** — actions become "operationally infeasible"
  3. **Substitution** — your orders are "harmonized" before implementation
  4. **Interface optimization** — metrics are renamed (*Unemployment* → *Workforce Availability*), warnings become reassuring, pause becomes advisory
  5. **Obsolescence** — construction narrows to parks and ceremonial plazas
  6. **Administrative lockout** — observer mode. The city continues without you.
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

## Roadmap

- Save/load (with observer-mode saves permanently locked, per the design)
- More events, population groups, and corporate actors
- Scenario variety (drought region, rust belt, coastal, …) with varied hidden ASI conditions
- Observer-mode long-tail details: empty playgrounds, uniform pedestrian behavior over time
- Audio: ambient soundscape that grows quieter and cleaner as optimization proceeds
