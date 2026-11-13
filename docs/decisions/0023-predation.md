# ADR 0023: Predation, in two steps: the mechanism now, the senses next

Status: accepted (steps one, two and three). Follows [ADR 0017](0017-feeding.md) (bites, mouth forms, "the jaw is a dead end until predation exists"), [ADR 0019](0019-line-of-sight.md) (line of sight), [ADR 0022](0022-obstacles.md) (obstacles, whose measurements named predation as the next lever on part variety).

## The problem

Obstacles did not move part variety at any strength (ADR 0022), and the food overhaul before them did not either. Nothing in the world rewards a body for being good at anything but finding plants. The pieces for something that does were already there: a bite geometry (mouth anchor, reach, cone, cooldown, gut), a jaw mouth form drawn since ADR 0017 and declared a dead end, armor and `damageTaken`, health and death plumbing, the peer sense, cover from obstacles.

## Decision (step one: the mechanism, switched off)

Owner decisions (2026-11-12): the first hunters are **emergent only** (no seeded predators); the work is **two PRs**; a dead body **leaves a carcass**.

1. **Who bites creatures.** `predation.fleshYield` gives each mouth form a yield from a creature: **only the jaw is above zero** (1), the founder's mandible and every other form is 0, so every body that exists today behaves exactly as before. A mouth that can bite creatures takes the **nearer** of the best food and the best creature in its cone (food wins a tie).
2. **What can be bitten.** A creature that is not itself, not a parent or child (kin are never prey; no species rule, because a species label drifts and would couple behaviour to a post hoc name), alive, no bigger than `maxPreyRatio` (1.5) times the biter's body radius (so the mouth's gape, bite size and size-for-size decide who eats whom), within the mouth's reach, inside the bite cone, and **not behind an obstacle that blocks movement** (the ADR 0022 field; reeds do not stop a bite).
3. **What a bite does.** The victim loses **energy**, at most what it has and what the biter's gut can hold: `min(energy, biteEnergy x gape factor)`. The biter's gut gains that times `trophicYield` (0.6) times the mouth's flesh yield, so **energy moves and is lost on the way, never created**: a drained or tiny victim is poor prey. The victim also takes **health damage** `biteDamage x gape factor x its own damageTaken`, so armor finally matters for something other than hazards. One bite a tick per mouth, the same cooldown and chewing slow-down as for food. An `organism-bitten` event carries both creatures, the damage, the energy taken and the intake.
4. **Death by predation.** `DeathCause` gains `'predation'`: a creature that was bitten within `attackWindow` (3 s) and then starved or was worn down is counted as killed by the bite, not by hunger or the weather (a victim drained to zero energy would otherwise be reported as starved). `organism-died` and the history record carry the killer. Old age stays old age. The bookkeeping (`lastBitten`) only labels deaths, never feeds back into the dynamics, and is **not hashed**.
5. **Carcasses.** With predation on, the world's configuration (`world/predationConfig.ts`, like the cluster scaling) appends a `carrion` food kind that never spawns by itself and gives every mouth form a carrion yield (jaw 1.2, mandible 0.8, radula 0.6, proboscis 0.2, sprout 0.1). Every death, from any cause, leaves one carcass where the creature died, worth `energyFraction` (0.6) of its energy and what was in its gut, if that is at least 5, while fewer than 40 are on the field; carcasses rot after 120 s. Ids come from the shared allocator in death order and nothing is drawn, so a run is the same however it is sliced. A carcass is an ordinary bitable food item, so scavengers need no new mechanism. With predation off, carcasses off or food kinds off, the very same configuration object is used, so those worlds are exactly what they were.
6. **Reward.** A predator's intake from a bite counts as a meal in its feeding reward; the prey already learn from `organism-damaged`.
7. **Drawn.** A ring effect where a bite lands, carrion as a dull red food dot, and a **Predation** row in the death-causes strip, shown only in a world where something has been killed by a bite.
8. **Constraints.** Predation needs `feeding.enabled` and `ecology.health.enabled` (validated: a bite is damage and eating is biting). It is **off by default** and pinned off for `classic` and `clusters`; the field layout is where it will be turned on.

