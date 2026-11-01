# 0010: Mate seeking (sensing eligible partners)

Status: **Accepted** (the owner asked for it to land first in Phase 7; the design below was revised by measurement, see "What was learned")

## Problem

Reproduction in the engine is local and automatic: an organism that is mature, off cooldown and holds at least its own `minEnergy` looks for a partner within its own `searchRadius`; the partner must clear the same three gates. The brain never learned about partners, so nothing makes two ready organisms meet. Phase 6 measured a residual extinction risk in the default world and attributed it to this (an Allee effect).

Measured on the Phase 6 `main` (64 seeds, 50,000 ticks, default config):

- 2 of 64 worlds went extinct (seeds 20 and 54, at ticks 36,000 and 20,000). Mean population 30.9 after burn-in, lowest sampled population 8.
- 99.8% of all reproduction attempts fail. Every failure is `no-partner`; the population cap is never reached.
- About a quarter of the population (roughly 7 of 30) is ready at any moment and sits waiting, often at the energy cap, which wastes energy. Only about 29% of ready organisms have **any** other organism within their search radius, and a ready organism never has a ready neighbour (pairs are formed in the same tick, so a ready neighbour is consumed immediately).

So the bottleneck is two ready organisms being in the same place at the same time.

## A naive fix fails badly

The brain already has a `peer` sighting (observation 12-15: nearest _other organism_ in sensor range) which the innate prior ignores. Wiring the prior's turn output toward that peer, at half and at full the weight used for food, was tried over the same 64 seeds:

| Variant                                  | Extinct worlds (of 64) |
| ---------------------------------------- | ---------------------- |
| Baseline (no mate steering)              | 2                      |
| Turn toward the nearest peer, weight 1.5 | 54                     |
| Turn toward the nearest peer, weight 3   | 64                     |

The nearest peer is usually a juvenile, an organism on cooldown, or a hungry one, so the steering drags foragers away from food toward partners that cannot mate. The fault is the target, not the idea.

## Decision

Give the brain a sighting of the nearest **eligible** partner, and only when the organism is itself ready:

- Four new observation slots, appended at the end so no existing slot moves: `mateInView`, `mateBearingCos`, `mateBearingSin`, `mateProximity` (same layout as the food and peer sightings). `OBSERVATION_SIZE` 33 becomes 37 and the default genome grows by `8 x 4 = 32` input weights (394 to 426).
- `PerceptionSystem` fills a new `MateBuffer` (the same pattern as the peer and hazard buffers, brain controller only). An organism gets a sighting only if **it** is ready, and the sighting is the nearest other organism within its sensor radius that is also ready. Because the observation is zero unless both parties are ready, the network needs no gating logic and a hungry or juvenile organism is never pulled away from food.
- "Ready" is defined once, in one pure function shared by `ReproductionSystem` and `PerceptionSystem` (not juvenile, cooldown at most zero, energy at least the threshold for here and now, partner of the same species when `species.reproductiveIsolation` is on), so sensing and mating can never disagree. Moving the existing threshold and cost logic out of `ReproductionSystem` is a behavior-preserving refactor, proven by unchanged golden hashes before any behavior changes.
- The innate prior gains two steering units and a thrust unit driven by the mate slots, weaker than food steering. Founders add the usual small noise on top. Everything else about the prior is unchanged.
- Sensing uses a **new config value, `reproduction.mateSenseRadius` (default 250)**, a mating signal much longer-ranged than the sensor radius (30-120 by gene) and than the search radius (25-100 by gene). The first design used the sensor radius; measurement showed that cannot work at low density (see below). Mating itself still needs the partner within the search radius.
- Because the signal lets reproduction use energy that used to sit idle at the capacity, `resources.spawnRate` is lowered from 2 to 1.6 so the mean population stays inside the Phase 5/6 stability bands. This changes the food supply for **every** controller; `withoutEcology()` in the tests pins the old rate so the Phase 5 numbers still reproduce.

The reflex controller is untouched.

## Alternatives considered

