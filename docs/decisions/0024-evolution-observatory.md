# ADR 0024: An evolution observatory: indicators of whether a world is still changing

Status: accepted. Follows [ADR 0008](0008-species.md) (species), [ADR 0018](0018-population-tuning.md) (the stability bands), [ADR 0023](0023-predation.md) (the 100,000-tick run that found the jaw's takeover was invisible to every 30,000-tick probe).

## The problem

The engine is stable, and we cannot tell whether it is **still evolving or has settled into a thermostat**. Every next project (brain capacity, place memory, eggs and care, signals, a changing environment) will claim to help, and without instruments we would be guessing again, as we did on part variety (three PRs that each "did not move it" were only visible through an ad hoc probe column) and on the jaw (a world dominated by one mouth form only shows at 100,000 ticks).

Open-ended evolution has no agreed single number. These are **indicators**, in the family of Bedau's activity statistics (new components that **persist**, components that are **used**, rising complexity), not a verdict.

## Decision

A read-only **observatory** (`packages/simulation/src/observatory/`, config `observatory { enabled, sampleEvery 500, behaviourEvery 10, maxSamples 1000 }`) watches a world and, every `sampleEvery` ticks, records indicators. `World.observatory()` returns a copy of the series (`contracts/src/evolution.ts`). It **only reads**: nothing is hashed, drawn or fed back, so a world with it on and off has the same state hash (proved below), and there is no schema bump and no golden change.

| Group                  | What a sample holds                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Novelty**            | body plans (sorted functional part types, mouth form, size bin) seen for the first time; plans that have **taken hold** (alive in three samples in a row and at least 2 percent of the population once, so a flash of noise does not count); the effective number of plans alive (inverse Simpson index, because the engine bans `exp` and `log`) |
| **Body**               | mean pairwise body-plan distance, mean and largest functional part count, part types in use                                                                                                                                                                                                                                                       |
| **Brain**              | distance of the living brains from the innate prior; **per input group** (self, food, peer, hazard, season, mate, home, prey, threat) the mean absolute input weight, so "did evolution take up the new senses" is one number; mean pairwise brain distance; how much a life has learned                                                          |
| **Response diversity** | every brain is shown the same fixed battery of eight situations with empty memory (nothing, food left, food right, hungry, prey, threat, food and threat, a peer) and what it decides to do is recorded: effective response types and spread. Two creatures differ here only if their genes do                                                    |
| **Realised behaviour** | speed, turning, resting, intake shares (plants, flesh, carrion), bite rate, range; effective types and spread. **Descriptive only** (below)                                                                                                                                                                                                       |
| **Rate**               | movement of the trait means (every non-cosmetic gene, part count, part types, brain drift) between samples, each as a share of its range                                                                                                                                                                                                          |
| **Lineage**            | species alive, ever, created since the last sample, population share in species younger than 5,000 ticks; founder lineages still alive; mean and largest generation                                                                                                                                                                               |
| **Stasis**             | true after ten samples in a row with no new plan, rate under 0.001, brain drift moving under 0.0003 a sample                                                                                                                                                                                                                                      |

The app shows four of them as trends in an **Evolution** panel of the bottom strip (plans that took hold, response types, brain drift, trait change) with one plain sentence, and the inspector's Brain tab says how far that creature is from the prior and how much it has learned. `evo-sim --observatory` prints the whole series as CSV; `tests/probe/evolution.probe.ts` tabulates it over seeds.

## Two first-draft indicators failed their controls and were redesigned

Each indicator has to separate worlds that should differ. The controls (8 seeds, 30,000 ticks): **frozen** (mutation switched off, no founder group: nothing can evolve), **fixed bodies** (only brains evolve), **balanced** (the default) and **rapid evolution** (mutation three times as frequent and half again as strong).

- **The rate was standardised by the population's own spread (Haldane).** With mutation off the variation left is tiny, so selection moved the means by many "standard deviations": the frozen world read **0.41 against balanced 0.11**, backwards. It is now each mean's movement as a share of its range: frozen 0.000, fixed bodies 0.001 to 0.002, balanced 0.002 to 0.003, rapid 0.005.
- **Realised behaviour diversity did not separate the frozen world** (9.6 effective types) from the evolving ones (11 to 14): it measures circumstance. The headline behavioural measure is now the **response battery**: frozen 2.6 to 4.0, balanced 5.9 to 11.3, rapid 10.3 to 15.0 (first to second half of the run). Realised behaviour stays as a descriptive column and the intake shares, which are independent of it, are the trophic readout.

## Measured

Controls (8 seeds, 30,000 ticks, none extinct except rapid evolution, 2 of 8):

|                 | new plans 1st / 2nd half | plans that took hold | effective plans | brain drift    | brain spread | response types | rate          | stasis (worlds)                 |
| --------------- | ------------------------ | -------------------- | --------------- | -------------- | ------------ | -------------- | ------------- | ------------------------------- |
| frozen          | 0 / 0                    | 1.0                  | 1.0             | 0.013 to 0.019 | 0.079        | 2.6 / 4.0      | 0.000         | 52% of samples (8 of 8)         |
| fixed bodies    | 0 / 0                    | 1.0                  | 1.0             | 0.013 to 0.044 | 0.180        | 6.8 / 13.1     | 0.001 / 0.002 | 0                               |
| **balanced**    | 69.5 / 90.8              | 69.0                 | 4.1 / 10.5      | 0.013 to 0.043 | 0.177        | 5.9 / 11.3     | 0.002 / 0.003 | 0                               |
| rapid evolution | 117.8 / 201.9            | 112.5                | 11.7 / 28.1     | 0.013 to 0.074 | 0.306        | 10.3 / 15.0    | 0.005 / 0.005 | 4% (2 of 8: the extinct worlds) |

What the default world is, then, on these numbers: bodies keep producing plans that take hold (the second half is not quieter than the first); brains barely move from the hand-wired prior (4.3 percent in 30,000 ticks, the prey and threat input weights up 3 percent, against 14 percent down for the threat group under rapid evolution); no stasis.

Baselines for "did the last feature change this" (8 seeds, 30,000 ticks):

| setup                                                | new plans 1st / 2nd | plans that took hold | response types | brain drift (end) | plant / flesh / carrion intake |
| ---------------------------------------------------- | ------------------- | -------------------- | -------------- | ----------------- | ------------------------------ |
| balanced (predation on, hunter group 10%, obstacles) | 69.5 / 90.8         | 69.0                 | 5.9 / 11.3     | 0.043             | 0.94 / 0.00 / 0.06             |
| predation off, no group                              | 62.3 / 74.5         | 67.4                 | 6.3 / 10.7     | 0.043             | 1.00 / 0 / 0                   |
| predation on, no hunter group                        | 64.3 / 90.0         | 67.4                 | 6.4 / 13.3     | 0.043             | 0.94 / 0.00 / 0.06             |
| obstacles off                                        | 73.0 / 81.6         | 72.9                 | 6.1 / 10.9     | 0.043             | 0.95 / 0.00 / 0.05             |

**Neither predation nor obstacles moves any indicator beyond the noise of 8 seeds.** That is the answer to "did carnivory make the world more open-ended": not at this strength, which is what ADR 0023 step three found from the other side (a jaw lineage is alive at 100,000 ticks in 1 of 8 worlds).

## Limits, stated plainly

- **Body-plan novelty may not plateau by construction:** the signature space (sorted part types, mouth form, size bin) is combinatorial, so a rising count of plans is weaker evidence than it looks. The plans that _took hold_ and the effective number of plans are the readings to trust; the controls separate worlds, they do not prove open-endedness.
- **The response battery is eight hand-chosen situations** and reads only what a brain would do in them, with empty memory and no learning. A behaviour the battery does not cover (a route, an ambush) is invisible to it; place memory and social signals will need their own situations.
- **Realised behaviour is descriptive** (a frozen world already shows nine effective types of it).
- **Stasis is "nothing measurable moved"**, which is what a settled world looks like and also what a dead one does (the two extinct rapid worlds are flagged), and what a very slow one looks like.
- The thresholds (ten samples, rate 0.001, drift 0.0003) were set from these controls, not derived.

## Verification

All 52 golden entries unchanged; a world with the observatory on and off has the same state hash and snapshot over 3,000 ticks for three seeds (and with the reflex controller); a run gives the same series stepped, chunked and in one go; the series is a copy (changing it changes nothing); `maxSamples` drops the oldest and keeps the tick-0 baseline (the persistence rule counts consecutive samples, so old samples are dropped, not halved). Every indicator has known-answer tests with negatives (identical creatures read 0 and one type; two equal groups read two; a brain equal to the prior reads 0 drift and one rewired on the prey inputs shows it in that group only; the input-group table is pinned to `OBSERVATION_LABELS` so a new input cannot skip a group; a plan that appears for one sample never takes hold; the stasis flag needs ten quiet samples and resets on one busy one). **Cost:** 817/845 ticks a second off against 836/838 on in the field world, and 91/81 against 87/85 in the 1,000-creature cluster world: inside the noise.
