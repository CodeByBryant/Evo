import type { Genome, RewardBreakdown } from '@evo/contracts'
import { ACTION_SIZE } from '@evo/contracts'
import type { StateHasher } from '../serialization/hash'
import type { BrainLayout } from './BrainLayout'

/** The mutable reward record of the most recently settled tick. */
export type MutableReward = { -readonly [K in keyof RewardBreakdown]: number }

/**
 * Per-organism runtime brain state (docs/learning/brain.md). The genome is immutable and holds the
 * starting weights; learning moves `learned`, a copy of the learnable tail of the weight vector.
 * Everything here that can influence a later tick is hashed (hash schema v4); the two inspection
 * caches at the end are not.
 */
export interface BrainState {
  /** Recurrent memory fed back into the hidden layer. */
  memory: number[]
  /** Current values of the learnable weights (actor output layer, then the value head). */
  learned: number[]
  /** Eligibility of each actor weight and bias (length `layout.actorLength`). */
  eligibility: number[]
  /** Hidden activations at the previous decision (the critic's features, and for inspection). */
  prevHidden: number[]
  /** The action actually taken at the previous decision (output plus noise, clamped). */
  prevAction: number[]
  /** The critic's estimate at the previous decision. */
  prevValue: number
  /** The reward settled at the end of the previous tick. */
  reward: MutableReward
  /** Running average reward (the Hebbian baseline). */
  rewardBaseline: number
  /** Seconds since this organism last ate. */
  timeSinceFood: number
  /** Energy right after the decision stage, the reference for this tick's energy cost. */
  energyAtDecision: number
  /** Number of decisions made; zero means there is no previous transition to learn from. */
  decisions: number
  /** Lifetime telemetry. */
  rewardTotal: number
  updates: number
  weightChange: number
  /**
   * Not hashed: a plain copy of the genome's fixed weights (blocks 1-5). The genome's own array
   * is frozen, and reading frozen arrays in the hot loop is several times slower in V8.
   */
  head: Float64Array
  /** Inspection only, not hashed: the latest observation and the network output before noise. */
  lastObservation: number[]
  lastOutput: number[]
}

export function createBrainState(genome: Genome, layout: BrainLayout, energy: number): BrainState {
  return {
    memory: new Array<number>(layout.architecture.memorySize).fill(0),
    learned: genome.brain.weights.slice(layout.learnOffset),
    eligibility: new Array<number>(layout.actorLength).fill(0),
    prevHidden: new Array<number>(layout.architecture.hiddenSize).fill(0),
    prevAction: new Array<number>(ACTION_SIZE).fill(0),
    prevValue: 0,
    reward: { feeding: 0, reproduction: 0, energyCost: 0, total: 0 },
    rewardBaseline: 0,
    timeSinceFood: 0,
    energyAtDecision: energy,
    decisions: 0,
    rewardTotal: 0,
    updates: 0,
    weightChange: 0,
    head: Float64Array.from(genome.brain.weights.slice(0, layout.learnOffset)),
    lastObservation: [],
    lastOutput: []
  }
}

function writeNumbers(hasher: StateHasher, values: readonly number[]): void {
  hasher.writeUint32(values.length)
  for (const value of values) hasher.writeFloat64(value)
}

/** Appends the hashed part of a brain state (docs/simulation/determinism.md, schema v4). */
export function writeBrainState(hasher: StateHasher, brain: BrainState | null): void {
  hasher.writeBoolean(brain !== null)
  if (brain === null) return
  writeNumbers(hasher, brain.memory)
  writeNumbers(hasher, brain.learned)
  writeNumbers(hasher, brain.eligibility)
  writeNumbers(hasher, brain.prevHidden)
  writeNumbers(hasher, brain.prevAction)
  hasher
    .writeFloat64(brain.prevValue)
    .writeFloat64(brain.reward.feeding)
    .writeFloat64(brain.reward.reproduction)
    .writeFloat64(brain.reward.energyCost)
    .writeFloat64(brain.reward.total)
    .writeFloat64(brain.rewardBaseline)
    .writeFloat64(brain.timeSinceFood)
    .writeFloat64(brain.energyAtDecision)
    .writeUint32(brain.decisions)
    .writeFloat64(brain.rewardTotal)
    .writeUint32(brain.updates)
    .writeFloat64(brain.weightChange)
}

/** Names every non-finite value in a brain state; empty when the state is sound. */
export function brainStateProblems(brain: BrainState, layout: BrainLayout): string[] {
  const problems: string[] = []
  const check = (label: string, values: readonly number[], expected?: number): void => {
    if (expected !== undefined && values.length !== expected) {
      problems.push(`${label} has length ${values.length}, expected ${expected}`)
    }
    for (const value of values) {
      if (!Number.isFinite(value)) {
        problems.push(`${label} contains a non-finite value (${value})`)
        break
      }
    }
  }
  check('memory', brain.memory, layout.architecture.memorySize)
  check('learned', brain.learned, layout.learnLength)
  check('eligibility', brain.eligibility, layout.actorLength)
  check('prevHidden', brain.prevHidden, layout.architecture.hiddenSize)
  check('prevAction', brain.prevAction, ACTION_SIZE)
  check('scalars', [
    brain.prevValue,
    brain.reward.feeding,
    brain.reward.reproduction,
    brain.reward.energyCost,
    brain.reward.total,
    brain.rewardBaseline,
    brain.timeSinceFood,
    brain.energyAtDecision,
    brain.rewardTotal,
    brain.weightChange
  ])
  return problems
}
