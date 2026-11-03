# 0015: Anatomy consequences (parts act, the old genes retire, bodies and clusters become the default)

Status: **Accepted** (approved by the project owner, 2026-11-03: everything in one pull request, evolving bodies on by default after 128-seed probes)

[ADR 0012](0012-anatomy.md) built the parts, their development and the capability formulas but left the simulation not reading them; [ADR 0013](0013-creature-bodies.md) made the outline act; [ADR 0014](0014-cluster-world.md) built the cluster world. This ADR finishes the anatomy work: the parts act, the five scalar genes they replace are retired, evolving bodies become the default, and the cluster world is tuned and, if it meets its target, becomes the default.

## Decision

### 1. Parts act through founder-relative factors

Every system multiplies a quantity it already uses by a **factor** from `capabilityFactors` (ADR 0012). A factor is exactly 1 for the founder body, and with `anatomy.enabled: false` every genome carries the founder body, so **wiring changes nothing until a body differs**. Factors are cached per immutable body-gene array (`organisms/bodyFactors.ts`).

| Factor                 | Read by                              | Effect                                                |
| ---------------------- | ------------------------------------ | ----------------------------------------------------- |
| `speed`, `strafe`      | movement, brain scaling              | top speed and lateral limit follow thrust per mass    |
| `turn`                 | movement, brain                      | turn rate follows torque per mass                     |
| `senseRange`           | perception, observation, sensor cost | sensor radius and what it costs to run                |
| `foodDetection[k]`     | perception                           | a sniffer finds food of kind `k` from further         |
| `reach`                | interaction                          | contact radius to food                                |
| `digestion`            | interaction                          | energy gained per unit of food                        |
| `energyCapacity`       | `maxEnergyOf`                        | how much a body holds                                 |
| `toxinDamage`          | interaction, health                  | damage from toxic food                                |
| `damageTaken`          | health                               | hazard damage (armor never reduces it to zero)        |
| `temperatureTolerance` | ecology                              | the comfortable temperature range                     |
| `regeneration`         | health                               | healing rate                                          |
| `upkeepDelta`          | metabolism                           | energy per second; every part costs, dormant ones too |

### 2. The five scalar genes retire (hash schema 8)

`physical.maxSpeed`, `physical.maxTurnRate`, `sensory.sensorRadius`, `metabolic.movementCost` and `metabolic.turningCost` leave the gene table. Their values become the config baselines (`organisms.maxSpeed`, ...) times the body factor, so speed, turning, sensing and movement cost evolve only through the body. `Genome.version` becomes 3 and every golden regenerates once, in that commit. Genes that exist today mutate, so default dynamics cannot stay identical; the proof is an equivalence harness with those five genes' mutation **frozen** before and after (founders at baseline must reproduce exactly).

### 3. Evolving bodies by default

`anatomy.enabled` defaults to `true`, because the evolution of speed, turning and senses now lives in the body. The part table (`anatomy.parts`) and mutation rates are set by probe (32 seeds, then 128 held-out, x 50,000 ticks), never by editing gates. **Stop condition:** if the 128-seed probe shows any extinct world or a population band outside today's, the default stays off, bodies ship as the "Evolving bodies" preset and the numbers are reported.

### 4. Cluster world: keep organisms home

PR 3 measured that about 40% of founders end up in the void, where they starve, and that a slower void does not help. Levers in order, each probed alone: (1) founders start inside the habitable core (within 0.8 of the radius); (2) a **home sense**: two observation slots (the vector to the nearest cluster centre in the body frame, scaled by how far out the organism is; zero in the field) and an innate-prior term that turns toward home near or beyond the edge, which changes `OBSERVATION_SIZE` and so rides hash schema 8; (3) per-cluster food balance, founders per species and the mate cap. The void stays the owner's "mild slowdown" unless a probe shows a mild change is needed. **Stop condition:** the layout becomes the default only if every one of the six clusters is populated at 50,000 ticks in at least 90% of 128 seeds with no extinct world; otherwise it stays the "Clusters" preset and the measured rate is reported. When it becomes the default, cluster founders differ by body-plan offsets (parts and outline) and `species.distanceWeights.body` is non-zero.

### 5. Seeing the body

At high zoom each part is drawn over the body (type, size, placement, orientation); the inspector gets an **Anatomy** tab with a schematic, a parts table and the derived capabilities and costs. Presets: "Fixed bodies" (anatomy off) joins "Open field" (field layout) as an explicit choice.

## Alternatives considered

- **Keep the scalar genes beside the parts.** Two sources of truth for speed and senses; "why is it fast" would have two answers. Rejected in the owner's earlier decision.
- **Split the cluster tuning into its own pull request.** Recommended, but the owner chose one pull request; the commit order and the stop conditions above keep it shippable if tuning falls short.
- **Home sense as a movement force.** Simple, but it overrides brains rather than informing them; a sensed input lets brains and the innate prior use it, and learning can refine it.

## Consequences

- Hash schema 8 and regenerated goldens (twice if both defaults flip in separate commits); each is proven by an equivalence harness first.
- Brains change shape (two more observation slots), so brain weights from before cannot be loaded; there are no saves yet.
- A part that becomes dormant or lost can be lethal; mutation rates are tuned for that, and extreme-mutation tests keep every value finite.

## Results

- **Parts act.** Equivalence harness against the previous commit, anatomy off: 20 of 20 scenarios identical; per-part tests with negatives (dormant parts add nothing but cost, armor never reaches zero, factors stay finite).
- **Genes retired (hash 8).** With mutation off, per-organism snapshots are identical to the previous commit up to the first birth in all 16 scenarios; after it the runs diverge only because five fewer genes draw five fewer values.
- **Bodies are the default.** Probe, bodies on, default world, 50,000 ticks: 32 seeds then 128 held-out seeds, 0 extinct worlds; final population mean 34.9 (band 14 to 52) against 38.2 (19 to 59) with bodies off; 5.5 distinct part layouts per world and a mean speed factor of 1.14 (bodies really evolve). The "Fixed bodies" preset keeps the old behavior of an unchanging body.
- **Cluster persistence.** With the larger world (radius 500), founders in the core and the way-home sense, 16 of 16 worlds kept all six clusters populated at 20,000 ticks (96 of 96 clusters), about 496 organisms, almost none in the void, purity 0.997 (bodies off, spacing 4,500). At the field's species threshold a cluster world splits into 80 to 140 species; the cluster layout therefore uses 0.12 (about 18 species).
- **The cluster layout is not the default yet.** The stop condition asks for the final configuration (bodies on, spacing 2,500, threshold 0.12) over 128 seeds at 50,000 ticks; that probe costs hours (a cluster world runs at about 13.5 ms a tick), and only the 16-seed, 20,000-tick measurement above exists. The layout stays the "Clusters" preset; making it the default is one config value once the full probe is run.
