# The cluster world

How the cluster layout works. The decisions and the reasons are in [ADR 0014](../decisions/0014-cluster-world.md). Status: **built and tested, off by default** (`environment.layout: 'field'` is the default).

## Turning it on

`environment.layout: 'clusters'` (the "Clusters" preset). Everything below applies only then; the field world is unchanged, bit for bit.

## Geometry

| Setting (`environment.clusters.*`)         | Default    | Meaning                                                                                                      |
| ------------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------ |
| `count`                                    | 6          | clusters, on a regular polygon around the origin                                                             |
| `radius`                                   | 250        | radius of each circular cluster                                                                              |
| `spacing`                                  | 750        | distance between neighbouring centres; the void between two circles is `spacing - 2 * radius` (250) wide     |
| `patches`                                  | 6          | biome patches inside each cluster                                                                            |
| `speciesPerCluster`, `organismsPerSpecies` | 3, 6       | founders: 6 x 3 x 6 = 108 organisms, 18 species                                                              |
| `voidSpeedScale`, `voidVisibility`         | 0.7, 0.5   | top speed and sensor range in the void                                                                       |
| `mateSignalCap`                            | 200        | the mating signal reaches at most this far (it must be less than the void width)                             |
| `clusterSpread`, `speciesSpread`           | 0.08, 0.03 | founder gene offsets between clusters and between species of one cluster, as a fraction of each gene's range |

The world has no walls. `environment.width` and `height` are only the reference area the food and population numbers are tuned for.

## What changes in the engine

- **Ground:** the cluster whose circle contains a position, then the nearest of that cluster's biome patches; outside every circle it is void. The map is built once from the `terrain` stream and is not hashed.
- **Food and hazards** are placed inside clusters only (pick a cluster, then a point in its disc). `resources.initialCount`, `maxCount`, `spawnRate` and `maxPopulation` are multiplied by the clusters' combined area over the reference area (about 4.71), so density per unit of habitable ground is the tuned field density. `World.config` reports the values the world actually runs with.
- **Movement and newborns** are not clamped to a box. In the void top speed is `voidSpeedScale` and sensor range `voidVisibility`.
- **Observations:** position inputs are relative to the nearest cluster centre over 2.4 radii, and the novelty grid covers the same box, so a brain sees the same range in every cluster.
- **Founders:** 18 species, each a small offset from its cluster's archetype, with a hue family per cluster. The registry keeps each founder group together (see the ADR).
- **Invariants:** positions must be finite instead of inside a box.

## Reading it

`World.clusterLayout()` (centres, radius, patches, bounds) for drawing, and `World.clusterReport()` (population per cluster and in the void, species purity, mean purity). Both are reads and never change the state hash.

## Biomes

Cluster `i` leans on `REGION_TYPES[i]` (+0.25) and `REGION_TYPES[i + 1]` (+0.15) over a base of 0.15 for meadow, forest and wetland and 0.05 for desert, cave and volcanic, so every cluster has some habitable ground and its own mix.

## What is verified

Layout geometry, biome weights and terrain, the effective configuration, the 18-species founder structure, colour families, food confined to clusters, organisms leaving clusters, the void's effect, determinism however a run is sliced (30,000 ticks, brain and reflex, with anatomy on), invariants, and an equivalence harness showing the field world is identical to the previous commit (20 of 20 scenarios).
