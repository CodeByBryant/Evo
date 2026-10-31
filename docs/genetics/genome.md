# Genome reference

This is the reference for the genome introduced in [ADR 0006](../decisions/0006-genetics-and-inheritance.md): gene tables, defaults, operators, the brain weight layout, validation rules and the lineage API. The ADR holds the reasoning; this file holds the numbers.

All defaults are provisional. They are tuned by the engine's scenario tests, and determinism tests pin their configuration explicitly, so changing a default never changes a golden hash.

## Genes

Founders start at the **baseline** (the existing `organisms.*` / `reproduction.*` config values). A gene's **range** bounds every genome ever produced. `rate` is the probability that the gene mutates in a birth and `std` is the mutation standard deviation as a fraction of the range width, both before the global `mutationRateScale` / `mutationStrengthScale`.

| Gene                               | Kind             | Baseline (config source)                  | Range         | Rate | Std  | Read by                                                      |
| ---------------------------------- | ---------------- | ----------------------------------------- | ------------- | ---- | ---- | ------------------------------------------------------------ |
| `physical.radius`                  | float            | 5 (`organisms.radius`)                    | 2.5 - 10      | 0.1  | 0.05 | Interaction (capture radius), size-derived costs, snapshot   |
| `physical.maxSpeed`                | float            | 20 (`organisms.maxSpeed`)                 | 10 - 40       | 0.1  | 0.05 | Movement                                                     |
| `physical.maxTurnRate`             | float            | 3 (`organisms.maxTurnRate`)               | 1.5 - 6       | 0.1  | 0.05 | Movement                                                     |
| `physical.maturityAge`             | float            | 90 (`organisms.maturityAge`)              | 45 - 180      | 0.1  | 0.05 | life stage (Movement, Interaction, Metabolism, Reproduction) |
| `physical.senescenceAge`           | float            | 510 (`organisms.senescenceAge`)           | 255 - 560     | 0.1  | 0.05 | life stage                                                   |
| `physical.maxAge`                  | float            | 600 (`organisms.maxAge`)                  | 570 - 1200    | 0.1  | 0.05 | Death                                                        |
| `physical.hue`                     | circular         | 0.55 (`organisms.hue`)                    | [0, 1) turns  | 0.1  | 0.05 | carried (rendering, Phase 7)                                 |
| `sensory.sensorRadius`             | float            | 60 (`organisms.sensorRadius`)             | 30 - 120      | 0.1  | 0.05 | Perception; sensor cost                                      |
| `metabolic.basalCost`              | float            | 0.5 (`organisms.basalCost`)               | 0.3 - 0.8     | 0.1  | 0.05 | Metabolism (scaled by body size)                             |
| `metabolic.movementCost`           | float            | 0.005 (`organisms.movementCost`)          | 0.003 - 0.008 | 0.1  | 0.05 | Metabolism                                                   |
| `metabolic.turningCost`            | float            | 0.05 (`organisms.turningCost`)            | 0.03 - 0.08   | 0.1  | 0.05 | Metabolism                                                   |
| `behavioral.wanderJitter`          | float            | 1.5 (`organisms.wanderJitter`)            | 0.75 - 3      | 0.1  | 0.05 | Decision                                                     |
| `reproduction.minEnergy`           | float            | 60 (`reproduction.minEnergy`)             | 40 - 90       | 0.1  | 0.05 | Reproduction (eligibility)                                   |
| `reproduction.offspringInvestment` | float            | 12.5 (`reproduction.offspringInvestment`) | 6 - 25        | 0.1  | 0.05 | Reproduction (energy given to the child)                     |
| `reproduction.cooldown`            | float            | 30 (`reproduction.cooldown`)              | 15 - 60       | 0.1  | 0.05 | Reproduction                                                 |
| `reproduction.searchRadius`        | float            | 50 (`reproduction.searchRadius`)          | 25 - 100      | 0.1  | 0.05 | Reproduction (partner search)                                |
| `learning.learningRate`            | float (relative) | 0.05 (`genetics.learning`)                | 0.001 - 0.5   | 0.1  | 0.05 | Brain (learning step size, learning cost)                    |
| `learning.discountFactor`          | float            | 0.95 (`genetics.learning`)                | 0 - 1         | 0.1  | 0.05 | Brain (TD discount, trace decay)                             |
| `learning.eligibilityTraceDecay`   | float            | 0.9 (`genetics.learning`)                 | 0 - 1         | 0.1  | 0.05 | Brain (eligibility traces)                                   |
| `learning.explorationRate`         | float            | 0.1 (`genetics.learning`)                 | 0 - 1         | 0.1  | 0.05 | Brain (exploration noise)                                    |
| `learning.riskTolerance`           | float            | 0.5 (`genetics.learning`)                 | 0 - 1         | 0.1  | 0.05 | scales the damage penalty (Phase 6: `1 - riskTolerance`)     |
| `learning.noveltyPreference`       | float            | 0.5 (`genetics.learning`)                 | 0 - 1         | 0.1  | 0.05 | scales the novelty reward (Phase 6)                          |
| `learning.persistence`             | float            | 0.5 (`genetics.learning`)                 | 0 - 1         | 0.1  | 0.05 | Brain (exploration annealing)                                |

