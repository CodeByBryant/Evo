# 0004: Dynamic evolvable anatomy and morphology

Status: **Accepted as a long-term direction — not scheduled to a phase, not implemented**

Target: Phase 8+, likely realized as a phase beyond the current Phase 0–10 roadmap in `.dev/roadmap.md` (after continuous ecology (Phase 3), genetics (Phase 4), learning (Phase 5), speciation (Phase 6), and persistence/experiment infrastructure (Phase 8) are stable). Current implementation: none. **Do not implement any part of this during Phases 2–7.**

This ADR records the design owner's future-architecture specification for the record, so it survives between now and whenever the prerequisite phases are done. It is written in the same spirit as the reserved-but-unimplemented pieces already in the engine (the no-op `ReproductionSystem`, the defined-but-unemitted `ReproductionAttemptedEvent`): naming the destination now costs nothing and keeps later phases from re-deriving it from scratch.

## 1. Vision

Evo should eventually move beyond organisms having a fixed body with a collection of numeric statistics such as:

```text
speed
sensorRadius
damage
energyCapacity
armor
reproductionRate
```

Instead, organisms should possess genetically determined modular anatomy. An organism's capabilities should emerge from its physical body plan. The long-term model is:

```text
Genome
  ↓
Development / Body Plan
  ↓
Anatomy
  ├── Parts
  ├── Connections
  ├── Placement
  ├── Orientation
  ├── Morphological parameters
  └── Physical properties
  ↓
Capabilities
  ↓
Behavior
  ↓
Survival / Reproduction
  ↓
Evolution
```

The goal is for evolution to modify the organism's actual structure rather than merely changing abstract stat values. A faster organism, for example, should eventually become faster because it possesses morphology capable of producing more movement force, not because its genome contains an arbitrary `speed += 0.2` mutation.

## 2. Core design principle

Anatomy should be data. The body of an organism must be represented explicitly in simulation state. An organism should conceptually have:

```text
Organism
├── Genome
├── Brain
├── Energy
├── Age
├── Species
├── Anatomy
│   ├── Body geometry
│   ├── Parts
│   ├── Connections
│   └── Derived physical properties
└── Life history
```

The anatomy must be deterministic and serializable. Given the same:

```text
genome
+
developmental rules
+
seed
+
simulation version
```

the organism must develop the same anatomy.

## 3. Modular part system

Evo should eventually contain a library of biological/mechanical part types.

Initial conceptual part vocabulary:

```text
Anchor        Eyestalk       Marrow         Silklock
Armor         Feeder         Medusa         Skeleton
Beef          Flagellum      Membrane       Sniffer
Bloat         Gill           Mender         Sonar
Brain         Glacien        Mouth          Spike
Builder       Grazer         Mover          Spitter
Cataract      Gyro           Nouricyte      Stinger
Chameleon     Heart          Parasite       Stomach
Chromatophore Host           Pheromone      Urchin
Cilia         Join           Radula         VenomGland
Cruncher      Hydrofield     Reproducer     VenomSac
Drill         Intestine      Shell          Vivicyte
Dropper       Jaw            Shooter        Webber
Electrocyte   Lance
Evolver       Lipid
Exotoxin      Mace
Eye           Mandible
```

This is a conceptual library, not a requirement that every part be implemented immediately. The part catalog should be extensible: new parts should be addable without redesigning the entire organism architecture.

## 4. Parts are not just labels

A part must eventually contain meaningful simulation properties. Conceptually:

```ts
Part {
  id
  type
  parent
  children
  position
  orientation
  scale
  parameters
  capabilities
}
```

Exact representation is intentionally left open for the future architecture phase. A part may have:

```text
physical dimensions        range
mass                       force
energy cost                damage
metabolic cost             sensing capability
structural requirements    resource-processing capability
attachment points          defensive properties
orientation                reproductive functionality
                           chemical/electrical properties
                           visual properties
                           developmental constraints
```

Parts should expose capabilities through explicit systems rather than becoming giant collections of special-case conditionals.