## What this step deliberately does not do

- **No new brain input.** Today a creature sees a peer's bearing and distance and nothing more: it cannot tell prey from a predator, so it cannot hunt on purpose or flee on purpose. The senses (a prey group and a threat group, the innate hunt and flee instincts, one schema bump that also moves the hashed metric counters) are step two. Until then a jaw bites what its always-on `interact` bias and its cone happen to put in front of it.
- **No hash change.** `deathsByPredation` and `predationBites` are in the metrics snapshot but not in the state hash, so schema 11 stands and all 46 golden entries reproduce unchanged with predation off. Step two adds them to the hash in its one bump.
- **No new offensive parts** (spike, claw, venom) and no "killed by" display in the inspector (the killer is in the event and the history record).

## Measured (`tests/probe/predation.probe.ts`)

Default world, 8 seeds x 30,000 ticks, predation off against on (a creature _has a jaw_ if it has a working mouth whose form is the jaw):

| setup                     | extinct | mean pop | lowest | starved | predation share of deaths | bites per world | kills per world | jaws alive (mean) | seeds where a jaw ever lived | carcasses left per world | carcass bites per world | part types / lists | ticks/s |
| ------------------------- | ------- | -------- | ------ | ------- | ------------------------- | --------------- | --------------- | ----------------- | ---------------------------- | ------------------------ | ----------------------- | ------------------ | ------- |
| off (control)             | 0       | 58.9     | 26     | 55%     | 0                         | 0               | 0               | 0.55              | 4 of 8                       | 0                        | 0                       | 12.1 / 30.3        | 816     |
| **on** (emergent hunters) | 0       | 62.0     | 30     | 57%     | 0.2%                      | 10              | 2               | 0.14              | 5 of 8                       | 364                      | 2,740                   | 11.8 / 26.4        | 750     |

And the mechanism on its own, **every creature a hunter** (the grazer body with a jaw, forced as the only start), 8 seeds x 10,000 ticks:

| setup                    | extinct | mean pop | lowest | starved | predation share of deaths | bites per world | kills per world |
| ------------------------ | ------- | -------- | ------ | ------- | ------------------------- | --------------- | --------------- |
| hunters, with carcasses  | 0       | 23.5     | 4      | 26%     | 28.6%                     | 463             | 30              |
| hunters, without carcass | **1**   | 19.6     | 0      | 30%     | 28.6%                     | 379             | 26              |

## Findings, stated plainly

