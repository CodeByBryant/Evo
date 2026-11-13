# ADR 0025: Place memory and brain capacity, tried and not kept

Status: accepted as a negative result. Follows [ADR 0024](0024-evolution-observatory.md) (the observatory that made these measurements possible) and [ADR 0023](0023-predation.md) step four (a mouth that breeds true, also a null result).

## The question

Carnivory stays rare, brains drift only about 4 percent from the hand-wired prior in 30,000 ticks, and the owner's reading was that brains need to be smarter and the world more complex (eggs). This step tested the brain half in two ways, with the claims stated before the runs: **(1) capacity alone does not matter**, and **(2) information does: a creature that remembers where it last fed forages better in the patchy renewable world.**

## What the brain is (read from the code, `origin/main` at 35a371d)

One hidden layer of 8 with a 4-slot recurrent memory, 48 inputs, 5 outputs, 514 weights. Only the actor output layer and the value head (54 weights) are learned in a life; everything else is evolved. **The recurrent memory slots are inert**: founders' memory blocks are zero plus 0.03 noise, the innate prior wires nothing through them, nothing rewards them, and they cannot be learned in a life, so only mutation could ever give them a job. **There is no memory of place anywhere**: every target (food, mate, prey, threat, home) is a fresh nearest-sighting input, and the only place-keyed record is an 8 x 8 visited grid that feeds the novelty reward and is never observed. **Brain size costs nothing metabolically** (only the `learningRate` gene is charged), so evolution has no pressure for or against capacity.

## Capacity: it does not matter here

Config only (`genetics.brain.hiddenSize`, `.memorySize`), 8 seeds x 30,000 ticks, the default world, observatory read-out:

| brain                        | population | new plans (1st / 2nd half) | plans that took hold | response types (1st / 2nd) | brain drift (end) | plant intake share |
| ---------------------------- | ---------- | -------------------------- | -------------------- | -------------------------- | ----------------- | ------------------ |
| hidden 8, memory 4 (default) | 61.4       | 69.5 / 90.8                | 69.0                 | 5.9 / 11.3                 | 0.043             | 0.94               |
| hidden 16, memory 4          | 62.9       | 60.0 / 78.9                | 61.6                 | 5.6 / 13.9                 | 0.059             | 0.95               |
| hidden 32, memory 4          | 62.1       | 69.1 / 91.4                | 71.9                 | 5.9 / 11.3                 | 0.082             | 0.94               |
| hidden 8, memory 8           | 63.2       | 72.3 / 95.1                | 69.0                 | 5.8 / 12.6                 | 0.046             | 0.95               |

None extinct, and nothing moves beyond the noise of 8 seeds. (The drift column grows with width only because the prior wires five units and the rest start at zero, so more units dilute the same wiring; the per-group input weights shrink for the same reason, not because behaviour changed.) Bigger brains are not the lever.

## Place memory: built, proven sound, measured, no gain

