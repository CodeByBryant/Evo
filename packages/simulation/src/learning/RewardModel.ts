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
  /** Health lost this tick as a fraction of maximum health (default 0). */
  readonly damage?: number
  /** The `riskTolerance` gene, in `[0, 1]`: the damage penalty is scaled by `1 - riskTolerance` (default 0). */
  readonly riskTolerance?: number
  /** Whether the organism entered a world cell it had not visited in its life (default `false`). */
  readonly novel?: boolean
  /** The `noveltyPreference` gene, in `[0, 1]`, scaling the exploration reward (default 0). */
  readonly noveltyPreference?: number
}

/**
 * The reward for one tick, split into its terms (docs/learning/brain.md, "Reward").
 * `survival` is intentionally absent (ADR 0007); `damage` and `exploration` arrived with the
 * ecology (ADR 0009) and are scaled by the `riskTolerance` and `noveltyPreference` genes.
 */
export function computeReward(input: RewardInput, weights: RewardWeights): RewardBreakdown {
  const scale = input.capacity > 0 ? 1 / input.capacity : 0
  const feeding = weights.feeding * input.energyGained * scale
  const reproduction = input.reproduced ? weights.reproduction : 0
  const energyCost = weights.energyCost * Math.max(0, input.energyCost) * scale
  const damage = weights.damage * Math.max(0, input.damage ?? 0) * (1 - (input.riskTolerance ?? 0))
  const exploration =
    input.novel === true ? weights.exploration * (input.noveltyPreference ?? 0) : 0
  return {
    feeding,
    reproduction,
    energyCost,
    damage,
    exploration,
    total: clamp(feeding + reproduction + exploration - energyCost - damage, -1, 1)
  }
}
