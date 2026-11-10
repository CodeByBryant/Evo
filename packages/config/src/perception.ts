import { checkNumber, checkSection } from './checks'
import type { PlainObject } from './checks'

const PERCEPTION_KEYS = ['organismsBlockSight', 'maxSightChecks']

/** Validates the top-level `perception` section of a complete configuration (ADR 0016 "Line of sight"). */
export function checkPerception(root: PlainObject, errors: string[]): void {
  const perception = checkSection(root, 'perception', PERCEPTION_KEYS, errors)
  if (!perception) return
  if (perception['organismsBlockSight'] === undefined) {
    errors.push('perception.organismsBlockSight is required')
  } else if (typeof perception['organismsBlockSight'] !== 'boolean') {
    errors.push('perception.organismsBlockSight must be a boolean')
  }
  const checks = checkNumber(
    perception,
    'maxSightChecks',
    'perception.maxSightChecks',
    { positive: true },
    errors
  )
  if (checks !== undefined && !Number.isInteger(checks)) {
    errors.push('perception.maxSightChecks must be a whole number')
  }
}