- **Steer toward the nearest peer.** Measured above: it makes every world extinct.
- **Gate the existing peer steering on the organism's own energy inside the network.** The network is one softsign layer with no multiplicative units, so "peer present AND I am ready" cannot be expressed cleanly; a biased unit turns the organism in circles whenever it is not ready.
- **Change the reproduction rule** (a larger search radius, pair-bonding, remembered partners). This changes the biology for every controller, including the reflex baseline, rather than giving the brain a way to act on it, and the owner asked for a mate-seeking prior.
- **Leave it.** The default world's extinction rate stays around 3%, which is a visible failure in a browser that people watch for a long time.

## Consequences

- Brain-mode behavior changes, so every brain-mode golden hash changes. Reflex-mode dynamics do not (the equivalence harness shows identical digests with a reflex controller, mutation off and ecology off), but their genome contents change with the new weight count, so their hashes change too.
- `genetics` stream draws grow with the weight count, as in Phase 6.
- The cost is one spatial query per ready organism per tick (about a quarter of the population), under the brain controller only.
- Success was judged over many seeds against the baseline above, not on any single seed.

## What was learned

A few things the plan did not predict, in the order they were found:

1. **Range matters more than steering.** With the signal limited to the sensor radius and a ready-only steering term, 32 seeds gave 2, 1 and 1 extinct worlds at three steering strengths against 1 at baseline: births rose 11-21% but extinction did not move. Following one extinct world showed why: at tick 14,000 it held four adults, all ready and all near full energy, hundreds of units apart in a 500 x 500 world. Nobody could see anybody. A population that has drifted down to about ten is already past the point where local sensing can find a partner.
2. **A longer signal fixes the floor.** With `mateSenseRadius` 150, 300 and 500, all 32 seeds survived and births roughly doubled (about 660 to about 1,270 per 50,000 ticks), and the lowest population sampled rose from 8 to 23-28. 250 was chosen: it covers half the world and is not the whole of it.
3. **It overshoots the population band, so the food supply was retuned.** The mean population rose from about 31 to about 48 with peaks of 60-76, outside the gates. Following the rule of tuning defaults rather than gates, `resources.spawnRate` was swept: 1.6 held 0 of 32 extinct with means 25-42 and peaks at most 54; 1.4 and 1.2 reintroduced extinctions (3 and 9 of 32) because they starve the population from the other side.
4. **Final validation with the baked defaults, no overrides:** 128 seeds x 50,000 ticks (seeds 1-32 were used while tuning; 33-128 are held out). **One world went extinct** (seed 65, tick 31,000), against 2 of 64 at baseline. Seeds 33-64 went from 1 of 32 to 0 of 32. Mean population per seed 22-43 (median 35), peak at most 60, lowest sampled population 11 (10th percentile 17, against 8 and 11 at baseline), births per run 903 against 660.

**The honest summary:** this makes the default world markedly more robust (more births, a higher population floor, a population band unchanged) and lowers the observed extinction rate from about 3% to under 1%, but 1 in 128 is too few events to claim a precise rate, and extinction remains possible. It is reported as reduced, not eliminated.

The naive-steering experiment, the ready-gated sensor-range experiment, the range sweep and the spawn-rate sweep were all run as throwaway probes over fixed seed sets; the numbers above are from those runs and are not reproduced by a test, apart from the properties the tests pin (see below).

## What the tests pin

- Eligibility sensing: a ready organism sees a ready partner far beyond its sensor radius, from both sides; the nearest _ready_ partner is reported, never a closer juvenile, resting or hungry one; an organism that is not itself ready gets nothing; partners beyond `mateSenseRadius` and (with reproductive isolation) other species are not seen.
- The innate prior turns toward a partner on either side and speeds up, and a forager with food on one side and a partner on the other still turns toward the food.
- Causal ablation in a real world: under the brain controller, a 250 signal produces clearly more births than a signal of 1; under the reflex controller the signal changes nothing (identical state hash).
- Removing the "only if I am ready" gate from perception fails the suite (checked by hand during development).
- The equivalence harness (previous commit versus this one, reflex controller, mutation off, same food supply, 20 scenarios, snapshots every 250 ticks, the full event list and the historical records) gave identical digests in all 20: reflex dynamics are untouched; only genome contents, and therefore every golden hash, changed.
