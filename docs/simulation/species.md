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
- `weightedDistance` combines the seven group distances from `genomeDistance` with `species.distanceWeights`, normalized by the sum of the weights. Each group distance is in `[0, 1]`, so the result is too.
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
