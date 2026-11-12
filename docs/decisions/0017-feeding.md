# ADR 0017: Feeding: bites, food health and digestion

Status: accepted. Builds on [ADR 0016](0016-part-stats-and-attachment.md) (mouth anchors, per-type stats) and changes how [ADR 0005](0005-continuous-organism-ecology.md)'s interaction step works.

## Why

Eating was the simplest thing the engine could do: any organism whose body circle overlapped food removed the **whole** item in one tick and was credited its energy at once. Three consequences, all visible to the owner:

1. **Bumping is eating.** A creature that brushed food with its flank or its back ate it. Mouths and eyes were decoration for the purposes of feeding.
2. **Food has no health.** One touch ended an item however big it was, so food could not be shared, defended, left half-eaten or depleted over time.
3. **Digestion did not exist.** Energy arrived instantly, so intestines and stomachs only scaled a number. And 35 to 58 percent of the food energy was **wasted** (the Step 2 probe): a full creature still destroyed the whole item, crediting only what fitted under its capacity.

## Decision

With `feeding.enabled` (the default) organisms **bite**.

- **Mouth hitbox, not body hitbox.** The bite point is the mouth part's anchor (from development, ADR 0016) turned by the heading. Food is biteable when it is within `biteRadius * body radius * reach` of that point (plus the food's own radius) **and** inside a forward cone (`biteCone`, a half-angle) around the way the mouth points from the body's centre, **and** the organism intends to interact. A body with no working mouth cannot bite at all. Flank or rear contact never eats.
- **Food has health.** `ResourceState.remaining` was always there (and hashed); it now falls bite by bite. A bite takes `min(remaining, biteSize * biteSize factor / kind.hardness, room in the gut / yield)`. The item stays on the ground until its last bite, when one `resource-consumed` is emitted. Kinds have a `hardness` (default 1; fungus 1.5, nectar 0.6): harder food takes smaller bites, so more of them.
- **Bites are paced.** A bite starts a cooldown (`biteInterval / bite-rate factor`, hashed per organism as `biteCooldown`). While it runs the creature **chews**: movement is multiplied by `chewSlow`. Without this a creature bites once, keeps moving and leaves a trail of half-eaten food (measured: 105 bites but 3 finished items in 12,000 ticks).
- **A gut.** The chunk times the mouth form's yield for that kind goes into a hashed per-organism `gut`. A new `DigestionSystem` (after interaction) moves up to `absorption * absorption factor * dt` of it into energy per tick, never beyond the room left in the body. Gut capacity scales with body size and stomachs; the absorption rate with intestines (`absorption`, `length`) and stomachs (`throughput`). A gut with room for less than half a bite refuses it, which stops a full creature dribbling crumbs (measured: 419 crumb bites before that rule) and leaves food on the ground for others instead of destroying it.
- **Toxins** are applied per bite, in proportion to the chunk's share of the item, so a whole toxic item still adds up to its old damage.
- **Mouth forms and diet** (the 3b diet design, folded in): the mouth gets two more stats, `form` and `rate`. `form` picks from an ordered axis **sprout, proboscis, mandible, radula, jaw** (`floor(gene * 5)`, so mutation drifts between neighbours and the founder's middle value is the **mandible**, the generalist). `anatomy.mouthForms` gives each form's energy yield per food kind; the mandible is exactly 1 on everything (validated), so the founder is the neutral reference. Specialists beat it on their own food and lose on the rest; the jaw is a carnivore's and poor on every plant, a dead end until predation exists. Yields are absolute, not relative to the configured founder.
- **Mouth `rate`** (bite speed) is priced into the mouth's upkeep, so faster biting costs energy.

`feeding.enabled: false` runs the original instant-eating code path unchanged. The Classic preset uses it, and two golden entries pin it.

## Verification

- **Equivalence with feeding off:** the harness against the previous commit (#114 head) gave 17 of 17 identical scenarios (every preset, both controllers, clusters, verbose events) with anatomy mutation frozen. With mutation on, 4 of 17 differ, because the mouth's `rate` stat is now live (it prices upkeep) where it used to be inert: the intended change.
- **Hash schema 10:** two values per organism (`gut`, `biteCooldown`) after `health`. All goldens regenerated (22 entries, two new ones pinning feeding off). Header and sample vectors cross-checked with the independent Python hasher.
- **Tests** (`tests/feeding/bites.test.ts`, 20 tests, with negatives; the cone check was mutation-tested): front vs behind vs beside, reach, intent, turning, three-bite items, hardness, cooldown spacing, full gut, absorption bounded by rate and by room, mouthless bodies, form yields, toxins summing to the old damage, chewing, feeding off.

## What it did to the ecology (8 seeds, 20,000 ticks, `pnpm --filter @evo/simulation probe`)

| preset                         | pop mean (before, feeding off) | pop mean (bites) | starved share (before, bites) | energy wasted (before, bites) |
| ------------------------------ | ------------------------------ | ---------------- | ----------------------------- | ----------------------------- |
| balanced                       | 26.9                           | 56.3             | 91.1%, 92.1%                  | 55%, 0%                       |
| harsh                          | 24.3                           | 53.5             | 90.1%, 90.5%                  | 57%, 0%                       |
| lush                           | 53.6                           | 92.1             | 91.0%, 91.6%                  | 45%, 0%                       |
| classic (control, feeding off) | 35.2                           | 34.5             | 91.3%, 91.0%                  | 35%, 37%                      |

Stated plainly: **waste is gone and populations doubled, but the starved share of deaths did not move (about 91 percent)**. Food energy was being destroyed, which capped populations, but it was not what makes nearly every death a starvation. The Step 2 finding stands: that share is structural and insensitive to food supply, so the lever is births (investment, cooldown, juveniles that starve before they mature), not food. That is Step 4, now on bodies that eat properly.

Knock-on effects, each re-pinned with its measurement: the no-ecology bands and scenario pins that describe Phase 3 behaviour now run with `feeding.enabled: false`; the species gates moved because species follow births (seeds 1 to 4 at 30,000 ticks: 106, 163, 125 and 130 species, against 36, 22, 17 and 46; at most 33 to 38 alive at once, against 8 to 12), so their bounds are now 220 and 50 until the species threshold is re-tuned with the ecology.

## Not here

- A brain input for gut fullness (the body gates waste by itself; the input belongs with the new-senses work).
- Body-versus-body hitboxes; the same bite geometry is reused when predation lands.
- Final numbers: `biteRadius`, `biteCone`, `biteSize`, `biteInterval`, `gutCapacity`, `absorption`, `chewSlow`, hardness and the form yields are provisional and tuned in the starvation work.

## Addendum: the jaw has prey (ADR 0023)

The jaw was a dead end "until predation exists". With `predation.enabled` a jaw bites creatures (flesh yield 1) and eats carcasses best (1.2); every other form yields nothing from a living creature. See [ADR 0023](0023-predation.md).
