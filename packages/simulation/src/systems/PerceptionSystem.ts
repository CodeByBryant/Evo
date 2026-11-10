import type { Vision, WorldConfig } from '@evo/contracts'
import type {
  HazardBuffer,
  MateBuffer,
  PeerBuffer,
  PerceptionBuffer,
  PerceivedHazard,
  PerceivedPeer
} from '../buffers/types'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { HazardStore } from '../ecology/HazardStore'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { ResourceState } from '../entities/ResourceStore'
import { cos, sin } from '../math/trig'
import { factorsOf } from '../organisms/bodyFactors'
import { bodyRadiusOf } from '../organisms/traits'
import type { ReproductionReadiness } from '../organisms/reproductionReadiness'
import { SIGHT_BLOCKER_MARGIN, segmentHitsCircle } from '../spatial/sight'
import type { SpatialHash, SpatialHit } from '../spatial/SpatialHash'

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

/** What `PerceptionSystem` needs to find the nearest eligible partner (brain controller only, ADR 0010). */
export interface MateSensing {
  readonly organismIndex: SpatialHash<OrganismState>
  readonly buffer: MateBuffer
  readonly readiness: ReproductionReadiness
  /** Distance at which a ready organism senses other ready organisms (`reproduction.mateSenseRadius`). */
  readonly radius: number
  /** Whether two organisms may mate (same species when `species.reproductiveIsolation` is on). */
  readonly compatible: (a: OrganismState, b: OrganismState) => boolean
}

/**
 * Finds the nearest resource within each organism's own sensor range (the baseline range times its eyes),
 * and, when `peers` is given, the nearest other organism within the same range, and, when
 * `hazardSensing` is given, the hazard whose edge is nearest, and, when `mateSensing` is given,
 * the nearest eligible partner - but only for an organism that is itself ready to reproduce, so
 * the brain is never drawn toward a partner while it should be foraging. Writes only the buffers.
 *
 * A body whose eyes are all all-round (the founder's) sees a circle. Other bodies see an
 * all-round touch radius plus a cone for each eye, as far as that eye reaches (ADR 0016
 * "Directional vision"); food, other organisms and hazards are only perceived inside them. The
 * mating signal and the home sense are not vision and stay all-round.
 *
 * When regions, seasons or resource kinds are on, the range shrinks with the local visibility
 * and a resource is only seen within its kind's `detectability` share of it. With them all off the
 * cheaper nearest-neighbour scan of Phase 5 is kept, and gives identical results.
 */
export class PerceptionSystem {
  constructor(
    /** The baseline sensor range, which each body's eyes and sniffers scale (docs/decisions/0015). */
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly resourceIndex: SpatialHash<ResourceState>,
    private readonly perceptionBuffer: PerceptionBuffer,
    private readonly peers?: PeerSensing,
    private readonly ecology: EcologyModel | null = null,
    private readonly hazardSensing?: HazardSensing,
    private readonly mateSensing?: MateSensing,
    /** When given, creatures' bodies block sight (`perception.organismsBlockSight`). */
    private readonly blockers?: { readonly organismIndex: SpatialHash<OrganismState> }
  ) {}

  private readonly foodScratch: SpatialHit<ResourceState>[] = []
  private readonly peerScratch: SpatialHit<OrganismState>[] = []

  /** Whether another body stands on the line from `viewer` to (`tx`, `ty`); `targetId` is the peer being looked at, if any. */
  private blocked(viewer: OrganismState, tx: number, ty: number, targetId: number | null): boolean {
    const index = (this.blockers as { organismIndex: SpatialHash<OrganismState> }).organismIndex
    const dx = tx - viewer.x
    const dy = ty - viewer.y
    const middle = { x: viewer.x + dx / 2, y: viewer.y + dy / 2 }
    const around = Math.sqrt(dx * dx + dy * dy) / 2 + SIGHT_BLOCKER_MARGIN
    for (const hit of index.queryRadius(middle, around)) {
      const other = hit.item
      if (other.id === viewer.id || other.id === targetId) continue
      if (
        segmentHitsCircle(
          viewer.x,
          viewer.y,
          tx,
          ty,
          other.x,
          other.y,
          bodyRadiusOf(other.genome, this.config)
        )
      ) {
        return true
      }
    }
    return false
  }

