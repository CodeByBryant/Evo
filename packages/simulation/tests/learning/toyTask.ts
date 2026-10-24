import { ACTION_SIZE } from '@evo/contracts'
import type { LearningAlgorithmName, LearningGenes } from '@evo/contracts'
import { architectureOf, createFounderGenome } from '../../src/genetics/GenomeFactory'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import { brainLayoutOf } from '../../src/learning/BrainLayout'
import { createBrainState } from '../../src/learning/BrainState'
import { buildObservation } from '../../src/learning/ObservationBuilder'
import { createLearner } from '../../src/learning/LearningAlgorithm'
import { resolveWorldConfig } from '@evo/config'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { cos, sin } from '../../src/math/trig'

/**
 * The feasibility gate for Phase 5 learning: on a toy steering task where the right answer is
 * known, both learners must measurably improve with learning on and must not with it off. The
 * brain is a random (no innate prior) founder, so improvement comes only from learning.
 *
 * Each step a target appears at a random bearing; the reward is `0.5 * turn * sin(bearing)`, so
 * the best policy turns toward the target. Reward arrives after the action it follows and is
 * learned from at the next decision, exactly as `BrainSystem` does.
 */
const GENES: LearningGenes = {
  learningRate: 0.3,
  discountFactor: 0.9,
  eligibilityTraceDecay: 0.5,
  explorationRate: 0.4,
  riskTolerance: 0.5,
  noveltyPreference: 0.5,
  persistence: 1
}
const PARAMS = { weightLimit: 6, baselineRate: 0.02, valueRateScale: 1 }
export const STEPS = 6000
const WINDOW = 1500

export function run(
  algorithm: LearningAlgorithmName,
  learningEnabled: boolean,
  seed: number
): { early: number; late: number; weightChange: number } {
  const config = resolveWorldConfig({ genetics: { brain: { innatePrior: false } } })
  const specs = buildGeneSpecs(config)
  const genome = createFounderGenome(
    0,
    specs,
    config.genetics.brain,
    new SeededRandom(deriveStreamWords(seed, 'genetics'))
  )
  const layout = brainLayoutOf(architectureOf(config.genetics.brain))
  const brain = createBrainState(genome, layout, 50)
  const learner = createLearner(algorithm)
  const world = new SeededRandom(deriveStreamWords(seed, 'world'))
  const noise = new SeededRandom(deriveStreamWords(seed, 'learning'))

  const rewards: number[] = []
  for (let step = 0; step < STEPS; step++) {
    const angle = (world.float() * 2 - 1) * 3.141592653589793
    const observation = buildObservation({
      energy: 0.5,
      age: 0.1,
      x: 250,
      y: 250,
      vx: 0,
      vy: 0,
      heading: 0,
      maxSpeed: 20,
      sensorRadius: 60,
      worldWidth: 500,
      worldHeight: 500,
      food: { dx: cos(angle) * 30, dy: sin(angle) * 30, distanceSquared: 900 },
      peer: null,
      timeSinceFood: 0,
      previousReward: brain.reward.total,
      previousAction: brain.prevAction
    })
    const draws = Array.from({ length: ACTION_SIZE }, () => noise.normal())
    const action = learner.decide(
      {
        layout,
        weights: genome.brain.weights,
        genes: GENES,
        params: PARAMS,
        observation,
        noise: draws,
        age: 60,
        maxAge: 600,
        learningEnabled
      },
      brain
    )
    const reward = 0.5 * (action[1] as number) * sin(angle)
    brain.reward.total = reward
    rewards.push(reward)
  }
  const mean = (from: number, to: number): number => {
    let sum = 0
    for (let i = from; i < to; i++) sum += rewards[i] as number
    return sum / (to - from)
  }
  return {
    early: mean(0, WINDOW),
    late: mean(STEPS - WINDOW, STEPS),
    weightChange: brain.weightChange
  }
}
