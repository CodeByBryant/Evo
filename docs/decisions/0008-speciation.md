# 0008: Speciation (genetic-distance species, derived registry)

Status: **Accepted** (approved by the project owner with the Phase 6 plan, 2026-10-31)

## Problem

Phase 4 made genomes comparable (`genomeDistance`) and Phase 5 gave every organism a brain, but nothing in the engine says which organisms belong together. The prototype's species ids did not represent genetic compatibility (bug inventory, Phase 0). Phase 6 (roadmap 6.1-6.4) needs species that are **based on genetic distance**, that can **split**, and that can **go extinct while remaining queryable**, without changing how the simulation behaves unless the owner turns that on.

Phase 6 is delivered as two pull requests, speciation first, ecology second (owner decision). This ADR covers the first. Ecology (health, resources, regions, seasons, hazards, migration) is ADR 0009.

## Decision

### Species are a derived record, like lineage

A `SpeciesRegistry` (`packages/simulation/src/species/`) is built from genomes at birth. It is **not part of the state hash**, exactly like `LineageStore`: it is a pure function of the sequence of genomes the simulation produced, it consumes no randomness, and no system reads it to decide anything by default. Consequences:

- Adding it does not change a single existing golden hash. This is the main gate for the PR.
- The registry is rebuilt identically by any replay of the same seed and config.
- Like lineage, it grows without bound and is not persisted; bounding and saving it are Phase 8 concerns.
- No new `WorldEvent` type is added: `events.emittedCount` is hashed, so a new event would change every golden. Species creation, ancestry and extinction are recorded in the registry itself (with ticks) and exposed through `World.species`. The `organism-born` event payload gains a `speciesId` field (events are not hashed field by field).

### Assignment at birth

For a child genome (roadmap 6.3):

1. Compute the weighted genetic distance to the **representative** of every active species (an extinct species is never rejoined).
2. Join the nearest species if its distance is within `species.threshold` (ties go to the lower species id).
3. Otherwise **found a new species**. Its `ancestorSpeciesId` is the species of the child's first (mother's) parent.

Founders are assigned the same way, in id order, before the first tick. A species' **representative is its founding genome and never changes**. This is the simplest rule that is stable and testable; it means a species is a ball around its founder in gene space rather than a drifting cluster. A moving representative (for example the running mean) is a possible later refinement and is not needed for the Phase 6 exit criteria.

### Weighted genetic distance

`genomeDistance` keeps its existing unweighted `total` (existing tests and Phase 4 behavior are untouched). A new pure function `weightedDistance(distance, weights)` combines the seven group distances with configurable weights, normalized by their sum. Defaults follow the roadmap (physical 0.2, sensory 0.2, metabolic 0.2, behavioral 0.1, brain 0.3) and give the two groups the roadmap does not list (reproduction, learning) a small share so every gene can contribute. The weights and the threshold are config (`species.*`), validated like all config.

### Population history and extinction

Each species keeps `memberCount`, `createdAtTick`, `lastSeenTick`, `extinctAtTick` and a bounded list of `PopulationSample`s taken every `species.sampleInterval` ticks. Extinct species stay in the registry forever (roadmap 6.4); they are **not** stored in the `HistoryStore` ring buffer, which evicts old records. The registry offers ancestry and descendant queries so family-tree and evolutionary-report features (Phase 7/8) have what they need.

### Species do not change behavior (by default)

`species.reproductiveIsolation` (default **false**) restricts partner choice to the same species. It exists because speciation without reproductive isolation is only a labeling exercise, but turning it on changes behavior, so it is off by default and proven by a test. Nothing else reads a species id.

## Alternatives considered

- **Store `speciesId` on `OrganismState` and hash it.** Needed only if species drive behavior; it would change every golden for no current benefit. Rejected for now (owner decision); the switch above can be promoted later with a hash bump.
- **Recompute species every N ticks by clustering the living population.** Cheaper per birth but species ids can shift between recomputations and it contradicts the roadmap's birth-time rule. Rejected.
- **A moving representative (running mean genome).** Handles drift better but makes membership depend on history in a way that is harder to test and to explain. Deferred.
- **Emit `species-created` / `species-extinct` events.** Best for observability but changes `emittedCount` and therefore every hash. Rejected in favor of registry records; Phase 7/8 can derive events from the registry timeline.

## Consequences

- Species counts and ancestry are queryable at any time, including for extinct species.
- A bad `threshold` either collapses everything into one species or fragments the population; the default (0.06) is set by measurement (see `docs/simulation/species.md`) and guarded by tests that bound the species count.
- Founders differ only in their brain weights (Phase 4), so early species structure is driven by brain distance until body genes diverge.
- Cost: one distance computation per active species per birth. Births are rare relative to ticks, and the active species count stays small by construction (tested).

## Addendum (2026-11): colour is not a species, the body is

Two defects showed in the running app. A creature that differed from its parent only in colour could found a new species, because `physical.hue` was one of the five genes of the physical group and a mutation of it moved the group distance. And a creature with a different body plan (other parts, other outline) counted for nothing, because `species.distanceWeights.body` was 0. Both go against what a species is meant to say.

- **Cosmetic genes** (`physical.hue`, `body.visual.pattern`, `body.visual.accentHue`) carry a `cosmetic` flag in their gene definition and are left out of every group of `genomeDistance`; `appearance` reports them apart. The flag is data on the gene, not a special case by name, so a later cosmetic gene is one flag.
- **The body plan is compared as a body** (`genetics/BodyDistance.ts`): empty slots express nothing, a part gained, lost or of another type is one whole slot, a shared part counts by how it differs, the outline by its shared points.
- **New defaults**, set by measurement (see `docs/simulation/species.md`): threshold 0.1, body 0.5, brain 0.15 (it was 0.3), physical 0.1, reproduction 0.1, metabolic, behavioral and learning 0.05. Living species among about 50 creatures go from 29 to 37 to 3 to 12, and the share of births founding a species from about one in five to about one in thirty.
- Species are not hashed, so no golden changes. The cluster layout already takes `max(species.threshold, clusters.speciesThreshold)` (0.12), so cluster worlds are unchanged by the threshold.
- Founders still differ only in brain weights and a world still starts as one species.
- **Threshold 0.12 once every part type is reachable** (ADR 0016 addendum): more body variety means more body distance, and at 0.1 a world then had 10 to 22 living species and 8% of births founding one. 0.12 gives 6 to 16 and 2 to 5% and is the cluster layout's own threshold. The species gates moved with their measurements, each still far below its value before the species fix.
