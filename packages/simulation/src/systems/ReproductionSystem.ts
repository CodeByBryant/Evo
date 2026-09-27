import type { EntityId, WorldConfig } from '@evo/contracts'
import type { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { clamp, TWO_PI, wrapAngle } from '../math/scalar'
import { lifeStageFor } from '../organisms/lifeStage'
import type { SeededRandom } from '../random/SeededRandom'
import type { SpatialHash } from '../spatial/SpatialHash'

/**
 * Local, continuous reproduction: no global generations, no asexual fallback
 * (docs/decisions/0005). Every organism's `reproductionCooldownRemaining` is first decremented by
 * `deltaTime` (floored at zero); then organisms are processed in ascending id, each considered at
 * most once as an initiator. An organism attempts only once it clears three silent gates (not
 * juvenile, cooldown `<= 0`, `energy >= reproduction.minEnergy`) - organisms that don't clear them
 * simply don't attempt, no event. An attempting organism is blocked by, in order, the population
 * cap and then the lack of an eligible, not-yet-paired partner within `searchRadius`; both record
 * a failed `reproduction-attempted`. On success, each parent pays `reproduction.energyCost` and
 * resets its cooldown; the child starts at age 0 near the parents' midpoint, with `parentIds` in
 * ascending order.
 */
export class ReproductionSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly organismIndex: SpatialHash<OrganismState>,
    private readonly ids: IdGenerator,
    private readonly random: SeededRandom,
    private readonly events: EventLog
  ) {}

  update(tick: number): void {
    const dt = this.config.timestep
    const { maturityAge, senescenceAge, maxEnergy, radius } = this.config.organisms
    const { minEnergy, energyCost, offspringEnergy, cooldown, searchRadius } =
      this.config.reproduction
    const { width, height } = this.config.environment
    const thresholds = { maturityAge, senescenceAge }

    const initiators = this.organisms.values()
    for (const organism of initiators) {
      organism.reproductionCooldownRemaining = Math.max(
        0,
        organism.reproductionCooldownRemaining - dt
      )
    }

    const pairedIds = new Set<EntityId>()
    for (const organism of initiators) {
      if (lifeStageFor(organism.age, thresholds) === 'juvenile') continue
      if (organism.reproductionCooldownRemaining > 0) continue
      if (organism.energy < minEnergy) continue
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

      const hits = this.organismIndex.queryRadius({ x: organism.x, y: organism.y }, searchRadius)
      const partnerHit = hits.find(
        (hit) =>
          hit.item.id !== organism.id &&
          !pairedIds.has(hit.item.id) &&
          lifeStageFor(hit.item.age, thresholds) !== 'juvenile' &&
          hit.item.reproductionCooldownRemaining <= 0 &&
          hit.item.energy >= minEnergy
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
      organism.energy -= energyCost
      partner.energy -= energyCost
      organism.reproductionCooldownRemaining = cooldown
      partner.reproductionCooldownRemaining = cooldown

      const childId = this.ids.allocate()
      const parentIds: EntityId[] =
        organism.id < partner.id ? [organism.id, partner.id] : [partner.id, organism.id]
      const midX = (organism.x + partner.x) / 2
      const midY = (organism.y + partner.y) / 2
      const x = clamp(midX + (this.random.float() * 2 - 1) * radius, 0, width)
      const y = clamp(midY + (this.random.float() * 2 - 1) * radius, 0, height)
      const heading = wrapAngle(this.random.float() * TWO_PI)

      const child: OrganismState = {
        id: childId,
        parentIds,
        x,
        y,
        vx: 0,
        vy: 0,
        heading,
        age: 0,
        energy: Math.min(offspringEnergy, maxEnergy),
        birthTick: tick,
        reproductionCooldownRemaining: 0,
        lastTurnMagnitude: 0
      }
      this.organisms.add(child)

      this.events.record({
        type: 'organism-born',
        tick,
        organismId: childId,
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
