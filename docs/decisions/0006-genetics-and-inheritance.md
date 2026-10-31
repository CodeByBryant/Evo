# 0006: Genetics and inheritance (genomes, recombination, mutation, lineage)

Status: **Accepted** (approved by the project owner with the Phase 4 plan, 2026-10-23)

## Problem

Phase 3 made the population self-sustaining, but every organism still shares one set of traits read from global config, and a child is a fresh organism that inherits nothing. Phase 4 (roadmap, Nov 30-Dec 27 2026) makes inheritance real and testable: each organism carries a **genome**; a child's genome is produced from both parents by explicit recombination followed by bounded, per-gene mutation; lineage records outlive their organisms; genomes can be validated and compared.

Three forks were resolved with the project owner before this ADR:

- **Brain and learning genes are real now.** The roadmap's genome includes `brain` and `learning` genes, and the exit criteria require inheriting neural weights, but the brain itself is Phase 5. The genome therefore carries a fixed-architecture weight vector and learning parameters that are recombined, mutated, validated and compared, while **no system reads them until Phase 5**. Dimensions come from config so Phase 5 can set the real observation size.
- **All phenotype groups are live.** Every gene in `physical`, `sensory`, `metabolic`, `behavioral` and `reproduction` is read by a real system, so mutation changes behavior immediately. Costs are coupled to capability so that no gene is a free lunch (see below).
- **Learning inheritance is a pure function now, wired in Phase 5.** All three modes are implemented and proven on synthetic learned weights. No runtime brain state is added before a brain exists.

## Decision

### The genome

`Genome` (new `@evo/contracts` file `genome.ts`, roadmap 4.1): `{ version: 1, id: GenomeId, parentIds: GenomeId[], physical, sensory, metabolic, behavioral, reproduction, brain, learning }`. A genome is **immutable** and belongs to exactly one organism. `GenomeId` comes from its own monotonic counter (hashed as `nextGenomeId`), separate from `EntityId`, so genome identity never depends on how many resources have spawned. Founders receive ids `0..n-1`; every birth allocates a new id.

The full gene list, default ranges and mutation parameters are in [docs/genetics/genome.md](../genetics/genome.md). Summary:

| Group          | Genes                                                                                                                             | Read by (Phase 4)                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `physical`     | `radius`, `maxSpeed`, `maxTurnRate`, `maturityAge`, `senescenceAge`, `maxAge`, `hue`                                              | Movement, Interaction, Death; `hue` carried (rendering is Phase 7) |
| `sensory`      | `sensorRadius`                                                                                                                    | Perception, Metabolism                                             |
| `metabolic`    | `basalCost`, `movementCost`, `turningCost`                                                                                        | Metabolism                                                         |
| `behavioral`   | `wanderJitter`                                                                                                                    | Decision                                                           |
| `reproduction` | `minEnergy`, `offspringInvestment`, `cooldown`, `searchRadius`                                                                    | Reproduction                                                       |
| `brain`        | architecture `{inputSize, hiddenSize, memorySize, outputSize}` plus a flat `weights` vector                                       | live since Phase 5 (risk and novelty since Phase 6)                |
| `learning`     | `learningRate`, `discountFactor`, `eligibilityTraceDecay`, `explorationRate`, `riskTolerance`, `noveltyPreference`, `persistence` | carried (Phase 5)                                                  |

The roadmap (3.4) makes the life-stage ages genome-controlled; Phase 3 had to place them in `OrganismConfig` because no genome existed. They move into `physical` here. The juvenile multipliers (`juvenileSizeScale`, `juvenileSpeedScale`, `juvenileMetabolicScale`) describe what a juvenile _is_, not a per-organism trait, and stay world-level config.

### Founders and the config baseline

Each gene's effective range is its default range with any `genetics.genes` override applied; a default edge that excludes the founder baseline is **widened** to include it, so changing a baseline in `organisms.*` or `reproduction.*` never needs a matching range override (an edge set explicitly by an override is never moved, and config validation rejects a baseline outside it). Founders get **identical** genomes built from the existing config values: `organisms.*` and `reproduction.*` keep their meaning as the founder baseline, which keeps every Phase 3 default meaningful. Brain weights are drawn from the `genetics` stream (Gaussian, std `genetics.brain.initialWeightStd`), one founder at a time in id order. Variation enters the population only at births.

