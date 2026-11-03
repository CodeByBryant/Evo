# 0012: Anatomy (body-plan genes, deterministic development, derived capabilities)

Status: **Accepted** (approved by the project owner with the "dynamic bodies" plan, 2026-11-02)

This is the concrete design that [ADR 0004](0004-dynamic-evolvable-anatomy-and-morphology.md) said every anatomy phase would need. 0004 remains the vision; where this ADR chooses differently it says so under "Deviations from 0004".

Anatomy is delivered in three pull requests (owner decision): **PR 1** (this ADR): the data model, genome encoding, deterministic development and the capability formulas, with anatomy **switched off and proven not to change behavior**. **PR 2** (changed during the work): creature bodies, an evolvable point outline with physics ([ADR 0013](0013-creature-bodies.md)). **PR 3**: the infinite cluster world and founder species (ADR 0014). **PR 4**: systems read capabilities, the redundant scalar genes are retired, bodies and (if tuned) clusters become the default ([ADR 0015](0015-anatomy-consequences.md)).

## Problem

Organisms are bags of numbers (`maxSpeed`, `sensorRadius`, ...): a mutation changes a number, and "why is this organism fast?" has no answer beyond "the number is bigger". ADR 0004 wants capabilities to come from a body: parts with placement, orientation and parameters, inherited through the genome and turned into an anatomy by deterministic development. The engine must stay deterministic, serializable, headless and cheap, and the work must be provable step by step.

## Decision

### Ten part types and twelve slots

A body has **12 slots**. Each slot is empty or holds one part of one of **10 types**. The types are ordered by function so that a one-step mutation of the `type` gene lands on a related part:

| #   | Type        | Mechanic it feeds (all exist today)                                                   |
| --- | ----------- | ------------------------------------------------------------------------------------- |
| 0   | `flagellum` | Strong thrust: forward speed, strafing and turning from its placement and orientation |
| 1   | `cilia`     | Weak, cheap thrust of the same kind                                                   |
| 2   | `eye`       | Sensor range                                                                          |
| 3   | `sniffer`   | Detection of specific food kinds at range                                             |
| 4   | `mouth`     | Eating reach                                                                          |
| 5   | `intestine` | Digestion and toxin tolerance                                                         |
| 6   | `stomach`   | Energy capacity                                                                       |
| 7   | `armor`     | Resistance to hazard and toxin damage                                                 |
| 8   | `membrane`  | Temperature tolerance                                                                 |
| 9   | `mender`    | Health regeneration                                                                   |

There is no predation in the engine, so the venom chain of 0004 section 10 is not in the vocabulary. The dependency mechanism it needs is built and tested anyway (below).

### Genome encoding

The genome gains a `body` section: a flat, canonically ordered vector of **87 genes** (`BODY_GENE_DEFINITIONS` in `@evo/contracts`, append-only like the scalar table), kept **beside** the existing scalar genes and brain weights, not inside them:

