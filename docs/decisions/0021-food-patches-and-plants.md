# ADR 0021: Food in patches, renewable plants and a bigger world

Status: accepted. Follows [ADR 0017](0017-feeding.md) (bites and food health), [ADR 0018](0018-population-tuning.md) (the economy), [ADR 0020](0020-starting-bodies.md) (starting bodies, whose measurements prompted this).

## The problem

[ADR 0020](0020-starting-bodies.md) measured that **starting variety does not raise part variety**: from any start, bodies end with about 11 of 16 part types. Variety has to be pulled by selection, and nothing pulled. Food appeared uniformly and memorylessly (two uniform draws a spawn), each item was eaten whole and gone, and the world was small enough that the nearest food was always within sensing range, so walking never beat waiting, no place was worth a visit, and nothing made a body or a behaviour better at somewhere in particular.

## Decision

1. **Patches (`resources.distribution`).** Food follows a smooth pattern of patches that fades and drifts: value noise in x, y and time (`ecology/FoodField.ts`), a pure function of the world seed, so it uses no random stream, stores nothing and is not hashed. In `noise` mode a spawn draws a fixed eight candidate sites (x, y and an acceptance number each) and keeps the first the pattern accepts and where its kind grows, so the draw count never depends on the outcome. `uniform` mode is the old two draws. `scale` is the patch size (120 units), `contrast` how much patches stand out, `floor` how sparse bare ground is, `turnover` how fast the pattern changes.
2. **Plants (`resources.plants`, hash schema 11).** A spawn is a **plant**: a hub joined to six nodes, each an ordinary bitable food item. An eaten node is regrown from the hub's store (a 20 percent reserve is never spent); the hub gains photosynthesis up to its capacity, which is where energy enters the world; eating the hub kills the plant and frees its nodes as free food; a plant withers with its nodes after its lifespan (300 s), so patches turn over with the drifting pattern instead of piling up where it has moved on (the same disease as the stranded food of [ADR 0014](0014-infinite-cluster-world.md)). **Photosynthesis and regrowth follow the season**: without that a plant's store is a buffer round winter (see Findings). Node positions come from a hash of the hub's id (no draws). `spawnRate` counts plants a second; `initialCount` and `maxCount` still count items. The cluster layout keeps free food. A hub is twice as hard to bite as its kind.
3. **A bigger field.** The default field is 700 x 700 (`fieldScaling`): the same food supply and the same creatures over twice the area. What makes up the _place_ scales with the area (region seed count, static hazards, storm rate; the region lookup keeps its cell size); the _population_ does not. A 500 x 500 world is exactly what it was. The cluster layout's food scaling now uses the fixed reference field rather than `environment.width x height`, so the default size no longer reaches into it.
4. **Presets.** `balanced`, `lush`, `harsh`, `rapid-evolution` and `fixed-bodies` use patches, plants and 700; `lush` has more and brighter plants, `harsh` fewer and the same storm ratio as before. `classic` and `clusters` keep free food on 500 x 500.

## Measured

Default world, 8 seeds x 30,000 ticks unless said (`tests/probe/food.probe.ts`; a creature is _idle-spinning_ if over 20 ticks it moved less than a body radius but turned more than 90 degrees, _lost-spinning_ if also nothing was within sensing range):

| setup                                   | extinct    | mean pop | lowest | starved | lost-spin | part types at end | part lists | ticks/s |
| --------------------------------------- | ---------- | -------- | ------ | ------- | --------- | ----------------- | ---------- | ------- |
| before (free food, 500)                 | 0          | 55.9     | 28     | 53%     | 6.3%      | 11.6              | 21.6       | 944     |
| patches only                            | 0          | 50.7     | 24     | 53%     | n/a       | 11.3              | 22.3       | 1050    |
| plants, first guess (spawn 0.15)        | 2 of 8     | 26.5     | 0      | 57%     | n/a       | 7.1               | 11.3       | 1790    |
| plants at 500                           | 0          | 63.7     | 23     | 57%     | n/a       | 12.6              | 28.0       | 695     |
| plants at 1000                          | **7 of 8** | 12.0     | 0      | 55%     | n/a       | 0.8               | 1.3        | 3253    |
| plants at 700 (chosen setup)            | 0          | 57.3     | 28     | 55%     | 4.0%      | 11.1              | 22.1       | 757     |
| **shipped `balanced`** (16 seeds)       | 0          | 58.2     | 16     | 56%     | 3.3%      | 11.7              | 25.9       | 684     |
| shipped `balanced` after the season fix | 0          | 56.3     | 22     | 54%     | 4.2%      | 11.5              | 28.0       | 830     |
| shipped `lush`                          | 0          | 88.2     | 29     | 57%     | 3.6%      | 13.1              | 33.3       | 488     |
| shipped `harsh`                         | 0          | 41.3     | 10     | 55%     | 3.4%      | 9.5               | 15.4       | 1215    |
| shipped `fixed-bodies`                  | 0          | 63.8     | 29     | 56%     | 4.2%      | 5.0               | 1.0        | 577     |

