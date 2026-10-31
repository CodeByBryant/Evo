# The brain and learning

Design rationale is in [ADR 0007](../decisions/0007-learning-and-the-brain.md). This page is the specification: what an organism observes, how the network computes, what is rewarded, and exactly how weights change. Code lives in `packages/simulation/src/learning/` (pure functions, no `World` access) and `systems/BrainSystem.ts` (the only place that touches organism state).

## Overview

Each tick, for each organism, in ascending id:

1. **Observe**: build a 33-number `Observation` from the organism's body and what perception found.
2. **Learn** from the previous tick: using the reward stored last tick, nudge the learnable weights.
3. **Decide**: run the network, add exploration noise, produce a 5-number `Action`.
4. The action is translated to an intent; movement, interaction, metabolism, reproduction and death run as usual.
5. **Settle** (after death): compute this tick's reward and store it for step 2 next tick.

Memory is the network's own recurrence, not an input. `learning.controller: 'reflex'` bypasses all of this and runs the Phase 4 hand-coded forager.

## Observation

`OBSERVATION_SIZE = 33` (23 until Phase 6, which appended ten values, see below). The order is part of the contract (`OBSERVATION_LABELS` in `@evo/contracts`); changing it is a hash-schema change and a golden regeneration. "Body frame" means rotated by the organism's heading.

| #     | Label                      | Value                                                                         | Range    |
| ----- | -------------------------- | ----------------------------------------------------------------------------- | -------- |
| 0     | `energy`                   | energy / effective `maxEnergy`                                                | [0, 1]   |
| 1     | `age`                      | age / own `maxAge` gene                                                       | [0, 1]   |
| 2     | `forwardVelocity`          | velocity along the heading / own `maxSpeed`                                   | [-1, 1]  |
| 3     | `lateralVelocity`          | velocity across the heading / own `maxSpeed`                                  | [-1, 1]  |
| 4-5   | `positionX`, `positionY`   | position / world width, height                                                | [0, 1]   |
| 6-7   | `headingCos`, `headingSin` | heading as a unit vector                                                      | [-1, 1]  |
| 8     | `foodPresent`              | 1 when a resource is within `sensorRadius`, else 0                            | {0, 1}   |
| 9-10  | `foodBearingCos/Sin`       | direction to the nearest resource, body frame (0 when absent)                 | [-1, 1]  |
| 11    | `foodProximity`            | `1 - distance / sensorRadius` (0 when absent)                                 | [0, 1]   |
| 12-15 | `peer*`                    | the same four values for the nearest **other organism** within `sensorRadius` | as above |
| 16    | `timeSinceFood`            | seconds since this organism last ate / `learning.foodHorizon`, clamped        | [0, 1]   |
| 17    | `previousReward`           | last tick's total reward, clamped                                             | [-1, 1]  |
| 18-22 | `previousAction*`          | the five action values chosen last tick                                       | [-1, 1]  |
| 23    | `ownHealth`                | health / maximum health (1 when health is off)                                | [0, 1]   |
| 24    | `hazardPresent`            | 1 when a hazard's edge is within the sensor range                             | {0, 1}   |
| 25-26 | `hazardBearingCos/Sin`     | direction to the centre of the nearest hazard (by edge), body frame           | [-1, 1]  |
| 27    | `hazardProximity`          | 1 inside the hazard, falling to 0 at the sensor range from its edge           | [0, 1]   |
| 28    | `foodKind`                 | the perceived food's kind index / (kinds - 1); 0 when none or one kind        | [0, 1]   |
| 29-30 | `seasonCos`, `seasonSin`   | the year phase as a unit vector (0, 0 when seasons are off)                   | [-1, 1]  |
| 31    | `regionTemperature`        | region plus season temperature (0 when both are off)                          | [-1, 1]  |
| 32    | `regionMovementScale`      | region times season movement multiplier (1 when both are off)                 | (0, 1]   |