### Capability is not free: derived quantities

If capability and cost were independent genes, selection would simply push every capability to its maximum and every cost to its minimum. Instead the following are **derived, not genes**, each equal to its Phase 3 value at the baseline genome (all by multiplication and division; `**` and `Math.pow` are banned in `simulation/src`):

```text
sizeFactor        = (radius / baseRadius) * (radius / baseRadius)
maxEnergy         = baseMaxEnergy * sizeFactor
basalCost applied = genes.basalCost * sizeFactor
sensorCost        = baseSensorCost * (sensorRadius / baseSensorRadius)
parent pays       = offspringInvestment * (1 + reproduction.overheadFraction)
child energy      = min(investmentA + investmentB, child maxEnergy)
```

Because genes vary independently, a parent could in principle hold a `minEnergy` below the cost it would pay. `ReproductionSystem` therefore requires `energy >= max(minEnergy, parent pays)` to attempt, so paying can never drive energy negative.

The metabolism formula from ADR 0005 is otherwise unchanged and reads the organism's own `movementCost`, `turningCost` and derived terms. `movementCost` and `turningCost` are already coupled to _realized_ speed and turn (they multiply `speed^2` and `lastTurnMagnitude^2`), so a faster or more agile organism pays more when it actually moves.

This **replaces** the config fields `reproduction.energyCost` and `reproduction.offspringEnergy` with `reproduction.offspringInvestment` (the per-parent baseline) and `reproduction.overheadFraction` (energy lost in the transfer). With investment `12.5` and overhead `0.6`, a parent pays `20` and the child receives `25`, exactly Phase 3's values. There are no external users of the old fields, so no compatibility shim is kept.

### Mutation

`genetics/Mutation.ts` is **table-driven** over a fixed-order `GENE_SPECS` array (never `Object.keys`; the determinism lint forbids it). Each entry: `{ path, kind: 'float' | 'int' | 'bool' | 'circular', min, max, mutationRate, mutationStd, correlationGroup? }`. A different operator applies per kind; they are not one arbitrary formula (roadmap 4.3):

- **gaussian** (floats): add `N(0, mutationStd * (max - min))`, then clamp to `[min, max]`.
- **point** (integers): step by `+-1` and clamp.
- **bit-flip** (booleans).
- **circular** (`hue`): Gaussian in `[0, 1)` turns, wrapped.
- **trait-shift** (correlated traits): genes sharing a `correlationGroup` receive one shared normalized delta, scaled into each gene's own range. The mechanism is required by the roadmap ("where appropriate"); the production table declares no group yet, and tests exercise it with a synthetic table.
- **learning-parameter**: `learningRate` mutates multiplicatively (a Gaussian fraction of its current value, so it stays positive and scales sensibly; the engine has no deterministic `exp` to mutate in log space); the other learning genes are bounded Gaussians within `[0, 1]`.
- **brain-weight**: each weight mutates independently with probability `genetics.brain.weightMutationRate` by `N(0, weightMutationStd)`.

Global knobs: `genetics.mutationRateScale` multiplies every rate and `genetics.mutationStrengthScale` multiplies every std; `0` disables mutation entirely. Integer, boolean and circular behavior is proven with synthetic spec tables because the production table has no integer or boolean gene.

### Recombination

```ts
interface RecombinationStrategy {
  combine(mother: Genome, father: Genome, random: RandomSource): Genome
}
```

The two partners are symmetric, so "mother" is the parent with the lower organism id: the choice is deterministic and the draw order is fixed. The default strategy:

- integers and booleans: uniform pick from either parent per gene;
- continuous genes: **blend crossover** (BLX-alpha, alpha = `genetics.blendAlpha`, default `0.25`): the child value is drawn uniformly from `[lo - alpha*d, hi + alpha*d]` where `d = |a - b|`, then clamped. Identical parents give an identical child;
- circular genes: the same blend along the shortest arc;
- neural weights: **per-block single-point crossover** over each documented weight block (input-hidden, memory-hidden, and so on), with a random choice of which parent supplies the prefix. Every block therefore contains weights from both parents, so both brains actually contribute (roadmap 4.4);
- then mutation is applied to the recombined result.