The sweep over field size at the same plants is the reason for 700: it holds (59.9 creatures, none extinct), 500 holds, and **1000 collapses** because at a fixed supply the nearest plant is out of sensing range. The population stayed in the ADR 0018 band (starved share 53 to 57 percent) with no extinct world in 8 or 16 seeds; `lush` is richer and `harsh` poorer than `balanced`, as named.

## Findings, stated plainly

- **Lost-spinning fell by about a third** (6.3 to 3.3 or 4.2 percent). The wider idle-spin share did _not_ fall (12.6 to 15 percent): a creature feeding at a plant stands and turns, and the metric cannot tell that from waiting. So the "spin, spin, spin" is not gone, it is half of what it was where there is nothing to eat, and part of it is now creatures grazing a plant.
- **Part variety moved a little, in the right direction, inside the noise.** Part lists at the end rose from 21.6 to 25.9 to 28.0 (richer `lush` 33.3, poorer `harsh` 15.4), part types ended at 11.5 to 11.7 against 11.6. Eight to sixteen seeds cannot separate this from chance; what the data supports is that richer worlds keep more part lists, not that patches and plants select for specialist bodies. If part variety is the goal, the next levers are obstacles and predation, not more food structure.
- **A bug this change caused, caught by an existing test.** Seasons scaled only how often plants _spawned_, so a plant's hub store buffered winter completely (winter births 50 against summer 53 where the old world had 11 against 65). Photosynthesis and regrowth now follow the season; the harsh-winter test passes on its original assertion.
- **A cost.** The default world runs at about 680 to 830 ticks a second against 944 (up to seven items per plant, 200 to 240 food items against 45). The cluster world is unaffected.
- **Hidden coupling removed.** The cluster layout scaled its food by `environment.width x height`, which would have followed the new default size; it now uses the fixed reference field.

## Verification

- **Patches only (commit 1):** all 31 golden tests reproduced unchanged with `uniform`.
- **Plants (commit 2):** with plants off, 8 of 8 scenarios (default, instant eating, reflex, noise, noise with reflex, clusters, lush, no ecology) give identical normalized snapshots (six per scenario) against the previous commit; the hash differs by the four new resource fields (schema 11). The goldens regenerated there once, and the hash test vectors were recomputed with an independent Python hasher that reproduces the version 10 values first.
- **Defaults (this commit):** every earlier golden entry is pinned to the old world (free food, uniform, 500 x 500) and still reproduces its original hash; entries with plants regenerated once more for the seasonal change; five new entries cover the new default (default, ecology, reflex, evolving bodies, `lush`). 39 entries.
- 26 unit tests assumed the old default world; the mechanism tests pin it through `FREE_FOOD` (`tests/support/food.ts`, also inside `PHASE3_ECONOMY` and `withoutEcology`). Two exit-criteria tests were not about the old world but encoded it (the migration test's `< 30` regions, now `seedCount`); the niche and winter assertions are unchanged.

## Consequences

- Worlds are no longer small enough to see all food from anywhere; a creature that does not move will find its plant eaten or withered.
- A bigger field than 700 needs more plants (the supply is not scaled by design); `fieldScaling` scales terrain, never food.
- Not done here: obstacles (Voronoi boulders, sight blockers), predation, and making the species metric see what a body does.