Slots 23-32 were **appended** in Phase 6 (ADR 0009) so no existing slot moved and the innate prior, which addresses slots by number, is unchanged. With a feature off its slots carry their neutral value (health 1, movement 1, the rest 0), a constant the network can use as a bias. The hazard and the food kind are found by `PerceptionSystem` in brain mode only. Ties in "nearest" follow the engine-wide rule `(distance squared, id)`. The peer is found only in brain mode, so the reflex controller costs nothing extra.

## Network

Sizes: input `I = 33`, hidden `H` (default 8), memory `M` (default 4), output `O = 5`. `softsign(x) = x / (1 + |x|)`: bounded in (-1, 1), smooth, and needs only `+`, `/`, `abs` (the determinism policy bans platform `exp` and `tanh`).

```text
h      = softsign(W_ih x + W_mh m + b_h)       // hidden, from observation and previous memory
m'     = softsign(W_hm h + b_m)                // new memory, stored for next tick
out    = softsign(W_ho h + b_o)                // the five action values
value  = W_hv . h + b_v                        // the critic's estimate (any algorithm computes it)
```

Sums accumulate in a fixed row-major order so results are bit-identical across platforms.

### Weight blocks

The genome's flat `weights` vector is eight consecutive blocks. Block 8 is new in Phase 5; blocks 1-7 are unchanged apart from the larger input size (which grew again in Phase 6).

| #   | Block            | Shape          | Default length | Learnable                         |
| --- | ---------------- | -------------- | -------------- | --------------------------------- |
| 1   | `inputToHidden`  | H x I          | 264            | no (evolution only)               |
| 2   | `memoryToHidden` | H x M          | 32             | no                                |
| 3   | `hiddenBias`     | H              | 8              | no                                |
| 4   | `hiddenToMemory` | M x H          | 32             | no                                |
| 5   | `memoryBias`     | M              | 4              | no                                |
| 6   | `hiddenToOutput` | O x H          | 40             | **yes** (actor)                   |
| 7   | `outputBias`     | O              | 5              | **yes** (actor)                   |
| 8   | `hiddenToValue`  | H, then 1 bias | 9              | **yes** (critic; Hebbian ignores) |

Default total: **394** weights (314 in Phase 5, 249 in Phase 4). Because the hidden layer and memory are fixed during a life, `h` depends only on genome weights, the observation and memory; learning changes only how `h` is read out.

## Action

`ACTION_SIZE = 5`, all in [-1, 1] (`ACTION_LABELS`):

| #   | Output     | Effect                                                                                                   |
| --- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 0   | `thrust`   | `max(0, value)` is the forward drive, as in the reflex controller (0 to 1)                               |
| 1   | `turn`     | fraction of the organism's own `maxTurnRate`, signed                                                     |
| 2   | `strafe`   | lateral velocity as a fraction of `maxSpeed`, signed; metabolism already charges for the resulting speed |
| 3   | `interact` | consumption is attempted only when `value > 0`; reflex always interacts                                  |
| 4   | `explore`  | scales next tick's exploration noise by `1 + value` (0 to 2)                                             |

The action actually taken is the network output **plus exploration noise**, clamped to [-1, 1]; that taken action is what is fed back as `previousAction*` and what learning attributes reward to.

## Exploration

Each tick the `learning` stream supplies five standard normals `n_o` per organism (always five, always in ascending id, regardless of settings). The noise applied to output `o` is

```text
sigma_o = explorationRate_gene * ageFactor * (1 + previousAction.explore)
ageFactor = persistence + (1 - persistence) * (1 - age / maxAge)
noise_o = sigma_o * n_o
```

so `persistence = 1` keeps exploring for life and `persistence = 0` anneals to none at `maxAge` (roadmap 5.6). With no food in view the innate prior wanders by drifting forward while exploration noise jitters the turn, replacing the reflex controller's `wanderJitter` heading noise.

## Reward

Computed in `brain.settle` from the events and energy change of the tick that just finished (`RewardBreakdown`, roadmap 5.3):

