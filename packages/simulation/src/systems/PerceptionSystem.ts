import type { PerceptionBuffer } from '../buffers/types'
import type { OrganismStore } from '../entities/OrganismStore'
import type { ResourceState } from '../entities/ResourceStore'
import type { SpatialHash } from '../spatial/SpatialHash'

/**
 * Finds the nearest resource within each organism's own sensor range (its `sensorRadius` gene).
 * Writes only the buffer.
 */
export class PerceptionSystem {
  constructor(
    private readonly organisms: OrganismStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly perceptionBuffer: PerceptionBuffer
  ) {}

  update(): void {
    this.perceptionBuffer.clear()
    for (const organism of this.organisms.values()) {
      const hit = this.resourceIndex.nearest(
        { x: organism.x, y: organism.y },
        organism.genome.sensory.sensorRadius
      )
      this.perceptionBuffer.set(
        organism.id,
        hit
          ? {
              resourceId: hit.item.id,
              position: { x: hit.item.x, y: hit.item.y },
              distanceSquared: hit.distanceSquared
            }
          : null
      )
    }
  }
}
