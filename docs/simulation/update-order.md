# Simulation update order

`World.step()` is a flat, unconditional list of calls. Ordering is controlled **only** by `World`; systems never call, import, or hold references to each other.

```text
World.step()
  clock.advance()
  environment.update()
  spatial.rebuild()          // world-owned service, not a system; both the resource and organism indices
  perception.update()
  decision.update()
  movement.update()
  interaction.update()
  metabolism.update()
  reproduction.update()      // Phase 3: local reproduction (see "Reproduction" below)
  death.update()
  metrics.update()           // also records extinctionTick
  (optional) validate() every `validateEveryTicks` ticks
```

Initial population and resources are created once in `World.create` (setup, not a system). Setup emits `organism-born` events at tick 0.

## The one rule

> System N may only mutate the state it owns and emit typed events. Ordering is controlled exclusively by `World`.

- Data crosses stages only through **world-owned buffers** (perception results, intents) and the entity stores.
- A system depends on shared services (`random` streams, `spatial`, `events` sink, `clock`, `config`), never on another system.
- Every important state transition emits a typed event, so metrics and debugging never need to peek into another system.
- `tools/check-dependency-rules.mjs` fails the build if a file under `systems/` imports a sibling system or anything under `world/`.

## Per-system reads and writes

| Stage        | Reads                                                          | Writes (owns)                                                                                                       | Emits                                           |
| ------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| clock        | -                                                              | clock (`tick`, `time`)                                                                                              | -                                               |
| environment  | config, `environment` stream, resource count                   | resource store (spawn)                                                                                              | `resource-spawned`                              |
| spatial      | organism and resource stores (ascending id)                    | resource index and organism index (both rebuilt from scratch each tick)                                             | -                                               |
| perception   | organisms, resource index, config                              | perception buffer (nearest resource per organism; ties by `(distance², id)`)                                        | -                                               |
| decision     | perception buffer, organisms (heading), `world` stream, config | intent buffer (turn, thrust); placeholder controller until Phase 5                                                  | -                                               |
| movement     | intent buffer, config, clock                                   | organism position, velocity, heading (clamped to the world rectangle), organism `lastTurnMagnitude`                 | `organism-moved` (verbose only)                 |
| interaction  | organisms, resource index, config                              | resource `remaining` and removal; organism `energy` (**gain** only)                                                 | `resource-consumed`, `energy-changed` (verbose) |
| metabolism   | organisms (incl. `lastTurnMagnitude`), config, clock           | organism `energy` (**cost** only), organism `age`                                                                   | `energy-changed` (verbose)                      |
| reproduction | organisms, organism index, `reproduction` stream, config       | organism store (creates children); organism `energy` (**cost** only, both parents); `reproductionCooldownRemaining` | `organism-born`, `reproduction-attempted`       |
| death        | organisms, config                                              | organism store (removal); history store (append)                                                                    | `organism-died` (`starvation` or `age`)         |
| metrics      | events emitted this tick, stores                               | metrics collector, `extinctionTick`                                                                                 | -                                               |

`organism.energy` has three writers, never overlapping in what they do: interaction **adds** (capped at `maxEnergy`; overflow reported as wasted), metabolism **subtracts**, reproduction **subtracts** (a fixed cost from each successful parent). The stage order fixes the sequence: gain, then metabolic cost, then reproductive cost, each tick.

## Stage rules

1. **Clock**: `tick += 1`, `time = tick * deltaTime`.
2. **Environment**: expected spawns per tick are `resources.spawnRate * deltaTime`; the fractional remainder is carried deterministically; spawning never exceeds `resources.maxCount`. Positions come from the `environment` stream.
3. **Spatial rebuild**: two uniform grids, one over resources (cell size = `organisms.sensorRadius`) and one over organisms (cell size = `reproduction.searchRadius`); entries inserted in ascending id order; queries return candidates sorted by `(distance², id)`.
4. **Perception**: nearest resource within `sensorRadius`, else none.
5. **Decision**: seek the perceived resource, otherwise wander (heading noise from the `world` stream). This is a labelled placeholder replaced by the brain in Phase 5.
6. **Movement**: speed bounded by `maxSpeed` (scaled by `juvenileSpeedScale` for juveniles); position clamped inside the world rectangle; the turn actually applied (after clamping to `maxTurnRate`) is recorded as `lastTurnMagnitude` for metabolism to read.
7. **Interaction**: organisms are processed in ascending id; an organism within `radius + resource.radius` of a resource consumes it (`radius` and effective `maxEnergy` scaled by `juvenileSizeScale` for juveniles); a resource is never consumed twice in a tick; energy gain is capped at the organism's effective `maxEnergy`.
8. **Metabolism**: `cost = (basalCost + movementCost*speed² + turningCost*lastTurnMagnitude² + sensorCost) * juvenileMetabolicScale (if juvenile, else 1)` per unit time, plus `age += deltaTime`. The formula is explicit and unit-tested (see ADR 0005 for why `learningCost`/`environmentalCost` from the roadmap sketch aren't included yet).
9. **Reproduction**: every organism's `reproductionCooldownRemaining` is first decremented by `deltaTime` (floored at zero); then organisms are processed in ascending id, each considered at most once as an initiator. An organism attempts only once it clears three silent gates (life stage is not `juvenile`, `reproductionCooldownRemaining <= 0`, `energy >= reproduction.minEnergy`); organisms that don't clear the gates simply don't attempt, no event. An attempting organism is blocked by, in order: the population cap (`organisms.size >= maxPopulation`), then the lack of an eligible, not-yet-paired partner within `searchRadius` - both produce a `reproduction-attempted` event with `succeeded: false`. On success, each parent pays `reproduction.energyCost` and its cooldown resets to `reproduction.cooldown`; the child starts at age 0, `energy = min(reproduction.offspringEnergy, maxEnergy)`, near the parents' midpoint, with `parentIds` in ascending order. See ADR 0005 for the full algorithm.
10. **Death**: in ascending id; `energy <= 0` gives `starvation`, `age >= maxAge` gives `age`; the organism is removed from the active store and a compact historical record is appended to the (bounded) history store in the same stage.
11. **Metrics**: counters derived from this tick's events; sets `extinctionTick` the first tick the active population is zero (never cleared - reproduction cannot revive an empty population, since it always requires at least one existing organism as a parent).

## Life stages

`juvenile` / `mature` / `senescent` is a pure function of `age` against `organisms.maturityAge` and `organisms.senescenceAge` (`maturityAge <= age < senescenceAge` is `mature`). It is never stored on the organism - every reader (Movement, Interaction, Metabolism, Reproduction, `snapshot()`) derives it fresh from the current age, the same way a resource's `energyValue` is read from config rather than cached per-resource.

## Extinction

With the default `extinctionPolicy: 'stop'`, extinction is reported, the clock and environment keep advancing, and no organism ever appears unless an explicit event creates one. Phase 3 makes reproduction real but does not implement the other three `ExtinctionPolicy` values; config validation continues to reject anything but `'stop'`.