| Term           | Definition                                                                                             | Weight (`learning.rewardWeights`) |
| -------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `feeding`      | energy gained from `resource-consumed` / effective `maxEnergy`                                         | `feeding`                         |
| `reproduction` | 1 when the organism took part in a successful `reproduction-attempted` (initiator or partner)          | `reproduction`                    |
| `energyCost`   | metabolic cost paid this tick / effective `maxEnergy` (exact: energy delta - gain + reproduction cost) | `energyCost` (subtracted)         |
| `damage`       | health lost this tick / maximum health, times `1 - riskTolerance` (the gene)                           | `damage` (subtracted)             |
| `exploration`  | `noveltyPreference` (the gene) the first time this life the organism enters a cell of an 8 x 8 grid    | `exploration`                     |
| `total`        | `feeding*wf + reproduction*wr + exploration*we - energyCost*wc - damage*wd`, clamped to [-1, 1]        |                                   |

`survival` is intentionally absent (ADR 0007): rewarding survival rewards hiding. `damage` and `exploration` arrived in Phase 6 (ADR 0009) and are what give the `riskTolerance` and `noveltyPreference` genes a meaning. The organism's starting cell counts as visited, so the exploration reward is for entering new ground, and it is bounded (at most 64 per life). Health damage does not touch energy, so it never shows up in `energyCost`; the energy spent healing does. Everything the learner sees is derived from this, so `World.brainOf(id)` can show the same breakdown a human would.

## Learning

Let `eta` be the organism's `learningRate` gene, `gamma` its `discountFactor`, `lambda` its `eligibilityTraceDecay`, and `W` the learnable overlay. When `learning.enabled` is false, none of this runs (noise and acting continue).

**Eligibility** (per learnable actor weight, updated at decision time):

```text
e_oj <- gamma * lambda * e_oj + n_o * h_j        // hiddenToOutput
e_o  <- gamma * lambda * e_o  + n_o              // outputBias
```

Here `n_o` is the standardized draw (the unit normal, before it is scaled by `sigma_o`), or 0 when `sigma_o` is 0, so the size of a learning step does not shrink with the size of the exploration. A weight is eligible to the extent that the noise pushed an output in a direction while its input was active: if reward then follows, that push is reinforced.

**Update** (next tick, after the transition `(prev observation, taken action, reward, new observation)` is known):

```text
W_actor <- clamp(W_actor + eta * delta * e, -weightLimit, +weightLimit)
```

| Algorithm     | `delta`                                                                    | Also trains                                                                                     |
| ------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `hebbian`     | `reward - baseline`, then `baseline += baselineRate * (reward - baseline)` | -                                                                                               |
| `actorCritic` | `reward + gamma * V(new) - V(prev)` (TD error)                             | value head: `W_hv += eta * valueRateScale * delta * h_prev / (1 + sum h_prev^2)`, bias likewise |

`delta` is clamped to `[-1, 1]` (a reward is at most 1, so a larger TD error means the value estimate is badly off and one step must not wreck a brain), and the critic's step is divided by the squared norm of its features plus the bias, so a large hidden activation can never push it past the stable range (normalized least mean squares). Both were found necessary by experiment: without them a learning rate of 0.5 destroyed the organisms within a few hundred ticks. The weight clamp, the bounded activations and the bounded reward keep every quantity finite; `World.validate()` asserts finiteness of all `BrainState` fields.

**Cost.** While learning is enabled under the brain controller, metabolism adds `organisms.learningCost * (learningRate / baseline)` per second, so a higher learning rate has a price (ADR 0007).

## Inheritance

At reproduction each parent contributes `inheritedBrainWeights(genome weights, learned overlay, mode, fraction)` to recombination:

| Mode         | Child starts from                                                     |
| ------------ | --------------------------------------------------------------------- |
| `baldwinian` | the parent's genome weights only (learning is not inherited)          |
| `partial`    | genome weights moved `fraction` of the way toward the learned weights |
| `lamarckian` | the parent's learned weights                                          |

