import { ACTION_SIZE } from '@evo/contracts'
import type { Action, LearningAlgorithmName, LearningGenes, Observation } from '@evo/contracts'
import { clamp } from '../math/scalar'
import { forwardHidden, readOutput, readValue } from './Brain'
import type { BrainLayout } from './BrainLayout'
import type { BrainState } from './BrainState'
import { explorationSigma } from './Exploration'

/**
 * The learning signal is clamped to this magnitude: a reward is at most 1, so a larger TD error
 * means the value estimate is badly off, and one such step must not be allowed to wreck a brain.
 */
const MAX_SIGNAL = 1

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
  /** The fixed weights (blocks 1-5); the learnable rest live in `brain.learned`. */
  readonly weights: ArrayLike<number>
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
      const draw = ctx.noise[o] as number
      action[o] = clamp((output[o] as number) + sigma * draw, -1, 1)
      if (ctx.learningEnabled) {
        // Eligibility: how strongly this weight pushed the output the way the noise did. The
        // trace holds the standardized draw, not the scaled noise, so the size of a learning
        // step does not shrink with the size of the exploration. With no exploration there is
        // no noise to correlate with reward, so nothing becomes eligible.
        const noise = sigma > 0 ? draw : 0
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
    return clamp(delta, -MAX_SIGNAL, MAX_SIGNAL)
  }
}

/** Actor-critic: `delta` is the TD error, and the value head learns from it too. */
export class ActorCriticLearner extends ThreeFactorLearner {
  readonly name = 'actorCritic'

  protected signal(ctx: DecideContext, brain: BrainState, value: number): number {
    const { layout, genes, params } = ctx
    const reward = brain.reward.total
    const delta = clamp(
      reward + genes.discountFactor * value - brain.prevValue,
      -MAX_SIGNAL,
      MAX_SIGNAL
    )
    // Semi-gradient TD(0) on the value head, using the previous decision's features, with the
    // step normalized by the feature norm (plus the bias feature) so that a large hidden
    // activation can never push the step past the stable range.
    const base = layout.actorLength
    const { hiddenSize } = layout.architecture
    let norm = 1
    for (let h = 0; h < hiddenSize; h++) {
      const feature = brain.prevHidden[h] as number
      norm += feature * feature
    }
    const step = (genes.learningRate * params.valueRateScale * delta) / norm
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
