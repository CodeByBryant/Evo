import type { DeathCause } from '@evo/contracts'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import type { HistoryStore } from '../history/HistoryStore'
import type { LineageStore } from '../lineage/LineageStore'

/**
 * Removes organisms that starved (`energy <= 0`) or died of old age (`age >=` its own `maxAge` gene), in
 * ascending id order. This is the only place organisms leave the active store; extinction is
 * never hidden or silently reversed (docs/simulation/update-order.md, stage 10). Owns the whole
 * "an organism died" transaction: removal, the lineage mark, the historical record, and the event, all in the same
 * loop iteration (docs/decisions/0005).
 */
export class DeathSystem {
  constructor(
    private readonly organisms: OrganismStore,
    private readonly events: EventLog,
    private readonly history: HistoryStore,
    private readonly lineage: LineageStore
  ) {}

  update(tick: number): void {
    for (const organism of this.organisms.values()) {
      let cause: DeathCause | null = null
      if (organism.energy <= 0) {
        cause = 'starvation'
      } else if (organism.age >= organism.genome.physical.maxAge) {
        cause = 'age'
      }
      if (cause === null) continue

      this.organisms.remove(organism.id)
      this.lineage.markDeath(organism.id)
      this.history.append({
        id: organism.id,
        genomeId: organism.genome.id,
        parentIds: organism.parentIds,
        birthTick: organism.birthTick,
        deathTick: tick,
        deathCause: cause,
        brain: organism.brain
          ? {
              rewardTotal: organism.brain.rewardTotal,
              updates: organism.brain.updates,
              weightChange: organism.brain.weightChange
            }
          : null
      })
      this.events.record({
        type: 'organism-died',
        tick,
        organismId: organism.id,
        cause,
        position: { x: organism.x, y: organism.y }
      })
    }
  }
}
