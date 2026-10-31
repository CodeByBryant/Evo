import type { EntityId } from './entity'

/**
 * Number of values in an `Observation`. The brain's input size is derived from this constant, so
 * the network shape can never disagree with what the observation builder produces
 * (docs/learning/brain.md).
 */
export const OBSERVATION_SIZE = 33

/** Number of values in an `Action`; the brain's output size is derived from this constant. */
export const ACTION_SIZE = 5

/**
 * What an organism perceives, in a fixed order (`OBSERVATION_LABELS`). Never silently reorder or
 * resize: that changes what every stored weight means and is a hash-schema change.
 */
export type Observation = readonly number[]

/** The brain's output, each value in `[-1, 1]`, in the order of `ACTION_LABELS`. */
export type Action = readonly number[]

export const OBSERVATION_LABELS: readonly string[] = [
  'energy',
  'age',
  'forwardVelocity',
  'lateralVelocity',
  'positionX',
  'positionY',
  'headingCos',
  'headingSin',
  'foodPresent',
  'foodBearingCos',
  'foodBearingSin',
  'foodProximity',
  'peerPresent',
  'peerBearingCos',
  'peerBearingSin',
  'peerProximity',
  'timeSinceFood',
  'previousReward',
  'previousThrust',
  'previousTurn',
  'previousStrafe',
  'previousInteract',
  'previousExplore',
  'ownHealth',
  'hazardPresent',
  'hazardBearingCos',
  'hazardBearingSin',
  'hazardProximity',
  'foodKind',
  'seasonCos',
  'seasonSin',
  'regionTemperature',
  'regionMovementScale'
]

export const ACTION_LABELS: readonly string[] = ['thrust', 'turn', 'strafe', 'interact', 'explore']

/** Where each term of the reward came from this tick (docs/learning/brain.md). */
export interface RewardBreakdown {
  /** Energy eaten, as a fraction of capacity, times its weight. */
  readonly feeding: number
  /** One for taking part in a successful reproduction, times its weight. */
  readonly reproduction: number
  /** Metabolic cost paid, as a fraction of capacity, times its weight (a positive number). */
  readonly energyCost: number
  /** Health lost this tick as a fraction of maximum health, times its weight and `1 - riskTolerance` (a positive number). */
  readonly damage: number
  /** The noveltyPreference gene times its weight, the first time per life the organism enters a coarse cell of the world. */
  readonly exploration: number
  /** `feeding + reproduction + exploration - energyCost - damage`, clamped to `[-1, 1]`. */
  readonly total: number
}

/** `'reflex'` is the Phase 4 hand-coded forager; `'brain'` is the neural controller. */
export type LearningController = 'reflex' | 'brain'

/** How the learning signal `delta` is computed (docs/learning/brain.md). */
export type LearningAlgorithmName = 'hebbian' | 'actorCritic'

export interface RewardWeights {
  feeding: number
  reproduction: number
  energyCost: number
  damage: number
  exploration: number
}

export interface LearningConfig {
  controller: LearningController
  /** When false, weights are frozen but exploration noise continues. */
  enabled: boolean
  algorithm: LearningAlgorithmName
  rewardWeights: RewardWeights
  /** Learned weights are clamped to `[-weightLimit, +weightLimit]`. */
  weightLimit: number
  /** Step of the running reward baseline used by the Hebbian algorithm, in `(0, 1]`. */
  baselineRate: number
  /** Critic step size relative to the `learningRate` gene. */
  valueRateScale: number
  /** Seconds that map to 1 in the `timeSinceFood` observation. */
  foodHorizon: number
}

/** A partial learning configuration; `rewardWeights` merges field by field. */
export interface LearningConfigOverrides {
  controller?: LearningController
  enabled?: boolean
  algorithm?: LearningAlgorithmName
  rewardWeights?: Partial<RewardWeights>
  weightLimit?: number
  baselineRate?: number
  valueRateScale?: number
  foodHorizon?: number
}

/** Lifetime counters kept on every brain (docs/learning/brain.md, "Telemetry"). */
export interface BrainTelemetry {
  readonly rewardTotal: number
  readonly updates: number
  /** Sum of the absolute change of every learned weight over the organism's life. */
  readonly weightChange: number
}

/** A read-only view of one organism's brain, for inspection (`World.brainOf`). */
export interface BrainSnapshot {
  readonly organismId: EntityId
  readonly observation: Observation
  readonly hidden: readonly number[]
  readonly memory: readonly number[]
  /** What the network produced before exploration noise. */
  readonly output: Action
  /** What the organism actually did (output plus noise, clamped). */
  readonly action: Action
  readonly value: number
  /** The reward settled at the end of the previous tick. */
  readonly reward: RewardBreakdown
  readonly telemetry: BrainTelemetry
}
