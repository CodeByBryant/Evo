# ADR 0027: A life cycle, two sexes, eggs, ageing and mate choice

Status: accepted. Builds on [ADR 0005](0005-continuous-organism-ecology.md) (reproduction), [ADR 0006](0006-genetics-and-inheritance.md) (genes), [ADR 0010](0010-mate-seeking.md) (the mating signal) and [ADR 0023](0023-predation.md) (jaws). Hash schema 13, genome version 5.

## Why

After five measured null results on carnivory (ADRs 0023 step four, 0025, 0026 and the prey-eligibility experiment) the owner stopped chasing levers and asked for a feature: **instead of an instant birth, a short incubation, then an egg that matures and hatches**, and a **real overhaul of ageing and of how creatures pair up**, without forcing the best to breed (selection stays natural). Their decisions: **two sexes**; **parents guard eggs, and jaws can eat them**; **ageing is decline plus a chance of dying**; **mate choice is a heritable preference and mutual acceptance**. Everything ships in one PR, each part behind its own switch and measured on its own first.

What the code did before: a child was a fully formed creature made in the tick the pair met, at their midpoint; the partner was the nearest ready creature in reach and had no say (99.8 percent of attempts failed with no partner in reach); a creature died by a hard cutoff at its `maxAge`; the `senescent` stage did nothing but dim a sprite.

## The life cycle

**Sexes** (`reproduction.sexes.enabled`). `OrganismState.sex` (0 female, 1 male). Founders alternate by index (no draw); a newborn's sex is one draw from the `reproduction` stream. Only a female and a male mate and the female is the mother. The mate sense (ADR 0010) and the partner search both require the other sex.

**Eggs** (`reproduction.eggs`, needs sexes). Conception happens where the birth used to: both parents pay, cooldowns reset, and the child's genome is **recombined at once** (the same draws, in the same order, as an instant birth) and stored in the mother's pregnancy. She carries it for `incubation` seconds and pays `carryCost` a second on top of her metabolism; **if she dies first the clutch is lost** (`clutch-lost`). Then `EggSystem` lays one egg at her position (`egg-laid`) and, `hatch` seconds later, the egg becomes a creature with the stored genome, parents and the **mother's species at conception** (she may be dead), `egg-hatched` then `organism-born`, so births, generations and the birth effect work as before. Eggs and carried clutches **count against `maxPopulation`**. Ids come from the shared allocator at laying and at hatching, so they stay ascending.

**Guarding and egg predation.** A living parent within `guardRadius` of its egg guards it (`guardCost` a second per egg). A bite at a guarded egg is **stopped**: the egg stays, the biter takes `guardDamage` health counted as a bite by the guard (so a death from it is a death by predation). An unguarded egg is **eaten whole** by any mouth with a flesh yield (a jaw), never by a mandible, a sprout or a parent: the egg is gone and the gut takes what it can hold of its energy at the trophic yield and the flesh yield; a full gut refuses it. A body that bites creatures sees eggs as prey (the existing prey input, so the innate hunting instinct drives it). A parent senses the way back to its own egg through the **existing `home` inputs** (observation slots 37 to 39, zero in the field layout): `present` grows from 0 at the guard radius to 1 at three times it, so **no observation or weight changes**. Eggs are drawn as flat pale discs that fill as they near hatching, with a ring when guarded, on an Eggs layer.

## Ageing

