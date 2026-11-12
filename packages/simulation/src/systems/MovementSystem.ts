import type { WorldConfig } from '@evo/contracts'
import type { IntentBuffer, OrganismIntent } from '../buffers/types'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { clamp, wrapAngle } from '../math/scalar'
import { cos, sin } from '../math/trig'
import type { EcologyModel } from '../ecology/EcologyModel'
import type { Obstacle, ObstacleField } from '../ecology/ObstacleField'
import { factorsOf } from '../organisms/bodyFactors'
import { lifeStageFor } from '../organisms/lifeStage'
import { bodyRadiusOf } from '../organisms/traits'

const NO_INTENT: OrganismIntent = { turn: 0, thrust: 0, strafe: 0, interact: false }

/** Passes over the obstacles near a body: overlapping circles of a wall can push it back into a neighbour. */
const PUSH_PASSES = 3

/**
 * Applies each organism's intent: turns it (bounded by `organisms.maxTurnRate` scaled by the body's torque), sets its speed (bounded by
 * the baseline `organisms.maxSpeed` scaled by the body's thrust and, for juveniles, down), adds any lateral `strafe` velocity, and moves it,
 * clamped to the world rectangle. Velocity is always derived from heading, speed and strafe, never set
 * independently. Also records the turn
 * actually applied as `lastTurnMagnitude`, which `MetabolismSystem` reads afterward.
 *
 * Obstacles that block movement (ADR 0022) are solid: after the move a body is pushed out of every
 * such circle to the distance of its own radius plus the circle's, along the line from the circle's
 * centre, so it slides along an edge and stops head-on. A body that was pushed has the velocity it
 * actually achieved (the displacement over the tick, no faster than its top speed), so the
 * velocity the brain senses and the energy cost agree with what happened. With no such obstacles
 * this is exactly the unobstructed move.
 */