Only the learnable blocks differ between modes. The child's `BrainState` starts fresh (zero memory, zero eligibility, `learned` = its own genome blocks).

## Founders: the innate prior

With `genetics.brain.innatePrior` (default true) a founder's weights are a hand-wired template plus Gaussian noise (`initialWeightStd` scaled down) rather than pure random draws. The template wires: bearing-to-food to `turn`, food-present to `thrust`, a positive thrust bias for wandering, `interact` and `explore` biases on, and the value head near zero. A test drives the unmodified template against a food source and checks it turns toward and reaches it. Setting `innatePrior: false` draws every weight from `N(0, initialWeightStd)` as in Phase 4, for experiments about learning from scratch.

## Telemetry and inspection

`BrainState` keeps three lifetime counters: total reward, number of updates, and summed absolute weight change. `World.brainOf(organismId)` returns the latest observation, hidden activations, memory, network output and action taken, value estimate and `RewardBreakdown`, so activations and rewards are inspectable without touching internals. Final telemetry is copied onto the historical record when an organism dies.

## What is deliberately not here

- (Phase 6 made `noveltyPreference` and `riskTolerance` live: they scale the exploration reward and the damage penalty, see Reward.)
- No gradient through the hidden layer or memory: those evolve.
- No `survival` reward, no per-tick cost for memory. (`ownHealth` arrived in Phase 6 as observation slot 23.)

## Measured behavior (Phase 5)

These are the numbers the tests enforce, measured on this code and not hoped for.

| Question                                              | Result                                                                                                                                                                                                                                                                                                     | Where checked                              |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Does each learner learn at all?                       | On a toy steering task both improve (mean gain above 0.05 over five seeds, at least four of them positive) and neither moves with learning off                                                                                                                                                             | `tests/learning/toy-task.test.ts`          |
| Does the innate prior forage like the reflex forager? | One organism, 200 static food items, 1,500 ticks: the brain eats at least 70% of what the reflex forager eats (about 84% when first measured) and a primed brain eats more than twice what a random brain does (a random brain managed about 4%)                                                           | `tests/learning/foraging.test.ts`          |
| Does the ecology stay alive under the brain?          | 50,000 ticks on four seeds: never extinct, population mean between 15 and 40, never below 5 or above 60 (first measured: mean 20-32, minimum 9, maximum 47; Phase 4 reflex: mean about 27)                                                                                                                 | `tests/determinism/brain-long-run.test.ts` |
| Does learning improve a real life?                    | Modestly. With the `interact` output started just below threshold, learning raised it in most of 12 lives and Hebbian learners ate more over a life than the same organism with learning off (about 65 to 98 items in a 16-life sample, 11 of 16 lives better); actor-critic raised the output more slowly | `tests/learning/scenario-d.test.ts`        |
| Can the modes be told apart?                          | Every algorithm and inheritance mode gives a different history; a Lamarckian child's learnable weights equal its parents' learned weights, a Baldwinian child's do not                                                                                                                                     | `tests/learning/ablation.test.ts`          |
| What does it cost?                                    | The brain controller is about three times as slow per tick as the reflex controller (roughly 28 s against 8 s per 100,000 ticks on the development machine; reflex mode itself got about twice as fast in Phase 5 from a cheaper nearest-neighbour search)                                                 | `vitest.determinism.config.ts` timeout     |

Two honest limits. Learning during one life moves weights only a little (a few hundredths of a unit per meal at the default learning rate, against weights of order 1), so most of what a lineage gains by Phase 5 comes from evolution, with within-life learning a modest refinement; the learning rate is a gene, so selection may raise it, at the price of `learningCost`. And credit assignment across more than a few ticks is weak: the eligibility trace has a half-life of about five ticks at the default genes, so rewards that arrive long after the action that earned them (steering toward food seen 30 ticks away) are learned much more slowly than immediate ones.
