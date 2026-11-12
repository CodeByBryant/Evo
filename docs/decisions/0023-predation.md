# ADR 0023: Predation, in two steps: the mechanism now, the senses next

Status: accepted (step one). Follows [ADR 0017](0017-feeding.md) (bites, mouth forms, "the jaw is a dead end until predation exists"), [ADR 0019](0019-line-of-sight.md) (line of sight), [ADR 0022](0022-obstacles.md) (obstacles, whose measurements named predation as the next lever on part variety).

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
