# Prototype v0.1: bug inventory

Scope: defects in the tagged prototype (`prototype/v0.1`, `fa853d4`). These inform the rewrite; they are **not** to be fixed in the prototype.

Priority: **P0** blocks the rewrite's principles, **P1** must be designed out of the new engine, **P2** worth avoiding, **P3** minor.
Each row names the roadmap phase where the rewrite addresses it.

## Simulation correctness

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| SIM-1 | P0 | Offspring get fresh random neural networks; parent weights are not inherited | `EvolutionManager.update` calls `child.rebuildNeuralArchitecture()` after copying traits | 4 |
| SIM-2 | P0 | Brain crossover is defined but never used in reproduction | `NeuralNetwork.crossover` and two-parent `transferWeightsFrom` have no reproduction call sites | 4 |
| SIM-3 | P0 | Species IDs do not represent genetic compatibility; children copy the parent's species, no distance metric, no splits | `SpeciesManager`, `Agent` constructor | 6 |
| SIM-4 | P0 | Silent population recovery: emergency spawning and full repopulation at extinction | `EvolutionManager.update`, `ExtinctionMitigation` config | 3 |
| SIM-5 | P1 | Global generation model is documented but not implemented; `generation` counter never advances (Gen always 0) | `EvolutionManager.generation`, `App.tsx` stats | 3 |
| SIM-6 | P1 | `generationTime`, `selectionRate` (partly), `mutationRate`, `reproductionThreshold` in `EvolutionConfig` do nothing | `EvolutionManager`, `loadConfig.ts` | 1-2 |
| SIM-7 | P1 | `mutationRate` trait is not used for trait mutation (fixed ±10% of range) | `Agent.inheritTraits` | 4 |
| SIM-8 | P1 | Trait mutation picks one random gene with cascading probability; not per-gene rates, no circular/integer handling beyond ad hoc rounding | `Agent.inheritTraits` | 4 |
| SIM-9 | P1 | Multiple agents can eat the same food item in one frame; no claiming/resolution | `handleFoodCollisions` | 2 |
| SIM-10 | P1 | `aggression` has no interaction effect, only weights sensor inputs | `Agent.update` | 3, 6 |
| SIM-11 | P2 | Fitness is a heuristic display value; newborns start at 100 and decay, mixing with elite selection | `Agent.updateFitness`, `initializeGenePool` | 5 |
| SIM-12 | P2 | Reproduction cap `populationSize × 1.5` is a hard-coded multiplier and doubles as a population controller | `EvolutionManager.update` | 3 |
| SIM-13 | P2 | Deleting extinct species drops all species history | `SpeciesManager.removeExtinctSpecies` | 6 |
| SIM-14 | P2 | Species baseline traits are a snapshot; do not describe living members | `SpeciesManager` | 6 |

## Determinism and architecture (cross-cutting; recorded under simulation correctness)

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| ARC-1 | P0 | `Math.random()` used throughout core simulation; no seed, no reproducibility | `Agent`, `EvolutionManager`, `SpeciesManager`, `NeuralNetwork`, `ClusterManager` | 2 |
| ARC-2 | P0 | `Agent` owns simulation state, genetics, brain, sensing, and canvas rendering | `Agent.ts` (936 lines, `render*` methods) | 1-3 |
| ARC-3 | P0 | Frame-driven timing; results depend on refresh rate and frame stalls | `SimulationCanvasNew.animate` | 2 |
| ARC-4 | P1 | Core classes import JSON config directly and read it via `any`; no typed/validated config | `AgentConfig.json` usage | 1-2 |
| ARC-5 | P1 | Species/Agent use static mutable globals (`Agent.speciesManager`, `Agent.maxAge`, `Agent.trailsEnabled`) | `Agent.ts` | 2 |
| ARC-6 | P1 | Time-of-creation uses `Date.now()` for species metadata | `SpeciesManager` | 2 |

## Performance

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| PERF-1 | P1 | Sensing and food collision are O(agents × food) with no spatial index | `Sensor.update`, `checkFoodCollision` | 9 (design in 2) |
| PERF-2 | P1 | Mate search filters the full agent list per offspring | `EvolutionManager.update` | 9 |
| PERF-3 | P1 | Speed controls (to 500×) capped at 3 steps/frame; UI implies throughput that does not exist | `stepsPerFrame` | 9 |
| PERF-4 | P1 | `agentHistory` Map retains every Agent object forever; unbounded growth | `App.tsx` `handleAgentsChange` | 3, 9 |
| PERF-5 | P2 | Array clone + React state update on every frame (`onAgentsChange([...])` called twice per frame) | `SimulationCanvasNew` | 7 |
| PERF-6 | P2 | `Math.max(...agents.map(...))` on large arrays risks stack limits | `EvolutionManager` stats | 9 |

