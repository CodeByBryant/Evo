import type { WorldConfig } from '@evo/contracts'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'

/**
 * Charges the explicit, tested metabolic cost `basalCost + movementCost * speed^2` (per second of
 * simulated time) and ages every organism. Never clamps energy at zero: `DeathSystem`, which runs
 * immediately afterward, is the sole owner of removing organisms.
 */
export class MetabolismSystem {
  private readonly emitVerbose: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly events: EventLog
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
  }

  update(tick: number): void {
    const dt = this.config.timestep
    const { basalCost, movementCost } = this.config.organisms

    for (const organism of this.organisms.values()) {
      const speedSquared = organism.vx * organism.vx + organism.vy * organism.vy
      const cost = (basalCost + movementCost * speedSquared) * dt
      const previous = organism.energy
      organism.energy = previous - cost
      organism.age = organism.age + dt

      if (this.emitVerbose) {
        this.events.record({
          type: 'energy-changed',
          tick,
          organismId: organism.id,
          previous,
          current: organism.energy,
          reason: 'metabolism'
        })
      }
    }
  }
}
