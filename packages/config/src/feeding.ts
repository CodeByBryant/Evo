import { checkNumber, checkSection } from './checks'
import type { PlainObject } from './checks'

const FEEDING_KEYS = [
  'enabled',
  'biteRadius',
  'biteCone',
  'biteSize',
  'biteInterval',
  'gutCapacity',
  'absorption',
  'chewSlow'
]

/** Validates the top-level `feeding` section of a complete configuration (docs/decisions/0017). */
export function checkFeeding(root: PlainObject, errors: string[]): void {
  const feeding = checkSection(root, 'feeding', FEEDING_KEYS, errors)
  if (!feeding) return
  if (feeding['enabled'] === undefined) errors.push('feeding.enabled is required')
  else if (typeof feeding['enabled'] !== 'boolean') errors.push('feeding.enabled must be a boolean')
  for (const key of ['biteRadius', 'biteSize', 'biteInterval', 'gutCapacity', 'absorption']) {
    checkNumber(feeding, key, `feeding.${key}`, { positive: true }, errors)
  }
  const chew = checkNumber(feeding, 'chewSlow', 'feeding.chewSlow', {}, errors)
  if (chew !== undefined && (chew <= 0 || chew > 1)) {
    errors.push('feeding.chewSlow must be greater than zero and at most one')
  }
  const cone = checkNumber(feeding, 'biteCone', 'feeding.biteCone', { positive: true }, errors)
  if (cone !== undefined && cone > Math.PI) {
    errors.push('feeding.biteCone must be at most pi (a half-angle of 180 degrees is all around)')
  }
}
