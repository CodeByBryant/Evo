import type { HazardBuffer, PeerBuffer, PerceptionBuffer, PerceivedHazard } from '../buffers/types'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { HazardStore } from '../ecology/HazardStore'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { ResourceState } from '../entities/ResourceStore'
import type { SpatialHash } from '../spatial/SpatialHash'

/** What `PerceptionSystem` needs to also find the nearest other organism (brain controller only). */
export interface PeerSensing {
  readonly organismIndex: SpatialHash<OrganismState>
  readonly buffer: PeerBuffer
}

/** What `PerceptionSystem` needs to also find the nearest hazard (brain controller only). */
export interface HazardSensing {
  readonly hazards: HazardStore
  readonly buffer: HazardBuffer
}

/**
 * Finds the nearest resource within each organism's own sensor range (its `sensorRadius` gene),
 * and, when `peers` is given, the nearest other organism within the same range, and, when
 * `hazardSensing` is given, the hazard whose edge is nearest. Writes only the buffers.
 *
 * When regions, seasons or resource kinds are on, the range shrinks with the local visibility
 * and a resource is only seen within its kind's `detectability` share of it. With them all off the
 * cheaper nearest-neighbour scan of Phase 5 is kept, and gives identical results.
 */
export class PerceptionSystem {
  constructor(
    private readonly organisms: OrganismStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly perceptionBuffer: PerceptionBuffer,
    private readonly peers?: PeerSensing,
    private readonly ecology: EcologyModel | null = null,
    private readonly hazardSensing?: HazardSensing
  ) {}

  update(tick = 0): void {
    this.perceptionBuffer.clear()
    this.peers?.buffer.clear()
    this.hazardSensing?.buffer.clear()
    const eco = this.ecology
    const modified = eco !== null && eco.perceptionModified
    const zones = this.hazardSensing ? this.hazardSensing.hazards.values() : []

    for (const organism of this.organisms.values()) {
      const sensor = organism.genome.sensory.sensorRadius
      const radius = modified ? sensor * eco.visibilityScale(organism.x, organism.y, tick) : sensor
      const origin = { x: organism.x, y: organism.y }

      if (!modified) {
        const hit = this.resourceIndex.nearest(origin, radius)
        this.perceptionBuffer.set(
          organism.id,
          hit
            ? {
                resourceId: hit.item.id,
                position: { x: hit.item.x, y: hit.item.y },
                distanceSquared: hit.distanceSquared,
                kind: hit.item.kind
              }
            : null
        )
      } else {
        const hit = this.resourceIndex.queryRadius(origin, radius).find((candidate) => {
          const reach = radius * eco.kind(candidate.item.kind).detectability
          return candidate.distanceSquared <= reach * reach
        })
        this.perceptionBuffer.set(
          organism.id,
          hit
            ? {
                resourceId: hit.item.id,
                position: { x: hit.item.x, y: hit.item.y },
                distanceSquared: hit.distanceSquared,
                kind: hit.item.kind
              }
            : null
        )
      }

      if (this.peers) {
        const peer = this.peers.organismIndex.nearest(origin, radius, organism.id)
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

      if (this.hazardSensing) {
        let best: PerceivedHazard | null = null
        let bestEdge = Infinity
        for (const zone of zones) {
          const dx = zone.x - organism.x
          const dy = zone.y - organism.y
          const distanceSquared = dx * dx + dy * dy
          const edge = Math.max(0, Math.sqrt(distanceSquared) - zone.radius)
          if (edge <= radius && edge < bestEdge) {
            bestEdge = edge
            best = {
              hazardId: zone.id,
              position: { x: zone.x, y: zone.y },
              radius: zone.radius,
              distanceSquared
            }
          }
        }
        this.hazardSensing.buffer.set(organism.id, best)
      }
    }
  }
}