**The mechanism** (commit `a741b65` in this branch's history, reverted in `cee617f`): a tenth input group, `recall` (observation 48 to 52, weights 514 to 546, hash schema 13): the world position of the creature's last bite of real food (never a carcass), as freshness, body-frame bearing and proximity, fading over 200 seconds, forgotten when the creature stood at the site 3 seconds without a bite, one site per creature. The innate prior steered gently toward it (steering weight 1 against 5 for food and 3 for a mate) and kept the creature moving, only when nothing else pulled it. The observatory got a `recall` input group and two recall situations in the response battery.

**It was sound:** 12 new tests with negatives (a bite with no intake or of carrion never records; a miss does not replace the site; it expires and clears on arrival without food; off, the inputs stay zero and the state is never touched; the site is hashed; stepped equals chunked) and an **equivalence proof**: with the sense off, founder brains equal to the prior, mutation and learned inheritance frozen, eight scenarios (field, noise food, instant eating, no ecology, no predation, lush, the reflex controller, one cluster) gave snapshots, events and records identical to the previous commit through births; a multi-cluster layout differed only through the shifted `genetics` stream (founders of different species differ, so the blend of their children depends on the draws), and a one-cluster layout was identical. The independent Python hasher reproduced the version 12 vectors and gave the version 13 ones. All 50 golden entries regenerated.

**The measurement** (8 seeds x 30,000 ticks unless stated; the control zeroes the four inputs and keeps the 546-weight brain, so it isolates information from capacity):

| arm                                               | extinct | population (mean, lowest) | starved share of deaths | intake per creature-minute | births per creature-minute |
| ------------------------------------------------- | ------- | ------------------------- | ----------------------- | -------------------------- | -------------------------- |
| **control**, inputs zeroed (seeds 1 to 8)         | 0       | 58.5, 12                  | 0.55                    | 84.7                       | 0.306                      |
| recall with the full prior wiring                 | 0       | 50.4, 3                   | 0.55                    | 88.2                       | 0.312                      |
| recall, steering wiring only (no forced thrust)   | **1**   | 48.1, 0                   | 0.53                    | 88.4                       | 0.314                      |
| recall, **information only**, no wiring           | 0       | 58.1, 13                  | 0.54                    | 84.6                       | 0.302                      |
| **control** (seeds 9 to 16)                       | 0       | 55.9, 15                  | 0.53                    | 91.0                       | 0.298                      |
| recall with the full prior wiring (seeds 9 to 16) | **1**   | 48.1, 0                   | 0.51                    | 92.1                       | 0.303                      |

The observatory read-out (seeds 1 to 8) agrees: control 64.6 creatures, 73.1 / 98.9 new plans, response types 6.7 / 15.7; recall 55.4 creatures, 63.8 / 71.0 new plans, response types 6.4 / 14.9.

The stated criteria were: no extinct world, population not lower, and either the starved share down at least 5 points or intake up at least 10 percent. **All three missed.** Wiring the memory into the instinct makes each creature eat 1 to 4 percent more, costs 13 to 14 percent of the population, and two worlds in sixteen died out (none in the controls). Giving the information with no instinct is indistinguishable from the control: after 30,000 ticks the recall inputs' mean weight is 0.065 (from 0.0 at the start), so evolution found no use for them in that time.

## Reading it, and what it does not say

- **Creatures do come back** (86 percent of bites land within 40 units of the site remembered just before), but that proves little: they feed in the same patch anyway, and a control cannot be measured on it.
- **Why the population falls is a hypothesis, not a finding:** many creatures remembering the same patch crowd it and over-graze a renewable plant, and walking back costs energy; the steering-only arm (which still loses) points away from "the forced thrust is the whole story". It was not isolated.
- **The scope is narrow.** One remembered site, a hand-wired return instinct, one world (the default preset, brain controller), 8 to 16 seeds and 30,000 ticks. This does not show that memory is useless, only that this form of it, here, does not pay.
- **It does fit the pattern of the other nulls** (the jaw's persistence, ADR 0023 steps three and four; capacity): the world rewards what the prior and the senses already do. Foraging in a patchy, renewable, constant world is close to solved by sight plus instinct, so a faculty whose job is to improve foraging has little to add.

## Decision

The place-memory mechanism is **not kept** (reverted; recoverable from `a741b65`). Brain capacity is **not** a lever and gets no metabolic cost. What is kept from the work, because it stands on its own:

- `inputGroupOf` in the observatory **throws** for an observation slot that has no group instead of silently counting it as `threat` (found while adding the `recall` group; a test pins it).
- `docs/learning/brain.md` said the observation had 40 numbers; it has 48.

## What this suggests next

Three null results in a row say the limit is the world, not the creatures' cognition: a constant, plant-fed world with renewable patches gives instinct and sight nothing to lose to. A faculty such as memory, or a food source such as eggs, only pays when the world is **less constant or less visible**, so the next project that can show a gain is more likely a **changing environment** (seasons that move the patches, disturbances that wipe them, food that is hidden) than another cognition feature; eggs and nests follow, because a nest is exactly the kind of stationary, hidden, valuable place that a changing world makes worth remembering. That is a recommendation to be tested the same way (stated criteria, an identical-size control, the observatory), not a result.