Each independent gene (or correlated group) consumes the same draws per birth whatever the configuration: the mutation gate, value and direction draws are always taken and merely not applied when the gate fails, so changing a rate or strength never shifts later draws within the stream. All of this draws from the `genetics` stream (reserved since Phase 2). Child spawn jitter and heading stay on the `reproduction` stream, so existing reproduction-stream sequences are untouched.

### Constraints

`validateGenome(genome, specs): ValidationResult` checks: every scalar gene within `[min, max]`; integers are integers; booleans are 0/1; brain architecture equals the configured architecture and the weight count equals the architecture's weight count (all finite); `learningRate >= 0`; `discountFactor` in `[0, 1]`; `offspringInvestment > 0`; and the ordering `maturityAge < senescenceAge < maxAge`. The ordering is enforced by the operators, not by keeping ranges apart: a gene declared `orderedAfter` another (`senescenceAge` after `maturityAge`, `maxAge` after `senescenceAge`) has its lower bound raised above the earlier gene (by a 1e-6 margin) in mutation, recombination and repair, so the ages stay ordered for any ranges, including after an unrelated change moves the earlier gene. Config validation requires each such gene's range maximum to exceed the earlier gene's, so there is always room. `repairGenome(genome, specs): Genome` is a pure clamp provided for tooling, but `ReproductionSystem` never calls it (roadmap 4.5: prefer rejecting invalid genomes in development). `World.validate()` rejects any living organism whose genome is invalid (roadmap: "No invalid genome").

### Comparison

`genomeDistance(a, b)` returns per-group distances in `[0, 1]` plus a `total` (the unweighted mean of the seven group distances). Scalar genes are normalized by range width, circular genes by shortest arc, and brain weights by RMS difference divided by `2 * initialWeightStd` (clamped to 1). It is symmetric and `0` for identical genomes. Phase 6 speciation reuses it.

### Lineage

`LineageRecord { genomeId, parentGenomeIds, organismIds, createdAtTick, descendantCount }` (roadmap 4.6) in a new `LineageStore`: registered at birth, marked at death, **never removed**. Queries: parents, ancestors, descendants, most-recent common ancestor, founders, and lineage extinction (no living organism carries the genome or any descendant). Ancestry in a sexual population is a DAG whose ancestor sets grow quickly, so `descendantCount` and the traversal queries are computed **on demand**, not maintained per birth. The store holds only small integer records (growth is O(births)); bounding or pruning it is a Phase 8/9 concern. Like `HistoryStore` it is a derived record and is **not part of the state hash**. It is exposed as `World.lineage`.

`OrganismSnapshot`, `OrganismBornEvent` and `HistoricalOrganismRecord` gain `genomeId`; the full genome is available through `World.genomeOf(organismId)` (genomes are deeply frozen, so the object itself is safe to hold), so `snapshot()` stays cheap for the render loop.

### Learning inheritance

```ts
type LearningInheritanceMode = 'baldwinian' | 'partial' | 'lamarckian'
```

Config `genetics.learningInheritance: { mode, fraction }`, default `partial` / `0.15` (roadmap 4.7). A pure function `inheritedBrainWeights(genomeWeights, learnedWeights, mode, fraction)` returns `genomeWeights` for Baldwinian, `learnedWeights` for Lamarckian, and `genome + fraction * (learned - genome)` for partial. In Phase 4 `ReproductionSystem` passes the genome weights only (nothing has learned); Phase 5 adds the learned overlay.

### Spatial index cell sizes

The resource and organism `SpatialHash` cell sizes were `organisms.sensorRadius` and `reproduction.searchRadius`. They become the upper bound of those genes' ranges. Query correctness never depends on cell size, only efficiency does.

### State hash

