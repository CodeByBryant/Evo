# ADR 0029: Mouths on tails, part stacking, and why the default did not change

Status: accepted. Follows [ADR 0016](0016-part-stats-and-attachment.md) (stats, anchoring, part parents), [ADR 0017](0017-feeding.md) (bites) and [ADR 0028](0028-omnivore-founders.md) (omnivores). Three config switches are added, all off, so no hash or golden changes: the 55 golden tests and the 1,382 unit tests pass unchanged.

## Why

The owner ran seed 4120846439 (balanced) for 220,000 ticks and reported that **omnivores had taken over by attaching their mouths to flagella attached to flagella**, and earlier that "organisms with multiple stomachs dominate". Two questions, both measured.

## Mouths on tails: what the code does

A part with a part parent sits at `parent.x + axis x offset x parent.extent` (`development/develop.ts`). A flagellum's extent is its `length` stat, 0.5 to 2.5 body radii, so a mouth on a flagellum tip, or on a flagellum hung on a flagellum, sits 2 to 5 radii from the centre. `mouthsOf` takes that point and `InteractionSystem.updateBites` bites from there, with the bite reach centred on it. Nothing caps the distance, prices the lever arm, or follows the tail's animation. ADR 0016 wrote this on purpose (a child hangs from any parent); it is a design hole, not a coding bug.

## Measured: it is real

`tests/probe/mouth-limb.probe.ts` classes every body once: `body` (every working mouth on the body) or `limb` (a mouth hangs from another part).

| Seed 4120846439, default world | limb-mouth bodies | omnivores | farthest mouth (radii) |
| ------------------------------ | ----------------- | --------- | ---------------------- |
| 100,000 ticks                  | 1 of 75           | 0         | 2.3                    |
| 155,000                        | 2 of 59           | 0         | 1.8                    |
| 160,000                        | 11 of 48          | 0         | 1.9                    |
| 175,000                        | 17 of 26          | 8         | 2.9                    |
| 190,000                        | 25 of 25          | 20        | 3.0                    |
| 220,000                        | **27 of 27**      | **27**    | 2.9                    |

