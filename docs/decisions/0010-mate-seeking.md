# 0010: Mate seeking (sensing eligible partners)

Status: **Proposed** (changes engine behavior; the owner asked for it to land first in Phase 7)

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
- Sensing extends to the organism's **sensor** radius, not its search radius, because partners have to be seen before they can be approached; mating still needs the partner within the search radius.

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
- Success is judged on the same 64 seeds against the baseline above, not on any single seed. If the prior does not measurably reduce extinction, this ADR is revised with the numbers and the change is withdrawn rather than shipped.
