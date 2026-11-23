# ADR 0031: A scavenger mouth (carrion only) exists, and is off

Status: accepted. Follows [ADR 0026](0026-diets.md) (meat is the jaw's alone), [ADR 0028](0028-omnivore-founders.md) (omnivores win, jaw-only hunters die out) and [ADR 0030](0030-limb-efficiency.md). Config only, no hash schema change. **The default world does not change**: `anatomy.scavenger.enabled` is `false`, every golden entry (58 of 58) reproduces its pinned hash, and the numbers below say why it stays off.

## Why

A trophic web has a scavenger: a body that lives off what others leave. Today carrion is eaten by the jaw, which also hunts (ADR 0026: carcasses are the jaw's alone, 1.2), and a jaw lineage is alive at 100,000 ticks in about half the worlds at best. The question was whether a specialist that eats carrion and nothing else, and digests it better, can live. Not assumed, measured, as with every diet step.

## The mechanism (shipped, off)

A **sixth mouth form, `scavenger`**, appended to `MOUTH_FORMS` so every older index is unchanged. The form is `floor(gene x 5)` over five bands, and a sixth uniform band would move every boundary (the founder 0.5 would become a radula), so the scavenger takes a **narrow band at the top of the jaw's**: with `anatomy.scavenger.enabled`, a mouth stat at or above `anatomy.scavenger.from` (0.95) is a scavenger and the other five bands read exactly as before (a jaw stays 0.8 to 0.95, the hunter and omnivore starters' 0.9 stay jaws). With it off (the default) a gene of 0.97 is a jaw, as it always was.

It yields exactly **0 on every plant and on flesh** (so it neither bites nor sees a plant, a creature or an egg: the per-mouth yield gate and the perception filter of ADR 0023 do the rest, no new mechanism) and **1.6 on carrion** (the jaw's is 1.2). A flat scooping glyph at form index 5, a group-only `scavenger` starter (the grazer with its mouth at 0.98) and a `scav` class in the omnivore probe.

## Measured

Control: the default world (hunter group of 2 in 20, no scavengers, switch off). Arms: the same plus a **scavenger founder group** of 2, 4 and 8 of 20, 16 seeds x 30,000 ticks:

| arm (of 20 founders) | extinct worlds | mean population | lowest | scavenger lineage alive at 30,000 | scavenger births (16 worlds) |
| -------------------- | -------------- | --------------- | ------ | --------------------------------- | ---------------------------- |
| control              | 0              | 51.7            | 16     | n/a                               | n/a                          |
| 2 scavengers         | 0              | 50.1            | 12     | **0 of 16**                       | 8                            |
| 4 scavengers         | 1              | 47.8            | 0      | **0 of 16**                       | 12                           |
| 8 scavengers         | 4              | 36.4            | 0      | **0 of 16**                       | 0                            |

The founders are gone within the first 2,500 ticks: a world starts with no carcasses at all (nothing has died), a scavenger has no other food, and what it starts with runs out first. Eight of twenty founders as non-eaters of plants costs four worlds. At 2 founders the world is not harmed (a thin lowest of 12) and the lineage still does not survive.

**Is it the carrion supply?** A ceiling arm that turns every lever the plan named to its limit at once (2 scavengers among 20 founders, 8 seeds x 30,000 ticks): carcass `energyFraction` 1.0 (a carcass keeps all the body's energy, 0.6 now), `minEnergy` 1, `lifespan` 400 s (120), `maxCount` 150 (40), scavenger yield 3.0 (1.6). With the hunter group: **0 of 8 worlds** keep a scavenger (4 births in all) and the extra carrion makes the jaw boom (93 and 188 births in two worlds) and 2 of 8 worlds go extinct. Without the hunter group: 0 of 8, 0 births, no extinct world. If the ceiling does not work no single lever below it can, so the levers were not swept one at a time.

**Does it arise by itself?** `scavenger.enabled` in the default world, no group, 8 seeds x 100,000 ticks: **5 scavenger births in all, 0 of 8 worlds with one alive at 100,000 ticks**, 1 extinct world (seed 5; the default world's baseline is 0 of 8 at 100,000 ticks, so this is reported as a possible cost of a band that starves any jaw-lineage gene that drifts into it, not as established), mean population 49.2, lowest 0.

**Why it cannot live (the arithmetic behind the table).** Carrion is what dying bodies leave, and plants are 94 percent of the world's energy: 60 to 68 percent of deaths are starvation, which leaves an empty body. At the default supply the carcass intake of the whole jaw lineage is about 4 energy a second against about 45 a second that one population of 50 needs, so a carrion-only mouth can feed a handful of creatures with no margin to breed. Raising the supply makes jaws eat it first and boom. It is a thin niche by construction, not by tuning.

## The bar, against the numbers

Stated before the numbers: a scavenger lineage alive at 100,000 ticks in at least 4 of 8 worlds, no extinct world, mean population 35 to 70 with the lowest at least 10, jaw and omnivore lineages no fewer worlds than baseline. Result: **0 of 8** (from founders, from the ceiling arm and from emergence), extinct worlds at 4 and 8 founders, so **not met; nothing flipped**. By the earlier ADRs' rule the mechanism ships off and the numbers are the record.

## What this leaves

- The switch is one line (`anatomy.scavenger.enabled: true`), tested end to end (band edges, yields, no bites on plants or creatures, perception, founder group, validation, chunk invariance), and every golden is unchanged with it off.
- The probes that classify mouths by form (`diet`, `longrun`, `predation`, `life`, `mouth-limb`) call `mouthFormOf` without the band, so with the switch on they would count a scavenger as a jaw; `omnivore.probe.ts` reads the world's own forms and has the `scav` class. Fix them if the switch is ever used.
- **What could make the niche viable** is a bigger and steadier carrion supply that jaws do not take first: a second meat source that is not a hunt (eggs unguarded, a scavenger-only food kind such as dung or shed matter), a decomposer feeding loop, or founders that start next to a food source of their own kind. Those are different designs, not a larger number; each needs its own plan.
