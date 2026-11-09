# Anatomy

How an organism's body works. The decisions are in [ADR 0012](../decisions/0012-anatomy.md) and [ADR 0016](../decisions/0016-part-stats-and-attachment.md) (the vision is [ADR 0004](../decisions/0004-dynamic-evolvable-anatomy-and-morphology.md)); the genes are in [genome.md](../genetics/genome.md). Status: **the parts act** (ADR 0015): every system multiplies a quantity it already used by the body's founder-relative factor, and speed, turning, sensing and movement cost no longer have genes of their own.

```text
genome.body (203 genes)  ->  developAnatomy()  ->  Anatomy  ->  capabilitiesOf()  ->  Capabilities
                              pure, no randomness                                      |
                                                                    capabilityFactors() against the founder
```

## The outline

Every creature has a silhouette of `n` points, 5 to 16 ([ADR 0013](../decisions/0013-creature-bodies.md)). `developOutline(body)` turns the outline genes into a closed polygon: sector `i` of `n` holds point `i`, at its `radius` gene and at an angle inside the sector set by its `angle` gene, so the polygon never crosses itself. It reports the area, the area-equivalent radius, the perimeter and the roughness (`perimeter / (2 pi areaRadius)`).

Two things follow from the outline, both measured against the founder outline and both exactly 1 for it:

- **Size**: effective body radius = the `radius` gene * `areaRadius / founderAreaRadius`. It feeds energy capacity, basal cost, health, eating reach and the drawn size.
- **Drag**: movement and turning energy * `max(0.25, 1 + outlineDrag * (roughness - founderRoughness))`: spiky bodies pay more to move.

The renderer draws the outline as a smooth closed curve through the points, with eyes at the front and a pattern in the accent color. The "Evolving bodies" preset turns `anatomy.enabled` on so outlines evolve.

## The sixteen parts

The first ten are the original parts; the last six (eyestalk, gyro, lipid, pheromone, skeleton, join) were appended to the `type` gene so earlier indices and the founder stay put.

A body has 12 slots; each is empty or holds one part. The types are in the order of the `type` gene. Besides `size`, every part carries up to six per-type **stats** (ADR 0016):

