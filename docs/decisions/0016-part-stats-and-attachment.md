# ADR 0016: Per-type part stats, outline anchoring and part parents

Status: accepted. Refines [ADR 0012](0012-anatomy.md) and [ADR 0015](0015-anatomy-consequences.md) and brings the engine back toward the vision of [ADR 0004](0004-dynamic-evolvable-anatomy-and-morphology.md).

## Why

ADR 0012 reduced a part to `size` plus one generic `param` that most types ignored, and dropped the connections between parts. ADR 0004 (sections 4, 5, 9, 11, 17) asked for the opposite: every part type has several unique parameters (a flagellum has length, thickness, force and efficiency; an eye has range, resolution and field of view; armor has thickness, coverage and hardness) and parts relate to each other (a part has a parent). Two bugs followed from the shortcut:

1. **Parts floated off the body.** Development placed a part at `offset * (cos, sin)` of the _unit_ circle and never looked at the evolved outline. The founder's mouth and cilia (offset 1) landed at 0.70 to 0.88 of the rim, so they were drawn off to the side of the body, and the renderer papered over it with a "nearest vertex" fallback.
2. **Parts were interchangeable.** Six of the ten types read only `size`, so two flagella with different genes differed in nothing but size.

## Decision

### Slot genes

A slot is 14 genes (was 9): `present`, `type`, `parent`, `size`, `angle`, `offset`, `orientation`, `integrity`, `s0..s5`. The body vector is 203 genes (12 slots x 14 + pattern, accent hue, outline count, 16 radii, 16 angles); `param` is gone.

- **Stats `s0..s5`** are six genes in `[0, 1]`. Each part type has a **stat table** (`PART_STATS`) that names up to six of them and gives each a real-unit range; unused entries stay inert, like the latent genes of an empty slot. A fixed-width block (not variable-length tables) keeps the random draws per birth constant, so adding or reordering a table never shifts later draws.
- `statValue(spec, gene) = min + gene * (max - min)`. The engine multiplies capabilities by `statMultiplier(gene) = 0.5 + gene`, so the founder (all stats 0.5) is exactly 1.
- **`integrity`** (0.1 to 1) scales the capability a part delivers but not its mass or upkeep. A deformed or vestigial part keeps costing and delivers less, which makes non-functional attachments evolvable (used by the failure-state work later).
- **`parent`** (integer 0 to 12): 0 is the body, `k` is slot `k - 1`. It must name a lower, developed slot; otherwise the part falls back to the body.

| Type      | Stats                                |
| --------- | ------------------------------------ |
| flagellum | length, thickness, force, efficiency |
| cilia     | length, density, rate                |
| eye       | range, resolution, field of view     |
| sniffer   | range, sensitivity, selectivity      |
| mouth     | reach, gape                          |
| intestine | length, absorption, filter           |
| stomach   | capacity, throughput                 |
| armor     | thickness, coverage, hardness        |
| membrane  | insulation, thickness                |
| mender    | rate, efficiency                     |

The tables are provisional coefficients; the field of view is stored and displayed here and acts from the addendum "Directional vision".

### Attachment

Development anchors every part to the actual outline (`rimAt(outline, angle)` returns the rim point and outward normal by ray-polygon intersection):

- **Surface types** (flagellum, cilia, sniffer, mouth, armor, membrane) sit exactly on the rim at `angle`.
- **Interior types** (eye, intestine, stomach, mender) sit at `offset` times the rim radius at that angle, so never outside the body.
- `orientation` is relative to the anchor's outward normal. A flagellum or cilium pushes along `-axis`, so a tail trails behind where it is rooted.
- **A child** (non-zero `parent`) is anchored along its parent's axis at `offset` times the parent's extent (`PART_EXTENT_STAT`: the `length` stat of flagella and cilia times the outline's area radius; every other type has extent 0, so a child of one sits at the parent's anchor); its orientation is relative to the parent's axis.
- A child of a dormant parent is dormant: parent dependencies propagate through the same fixed-point resolver as capability tokens.

Development outputs per part: anchor (`x`, `y`), `axis`, tip (`tipX`, `tipY`), resolved stat values, parent, integrity, mass, upkeep, functional or dormant.

### Capabilities

`capabilitiesOf` reads each type's stats instead of `param`: thrust from `size * integrity * force * ...` at the part's anchor and axis, torque from its lever arm, eye acuity from resolution, armor from thickness x coverage x hardness, and so on. Mass and upkeep per part scale with the same dimensions (a longer, thicker flagellum weighs and costs more) so there is no free lunch. The founder-relative factors stay, and the founder is exactly 1: the same expression is divided by itself.

The founder plan was re-derived so its parts sit on the founder outline with the old thrust directions (flagella orientations 1.0223 and 5.2609, cilia 6.1576 and 0.1256 relative to the outward normal).

### Hash and versions

`Genome.version` 3 to 4, state hash schema 8 to 9, every golden regenerated once (20 entries, engine 0.10.0). Hash test vectors were cross-checked with an independent Python hasher (docs/simulation/determinism.md, Version 9).

### Mutation

`anatomy.mutation.parentRate` (default 0.004) mutates the parent gene as an integer, as rare as presence and type changes; stats, integrity and placement share the continuous rate.

## What the equivalence harness showed

With anatomy off the **field** layout is bit-identical to the previous commit in every scenario (founder factors are exactly 1 and the founder body is still the founder body). **Cluster** scenarios differ even with anatomy off, on purpose: cluster founders have varied outlines, and parts now follow the outline, so their thrust directions and masses differ from the old unit-circle placement. That is the bug fix, not drift.