`ageing.enabled`. With `s` the share of the way from the creature's own `senescenceAge` to its own `maxAge` (above 1 beyond it): metabolism rises by `metabolismRise x min(s, 2)`, top speed falls by `speedLoss x min(s, 1)`, and the energy needed to breed rises by `fertilityLoss x min(s, 1)`. **There is no cutoff at `maxAge`**: a creature past `senescenceAge` dies of `age` with chance `hazard x s` a second (one draw per old creature per tick from the `world` stream, none in prime), and certainly at `ceiling x maxAge`. Off is the hard cutoff, exactly. The snapshot's `lifeStage` now uses the creature's own genes instead of the world's baseline (a latent bug: a creature with evolved ages showed the founder's stage).

## Mate choice

`reproduction.mateChoice` (needs sexes). Two new **genes**, `choosiness` and `preference` (both `[0, 1]`, appended to the gene table, so every earlier gene keeps its place; genome version 5). An initiator looks at the nearest `candidates` ready partners of the other sex and takes the first that **both** accept. A creature scores a candidate `(1 - preference) x condition + preference x difference`, where condition is the candidate's spare energy over what it needs to be ready (0 just ready, 1 full) and difference is the genomic distance over the species threshold (capped at 1); it accepts if the score reaches `choosiness x threshold`. A creature with `choosiness` 0 accepts anyone and the world is bit for bit the world without mate choice (tested). Turning every candidate down costs `searchCost` energy and a `retryDelay` wait (failure reason `rejected`).

## Proof that the switches are switches

With sexes, eggs, mate choice and ageing off, nine scenarios (field, instant eating, noise food, one cluster, lush, no predation, no ecology, the reflex controller; founder brains equal to the prior, mutation and learned inheritance frozen) give normalized snapshots, events and records **identical** to the code before this work, through births and deaths. A multi-cluster layout differs only through the shifted `genetics` stream (the two new genes: its founders differ, so the blend of their children depends on the draws), as in ADR 0025. The hash header and sample digests for schema 13 match the independent Python hasher. Goldens regenerated twice (hash schema 13 in the first commit; the two new genes in the mate-choice commit), each in the commit that caused it.

## Measured

Probe: `tests/probe/life.probe.ts` (default world; 30,000 ticks unless said; every number is a mean over the seeds listed).

**The first flip failed, and the cause was breeding, not the eggs.** With the life cycle on at the old breeding numbers, 2 of 8 worlds went extinct and the mean population fell from 55 (control, life cycle off, 4 seeds) to 24. 98 to 99 percent of eggs hatched, so the mechanism worked; half the creatures were the wrong sex and a pair is rarer. One lever at a time, on seeds 1, 3, 5, 7: search radius 50 to 75 alone (1 of 4 extinct, mean 29), mating signal 250 to 350 alone (2 of 4, mean 23), cooldown 45 to 30 alone (0 of 4, mean 41, lowest 7), all three (0 of 4, mean 51, lowest 19). On the other four seeds all three gave 53, lowest 17.

**Then the other two parts, same method.** Ageing at hazard 0.04 plus mate choice cost a world (1 of 8 extinct); a lighter ageing (hazard 0.02, metabolism +30 percent, speed -20 percent, fertility cost +30 percent) did not. Mate choice at the first tastes (choosiness 0.3) turned nobody down (0.0 percent of attempts): it was a switch that did nothing, so the founders' tastes are 0.8 and 0.5, which turns down 12 to 28 percent of the attempts that found a partner. On the fragile seeds (3, 5, 6, 7, 8) lowering `minEnergy` from 75 to 65 was the best lever (mean 49, lowest 21, against 42 and lowest 5), while shorter incubation (5 s and 10 s) and still wider search radii did not help (one world died with the wider radii).

**The shipped default** (breeding: `minEnergy` 65, `cooldown` 30, search radius 75, mating signal 350; ageing light; mate choice 0.8 and 0.5 with threshold 0.4 and search cost 0.2):

| 16 seeds x 30,000 ticks                    | result           | stated bar          |
| ------------------------------------------ | ---------------- | ------------------- |
| extinct worlds                             | 0                | none                |
| mean population (per 4 seeds)              | 48 to 53         | 35 to 70            |
| lowest population                          | 16 to 21         | at least 10         |
| starved share of deaths                    | 60 to 64 percent | 35 to 70 percent    |
| old age share of deaths                    | about 35 percent | (was about 0)       |
| eggs that hatched                          | 98 to 99 percent | at least 70 percent |
| worlds with a jaw lineage alive at the end | 7 of 16          | reported            |

| 8 seeds x 100,000 ticks (including 3246115366) | result                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| extinct worlds                                 | 0                                                                                                            |
| mean population                                | 55 (lowest 19 to 25)                                                                                         |
| starved share of deaths                        | 61 to 70 percent; old age 28 to 31 percent                                                                   |
| eggs laid and hatched per world                | about 3,300 laid; 92 to 99 percent hatched                                                                   |
| clutches lost with a mother                    | 94 to 124 per world                                                                                          |
| eggs eaten per world                           | 7, 11, 67 and 263 (by pair of seeds); seed 1 about 500                                                       |
| jaw lineage alive at 100,000                   | **4 of 8 worlds** (seed 1: 40 of 41 creatures; seed 5: 13; seeds 2 and 6: 1 each); it was 1 or 2 of 8 before |
| tastes at the end                              | choosiness 0.73 to 0.88, preference 0.50 to 0.55                                                             |
| ticks per second                               | 450 to 510 with four runs in parallel; the control was 509                                                   |

**What it says about carnivory, said plainly.** Eggs are a second, stationary meat source, and jaw lineages persist in twice as many worlds (4 of 8, from 1 or 2). They do so in a way nobody asked for: in seed 1 the jaws fed on eggs (about 500 eaten) and are **40 of the 41 creatures at 100,000 ticks, a jaw monoculture**; the owner's earlier bar (jaws never above 40 percent of a population) is broken in that world and held in the other seven. This is reported, not required for the feature, and it is a pointer to the next lever (a jaw that also grazes, which the owner already named: multiple mouths).

**Gates.** Every default-world statistical gate was run (all 17 determinism files and the unit suites) and two Phase 3 pins moved only because mate choice added two genes and so shifted every later mutation draw: the extinction tick of the scarce world (seed 6, 19,582 to 27,182) and the population band of seed 1 (back half 25 to 46 to 55 to 89; seeds 2 to 6 stay at 25 to 48), re-pinned with those measurements. All 50 older golden entries now say what they were measured with (one sex, an instant birth, the old breeding numbers, ageing off) and reproduce their old hashes exactly; three new entries pin the new default.

## Limits, said plainly

- **Mate choice rarely decides anything here.** Most attempts fail because no ready creature of the other sex is in reach (the 99.8 percent of ADR 0005 is still the headline), so mutual acceptance only matters when a candidate is found. Tastes stay near where they start: there is no direct payoff for a choosy creature (the offspring's energy comes from a fixed investment), only the indirect one that a mate with spare energy has been a better forager. The mechanism is real and tested; its effect on the world is small and reported as measured, not claimed.
- **Guarding is only as good as the brain's wiring.** It reuses the home inputs so no weights change; a parent returns to its egg because the innate prior steers toward `home`, and the reflex controller does not guard at all (it has no home sense).
- **Eggs add an energy-rich stationary target, but jaws are rare**, so egg predation is a few eggs a world (reported). Whether eggs help carnivory persist is reported below, not assumed.
- Litter size is still 1; clutch size is a candidate gene for later.
- The life cycle changes the population dynamics enough that **every statistical gate that measures the default world was re-measured** and re-pinned with its measurement (listed in the PR), never by loosening what it asserts.
