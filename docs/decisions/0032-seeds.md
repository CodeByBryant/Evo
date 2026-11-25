# ADR 0032: Seeds, a food that plants drop, are on; germination is built and off

Status: accepted. Follows [ADR 0021](0021-food-overhaul.md) (renewable plants), [ADR 0026](0026-diets.md) (what a mouth eats) and [ADR 0031](0031-scavenger-mouth.md) (a carrion niche is too thin, "a food that is not a hunt" is what could change that). Config only, no hash schema change; the new default moves every world with plants and food kinds, so the golden entries that describe older worlds pin `resources.seeds.enabled: false` and three new entries pin the default.

## Why

Every older step added a niche by adding a mouth, a part or a rule. The owner's list (2026-11-20 and again 2026-11-23) also asked for **food types**: more kinds of food, not only more ways to eat. A plant that is full and untouched wastes whatever it photosynthesizes at its cap (ADR 0021), so a **seed** is a free food: the plant drops what it would waste. This ADR measures whether that is worth having, and whether seeds that also grow into plants (the owner's first design) are.

## The mechanism

`resources.seeds` (config; `withSeeds` appends a `seed` kind to the effective config exactly as `withCarrion` does for carcasses, after every other kind so carrion keeps its index and the colours and probes that count from the end are unchanged):

- **Drop.** A hub with a full store and every node grown drops a seed every `interval` (20 s) of its age, if seeds are below `maxCount` (60) and the hub keeps its reserve: `energy` (20) moves **out of the hub's store** into a small seed item a way off (8 to 40 units, direction and distance from a hash of the hub and the tick, nothing drawn; a landing inside an obstacle that blocks movement skips the drop). Energy is conserved: the seed's energy is the hub's loss. Grazed plants drop little, untouched ones most.
- **Eat.** The kind is hard (`hardness` 3, three times the bites of grass, so a wide gape pays) and each mouth form has a yield: mandible exactly 1 (the founder and every starter eat it), radula 1.3, sprout 0.5, proboscis 0.2, jaw 0, scavenger 0. It is an **added** food: no form loses anything it eats now. Sniffers map their selectivity over the natural kinds only (seed ignored like carrion), so no sniffer body changes meaning.
- **Germinate (built, off).** With `germinate`, a seed past its `dormancy` that is not eaten becomes a whole plant where it lies, paid for from the spawn budget (one due free spawn), if the food pattern is dense enough there, plants are below their cap and the site is clear; `germinateShare` is the share of due spawns a seed may take. Else it rots at its `lifespan`. All draw-free.
- Seeds have their own cap and are not counted in `resources.maxCount`; no hashed code changed (a seed is an ordinary resource: `id, x, y, remaining, kind, bornTick`), so there is no schema bump and the new counters (`World.seedStats`: dropped, germinated, rotted, alive) are a probe's view, not state.

## Measured

Probe: `tests/probe/seeds.probe.ts`. Control is the default world with seeds off.

**Food only (no germination), 16 seeds x 30,000 ticks:** extinct 0 against 0; mean population **57.1 against 51.7**; starved share of deaths 62 against 62 percent; mean distinct part lists at the end **31.1 against 20.9**; mouth forms alive at the end **2.4 against 1.8**; seeds are 3 to 40 percent of the plant-class intake in 12 of 16 worlds (2 to 10 percent in all). **8 seeds x 100,000 ticks (3246115366 included):** extinct 0 against 0; mean population **61.3 against 53.5**; lowest population **17 against 7**; starved 68 against 68 percent; part lists 33.2 against 31.2; mouth forms **3.4 against 2.4**; seeds 3 to 40 percent of plant intake in 7 of 8 worlds (2 percent in the eighth). Who eats them: mandibles, and by form radula, sprout and proboscis in the worlds where those forms live, so the new food is spread over the forms rather than owned by one.

**Germination, 8 seeds x 30,000 ticks first, then 16:**

| arm                                                 | extinct worlds | mean population                       |
| --------------------------------------------------- | -------------- | ------------------------------------- |
| food only (germination off)                         | 0 of 8         | 57                                    |
| germinate, share 0.25                               | 1 of 8         | 50 (3 of 16 lost over 16 seeds, 45.5) |
| germinate, share 0.5                                | 2 of 8         | 37                                    |
| germinate, share 1.0 (a seed takes every due spawn) | 7 of 8         | 24                                    |
| germinate, share 1.0, every 10 s                    | 8 of 8         | 15                                    |

Germination first made a cheap, empty plant (20 energy) that filled the 60-plant cap and locked the 198-energy free spawns out (7 of 8 worlds lost); making a germinated seed a whole plant paid for from the spawn budget did not fix it (still 7 of 8 at share 1.0), and every share above 0 costs worlds. The clumpiness of the food field rises with the seed-born share (coefficient of variation per 50 x 50 cell about 2.6 in the control, 3 to 6 with germination), which is consistent with plants only ever appearing next to plants, but I did not isolate the cause. It is recorded, not explained.

## The bar, against the numbers

Stated before the numbers (plan, 2026-11-23): no extinct world, mean population 35 to 70 and lowest at least 10, starved share 35 to 70, seeds 3 to 40 percent of plant intake in at least 7 of 8 worlds, part types and lists at least the control's, at least two mouth forms alive in 90 percent of worlds, **and a closed loop** (at least 10 percent of new plants from seeds). Food only meets every number but the last; with germination the loop closes (45 to 90 percent of new plants) and the viability bar fails. **Owner's decision (2026-11-23): flip food-only on.** So `seeds.enabled` is true and `germinate` is false by default; the germination switch stays with its numbers, for a design that avoids what it costs (sparser dispersal, a different landing rule).

## Limits

- Single trajectories per cell at 100,000 ticks; the world and food tuning are unchanged, so the +15 percent population is the captured surplus (about 0.4 seed a second at 20 energy), not a retuned supply.
- Seeds raise supply a little; the starved share did not move, so the control's balance of births and starvation is unchanged.
- The germination failure is measured, not diagnosed (above).