## 5. Parts have parameters

Part type alone should not completely determine functionality. Different instances of the same part may have genetically determined parameters. For example:

```text
Flagellum
├── length
├── thickness
├── force
├── energyCost
├── orientation
└── attachmentPoint
```

Two organisms can therefore both possess a flagellum while having different morphology and performance. The same principle applies to other parts:

```text
Eye                    Armor                  Stinger
├── range              ├── thickness          ├── length
├── resolution         ├── coverage           ├── penetration
├── fieldOfView         ├── hardness            ├── range
└── energyCost         └── mass               ├── venomCapacity
                                               └── energyCost
```

The exact parameter sets should be designed when this phase begins.

## 6. Placement and orientation are evolvable

A major requirement is that organisms should not merely evolve which parts they have. They should also evolve where the parts are located, how they are oriented, how large they are, how they are connected, and potentially their local geometry.

```text
             Eye                          Eye
              ↑                            →
        ┌───────────┐                ┌───────────┐
        │   BODY    │                │   BODY    │
        └───────────┘                └───────────┘
             ↓                            ↘
          Flagellum                    Flagellum
```

These organisms may therefore behave differently even if they possess the same part types. Placement and orientation must eventually have actual simulation consequences.

## 7. Radial body geometry

A potential long-term representation for organism morphology is a radial body model. Body points could be represented as `(r, θ)` where `r ∈ (0, 1] × organismSize` and `θ ∈ [0, 2π)`. The organism's body can therefore be represented as a set or ordered collection of radial points:

```text
        •
     •     •
   •    ●    •
     •     •
        •
```

Each point describes a location relative to the organism's body center. This could allow the organism's actual silhouette to evolve:

```text
Genome
   ↓
Radial morphology
   ↓
Body outline
   ↓
Part attachment locations
   ↓
Physical interaction
   ↓
Rendered organism
```

This representation is not mandatory. It is the current preferred conceptual direction and should be evaluated for numerical stability, collision handling, rendering complexity, and evolutionary usefulness before implementation.

## 8. Parts should produce capabilities

The engine should eventually derive capabilities from anatomy rather than maintaining arbitrary independent stats wherever possible:

```text
Flagellum → Movement force → Acceleration / velocity     (not: Genome → speed = 4.82)
Eye       → Visual sensing
Gill      → Aquatic respiration
Mouth     → Food intake
Armor     → Damage resistance
Jaw       → Bite interaction
Stomach   → Food processing
Reproducer → Reproduction capability
```

This does not mean all legacy statistics must immediately disappear. During migration, derived statistics may remain as cached/derived values for performance or compatibility, but the long-term source of truth should be anatomy.

## 9. Example: flagellum

Instead of `organism.speed = 5`, the organism could possess:

```text
Flagellum {
  length
  force
  orientation
  energyCost
}
```

The flagellum generates movement force based on its morphology and orientation:

```text
Flagellum orientation → Force vector → Organism acceleration → Velocity → Movement
```

Changing the orientation of the flagellum should therefore change the resulting movement, creating a direct relationship between morphology and behavior.

## 10. Example: venom system

Complex capabilities should be possible through combinations of parts:

```text
Venom Gland → produces venom → Venom Sac → stores venom → Stinger → delivers venom
```

A stinger without a venom source may have different functionality from a complete venom system. This introduces part dependencies and biological assemblies, represented through explicit capabilities/dependencies rather than hard-coded organism-specific logic, for example:

```text
VenomGland requires: nothing;        provides: Toxin
VenomSac   requires: Toxin;          provides: StoredToxin
Stinger    requires: StoredToxin;    provides: VenomDelivery
```

## 11. Structural relationships

Parts may have relationships with other parts. Possible relationship types include:

```text
attached-to   contains    feeds-into   requires
supports      connects-to  parent-of    child-of
```

Examples:

```text
Flagellum  → attached-to → Body
Eye        → attached-to → Eyestalk
VenomSac   → connected-to → Stinger
VenomGland → feeds-into  → VenomSac
Mouth      → feeds-into  → Stomach
```