export class MovementSystem {
  private readonly emitVerbose: boolean
  /** Whether regions or seasons scale top speed. */
  private readonly terrainSlows: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly intentBuffer: IntentBuffer,
    private readonly events: EventLog,
    private readonly ecology: EcologyModel | null = null,
    obstacles: ObstacleField | null = null
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
    this.terrainSlows = ecology !== null && ecology.movementModified
    this.obstacles = obstacles !== null && obstacles.maxMovementRadius > 0 ? obstacles : null
  }

  /** The obstacle field when it holds anything that blocks movement, else `null` (the unobstructed path). */
  private readonly obstacles: ObstacleField | null
  private readonly near: Obstacle[] = []
  private pushedX = 0
  private pushedY = 0
  private readonly gather = (o: Obstacle): void => {
    if (o.blocksMovement) this.near.push(o)
  }

  /**
   * Pushes a body of `radius` at (`x`, `y`) out of every solid circle it overlaps, into
   * `pushedX/pushedY`. Circles are taken in id order so the result does not depend on the index's
   * bucket order; a centre exactly on a circle's centre is sent back along the way it came.
   */
  private pushOut(fromX: number, fromY: number, x: number, y: number, radius: number): void {
    const field = this.obstacles as ObstacleField
    const near = this.near
    near.length = 0
    field.scan(x, y, radius + field.maxMovementRadius, this.gather)
    let px = x
    let py = y
    if (near.length > 0) {
      near.sort((a, b) => a.id - b.id)
      for (let pass = 0; pass < PUSH_PASSES; pass++) {
        let moved = false
        for (const o of near) {
          const reach = o.radius + radius
          const dx = px - o.x
          const dy = py - o.y
          const distanceSquared = dx * dx + dy * dy
          if (distanceSquared >= reach * reach) continue
          moved = true
          if (distanceSquared === 0) {
            const bx = fromX - o.x
            const by = fromY - o.y
            const back = Math.sqrt(bx * bx + by * by)
            px = back === 0 ? o.x + reach : o.x + (bx / back) * reach
            py = back === 0 ? o.y : o.y + (by / back) * reach
          } else {
            const distance = Math.sqrt(distanceSquared)
            px = o.x + (dx / distance) * reach
            py = o.y + (dy / distance) * reach
          }
        }
        if (!moved) break
      }
    }
    this.pushedX = px
    this.pushedY = py
  }

  update(tick: number): void {
    const dt = this.config.timestep
    const { juvenileSpeedScale } = this.config.organisms
    const width = this.config.environment.width
    const height = this.config.environment.height
    const unbounded = this.ecology !== null && this.ecology.clusters !== null
    const { juvenileSizeScale } = this.config.organisms

    for (const organism of this.organisms.values()) {
      const genes = organism.genome.physical
      const body = factorsOf(organism.genome, this.config)
      const maxTurn = this.config.organisms.maxTurnRate * dt * body.turn
      const intent = this.intentBuffer.get(organism.id) ?? NO_INTENT
      const turn = clamp(intent.turn, -maxTurn, maxTurn)
      const heading = wrapAngle(organism.heading + turn)
      const stage = lifeStageFor(organism.age, genes)
      const baseMaxSpeed =
        stage === 'juvenile'
          ? this.config.organisms.maxSpeed * juvenileSpeedScale
          : this.config.organisms.maxSpeed
      // Chewing slows the organism (ADR 0017); exactly 1 whenever feeding is off or no bite is pending.
      const chew = organism.biteCooldown > 0 ? this.config.feeding.chewSlow : 1
      const terrainSpeed = this.terrainSlows
        ? baseMaxSpeed *
          (this.ecology as EcologyModel).movementScale(organism.x, organism.y, tick) *
          chew
        : baseMaxSpeed * chew
      // The parts decide how much of that speed forward and sideways thrust can deliver.
      const scaledMaxSpeed = terrainSpeed * body.speed
      const speed = clamp(intent.thrust, 0, 1) * scaledMaxSpeed
      let vx = cos(heading) * speed
      let vy = sin(heading) * speed
      const lateral = clamp(intent.strafe, -1, 1) * terrainSpeed * body.strafe
      if (lateral !== 0) {
        // Strafing adds velocity across the heading (positive is to the left); the combined
        // speed is limited to the organism's own top speed so strafing is never a free boost.
        const total = Math.sqrt(speed * speed + lateral * lateral)
        const limit = total > scaledMaxSpeed ? scaledMaxSpeed / total : 1
        vx = (cos(heading) * speed - sin(heading) * lateral) * limit
        vy = (sin(heading) * speed + cos(heading) * lateral) * limit
      }
      const fromX = organism.x
      const fromY = organism.y
      // The field has walls; the cluster layout is unbounded (docs/decisions/0014).
      let toX = unbounded ? organism.x + vx * dt : clamp(organism.x + vx * dt, 0, width)
      let toY = unbounded ? organism.y + vy * dt : clamp(organism.y + vy * dt, 0, height)

      if (this.obstacles !== null) {
        const radius =
          bodyRadiusOf(organism.genome, this.config) *
          (stage === 'juvenile' ? juvenileSizeScale : 1)
        this.pushOut(fromX, fromY, toX, toY, radius)
        if (this.pushedX !== toX || this.pushedY !== toY) {
          toX = unbounded ? this.pushedX : clamp(this.pushedX, 0, width)
          toY = unbounded ? this.pushedY : clamp(this.pushedY, 0, height)
          // What it actually did, no faster than it can go: the brain's velocity inputs and the
          // energy cost must see a body that is held against a rock as slow.
          let ax = (toX - fromX) / dt
          let ay = (toY - fromY) / dt
          const achieved = ax * ax + ay * ay
          if (achieved > scaledMaxSpeed * scaledMaxSpeed) {
            const scale = scaledMaxSpeed / Math.sqrt(achieved)
            ax *= scale
            ay *= scale
          }
          vx = ax
          vy = ay
        }
      }

      organism.heading = heading
      organism.vx = vx
      organism.vy = vy
      organism.x = toX
      organism.y = toY
      organism.lastTurnMagnitude = Math.abs(turn)

      if (this.emitVerbose) {
        this.events.record({
          type: 'organism-moved',
          tick,
          organismId: organism.id,
          from: { x: fromX, y: fromY },
          to: { x: toX, y: toY }
        })
      }
    }
  }
}
