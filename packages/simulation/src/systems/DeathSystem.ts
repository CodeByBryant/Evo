import type { DeathCause, WorldConfig } from '@evo/contracts'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'

/**
 * Removes organisms that starved (`energy <= 0`) or died of old age (`age >= maxAge`), in
 * ascending id order. This is the only place organisms leave the active store; extinction is
 * never hidden or silently reversed (docs/simulation/update-order.md, stage 10).
 */
export class DeathSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly events: EventLog
  ) {}

  update(tick: number): void {
    for (const organism of this.organisms.values()) {
      let cause: DeathCause | null = null
      if (organism.energy <= 0) {
        cause = 'starvation'
      } else if (organism.age >= this.config.organisms.maxAge) {
        cause = 'age'
      }
      if (cause === null) continue

      this.organisms.remove(organism.id)
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
