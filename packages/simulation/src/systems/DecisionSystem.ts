import type { WorldConfig } from '@evo/contracts'
import type { IntentBuffer, PerceptionBuffer } from '../buffers/types'
import type { OrganismStore } from '../entities/OrganismStore'
import { wrapAngle } from '../math/scalar'
import { atan2 } from '../math/trig'
import type { SeededRandom } from '../random/SeededRandom'

/**
 * Placeholder controller: seek the nearest perceived resource, otherwise wander. Replaced by the
 * learned brain in Phase 5 (docs/simulation/update-order.md, stage 5). Writes only the intent
 * buffer; `MovementSystem` is responsible for physically limiting the intent.
 */
export class DecisionSystem {
  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly perceptionBuffer: PerceptionBuffer,
    private readonly intentBuffer: IntentBuffer,
    private readonly random: SeededRandom
  ) {}

  update(): void {
    this.intentBuffer.clear()
    const jitter = this.config.organisms.wanderJitter * this.config.timestep
    for (const organism of this.organisms.values()) {
      const perceived = this.perceptionBuffer.get(organism.id)
      if (perceived) {
        const desiredHeading = atan2(
          perceived.position.y - organism.y,
          perceived.position.x - organism.x
        )
        this.intentBuffer.set(organism.id, {
          turn: wrapAngle(desiredHeading - organism.heading),
          thrust: 1
        })
      } else {
        this.intentBuffer.set(organism.id, {
          turn: (this.random.float() * 2 - 1) * jitter,
          thrust: 0.5
        })
      }
    }
  }
}
