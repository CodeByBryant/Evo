# Ecology: health, resource kinds, regions, seasons, hazards, migration

Design and reasons: [ADR 0009](../decisions/0009-ecology-health-regions-seasons-hazards.md). Configuration: the `ecology` section in [configuration.md](../simulation/configuration.md). Defaults live in `packages/config/src/defaults.ts`; they were set by measurement (see "Measured behavior" at the end).

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

| Value               | Effect                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `movementScale`     | multiplies top speed (juvenile scaling still applies)                                                                                               |
| `visibility`        | multiplies the sensor radius (`(0, 1]`)                                                                                                             |
| `temperature`       | in `[-1, 1]`, 0 is comfortable; see environmental cost                                                                                              |
| `hazardExposure`    | multiplies hazard damage in the region                                                                                                              |
| `reproductionScale` | divides the reproduction **cost** (higher is cheaper); the threshold stays `max(minEnergy gene, cost)`, so it can never exceed what the cost allows |

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

## Measured behavior (Phase 6B)

Every feature is **on by default**. The defaults were not chosen by taste: the Phase 5 foragers cannot yet use most of the new inputs, so the world has to be survivable for them as it stands, and the first designed values were not (every seed went extinct). They were tuned by running the brain controller for 50,000 ticks (10,000 burn-in) over many seeds and scoring the stability criteria of the Phase 5 gate (mean population in (15, 40), never below 5, never above 60, never extinct). The measurements that shaped them:

| Finding                                                                                                                                                                                                                   | What it led to                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Each feature alone is survivable; combined they were not, because perception penalties **multiply** (region visibility x season visibility x kind detectability) and the worst case left a forager about 40% of its sight | region, season and kind visibility penalties are all small nudges                                                  |
| Dividing both the reproduction **threshold** and cost by the scale made winter and volcanic terrain forbid reproduction outright (threshold above the energy cap)                                                         | the scale divides only the **cost**; the threshold is `max(minEnergy, cost)`                                       |
| Volcanic terrain hosted no resource kind at all, so a forager born on a big volcanic map starved (seeds with 18-31% volcanic cells failed)                                                                                | toxic fungus also grows in volcanic terrain and nectar in the desert: dangerous regions are risky, not empty       |
| Seasons were the largest single drag (removing them lifted the average mean population from 15.5 to 28.7 in one comparison): a deep winter spawn drop produced boom-and-bust cycles                                       | seasons are mild on supply (winter spawn 0.95) and act through temperature, reproduction cost and hazard intensity |
| Average resource energy at about twice the Phase 5 level doubled carrying capacity (means 35-49, peaks to 77)                                                                                                             | kind energies were scaled back (average about 1.3x baseline)                                                       |
| With only 12 region points one unlucky map decided the outcome                                                                                                                                                            | 30 points, so maps are more even                                                                                   |

With the final defaults, over **32 seeds** (16 used while tuning, 16 held out) at 50,000 ticks, **30 meet the stability criteria and one goes extinct** (seed 20, at tick 35,500); the four gate seeds (1-4) all pass. The Phase 5 world (ecology off) went 16 of 16 on the same seeds with no extinctions, so the ecology does make worlds more fragile.

The residual risk is **demographic, not environmental**. In a failing world the surviving organisms are well fed (average energy 60-85, food piling up at the resource cap) but births keep falling: at 5-15 animals in a 500 x 500 world, partners rarely meet (an Allee effect), and the Phase 5 brain has no drive to seek mates (its innate prior only seeks food). Extinction is a legitimate outcome in Evo, and nothing here hides it, but a default world has roughly a one-in-thirty chance of ending this way within 50,000 ticks. Fixing it properly means giving the brain a reason to find partners (a prior or a learned drive), which is future work, not a parameter.

Individual seeds are chaotic: changing one default flips which seeds survive. Judge a change by the pass rate over many seeds, not by a single run.
