import type { WorldConfig } from '@evo/contracts'
import type { IntentBuffer, OrganismIntent } from '../buffers/types'
import type { OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { clamp, wrapAngle } from '../math/scalar'
import { cos, sin } from '../math/trig'
import { lifeStageFor } from '../organisms/lifeStage'

const NO_INTENT: OrganismIntent = { turn: 0, thrust: 0 }

/**
 * Applies each organism's intent: turns it (bounded by `maxTurnRate`), sets its speed (bounded by
 * `maxSpeed`, scaled down for juveniles), and moves it, clamped to the world rectangle. Velocity
 * is always derived from heading and speed, never set independently. Also records the turn
 * actually applied as `lastTurnMagnitude`, which `MetabolismSystem` reads afterward.
 */
export class MovementSystem {
  private readonly emitVerbose: boolean

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly intentBuffer: IntentBuffer,
    private readonly events: EventLog
  ) {
    this.emitVerbose = config.history.eventDetail === 'verbose'
  }

  update(tick: number): void {
    const dt = this.config.timestep
    const { maxTurnRate, maxSpeed, juvenileSpeedScale, maturityAge, senescenceAge } =
      this.config.organisms
    const maxTurn = maxTurnRate * dt
    const width = this.config.environment.width
    const height = this.config.environment.height

    for (const organism of this.organisms.values()) {
      const intent = this.intentBuffer.get(organism.id) ?? NO_INTENT
      const turn = clamp(intent.turn, -maxTurn, maxTurn)
      const heading = wrapAngle(organism.heading + turn)
      const stage = lifeStageFor(organism.age, { maturityAge, senescenceAge })
      const scaledMaxSpeed = stage === 'juvenile' ? maxSpeed * juvenileSpeedScale : maxSpeed
      const speed = clamp(intent.thrust, 0, 1) * scaledMaxSpeed
      const vx = cos(heading) * speed
      const vy = sin(heading) * speed
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