  update(tick = 0): void {
    this.perceptionBuffer.clear()
    this.peers?.buffer.clear()
    this.hazardSensing?.buffer.clear()
    this.mateSensing?.buffer.clear()
    const eco = this.ecology
    const modified = eco !== null && eco.perceptionModified
    const zones = this.hazardSensing ? this.hazardSensing.hazards.values() : []

    for (const organism of this.organisms.values()) {
      const body = factorsOf(organism.genome, this.config)
      const sensor = this.config.organisms.sensorRadius * body.senseRange
      const scale = modified ? eco.visibilityScale(organism.x, organism.y, tick) : 1
      const radius = modified ? sensor * scale : sensor
      const origin = { x: organism.x, y: organism.y }
      const vision = body.vision
      const directional = !vision.omni
      // The heading's cosine and sine, shared by every cone test of this organism.
      const cosH = directional ? cos(organism.heading) : 1
      const sinH = directional ? sin(organism.heading) : 0
      const widest = directional ? this.widestReach(vision) * scale : radius

      if (this.blockers !== undefined) {
        // The nearest food that is in reach, in the cone and not hidden behind another creature.
        const found = this.foodScratch
        found.length = 0
        for (const candidate of this.resourceIndex.queryRadius(origin, widest)) {
          let reach = directional
            ? this.reachToward(
                vision,
                cosH,
                sinH,
                candidate.item.x - organism.x,
                candidate.item.y - organism.y,
                candidate.distanceSquared,
                scale
              )
            : radius
          if (modified) {
            reach *= eco.kind(candidate.item.kind).detectability
            reach *= body.foodDetection[candidate.item.kind] ?? 1
          }
          if (candidate.distanceSquared <= reach * reach) found.push(candidate)
        }
        found.sort((a, b) => a.distanceSquared - b.distanceSquared || a.item.id - b.item.id)
        let seenFood: SpatialHit<ResourceState> | null = null
        const limit = Math.min(found.length, this.config.perception.maxSightChecks)
        for (let i = 0; i < limit; i++) {
          const candidate = found[i] as SpatialHit<ResourceState>
          if (!this.blocked(organism, candidate.item.x, candidate.item.y, null)) {
            seenFood = candidate
            break
          }
        }
        this.perceptionBuffer.set(
          organism.id,
          seenFood
            ? {
                resourceId: seenFood.item.id,
                position: { x: seenFood.item.x, y: seenFood.item.y },
                distanceSquared: seenFood.distanceSquared,
                kind: seenFood.item.kind
              }
            : null
        )
      } else if (directional) {
        let best: ResourceState | null = null
        let bestDistance = Infinity
        for (const candidate of this.resourceIndex.queryRadius(origin, widest)) {
          const dx = candidate.item.x - organism.x
          const dy = candidate.item.y - organism.y
          let reach = this.reachToward(vision, cosH, sinH, dx, dy, candidate.distanceSquared, scale)
          if (modified) {
            reach *= eco.kind(candidate.item.kind).detectability
            reach *= body.foodDetection[candidate.item.kind] ?? 1
          }
          if (candidate.distanceSquared > reach * reach) continue
          if (
            candidate.distanceSquared < bestDistance ||
            (candidate.distanceSquared === bestDistance &&
              candidate.item.id < (best as ResourceState).id)
          ) {
            best = candidate.item
            bestDistance = candidate.distanceSquared
          }
        }
        this.perceptionBuffer.set(
          organism.id,
          best
            ? {
                resourceId: best.id,
                position: { x: best.x, y: best.y },
                distanceSquared: bestDistance,
                kind: best.kind
              }
            : null
        )
      } else if (!modified) {
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
          const detection = body.foodDetection[candidate.item.kind] ?? 1
          const reach = radius * eco.kind(candidate.item.kind).detectability * detection
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

      if (this.peers && this.blockers !== undefined) {
        const found = this.peerScratch
        found.length = 0
        for (const candidate of this.peers.organismIndex.queryRadius(origin, widest)) {
          if (candidate.item.id === organism.id) continue
          const reach = directional
            ? this.reachToward(
                vision,
                cosH,
                sinH,
                candidate.item.x - organism.x,
                candidate.item.y - organism.y,
                candidate.distanceSquared,
                scale
              )
            : radius
          if (candidate.distanceSquared <= reach * reach) found.push(candidate)
        }
        found.sort((a, b) => a.distanceSquared - b.distanceSquared || a.item.id - b.item.id)
        let seenPeer: SpatialHit<OrganismState> | null = null
        const limit = Math.min(found.length, this.config.perception.maxSightChecks)
        for (let i = 0; i < limit; i++) {
          const candidate = found[i] as SpatialHit<OrganismState>
          if (!this.blocked(organism, candidate.item.x, candidate.item.y, candidate.item.id)) {
            seenPeer = candidate
            break
          }
        }
        this.peers.buffer.set(
          organism.id,
          seenPeer
            ? {
                organismId: seenPeer.item.id,
                position: { x: seenPeer.item.x, y: seenPeer.item.y },
                distanceSquared: seenPeer.distanceSquared
              }
            : null
        )
      } else if (this.peers && directional) {
        let seen: OrganismState | null = null
        let seenDistance = Infinity
        for (const candidate of this.peers.organismIndex.queryRadius(origin, widest)) {
          if (candidate.item.id === organism.id) continue
          const dx = candidate.item.x - organism.x
          const dy = candidate.item.y - organism.y
          const reach = this.reachToward(
            vision,
            cosH,
            sinH,
            dx,
            dy,
            candidate.distanceSquared,
            scale
          )
          if (candidate.distanceSquared > reach * reach) continue
          if (
            candidate.distanceSquared < seenDistance ||
            (candidate.distanceSquared === seenDistance &&
              candidate.item.id < (seen as OrganismState).id)
          ) {
            seen = candidate.item
            seenDistance = candidate.distanceSquared
          }
        }
        this.peers.buffer.set(
          organism.id,
          seen
            ? {
                organismId: seen.id,
                position: { x: seen.x, y: seen.y },
                distanceSquared: seenDistance
              }
            : null
        )
      } else if (this.peers) {
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

      const mating = this.mateSensing
      if (mating) {
        let mate: PerceivedPeer | null = null
        if (mating.readiness.isReady(organism, tick)) {
          // A pheromone gland carries a creature's signal further (ADR 0016): the search reaches as
          // far as the strongest signal possible and each candidate is held to its own. Without
          // anatomy every signal is the baseline, so this is the plain search.
          const signalCap = this.config.anatomy.enabled
            ? this.config.anatomy.effects.pheromoneCap
            : 1
          const hit = mating.organismIndex
            .queryRadius(origin, mating.radius * signalCap)
            .find((candidate) => {
              if (candidate.item.id === organism.id) return false
              const reach = mating.radius * factorsOf(candidate.item.genome, this.config).mateSignal
              return (
                candidate.distanceSquared <= reach * reach &&
                mating.compatible(organism, candidate.item) &&
                mating.readiness.isReady(candidate.item, tick)
              )
            })
          if (hit) {
            mate = {
              organismId: hit.item.id,
              position: { x: hit.item.x, y: hit.item.y },
              distanceSquared: hit.distanceSquared
            }
          }
        }
        mating.buffer.set(organism.id, mate)
      }

      if (this.hazardSensing) {
        let best: PerceivedHazard | null = null
        let bestEdge = Infinity
        for (const zone of zones) {
          const dx = zone.x - organism.x
          const dy = zone.y - organism.y
          const distanceSquared = dx * dx + dy * dy
          const edge = Math.max(0, Math.sqrt(distanceSquared) - zone.radius)
          const seesIt = directional
            ? edge <= this.reachToward(vision, cosH, sinH, dx, dy, distanceSquared, scale)
            : edge <= radius
          if (seesIt && edge < bestEdge) {
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

  /** The farthest any eye of a directional body reaches, in world units (before the visibility scale). */
  private widestReach(vision: Vision): number {
    let widest = vision.floor
    for (const cone of vision.cones) if (cone.reach > widest) widest = cone.reach
    return this.config.organisms.sensorRadius * widest
  }

  /**
   * How far this directional body sees toward a target at offset (`dx`, `dy`) and squared distance
   * `distanceSquared`: its all-round touch radius, or the reach of the farthest eye whose cone
   * holds the target. The test is one dot-product comparison, `dot >= distance * cos(half)`, so no
   * inverse trigonometry is needed, and the eye's world axis comes from the body-frame axis rotated
   * by the heading with the angle-sum identities.
   */
  private reachToward(
    vision: Vision,
    cosH: number,
    sinH: number,
    dx: number,
    dy: number,
    distanceSquared: number,
    scale: number
  ): number {
    const sensorRadius = this.config.organisms.sensorRadius
    let best = vision.floor
    const distance = Math.sqrt(distanceSquared)
    for (const cone of vision.cones) {
      if (cone.reach <= best) continue
      const ux = cosH * cone.axisCos - sinH * cone.axisSin
      const uy = sinH * cone.axisCos + cosH * cone.axisSin
      if (dx * ux + dy * uy >= distance * cone.cosHalf) best = cone.reach
    }
    return sensorRadius * best * scale
  }
}
