# 0009: Ecology (health, resource kinds, regions, seasons, hazards, migration)

Status: **Accepted** (approved by the project owner with the Phase 6 plan, 2026-10-31)

## Problem

Through Phase 5 the world is one uniform rectangle with one kind of food and no way to be hurt except by starving. Roadmap Phase 6 (6.5-6.9) asks for a genuine ecosystem: several resource types, environmental regions, seasons, hazards that damage organisms, and migration, so that different places and times favor different strategies and "at least two distinguishable ecological niches" can arise. Phase 5 deliberately left room: the observation has no `ownHealth`, the reward has no `damage` term, the genes `riskTolerance` and `noveltyPreference` are carried but unread, and `environmentalCost` was deferred (ADR 0005, ADR 0007).

Phase 6 is two PRs (owner decision). Speciation was ADR 0008. This ADR is the second.

Owner decisions taken before this ADR:

- **Health is a separate stored pool**, not a view of energy. Damage can then kill (death cause `damage`) independently of starvation, and the brain can perceive and learn about it.
- **The brain gets the new inputs now**, appended at the end of the observation so no existing slot moves.

## Decision

Every feature has an `enabled` switch under a new top-level `ecology` config section, **all on by default** (tuned by measurement, see docs/ecology/ecology.md). With a switch off the feature draws no randomness, consumes no energy and changes nothing; with all of them off the world behaves exactly as it did in Phase 5. That is the permanent regression (reflex controller, mutation off, all features off), proven against the previous commit by an equivalence harness.

### Health and damage

`OrganismState.health` (hashed). `maxHealth = ecology.health.maxHealth * sizeFactor`, so larger bodies are sturdier, as capacity already is. Founders and newborns start at full health. A new `HealthSystem` (after interaction, before metabolism) owns `health`:

- applies damage from hazards the organism stands in and from toxins it ate this tick (written by `InteractionSystem` into a `DamageBuffer`), emitting one `organism-damaged` event per damaged organism per tick;
- if the organism took no damage this tick and its energy is above a fraction of its capacity, heals up to `regenRate * dt`, and records the energy that costs in a `RegenBuffer`, which `MetabolismSystem` charges (energy stays owned by metabolism).

`DeathSystem` kills at `health <= 0` with cause `damage` (checked after starvation, before age). The `environment` death cause stays unused.

### Resource kinds

`ResourceState.kind` is an index into `ecology.resourceKinds.kinds`. Each kind has an energy scale and radius scale (relative to `resources.energyValue`/`radius`, which stay the baseline), a `spawnWeight`, a `detectability` in `(0, 1]` (it shrinks the distance at which the kind can be sensed), a `toxicity` (health damage when eaten) and the region types it grows in. Defaults: grass, fruit, fungus, nectar. With the switch off every resource is kind 0 and spawning is identical to Phase 5.

**Deferred** from roadmap 6.5: `water` and `prey` (prey needs predators, which the roadmap itself defers past the alpha), resource mobility, consumption time and competition level.

### Regions

A `RegionMap` is built once at creation from the new `terrain` random stream: `seedCount` points, each with a random region type, and every cell of a `gridSize x gridSize` lookup grid belongs to its nearest point (a Voronoi diagram; ties go to the lower point index). It is static, so it is not hashed. The six types (meadow, forest, wetland, desert, cave, volcanic) differ in `movementScale` (a top-speed multiplier), `visibility` (a sensor-radius multiplier), `temperature`, `hazardExposure` (a damage multiplier), `reproductionScale` (a divisor of the reproduction cost; the threshold stays `max(minEnergy, cost)`) and the resources they grow.

### Seasons

Four seasons, each `seasonLength` seconds long, a pure function of the clock (no state, no randomness). Each has multipliers for resource regeneration, movement, hazard intensity, reproduction, visibility and a temperature offset. The brain sees the year phase as a cosine and a sine.

### Hazards

