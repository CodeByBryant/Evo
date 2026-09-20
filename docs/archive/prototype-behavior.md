# Evo prototype v0.1: behavior record

Archive of the original implementation before the simulation-engine rewrite.
Everything here was verified against the source at the tagged commit, not the README.

## Archive reference

| Item            | Value                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------- |
| Git tag         | `prototype/v0.1`                                                                            |
| Commit          | `fa853d4` ("Add Patreon username to FUNDING.yml")                                           |
| Rewrite branch  | `rewrite/simulation-engine`                                                                 |
| Package version | `0.1.0`                                                                                     |
| Stack           | React 19, Vite 6, Electron 40 (electron-vite), TypeScript 5.9, Bootstrap 5                  |
| Screenshots     | `docs/archive/screenshots/` (main view, DNA panel genome and genealogy tabs, Agent Builder) |

To restore: `git checkout prototype/v0.1 && npm ci`.

### Build commands (verified 2026-09-19)

| Command                         | Purpose                                        | Result                                                                                    |
| ------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`             | node + web tsc                                 | passes                                                                                    |
| `npm run build:web`             | Vite web build to `dist/`                      | passes (1.6 s, ~320 kB JS)                                                                |
| `npm run dev:web`               | Vite dev server on port 5000                   | works                                                                                     |
| `npm run dev` / `npm run build` | Electron dev / typecheck + electron-vite build | not exercised in Phase 0                                                                  |
| `npm run build:win\|mac\|linux` | electron-builder packaging                     | not exercised in Phase 0                                                                  |
| `npm run lint`                  | ESLint                                         | 0 errors, ~16.7k warnings, all `prettier/prettier` CRLF (`core.autocrlf=true` on Windows) |

Note: the local `node_modules` was missing `bootstrap`, so `build:web` initially failed. A clean `npm ci` resolves it. That is an environment issue, not a code defect.

## Architecture as built

- `src/renderer/core/`: `Agent`, `EvolutionManager`, `SpeciesManager`, `ClusterManager`, `NeuralNetwork`, `Camera`.
- `src/renderer/components/SimulationCanvasNew.tsx`: owns the live `Agent[]` and `Food[]` in refs, runs the loop, renders.
- `src/renderer/App.tsx`: React state, receives **live `Agent` objects** via `onAgentsChange` (cloned array, shared instances) and passes them to panels.
- Config: `core/utilities/AgentConfig.json`, imported directly into core classes (no validation).
- Electron: thin shell (`src/main`, `src/preload`), no simulation logic.

## Simulation behavior

### World

- 6 food clusters (`ClusterSettings`), radius 1000, arranged in a regular polygon with spacing 3000. "Infinite" means only that the camera can pan freely; agents are not bounded and there is no streamed or generated terrain.
- No world boundary is applied in the main loop (`agent.update` is called without canvas size).

### Agents

- Start: 60 agents (`AgentCount`) split evenly across clusters, **one species per cluster**, each species with randomly generated baseline traits (`SpeciesManager.generateUniqueSpeciesTraits`).
- 21 genetic traits (size, speed, acceleration, turn rate, drag, sensor ray count/length/precision, field of view, color vision, energy efficiency, digestion, max energy, mutation rate, reproduction threshold, offspring count, learning rate, memory neurons, aggression, hue, body shape).
- Brain: feed-forward net, input = 3 (x/1000, y/1000, rotation) + 2×12 padded ray offsets (agent, food) + optional 24 color-vision flags + memory neurons; hidden `[20,16,12]`, tanh, He init; 6 outputs (forward, backward, strafe L/R, rotate CW/CCW).
- Sensing: raycasts against all agents and all food (O(agents × food) per step, no spatial index).
- Movement: `currentSpeed` eases toward `movementSpeed`; outputs scale forward/strafe/turn.
- `aggression` biases the input weighting of agent rays versus food rays (`aggression` vs `2 - aggression`). Aggression has no combat or damage effect.
- Energy cost per step: `0.01 / energyEfficiency × (1 + sizeCost + movementCost + sensorCost + colorVisionCost)`.
- Fitness is a 0-100 heuristic recomputed every step from energy, food eaten, age, distance. It is used only for display and for picking elites.
- Life stages come from `age / maxAge` (embryo, child, adolescent, adult, old); `maxAge` is 5000 steps. Stage only affects body scale (rendering and food-collision radius) and reproduction eligibility.

### Food

- 1000 food items (`SpawnCount`), split across clusters, variable radius 4-10, small bounded drift around a spawn point.
- On eat: the item is replaced in place at a new random cluster position (`RespawnOnEat: true`), and each cluster is topped up to its target each frame. Energy gain is `(radius / 6) × 20 × digestionRate`, capped at `EnergyMaxCap` (150).
- Multiple agents can collide with the same item in one frame; it is replaced by index after the first, so later agents in the loop may hit the replacement. No claiming logic.

### Reproduction (`EvolutionManager.update`, every step)

1. Age all agents; kill if `energy <= 0` or `age >= maxAge`.
2. Eligible if adult-stage, before the reproduction cutoff (95% of max age), and energy >= `max(EnergyMinToReproduce, reproductionThreshold)`.
3. Only while population < `populationSize × 1.5` (150, hard-coded multiplier).
4. Number of offspring = `round(offspringCount)`. Mate is a random eligible same-species agent with 70% chance, otherwise asexual.
5. Child **traits**: 50/50 blend of parents (or copy of one parent), then cascading mutation (one random trait guaranteed, then 50%, 25%...) with a fixed ±10% of range step. The `mutationRate` trait is not used for trait mutation.
6. Child **brain**: `rebuildNeuralArchitecture()` builds a **new randomly-initialized network**, then applies cascading Gaussian-style mutation. Parent weights are not inherited.
7. Cost: child energy (20% of max capacity per child) plus 10% overhead from the parent; mate pays 30% of child energy.
8. Child spawns within ±25 units of the parent, same species, same cluster, `generation = parent.generation + 1`.

### Species

- Species IDs are random strings assigned at creation. Children always inherit the parent's species.
- There is no genetic-distance test and no speciation event during normal play. New species appear only at world init (one per cluster), on emergency repopulation, and via the Agent Builder.
- Species with zero living members are deleted from `SpeciesManager` immediately (`removeExtinctSpecies`).

### Extinction handling (contradicts the "no hidden recovery" principle)

- If population drops below `MinPopulationForBoost` (10), a 5% per-step chance spawns an extra agent cloned from a random survivor's traits with a mutated brain, at reproductive age.
- At population 0, up to 10 agents are respawned across clusters, using stored elite templates (top 30% at init) including their neural weights, or fresh species if none exist.

### Time and speed

- Loop is `requestAnimationFrame`, skipped if the frame is < 50% of 16.7 ms. Each frame runs `min(3, max(1, round(speed)))` sim steps. The slider goes to 25× and buttons to 50/100/500×, but throughput is capped at 3 steps per frame.
- Simulation timing is frame-driven, not fixed-timestep. Behavior depends on the display refresh rate and frame stalls.

### Randomness

- `Math.random()` is used everywhere in core code (traits, brains, species IDs, spawning, mate choice, mutation). No seed, no reproducibility.

## Save / load

- **Save** (localStorage key `evo_saves`): per agent, position, width/height, fitness, energy, age, generation, species, and flattened network weights (`getGenomeData`).
- **Not saved**: genetic traits, agent ID, parent IDs, food eaten, memory state, cluster, food positions, species records, elite gene pool, evolution stats, config, RNG state.
- **Load**: builds `new Agent()` with **default random traits** (including random `colorVision`), then writes the saved weights over the new network by flat index. If the new agent's network shape differs from the saved one, weights are misaligned or `undefined`.
- **Export/Import**: JSON file of position, fitness, energy, and weights only (no species, age, generation). Import reuses the same load path.
- Loading resets the sim (`resetKey`) and rebuilds species from the loaded agents.

## UI features (as implemented)

| Feature                 | Notes                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Canvas navigation       | Drag to pan, wheel to zoom, touch pan/pinch; Camera is a translate and scale transform                                  |
| Agent selection         | Click to select; opens DNA panel                                                                                        |
| DNA panel               | Tabs: Genome (traits, double-helix canvas from network weights), Genealogy (family tree), Network (neural network view) |
| Family tree             | Built from `agentHistory` (a Map of every agent ever seen, never pruned)                                                |
| Species stats and chart | Per-species population from live agents                                                                                 |
| Evolution stats         | Gen (always 0), species, avg/max fitness, chart of up to 51 samples                                                     |
| Sidebar                 | Pause/reset, speed slider, stats, fullscreen, config editor                                                             |
| Agent Builder           | Custom traits, click to place, multi-place mode for same species                                                        |
| Save/Load               | See above                                                                                                               |
| Trails                  | `R` toggles                                                                                                             |
| Keyboard                | `Space` pause, `Esc` closes DNA panel, `R` trails                                                                       |
| Desktop                 | Electron shell with auto-updater config; web deploy via GitHub Pages workflow                                           |

Unused components in the tree: `SimulationCanvas.tsx`, `ConfigPanel.tsx`, `ControlPanel.tsx`, `StatsDisplay.tsx` (no importers).

## Documented but incomplete or inaccurate

| Claim (README / docs)                                                                | Reality                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Generational evolution", "watch hundreds of generations"                            | No global generations exist; `generationTime` is loaded and ignored; `EvolutionManager.generation` is never incremented, so the sidebar "Gen" is always 0       |
| "True crossover", "crossover and mutation" of brains                                 | `NeuralNetwork.crossover` and two-parent `transferWeightsFrom` exist but reproduction never calls them; children get fresh random brains                        |
| "Each unique genome creates a new species" (user guide)                              | Species are inherited by lineage; no genome comparison                                                                                                          |
| "Natural speciation without manual intervention"                                     | Not implemented                                                                                                                                                 |
| "Infinite world"                                                                     | Unbounded coordinates and free camera only                                                                                                                      |
| "Selection: end of generation, top performers selected" (user guide)                 | No selection phase; only death by starvation/age plus energy-gated reproduction                                                                                 |
| Speed up to 500×                                                                     | Capped at 3 steps per frame                                                                                                                                     |
| Config: `selectionRate`, `mutationRate`, `reproductionThreshold` (EvolutionSettings) | Only `populationSize` and `maxAge` have real effect; `selectionRate` only sizes the elite pool; `MutationRate: 2` in JSON is inconsistent with the 0.05 default |
| Save/load "saves your population"                                                    | Loses traits, lineage, food, species, and can corrupt brains                                                                                                    |

## Known inconsistencies

- `AgentCount` is 60, `PopulationSize` is 100; the reproduction cap (150) uses the latter.
- `AgentConfig.json` top-level `MovementSpeed`, `Sensor`, `NeuralNetwork.MutationStrategy`, and `FoodSettings.SpawnPoint` largely duplicate or are unused versus per-agent traits.
- `Agent` constructor's `_width`/`_height` params are ignored; size comes from traits.
- Fitness starts at 100 and decays, so newborn fitness is not comparable to lived fitness.
- Species baseline traits are only a starting template; live agents diverge, so a species' "baseline" does not describe its members.
