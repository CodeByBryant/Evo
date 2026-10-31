import { checkNumber, checkSection } from './checks'
import type { PlainObject } from './checks'

const SPECIES_KEYS = [
  'enabled',
  'threshold',
  'distanceWeights',
  'sampleInterval',
  'maxHistorySamples',
  'reproductiveIsolation'
]
export const DISTANCE_WEIGHT_KEYS = [
  'physical',
  'sensory',
  'metabolic',
  'behavioral',
  'reproduction',
  'learning',
  'brain'
]

function checkBoolean(section: PlainObject, key: string, path: string, errors: string[]): void {
  const value = section[key]
  if (value === undefined) errors.push(`${path} is required`)
  else if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`)
}

/** Validates the top-level `species` section of a complete configuration. */
export function checkSpecies(root: PlainObject, errors: string[]): void {
  const species = checkSection(root, 'species', SPECIES_KEYS, errors)
  if (!species) return

  checkBoolean(species, 'enabled', 'species.enabled', errors)
  checkBoolean(species, 'reproductiveIsolation', 'species.reproductiveIsolation', errors)

  const threshold = checkNumber(species, 'threshold', 'species.threshold', {}, errors)
  if (threshold !== undefined && (threshold < 0 || threshold > 1)) {
    errors.push('species.threshold must be between zero and one')
  }
  checkNumber(
    species,
    'sampleInterval',
    'species.sampleInterval',
    { integer: true, positive: true },
    errors
  )
  checkNumber(
    species,
    'maxHistorySamples',
    'species.maxHistorySamples',
    { integer: true, nonnegative: true },
    errors
  )

  const weights = checkSection(
    species,
    'distanceWeights',
    DISTANCE_WEIGHT_KEYS,
    errors,
    'species.distanceWeights'
  )
  if (weights) {
    let sum = 0
    let allValid = true
    for (const key of DISTANCE_WEIGHT_KEYS) {
      const weight = checkNumber(
        weights,
        key,
        `species.distanceWeights.${key}`,
        { nonnegative: true },
        errors
      )
      if (weight === undefined) allValid = false
      else sum += weight
    }
    if (allValid && sum <= 0) {
      errors.push('species.distanceWeights must not all be zero')
    }
  }
}
