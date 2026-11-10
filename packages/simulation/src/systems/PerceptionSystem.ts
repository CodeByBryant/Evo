import type { CapabilityFactors, Vision, WorldConfig } from '@evo/contracts'
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
import type { ReproductionReadiness } from '../organisms/reproductionReadiness'
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
    private readonly mateSensing?: MateSensing
  ) {}

  // Scratch state for the organism being processed, read by the scan callbacks below. A directional
  // body's cone axes in the world frame are worked out once per organism, not once per candidate.
  private cVision: Vision | null = null
  private cBody: CapabilityFactors | null = null
  private cScale = 1
  private cModified = false
  private cSelf = 0
  private cX = 0
  private cY = 0
  private readonly cAxisX: number[] = []
  private readonly cAxisY: number[] = []
  private bestFood: ResourceState | null = null
  private bestFoodDistance = Infinity
  private bestPeer: OrganismState | null = null
  private bestPeerDistance = Infinity

  /** One food candidate of a directional body: keeps the nearest one it can see (ties to the lower id). */
  private readonly visitFood = (item: ResourceState, distanceSquared: number): void => {
    const dx = item.x - this.cX
    const dy = item.y - this.cY
    let reach = this.reachAlong(dx, dy, distanceSquared)
    if (this.cModified) {
      const eco = this.ecology as EcologyModel
      reach *= eco.kind(item.kind).detectability
      reach *= (this.cBody as CapabilityFactors).foodDetection[item.kind] ?? 1
    }
    if (distanceSquared > reach * reach) return
    if (
      distanceSquared < this.bestFoodDistance ||
      (distanceSquared === this.bestFoodDistance && item.id < (this.bestFood as ResourceState).id)
    ) {
      this.bestFood = item
      this.bestFoodDistance = distanceSquared
    }
  }

  /** One organism candidate of a directional body: keeps the nearest one it can see (ties to the lower id). */
  private readonly visitPeer = (item: OrganismState, distanceSquared: number): void => {
    if (item.id === this.cSelf) return
    const dx = item.x - this.cX
    const dy = item.y - this.cY
    const reach = this.reachAlong(dx, dy, distanceSquared)
    if (distanceSquared > reach * reach) return
    if (
      distanceSquared < this.bestPeerDistance ||
      (distanceSquared === this.bestPeerDistance && item.id < (this.bestPeer as OrganismState).id)
    ) {
      this.bestPeer = item
      this.bestPeerDistance = distanceSquared
    }
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
      const widest = directional ? this.widestReach(vision) * scale : radius
      if (directional) this.aim(vision, body, organism, scale, modified)

      if (directional) {
        this.bestFood = null
        this.bestFoodDistance = Infinity
        this.resourceIndex.scan(origin, widest, this.visitFood)
        const best = this.bestFood as ResourceState | null
        this.perceptionBuffer.set(
          organism.id,
          best
            ? {
                resourceId: best.id,
                position: { x: best.x, y: best.y },
                distanceSquared: this.bestFoodDistance,
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
        const hit = this.resourceIndex.nearestWhere(origin, radius, (item, distanceSquared) => {
          const detection = body.foodDetection[item.kind] ?? 1
          const reach = radius * eco.kind(item.kind).detectability * detection
          return distanceSquared <= reach * reach
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

      if (this.peers && directional) {
        this.bestPeer = null
        this.bestPeerDistance = Infinity
        this.peers.organismIndex.scan(origin, widest, this.visitPeer)
        const seen = this.bestPeer as OrganismState | null
        this.peers.buffer.set(
          organism.id,
          seen
            ? {
                organismId: seen.id,
                position: { x: seen.x, y: seen.y },
                distanceSquared: this.bestPeerDistance
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
          const hit = mating.organismIndex.nearestWhere(
            origin,
            mating.radius * signalCap,
            (item, distanceSquared) => {
              if (item.id === organism.id) return false
              const reach = mating.radius * factorsOf(item.genome, this.config).mateSignal
              return (
                distanceSquared <= reach * reach &&
                mating.compatible(organism, item) &&
                mating.readiness.isReady(item, tick)
              )
            }
          )
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
            ? edge <= this.reachAlong(dx, dy, distanceSquared)
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
   * Sets up the scratch state for one directional organism: its cones' axes in the world frame (the
   * body-frame axis rotated by the heading with the angle-sum identities, worked out once here).
   */
  private aim(
    vision: Vision,
    body: CapabilityFactors,
    organism: OrganismState,
    scale: number,
    modified: boolean
  ): void {
    const cosH = cos(organism.heading)
    const sinH = sin(organism.heading)
    this.cVision = vision
    this.cBody = body
    this.cScale = scale
    this.cModified = modified
    this.cSelf = organism.id
    this.cX = organism.x
    this.cY = organism.y
    const cones = vision.cones
    for (let k = 0; k < cones.length; k++) {
      const cone = cones[k] as Vision['cones'][number]
      this.cAxisX[k] = cosH * cone.axisCos - sinH * cone.axisSin
      this.cAxisY[k] = sinH * cone.axisCos + cosH * cone.axisSin
    }
  }

  /**
   * How far the aimed organism sees toward a target at offset (`dx`, `dy`) and squared distance
   * `distanceSquared`: its all-round touch radius, or the reach of the farthest eye whose cone
   * holds the target. The test is one dot-product comparison, `dot >= distance * cos(half)`, so no
   * inverse trigonometry is needed.
   */
  private reachAlong(dx: number, dy: number, distanceSquared: number): number {
    const vision = this.cVision as Vision
    const sensorRadius = this.config.organisms.sensorRadius
    let best = vision.floor
    const distance = Math.sqrt(distanceSquared)
    const cones = vision.cones
    for (let k = 0; k < cones.length; k++) {
      const cone = cones[k] as Vision['cones'][number]
      if (cone.reach <= best) continue
      if (
        dx * (this.cAxisX[k] as number) + dy * (this.cAxisY[k] as number) >=
        distance * cone.cosHalf
      )
        best = cone.reach
    }
    return sensorRadius * best * this.cScale
  }
}
