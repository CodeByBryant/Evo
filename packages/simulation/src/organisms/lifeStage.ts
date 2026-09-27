import type { LifeStage } from '@evo/contracts'

/**
 * Derives an organism's life stage from age alone (docs/simulation/update-order.md, "Life
 * stages") - never stored, so it can't drift from `age`.
 */
export function lifeStageFor(
  age: number,
  thresholds: { maturityAge: number; senescenceAge: number }
): LifeStage {
  if (age < thresholds.maturityAge) return 'juvenile'
  if (age < thresholds.senescenceAge) return 'mature'
  return 'senescent'
}
