# 0014: The cluster world (an unbounded world of circular clusters, with void between them)

Status: **Accepted** (owner decisions, 2026-11-02: infinite world, circular clusters with several biomes inside each, 6 clusters of 3 species, radius 250 and spacing 750, each cluster its own signature biome mix, void empty with a mild slowdown, anyone can mate)

The legacy prototype was an unbounded world of circular clusters separated by empty space, one species group per cluster. The rebuilt engine is a bounded 500x500 field. This ADR brings the prototype's world back as a second **layout**, next to the field, and gives it founders that match: 6 clusters, 3 species per cluster, clusters distinct from each other, species inside a cluster similar but different.

## Problem

A single field has no geography: every organism can meet every other, there is one gene pool, and "species" can only appear by drift. The prototype's clusters gave the world structure: separate populations that evolve in isolation, a void that is a real barrier, and visible groups. We want that back without losing what the field gives us (a tuned, gated, bit-reproducible default) and without a second engine.

## Decision

### Two layouts

`environment.layout` is `'field'` (the default, exactly today's world) or `'clusters'`. Every cluster behavior below is guarded by the layout, so a field world takes exactly the code path it takes now: the equivalence harness against the previous commit must stay 20 of 20 identical, and no golden hash changes. The cluster layout becomes the default only in the anatomy-consequences PR, after tuning.

### Geometry

`environment.clusters` holds `count` (6), `radius` (250), `spacing` (750) and the layout is a **regular polygon around the origin**, as in the prototype: the centres lie on a circle of radius `spacing / (2 sin(pi / count))`, so neighbours are `spacing` apart and the void between two neighbouring circles is `spacing - 2 * radius` = 250 wide. This is the prototype's 1000 / 3000 at a quarter of the scale: our organisms are about a quarter of the size of the prototype's. The layout is pure geometry (no randomness) and uses the engine's `cos` and `sin`.

The world has **no walls**: positions are unbounded numbers, movement and newborn placement are not clamped, and the spatial hash already keys on integer cells, so nothing in the engine needs a boundary. `environment.width` and `height` keep their meaning for the field only; for clusters they are the bounding box of the layout plus a margin, used by cameras and by nothing in the simulation.

### Biomes inside a cluster

Each cluster has **several biomes** and its own **signature mix**. A cluster `i` is made of `patches` (default 6) Voronoi patches inside its circle: patch points are drawn from the `terrain` stream, uniformly in the disc, and each patch's region type is drawn from the cluster's **weight table**. Meadow, forest and wetland are habitable and get a floor of 0.15 each; desert, cave and volcanic are harsh and get 0.05 each; the cluster's primary biome (`REGION_TYPES[i]`) gains 0.25 and its secondary (`REGION_TYPES[(i + 1) % 6]`) 0.15. So every cluster mixes all biomes and each has a different signature. (The first design, 0.50 primary and 0.30 secondary, made the volcanic, cave and desert clusters unlivable: they died out in most seeds. The floor of habitable ground came from that measurement.) A position's region is the type of the nearest patch of the cluster whose circle contains it; outside every circle it is **void**. The lookup is analytic (point-in-circle, then nearest of a handful of points), built once from the `terrain` stream and **not hashed**, like today's region map.

`RegionMap` and the new `ClusterTerrain` share a small `Terrain` interface (`typeAt`, `indexAt`, `typeOf`, `toSnapshot`); `typeAt` returns `null` for void. `REGION_TYPES` is **not** extended: the field map picks types by `REGION_TYPES.length`, so adding a seventh type would change every field world.

### The void

Void is empty and mildly hostile: no food ever spawns in it (food is placed inside clusters only), top speed is multiplied by `clusters.voidSpeedScale` (0.7) and sensor range by `clusters.voidVisibility` (0.5), and it has no temperature or hazard effect beyond the basal cost of an organism that cannot eat. It is a barrier through starvation and slowness, not a wall.

### Resources and populations scale with area

A field world is tuned for a 500x500 area. In cluster mode `resources.initialCount`, `maxCount` and `spawnRate` are multiplied by `totalClusterArea / (width * height)` (about 4.71 for six clusters of radius 250), so food density per unit of habitable area is exactly the tuned field density; and `maxPopulation` scales the same way. Food and static hazards are placed by picking a cluster uniformly and then a point uniformly in its disc, rejecting positions where the chosen kind does not grow.

### Mating: anyone can mate, only the void separates

There is no reproductive isolation between clusters beyond the void. The **mating signal** (the sensor-free radius of `mateSenseRadius`, 250) is capped to `clusters.mateSignalCap` (200) in cluster mode, below the 250 void width, so ready organisms in different clusters never see each other across the gap. Organisms that drift into the void can still meet a stranger within the ordinary reproduction search radius. That gene flow is not assumed small: it is **measured** (see "Measuring blur") and reported with every probe.

### Founders: 18 species

Cluster mode starts `count * speciesPerCluster * organismsPerSpecies` organisms (6 x 3 x 6 = 108, matching today's tuned density of 20 organisms on the 500x500 field scaled by area) instead of `organisms.initialCount`. Founders get **identity offsets** on top of the usual founder genome:

- each cluster `c` draws one offset per identity gene, `clusterSpread` (0.08) of the gene's range in a random direction, from the `genetics` stream: this is the cluster's **archetype**;
- each species `s` of that cluster draws a smaller offset, up to `speciesSpread` (0.03) of the range, around the archetype;
- the body outline genes (point count, radii, angles) move twice as far, since outline differences are what a viewer sees;
- all organisms of one species share that offset and differ only by their random brains.

Identity genes are the movement, sensing, metabolism, behavior and learning genes (life stages and reproduction stay at the baseline so every founder is a viable animal), plus the outline and paint genes: clusters differ in **look and body shape** as well as a little in behavior. Offsets are clamped to each gene's range. The cluster's hue family comes from the **hue gene**: cluster `c` centres on `c / 6` of the colour wheel and each species sits 0.04 beside it, so a cluster reads as one colour family and its three species as its shades; the pattern gene differs by species and the accent hue is the complement.

**Species are designated, not inferred.** The species registry joins a genome to the nearest species within `species.threshold` (0.06), and offsets this small are far below it: left alone, the 18 founder groups would collapse into a handful of species. So the registry gets one small addition, a `founderGroup` on the assignment: the first member of a group founds its species whatever its distance to the others, and the rest of the group join it. Ordinary births are untouched and still join the nearest species within the threshold. The offsets are kept small because larger ones endanger the founders (see Measured results).

### Observation and novelty

`positionX` / `positionY` in the observation are position relative to the nearest cluster centre over the cluster radius (clamped to `[0, 1]` after mapping `[-1.2R, 1.2R]`), so the brain's inputs keep their range and mean the same thing in every cluster; the field keeps `x / width`. The novelty grid becomes a grid over the nearest cluster's bounding box, the same size (8x8).

### Measuring blur

`World.clusterReport()` (derived, not hashed) returns per cluster the living count and how many of those are in the void, and, per species, its dominant cluster and **purity**: the share of its living members in that cluster (nearest-centre classification, so an organism in the void counts for its nearest cluster), plus the living-weighted mean purity. The "Clusters" panel in the application shows it. Every probe reports extinction, per-cluster persistence and purity.

### Rendering

The renderer is told the cluster layout (`ClusterLayoutSnapshot`: centres, radius, patches with their types). It draws an infinite grid, a faint ring around each cluster, biome patches inside the rings and nothing (void) outside, and fits all six clusters in view. Organisms are coloured by their hue gene in cluster mode (species colour in the field). The camera clamps to the layout bounds plus a margin.

### Hash

No new hashed state: terrain is derived from the `terrain` stream like the field's, founders are placed from existing streams, and cluster ids are derived. Hash schema stays **7**, and the field goldens do not change; cluster goldens are added.

## Measured results (this PR)

Probes use 8 seeds x 12,000 ticks (a first look, not a gate; the 128-seed measurement is the tuning PR's job):

- **Founders:** exactly 18 species, 3 per cluster, 6 founders each, 18 organisms per cluster, at tick 0.
- **Persistence is the open problem.** With the default settings about 70-90% of clusters are still populated at 12,000 ticks (45 of 48 in the best run, 29 to 38 of 48 in others; the spread between runs is as large as any effect of the settings tried). Whole worlds do die in some seeds. Founder offsets of 0.15 and above lost whole worlds, which is why the defaults are 0.08 and 0.03.
- **The void is a leak, not a wall.** Early on about 40% of founders are in the void, where they cannot eat. A slower void did **not** help (void speed 1.0, 0.85, 0.7 and 0.5 gave 44, 36, 45 and 40 of 48 clusters alive: noise, not a trend), and a slower void traps the organisms that wandered out.
- Mean species purity stays high (0.85 to 1.0 at 12,000 ticks): clusters do not blur much in that time, mostly because few organisms cross.

The cluster layout therefore ships **off by default**. Making it the default needs the tuning work (the next pull request): keeping organisms home, per-cluster persistence over 128 seeds, and the anatomy changes that interact with it.

## Alternatives considered

- **Clusters as seven region types on the field (void as a type).** Reuses the region machinery but keeps the 500x500 box and, because `REGION_TYPES.length` is a draw, would change every field world. Rejected when the owner asked for the whole world to be reinvented.
- **Several organisms-per-cluster worlds run separately.** Simple, but clusters would never interact, so "the void is a barrier" and gene flow would not be testable.
- **Reproductive isolation by species.** Would keep clusters pure by construction, but the owner chose "anyone can mate"; purity is measured instead.
- **A seventh biome weight table identical for every cluster.** Rejected: the owner asked for each cluster to have its own signature.

## Consequences

- Persistence per cluster becomes the main risk: six small ecosystems each need a viable population (the Allee effect that mate seeking only partly fixed). The cluster layout therefore ships off by default with the measured numbers; the tuning PR decides whether it can become the default.
- Cost per tick rises with about five times the organisms; the web host's frame budget is checked with a Playwright measurement.
- Brains trained on `x / width` positions are not comparable between layouts; the layouts are separate worlds.

## Revisions

- **Food follows the living (2026-11-07, owner request).** Food was placed in a uniformly chosen cluster, never expired, and counted against one global cap, so a cluster that died out kept receiving a sixth of all food that nobody ate; the surviving clusters were rationed. Now every cluster with at least one living organism gets an equal share of new food and an empty one gets `environment.clusters.foodFloor` (0.05) of a share (same draws, no new hashed state), and food stranded in clusters with no living organisms is cleared at most `strandedFoodPerTick` items a tick. A first version weighted by population; in 8 test worlds it let crowded clusters hoard food and 5 lost a cluster entirely, so shares are equal, not proportional. While every cluster is populated the behavior is exactly the old even spread, so no golden changes.

- **Scale (2026-11-03, owner request, in the anatomy-consequences pull request).** The clusters are four times the area (radius 500, not 250) with the same food and population density (resources and founders scale with area: 432 founders, about 18.85 times the reference food), and first six times the spacing (4,500). The owner then asked for a smaller void, so the default spacing is **2,500** (a void 1,500 wide, still far above the 200 mating-signal cap). The numbers above (250, 750, 108, 4.71) describe the first version. At the larger scale with the way-home sense (ADR 0015), 16 of 16 worlds kept all six clusters populated at 20,000 ticks with almost nothing stranded in the void (at the 4,500 spacing).
