# Ecology: health, resource kinds, regions, seasons, hazards, migration

Design and reasons: [ADR 0009](../decisions/0009-ecology-health-regions-seasons-hazards.md). Configuration: the `ecology` section in [configuration.md](../simulation/configuration.md). Defaults live in `packages/config/src/defaults.ts`; they are provisional and set by measurement (see "Measured behavior" once Phase 6B lands).

Every feature has an `ecology.<feature>.enabled` switch. A feature that is off draws no randomness, costs no energy and changes nothing, so a world with every switch off is the Phase 5 world.

## Health and damage

- `health` is stored per organism and hashed. `maxHealth = ecology.health.maxHealth * sizeFactor` (the same body-size factor as energy capacity). Organisms are born at full health.
- `HealthSystem` runs after Interaction and before Metabolism. For each organism, in ascending id:
  1. **Damage** = hazard damage + toxin damage. Hazard damage sums, over every hazard circle containing the organism, `damagePerSecond * regionExposure * seasonIntensity * dt` (the last two factors are 1 when regions or seasons are off). Toxin damage is the `toxicity` of the resource kind the organism ate this tick, written by `InteractionSystem` into the `DamageBuffer`.
  2. If damage > 0: `health -= damage` and one `organism-damaged` event (`amount`, `source: 'hazard' | 'toxin' | 'both'`, `healthAfter`) is recorded.
  3. If there was no damage, `health < maxHealth` and `energy >= regenMinEnergyFraction * maxEnergy`: heal `min(regenRate * dt, maxHealth - health)`; the energy that costs (`healed * regenEnergyCost`) is written to the `RegenBuffer` and charged by Metabolism.
- `DeathSystem`: `energy <= 0` is `starvation`; otherwise `health <= 0` is `damage`; otherwise `age >= maxAge` is `age`.
- With `health.enabled: false`, health stays at maximum and nothing damages anything.

## Resource kinds

`ecology.resourceKinds.kinds` is an ordered list; a resource stores its index as `kind`. Per kind:

| Field                  | Meaning                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `name`                 | label only                                                     |
| `energyScale`          | energy of one resource = `resources.energyValue * energyScale` |
| `radiusScale`          | radius = `resources.radius * radiusScale`                      |
| `spawnWeight`          | relative chance that a spawn is this kind                      |
| `detectability` (0, 1] | multiplier on the distance at which an organism can sense it   |
| `toxicity` >= 0        | health damage when eaten                                       |
| `regions`              | region types it grows in (empty means everywhere)              |

Spawning with kinds on: choose a kind by weight (one `environment` draw), then place it (two draws per attempt, up to 8 attempts) at a position whose region allows the kind. If no attempt succeeds the spawn is dropped, so a kind whose regions do not exist on this map never appears. With kinds off every resource is kind 0 at the Phase 5 energy and radius, drawn exactly as before.

## Regions

`RegionMap` is built once from the `terrain` stream: `seedCount` points, each with a random type; each cell of a `gridSize x gridSize` lookup grid is assigned to its nearest point (ties: lower index). Types and their per-type values:

| Value               | Effect                                                         |
| ------------------- | -------------------------------------------------------------- |
| `movementScale`     | multiplies top speed (juvenile scaling still applies)          |
| `visibility`        | multiplies the sensor radius (`(0, 1]`)                        |
| `temperature`       | in `[-1, 1]`, 0 is comfortable; see environmental cost         |
| `hazardExposure`    | multiplies hazard damage in the region                         |
| `reproductionScale` | divides the reproduction threshold and cost (higher is easier) |

**Environmental cost** (the term ADR 0005 deferred): `excess = max(0, |temperature| - temperatureTolerance)`, `environmentalCost = temperatureCost * excess * excess` energy per second, where `temperature` is the region's temperature plus the season's offset, clamped to `[-1, 1]`. It is added to the metabolism sum before the juvenile scale.

## Seasons

`season = floor(time / seasonLength) mod 4` (spring, summer, autumn, winter), a pure function of the clock. Each season has `regeneration` (multiplies the resource spawn rate), `movementScale`, `hazardIntensity` (multiplies hazard damage and the storm rate), `reproductionScale`, `temperature` (offset) and `visibility`. Movement, visibility and reproduction multiply the region's.

## Hazards

- **Damage areas**: `areaCount` circles of radius `areaRadius`, placed once at creation (terrain stream): up to 16 attempts per area to land in a region with `hazardExposure > 0`; an area that finds none is dropped. They never move or expire.
- **Storms**: each tick the storm accumulator gains `stormRate * hazardIntensity * dt`; each whole unit spawns a storm at a uniform position (two `events` draws) with radius `stormRadius`, lasting `stormDuration` seconds, dealing `stormDamage` per second. Expired storms are removed at the start of the next tick; both events `hazard-spawned` and `hazard-expired` are recorded.
- **Poison** is resource toxicity. **Heat** is temperature plus environmental cost.

Hazards are stored in a `HazardStore` (ascending id), hashed with their id counter.

## Migration

`MigrationSystem` runs after Movement and updates a derived, unhashed `MigrationTracker`: home region (index and type at birth), current region, number of region crossings, distance travelled while outside the home region, and `migrated` (continuously in a region other than home for at least `dwellTime` seconds). `World.migrationOf(organismId)` returns it while alive; the summary is copied onto `HistoricalOrganismRecord.migration` at death.

## What the brain sees

Observation slots 23-32 (`OBSERVATION_LABELS` in `@evo/contracts`):

| Slot  | Label                 | Value                                                                                                                                                          |
| ----- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 23    | `ownHealth`           | `health / maxHealth`                                                                                                                                           |
| 24-27 | `hazard*`             | nearest hazard whose edge is within the sensor radius: present, bearing cos/sin (relative to heading), proximity (1 inside, falling to 0 at the sensor radius) |
| 28    | `foodKind`            | the perceived food's kind index divided by `kinds - 1` (0 when none or one kind)                                                                               |
| 29-30 | `seasonCos/Sin`       | year phase, `0` when seasons are off                                                                                                                           |
| 31    | `regionTemperature`   | region + season temperature in `[-1, 1]`, `0` when both are off                                                                                                |
| 32    | `regionMovementScale` | region x season movement multiplier, `1` when both are off                                                                                                     |

Reward: `damage = damageWeight * (damageTaken / maxHealth) * (1 - riskTolerance)` is subtracted; `exploration = explorationWeight * noveltyPreference` is added the first time per life the organism enters each cell of an 8 x 8 grid over the world. See [docs/learning/brain.md](../learning/brain.md).