## Consequences

- Bodies read as bodies: parts touch the rim, tails start where they are rooted, children hang off their parents.
- Several existing pins moved (scenario A in `world.test.ts`: 27 active, 45 born, 18 starved; the heavy-mutation stress rate in the long anatomy test was lowered because slots now carry 14 genes). Statistical ecology gates will be re-pinned in the starvation-tuning change, with measurements attached.
- Not in this change, in order: new part types (eyestalk, gyro, lipid, pheromone gland, skeleton, join) and mouth forms (both came later, see the addendum); directional eye field of view (it came later, see the second addendum); renderer and inspector for anchors, stats and parents.

## Addendum: six more part types

The `type` gene grows from 10 to 16 values; the six new types are **appended** so every earlier index and the founder stay put. Each ties to a mechanic that already exists, and none needs predation. Their numbers are `anatomy.effects` and the usual per-type `parts` entries, all provisional.

| Type        | Stats               | What it does                                                                                                                                                                                                                         |
| ----------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eyestalk`  | length, stiffness   | an eye whose parent is a working eyestalk has its range multiplied by `1 + eyestalkLift * m(length)`; the eye hangs at the stalk's tip (a child anchors at `offset` along its parent's axis, and the stalk's extent is its `length`) |
| `gyro`      | stability           | adds `gyroTorque * m(stability)` of torque and no thrust: turning without a push, for upkeep and mass                                                                                                                                |
| `lipid`     | reserve             | requires `digestion`; adds `lipidCapacity * m(reserve)` of energy capacity; its mass scales with the reserve, so a fat body is slower (through thrust over mass)                                                                     |
| `pheromone` | potency             | widens the signal a creature is heard by: a searcher finds a ready partner out to `mateSenseRadius * mateSignal` of the **partner**, capped at `pheromoneCap`; a gland on the searcher changes nothing                               |
| `skeleton`  | rigidity, length    | raises the structural budget by `skeletonBudget * m(rigidity)` **for the slots after it** (development admits parts in slot order); a part before it gets no benefit. It has a length so children can hang along it                  |
| `join`      | length, flexibility | a plain connector: its only effect is that parts can hang from it in chains, for mass and a little upkeep                                                                                                                            |

Decisions worth stating:

- **No `mount` token.** The first plan had the carriers provide a capability token, but nothing would require it: a child already works only when its parent does (development), so the token would have been noise. `lipid` is the only new part with a requirement (`digestion`).
- `Anatomy.budget` reports the budget a body actually had (the configured one plus its skeletons'); `sizeUsed <= budget` is the invariant, not `sizeUsed <= structuralBudget`.
- The mating-signal search reaches `pheromoneCap` times the baseline when anatomy is on and each candidate is held to its own signal; with no glands every signal is exactly the baseline, so a body without one searches exactly as before.
- **Hash and goldens:** the gene layout is unchanged (14 genes per slot), only the `type` gene's maximum moves from 9 to 15. All 24 golden tests pass unchanged, and the equivalence harness against the previous commit gives 17 of 17 identical scenarios with anatomy mutation frozen.

## Addendum: directional vision

The eye's `fieldOfView` stat (0.5 to 6.28 rad) now acts. Until now a body saw a circle of radius `sensorRadius * senseRange` whatever its eyes' orientation; now each working eye sees a cone about its axis and perception is filtered by it.

- **Cones.** `capabilitiesOf` gives each working eye a cone `{ axis (body frame), cosHalf, reach }`, and the body an all-round touch radius (`anatomy.senseFloor`); `CapabilityFactors.vision` carries them relative to the founder's sense range. A target is inside a cone when `dot(offset, axis) >= distance * cos(half)`, with the axis rotated by the heading using the angle-sum identities, so there is no inverse trigonometry and nothing is drawn from a random stream.
- **Range for angle.** An eye reaches the body's sense range times `1 + visionNarrowing * (sqrt(6.28 / fov) - 1)` (`anatomy.effects.visionNarrowing`, 0 to 1, default 1): the narrower the cone the further it sees. The sense range itself keeps its square-root law over eyes, so adding an eye still helps with diminishing returns, and the cone only decides where.
- **The founder stays as it was.** The founder's eye now has its field-of-view stat at the maximum (all-round), so a body of all-round eyes (or no eyes) is `omni` and `PerceptionSystem` takes the old circle path unchanged. The equivalence harness against the previous commit gave 19 of 19 identical scenarios (default, scarce, rich, small and big worlds, short sensor, reflex, anatomy off, clusters, frozen body), run for 3,000 ticks with mutation off and compared through normalized snapshots, resources and metrics every 5 ticks.
- **What is and is not vision.** Food, other organisms (the peer sense) and hazards go through the cones; the mating signal and the home sense do not. Sniffers are omnidirectional. A hazard is tested by the bearing of its centre against the reach to its edge.
- **Goldens.** The founder body vector changed (one stat gene, 0.5 to 1), and body genes are hashed, so every golden with anatomy on regenerates even though the dynamics are identical (the 6 anatomy-off entries are unchanged). No schema or genome-version change: no gene was added.
- **Consequence to watch.** The founder sits at the ceiling, so evolution can only narrow the cone and gets reach for it. Whether bodies drift toward narrow eyes (and what the preset populations do) is measured in the change's probe and recorded in the PR.