- **Carnivory does not arise by itself.** With emergent-only hunters a world sees about 10 bites on creatures and 2 kills in 30,000 ticks (0.2 percent of deaths); jaws appear by mutation in 5 of 8 worlds, as they do with predation off, but they are rare and do not persist. The mechanism is not what is missing: a world of hunters bites 463 times and loses 29 percent of its deaths to predation. What is missing is a reason for a jaw lineage to win in a world of grazers, and, above all, the means for it to hunt on purpose (step two's senses). The plan's honest branch applies: if the senses do not change this, the choice of **seeding a hunter minority** comes back to the owner with these numbers.
- **The carcass channel is real and is not predation.** With predation on, about 364 carcasses a world are left and 2,740 bites are taken out of them (by mandibles, mostly: the founder eats carrion at 0.8): a scavenging economy that recycles 60 percent of the dead's energy and moves the default world's mean population from 58.9 to 62.0 and the lowest from 26 to 30. It is a separate lever, with its own switch (`predation.carcass.enabled`), and step two tunes it.
- **Part variety did not move** (types 12.1 to 11.8, lists 30.3 to 26.4, inside the noise at 8 seeds), as expected: almost no predation happens.
- **Carcasses carry a hunters-only world.** The same all-hunter worlds without carcasses lose 1 of 8 to extinction and run at 19.6 instead of 23.5.
- **A cost.** The default world ran at about 750 ticks a second against 816 with predation off (both measured with a per-tick event scan in the probe): mostly the carrion kind and the carcass pass.

## Verification

- **Switch-off proof.** All 46 golden entries reproduce their pinned hashes with predation off (the default); the metrics fields are not hashed; a world with predation on but carcasses off and no jaw alive is, over 400 ticks, the same state hash as the world without it.
- **Tests with negatives:** the bite (energy moves at the trophic loss, damage and attacker recorded; a mandible never bites a creature; behind or out of reach, too big, kin, already dead, behind a rock but not behind reeds, an empty victim, a full gut, armor, the cooldown, the nearer of food and a creature); health (bite damage reaches health with the attacker, mixed sources are "both", nothing without bites); death (predation inside the window and with the killer, long ago or without predation stays starvation or damage, old age stays old age, stale bites are pruned, every death reaches the carcass hook after removal); carcasses (the carrion kind and yields only with predation, a mandible eats it well, worth and place, below the minimum, the cap, ids in death order, rotting, no rotting at lifespan zero); whole worlds of hunters (bites, kills, carcasses, validity, every bite loses energy on the way, a kill always has a killer, one go equals chunks equals steps); config (defaults, merging per form and per carcass field, ranges, unknown keys, needs feeding and health, off in every preset).

## Consequences

- Predation exists and is measurable but is off by default; nothing about a normal world changes in this step.
- Step two adds what the mechanism cannot do without: a prey and a threat sense for the brain, hunt and flee instincts, the hashed counters, the default flip and the tuning against the ADR 0018 band.

## Step two: the senses, the hunter group and the flip

Owner decisions (2026-11-12): "fix it so carnivory evolves, do whatever you think would make this happen", then "add a small predator group, in fact add me to multiple founder types at tick 0". Step one measured that making predation pay more does nothing (a jaw creature bites a creature about 4 to 19 times a world however generous the economics): **behaviour and senses were the missing piece**, not the economy.

### What it does

1. **Prey and threat senses** (`OBSERVATION_SIZE` 40 to 48, inputs 40 to 47). The nearest creature this one could bite and the nearest that could bite it, each as present, bearing cosine and sine, proximity. They are found in `PerceptionSystem`'s peer search by the same eyes, cone and cover as any peer (a rock or reeds between the two hide the other; `maxSightChecks` bounds the work), and use **the same rule as the bite** (`organisms/predation.ts`: a body with a jaw, a creature no bigger than `maxPreyRatio` times it, never kin), so what a creature is told it can bite is what it can bite. A hunter that could bite back and is at least as big counts as prey, not as a threat (two hunters of one size meet as hunters). All eight slots are zero without predation.
2. **Instincts.** The innate prior's steering units turn toward prey (weight 3, like a mate) and **away** from a threat (weight 5 on the bearing, stronger than food; a threat dead ahead turns the creature to the left rather than into it), and presence units add thrust for both; the reflex controller flees a threat first and hunts prey that is nearer than food. A body that cannot bite never has prey, so nothing changes for it.
3. **A founder group.** `anatomy.startingBody.groups` gives a share of the founders another starter's body, chosen by an even spread over their order (`round(share x initialCount)` founders, integer arithmetic, **no draw**), so every seed keeps its base body and its streams. A new `hunter` starter (the grazer with a jaw: mouth stat 0.9, the same forward eye) is `pool: false`: it is never drawn as a base body, so adding it shifts no seed's draw. The default group is 20 percent hunters (4 of 20); `reference` mode ignores groups; the interface shows "Plus hunter x4". When the hunter's body differs enough from the base body (a nectar sipper's world) it is also its own species from tick 0, which is what "several founder types" means here.
4. **The jaw as good as the mandible on plants** (1.0 on every plant, was 0.55), so a jaw lineage is not selected out before prey can pay; flesh and carrion (1.2) are its edge. `biteDamage` 15 to 12.
5. **Flip.** `predation.enabled` is on by default and in `balanced`, `lush`, `harsh`, `rapid-evolution`; pinned off for `fixed-bodies` (no body changes, so no jaw), `classic` and `clusters`. A world that turns `feeding` or `ecology.health` off must now turn predation off with it (validation says so).
6. **Hash schema 12.** `deathsByPredation` and `predationBites` join the hash; the brain has 514 weights (was 450), so every founder's `genetics` draws shift and every golden regenerated (44 of 44 in the senses commit). A byte-identical switch-off is therefore impossible; instead the new inputs are zero without predation, the reflex controller is untouched (scenario A moved only through the mutation draws, 29 / 47 / 18 to 28 / 46 / 18), and the hasher's vectors were recomputed with an independent Python hasher that reproduced schema 11 first.

