import { checkNumber, checkSection } from './checks'
import type { PlainObject } from './checks'

const AGEING_KEYS = ['enabled', 'metabolismRise', 'speedLoss', 'fertilityLoss', 'hazard', 'ceiling']

/** Validates the top-level `ageing` section of a complete configuration (ADR 0027). */
export function checkAgeing(root: PlainObject, errors: string[]): void {
  const ageing = checkSection(root, 'ageing', AGEING_KEYS, errors)
  if (!ageing) return
  if (typeof ageing['enabled'] !== 'boolean') errors.push('ageing.enabled must be a boolean')
  for (const key of ['metabolismRise', 'fertilityLoss', 'hazard'] as const) {
    checkNumber(ageing, key, `ageing.${key}`, { nonnegative: true }, errors)
  }
  const loss = checkNumber(ageing, 'speedLoss', 'ageing.speedLoss', { nonnegative: true }, errors)
  if (loss !== undefined && loss >= 1) errors.push('ageing.speedLoss must be less than 1')
  const ceiling = checkNumber(ageing, 'ceiling', 'ageing.ceiling', {}, errors)
  if (ceiling !== undefined && ceiling <= 1) {
    errors.push('ageing.ceiling must be greater than 1 (a multiple of maxAge)')
  }
}
