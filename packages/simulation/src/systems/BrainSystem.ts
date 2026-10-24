import { ACTION_SIZE } from '@evo/contracts'
import type { EntityId, WorldConfig } from '@evo/contracts'
import type { IntentBuffer, PeerBuffer, PerceptionBuffer } from '../buffers/types'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'
import type { EventLog } from '../events/EventLog'
import { architectureOf } from '../genetics/GenomeFactory'
import { brainLayoutOf } from '../learning/BrainLayout'
import type { BrainLayout } from '../learning/BrainLayout'
import { createLearner } from '../learning/LearningAlgorithm'
import type { LearningAlgorithm, LearningParams } from '../learning/LearningAlgorithm'
import { buildObservation } from '../learning/ObservationBuilder'
import type { Sighting } from '../learning/ObservationBuilder'
import { computeReward } from '../learning/RewardModel'
import { lifeStageFor } from '../organisms/lifeStage'
import { maxEnergyOf, reproductionCostOf } from '../organisms/traits'
import type { SeededRandom } from '../random/SeededRandom'

const THRUST = 0
const TURN = 1
const STRAFE = 2
const INTERACT = 3

/**
 * The learned controller (docs/learning/brain.md). Owns every organism's `BrainState` and has two
 * entry points, like `EnvironmentSystem`, because a reward is only known after the tick it
 * rewards:
 *
 * - `decide`, before movement: in ascending id, build the observation, learn from the reward
 *   settled last tick, run the network, add exploration noise and write the intent. It always
 *   draws `ACTION_SIZE` normals per organism from the `learning` stream, whatever the settings,
 *   so draw counts never depend on configuration.
 * - `settle`, after death: compute each survivor's reward for the tick that just finished from
 *   that tick's events and energy change, and store it for the next `decide`.
 *
 * Writes only the intent buffer and organism `brain` state.
 */
export class BrainSystem {
  private readonly layout: BrainLayout
  private readonly learner: LearningAlgorithm
  private readonly params: LearningParams

  constructor(
    private readonly config: WorldConfig,
    private readonly organisms: OrganismStore,
    private readonly perceptionBuffer: PerceptionBuffer,
    private readonly peerBuffer: PeerBuffer,
    private readonly intentBuffer: IntentBuffer,
    private readonly events: EventLog,
    private readonly random: SeededRandom
  ) {
    this.layout = brainLayoutOf(architectureOf(config.genetics.brain))
    this.learner = createLearner(config.learning.algorithm)
    this.params = {
      weightLimit: config.learning.weightLimit,
      baselineRate: config.learning.baselineRate,
      valueRateScale: config.learning.valueRateScale
    }
  }

  /** The effective capacity and top speed, scaled down while juvenile. */
  private scales(organism: OrganismState): { capacity: number; maxSpeed: number } {
    const { juvenileSizeScale, juvenileSpeedScale } = this.config.organisms
    const juvenile = lifeStageFor(organism.age, organism.genome.physical) === 'juvenile'
    return {
      capacity: maxEnergyOf(organism.genome, this.config) * (juvenile ? juvenileSizeScale : 1),
      maxSpeed: organism.genome.physical.maxSpeed * (juvenile ? juvenileSpeedScale : 1)
    }
  }

  decide(): void {
    this.intentBuffer.clear()
    const dt = this.config.timestep
    const { width, height } = this.config.environment
    const { foodHorizon, enabled } = this.config.learning

    for (const organism of this.organisms.values()) {
      const brain = organism.brain
      const noise: number[] = new Array<number>(ACTION_SIZE)
      for (let o = 0; o < ACTION_SIZE; o++) noise[o] = this.random.normal()
      if (brain === null) throw new Error(`organism ${organism.id} has no brain state`)

      const genome = organism.genome
      const { capacity, maxSpeed } = this.scales(organism)
      const food = this.perceptionBuffer.get(organism.id)
      const peer = this.peerBuffer.get(organism.id)
      const sight = (
        target: { position: { x: number; y: number }; distanceSquared: number } | null | undefined
      ): Sighting | null =>
        target
          ? {
              dx: target.position.x - organism.x,
              dy: target.position.y - organism.y,
              distanceSquared: target.distanceSquared
            }
          : null

      const observation = buildObservation({
        energy: capacity > 0 ? organism.energy / capacity : 0,
        age: organism.age / genome.physical.maxAge,
        x: organism.x,
        y: organism.y,
        vx: organism.vx,
        vy: organism.vy,
        heading: organism.heading,
        maxSpeed,
        sensorRadius: genome.sensory.sensorRadius,
        worldWidth: width,
        worldHeight: height,
        food: sight(food),
        peer: sight(peer),
        timeSinceFood: brain.timeSinceFood / foodHorizon,
        previousReward: brain.reward.total,
        previousAction: brain.prevAction
      })

      const action = this.learner.decide(
        {
          layout: this.layout,
          weights: genome.brain.weights,
          genes: genome.learning,
          params: this.params,
          observation,
          noise,
          age: organism.age,
          maxAge: genome.physical.maxAge,
          learningEnabled: enabled
        },
        brain
      )

      brain.energyAtDecision = organism.energy
      this.intentBuffer.set(organism.id, {
        thrust: Math.max(0, action[THRUST] as number),
        turn: (action[TURN] as number) * genome.physical.maxTurnRate * dt,
        strafe: action[STRAFE] as number,
        interact: (action[INTERACT] as number) > 0
      })
    }
  }

  settle(): void {
    const dt = this.config.timestep
    const gained = new Map<EntityId, number>()
    const reproduced = new Set<EntityId>()
    for (const event of this.events.eventsThisTick()) {
      if (event.type === 'resource-consumed') {
        gained.set(event.organismId, (gained.get(event.organismId) ?? 0) + event.energyGained)
      } else if (event.type === 'reproduction-attempted' && event.succeeded) {
        reproduced.add(event.organismId)
        if (event.partnerId !== null) reproduced.add(event.partnerId)
      }
    }

    for (const organism of this.organisms.values()) {
      const brain = organism.brain
      // A child born this tick has not decided yet (decisions is 0), so there is nothing to reward.
      if (brain === null || brain.decisions === 0) continue
      const energyGained = gained.get(organism.id) ?? 0
      const reproducedNow = reproduced.has(organism.id)
      const reproductionPaid = reproducedNow ? reproductionCostOf(organism.genome, this.config) : 0
      // energy now = energy at decision + gained - metabolic cost - reproduction paid
      const metabolicCost =
        energyGained - reproductionPaid - (organism.energy - brain.energyAtDecision)
      const { capacity } = this.scales(organism)
      const reward = computeReward(
        {
          energyGained,
          reproduced: reproducedNow,
          energyCost: metabolicCost,
          capacity
        },
        this.config.learning.rewardWeights
      )
      brain.reward.feeding = reward.feeding
      brain.reward.reproduction = reward.reproduction
      brain.reward.energyCost = reward.energyCost
      brain.reward.total = reward.total
      brain.rewardTotal += reward.total
      brain.timeSinceFood = energyGained > 0 ? 0 : brain.timeSinceFood + dt
    }
  }
}
