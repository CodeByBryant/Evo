import type { PeerBuffer, PerceptionBuffer } from '../buffers/types'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { ResourceState } from '../entities/ResourceStore'
import type { SpatialHash } from '../spatial/SpatialHash'

/** What `PerceptionSystem` needs to also find the nearest other organism (brain controller only). */
export interface PeerSensing {
  readonly organismIndex: SpatialHash<OrganismState>
  readonly buffer: PeerBuffer
}

/**
 * Finds the nearest resource within each organism's own sensor range (its `sensorRadius` gene),
 * and, when `peers` is given, the nearest other organism within the same range. Writes only the
 * buffers.
 */
export class PerceptionSystem {
  constructor(
    private readonly organisms: OrganismStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly perceptionBuffer: PerceptionBuffer,
    private readonly peers?: PeerSensing
  ) {}

  update(): void {
    this.perceptionBuffer.clear()
    this.peers?.buffer.clear()
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
      if (this.peers) {
        const peer = this.peers.organismIndex
          .queryRadius({ x: organism.x, y: organism.y }, organism.genome.sensory.sensorRadius)
          .find((hit) => hit.item.id !== organism.id)
        this.peers.buffer.set(
          organism.id,
          peer
            ? {
                organismId: peer.item.id,
                position: { x: peer.item.x, y: peer.item.y },
                distanceSquared: peer.distanceSquared
              }
            : null
        )
      }
    }
  }
}
