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

RESULTS

## Limits, said plainly

- **Mate choice rarely decides anything here.** Most attempts fail because no ready creature of the other sex is in reach (the 99.8 percent of ADR 0005 is still the headline), so mutual acceptance only matters when a candidate is found. Tastes stay near where they start: there is no direct payoff for a choosy creature (the offspring's energy comes from a fixed investment), only the indirect one that a mate with spare energy has been a better forager. The mechanism is real and tested; its effect on the world is small and reported as measured, not claimed.
- **Guarding is only as good as the brain's wiring.** It reuses the home inputs so no weights change; a parent returns to its egg because the innate prior steers toward `home`, and the reflex controller does not guard at all (it has no home sense).
- **Eggs add an energy-rich stationary target, but jaws are rare**, so egg predation is a few eggs a world (reported). Whether eggs help carnivory persist is reported below, not assumed.
- Litter size is still 1; clutch size is a candidate gene for later.
- The life cycle changes the population dynamics enough that **every statistical gate that measures the default world was re-measured** and re-pinned with its measurement (listed in the PR), never by loosening what it asserts.
