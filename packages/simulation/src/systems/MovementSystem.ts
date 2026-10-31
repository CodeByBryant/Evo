import type { WorldConfig } from '@evo/contracts'
import type { IntentBuffer, OrganismIntent } from '../buffers/types'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { clamp, wrapAngle } from '../math/scalar'
import { cos, sin } from '../math/trig'
import type { EcologyModel } from '../ecology/EcologyModel'
import { lifeStageFor } from '../organisms/lifeStage'

const NO_INTENT: OrganismIntent = { turn: 0, thrust: 0, strafe: 0, interact: false }

/**
 * Applies each organism's intent: turns it (bounded by `maxTurnRate`), sets its speed (bounded by
 * the organism's `maxSpeed` gene, scaled down for juveniles), adds any lateral `strafe` velocity, and moves it,
 * clamped to the world rectangle. Velocity is always derived from heading, speed and strafe, never set
 * independently. Also records the turn
 * actually applied as `lastTurnMagnitude`, which `MetabolismSystem` reads afterward.
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
    private readonly ecology: EcologyModel | null = null
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
    this.terrainSlows = ecology !== null && (ecology.regionsOn || ecology.seasonsOn)
  }

  update(tick: number): void {
    const dt = this.config.timestep
    const { juvenileSpeedScale } = this.config.organisms
    const width = this.config.environment.width
    const height = this.config.environment.height

    for (const organism of this.organisms.values()) {
      const genes = organism.genome.physical
      const maxTurn = genes.maxTurnRate * dt
      const intent = this.intentBuffer.get(organism.id) ?? NO_INTENT
      const turn = clamp(intent.turn, -maxTurn, maxTurn)
      const heading = wrapAngle(organism.heading + turn)
      const stage = lifeStageFor(organism.age, genes)
      const baseMaxSpeed =
        stage === 'juvenile' ? genes.maxSpeed * juvenileSpeedScale : genes.maxSpeed
      const scaledMaxSpeed = this.terrainSlows
        ? baseMaxSpeed * (this.ecology as EcologyModel).movementScale(organism.x, organism.y, tick)
        : baseMaxSpeed
      const speed = clamp(intent.thrust, 0, 1) * scaledMaxSpeed
      let vx = cos(heading) * speed
      let vy = sin(heading) * speed
      const lateral = clamp(intent.strafe, -1, 1) * scaledMaxSpeed
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
      const toX = clamp(organism.x + vx * dt, 0, width)
      const toY = clamp(organism.y + vy * dt, 0, height)

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
