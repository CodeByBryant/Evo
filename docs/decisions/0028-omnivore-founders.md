# ADR 0028: Omnivore founders, measured, and why the default did not change

Status: accepted. Follows [ADR 0023](0023-predation.md) (the jaw and the hunter group), [ADR 0026](0026-diets.md) (what a mouth can eat) and [ADR 0027](0027-life-cycle.md) (the life cycle). No engine, contract, hash or golden change: all 53 pinned golden entries reproduce.

## Why

After the life cycle, the owner asked for more starting carnivores (4, 8, 10, and a 1:3 ratio of carnivores to herbivores). With the hunter group (a grazer whose only mouth is a jaw, which takes 0 from plants) **more starting hunters made worlds worse, not better**: 16 seeds x 30,000 ticks, 2 hunters 0 of 8 worlds extinct (default), 4 hunters 1 of 8 extinct and a jaw lineage alive in 1 of 8, 5 hunters 2 of 8 extinct, 8 hunters 1 of 8 extinct and no jaw lineage alive, 10 hunters 8 of 8 extinct by 10,000 ticks. A jaw-only founder cannot eat plants, and early on there is almost no prey or carrion.

## Do omnivores exist already?

Yes. A new probe (`tests/probe/omnivore.probe.ts`) classifies every creature by its working mouths: plant-only, jaw-only, **omnivore** (a flesh mouth and a mouth that takes plants) or mouthless, and keeps the class by id. In the default world (8 seeds x 100,000 ticks, including 3246115366) omnivores arise by mutation and **win over both specialists**: 1.7 matings per 1,000 creature-ticks against 1.2 for plant-only, a lifespan of 189 s against 170 s, 26 percent of their intake is meat (13 percent flesh, 13 percent carrion); jaw-only bodies are gone by about 10,000 ticks; an omnivore lineage is alive at the end in 5 of 8 worlds; the winning plan is jaw plus mandible (951 of 1,173 omnivore births). What limits them is supply (about 1 percent of births at 30,000 ticks). The seed-1 "jaw monoculture" noted in ADR 0027 (40 of 41 creatures) was an omnivore monoculture. With no founder hunters omnivores still arise (41 born in 16 worlds, alive in 1), and tripling structural mutation did not help (alive in 2 of 16).

## The founder starters

`omnivore-sprout` (the grazer's sprout mouth plus a jaw) and `omnivore-mandible` (a mandible plus a jaw) are group-only starters (`pool: false`, like the hunter), so a world can start founders as omnivores through `anatomy.startingBody.groups`. Config only: no seed's base body or draw moves, the default group is still the hunter. Tests with negatives: both mouths work and are a plant mouth and a jaw; the hunter is not an omnivore; a group starts exactly `round(20 x share)` founders (2, 4, 5, 8) with the two-mouth body and the rest keep the base body; a group draws nothing (founder positions, headings and brain weights equal with and without it); unknown names and shares above a half are config errors; stepped equals chunked.

## Measured

16 seeds x 30,000 ticks, no extinct world in any omnivore arm:

| start                       | mean pop | lowest | starved    | omnivore lineage alive at 30k | omnivores in the population |
| --------------------------- | -------- | ------ | ---------- | ----------------------------- | --------------------------- |
| default: 2 jaw-only hunters | 51       | n/a    | 62 percent | 6/16                          | about 3 percent             |
| mandible, 2 of 20           | 54       | 17     | 62 percent | 7/16                          | about 7 percent             |
| mandible, 4                 | 55       | 18     | 61 percent | 5/16                          | about 10 percent            |
| mandible, 5 (1:3)           | 53       | 15     | 59 percent | 8/16                          | about 8 percent             |
| mandible, 8                 | 50       | 12     | 53 percent | 10/16                         | about 16 percent            |
| sprout, 5                   | 50       | 15     | 57 percent | 6/16                          | about 11 percent            |
| sprout, 8                   | 45       | **5**  | 49 percent | 10/16                         | about 20 percent            |

**The crash is gone** (8 omnivore founders: 0 of 16 worlds extinct and a mean of 50, against 1 of 8 extinct for 8 jaw-only hunters and every world for 10), and omnivores breed and live better than plant-only from the start (1.4 to 1.5 matings per 1,000 creature-ticks against 1.2; 209 to 224 s against about 180). **Mandible beats sprout** as the plant mouth at the same share.

**But it does not hold at 100,000 ticks** (8 seeds, including 3246115366):

| start               | extinct | mean pop       | omnivore lineage alive | plant-only gone (world all omnivores) |
| ------------------- | ------- | -------------- | ---------------------- | ------------------------------------- |
| default: 2 jaw-only | 0       | 55             | **5/8**                | 1                                     |
| mandible, 5 (1:3)   | 0       | 53 (lowest 15) | 3/8                    | 2                                     |
| mandible, 8         | **1**   | 47 (lowest 0)  | 3/8                    | 4                                     |

Omnivore births triple (3,109 at 5 founders, 4,160 at 8, against 1,173), and in the worlds where they win they win outright (seeds 1 and 2 at 5 founders end with 0 plant-only creatures and 30 to 37 omnivores), but in the other worlds the lineage dies out between 10,000 and 100,000 ticks: omnivores were alive at 10,000 ticks in 6 of 8 and 7 of 8 worlds and are alive at 100,000 in 3. At 8 founders four worlds lose their plant-only lineage and one goes extinct. Predation is 49 percent of omnivore deaths at 100,000 ticks (38 percent in the default); the owner said cannibalism is fine, so it is reported and not treated as a defect.

## Decision

**The default group stays the jaw-only hunter.** The bar for flipping it (an omnivore lineage alive at 100,000 ticks in at least 6 of 8 worlds, no extinct world, population in band) was missed: 3 of 8 at both shares, against 5 of 8 now (8 worlds is a small sample, and the difference is within its noise, but it is not an improvement), and 8 founders cost a world. The two starters ship so the group can be named, and the probe and these numbers are the record.

## What it says

More omnivores at the start does not make omnivory more persistent: it makes it **bimodal** (take over a world, or vanish) and the cause of the vanishing is not part cost, the hunt instinct or the jaw (omnivores out-breed and out-live both specialists and eat meat). The cheap lever, supply, is exhausted; the remaining limit is something that shifts a world's balance over tens of thousands of ticks (energy economy and the fraction of the food that is plants). The next candidates are the owner's food and mouth ideas (a scavenger mouth that takes carrion only, seeds as a food) or a creature part that makes its own energy; each would be its own plan.
