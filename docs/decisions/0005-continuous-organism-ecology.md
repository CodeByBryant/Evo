# 0005: Continuous organism ecology (reproduction, life stages, history)

Status: **Accepted** (approved by the project owner with the Phase 3 plan, 2026-09-26)

## Problem

Phase 2 built a headless, deterministic world where organisms move, sense, eat, pay metabolic costs, and die - but the population can only ever shrink. `ReproductionSystem` is an intentional no-op, `ReproductionAttemptedEvent` is defined but never emitted, and there is no notion of an organism's life stage. Phase 3 (roadmap, Nov 2-29 2026) turns this into a genuine perpetual ecology: local, continuous reproduction with cooldowns and costs, explicit life stages instead of raw age, and a compact historical record when an organism dies - all without introducing generations, genomes (Phase 4), or species (Phase 6).

Two behavioral forks were resolved with the project owner before this ADR:

- **Reproduction requires a partner.** No asexual fallback. If no eligible partner is within range this tick, the organism simply doesn't reproduce - no cost paid, cooldown untouched. This matches the roadmap's literal process (3.5) and Scenario C's two-parent test; there are no per-organism traits yet to make solo reproduction meaningfully different from cloning anyway.
- **Metabolism formula extended now, partially.** The roadmap's full formula is `basalCost + movementCost + turningCost + sensorCost + learningCost + environmentalCost`. `turningCost` and `sensorCost` are added now, because Movement and Perception already exist as real systems and the costs are meaningful. `learningCost` (Phase 5) and `environmentalCost` (Phase 6) are deferred until their systems exist, to avoid permanently-zero terms.

## Decision

### Organism model

`OrganismState` (`entities/OrganismStore.ts`) gains four fields: `readonly parentIds: readonly EntityId[]` (empty for founders), `readonly birthTick: number`, `reproductionCooldownRemaining: number` (seconds, mutable, decremented by `deltaTime` every tick in `ReproductionSystem.update`, floored at zero), and `lastTurnMagnitude: number` (radians applied this tick, written by `MovementSystem`, read by `MetabolismSystem`; mirrors how `vx`/`vy` already cross from Movement to Metabolism). No `genomeId`, `health`, or `alive` field is added: there is no genome to reference yet (inventing a placeholder that Phase 4 would just replace contradicts how `ReproductionSystem` itself was left a real no-op rather than a fake stub), no damage mechanic exists until Phase 6, and death-by-removal (not a flag) is the established pattern. "Higher vulnerability" for juveniles (roadmap 3.6) is treated as emergent from being smaller and slower, not a direct stat.

### Life stages

`LifeStage = 'juvenile' | 'mature' | 'senescent'` (new `@evo/contracts` file, `organism.ts`) is **derived, never stored**:

```ts
function lifeStageFor(
  age: number,
  thresholds: { maturityAge: number; senescenceAge: number }
): LifeStage {
  if (age < thresholds.maturityAge) return 'juvenile'
  if (age < thresholds.senescenceAge) return 'mature'
  return 'senescent'
}
```

in a new `packages/simulation/src/organisms/lifeStage.ts`. Storing it would let it drift from `age`; every consumer calls this fresh, the same anti-duplication reasoning already applied to resources not caching `energyValue`. New `OrganismConfig` fields: `maturityAge`, `senescenceAge` (`0 < maturityAge < senescenceAge < maxAge`), and three juvenile multipliers in `(0, 1]`: `juvenileSizeScale` (capture radius and effective `maxEnergy`), `juvenileSpeedScale` (`maxSpeed`), `juvenileMetabolicScale` (the whole metabolism formula). Sensing (`sensorRadius`) is not scaled - the roadmap's juvenile list (3.6) doesn't mention it. Juveniles cannot reproduce (roadmap 3.5 step 1, "check maturity"); senescent organisms can.

### Metabolism

```text
cost = (basalCost + movementCost*speed^2 + turningCost*lastTurnMagnitude^2 + sensorCost) * (juvenileMetabolicScale if juvenile else 1) * deltaTime
```

Two new `OrganismConfig` coefficients, `turningCost` and `sensorCost` (both `>= 0`). `lastTurnMagnitude` is `Math.abs(clampedTurn)`, written by `MovementSystem` every tick (always overwritten, never accumulated).

### Reproduction economics

New `WorldConfig.reproduction: ReproductionConfig` section, shaped like `resources`:

```ts
interface ReproductionConfig {
  minEnergy: number // energy required to attempt
  energyCost: number // paid by EACH parent on success (roadmap testing checklist: "parents pay correct cost")
  offspringEnergy: number // the newborn's starting energy, capped at maxEnergy as usual
  cooldown: number // seconds before either parent may reproduce again
  searchRadius: number // distance within which a partner is sought
}
```