The ordering `maturityAge < senescenceAge < maxAge` is enforced by the operators: `senescenceAge` is declared `orderedAfter` `maturityAge`, and `maxAge` after `senescenceAge`, and mutation, recombination and repair raise such a gene's lower bound above the earlier gene (by a 1e-6 margin) even when the later gene itself did not mutate. Config validation requires each ordered gene's range maximum to exceed the earlier gene's, so there is always room. The default ranges happen not to overlap, but nothing relies on that.

If a default range edge excludes a changed founder baseline (for example `organisms.maxSpeed: 0`), that edge is widened to include it. An edge set explicitly in `genetics.genes` is never moved; config validation rejects a baseline outside it. For a relative gene (`learningRate`) the standard deviation is a fraction of the current value rather than of the range width.

Gene order in `GENE_SPECS` is fixed (the order above) and is the order used for mutation draws, the state hash and `genomeDistance`.

An organism can legitimately inherit a combination that cannot reproduce (for example a small body whose derived `maxEnergy` is below its `minEnergy`). That is natural selection, not an invalid genome.

## Derived quantities (not genes)

```text
sizeFactor        = (radius / baseRadius)^2          (computed by multiplication)
maxEnergy         = baseMaxEnergy * sizeFactor        (base = organisms.maxEnergy)
basal cost        = metabolic.basalCost * sizeFactor
sensor cost       = baseSensorCost * (sensorRadius / baseSensorRadius)   (base = organisms.sensorCost)
parent pays       = offspringInvestment * (1 + reproduction.overheadFraction)
child energy      = min(investmentA + investmentB, child maxEnergy)
eligibility        = energy >= max(minEnergy, parent pays)   (so paying never drives energy negative)
```

At the baseline genome each quantity equals its Phase 3 value, which is what lets the behavior-preserving PR prove it changes nothing. Juvenile multipliers (`juvenileSizeScale`, `juvenileSpeedScale`, `juvenileMetabolicScale`) remain world-level config and apply on top.

## Brain genome

`brain = { architecture: { inputSize, hiddenSize, memorySize, outputSize }, weights: number[] }`. Every organism in a world has the same architecture (set by `genetics.brain`), so weight vectors are always compatible; topology does not evolve (roadmap 4.2). Since Phase 5 `inputSize` (33 since Phase 6) and `outputSize` (5) are not config: they are derived from the `OBSERVATION_SIZE` and `ACTION_SIZE` contract constants, and `hiddenSize` / `memorySize` (default 8 / 4) stay configurable. See [docs/learning/brain.md](../learning/brain.md).

