# Species

Design: [ADR 0008](../decisions/0008-speciation.md). Species are **groups of organisms whose genomes are close in gene space**. They are a derived record kept by `SpeciesRegistry`; they are not part of the state hash and (by default) do not change how organisms behave.

## Assignment

Species are assigned when an organism comes into existence:

1. **Founders** (tick 0), in id order.
2. **Births**, in `ReproductionSystem`, immediately after the child is added to the lineage store and before its `organism-born` event is recorded.

For a genome `g`:

```text
for each ACTIVE species s (ascending id):
    d(s) = weightedDistance(genomeDistance(g, s.representative), species.distanceWeights)
nearest = the s with the smallest d (ties: lower id)
if d(nearest) <= species.threshold: join nearest
else: found a new species (representative = g, ancestor = the child's mother's species)
```

- A species' representative is its **founding genome** and never changes.
- An **extinct** species (no living members) is never rejoined, even by a genome that is close to its representative. A later lookalike founds a new species whose ancestor is the mother's species.
- `weightedDistance` combines the group distances from `genomeDistance` (physical, metabolic, behavioral, reproduction, learning, brain and the body plan) with `species.distanceWeights`, normalized by the sum of the weights. Each group distance is in `[0, 1]`, so the result is too.
- **Colour is not a difference.** Genes that only change how a creature is painted (`physical.hue` and the body's `pattern` and `accentHue`) are flagged `cosmetic`: they are in no group, so two creatures that differ only in colour are at distance 0 and are the same species. They are reported apart as `appearance` for display.
- **The body plan is compared as a body** (`bodyPlanDistance`), not as a mean over twelve slots of genes: a slot that is empty in both bodies costs nothing (its latent genes express nothing), a part gained, lost or of a different type is a whole slot (the types are categories, not a scale), a part both bodies have counts by how much it differs (what it hangs from, its size, placement, integrity and stats, as a share of each gene's range), and the outline counts by its shared points. Slots are 80% of the result and the outline 20%.
- No randomness is consumed. The same genomes in the same order always give the same species and the same ids (species ids are allocated from 0 in creation order).

## Records

```ts
interface SpeciesRecord {
  id: SpeciesId
  representativeGenomeId: GenomeId
  ancestorSpeciesId: SpeciesId | null // null for species founded at tick 0 with no parent
  memberCount: number
  populationHistory: PopulationSample[] // { tick, count }, every species.sampleInterval ticks
  createdAtTick: number
  lastSeenTick: number // last tick the species had a living member
  extinctAtTick: number | null
}
```

`populationHistory` holds at most `species.maxHistorySamples` samples; when full, the oldest are dropped (the species record itself is never dropped).

## Death and extinction

`DeathSystem` releases the organism. When a species' member count reaches zero it is marked extinct at that tick (`extinctAtTick`) and stays in the registry, so family trees, population history and reports can still query it.

## Queries (`World.species`)

| Method                  | Returns                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `list()`                | every species ever created, ascending id (including extinct) |
| `get(id)`               | one record, or `undefined`                                   |
| `active()`              | species with at least one living member                      |
| `speciesOf(organismId)` | the species id of a living organism, or `undefined`          |
| `ancestry(id)`          | ancestor species ids, nearest first                          |
| `descendants(id)`       | all species descended from `id` (ids ascending)              |

`OrganismSnapshot`, `HistoricalOrganismRecord` and the `organism-born` event carry `speciesId`.

## Reproductive isolation

With `species.reproductiveIsolation: true`, `ReproductionSystem` only considers partners of the same species as the organism trying to reproduce. It is off by default because it changes behavior; with it off, species are labels only.

## Configuration

See [configuration.md](configuration.md). `species.enabled: false` disables the registry entirely (no species ids; queries return empty results).

## Determinism and hashing

The registry is not hashed and uses no RNG; it cannot change any existing golden hash. `tests/species/` asserts that chunked and stepped runs produce identical registries (a digest of every species record), since the hash would not catch a difference.

## What makes a species now (2026-11)

Until then a creature with a new colour could drift into a new species (the hue gene was in the physical group) while a creature with a different body counted for nothing (the body weight was 0). The defaults are now **body 0.5, brain 0.15, physical 0.1, reproduction 0.1, metabolic 0.05, behavioral 0.05, learning 0.05, threshold 0.1** (`species.probe.ts`, 3 seeds x 30,000 ticks, about 50 creatures):

| Quantity                                                           | Before (threshold 0.06, brain 0.3, body 0, hue counted) | Now                        |
| ------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------- |
| Living species at the end                                          | 29, 37 (seeds 1, 2)                                     | 8, 12, 3 (seeds 1, 2, 3)   |
| Births that founded a species                                      | 20.5%, 22.7%                                            | 2.7%, 4.0%, 2.3%           |
| Mean pairwise distance among the living: brain / body / appearance |                                                         | 0.19 / 0.12 to 0.16 / 0.08 |

Any two brains differ by about 0.2 on their own, which with the old weights was above the old threshold by itself: that was most of the fragmentation. One part gained, lost or changed is about 0.033 of body distance here, so a species is a ball of bodies within a few parts of its founder. `threshold` and the weights are one decision; the probe takes `SPECIES_THRESHOLDS`, `SPECIES_WEIGHTS` and `SPECIES_SEEDS` to try others.

## Measured behavior (Phase 6A, before the change above)

The default `species.threshold` is **0.06**. It was chosen by measurement, not by taste: one 30,000-tick run per seed was fed to several registries at once (one per threshold), with the default configuration and the default weights.

| Quantity (default config, seeds 1-4)                 | Value                                                  |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Mean weighted distance between two founders          | 0.019 (founders differ only in brain)                  |
| Child to mother distance, median / p90 / p99 / max   | 0.034 / 0.05 / 0.06 / 0.083                            |
| Species created in 30,000 ticks at threshold 0.04    | about 100 (a new species every birth or two: too fine) |
| Species created at threshold 0.06 (alive at the end) | 9-20 (4-9): splits and extinctions                     |
| Species created at threshold 0.08 and above          | 1-2: the whole population stays one species            |

Two consequences worth knowing:

- Founders are close (0.019), so a default world always starts as **one species**. Species appear as body and brain genes drift, because a species is a ball around its founding genome and a lineage eventually walks out of it.
- The change from "one species" to "many" is steep around 0.06-0.08, because the per-birth step (about 0.034) is comparable to the threshold. With 3x the mutation rate and 2x the strength the same thresholds give 4-10 times as many species, so mutation settings and `threshold` should be tuned together.

The tests in `tests/species/exit-criteria.test.ts` bound these quantities with margin (3-80 species created in 30,000 ticks, at most 20 alive at once).
