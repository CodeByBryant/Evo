# Simulation update order

`World.step()` is a flat, unconditional list of calls. Ordering is controlled **only** by `World`; systems never call, import, or hold references to each other.

```text
World.step()
  clock.advance()
  environment.update()
  spatial.rebuild()          // world-owned service, not a system
  perception.update()
  decision.update()
  movement.update()
  interaction.update()
  metabolism.update()
  reproduction.update()      // intentional no-op until Phase 3
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

| Stage        | Reads                                                          | Writes (owns)                                                                | Emits                                            |
| ------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| clock        | -                                                              | clock (`tick`, `time`)                                                       | -                                                |
| environment  | config, `environment` stream, resource count                   | resource store (spawn)                                                       | `resource-spawned`                               |
| spatial      | organism and resource stores (ascending id)                    | spatial index (rebuilt from scratch each tick)                               | -                                                |
| perception   | organisms, spatial index, config                               | perception buffer (nearest resource per organism; ties by `(distance², id)`) | -                                                |
| decision     | perception buffer, organisms (heading), `world` stream, config | intent buffer (turn, thrust); placeholder controller until Phase 5           | -                                                |
| movement     | intent buffer, config, clock                                   | organism position, velocity, heading (clamped to the world rectangle)        | `organism-moved` (verbose only)                  |
| interaction  | organisms, spatial index, config                               | resource `remaining` and removal; organism `energy` (**gain** only)          | `resource-consumed`, `energy-changed` (verbose)  |
| metabolism   | organisms, config, clock                                       | organism `energy` (**cost** only), organism `age`                            | `energy-changed` (verbose)                       |
| reproduction | -                                                              | nothing (reserved; will own organism creation in Phase 3)                    | (`reproduction-attempted` reserved, not emitted) |
| death        | organisms, config                                              | organism store (removal)                                                     | `organism-died` (`starvation` or `age`)          |
| metrics      | events emitted this tick, stores                               | metrics collector, `extinctionTick`                                          | -                                                |

`organism.energy` is the only field with two writers: interaction may only **add** (capped at `maxEnergy`; overflow is reported as wasted), metabolism may only **subtract**. The stage order fixes which happens first.

## Stage rules

1. **Clock**: `tick += 1`, `time = tick * deltaTime`.
2. **Environment**: expected spawns per tick are `resources.spawnRate * deltaTime`; the fractional remainder is carried deterministically; spawning never exceeds `resources.maxCount`. Positions come from the `environment` stream.
3. **Spatial rebuild**: uniform grid, cell size equal to the sensor radius; entries inserted in ascending id order; queries return candidates sorted by `(distance², id)`.
4. **Perception**: nearest resource within `sensorRadius`, else none.
5. **Decision**: seek the perceived resource, otherwise wander (heading noise from the `world` stream). This is a labelled placeholder replaced by the brain in Phase 5.
6. **Movement**: speed bounded by `maxSpeed`; position clamped inside the world rectangle.
7. **Interaction**: organisms are processed in ascending id; an organism within `radius + resource.radius` of a resource consumes it; a resource is never consumed twice in a tick; energy gain is capped at `maxEnergy`.
8. **Metabolism**: `cost = basalCost + movementCost * speed²` per unit time, plus `age += deltaTime`. The formula is explicit and unit-tested.
9. **Reproduction**: no-op.
10. **Death**: in ascending id; `energy <= 0` gives `starvation`, `age >= maxAge` gives `age`; the organism is removed from the active store in the same stage.
11. **Metrics**: counters derived from this tick's events; sets `extinctionTick` the first tick the active population is zero (never cleared, never triggers a respawn).

## Extinction

With the default `extinctionPolicy: 'stop'`, extinction is reported, the clock and environment keep advancing, and no organism ever appears unless an explicit event creates one. Other policies arrive in Phase 3.
