import { ACTION_SIZE } from '@evo/contracts'
import type { Action, LearningAlgorithmName, LearningGenes, Observation } from '@evo/contracts'
import { clamp } from '../math/scalar'
import { forwardHidden, readOutput, readValue } from './Brain'
import type { BrainLayout } from './BrainLayout'
import type { BrainState } from './BrainState'
import { explorationSigma } from './Exploration'

/** Index of the `explore` output in an action. */
const EXPLORE = 4

export interface LearningParams {
  /** Learned weights are clamped to `[-weightLimit, weightLimit]`. */
  readonly weightLimit: number
  /** Step of the running reward baseline (Hebbian). */
  readonly baselineRate: number
  /** Critic step size relative to the `learningRate` gene. */
  readonly valueRateScale: number
}

export interface DecideContext {
  readonly layout: BrainLayout
  /** The genome's weights; only blocks 1-5 are read (the rest live in `brain.learned`). */
  readonly weights: readonly number[]
  readonly genes: LearningGenes
  readonly params: LearningParams
  readonly observation: Observation
  /** Five standard normal draws, one per output, from the `learning` stream. */
  readonly noise: readonly number[]
  readonly age: number
  readonly maxAge: number
  /** When false, weights are frozen but exploration noise continues. */
  readonly learningEnabled: boolean
}

/**
 * A learning algorithm (roadmap 5.5). `decide` observes, learns from the previous transition,
 * and chooses an action; the two algorithms share every step but the learning signal `delta`.
 * Both mutate only the brain state they are given.
 */
export interface LearningAlgorithm {
  readonly name: LearningAlgorithmName
  decide(ctx: DecideContext, brain: BrainState): Action
}

/**
 * The shared three-factor learner (docs/learning/brain.md, "Learning"). Reward-modulated
 * Hebbian learning and actor-critic differ only in `delta` and in whether the critic trains.
 */
abstract class ThreeFactorLearner implements LearningAlgorithm {
  abstract readonly name: LearningAlgorithmName

  /** Computes the learning signal for the previous transition and trains the critic if any. */
  protected abstract signal(ctx: DecideContext, brain: BrainState, value: number): number

  decide(ctx: DecideContext, brain: BrainState): Action {
    const { layout, genes } = ctx
    const pass = forwardHidden(layout, ctx.weights, ctx.observation, brain.memory)
    const value = readValue(layout, brain.learned, pass.hidden)

    if (ctx.learningEnabled && brain.decisions > 0) {
      const delta = this.signal(ctx, brain, value)
      applyActorUpdate(brain, layout, genes.learningRate * delta, ctx.params.weightLimit)
      brain.updates += 1
    }

    const output = readOutput(layout, brain.learned, pass.hidden)
    const sigma = explorationSigma(
      genes.explorationRate,
      genes.persistence,
      ctx.age,
      ctx.maxAge,
      brain.prevAction[EXPLORE] as number
    )
    const action: number[] = new Array<number>(ACTION_SIZE)
    const decay = genes.discountFactor * genes.eligibilityTraceDecay
    const { hiddenSize } = layout.architecture
    const biasBase = ACTION_SIZE * hiddenSize
    for (let o = 0; o < ACTION_SIZE; o++) {
      const noise = sigma * (ctx.noise[o] as number)
      action[o] = clamp((output[o] as number) + noise, -1, 1)
      if (ctx.learningEnabled) {
        // Eligibility: how strongly this weight pushed the output the way the noise did.
        const row = o * hiddenSize
        for (let h = 0; h < hiddenSize; h++) {
          brain.eligibility[row + h] =
            decay * (brain.eligibility[row + h] as number) + noise * (pass.hidden[h] as number)
        }
        brain.eligibility[biasBase + o] =
          decay * (brain.eligibility[biasBase + o] as number) + noise
      }
    }

    brain.memory = pass.memory
    brain.prevHidden = pass.hidden
    brain.prevValue = value
    brain.prevAction = action
    brain.lastObservation = ctx.observation.slice()
    brain.lastOutput = output
    brain.decisions += 1
    return action
  }
}

/** Moves the actor weights along the eligibility trace, clamped, and records the change. */
function applyActorUpdate(
  brain: BrainState,
  layout: BrainLayout,
  step: number,
  weightLimit: number
): void {
  for (let k = 0; k < layout.actorLength; k++) {
    const before = brain.learned[k] as number
    const after = clamp(before + step * (brain.eligibility[k] as number), -weightLimit, weightLimit)
    brain.learned[k] = after
    brain.weightChange += Math.abs(after - before)
  }
}

/** Reward-modulated Hebbian learning: `delta = reward - runningBaseline`. */
export class HebbianLearner extends ThreeFactorLearner {
  readonly name = 'hebbian'

  protected signal(ctx: DecideContext, brain: BrainState): number {
    const reward = brain.reward.total
    const delta = reward - brain.rewardBaseline
    brain.rewardBaseline += ctx.params.baselineRate * delta
    return delta
  }
}

/** Actor-critic: `delta` is the TD error, and the value head learns from it too. */
export class ActorCriticLearner extends ThreeFactorLearner {
  readonly name = 'actorCritic'

  protected signal(ctx: DecideContext, brain: BrainState, value: number): number {
    const { layout, genes, params } = ctx
    const reward = brain.reward.total
    const delta = reward + genes.discountFactor * value - brain.prevValue
    // Semi-gradient TD(0) on the value head, using the previous decision's features.
    const step = genes.learningRate * params.valueRateScale * delta
    const base = layout.actorLength
    const { hiddenSize } = layout.architecture
    for (let h = 0; h <= hiddenSize; h++) {
      const feature = h < hiddenSize ? (brain.prevHidden[h] as number) : 1
      const before = brain.learned[base + h] as number
      const after = clamp(before + step * feature, -params.weightLimit, params.weightLimit)
      brain.learned[base + h] = after
      brain.weightChange += Math.abs(after - before)
    }
    return delta
  }
}

export function createLearner(name: LearningAlgorithmName): LearningAlgorithm {
  return name === 'hebbian' ? new HebbianLearner() : new ActorCriticLearner()
}