These relationships should eventually form an explicit anatomy graph or equivalent structure. The exact data structure should be chosen based on simulation performance and developmental requirements.

## 12. Development

The genome should not necessarily directly contain the final anatomy. A future developmental system may perform:

```text
Genome → Developmental rules → Body plan → Part construction → Part placement → Connections → Final anatomy
```

This creates an important separation: **Genome ≠ Anatomy**. The genome contains hereditary information; development converts that information into an organism. This allows mutations to affect developmental processes rather than requiring every possible body configuration to be directly encoded.

## 13. Genetic encoding

The genome should eventually be able to encode:

- **Part presence**: `HasEye`, `HasMouth`, `HasFlagellum`, `HasArmor`
- **Part count**: 2 eyes, 4 flagella, 3 armor segments
- **Part parameters**: eye range, flagellum length, armor thickness
- **Placement**: radial position, angular position
- **Orientation**: part rotation
- **Connections**: part A connects to part B
- **Morphology**: body size, body shape, segment dimensions

Mutations may eventually affect any of these dimensions.

## 14. Evolutionary mutation

Future mutations should be capable of producing structural changes: add part, remove part, duplicate part, modify part parameter, move part, rotate part, change connection, change body geometry, change developmental rule.

Mutations should have configurable probabilities and magnitudes. Large structural mutations should generally be rarer than small parameter mutations unless experiments demonstrate otherwise. The exact mutation model belongs to the genetics phase (Phase 4) and its own review, not to this document.

## 15. Heritability

Anatomy must be inherited through the genome:

```text
Parent genome → Mutation / recombination → Child genome → Development → Child anatomy
```

The child should therefore not simply clone the parent's anatomy object. The genome should be the hereditary source of truth. This distinction is critical for evolutionary experiments.

## 16. Learned behavior vs. anatomy

Anatomy and learned behavior must remain conceptually separate:

```text
Genome → Anatomy → Physical capabilities
Genome → Brain initialization → Learning → Behavior
```

These interact during the organism's lifetime, for example:

```text
Eye → sensory information → brain → learned behavior → movement decision → Flagellum → physical movement
```

A learned behavior should not directly mutate anatomy unless a future explicit mechanism is introduced. Likewise, anatomy should constrain what behavior is physically possible.

## 17. Anatomy should have costs

Every capability should have an ecological/evolutionary tradeoff where appropriate:

```text
Large eye        → better perception          → greater energy cost
Large armor      → better defense             → greater mass, greater metabolic cost
Long flagellum   → greater movement capability → greater construction/mass/energy cost
Large stomach    → greater food capacity       → additional mass
```

The objective is not to make every part mechanically balanced by arbitrary game-design numbers. The objective is to create an ecology in which morphology creates meaningful tradeoffs.

## 18. Physical consequences

Eventually anatomy should influence actual simulation mechanics: movement, acceleration, turning, sensing, food consumption, resource processing, combat/interactions, defense, reproduction, energy consumption, environmental interaction, body size, collision geometry, reach, range, visibility, species-level ecological niches.

The simulation should avoid having anatomy exist purely as a visual layer. If a part exists, it should eventually have a reason to exist in the simulation.

## 19. Rendering

The renderer should derive the organism's visual representation from its anatomy:

```text
Anatomy → Render representation → Body geometry + Part geometry + Orientation + Visual parameters
```

Two organisms with different anatomy should therefore be visually distinguishable. Rendering must remain downstream of simulation truth. The renderer must never become the source of anatomical state — consistent with ADR 0001's simulation/renderer/UI split.

## 20. Determinism requirements

Dynamic anatomy must preserve Evo's deterministic simulation guarantees (ADR 0003). For identical seed, simulation version, configuration, and genome, development must produce identical anatomy. No anatomy generation may depend on `Math.random()`, wall-clock time, browser state, object iteration order, platform-specific nondeterministic behavior, or renderer state. All stochastic developmental/genetic processes must use Evo's deterministic named RNG streams — likely warranting a new `development` or `anatomy` stream added to the fixed list in `docs/simulation/determinism.md`, section 3, at that time.