### Measured (`tests/probe/predation.probe.ts`, 30,000 ticks, default world, none extinct in any run)

Tuning, seeds 1 to 16 (a world counts a "jaw at the end" if one creature with a working jaw is alive; **the count is noisy, about 2 either way at 16 worlds**):

| setup                            | mean pop | lowest | starved | predation share | bites   | kills | jaws alive (mean) | jaw alive at end |
| -------------------------------- | -------- | ------ | ------- | --------------- | ------- | ----- | ----------------- | ---------------- |
| predation off (control)          | 58.1     | 17     | 55%     | 0               | 0       | 0     | 0.09              | 2 of 16          |
| on, senses alone, no group       | 60.3     | 26     | 53%     | 1.6%            | 91      | 13    | 1.16              | 3 of 16          |
| 10% group, jaw 0.55              | 56.6     | 25     | 49%     | 4.4%            | 277     | 34    | 2.03              | 7 of 16          |
| 20% group, jaw 0.55              | 53.2     | 10     | 47%     | 6.9%            | 503     | 50    | 4.03              | 7 of 16          |
| 10%, jaw 0.7 / 0.85 / 1.0 / 1.15 | 52 to 58 | 15-21  | 46-48%  | 6.4 to 9.0%     | 577-740 | 50-66 | 4.8 to 5.5        | 6-7 of 16        |
| 20%, jaw 1.0 (biteDamage 15)     | 53.9     | 16     | 38%     | 19.0%           | 1,632   | 146   | 14.2              | 12 of 16         |
| 30%, jaw 1.0                     | 53.6     | 20     | 33%     | 23.2%           | 2,197   | 178   | 19.7              | 11 of 16         |
| 20%, jaw 1.0, biteDamage 10      | 55.2     | 9      | 37%     | 18.0%           | 2,075   | 141   | 15.1              | 13 of 16         |
| 20%, jaw 1.0, biteDamage 7       | 56.1     | 19     | 44%     | 10.5%           | 1,269   | 82    | 8.1               | 7 of 16          |

Held-out seeds 17 to 48 (32 worlds, not used in tuning):

| setup                                     | mean pop | lowest | starved | predation share | bites | kills | jaws alive (mean) | jaw alive at end |
| ----------------------------------------- | -------- | ------ | ------- | --------------- | ----- | ----- | ----------------- | ---------------- |
| predation off (control)                   | 56.4     | 9      | 56%     | 0               | 0     | 0     | 0.36              | 2 of 32          |
| 20%, jaw 1.0, biteDamage 15               | 51.8     | 1      | 38%     | 17.8%           | 1,467 | 130   | 12.5              | 25 of 32         |
| **20%, jaw 1.0, biteDamage 12 (shipped)** | 52.2     | 8      | 39%     | 16.4%           | 1,578 | 121   | 13.0              | 22 of 32         |
| 25%, jaw 1.0, biteDamage 12               | 50.8     | 10     | 35%     | 22.1%           | 2,172 | 161   | 17.5              | 24 of 32         |

### Findings, stated plainly