`HASH_SCHEMA_VERSION` 2 -> 3. The ids section appends `nextGenomeId`; each organism entry appends its genome (id, parent ids, every gene in `GENE_SPECS` order as float64, brain architecture and weights). The lineage store and history are not hashed. Exact layout: [determinism.md](../simulation/determinism.md#73-canonical-stream-schema-versions). Goldens are regenerated in the PR that bumps the version and again in the PR that makes inheritance live, with the reason stated in each.

## Alternatives considered

- **Defer brain and learning genes to Phase 5.** Rejected: the exit criteria ("inherit compatible neural weights", "learning inheritance mode configurable") could not be met.
- **Carry runtime brain state now** so the Lamarckian path is testable end to end. Rejected: doubles per-organism brain memory for state nothing updates until Phase 5; the pure function plus synthetic-weight tests prove the same thing.
- **Make every cost coefficient a free gene.** Rejected: selection drives costs to their minimum and capabilities to their maximum. Costs are coupled to capability instead, and the remaining metabolic genes have bounded, narrow ranges.
- **Carry only, wire nothing / a minimal live subset.** Rejected by the owner: a genome nothing reads cannot demonstrate inheritance.
- **One generic mutation formula** (the old prototype's approach). Rejected by the roadmap (4.3).
- **Evolving network topology.** Deferred (roadmap 4.2): all organisms share one architecture so weight vectors are always compatible.
- **Shared/interned genomes for clones.** Rejected: one immutable genome per organism is simpler, and population sizes make the memory irrelevant.
- **Maintaining `descendantCount` per birth.** Rejected: the ancestor set of a child in a sexual lineage approaches the whole history, making each birth O(history).
- **Reusing `EntityId` for genome ids.** Rejected: coupling genome identity to resource spawning is surprising and makes ids unstable under unrelated config changes.

## Simulation consequences

Behavior changes in two steps. First, organisms carry genomes but children are blends of identical founders with mutation off: the dynamics are **unchanged** from Phase 3 (a hard gate, see Testing). Second, recombination and mutation are switched on, and populations drift. Because every capability is bounded and cost-coupled, drift is expected to stay within the default ranges, but a population that evolves cheaper metabolism could still grow toward `maxPopulation`; the 50,000-tick stability scenario from Phase 3 must still hold with default mutation, and default ranges or `mutationStrengthScale` are tuned (not the test) if it does not.

## Determinism impact

The `genetics` stream becomes active (`stream-usage.test.ts` drops it from the reserved list in the PR that uses it). Streams are isolated, so `world`, `environment` and `reproduction` sequences are unaffected. Gene iteration uses fixed arrays only. Hash schema v3 as above.

## Persistence impact

None yet (no save/load until Phase 8). Genomes are flat numeric data plus ids and the lineage store is integer records, so both serialize trivially. Brain dimensions are part of the genome, so changing the default architecture later is a hash and golden change but needs no migration while the project is pre-release.

## Performance impact

One genome (a few hundred numbers with the default 249 brain weights) is allocated per birth, about 1,200 births per 100,000 ticks in the default scenario. Systems read genes from the organism instead of config: negligible. Lineage queries are on demand. Phase 9 owns any optimization (for example structure-of-arrays genes).

## Testing strategy

Pure-function unit tests mirror the roadmap's genetics list: mutation stays bounded; parent traits are not mutated; both parents contribute; booleans inherit correctly; integers stay integers; brain weights preserve architecture; learning parameters mutate correctly; all three learning modes behave as specified. Config validation tests for every new field and cross-field rule. **Equivalence gate (PR 3):** with organisms carrying genomes and mutation off, every pinned Phase 3 scenario value is unchanged (Scenario A, extinction tick, Scenario C, the 50,000-tick stability band). **Stability gate (PR 4):** the stability band still holds with default mutation. Long-run suite: genomes valid every tick over 100,000 ticks, chunked and stepped runs hash-identical with mutation active, lineage survives parent death and extinction.

## Rollback plan

Each PR is independently revertable. The behavior-preserving PR (organisms carry genomes) can ship and stay even if inheritance is later disabled: setting `mutationRateScale` to `0` makes children blends of their parents without drift, and reverting only the "heritable genomes" PR restores genome-carrying organisms that copy a parent's genome.
