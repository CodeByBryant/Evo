# Anatomy

How an organism's body works. The decisions are in [ADR 0012](../decisions/0012-anatomy.md) (the vision is [ADR 0004](../decisions/0004-dynamic-evolvable-anatomy-and-morphology.md)); the genes are in [genome.md](../genetics/genome.md). Status: **the body outline is live (it changes size, energy and drag, and is drawn); the parts, their development and capability formulas exist, but the simulation does not read capabilities yet** (that is a later pull request). Everything here is derived from the genome, so nothing about a body is saved or hashed beyond the genes.

```text
genome.body (119 genes)  ->  developAnatomy()  ->  Anatomy  ->  capabilitiesOf()  ->  Capabilities
                              pure, no randomness                                      |
                                                                    capabilityFactors() against the founder
```

## The outline

Every creature has a silhouette of `n` points, 5 to 16 ([ADR 0013](../decisions/0013-creature-bodies.md)). `developOutline(body)` turns the outline genes into a closed polygon: sector `i` of `n` holds point `i`, at its `radius` gene and at an angle inside the sector set by its `angle` gene, so the polygon never crosses itself. It reports the area, the area-equivalent radius, the perimeter and the roughness (`perimeter / (2 pi areaRadius)`).

Two things follow from the outline, both measured against the founder outline and both exactly 1 for it:

- **Size**: effective body radius = the `radius` gene * `areaRadius / founderAreaRadius`. It feeds energy capacity, basal cost, health, eating reach and the drawn size.
- **Drag**: movement and turning energy * `max(0.25, 1 + outlineDrag * (roughness - founderRoughness))`: spiky bodies pay more to move.

The renderer draws the outline as a smooth closed curve through the points, with eyes at the front and a pattern in the accent color. The "Evolving bodies" preset turns `anatomy.enabled` on so outlines evolve.

## The ten parts

A body has 12 slots; each is empty or holds one part. The types are in the order of the `type` gene.

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

Mass and upkeep are per unit of part `size`. All numbers are provisional config (`anatomy.parts`), to be set by measurement when bodies start to matter.

## Development

`developAnatomy(body, config)` reads the slots in order:

1. a slot with `present = 1` becomes a part;
2. parts are admitted while the running total of `size` stays within `anatomy.structuralBudget` (default 6); a part that would exceed it does **not develop** and its slot is listed as undeveloped, so lower slots win and bodies cannot bloat without limit;
3. each part is placed at `(offset * cos(angle), offset * sin(angle))` in body-radius units (x forward, y left);
4. dependencies are resolved to a fixed point: a part is **functional** only if every capability token it needs is provided by a functional part. A part with an unmet need is **dormant**: it stays in the body and still costs mass and upkeep, but adds nothing. The resolver is generic over the token table (tests run ADR 0004's gland, sac and stinger chain through it).

It uses the engine's own `cos` and `sin`, no randomness, and never modifies its input, so the same genes always give the same body.

## Capabilities

`capabilitiesOf(anatomy, config, bodyScale, kindCount)` (all sums over functional parts of the named type, `p = strength * size`, `trait = 0.5 + param`):

| Capability               | Formula                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| mass                     | `bodyMass * bodyScale` + `sum(mass * size)` over **all** parts                                      |
| upkeep                   | `sum(upkeep * size)` over **all** parts (energy per second)                                         |
| forward thrust           | `sum(p * max(0, cos orientation))` over flagella and cilia                                          |
| lateral thrust           | `sum(p * abs(sin orientation))`                                                                     |
| torque                   | `sum(p * abs(x * sin orientation - y * cos orientation))`: the moment of the force about the centre |
| sense range              | `senseFloor + sqrt(sum(p * trait))` over eyes (so each extra eye adds less)                         |
| food detection, kind `k` | `1 + sum(p)` over sniffers whose `floor(param * kindCount)` is `k`                                  |
| reach                    | `1 + sum(p * trait)` over mouths                                                                    |
| digestion                | `1 + sum(p)` over intestines                                                                        |
| toxin tolerance          | `x / (1 + x)` with `x = sum(p * trait)` over intestines, in `[0, 1)`                                |
| energy capacity          | `1 + sum(p)` over stomachs                                                                          |
| damage taken             | `1 / (1 + sum(p * trait))` over armor, in `(0, 1]`                                                  |
| temperature tolerance    | `1 + sum(p)` over membranes                                                                         |
| regeneration             | `1 + sum(p)` over menders                                                                           |

The consequences are the point: a flagellum pushing forward drives speed; pushing sideways it strafes; placed off the axis it turns the body; one at the rear on the axis cannot. Every part costs mass and upkeep, a dormant part costs them for nothing, and armor can reduce damage but never to zero.

**Factors.** `capabilityFactors(capabilities, founder)` expresses each capability relative to the founder body plan (`anatomy.founder`): speed, strafe and turn are thrust per unit mass over the founder's; damage and toxin factors are multipliers (below 1 is better); `upkeepDelta` is extra energy per second. The founder compared with itself is **exactly 1** for every factor, so switching anatomy on cannot change behavior until a body differs. A capability the founder lacks entirely is compared as neutral (1) rather than dividing by zero.

## Using it

- `World.anatomyOf(id)` returns `{ anatomy, capabilities, factors }` for a living organism, computed from its genome on demand. It is a read: it never changes state or the hash.
- `anatomy.enabled` (default `false`): with it off every genome carries the founder body; with it on body genes recombine and mutate on their own `anatomy` stream.
- The founder body: two rear flagellum (size 0.6, at about 149 degrees, pushing forward), two side cilia (0.4, at 90 and 270 degrees, pushing sideways), an eye (0.5, front), a mouth (0.5, rim) and a stomach (0.5, rear). Total size 3.5 of a budget of 6.

## What is verified

Unit tests for the layout, founder body, gene table, development (placement, budget, dependencies, purity), the capability formulas (including that placement and orientation matter, that every part has a cost, and that values stay finite under extreme mutation), and a world-level test that turning anatomy on leaves snapshots, events, records and every legacy gene identical to anatomy off. An equivalence harness against the previous commit gave identical results in 20 of 20 scenarios with the default configuration.
