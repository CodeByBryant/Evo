import type { EntityId, WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { copyGenomeAs } from '../genetics/GenomeFactory'
import { clamp, TWO_PI, wrapAngle } from '../math/scalar'
import { lifeStageFor } from '../organisms/lifeStage'
import { maxEnergyOf, reproductionCostOf, reproductionThresholdOf } from '../organisms/traits'
import type { SeededRandom } from '../random/SeededRandom'
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
 * The child's genome is a copy of its mother's (the lower-id parent) under a new `GenomeId`.
 */
export class ReproductionSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly organismIndex: SpatialHash<OrganismState>,
    private readonly ids: IdGenerator,
    private readonly genomeIds: IdGenerator,
    private readonly random: SeededRandom,
    private readonly events: EventLog
  ) {}

  update(tick: number): void {
    const dt = this.config.timestep
    const { width, height } = this.config.environment

    const initiators = this.organisms.values()
    for (const organism of initiators) {
      organism.reproductionCooldownRemaining = Math.max(
        0,
        organism.reproductionCooldownRemaining - dt
      )
    }

    const pairedIds = new Set<EntityId>()
    for (const organism of initiators) {
      const genome = organism.genome
      if (lifeStageFor(organism.age, genome.physical) === 'juvenile') continue
      if (organism.reproductionCooldownRemaining > 0) continue
      if (organism.energy < reproductionThresholdOf(genome, this.config)) continue
      if (pairedIds.has(organism.id)) continue

      if (this.organisms.size >= this.config.maxPopulation) {
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

      const hits = this.organismIndex.queryRadius(
        { x: organism.x, y: organism.y },
        genome.reproduction.searchRadius
      )
      const partnerHit = hits.find(
        (hit) =>
          hit.item.id !== organism.id &&
          !pairedIds.has(hit.item.id) &&
          lifeStageFor(hit.item.age, hit.item.genome.physical) !== 'juvenile' &&
          hit.item.reproductionCooldownRemaining <= 0 &&
          hit.item.energy >= reproductionThresholdOf(hit.item.genome, this.config)
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
      organism.energy -= reproductionCostOf(genome, this.config)
      partner.energy -= reproductionCostOf(partner.genome, this.config)
      organism.reproductionCooldownRemaining = genome.reproduction.cooldown
      partner.reproductionCooldownRemaining = partner.genome.reproduction.cooldown

      const childId = this.ids.allocate()
      const [mother, father] = organism.id < partner.id ? [organism, partner] : [partner, organism]
      const parentIds: EntityId[] = [mother.id, father.id]
      const parentGenomeIds =
        mother.genome.id < father.genome.id
          ? [mother.genome.id, father.genome.id]
          : [father.genome.id, mother.genome.id]
      const childGenome = copyGenomeAs(mother.genome, this.genomeIds.allocate(), parentGenomeIds)

      const midX = (organism.x + partner.x) / 2
      const midY = (organism.y + partner.y) / 2
      const radius = genome.physical.radius
      const x = clamp(midX + (this.random.float() * 2 - 1) * radius, 0, width)
      const y = clamp(midY + (this.random.float() * 2 - 1) * radius, 0, height)
      const heading = wrapAngle(this.random.float() * TWO_PI)

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
        energy: Math.min(
          genome.reproduction.offspringInvestment + partner.genome.reproduction.offspringInvestment,
          maxEnergyOf(childGenome, this.config)
        ),
        birthTick: tick,
        reproductionCooldownRemaining: 0,
        lastTurnMagnitude: 0
      }
      this.organisms.add(child)

      this.events.record({
        type: 'organism-born',
        tick,
        organismId: childId,
        genomeId: childGenome.id,
        parentIds,
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
