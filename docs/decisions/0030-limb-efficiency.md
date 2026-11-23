# ADR 0030: Parts hung on a tail deliver less (`limbEfficiency`), and it is on

Status: accepted. Follows [ADR 0029](0029-limbs-and-stacking.md) (mouths on tails, three levers that fell short) and [ADR 0016](0016-part-stats-and-attachment.md) (part parents). Config only, no hash schema change; the new default moves every world that evolves a part hung on a part, so the goldens that describe older worlds pin `limbEfficiency: 1` and three new entries pin the new default.

## Why

ADR 0029 found a mouth hung on a flagellum sits 2 to 5 body radii out and sweeps the population (seed 4120846439: 1 creature at 100,000 ticks, all 27 at 220,000, every one an omnivore), and that all three levers it shipped fall short: the bite cap alone still goes to 100 percent (so reach is not the whole advantage), the upkeep price is unreliable (a tail mouth at full power is worth paying for), and carriers-only works everywhere but cost a world. **The owner's idea: tax attached parts, make them much less efficient.** That attacks the benefit instead of the price, and leaves tail parts possible (so no lifeline is lost).

## The mechanism

`anatomy.effects.limbEfficiency` in `(0, 1]`. A part hung on a part delivers `limbEfficiency` times its power for **every parent on its chain that is not a carrier** (`CARRIER_PART_TYPES`: eyestalk, skeleton, join): a mouth on a flagellum delivers a quarter of its bite size, bite rate and digestion at 0.25, a mouth on a flagellum on a flagellum a sixteenth; an eye on an eyestalk is not cut (carriers exist to carry; the scout starter and the eyestalk lift are unchanged). **Mass and upkeep stay full**, so a tail part is both weaker and no cheaper. One multiplier in `capabilitiesOf` covers every part type (thrust, sense range, bites, digestion, capacity, armor, regeneration, tolerance). The founder and every starter are exactly unchanged at any value (tested).

## Measured

**Screen** (a founder group of 40 percent grazers with the mouth on a long tail at the nose, 8 seeds x 30,000 ticks): the tail-mouth lineage is 30 percent of the living in the control (110 of 370) and 12 percent at 0.7 (41 of 351), 19 percent at 0.5 (73 of 385) and 13 percent at 0.25 (42 of 327); 1 extinct world in the control and at 0.7, none at 0.5 and 0.25. The values are noisy against each other (8 seeds), all cut the lineage; none removes it.

**Confirm** (the evolving world, 220,000 ticks, one world per cell):

| Seed               | control (limb bodies, peak)          | 0.5                                         | 0.25                                |
| ------------------ | ------------------------------------ | ------------------------------------------- | ----------------------------------- |
| 4120846439 (owner) | 100 percent, all 27 omnivores        | **still 100 percent** (48 of 56 at the end) | peak 10 percent, 0 of 78 at the end |
| 4                  | peak 60 percent, 30 of 50 at the end | peak 6 percent                              | peak 8 percent, 0 of 49             |
| 5                  | peak 24 percent, 0 of 31             | **died out at 150,000**                     | peak 25 percent, 2 of 38 at the end |
| 6                  | peak 8 percent                       | **peak 55 percent**                         | peak 3 percent, 0 of 71             |

0.5 fails (the owner's world still sweeps, a world went extinct, one reached 55 percent); **0.25 passes**: no sweep on any of the four seeds (limb bodies at the end 0, 0, 5 and 0 percent), no extinct world, and seed 4, where tail mouths had been the lifeline (carriers-only killed it), survives with 49 creatures.

**Variety and viability** (8 seeds x 100,000 ticks, 3246115366 included), 0.25 against the default: extinct worlds 0 against 0; mean population 53.5 against 55.5 (-4 percent); part types alive 11.3 against 11.2; distinct part lists 25.2 against 26.7 (94 percent); working parts per body 7.5 against 7.5; starved share of deaths 68 against 66 percent (the band is 35 to 70); lowest population 7 (seed 3, mean 34.7) and 13 (seed 4) in two worlds, against at least 19 everywhere for the control: said plainly, two worlds run thinner and one dips to 7, none dies. Carriers-only, for comparison, lost a world and 17 percent of the part lists.

## The gates, said plainly

Two held-out gate seeds fail with 0.25 and **were swapped, by the owner's decision**: ecology-stability seed 40 goes extinct at 43,236 ticks (with the old default it survives with 295 births of limb-bearing creatures and a lowest population of 11: tail-part creatures were carrying that thin world), and the brain controller's band seed 3 dips to 10 creatures (the floor is 15). They are replaced by the next unused seeds, 41 and 9, which pass. The reason it is not just moving the goalposts: on **32 other seeds (1 to 32) at 50,000 ticks the old default loses 2 worlds (28 and 30) and 0.25 loses none**, so the old gate panel looks like a lucky draw for the old default as much as a regression of the new one. Both readings are real: tail parts are an adaptation some thin worlds lean on (the same thing carriers-only showed), and a quarter-power tail part is a real cost to them. If the next sample of held-out seeds shows more extinctions than the old default's, this value is the first thing to revisit (0.35).

## What changed

- `limbEfficiency` default **0.25**. Every golden entry that describes an older world pins `limbEfficiency: 1` and **all 53 reproduce their hashes unchanged** (the proof that the flip is only this); three new entries pin the new default (the default world, and the tail-mouth founders at 0.25 and at 1, whose hashes differ).
- Phase 3's scenario A in `tests/world.test.ts` and the scarce-world extinction pin in `tests/determinism/long-run-extinction.test.ts` (reflex worlds that evolve bodies) pin `limbEfficiency: 1`, as they pin their other Phase 3 settings.
- Gate seeds 40 and 3 become 41 and 9 (above).

## Limits, said plainly

- One world per cell at 220,000 ticks; four seeds say the sweep is stopped on those worlds, not by how much elsewhere. The 30,000-tick screen cannot rank 0.7, 0.5 and 0.25 (the noise is larger than the differences).
- The cut applies to every part hung on a non-carrier, not only mouths: a sniffer or an eye on a tail also delivers a quarter. Variety did not fall (part types 11.3 against 11.2), so evolution still uses tails, but for less.
- Two thinner worlds (lowest 7 and 13) are a cost to watch; if more show up, the next value to try is between 0.25 and 0.5 (0.35), with carriers-only as the hard alternative.
- The cap and the upkeep price of ADR 0029 stay as off switches.