- **Per slot (7 genes, 84 in all):** `present` (bool), `type` (int 0-9), `size` (float, 0.1-1), `angle` (circular, 0-2pi: where on the body it is attached, 0 is the front), `offset` (float, 0-1: distance from the centre as a fraction of the body radius), `orientation` (circular: the direction of the part's force or axis in the body frame, 0 is forward), `param` (float, 0-1: the type-specific parameter, for example a flagellum's length or an eye's range).
- **Visual genes (3):** `shape` (int 3-8, polygon sides, as in the prototype), `pattern` (int 0-3), `accentHue` (circular, in turns). They have no effect on fitness; they exist so that bodies are visually distinguishable and so that drift in them is visible. `physical.hue` stays where it is.

The existing mutation, recombination and distance code is generic over a gene-spec table and already supports `int`, `bool` and `circular` genes, so **no new operator code is needed** and every gene consumes the same fixed number of random draws as any other. A structural change (a part appearing, vanishing or changing type) is simply a mutation of `present` or `type`. Slots that are empty still carry genes, which mutate silently, so a part that switches on arrives with latent parameters.

Body genes use their **own random stream, `anatomy`**, appended last to `STREAM_NAMES`. The `genetics` stream is untouched, so with anatomy off the engine's behavior is bit-identical to before even with mutation on, which is what makes the equivalence proof strong.

**With `anatomy.enabled: false`** (the default in this PR) the body genes are inert: every genome carries the founder body vector, nothing mutates or recombines it, and nothing draws from the `anatomy` stream. With it on, body genes recombine, mutate and inherit like any others.

### Development: genome to anatomy

`developAnatomy(body, bodyRadius, config)` is a **pure function with no randomness**, so an anatomy is always recomputable from its genome and the config (ADR 0004 option A for persistence; nothing about a body needs saving beyond the genome). It:

1. reads the slots in order and keeps those with `present = 1`;
2. places each part in the body frame: `x, y = offset * radius * (cos angle, sin angle)`;
3. applies a **structural budget**: the total `size` of developed parts may not exceed `anatomy.structuralBudget`; parts are admitted in slot order and a part that would exceed it **does not develop** (it is reported as undeveloped), so bloat has a ceiling and lower slots have priority;
4. resolves **dependencies**: each type has `requires` and `provides` tokens (`mouth` provides `intake`; `stomach` and `intestine` require `intake`; `mender` requires `digestion`, which `stomach` provides). A part whose requirements are not met by other developed parts is **dormant**: it has mass and upkeep but contributes no capability, so useless parts are selected against. The resolver is generic over the token table and is tested with a synthetic table that implements 0004's venom chain (gland, sac, stinger).

The result is an `Anatomy` (body radius, the developed parts with their positions and `functional` flag, the undeveloped slots, the budget used, and the visual genes).

### Capabilities: anatomy to numbers

`capabilitiesOf(anatomy, config)` derives, per organism:

- **mass** (body, from the existing size factor, plus `size * mass` for every part), **upkeep** (energy per second, `size * upkeep` for every part, dormant ones included);
- **thrust** from flagella and cilia: forward `sum(strength * size * max(0, cos orientation))`, lateral `sum(strength * size * |sin orientation|)`, and **torque** `sum(strength * size * |x * Fy - y * Fx|)` for each part's force `F` at its position. Placement and orientation therefore matter: a rear-facing flagellum drives forward, side-facing ones strafe, and an off-axis one turns the body;
- **sense range** from eyes (`sum(size * (0.5 + param))` through a saturating curve, with a floor so an eyeless body still touches what it is on), sniffer detection per food kind, mouth **reach**, intestine **digestion and toxin tolerance**, stomach **energy capacity**, armor **damage resistance**, membrane **temperature tolerance**, mender **regeneration**.

`capabilityFactors(anatomy, founder, config)` expresses each capability **relative to the founder body plan** (`anatomy.founder` in config, the same plan for every founder). The founder's factors are exactly 1 (the same arithmetic divided by itself), so defaults are preserved: in PR 4 the engine multiplies today's baselines by these factors, and an unmutated founder behaves exactly as before. All coefficients are config, are **provisional**, and are set by measurement in PR 4. Every capability has an upkeep or mass cost, so none is free (ADR 0004 section 17).

Eyes are omnidirectional in this design (no field of view); a part's `orientation` matters for thrust but not yet for sensing. That is a deliberate scope limit, listed below.

### Where the engine reads body genes (for PR 4)

The scalar body genes are read in only a few places: movement (`maxSpeed`, `maxTurnRate`), perception (`sensorRadius`), metabolism (`movementCost`, `turningCost`, `basalCost`, the sensor cost), interaction (body radius), death (`maxAge`), reproduction and the brain's scaling. PR 4 retires exactly these scalar genes, which anatomy replaces: **`maxSpeed`, `maxTurnRate`, `sensorRadius`, `movementCost` and `turningCost`**. Body `radius` (the body geometry), `basalCost`, the life-stage ages, reproduction, learning and the brain stay. Retiring genes shrinks the gene table, which is a hash-schema change (version 8) with its own regenerated goldens; it happens only after PR 4 has shown, with an equivalence harness, that factor-based capabilities reproduce today's dynamics.

### Hash schema 6 and the `anatomy` stream

The state hash appends each organism's body vector after its brain weights, and the stream list grows to eight (`anatomy` last), so schema **6** changes every golden hash even though nothing in the dynamics moves. The proof of unchanged behavior is the equivalence harness (previous commit against this one, 20 scenarios, normalized snapshots, events and records), as in Phases 6 and 7, here **with mutation on**.

## Deviations from ADR 0004

- **A fixed-capacity slot genome instead of a free-form part graph.** It fits the existing operators and keeps random draws fixed. A part's parent or connection is not an evolvable relation in this design; every part attaches to the body at its own polar position. Dependencies (what a part needs) are expressed through capability tokens rather than connection edges.
- **Development has no randomness and no development stream.** 0004 anticipated one; a pure function is cheaper, trivially replayable and removes a class of bugs. The `anatomy` stream exists only for body-gene mutation and recombination, and for the cluster founders.
- **~~No radial silhouette.~~ Reversed by [ADR 0013](0013-creature-bodies.md).** This ADR first kept the body a circle with polygon styling; the owner asked for bodied creatures with `n` points, so the radial outline is now part of the genome and the physics.
- **Eyes are omnidirectional.** Field of view needs directional perception, a new mechanic.
- **Ten parts, not the 60 in 0004's vocabulary**, and no part that needs predation.
- **No "duplicate part" or "move part" mutation operators.** Parts move and rotate by drifting their own genes; duplication happens by a second slot switching on and converging.

## Alternatives considered

- **A variable-length part list with add, remove and duplicate operators.** More expressive, but it needs new operators and variable draw counts, which would make every configuration change shift later random draws (the property the existing operators were built to avoid).
- **Replace the scalar genes immediately.** Cleaner end state but no unchanged baseline to compare against. Rejected in favor of founder-relative factors first and retirement second.
- **Store a full anatomy snapshot in each organism's state.** Unneeded: it is a pure function of the genome and the config, so it is cached on the organism but never hashed.

## Consequences

- Hash schema 6: all goldens regenerate once, in the commit that causes it, with the equivalence proof alongside.
- Genome `version` becomes 2 (it gains the `body` section); the gene table for the scalar genes is unchanged until PR 4.
- A new gene group in species distance: `genomeDistance` reports a `body` distance and `species.distanceWeights` gains a `body` weight. It defaults to **0**, so species assignment is unchanged by this PR.
- Genome size grows by 87 genes; each birth adds about 350 draws on the `anatomy` stream (when enabled), which is negligible.
- Not in this PR: the systems do not read capabilities, nothing is drawn, and species ignore bodies. Parts act in PR 4; the outline acts and is drawn in PR 2 (ADR 0013).
