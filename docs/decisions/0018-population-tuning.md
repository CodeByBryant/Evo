# ADR 0018: Population tuning: why nine in ten creatures starved, and what changed

Status: accepted. Follows [ADR 0017](0017-feeding.md) (bites), which doubled populations and removed wasted food but left the starved share of deaths at about 91 percent.

## The problem, measured

The owner's target was starvation near half of all deaths, no extinct worlds, and `harsh` still harsher. Before this change, over 8 seeds x 30,000 ticks of the default `balanced` world (bites on):

- 7,566 births, 6,442 starvation deaths, 451 deaths of old age: **91 percent starved**.
- **38.5 percent of all babies starved before they matured** (2,915 of 7,566), and half of all deaths were adults that starved. Only 6 percent of creatures lived to old age.
- Adults bred at 0.009 births per second each, a quarter of the 1/30 ceiling: they bred whenever energy reached `minEnergy` (60 of 100), each birth cost each parent about 20 energy, and the surplus that created was spent on babies that mostly did not make it.

The starved share was insensitive to food supply (lush, balanced and harsh all gave 90 to 91 percent) and to a single lever: a one-at-a-time sweep showed that making children sturdier (`offspringInvestment` 25) cut juvenile starvation from 38.5 to 7 percent of births but raised adult starvation from 50 to 86 percent of deaths, so the total stayed at 93. **In a food-limited population someone always starves; moving one lever only moves who.** Births were not the only issue: with a 600 s lifespan, old-age deaths flow at about `P / 600` per second, an order of magnitude below the birth rate.

Evolution did not undo any tuning on this timescale: the evolved reproduction genes barely moved over 30,000 ticks.

## What changed (defaults)

| setting | before | after |
| --- | --- | --- |
| `organisms.maxAge` | 600 s | **300 s** |
| `organisms.senescenceAge` | 510 s | **250 s** |
| `reproduction.minEnergy` | 60 | **75** |
| `reproduction.cooldown` | 30 s | **45 s** |
| `resources.spawnRate` | 1.6 / s | **2.0 / s** |
| gene range `physical.maxAge` | 570 - 1200 | **270 - 1200** |
| gene range `physical.senescenceAge` | 255 - 560 | **150 - 560** |
| gene range `reproduction.minEnergy` | 40 - 90 | **40 - 98** |
| gene range `reproduction.cooldown` | 15 - 60 | **15 - 120** |

The lifespan was the strongest lever: a shorter life raises old-age deaths without touching births, and restrained breeding keeps adults fed. The food increase brings the population back to where bites left it (about 56) after the restraint lowered it. **The gene ranges had to move with the baselines**: mutation clamps a gene to its range, and a 300 s lifespan against a 570 s floor drifted up within one run (evolved mean 337 after 30,000 ticks), which would have undone the tuning. Mutation size is a fraction of the range width, so the wider ranges also make those four genes mutate in bigger steps.

The `classic` preset keeps the Phase 3 economy (600 s, 60, 30 s). Its original way of eating wastes about a third of the food, so the restrained breeding made 3 of 8 worlds go extinct.

## Evidence

- **Sweep** (8 seeds x 30,000 ticks): one lever at a time, then combinations. Too much restraint (`minEnergy` 90 with `cooldown` 60 and a 300 s life) lost 1 of 8 worlds, which marks the edge.
- **Validation** of the chosen setting over **32 seeds x 50,000 ticks**: starved 52.9 percent, old age 44.4 percent, population mean 56.2 (minimum 18, maximum 108), **no extinct world**. The evolved genes after 50,000 ticks: `cooldown` 45 to 41, `minEnergy` 75 to 74.9, lifespan 300 to 366 (selection prefers longer lives, gently).
- **Presets** (8 seeds x 30,000 ticks) under the shipped defaults: balanced 55.1 creatures / 49.0 percent starved; lush 72.0 / 50.6; harsh 39.6 / 48.1 (fewer creatures, as intended); fixed-bodies 55.6 / 49.1; rapid-evolution 54.6 / 64.4 (more mutation, more starvation); classic 36.6 / 90.1 (the Phase 3 economy, as designed). No world went extinct.
- **Config only, no engine change:** passing the old economy and ranges explicitly to the new engine reproduces all 22 old golden hashes exactly (22 of 22). The goldens regenerate for the new defaults; the schema does not change.

## The cluster world is not solved

At 30,000 ticks the default cluster world (6 clusters, 4 seeds) is **bimodal**: three seeds settle at about 1,050 creatures (up to 3,368) and run at 32 to 38 ticks per second; one seed lost 2 of its 6 clusters (population 231, 166 ticks/s). No world went extinct and the starved share is 55 to 58 percent, but a cluster supports about four times the creature density of the field on the same food per area. I tried a `clusters.foodScale` multiplier at 0.5 and 0.7: **it made things worse** (at 0.5 one world went extinct and two more ended with five of six clusters empty; at 0.7 three of four lost clusters), because each cluster is a small isolated population with no recolonisation across the void. The knob was removed. The cluster layout needs its own design (a per-cluster population cap, refuges or re-seeding), not a food tweak; it is recorded as open work.

## Consequences

- Pins re-measured: the Phase 3 scenarios and the anatomy stress tests keep the pre-tuning economy (`tests/support/phase3.ts`), because they describe Phase 3 and a body-gene stress test that the restrained economy cannot survive; the statistical gates in the determinism suite are re-pinned with their measurements in their own comments.
- `PROBE_CONFIG` and `PROBE_SEED_FROM` were added to the probe so any setting can be swept and seeds spread over processes.
- Numbers here are provisional and will move again with the cluster work and the failure-state and mutation changes.