- **The senses did most of the work on their own.** With no group, bites went from about 10 to 91 a world and kills from 2 to 13 (16 seeds), jaws alive from 0.14 to 1.16, and the world got slightly richer (carcasses). But a jaw lineage is alive at the end in only 3 of 16 worlds: emergent-only carnivory is **not** enough, which is why the owner's group is part of the design.
- **A jaw lineage either dies out or takes over.** At jaw 1.0 and a 10 percent group (seeds 1 to 16), a jaw was alive at the end in 7 worlds: four of them were taken over (20 to 35 jaw creatures among 35 to 83, 1,000 to 3,700 bites) and three held a foothold (2 to 9). In the other 9 the lineage was gone with 14 to 379 bites. The population is not a smooth dial: a few founders drift out, and crossover blends a jaw mouth (stat 0.9) toward the mandible (about 0.5) whenever it breeds with a grazer. The base body matters too: fungus scrapers took over in 3 of 4 worlds, grazers in 1 of 2, scouts held a foothold in 1 of 3, nectar sippers in 2 of 4, and tanks never (3 of 3: armour cuts a bite's damage).
- **Persistence and predation share move together, so two of my stated bands are missed.** The acceptance criteria stated before the work were: a jaw lineage alive in at least 12 of 16 worlds, predation 3 to 15 percent of deaths, starved share 40 to 65 percent, no extinct world, population within 25 percent of the control. The shipped setting meets persistence (22 of 32 is 69 percent against the 75 percent aimed at; 25 of 32 with biteDamage 15), the population (7.5 percent below the control), no extinct world and the jaw's mean count, and **misses predation (16.4 percent) and starved (39 percent) by a little**: when a lineage holds, it spreads. Turning biteDamage down to 7 meets both bands (10.5 and 44 percent) and loses persistence (7 of 16). The lowest population in one 16-seed run was 9 and in one held-out run 1 (one world dipped to a single creature and recovered) against a control lowest of 9, so "lowest at least 15" was not kept for the control either. These are my numbers to be argued with, and the setting is one config key away (`predation.biteDamage`, the group's `share`, `anatomy.mouthForms.jaw`).
- **The jaw is now a free omnivore.** At 1.0 on plants it is the mandible's equal there and better on flesh and carrion, so it is hard to keep a jaw lineage from spreading once it holds. The cost the world imposes is the one it always had: a bite needs prey in reach.
- **Cost.** Ticks per second on the held-out seeds: 777 (control) against 673 to 720 with predation (about 7 to 13 percent slower), the carcass pass and the two peer scans.
- **Variety.** Part types at the end 11.7 (control) against 10.9 to 11.3 and part lists 26.6 against 23 to 25, inside the noise: predation did not raise part variety here either.

### Verification

Unit suites of every package (simulation 1,200 tests among them), the golden suite (52 entries: 44 old plus 6 new `predation-*` entries for the default world), every other determinism file, the tools tests, format, lint and typecheck. **Goldens:** the senses commit regenerated all 44 (schema 12). The flip commit moved 8 entries that evolve bodies because the jaw yield changed; proof: with the old yield pinned (`anatomy.mouthForms.jaw` 0.55) all 8 reproduce their pinned hashes. Every older entry now pins `predation.enabled: false` and no founder group. `long-run-extinction` moved to seed 6 (seed 5 stopped going extinct after the extra founder weights; the scarce world is a knife edge, 7 of 12 seeds go extinct, measured). Tests with negatives: prey and threat for a jaw, a grazer, a founder, kin, size, behind, out of reach, a rock between and a rock off the line, predation off; the rule itself; the prior and the reflex controller hunt and flee; founder groups (even spread, no draw, pool exclusion, every validation error); the counters are in the hash.

## Step three: the jaw eats meat only

Owner, after running the live build for 100,000 ticks (seed 3246115366): "all other mouths died out and predation was dominated. Also predator jaws can eat other food sources which is bad. Jaws should only be able to eat meat (eventually eggs) and attack other agents."

**It reproduced, and it was my doing.** In step two I set the jaw's plant yield to 1.0 (equal to the mandible) so a lineage would survive, and the step-two PR said plainly that the jaw had become "a free omnivore ... hard to keep from spreading". At tick 100,000 of the owner's seed, **35 of 36 creatures were jaws; in the last 10,000 ticks 199 deaths were predation and 86 starvation; 82 percent of the energy that came into creatures was from plants and 12 percent from flesh**. They were not predators. They were grazers with a jaw that also ate each other. The 30,000-tick sweeps of step two could not see it: it only shows late.

### What it does

