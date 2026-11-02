# 0013: Creature bodies (an evolvable point outline with physical consequences)

Status: **Accepted** (approved by the project owner, 2026-11-02: "I wanted them to be bodied creatures with n amount of points. Look at 0004"; "physics from the start")

[ADR 0012](0012-anatomy.md) drew organisms as polygons and called the outline "a rendering concern". That was the wrong call: [ADR 0004 section 7](0004-dynamic-evolvable-anatomy-and-morphology.md) makes the radial body the preferred direction, and the owner wants creatures with a body of `n` points. This ADR replaces the polygon `shape` gene with an evolvable outline and gives the outline real consequences from the start.

## Problem

An organism is a circle with a colour. A creature should have a silhouette that evolves (a smooth blob, a spiky star, a lopsided body) and that silhouette should matter: a bigger body holds more energy and costs more, a spiky body drags. Without that, the outline is decoration and evolution has no reason to move it.

## Decision

### Genes

The `body.visual.shape` gene is removed. The body vector grows by 33 genes (**119** in total):

| Genes                      | Kind         | Meaning                                    |
| -------------------------- | ------------ | ------------------------------------------ |
| `body.outline.count`       | int 5-16     | how many points the body has (`n`)         |
| `body.outline.radius0..15` | float 0.35-1 | distance of point `i` from the centre      |
| `body.outline.angle0..15`  | float 0-1    | where point `i` sits inside its own sector |

Points beyond `count` still carry genes and mutate silently, as an empty part slot does, so a body that gains a point wakes up with latent values. `pattern` and `accentHue` stay as the painted genes. `anatomy.mutation.outlineRate` (default 0.03) is the chance per outline gene per birth.

### Development

`developOutline` is pure and has no randomness. The circle is divided into `count` equal sectors; point `i` lies at `(i + 0.1 + 0.8 * angle_i)` sectors around, at `radius_i`. Because every point stays inside its own sector the polygon is **always simple** (it cannot cross itself), whatever the genes: this is the numerical-stability condition 0004 asked to be evaluated. The result carries the points, the area (shoelace), the area-equivalent radius `sqrt(area / pi)`, the perimeter and the **roughness** `perimeter / (2 pi * areaRadius)` (1 for a circle, higher for a spiky body).

### Physics (from the start)

Everything is measured against the **founder outline** (`anatomy.founderOutline`, eight points mirrored left to right: a snout, narrow flanks and a fuller rear):

- **Size.** The effective body radius is the `radius` gene times `areaRadius / founderAreaRadius`. It feeds the existing size factor (energy capacity, basal cost, health), the contact radius for eating, the placement of newborns and the radius a viewer sees.
- **Drag.** Movement and turning energy are multiplied by `max(0.25, 1 + outlineDrag * (roughness - founderRoughness))` (`anatomy.outlineDrag`, default 0.5). A spikier body pays more to move; a rounder one pays less.

Both factors are exactly 1 for the founder outline, and with `anatomy.enabled: false` every genome carries it, so **an anatomy-off world is bit-identical to before** (shown by the equivalence harness). With anatomy on, body size and drag now evolve: a larger body eats from further away and carries more energy but burns more; trade-offs, not free gains.

Parts (the 12 slots) still do not act; they do in the anatomy-consequences PR, and attach to the outline there.

### Hash schema 7

Body genes are hashed, so the 33 new genes change every hash. The schema version moves to **7** and every golden regenerates once, here. (The scalar-gene retirement planned in 0012 becomes version 8.)

## Alternatives considered

- **Fixed 12 points, only radii evolve.** Simpler, but then no creature ever has a different point count. Rejected: the owner asked for "n points".
- **Free `(r, theta)` pairs, sorted by angle.** Most freedom, but sorting and self-intersection need repair rules. The sector scheme gets a simple polygon for free.
- **Looks only.** Cheaper and the equivalence proof would cover the whole PR, but evolution would have no reason to shape bodies. Rejected by the owner.

## Consequences

- With anatomy on, the dynamics differ from anatomy off (that is the point), so the "anatomy on changes nothing" tests now hold only with `outlineRate: 0`.
- Cost: the outline is developed once per genome (cached on the immutable gene array), then read in constant time.
- The renderer draws every creature from its outline as a smooth closed curve through the points (so it reads as a soft body, not a polygon), with eyes at the front.