| Type        | Stats (in gene order)                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| `flagellum` | length, thickness, force, efficiency                                                                             |
| `cilia`     | length, density, rate                                                                                            |
| `eye`       | range, resolution, field of view (a cone about the eye's axis; narrower reaches further, see Directional vision) |
| `sniffer`   | range, sensitivity, selectivity (which food kind)                                                                |
| `mouth`     | reach, gape, form (sprout, proboscis, mandible, radula, jaw), bite rate                                          |
| `intestine` | length, absorption, filter                                                                                       |
| `stomach`   | capacity, throughput                                                                                             |
| `armor`     | thickness, coverage, hardness                                                                                    |
| `membrane`  | insulation, thickness                                                                                            |
| `mender`    | rate, efficiency                                                                                                 |
| `eyestalk`  | length, stiffness                                                                                                |
| `gyro`      | stability                                                                                                        |
| `lipid`     | reserve                                                                                                          |
| `pheromone` | potency                                                                                                          |
| `skeleton`  | rigidity, length                                                                                                 |
| `join`      | length, flexibility                                                                                              |

| Type        | Feeds                      | Needs       | Provides    | Default mass / upkeep / strength |
| ----------- | -------------------------- | ----------- | ----------- | -------------------------------- |
| `flagellum` | thrust (strong)            | -           | -           | 0.30 / 0.010 / 1.0               |
| `cilia`     | thrust (weak)              | -           | -           | 0.10 / 0.004 / 0.35              |
| `eye`       | sense range                | -           | -           | 0.10 / 0.010 / 1.0               |
| `sniffer`   | food detection             | -           | -           | 0.08 / 0.008 / 1.0               |
| `mouth`     | eating reach               | -           | `intake`    | 0.15 / 0.006 / 1.0               |
| `intestine` | digestion, toxin tolerance | `intake`    | -           | 0.20 / 0.008 / 1.0               |
| `stomach`   | energy capacity            | `intake`    | `digestion` | 0.25 / 0.006 / 1.0               |
| `armor`     | damage resistance          | -           | -           | 0.40 / 0.002 / 1.0               |
| `membrane`  | temperature tolerance      | -           | -           | 0.10 / 0.005 / 1.0               |
| `mender`    | health regeneration        | `digestion` | -           | 0.15 / 0.012 / 1.0               |
| `eyestalk`  | range of a carried eye     | -           | -           | 0.10 / 0.004 / 1.0               |
| `gyro`      | turning without thrust     | -           | -           | 0.15 / 0.010 / 1.0               |
| `lipid`     | energy capacity (heavy)    | `digestion` | -           | 0.35 / 0.002 / 1.0               |
| `pheromone` | mating signal reach        | -           | -           | 0.08 / 0.008 / 1.0               |
| `skeleton`  | structural budget          | -           | -           | 0.30 / 0.002 / 1.0               |
| `join`      | a connector for chains     | -           | -           | 0.05 / 0.001 / 1.0               |

Mass and upkeep are per unit of part `size`. All numbers are provisional config (`anatomy.parts`), to be set by measurement when bodies start to matter.

## Development

`developAnatomy(body, config)` reads the slots in order:

1. a slot with `present = 1` becomes a part;
2. parts are admitted while the running total of `size` stays within `anatomy.structuralBudget` (default 6); a part that would exceed it does **not develop** and its slot is listed as undeveloped, so lower slots win and bodies cannot bloat without limit;
3. each part is **anchored to the outline** (ADR 0016): surface types (flagellum, cilia, sniffer, mouth, armor, membrane) sit on the rim at `angle` (`rimAt`: ray-polygon intersection giving the point and outward normal), interior types (eye, intestine, stomach, mender) at `offset` times the rim radius at that angle; `orientation` is relative to the outward normal. A part with a `parent` gene is anchored along its parent's axis instead (`offset` times the parent's extent) with orientation relative to the parent's axis, and is dormant if its parent is. The part reports anchor, axis, tip, resolved stat values and integrity;
4. dependencies are resolved to a fixed point: a part is **functional** only if every capability token it needs is provided by a functional part. A part with an unmet need is **dormant**: it stays in the body and still costs mass and upkeep, but adds nothing. The resolver is generic over the token table (tests run ADR 0004's gland, sac and stinger chain through it).

It uses the engine's own `cos` and `sin`, no randomness, and never modifies its input, so the same genes always give the same body.

## Capabilities

`capabilitiesOf(anatomy, config, bodyScale, kindCount)`. Sums run over functional parts of the named type; `p = strength * size * integrity`; `m(stat)` is the stat's multiplier `0.5 + gene`, exactly 1 at the founder's value, so every line is the founder's at founder stats. Gene tables per type are in [ADR 0016](../decisions/0016-part-stats-and-attachment.md).

| Capability                | Formula                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| mass                      | `bodyMass * bodyScale` + `sum(mass * size * massScale)` over **all** parts (`massScale` follows the part's own dimensions)                                                                 |
| upkeep                    | `sum(upkeep * size * upkeepScale)` over **all** parts (`upkeepScale` follows force, rate or range; energy per second)                                                                      |
| thrust strength           | flagellum `p * m(force) * sqrt(m(length)) * (0.8 + 0.2 m(thickness))`; cilia `p * m(density) * sqrt(m(length) * m(rate))`                                                                  |
| forward / lateral thrust  | `strength * max(0, fx)` / `strength * abs(fy)` with the push `(fx, fy) = -(cos axis, sin axis)` (a tail trails along its axis)                                                             |
| torque                    | `strength * abs(x * fy - y * fx)`: the moment of the force about the centre, from the part's anchor                                                                                        |
| sense range               | `senseFloor + sqrt(sum(p * m(range)))` over eyes (so each extra eye adds less)                                                                                                             |
| vision cone, per eye      | axis = the eye's facing; half-angle = field of view / 2; reach = sense range `* (1 + effects.visionNarrowing * (sqrt(6.28 / fov) - 1))` (an all-round eye reaches exactly the sense range) |
| food detection, kind `k`  | `(1 + sum(p * (m(range) + m(sensitivity)) / 2)) * (1 + 0.25 * sum(p * m(resolution)))`; a sniffer's selectivity stat picks `k`; eye resolution lifts every kind                            |
| reach                     | `1 + sum(p * m(reach))` over mouths                                                                                                                                                        |
| bite size / bite rate     | `sum(p * m(gape))` / `sum(p * m(rate))` over mouths; zero without a working mouth, which then cannot bite (ADR 0017)                                                                       |
| diet efficiency, kind `k` | power-weighted mean over mouths of the form's yield for that kind (config `anatomy.mouthForms`; the mandible is exactly 1)                                                                 |
| absorption                | `1 + sum(p * (m(absorption) + m(length)) / 2)` over intestines `+ sum(p * m(throughput) / 2)` over stomachs: how fast the gut empties                                                      |
| digestion                 | `1 + sum(p * (m(absorption) + m(length)) / 2)` over intestines `+ sum(p * m(gape) / 2)` over mouths `+ sum(p * m(throughput) / 2)` over stomachs                                           |
| toxin tolerance           | `x / (1 + x)` with `x = sum(p * m(filter))` over intestines, in `[0, 1)`                                                                                                                   |
| gyro torque               | `sum(p * m(stability) * effects.gyroTorque)` over gyros, added to the torque above: turning with no thrust                                                                                 |
| eye on an eyestalk        | an eye whose parent is a working eyestalk has its range term multiplied by `1 + effects.eyestalkLift * m(length)`                                                                          |
| mating signal             | `min(effects.pheromoneCap, 1 + sum(p * m(potency) * effects.pheromoneSignal))` over pheromone glands: a creature is heard by a searcher out to `mateSenseRadius` times this                |
| energy capacity           | `1 + sum(p * m(capacity))` over stomachs `+ sum(p * m(reserve) * effects.lipidCapacity)` over lipid stores                                                                                 |
| damage taken              | `1 / (1 + sum(p * (m(thickness) + m(coverage) + m(hardness)) / 3))` over armor, in `(0, 1]`                                                                                                |
| temperature tolerance     | `1 + sum(p * m(insulation) * (0.8 + 0.2 m(thickness)))` over membranes                                                                                                                     |
| regeneration              | `1 + sum(p * m(rate))` over menders                                                                                                                                                        |

The consequences are the point: a flagellum pushing forward drives speed; pushing sideways it strafes; placed off the axis it turns the body; one at the rear on the axis cannot. Every part costs mass and upkeep, a dormant part costs them for nothing, and armor can reduce damage but never to zero.

**Factors.** `capabilityFactors(capabilities, founder)` expresses each capability relative to the founder body plan (`anatomy.founder`): speed, strafe and turn are thrust per unit mass over the founder's; damage and toxin factors are multipliers (below 1 is better); `upkeepDelta` is extra energy per second. The founder compared with itself is **exactly 1** for every factor, so switching anatomy on cannot change behavior until a body differs. A capability the founder lacks entirely is compared as neutral (1) rather than dividing by zero.

## What each factor does in the engine

| Factor                 | Read by                              | Effect                                                 |
| ---------------------- | ------------------------------------ | ------------------------------------------------------ |
| `speed`, `strafe`      | movement, brain scaling              | top speed and the lateral limit follow thrust per mass |
| `turn`                 | movement, brain                      | turn rate follows torque per mass                      |
| `senseRange`           | perception, observation, sensor cost | sensor radius and what it costs to run                 |
| `foodDetection[k]`     | perception                           | a sniffer finds food of kind `k` from further          |
| `reach`                | interaction                          | contact radius to food                                 |
| `digestion`            | interaction                          | energy gained per unit of food                         |
| `energyCapacity`       | `maxEnergyOf`                        | how much a body holds                                  |
| `toxinDamage`          | interaction, health                  | damage from toxic food                                 |
| `damageTaken`          | health                               | hazard damage (armor never reduces it to zero)         |
| `temperatureTolerance` | ecology                              | the comfortable temperature range                      |
| `regeneration`         | health                               | healing rate                                           |
| `upkeepDelta`          | metabolism                           | energy per second; every part costs, dormant ones too  |

The baselines are `organisms.maxSpeed`, `maxTurnRate`, `sensorRadius`, `movementCost` and `turningCost`; a founder body delivers exactly the baseline. Factors are cached per immutable body-gene array (`organisms/bodyFactors.ts`), so reading one in a system is a lookup. Mass is the outline's area relative to the founder's, so a bigger body is slower for the same thrust.

## Using it

- `World.anatomyOf(id)` returns `{ anatomy, capabilities, factors }` for a living organism, computed from its genome on demand. It is a read: it never changes state or the hash.
- `anatomy.enabled` (default `false`): with it off every genome carries the founder body; with it on body genes recombine and mutate on their own `anatomy` stream.
- The founder body: two rear flagellum (size 0.6, rooted on the rim at about 149 degrees, trailing back and pushing forward), two side cilia (0.4, at 90 and 270 degrees, pushing sideways), an eye (0.5, front), a mouth (0.5, rim) and a stomach (0.5, rear). Total size 3.5 of a budget of 6.

## What is verified

Unit tests for the layout, founder body, gene table, development (placement, budget, dependencies, purity), the capability formulas (including that placement and orientation matter, that every part has a cost, and that values stay finite under extreme mutation), and a world-level test that turning anatomy on leaves snapshots, events, records and every legacy gene identical to anatomy off. An equivalence harness against the previous commit gave identical results in 20 of 20 scenarios with the default configuration.

## Directional vision

An eye sees a cone about its axis (its `orientation` placed on the outline), not a circle (ADR 0016, addendum "Directional vision"). A body's **vision** is one cone per working eye plus an all-round touch radius of `senseFloor` times the baseline sensor radius, so a creature always feels what it touches.

- **Food, other organisms and hazards** are perceived only inside a cone (or the touch radius) and only within that cone's reach. The mating signal and the home sense are not vision and stay all-round.
- **Range for angle.** A cone narrower than all-round reaches further: `1 + effects.visionNarrowing * (sqrt(6.28 / fov) - 1)` times the sense range, so a 90 degree eye reaches about twice as far. `visionNarrowing` runs from 0 (no trade) to 1.
- **The founder's eye is all-round** (field of view at its widest), so the founder, and any world whose bodies do not change, perceives exactly what it did before eyes had a direction. A body whose eyes are all all-round, or that has no eye, is `omni` and takes the plain circle path. Evolution can only narrow the founder's field of view; two narrow eyes on opposite sides cover both ends and the sides stay blind.
- A creature sees through the nearest-first rule inside its cones: the nearest visible food, the nearest visible peer, the nearest visible hazard edge.

## What the renderer and inspector are given

Each drawn part (`PartSnapshot`) carries its `slot`, its `parent` (the index of the part it hangs from in the same array, always smaller than its own index, or `-1` for the body), its `sight` (a working eye's half-angle and reach in world units, else `null`) and the geometry it had before. The inspector's `InspectorPart` adds the parent slot, the tip, the integrity, the part's mass and upkeep (`partCostOf`: the parts plus the bare body add up to the body's mass, and the parts' upkeep to its upkeep) and the part's stats in real units from `PART_STATS`.