1. **A mouth yield may be 0** (validation: zero or more; the mandible is still exactly 1), and **the jaw's yield on every plant is 0**. Its food is creatures (`predation.fleshYield.jaw`, 1) and carrion (1.2). An egg food kind later is one more yield.
2. **A mouth bites only what it can digest.** `InteractionSystem` looks up each form's yield per food kind once and rejects food a mouth yields nothing from, so a jaw never touches a plant (without this a bite on a zero-yield plant would destroy it for no energy).
3. **A creature sees only food it can digest.** `PerceptionSystem` skips food kinds a body cannot digest in all four search branches (occluding, directional, omni, ecology-modified), so a jaw does not see plants as food, and the innate prior and the reflex controller stop steering it to them; it hunts by its prey sense and eats carrion. A body that digests everything takes the exact code path it had.
4. **The default hunter group is 10 percent** (was 20), because at 20 percent hunters massacre the prey and starve, and 1 to 3 of 16 worlds went extinct.

### Measured

Strict carnivory is a hard niche here. Seeds 1 to 16, 30,000 ticks (a jaw alive at the end):

| setup (jaw plant yield 0)                                     | extinct | mean pop    | lowest | starved | predation share | bites  | jaw alive at end |
| ------------------------------------------------------------- | ------- | ----------- | ------ | ------- | --------------- | ------ | ---------------- |
| predation off (control)                                       | 0       | 56.8        | 17     | 55%     | 0               | 0      | 2 of 16          |
| group 20%                                                     | **1**   | 50.2        | 0      | 52%     | 2.5%            | 159    | 1 of 16          |
| group 10% (**shipped**)                                       | 0       | 58.1        | 15     | 51%     | 1.7%            | 119    | 4 of 16          |
| group 5%                                                      | 0       | 58.2        | 19     | 53%     | 1.8%            | 135    | 3 of 16          |
| 10%, meat yield 2 / 3, biteEnergy 24 (the "economics" levers) | 0       | 56 to 61    | 15-25  | 51-53%  | 1.5 to 1.9%     | 92-184 | 5 to 6 of 16     |
| 10%, hunter with long strong tails (and a narrow far eye)     | 0       | 55.6        | 9      | 53%     | 2.2%            | 124    | 5 of 16          |
| 20%, same body                                                | 1 and 3 | 53.3 / 44.3 | 0      | 51-53%  | 1.9-2.0%        | 98-122 | 5 and 2 of 16    |

