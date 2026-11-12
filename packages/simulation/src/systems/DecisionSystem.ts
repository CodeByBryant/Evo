import type { WorldConfig } from '@evo/contracts'
import type { IntentBuffer, PerceptionBuffer, PreyBuffer, ThreatBuffer } from '../buffers/types'
import type { OrganismStore } from '../entities/OrganismStore'
import { wrapAngle } from '../math/scalar'
import { atan2 } from '../math/trig'
import type { SeededRandom } from '../random/SeededRandom'

/**
 * The `reflex` controller (Phase 4's hand-coded forager): seek the nearest perceived resource,
 * otherwise wander. It runs when `learning.controller` is `'reflex'`; the learned brain
 * (`BrainSystem`) replaces it otherwise (docs/simulation/update-order.md, stage 5). It never
 * strafes and always tries to interact. Writes only the intent buffer; `MovementSystem` is responsible for physically limiting the intent.
 */
export class DecisionSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly perceptionBuffer: PerceptionBuffer,
    private readonly intentBuffer: IntentBuffer,
    private readonly random: SeededRandom,
    /** Prey and threat sightings (ADR 0023): absent with predation off. */
    private readonly prey?: PreyBuffer,
    private readonly threat?: ThreatBuffer
  ) {}

  update(): void {
    this.intentBuffer.clear()
    for (const organism of this.organisms.values()) {
      const jitter = organism.genome.behavioral.wanderJitter * this.config.timestep
      const perceived = this.perceptionBuffer.get(organism.id)
      const threat = this.threat?.get(organism.id)
      const prey = this.prey?.get(organism.id)
      if (threat) {
        // Run from what could bite it (ADR 0023): the way directly away from it.
        const away = atan2(organism.y - threat.position.y, organism.x - threat.position.x)
        this.intentBuffer.set(organism.id, {
          turn: wrapAngle(away - organism.heading),
          thrust: 1,
          strafe: 0,
          interact: true
        })
      } else if (prey && (!perceived || prey.distanceSquared < perceived.distanceSquared)) {
        // Hunt what it could bite when that is nearer than food (ADR 0023).
        const toward = atan2(prey.position.y - organism.y, prey.position.x - organism.x)
        this.intentBuffer.set(organism.id, {
          turn: wrapAngle(toward - organism.heading),
          thrust: 1,
          strafe: 0,
          interact: true
        })
      } else if (perceived) {
        const desiredHeading = atan2(
          perceived.position.y - organism.y,
          perceived.position.x - organism.x
        )
        this.intentBuffer.set(organism.id, {
          turn: wrapAngle(desiredHeading - organism.heading),
          thrust: 1,
          strafe: 0,
          interact: true
        })
      } else {
        this.intentBuffer.set(organism.id, {
          turn: (this.random.float() * 2 - 1) * jitter,
          thrust: 0.5,
          strafe: 0,
          interact: true
        })
      }
    }
  }
}