`weights` is one flat vector made of eight consecutive **blocks** (the eighth, the critic's value head, was added in Phase 5). The layout is stable and documented; reordering it is a hash-schema change.

| #   | Block            | Shape (rows x cols) | Default length |
| --- | ---------------- | ------------------- | -------------- |
| 1   | `inputToHidden`  | hidden x input      | 184            |
| 2   | `memoryToHidden` | hidden x memory     | 32             |
| 3   | `hiddenBias`     | hidden              | 8              |
| 4   | `hiddenToMemory` | memory x hidden     | 32             |
| 5   | `memoryBias`     | memory              | 4              |
| 6   | `hiddenToOutput` | output x hidden     | 40             |
| 7   | `outputBias`     | output              | 5              |
| 8   | `hiddenToValue`  | hidden, then 1 bias | 9              |

Default total: 394 weights (314 in Phase 5 with 23 inputs, 249 in Phase 4, before the brain and the value head). Crossover operates per block (see below). Phase 5 interprets blocks 6-8 as the learnable ones; learning changes a per-organism overlay, never the genome.

## Operators

**Mutation** (`genetics/Mutation.ts`), applied per gene in `GENE_SPECS` order after recombination. Each gene always takes its gate draw, whether or not mutation then applies.

| Kind / gene type        | Operator                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| float                   | gaussian: add `N(0, std * (max - min))`, clamp to range                                           |
| integer                 | point: step `+-1`, clamp                                                                          |
| boolean                 | bit-flip                                                                                          |
| circular (`hue`)        | gaussian in turns, wrapped into `[0, 1)`                                                          |
| correlated group        | trait-shift: one shared normalized delta applied to every gene in the group, scaled to each range |
| `learning.learningRate` | relative gaussian: add `N(0, std) * current value`, clamp                                         |
| brain weight            | each weight independently with probability `weightMutationRate`: add `N(0, weightMutationStd)`    |

**Recombination** (`genetics/Recombination.ts`): `mother` is the parent with the lower organism id.

| Gene type         | Operator                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| integer / boolean | uniform pick from either parent                                                                          |
| float             | blend crossover, `child ~ U[lo - a*d, hi + a*d]` with `d = abs(A - B)`, `a = blendAlpha`, then clamp     |
| circular          | the same blend along the shortest arc, wrapped                                                           |
| brain weights     | per block: one random cut point in `[1, len - 1]`, one random choice of which parent supplies the prefix |

Because each block is cut strictly inside, every block of every child contains weights from both parents.

## Validation

`validateGenome(genome, specs)` reports every violation (it never repairs):

- each scalar gene is finite and within its `[min, max]`; integer genes are integers; boolean genes are 0 or 1;
- `maturityAge < senescenceAge < maxAge`;
- `learningRate >= 0`, `discountFactor` in `[0, 1]`, `offspringInvestment > 0`;
- brain architecture equals the configured architecture; weight count equals the architecture's total; every weight is finite;
- `id` is a nonnegative integer below `nextGenomeId`; `parentIds` are nonnegative integers below `id`.

`repairGenome(genome, specs)` is a pure clamp for tooling. The engine never calls it.

## Comparison

`genomeDistance(a, b)` returns `{ total, physical, sensory, metabolic, behavioral, reproduction, brain, learning }`, each in `[0, 1]`. Scalar genes: `|a - b| / (max - min)`, circular genes: shortest arc / 0.5, group distance: mean over the group's genes. Brain: RMS weight difference / `(2 * initialWeightStd)`, clamped to 1. `total` is the unweighted mean of the seven groups; `weightedDistance(distance, weights)` combines the seven group distances with configurable weights (used for speciation, see [species](../simulation/species.md)). Symmetric; `0` for identical genomes.

## Learning inheritance

`inheritedBrainWeights(genomeWeights, learnedWeights, mode, fraction)`:

| Mode         | Result                                               |
| ------------ | ---------------------------------------------------- |
| `baldwinian` | `genomeWeights` (learning is never inherited)        |
| `lamarckian` | `learnedWeights` (all learning is inherited)         |
| `partial`    | `genome + fraction * (learned - genome)`, per weight |

Default `partial` / `0.15`. In Phase 4 nothing learns, so `ReproductionSystem` passes the genome weights only.

## Lineage

`LineageStore` (exposed read-only as `World.lineage`; `ReproductionSystem` registers each child and `DeathSystem` marks deaths) holds `LineageRecord { genomeId, parentGenomeIds, organismIds, createdAtTick, descendantCount }` for every genome ever created, including those whose organisms have died.

| Query                          | Result                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `record(id)`                   | the record (with `descendantCount` computed on demand), or `undefined`                                                                        |
| `parentsOf(id)`                | parent genome ids, ascending                                                                                                                  |
| `ancestorsOf(id)`              | all ancestors (transitive), ascending                                                                                                         |
| `descendantsOf(id)`            | all descendants (transitive), ascending                                                                                                       |
| `commonAncestor(a, b)`         | the most recent (greatest-id) genome that is, or is an ancestor of, both; a genome counts as its own ancestor here; `null` if they never meet |
| `founders()` / `isFounder(id)` | genomes with no parents                                                                                                                       |
| `isLineageExtinct(id)`         | `true` if neither the genome nor any descendant has a living organism                                                                         |

Every genome has two parents except founders. `World.validate()` checks that each living genome has a record, that the record names the same parents, and that those parents have records too (so a record survives its organism). Traversals are on demand and de-duplicate shared ancestors. The store is not hashed.

## Configuration

New and changed config (full table in [configuration.md](../simulation/configuration.md)):

```ts
genetics: {
  mutationRateScale: 1,        // multiplies every rate; 0 disables mutation
  mutationStrengthScale: 1,    // multiplies every std; 0 disables mutation
  blendAlpha: 0.25,
  brain: {
    hiddenSize: 8, memorySize: 4,   // inputSize and outputSize are derived from the contract constants
    innatePrior: true,              // Phase 5: founders start from a hand-wired forager template plus noise
    initialWeightStd: 0.3, weightMutationRate: 0.05, weightMutationStd: 0.1
  },
  learning: { learningRate: 0.05, discountFactor: 0.95, eligibilityTraceDecay: 0.9,
              explorationRate: 0.1, riskTolerance: 0.5, noveltyPreference: 0.5, persistence: 0.5 },
  learningInheritance: { mode: 'partial', fraction: 0.15 },
  genes: {}                    // optional per-gene { min, max, mutationRate, mutationStd } overrides, keyed by path
}
```

plus `organisms.hue` (founder baseline), `reproduction.offspringInvestment` and `reproduction.overheadFraction`, which replace `reproduction.energyCost` and `reproduction.offspringEnergy`.

## Verification

Where each guarantee is checked (all paths under `packages/simulation/tests/`):

| Guarantee                                                    | Checked in                                                                       |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Mutation is bounded; parents are never modified              | `genetics/mutation.test.ts`, `genetics/recombination.test.ts`                    |
| Both parents contribute (genes and brain weights)            | `genetics/recombination.test.ts`; end to end in `phase4-exit-criteria.test.ts`   |
| Integer, boolean, circular and correlated genes behave       | `genetics/mutation.test.ts`, `genetics/recombination.test.ts` (synthetic tables) |
| Brain weights preserve the architecture                      | `genetics/recombination.test.ts`, `phase4-exit-criteria.test.ts`                 |
| Learning parameters mutate; all three inheritance modes      | `genetics/mutation.test.ts`, `genetics/learning-inheritance.test.ts`             |
| Genome validation, repair and comparison                     | `genetics/validation.test.ts`, `genetics/distance.test.ts`                       |
| Lineage queries and survival after death                     | `lineage.test.ts`, `world-genomes.test.ts`, `phase4-exit-criteria.test.ts`       |
| Systems read the organism's own genes                        | `genes-in-systems.test.ts`, `traits.test.ts`                                     |
| Mutation off reproduces Phase 3; mutation on changes the run | `world-genomes.test.ts` (Scenario A: 26 / 47 / 21 with mutation off)             |
| Genomes valid and trait drift bounded over 100,000 ticks     | `determinism/long-run.test.ts`                                                   |
| Chunked and stepped runs match, lineage included             | `determinism/long-run.test.ts`                                                   |
| Lineage stays queryable and frozen after extinction          | `determinism/long-run.test.ts`                                                   |