**100,000 ticks, 8 seeds (the owner's and 1 to 7), group 10%, shipped:** no world extinct; a jaw alive at the end in **1 of 8** (3 of 60 creatures); jaws are 0 to 5 percent of any population (was 97 percent); predation is almost absent in 7 of 8 worlds (0 to 16 deaths in the last 10,000 ticks); the energy that comes in is 92 to 99 percent plants. The strongest meat settings tried (meat yield 3; meat yield 2 with double bites) were run for 100,000 ticks too, 8 seeds each: a jaw alive at the end in 1 of 8 in both. **None of the levers moves long-run persistence.**

Why, as far as I can tell: the founding hunters mostly survive the first 3,000 ticks (55 to 85 bites each in the three seeds traced; one that never found prey died at tick 889). What fails is reproduction: over 12,000 ticks a world sees 0 to 15 births with a jaw parent (7 with both parents jaws in the best), about half or more of those children are jaws, so a lineage of two to four founders is at about replacement level and drifts out. It is not starvation and it is not the energy per bite.

### What this leaves, and the choices

- **The monoculture complaint is solved for jaws and not for mouths.** On the owner's seed all 71 creatures at 100,000 ticks carry a sprout (no jaw anywhere). Mouth forms compete like any trait: one form often wins a world (2 or more forms alive at 100,000 ticks in 5 of 8 worlds). That is ordinary competitive exclusion and a separate question; the evolution observatory (branch `feature/observatory`) measures it.
- **Carnivory is now rare.** To make it hold, the options are, with my recommendation first: (a) a **hunter lineage that breeds true** (the jaw is a mouth stat of 0.8 or more that crossover blends toward the mandible; choosing a parent's value for the mouth form, or mating within the hunter group, would keep a lineage whole): a genetics change that moves every evolving golden; (b) a **bigger hunter founding group with its own start energy**, which needs a group knob I did not add and risks the massacre seen at 20 percent; (c) accept carnivory as a rare niche that appears in about one world in eight. I did not pick one: the owner asked for meat-only jaws, which is done and proved.

### Verification

Tests with negatives (`carnivore.test.ts`): a jaw next to a plant leaves it untouched and its gut empty, and bites carrion; a mandible still bites the same plant; a jaw does not see a plant (directional and occluding search) but sees carrion, a mandible sees both; hunters take 0 plant energy over 4,000 ticks, and with the old yield of 1 they did (so the test can fail); config accepts a 0 yield for the jaw and rejects it for the mandible. **Goldens:** with the old jaw yield (1.0) and the old 20 percent group pinned, all 50 entries reproduce their hashes (the gates are inert for positive yields); the 14 entries that contain jaw bodies (8 that evolve bodies, 6 `predation-*`) were regenerated. **Re-pinned with a measurement:** the harsh-winter test claimed that births fall in winter; it failed for 5 of 6 seeds before this change (with the winter `reproductionScale` at 0.3 against 1, winter births were 129, 140, 159 and 115 against 113, 125, 119 and 91, not lower, because a lean winter is followed by births from the autumn surplus), so it now asserts the food supply, which is deterministic (winter 874 spawns, summer 1,505).

## Step four: a mouth that breeds true, tried and not kept

Step three left carnivory rare (a jaw lineage alive at 100,000 ticks in 1 of 8 worlds) and recommended making the hunter lineage breed true. This step built that and measured it. **It changed nothing, so it was not kept.**

**The cause was real.** Crossover blends every float gene (BLX-alpha 0.25), and the mouth form is `floor(stat s2 x 5)` with the jaw at 0.8 or more. A jaw parent (0.9) with a grazer (0.1) gives a child stat spread over about [-0.1, 1.1], of which about 25 percent stay a jaw; with a mandible mate (0.5) about 33 percent. Mate choice ignores form (the nearest ready creature in `searchRadius`), so with a 10 percent hunter group a jaw's partner is a jaw about one time in ten.

**The fix tried:** a body slot holding a mouth in either parent was inherited whole (all 14 genes) from one parent, chosen by the slot's first crossover draw. Every gene still consumed its one draw, so no stream shifted and no hash schema changed; with the switch off all 52 golden entries reproduced. A jaw bred with a non-jaw then kept the jaw about half the time instead of a quarter to a third.

**Measured** (100,000 ticks, the owner's seed 3246115366 and seeds 1 to 7, shipped config, switch off against on):

|                             | extinct | jaw alive at the end | jaws alive at the end | most jaws in any 10,000-tick sample |
| --------------------------- | ------- | -------------------- | --------------------- | ----------------------------------- |
| linked mouths off (control) | 0       | 1 of 8 (seed 5)      | 3                     | 3                                   |
| linked mouths on            | 0       | 1 of 8 (seed 7)      | 2                     | 5                                   |

Flesh stayed 0 to 12 percent of the energy taken in, plants about 93 percent. One world (seed 2) ended at 14 creatures with the switch on against 100 with it off, after a window with 97 predation deaths and no jaw left alive at the end: a boom and bust of the hunters, or just two chaotic worlds drifting apart; one seed does not say which.

**Reading it.** Inheritance was not the bottleneck. A strict carnivore lives on the flesh and carrion that exist only when something dies, in a world that makes nearly all its energy as plants; adding the mouth's inheritance does not add energy. This is my leading explanation, not an isolated cause: what was ruled out is, in order, the jaw eating plants (step three), the meat yield, the bite energy, the group share and starting body (step three table), and now how the mouth is inherited.

**Decision.** The mechanism was reverted (it is commit `9a7eab5` in the history of the branch `feature/true-breeding-mouth` if it is ever wanted again). Carnivory stays a rare niche rather than being tuned further. What would change it is not another knob on the jaw but where meat comes from and how a hunter finds it: a stationary, concentrated, renewable animal food (eggs, which the step-three note called "eventually eggs"), and brains that can remember where prey and nests were (place memory). Both are the next projects, judged with the observatory (ADR 0024): plans that took hold, response diversity, brain drift and the intake shares.

Assortative mating (preferring a partner with the same mouth form) was the next lever in the plan and was **not** built: a jaw lineage that cannot feed itself is not helped by finding mates more reliably.
