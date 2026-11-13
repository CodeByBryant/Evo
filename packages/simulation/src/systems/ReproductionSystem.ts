import type { EntityId, Genome, WorldConfig } from '@evo/contracts'
import { EggStore } from '../entities/EggStore'
import type { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import type { RecombinationStrategy } from '../genetics/Recombination'
import { architectureOf, genomeFromParts, genomeToVector } from '../genetics/GenomeFactory'
import { inheritedBrainWeights } from '../genetics/LearningInheritance'
import { brainLayoutOf } from '../learning/BrainLayout'
import type { BrainLayout } from '../learning/BrainLayout'
import { createBrainState } from '../learning/BrainState'
import type { BrainState } from '../learning/BrainState'
import { clamp, TWO_PI, wrapAngle } from '../math/scalar'
import type { LineageStore } from '../lineage/LineageStore'
import { ReproductionReadiness } from '../organisms/reproductionReadiness'
import { bodyRadiusOf, maxEnergyOf, maxHealthOf } from '../organisms/traits'
import type { RandomSource } from '../random/RandomSource'
import type { SeededRandom } from '../random/SeededRandom'
import type { EcologyModel } from '../ecology/EcologyModel'
import { NO_SPECIES } from '../species/SpeciesRegistry'
import type { SpeciesTracker } from '../species/SpeciesRegistry'
import type { SpatialHash } from '../spatial/SpatialHash'

/**
 * Local, continuous reproduction: no global generations, no asexual fallback
 * (docs/decisions/0005). Every organism's `reproductionCooldownRemaining` is first decremented by
 * `deltaTime` (floored at zero); then organisms are processed in ascending id, each considered at
 * most once as an initiator. An organism attempts only once it clears three silent gates (not
 * juvenile, cooldown `<= 0`, enough energy to attempt and to pay) - organisms that don't clear
 * them simply don't attempt, no event. Every threshold is the organism's own gene
 * (docs/decisions/0006). An attempting organism is blocked by, in order, the population cap and
 * then the lack of an eligible, not-yet-paired partner within its own `searchRadius`; both record
 * a failed `reproduction-attempted`. On success, each parent pays its own cost and resets its own
 * cooldown, and a child is born near the parents' midpoint with `parentIds` in ascending order.
 * The child's genome is built from both parents' genomes by recombination then mutation, drawing
 * only from the `genetics` stream (the lower-id parent is "mother"), and is registered in the
 * lineage store under a new `GenomeId`; under the brain controller each parent contributes its
 * learned weights according to `genetics.learningInheritance` (docs/learning/brain.md) and the
 * child starts with a fresh `BrainState`; spawn jitter and heading use the `reproduction` stream.
 */
export class ReproductionSystem {
  private readonly layout: BrainLayout
  private readonly readiness: ReproductionReadiness
  /** The cluster layout has no walls (docs/decisions/0014). */
  private readonly unbounded: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly organismIndex: SpatialHash<OrganismState>,
    private readonly ids: IdGenerator,
    private readonly recombiner: RecombinationStrategy,
    private readonly geneticsRandom: RandomSource,
    private readonly lineage: LineageStore,
    private readonly random: SeededRandom,
    private readonly events: EventLog,
    private readonly species: SpeciesTracker = NO_SPECIES,
    ecology: EcologyModel | null = null,
    /** The eggs in the world; they count against `maxPopulation` with the clutches being carried (ADR 0027). */
    private readonly eggs: EggStore = new EggStore()
  ) {
    this.unbounded = ecology !== null && ecology.clusters !== null
    this.readiness = new ReproductionReadiness(config, ecology)
    this.layout = brainLayoutOf(architectureOf(config.genetics.brain))
  }

  /**
   * The genome a parent contributes to recombination: its own, or - when learning is inherited
   * (`partial` or `lamarckian`) - one whose learnable weights are moved toward what the parent
   * learned. Only the learnable tail of the weights can differ, and the id is unchanged.
   */
  private effectiveGenome(genome: Genome, brain: BrainState | null): Genome {
    const { mode, fraction } = this.config.genetics.learningInheritance
    if (brain === null || mode === 'baldwinian') return genome
    const { learnOffset } = this.layout
    const tail = inheritedBrainWeights(
      genome.brain.weights.slice(learnOffset),
      brain.learned,
      mode,
      fraction
    )
    return genomeFromParts({
      id: genome.id,
      parentIds: genome.parentIds,
      vector: genomeToVector(genome),
      architecture: genome.brain.architecture,
      weights: genome.brain.weights.slice(0, learnOffset).concat(tail),
      body: genome.body.genes
    })
  }

  /** With `species.reproductiveIsolation`, only members of one species mate. */
  private sameSpecies(a: OrganismState, b: OrganismState): boolean {
    if (!this.config.species.enabled || !this.config.species.reproductiveIsolation) return true
    return this.species.speciesOf(a.id) === this.species.speciesOf(b.id)
  }

  update(tick: number): void {
    const dt = this.config.timestep
    const { width, height } = this.config.environment
    const unbounded = this.unbounded

    const { sexes, eggs: eggConfig } = this.config.reproduction
    const sexed = sexes.enabled
    const eggsOn = eggConfig.enabled

    const initiators = this.organisms.values()
    // Eggs and carried clutches are creatures-to-be and count against the population cap (ADR 0027);
    // with eggs off both are zero and the cap is exactly the old one.
    let committed = eggsOn ? this.eggs.size : 0
    for (const organism of initiators) {
      organism.reproductionCooldownRemaining = Math.max(
        0,
        organism.reproductionCooldownRemaining - dt
      )
      if (organism.pregnancy !== null) committed += 1
    }

    const pairedIds = new Set<EntityId>()
    for (const organism of initiators) {
      const genome = organism.genome
      if (!this.readiness.isReady(organism, tick)) continue
      if (pairedIds.has(organism.id)) continue

      if (this.organisms.size + committed >= this.config.maxPopulation) {
        this.events.record({
          type: 'reproduction-attempted',
          tick,
          organismId: organism.id,
          partnerId: null,
          childId: null,
          succeeded: false,
          failureReason: 'population-cap'
        })
        continue
      }

      const partnerHit = this.organismIndex.nearestWhere(
        { x: organism.x, y: organism.y },
        genome.reproduction.searchRadius,
        (item) =>
          item.id !== organism.id &&
          (!sexed || item.sex !== organism.sex) &&
          this.sameSpecies(organism, item) &&
          !pairedIds.has(item.id) &&
          this.readiness.isReady(item, tick)
      )
      if (!partnerHit) {
        this.events.record({
          type: 'reproduction-attempted',
          tick,
          organismId: organism.id,
          partnerId: null,
          childId: null,
          succeeded: false,
          failureReason: 'no-partner'
        })
        continue
      }

      const partner = partnerHit.item
      pairedIds.add(organism.id)
      pairedIds.add(partner.id)
      organism.energy -= this.readiness.costFor(organism, tick)
      partner.energy -= this.readiness.costFor(partner, tick)
      organism.reproductionCooldownRemaining = genome.reproduction.cooldown
      partner.reproductionCooldownRemaining = partner.genome.reproduction.cooldown

      // With two sexes the female is the mother; otherwise the lower id is (as ever).
      const [mother, father] = sexed
        ? organism.sex === 0
          ? [organism, partner]
          : [partner, organism]
        : organism.id < partner.id
          ? [organism, partner]
          : [partner, organism]
      const parentIds: EntityId[] = [mother.id, father.id]
      const childGenome = this.recombiner.combine(
        this.effectiveGenome(mother.genome, mother.brain),
        this.effectiveGenome(father.genome, father.brain),
        this.geneticsRandom
      )

      if (eggsOn) {
        // The child is conceived now (its genome is fixed) and carried until it is laid (ADR 0027).
        const energy = Math.min(
          genome.reproduction.offspringInvestment + partner.genome.reproduction.offspringInvestment,
          maxEnergyOf(childGenome, this.config)
        )
        mother.pregnancy = {
          genome: childGenome,
          fatherId: father.id,
          speciesId: this.species.speciesOf(mother.id) ?? null,
          energy,
          layTick: tick + Math.max(1, Math.ceil(eggConfig.incubation / dt))
        }
        committed += 1
        this.events.record({
          type: 'reproduction-attempted',
          tick,
          organismId: organism.id,
          partnerId: partner.id,
          childId: null,
          succeeded: true,
          failureReason: null
        })
        continue
      }
      const childId = this.ids.allocate()

      const midX = (organism.x + partner.x) / 2
      const midY = (organism.y + partner.y) / 2
      const radius = bodyRadiusOf(genome, this.config)
      const offsetX = midX + (this.random.float() * 2 - 1) * radius
      const offsetY = midY + (this.random.float() * 2 - 1) * radius
      // The field has walls; the cluster layout is unbounded (docs/decisions/0014).
      const x = unbounded ? offsetX : clamp(offsetX, 0, width)
      const y = unbounded ? offsetY : clamp(offsetY, 0, height)
      const heading = wrapAngle(this.random.float() * TWO_PI)
      // One draw decides the child's sex (ADR 0027); none with a single sex, so the stream is as before.
      const sex: 0 | 1 = sexed ? (this.random.float() < 0.5 ? 0 : 1) : 0

      const childEnergy = Math.min(
        genome.reproduction.offspringInvestment + partner.genome.reproduction.offspringInvestment,
        maxEnergyOf(childGenome, this.config)
      )
      const child: OrganismState = {
        id: childId,
        parentIds,
        genome: childGenome,
        x,
        y,
        vx: 0,
        vy: 0,
        heading,
        age: 0,
        energy: childEnergy,
        health: maxHealthOf(childGenome, this.config),
        birthTick: tick,
        reproductionCooldownRemaining: 0,
        lastTurnMagnitude: 0,
        gut: 0,
        biteCooldown: 0,
        brain:
          this.config.learning.controller === 'brain'
            ? createBrainState(childGenome, this.layout, childEnergy)
            : null,
        sex,
        pregnancy: null
      }
      this.organisms.add(child)
      this.lineage.register({
        genomeId: childGenome.id,
        parentGenomeIds: childGenome.parentIds,
        organismId: childId,
        tick
      })
      const speciesId = this.species.assign({
        organismId: childId,
        genome: childGenome,
        parentOrganismId: mother.id,
        tick
      })

      this.events.record({
        type: 'organism-born',
        tick,
        organismId: childId,
        genomeId: childGenome.id,
        parentIds,
        speciesId,
        position: { x, y }
      })
      this.events.record({
        type: 'reproduction-attempted',
        tick,
        organismId: organism.id,
        partnerId: partner.id,
        childId,
        succeeded: true,
        failureReason: null
      })
    }
  }
}