## 21. Serialization / replay

Anatomy must eventually be serializable. Persistence should support enough information to reconstruct an organism exactly.

- **Option A**: store genome and regenerate anatomy deterministically (`Saved genome → Development → Same anatomy`).
- **Option B**: store genome plus a validated anatomy snapshot, useful for debugging or version migration.

The preferred source of truth should remain the genome plus deterministic development rules. Replay systems must be able to reproduce anatomical evolution.

## 22. Debugging / observability

Dynamic anatomy must be inspectable. The UI should eventually allow selecting an organism and viewing its genome, anatomy, parts, part parameters, part placement, part orientation, connections, derived capabilities, energy costs, development history, mutations, and parent/child lineage. For example:

```text
Organism #482

Species: 7
Age: 1842 ticks

ANATOMY
  Body
    radius: 0.73

  Eye ×2
    range: 8.4
    FOV: 1.7

  Flagellum ×3
    force: 2.8
    length: 1.4

  Armor ×4
    thickness: 0.12

  Mouth ×1
  Stomach ×1

CAPABILITIES
  Movement
  Vision
  Feeding
  Defense
```

The engine should expose enough information for this UI without making the UI responsible for reconstructing simulation truth.

## 23. Species-level analysis

Dynamic anatomy should eventually make species analysis substantially more interesting. Experiments could measure average part counts, anatomical diversity, common body plans, morphological convergence, part emergence/disappearance, evolutionary lineages, ecological specialization, and anatomy vs. survival/reproduction/energy efficiency/behavior, plus anatomical divergence between species. Potential future visualizations: `Species → Body-plan distribution → Part frequency → Morphological tree`. This should integrate with Evo's existing observability and experiment infrastructure (Phase 8).

## 24. Constraints

The system must **not** become an unconstrained physics engine by default. Dynamic anatomy should be introduced incrementally. Avoid prematurely implementing soft-body physics, full rigid-body simulation, fluid dynamics, realistic biomechanics, arbitrary deformable meshes, or complex collision meshes, unless experiments demonstrate that they are necessary. The first implementation should prioritize genetically determined structure, deterministic development, meaningful capabilities, and evolutionary consequences — not physical realism for its own sake.

## 25. Compatibility with existing architecture

Dynamic anatomy must fit the existing Evo architecture:

```text
Simulation Engine → World State → Events / Snapshots → Renderer + UI
```

Anatomy belongs to simulation truth. The renderer observes anatomy. The UI observes anatomy. Experiments analyze anatomy. None of them own anatomy. The anatomy system must not introduce React, DOM, Canvas, Electron, or other browser/UI dependencies into the simulation package — the same rule already enforced for the rest of `packages/simulation` (ADR 0001, `tools/check-dependency-rules.mjs`).

## 26. Suggested future architecture

A possible future package/module structure:

```text
simulation/
├── genetics/
├── development/
├── anatomy/
│   ├── parts/
│   ├── body/
│   ├── connections/
│   ├── capabilities/
│   └── morphology/
├── organisms/
├── ecology/
├── learning/
└── world/
```

Possible conceptual modules: `PartDefinition`, `PartInstance`, `Anatomy`, `BodyPlan`, `DevelopmentalProgram`, `Capability`, `AnatomyMutation`, `Morphology`. These are provisional names only. **Do not create them now merely because they appear in this document.**

## 27. Suggested implementation sequence

When this feature is eventually scheduled, implement it incrementally:

- **Stage A — Part data model**: part definitions, part instances, parameters, IDs, connections, deterministic serialization. No complex physics yet.
- **Stage B — Genome representation**: genomes encode part presence, count, parameters, placement, orientation.
- **Stage C — Development**: `Genome → Development → Anatomy`, deterministically.
- **Stage D — Capabilities**: derive actual organism capabilities from anatomy.
- **Stage E — Ecological consequences**: connect capabilities to movement, sensing, feeding, defense, reproduction, energy.
- **Stage F — Mutation**: allow structural evolutionary mutations.
- **Stage G — Rendering**: render anatomy dynamically.
- **Stage H — Analysis**: anatomical statistics, lineage analysis, species comparison, experiment tooling.

