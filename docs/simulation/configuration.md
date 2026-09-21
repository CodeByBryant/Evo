# World configuration

`WorldConfig` (in `@evo/contracts`) describes everything that shapes a world except its **seed**. Defaults and validation live in `@evo/config`.

```ts
import { resolveWorldConfig } from '@evo/config'

const config = resolveWorldConfig({ organisms: { initialCount: 10 } })
```

`resolveWorldConfig` merges partial overrides onto `DEFAULT_WORLD_CONFIG` section by section, validates the result, and either returns a fresh mutable copy or throws a `ConfigValidationError` that lists **every** problem:

```text
Invalid world configuration:
  - timestep must be greater than zero
  - resources.spawnRate must be nonnegative
```

`validateWorldConfig(value: unknown)` checks a complete configuration of unknown origin (such as parsed JSON) and returns `{ ok, errors }`. Validation only reports; it never repairs or clamps a value. NaN and infinities are rejected, and unknown property names are reported so typos are caught.

Seeds are validated separately with `validateSeed`: an integer in `[0, 4294967295]`.

Units: time is in **seconds** (one tick advances time by `timestep`), distance in world units, energy in arbitrary units.

| Field                          | Rule                                    | Meaning                                                 |
| ------------------------------ | --------------------------------------- | ------------------------------------------------------- |
| `timestep`                     | > 0                                     | Seconds of simulated time per tick                      |
| `maxPopulation`                | integer, > 0                            | Population ceiling                                      |
| `extinctionPolicy`             | `'stop'` (only value implemented)       | What happens when the population reaches zero           |
| `environment.width`, `.height` | > 0                                     | World rectangle                                         |
| `organisms.initialCount`       | integer, >= 0, <= `maxPopulation`       | Founders created at tick 0                              |
| `organisms.initialEnergy`      | > 0, <= `maxEnergy`                     | Starting energy                                         |
| `organisms.maxEnergy`          | > 0                                     | Capacity; overflow is wasted                            |
| `organisms.radius`             | > 0, < half the smaller world dimension | Body radius                                             |
| `organisms.maxSpeed`           | >= 0                                    | Units per second                                        |
| `organisms.maxTurnRate`        | >= 0                                    | Radians per second                                      |
| `organisms.sensorRadius`       | > 0                                     | Perception distance (also the spatial grid cell size)   |
| `organisms.wanderJitter`       | >= 0                                    | Wander heading change, radians per second               |
| `organisms.basalCost`          | >= 0                                    | Energy per second for being alive                       |
| `organisms.movementCost`       | >= 0                                    | Energy per second per squared unit of speed             |
| `organisms.maxAge`             | > 0                                     | Seconds until death by age                              |
| `resources.initialCount`       | integer, >= 0, <= `maxCount`            | Resources at tick 0                                     |
| `resources.maxCount`           | integer, >= 0                           | Cap on simultaneous resources                           |
| `resources.spawnRate`          | >= 0                                    | Expected new resources per second                       |
| `resources.energyValue`        | > 0                                     | Energy one resource provides                            |
| `resources.radius`             | > 0, < half the smaller world dimension | Resource radius                                         |
| `history.maxEvents`            | integer, >= 0                           | Retained events (`0` keeps none)                        |
| `history.eventDetail`          | `'essential'` or `'verbose'`            | Whether per-tick movement and energy events are emitted |

The defaults are provisional and tuned by the engine's scenario tests. Determinism tests pin their configuration explicitly, so changing a default never changes a golden hash. The configuration is not part of the state hash (see [determinism.md](determinism.md)).