Cross-field validation: `energyCost <= minEnergy`, `offspringEnergy <= organisms.maxEnergy` (mirrors existing checks like `organisms.initialEnergy <= maxEnergy`). "Compatible partner" (roadmap 3.5 step 4) reduces to "eligible partner" in Phase 3: no species/genetic-distance concept exists until Phase 6.

### `ReproductionSystem`

Real implementation, constructor `(config, organisms, organismIndex, ids, random, events)`, using the previously-reserved `'reproduction'` random stream. `update(tick)` iterates `organisms.values()` (the store's existing ascending-id contract) with a `pairedIds: Set<EntityId>` so one organism can't be consumed by two pairings in the same tick - the same pattern `InteractionSystem` already uses for resources:

```text
for each organism (ascending id):
  if lifeStageFor(organism.age) === 'juvenile': continue          # silent gate, no event
  if organism.reproductionCooldownRemaining > 0: continue         # silent gate, no event
  if organism.energy < config.reproduction.minEnergy: continue    # silent gate, no event
  if pairedIds.has(organism.id): continue
  if organisms.size >= config.maxPopulation:
    emit reproduction-attempted(succeeded: false, failureReason: 'population-cap'); continue
  candidates = organismIndex.queryRadius(position, searchRadius)
    filtered to: not self, not in pairedIds, not juvenile, cooldown <= 0, energy >= minEnergy
  if candidates.length === 0:
    emit reproduction-attempted(succeeded: false, failureReason: 'no-partner'); continue
  partner = candidates[0]                                          # nearest, tie-broken by id (SpatialHash's existing contract)
  pairedIds.add(organism.id); pairedIds.add(partner.id)
  organism.energy -= energyCost; partner.energy -= energyCost
  organism.reproductionCooldownRemaining = cooldown; partner.reproductionCooldownRemaining = cooldown
  childId = ids.allocate()
  parentIds = [min(organism.id, partner.id), max(organism.id, partner.id)]  # deterministic order
  position = parents' midpoint + small jitter from the 'reproduction' stream, clamped to the world rect
  heading = wrapAngle(random.float() * TWO_PI)
  organisms.add({ id: childId, parentIds, birthTick: tick, x, y, vx: 0, vy: 0, heading,
                  age: 0, energy: min(offspringEnergy, maxEnergy), reproductionCooldownRemaining: 0, lastTurnMagnitude: 0 })
  emit organism-born(parentIds); emit reproduction-attempted(succeeded: true, partnerId, childId)
```

Only two failure reasons are modeled, because only organisms that clear the maturity/cooldown/energy gates count as "attempting" (an organism that's simply immature doesn't "attempt" any more than an organism with no food nearby generates a failed-consumption event today):

```ts
type ReproductionFailureReason = 'no-partner' | 'population-cap'
interface ReproductionAttemptedEvent extends BaseEvent {
  type: 'reproduction-attempted'
  organismId: EntityId
  partnerId: EntityId | null
  childId: EntityId | null
  succeeded: boolean
  failureReason: ReproductionFailureReason | null
}
```

Recorded at **essential** tier (not gated by `history.eventDetail`): the number of eligible, attempting organisms per tick is naturally bounded by population size, unlike per-tick movement/energy noise. `maxPopulation` (an existing `WorldConfig` field, unenforced until now) becomes the birth-rate ceiling, mirroring how `EnvironmentSystem` already respects `resources.maxCount`.

### Organism spatial index

A second `SpatialHash<OrganismState>`, owned by `World`, cell size = `reproduction.searchRadius`, rebuilt every tick alongside the existing resource index - both were already documented as the "spatial" stage's job (`update-order.md`: _"reads organism and resource stores"_). `SpatialHash<T>` is already generic; this reuses it rather than adding a new class.

### Death and historical records

New `HistoricalOrganismRecord` (contracts): `{ id, parentIds, birthTick, deathTick, deathCause }`. New `packages/simulation/src/history/HistoryStore.ts`, a fixed-capacity ring buffer identical in structure to `EventLog` (same capacity/eviction/`list()` shape), sized by a new `HistoryConfig.maxHistoricalOrganisms`. `DeathSystem` gains a `history: HistoryStore` dependency and writes the record in the same loop iteration where it removes the organism and emits `organism-died` - one system owns the whole "an organism died" transaction, the same way `InteractionSystem` owns the whole "consumption" transaction. Exposed as `World.historicalOrganisms(): HistoricalOrganismRecord[]`, a separate method rather than a `WorldSnapshot` field: `snapshot()` is meant to be cheap for a hot render-loop caller (Phase 7), while history is queried occasionally.

### Metrics and the extinction invariant

`MetricsSnapshot` gains `reproductionAttempts`, `reproductionSuccesses`, `reproductionFailures`. `MetricsCollector.updatePopulation`'s "once extinct, `extinctionTick` never changes" behavior needs **no code change**: reproduction always requires at least one existing organism as a parent, so a population of zero can never produce more under any policy Phase 3 implements. The existing comment claiming this is true because "the Phase 2 engine has no way to create an organism outside of `World.create`" becomes false and is corrected to state the real reason.

### State hash

`HASH_SCHEMA_VERSION` 1 -> 2. Full field-level layout, plus the reasoning for what stays out of the hash, is in [docs/simulation/determinism.md](../simulation/determinism.md#73-canonical-stream-schema-versions). In short: the organism section appends `birthTick`, `lastTurnMagnitude`, `reproductionCooldownRemaining`, and `parentIds`; the metrics section appends the three reproduction counters. All golden hashes are regenerated wherever the schema bumps, with the reason stated in the PR, per the policy `determinism.md` already established. Because this phase changes actual trajectories twice (once when the metabolism formula and juvenile scaling land, again when reproduction starts actually firing), goldens are regenerated twice rather than once.

### New invariants

`world/invariants.ts`'s `InvariantContext` gains `nextEntityId` (to validate `parentIds` reference real, already-allocated ids) and checks: `organisms.length <= config.maxPopulation`; `reproductionCooldownRemaining` finite and `>= 0`; `birthTick` a finite integer in `[0, tick]`.

## Alternatives considered

- **Asexual fallback reproduction** (as the old prototype did). Rejected: diverges from the roadmap's literal process and Scenario C, and there's nothing yet for solo reproduction to inherit differently from simple cloning (Phase 4 changes that).
- **Full metabolism formula now** (`learningCost`, `environmentalCost` included as always-zero terms). Rejected: dead, permanently-zero code until Phase 5/6 respectively exist to give them meaning.
- **A `health`/`alive` field pair**, matching the roadmap's illustrative `Organism` sketch (3.1). Rejected: no damage mechanic exists to write to `health` until Phase 6; `alive` would duplicate "present in the active store."
- **Embedding historical records in `WorldSnapshot`.** Rejected in favor of a separate `historicalOrganisms()` method, keeping the hot-path snapshot cheap.
- **A fake `genomeId` placeholder** to match the roadmap's `Organism` sketch. Rejected: nothing exists behind it until Phase 4, and the project's practice (see `ReproductionSystem`'s own history) is to leave unimplemented concepts genuinely absent rather than stubbed.

## Simulation consequences

Population is no longer monotonically non-increasing: it can grow (bounded by `maxPopulation`), and - for the first configuration Phase 3 tunes - should settle into a rough equilibrium under sustained resource pressure. Extinction (roadmap Scenario B) must still be reachable and permanent; this is re-verified once reproduction is real, adjusting `reproduction.minEnergy` or the zero-resource scenario's config if organisms could otherwise limp along reproducing on scraps rather than actually starving.

## Determinism impact

The `'reproduction'` random stream (reserved since Phase 2, previously unused) becomes active; `docs/simulation/stream-usage.test.ts`'s reserved-and-unused list drops it. No other stream is affected - stream isolation (proven in Phase 2's foundations tests) guarantees this. All new randomness (partner-search tie-breaks are deterministic via `(distanceSquared, id)`, not random; only child spawn jitter and heading use the stream) draws exclusively from `'reproduction'`.

## Persistence impact

None yet (no save/load exists until Phase 8). `HistoricalOrganismRecord` and the reproduction fields are designed to be trivially serializable when that phase arrives.

## Performance impact

One additional `SpatialHash` rebuild per tick (organisms, typically a smaller or comparable set to resources) and one additional bounded ring buffer (`HistoryStore`, same cost profile as `EventLog`). Not expected to be measurable at Phase 2/3 population scales; Phase 9 owns performance work.

## Testing strategy

Per-system unit tests for the new/changed `ReproductionSystem`, `MovementSystem`, `MetabolismSystem`, `InteractionSystem`, `DeathSystem` behavior; `HistoryStore` tests mirroring `EventLog`'s; config validation tests for every new field and cross-field rule; roadmap Scenario C (2 mature organisms, high energy, nearby food -> reproduction occurs, both parent ids present, both parents' energy decreases) reproduced exactly; Scenario A and B re-verified with reproduction present; a population-stability scenario tuned empirically (as Phase 2's scenario numbers were); the long-run determinism suite extended with a reproduction-heavy scenario and an explicit "extinction stays permanent even though reproduction exists" test; new golden hashes at each of the two schema-affecting PRs.

## Rollback plan

Each PR is independently revertable. If reproduction's population dynamics prove unstable or undesirable in practice, `ReproductionSystem.update()` can be reverted to a no-op (as it was engineered to be a real, swappable implementation, not a special case baked into `World`) while keeping the life-stage and history infrastructure, which are useful independent of whether reproduction is active.
