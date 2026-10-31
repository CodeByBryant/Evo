import type { WorldConfig } from '@evo/contracts'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { MigrationTracker } from '../ecology/MigrationTracker'
import type { OrganismStore } from '../entities/OrganismStore'

/**
 * Tells the migration tracker where every organism is after it has moved (docs/ecology/ecology.md,
 * "Migration"). Reads positions, writes only the derived tracker; it changes no simulation state.
 */
export class MigrationSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly ecology: EcologyModel,
    private readonly tracker: MigrationTracker
  ) {}

  update(): void {
    if (!this.ecology.migrationOn) return
    const dt = this.config.timestep
    for (const organism of this.organisms.values()) {
      const index = this.ecology.regionIndexAt(organism.x, organism.y)
      const type = this.ecology.regionTypeOfIndex(index)
      if (type === null) continue
      this.tracker.observe(organism.id, organism.x, organism.y, index, type, dt)
    }
  }
}
