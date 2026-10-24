import type { RewardBreakdown, RewardWeights } from '@evo/contracts'
import { clamp } from '../math/scalar'

export interface RewardInput {
  /** Energy gained from food this tick (after the capacity cap). */
  readonly energyGained: number
  /** Whether the organism took part in a successful reproduction this tick. */
  readonly reproduced: boolean
  /** Metabolic cost paid this tick (a non-negative amount of energy). */
  readonly energyCost: number
  /** The organism's effective energy capacity, the scale that makes rewards comparable. */
  readonly capacity: number
}

/**
 * The reward for one tick, split into its terms (docs/learning/brain.md, "Reward").
 * `survival`, `exploration` and `damage` are intentionally absent (ADR 0007).
 */
export function computeReward(input: RewardInput, weights: RewardWeights): RewardBreakdown {
  const scale = input.capacity > 0 ? 1 / input.capacity : 0
  const feeding = weights.feeding * input.energyGained * scale
  const reproduction = input.reproduced ? weights.reproduction : 0
  const energyCost = weights.energyCost * Math.max(0, input.energyCost) * scale
  return {
    feeding,
    reproduction,
    energyCost,
    total: clamp(feeding + reproduction - energyCost, -1, 1)
  }
}