## Persistence

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| PER-1 | P0 | Saves omit traits, IDs, parents, memory, cluster, food, species, gene pool, stats, config, RNG state | `SaveLoadPanel.handleSave` | 8 |
| PER-2 | P0 | Load builds default-trait agents and overwrites weights by flat index; shape mismatch silently corrupts brains (random `colorVision` changes input size) | `SaveLoadPanel.handleLoad` | 8 |
| PER-3 | P1 | Export omits species, age, generation; import reuses the loader | `handleExport`/`handleImport` | 8 |
| PER-4 | P1 | No schema version, no validation; `JSON.parse` result is cast | `SaveLoadPanel` | 8 |
| PER-5 | P2 | Saves in `localStorage` have no size handling and can throw on quota | `SaveLoadPanel` | 8 |

## UI state

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| UI-1 | P0 | React receives live, mutable simulation objects | `onAgentsChange`, `selectedAgent`, `agentHistory` | 7 |
| UI-2 | P1 | Sidebar "Gen" always displays 0 | `stats.generation` | 7 |
| UI-3 | P2 | `selectedAgent` is a live object reference; stale after death | `App.tsx` | 7 |
| UI-4 | P2 | Unused components remain in the tree (`SimulationCanvas`, `ConfigPanel`, `ControlPanel`, `StatsDisplay`) | grep for importers | 7 |
| UI-5 | P3 | `handleConfigChange` resets the simulation on any config edit | `App.tsx` | 7 |

## Rendering

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| REN-1 | P1 | Rendering is a method on `Agent` and depends on Canvas 2D; sim cannot run without it | `Agent.render*` | 1, 7 |
| REN-2 | P2 | Per-frame full redraw with shadowBlur and per-segment trail strokes; no culling of off-screen agents | `Agent.render`, `renderTrail` | 7, 9 |
| REN-3 | P3 | Agent scale by age also changes collision radius (simulation coupled to visual scale) | `getAgeScale`, `checkFoodCollision` | 3 |

## Configuration

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| CFG-1 | P1 | Duplicate/conflicting settings: `AgentCount` 60 vs `PopulationSize` 100; `EvolutionSettings.MutationRate: 2` vs default 0.05 | `AgentConfig.json`, `loadConfig.ts` | 1-2 |
| CFG-2 | P1 | Several config sections unused (`Sensor`, `MovementSpeed`, `FoodSettings.SpawnPoint`, `MutationStrategy` partly) | grep | 1-2 |
| CFG-3 | P2 | No validation; invalid values fail silently or produce NaN (e.g. zero clusters is only clamped in one place) | config consumers | 2 |

## Documentation

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| DOC-1 | P1 | README and docs describe generational selection and true crossover that are not implemented | see "Documented but incomplete" in `prototype-behavior.md` | 10 |
| DOC-2 | P1 | "Infinite world" is unbounded coordinates, not a streamed world | README, `Camera.ts` | 10 |
| DOC-3 | P2 | User guide says each unique genome forms a new species | `docs/user-guide.md` | 10 |
| DOC-4 | P3 | Speed range advertised as up to 500× | Sidebar, docs | 10 |

## Build / release

| ID | P | Bug | Evidence | Rewrite phase |
| --- | --- | --- | --- | --- |
| BLD-1 | P2 | ESLint reports ~16.7k CRLF `prettier/prettier` warnings on Windows checkouts (`autocrlf=true`); needs `.gitattributes` / `endOfLine` policy | `npm run lint` | 1 |
| BLD-2 | P2 | Local `node_modules` can drift from `package.json` (`bootstrap` missing broke `build:web`); no clean-install check in CI verified for this repo | reproduced 2026-09-19 | 1 |
| BLD-3 | P3 | Electron and packaging builds not verified in Phase 0 | not run | 9 |
| BLD-4 | P3 | Old build directory was deleted from history (`36b28af`); `dist/` is generated locally only | git log | n/a |

## Roadmap examples: confirmation status

| Roadmap example | Status |
| --- | --- |
| `generationTime` configured but unused | Confirmed (SIM-6) |
| Global generation behavior documented, not implemented | Confirmed (SIM-5, DOC-1) |
| NN crossover defined but not consistently used | Confirmed, and stronger: never used (SIM-2) |
| Offspring can get fresh networks | Confirmed, and stronger: always (SIM-1) |
| `Math.random()` throughout | Confirmed (ARC-1) |
| `Agent` owns sim, genetics, learning, rendering | Confirmed (ARC-2) |
| Species IDs not genetic compatibility | Confirmed (SIM-3) |
| React receives live sim objects | Confirmed (UI-1) |
| Save files omit important state | Confirmed (PER-1, PER-2) |
| High-speed controls do not match throughput | Confirmed (PERF-3) |
| "Infinite world" is not streamed | Confirmed (DOC-2) |

Additional finding not in the roadmap: the prototype silently repopulates on extinction (SIM-4), which the roadmap's principle 5 forbids.