- **Damage areas**: static circles placed at creation (terrain stream) in regions with hazard exposure, dealing `damagePerSecond` to anything inside.
- **Storms**: temporary circles spawned during the run from the `events` stream (reserved since Phase 2, first used here), at an expected rate scaled by the season's hazard intensity, with a fixed radius and duration.
- **Poisonous resources**: kind toxicity, above.
- **Heat** is not a separate object: regions and seasons carry a temperature, and `MetabolismSystem` charges the new `environmentalCost` for being outside the comfortable range. This is the term ADR 0005 deferred.

Hazards are simulation state (storms appear and expire), so they and the storm/spawn accumulators are hashed.

### Brain: ten new inputs, two new reward terms, two genes become live

Observation slots 23-32 (labels in `@evo/contracts`): `ownHealth`, hazard `present/bearingCos/bearingSin/proximity`, `foodKind`, `seasonCos`, `seasonSin`, `regionTemperature`, `regionMovementScale`. `OBSERVATION_SIZE` becomes 33 and the genome gains `8 * 10 = 80` input weights. The innate prior is unchanged because no existing slot moves.

`RewardBreakdown` gains `damage` and `exploration`. **`riskTolerance` scales the damage penalty** (`1 - riskTolerance`: a reckless organism minds damage less). **`noveltyPreference` scales a small reward for entering a coarse cell of the world it has not visited in its life**, tracked as a per-organism bitset in `BrainState` (hashed). Both are bounded and small by default; survival is still never rewarded.

### Migration

A derived, unhashed `MigrationTracker` records each organism's home region (where it was born), its current region, region crossings, distance travelled outside its home region, and whether it migrated (spent at least `dwellTime` seconds continuously in a different region). `World.migrationOf(id)` exposes it and a summary is kept on the historical record.

### Randomness and hashing

- `environment`: draws only when kinds or regions are on (kind choice, region-aware placement); with them off the draws are exactly Phase 5's.
- `terrain` (new, last in `STREAM_NAMES`): the region map and static hazards, drawn once at creation, only when those features are on.
- `events`: storm spawning, only when storms are on.
- Hash schema **v5** appends: per organism `health` and the brain's visited bitset and new reward fields; per resource `kind`; the hazard list and its id counter; the metrics `deathsByDamage` and `damageTaken`; the environment's spawn and storm accumulators (which were already simulation state that the hash missed). Because the header carries the version, every golden hash changes; behavior equivalence is shown by the equivalence harness instead.

## Alternatives considered

- **Health derived from energy.** No new state, but damage deaths become indistinguishable from starvation and the damage reward and `ownHealth` input are cosmetic. Rejected (owner decision).
- **A separate `DamageSystem` per source.** More systems and more ordering rules for the same effect; one `HealthSystem` with buffers is simpler to reason about.
- **Smooth noise terrain.** Prettier maps, but needs a noise function built only from the engine's own trig and more tuning. Voronoi regions from the seeded stream are simple, deterministic and enough for niches.
- **Sinusoidal seasons.** Smooth, but the step form is easier to test and to document; the brain still receives a continuous phase.
- **Heat-zone hazard objects.** Redundant with region/season temperature plus `environmentalCost`.

## Consequences

- With every `ecology` switch off the engine is Phase 5; the switch-off configuration keeps its own golden entries.
- Brain mode: 33 inputs instead of 23, so `genetics` stream draws, genome size (314 to 394 weights) and every brain-mode golden change. Reflex-mode behavior is unchanged but its golden hashes change with the schema version.
- The defaults must keep the 50,000-tick stability gate (mean population 15-40, never below 5 or above 60, never extinct). They are tuned by measurement, not the gate.
- Perception gets slower when kinds, regions or seasons are on, because detectability and visibility are applied per hit; with them off the cheaper nearest-neighbour scan is kept.
- Cost of everything above is bounded by small fixed numbers: a handful of hazards and regions.