A body mouth sits at about 1.0 radii. The lineage sat at 1 or 2 creatures for 100,000 ticks, then swept in about 30,000. Limb bodies bred 1.6 against 1.3 matings per 1,000 creature-ticks (+23 percent) at the same lifespan (163 s), and took 11 percent of their intake as flesh against 1 percent. The chain was depth 2 (flagellum, flagellum, mouth). An eye also rides tails (the owner's second screenshot).

It is not universal: in 8 default worlds at 220,000 ticks it showed up strongly in one more (seed 4: 60 percent of bodies at the peak, 30 of 50 at the end) and weakly in two (seeds 5 and 7, 21 to 24 percent at the peak); the other four stayed under 12 percent. One of the eight worlds was extinct by 220,000.

## Three levers, all off (`anatomy.effects`)

- `maxMouthOffset` (body radii, 0 = off): clamp the bite point of a mouth to this distance, keeping its direction (`organisms/mouths.ts`).
- `carrierParentsOnly` (0 or 1): a part can hang only from a carrier (`CARRIER_PART_TYPES`: eyestalk, skeleton, join); a part hung on a flagellum or cilia attaches to the body (`development/develop.ts`).
- `limbUpkeep` (per second per unit size per radius beyond the centre, 0 = off): a part hung on another part pays for its lever arm (`development/capabilities.ts`).

Founder and starters are exactly unchanged by any of them, with one recorded exception: the scout's eye hangs from an eyestalk, so it would pay `limbUpkeep`.

## Measured: which lever works

On the sweep seeds (220,000 ticks, one world per cell, so single trajectories):

| Arm                  | Seed 4120846439                | Seed 4      | Seed 5                              | Seed 6          |
| -------------------- | ------------------------------ | ----------- | ----------------------------------- | --------------- |
| control              | 100% of bodies, all omnivores  | peak 60%    | peak 24%                            | peak 8%         |
| `maxMouthOffset` 1.2 | **still 100%** (63% at 135k)   |             |                                     |                 |
| `limbUpkeep` 0.02    | peak 7%                        | peak 16%    | **peak 100%** (20 of 55 at the end) | peak 52%        |
| `limbUpkeep` 0.05    | peak 51%                       | peak 11%    | peak 11%                            | died out by 35k |
| `limbUpkeep` 0.1     | peak 29% (16 of 80 at the end) | peak 29%    | peak 21%                            | peak 5%         |
| `carrierParentsOnly` | peak 8%, none at the end       | **extinct** | none                                | none            |

- **The cap alone fails.** With the bite pulled to 1.2 radii the limb lineage still takes over on the owner's seed (farthest limb mouth about 1.4, short tails), so the advantage is not only reach.
- **The price is unreliable.** It stops the owner's seed at 0.02 but not seeds 5 and 6, and at 0.1 limbs still reach 20 to 30 percent.
- **Carriers-only is the only one that removes it everywhere** (limb mouths in 0 of 8 worlds, 8 seeds at 220,000), and it **costs viability**: 8 seeds x 100,000 ticks, 1 extinct (seed 4, the world where tail mouths had been the survivors) against 0 for the default, mean population 54.4 against 55.5, part types alive 10.8 against 11.2, distinct part lists 22.1 against 26.7 (83 percent); at 220,000, 2 of 8 extinct (seeds 4 and 8) against 1 of 8 for the default (seed 1). Small numbers, but it fails the bar set before the run (no extinct world).
- **A direct test** (a founder group of 40 percent grazers with the mouth on a long tail at the nose, 8 seeds x 30,000 ticks, `LIMB_TAILER`): limb bodies grew from 15 to 26 percent of the living in the control (three worlds above 30 percent), and stayed at 14 percent with the cap and 12 percent with `limbUpkeep` 0.02; with the tail pointing backwards they died out (20 to 2 percent). The arm itself is fragile (several worlds went extinct from the 50 percent of founders changed), so it is a direction, not a number.

## Measured: part stacking (the multi-stomach claim)

`tests/probe/stacking.probe.ts` (pure arithmetic): the capability of the founder with 0 to 6 copies of each of the 16 part types. Stacking is **linear and unbounded** for stomach (+0.33 energy capacity, +0.2 absorption, +0.17 digestion per copy), intestine, mouth (a second mouth doubles bite size and bite rate), lipid, mender, membrane, gyro and sniffer; it saturates for eye range (`sqrt`), armor (`1/(1+x)`), toxin tolerance and the pheromone signal (capped). The brake is speed: each stomach costs 5 to 8 percent, and upkeep is tiny.

`tests/probe/parts-audit.probe.ts` (default world): the share of living bodies with 0, 1, 2 and 3 or more working copies of each type, fitness by copy count, and a comparison matched on total working part count (the confound is that a body with more of everything is just bigger). At 30,000 ticks (16 seeds) copies are rare: stomach 2 or more in 6 percent of bodies, mouth 4, everything else about 0. At 100,000 ticks (8 seeds) stomach 2 or more is at least 40 percent of bodies in 2 of 8 worlds and mouth in 3 of 8, **with no matched edge**: bodies with 2 or more stomachs breed x0.90 to 1.08 and live x0.90 to 1.01 against one stomach with the same part count. That is drift, not selection. **No diminishing-returns mechanism is justified**, and none was built.

## Decision

By the bar stated before the numbers (the exploit gone **and** no extinct world, variety at least 80 percent of the control), **no lever qualifies**: the cap and the price do not remove it, and the one that does costs worlds. So **the default world is unchanged**, the three switches ship off, and the evidence is recorded. A longer-term answer is a different design, not a bigger number: for example a mouth that can only hang from a carrier but with carriers that exist early (so the reach adaptation is still reachable), or pricing reach in the food model; that is a decision for the owner.

## Limits, said plainly

- One world per cell at 220,000 ticks: a sweep of 8 seeds says how often the exploit shows up (about 1 in 8 strongly) and whether a lever removes it, not by how much.
- The tail mouth is plausibly a real adaptation to a food-scarce world (carriers-only killed the one world where it had been the survivor). Whether a tail mouth is a quirk or a feature is a design call.
- The bite point is clamped but the picture is not: with `maxMouthOffset` on, a tail mouth is drawn at the tip and bites nearer the body.
- Probes: 220,000 ticks is about 8 minutes of one core; see `docs/development.md` for budgets.

**Update:** [ADR 0030](0030-limb-efficiency.md) tried the owner's idea of making attached parts much less efficient (`limbEfficiency`): 0.25 stops the takeover on all four seeds and loses no world, and is now the default.
