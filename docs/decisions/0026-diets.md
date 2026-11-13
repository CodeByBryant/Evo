# ADR 0026: Diets, what a mouth can eat, three fixes and what hard diets did

Status: accepted. Follows [ADR 0017](0017-feeding.md) (mouth forms and the yield matrix), [ADR 0023](0023-predation.md) (carcasses, the jaw) and [ADR 0025](0025-place-memory.md) (the third null result in a row).

## The owner's observation

After three measured null results on carnivory, the owner pointed at two causes: **predators have only one food source**, and **herbivore mouths do not really matter, they can eat any food regardless: grazers and fungus-scrapers can eat carcasses.** Both are true, and measured (`tests/probe/diet.probe.ts`, default world, 4 seeds x 20,000 ticks, energy taken in credited to the eater's mouth form):

| eater           | grass | fruit | fungus | nectar | carrion | flesh |
| --------------- | ----- | ----- | ------ | ------ | ------- | ----- |
| sprout (grazer) | 173k  | 65k   | 36k    | 47k    | 3.5k    | 0     |
| proboscis       | 50k   | 42k   | 31k    | 44k    | 2.6k    | 0     |
| mandible        | 75k   | 30k   | 41k    | 27k    | 20k     | 0     |
| radula          | 2.2k  | 1.4k  | 2.2k   | 1.8k   | 0.5k    | 0     |
| jaw             | 0     | 0     | 0      | 0      | 1.5k    | 2.8k  |

**Jaws got 5 percent of the carrion** (mandibles 71, sprouts 12, proboscis 9, radula 2). A sprout took about a fifth of its intake from fungus and nectar, and a proboscis ate as much grass as fruit. The cause is the specification, not a bug in the code: a form is a 0.5 to 1.5 times multiplier on the yield (`anatomy.mouthForms`), and only an exact 0 stops a mouth eating (the per-mouth gate and the perception filter of ADR 0023 step three). Carcasses were given every form a positive yield (`predation.carcass.yields`: sprout 0.1, proboscis 0.2, mandible 0.8, radula 0.6, jaw 1.2). Jaws that did exist ate as well as anyone (0.146 intake per creature-tick against 0.147 for sprouts).

## Three fixes, kept

Found while planning hard diets; each stands on its own.

1. **A bite takes in the yield of the mouth that bites**, not the power-weighted blend over every mouth of the body (`InteractionSystem`): a sprout beside a jaw took the sprout's grass at half its yield. A body with one mouth keeps the exact value it had (the blend of one mouth is its own yield, but the old path is kept so float rounding cannot move a hash).
2. **A sniffer's selectivity is spread over the food kinds a world grows**, not over the carcass kind that predation appends last. `sniffedKind = floor(selectivity x kindCount)` counted carrion, so the nectar sipper's selectivity (0.875: nectar with four kinds) landed on **carrion** with five. In every default world its nose was tuned to carcasses.
3. **Validation.** `predation.carcass.yields` may be 0 (a form that cannot digest meat; it demanded strictly positive), and with food kinds on every form must list a yield for every kind (an unlisted kind was edible by everyone at 1, which a hard diet turns into a trap).

**Goldens:** 18 of the 52 entries move, all evolving-body worlds (the intake fix moves 16, the sniffer fix 2; evolved bodies often grow a second mouth). With both fixes reverted all 52 reproduce, so the rest of the commit is behaviour-inert.

## Hard diets, measured, not kept

The change the owner pointed at: a form eats only the kinds it is built for (yield exactly 0 elsewhere), carcasses only for the jaw. 16 seeds x 30,000 ticks, the default world (a start drawn from the seed), `longrun.probe.ts`:

| variant                                                                                              | extinct     | mean population (lowest) | worlds with a jaw at the end | 2+ mouth forms | carrion share of intake |
| ---------------------------------------------------------------------------------------------------- | ----------- | ------------------------ | ---------------------------- | -------------- | ----------------------- |
| today (soft)                                                                                         | 0 of 16     | 56.8 (34)                | 0 of 16                      | 10 of 16       | 5.3%                    |
| **carrion for the jaw only**, plants soft                                                            | 0 of 16     | 50.3 (10)                | 1 of 16                      | 13 of 16       | 0.7%                    |
| hard plant diets with low-yield fallbacks                                                            | 1 of 16     | 51.2 (16)                | 1 of 15                      | 7 of 15        | 0.0%                    |
| hard plant diets, boosted specialist yields                                                          | **7 of 16** | 46.8 (0)                 | 0 of 9                       | 4 of 9         | 0.0%                    |
| first cut of hard diets (sprout grass and fruit, proboscis nectar and fruit, radula fungus), 8 seeds | **3 of 8**  | n/a                      | 0 of 5                       | 3 of 8         | 0.0%                    |

- **Hard plant diets starve their own starts**: the three extinct worlds of the first cut were the specialist starts (proboscis, radula, radula); the radula lives on a toxic, hard food that is 23 percent of the energy and absent from meadow and desert.
- **Exclusive carrion does not feed the jaw**, because there are almost no jaws: the carrion share of intake fell from 5.3 percent to 0.7 percent, the carcasses rot, and the population lost about 11 percent (the energy the herbivores had been eating).
- **100,000 ticks, carrion for the jaw only, the owner's seed and 1 to 7:** no extinct world; a jaw alive at the end in **2 of 8** (1 of 8 before); in one world (seed 5) the jaws took over, **21 of 29 creatures**, 186 predation deaths in the last window; on the owner's seed 224 predation deaths in the last window with one jaw left. Two or more mouth forms alive in 3 of 8 worlds, as before.

The criteria stated before the runs (jaw alive in at least 4 of 8 at 100,000 ticks, never above 40 percent of a population, two forms alive in at least 70 percent of worlds, no extinct world) were **missed by every variant**, so no diet table is shipped.

## What this says

- **Exclusivity is the wrong lever on its own.** The energy a carnivore can get is bounded by how much dies and by how fast it is found: the carrion flux is about 3.5 energy a second across the world (the intake seen over 4 seeds x 20,000 ticks), which feeds about four creatures at 0.9 a second each even if every carcass were eaten. Giving it all to jaws leaves a niche of about four animals that has to be found by a few jaws spread over a 700 by 700 world.
- **Hard plant diets cost more than they give**: they shrink every specialist's food supply to a fraction of the map, and the generalist mandible (1 on everything, forced by the validation rule that keeps the founder neutral) is the safe choice for evolution. Specialisation needs the foods to be dense enough in each lineage's region, which the Voronoi regions and sparse kinds do not give.
- **The jaw's problem is a second, richer, findable food source**, as the owner said: eggs and nests (stationary, concentrated, renewable) are the next project, not a diet table.

## Decision

Keep the three fixes. Do not change the diet table. Carcasses stay edible by every form with their present yields until the owner decides whether the realism of jaw-only carrion is worth a population about 11 percent lower and a predator boom in some worlds (a one-line config change: `predation.carcass.yields` to 0 for the four non-jaw forms, measured above).

## Limits

8 to 16 seeds, 30,000 and 100,000 ticks, one world. The variants are a handful of points in a large table of yields and I did not search it; a table with each specialist's niche widened to two or three kinds might do better, and "hard" then becomes a matter of degree. The `starts.probe.ts` bug (it overwrote the override's anatomy section, so its first hard-diet run was not hard) was found and fixed; the numbers above are from `longrun.probe.ts`, which applies the override whole. A second mouth doubles the body's bite size (it sums over mouths) even when the second mouth is a jaw that takes nothing from a plant: noticed, not changed here.