## 28. Design goals

The finished system should make questions like these meaningful, answerable from simulation data rather than arbitrary game-design explanations:

- _Why does this organism move quickly?_ Because its anatomy contains morphology capable of generating high movement force.
- _Why can this organism see farther?_ Because its evolved sensory structures provide greater perception range.
- _Why does this organism consume more energy?_ Because its anatomy contains metabolically expensive structures.
- _Why does this species dominate this environment?_ Because its evolved morphology and behavior are well suited to the environment.
- _Why does this organism look different from its ancestor?_ Because mutations altered its developmental genome, producing different anatomy.
- _Why did this body plan disappear?_ Because its ecological/evolutionary tradeoffs caused it to become less successful under the given environment.

## 29. Important non-goals

This feature is **not** intended to: replace the deterministic simulation architecture; replace the existing genome system prematurely; introduce random visual mutations; make organisms visually different without simulation consequences; create a full biological simulator or realistic molecular biology model; turn Evo into a traditional creature-building game; or prioritize visual complexity over evolutionary behavior. The purpose is to make evolution act on structure.

## 30. Long-term concept

```text
GENOME
   │
   ▼
DEVELOPMENT
   │
   ▼
┌──────────────────────────────┐
│           ANATOMY            │
│                               │
│  Body ─ Eye ─ Eyestalk        │
│    │                          │
│  Mouth ─ Stomach              │
│    │                          │
│  Body ─ Flagellum             │
│    │                          │
│  Armor ─ Armor ─ Armor        │
│                               │
└──────────────────────────────┘
   │
   ▼
PHYSICAL CAPABILITIES
   │
   ├── Movement
   ├── Sensing
   ├── Feeding
   ├── Defense
   ├── Reproduction
   └── Environmental interaction
   │
   ▼
BEHAVIOR / LEARNING
   │
   ▼
SURVIVAL + REPRODUCTION
   │
   ▼
EVOLUTION
   │
   └──────────────→ GENOME
```

The core principle: Evo should eventually evolve organisms, not merely evolve numbers attached to organisms.

## Alternatives considered

- **Keep organisms as fixed stat bundles indefinitely** (the Phase 2–7 model). Rejected as a permanent design: it caps how interesting evolutionary outcomes can be, and every "why" question in section 28 collapses into "because the mutation rolled that way," which is exactly what ADR 0001 is trying to move Evo away from.
- **Full physical/soft-body simulation from the start.** Rejected per section 24: unconstrained physics realism is explicitly a non-goal until experiments show it's necessary; the risk is building an expensive physics engine before knowing it improves evolutionary outcomes.
- **Encode anatomy directly in the genome with no development step.** Rejected per section 12: collapsing genome and anatomy would force every possible body configuration to be directly encoded, instead of letting mutations act on compact developmental rules.

## Consequences

- No code, package, or module named in section 26 should exist before this phase actually starts (matches the project's existing discipline of leaving reserved-but-unimplemented slots inert, e.g. `ReproductionSystem`).
- When this phase begins, it will need its own ADR(s) for the concrete data model, genome encoding, and determinism-stream additions, following the same process as ADRs 0001–0003.
- Existing organism fields (`speed`, `sensorRadius`, etc., once genetics/Phase 4 introduces them) should be designed from Phase 4 onward with an eye toward eventually becoming derived values rather than independent genes, to ease the future migration described in section 8.

## Rollback plan

Not applicable in the usual sense — nothing is implemented yet. If, when this phase is reached, the anatomy model proves unworkable (performance, determinism, or evolutionary usefulness), the fallback is to remain on the fixed-stat-bundle model this ADR describes as superseding, with no migration cost since nothing built on top of it yet.
