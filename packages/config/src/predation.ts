import { MOUTH_FORMS } from '@evo/contracts'
import { checkNumber, checkSection, isObject } from './checks'
import type { PlainObject } from './checks'

const PREDATION_KEYS = [
  'enabled',
  'biteDamage',
  'biteEnergy',
  'trophicYield',
  'maxPreyRatio',
  'fleshYield',
  'attackWindow',
  'carcass'
]
const CARCASS_KEYS = [
  'enabled',
  'energyFraction',
  'minEnergy',
  'lifespan',
  'maxCount',
  'radius',
  'hardness',
  'yields'
]

function checkBoolean(section: PlainObject, key: string, path: string, errors: string[]): void {
  const value = section[key]
  if (value === undefined) errors.push(`${path} is required`)
  else if (typeof value !== 'boolean') errors.push(`${path} must be a boolean`)
}

/** A number in `(0, 1]`. */
function checkShare(section: PlainObject, key: string, path: string, errors: string[]): void {
  const value = checkNumber(section, key, path, {}, errors)
  if (value !== undefined && (value <= 0 || value > 1)) {
    errors.push(`${path} must be greater than zero and at most one`)
  }
}

/** Validates the top-level `predation` section of a complete configuration (ADR 0023). */
export function checkPredation(root: PlainObject, errors: string[]): void {
  const predation = checkSection(root, 'predation', PREDATION_KEYS, errors)
  if (!predation) return
  checkBoolean(predation, 'enabled', 'predation.enabled', errors)
  checkNumber(predation, 'biteDamage', 'predation.biteDamage', { nonnegative: true }, errors)
  checkNumber(predation, 'biteEnergy', 'predation.biteEnergy', { positive: true }, errors)
  checkShare(predation, 'trophicYield', 'predation.trophicYield', errors)
  checkNumber(predation, 'maxPreyRatio', 'predation.maxPreyRatio', { positive: true }, errors)
  checkNumber(predation, 'attackWindow', 'predation.attackWindow', { positive: true }, errors)
  const flesh = checkSection(
    predation,
    'fleshYield',
    [...MOUTH_FORMS],
    errors,
    'predation.fleshYield'
  )
  if (flesh) {
    for (const form of MOUTH_FORMS) {
      checkNumber(flesh, form, `predation.fleshYield.${form}`, { nonnegative: true }, errors)
    }
  }
  const carcass = checkSection(predation, 'carcass', CARCASS_KEYS, errors, 'predation.carcass')
  if (carcass) {
    checkBoolean(carcass, 'enabled', 'predation.carcass.enabled', errors)
    checkShare(carcass, 'energyFraction', 'predation.carcass.energyFraction', errors)
    checkNumber(carcass, 'minEnergy', 'predation.carcass.minEnergy', { nonnegative: true }, errors)
    checkNumber(carcass, 'lifespan', 'predation.carcass.lifespan', { nonnegative: true }, errors)
    checkNumber(
      carcass,
      'maxCount',
      'predation.carcass.maxCount',
      { integer: true, nonnegative: true },
      errors
    )
    checkNumber(carcass, 'radius', 'predation.carcass.radius', { positive: true }, errors)
    checkNumber(carcass, 'hardness', 'predation.carcass.hardness', { positive: true }, errors)
    const yields = checkSection(
      carcass,
      'yields',
      [...MOUTH_FORMS],
      errors,
      'predation.carcass.yields'
    )
    if (yields) {
      for (const form of MOUTH_FORMS) {
        checkNumber(yields, form, `predation.carcass.yields.${form}`, { positive: true }, errors)
      }
    }
  }
  // Predators eat by biting and kill by damage: both must be on.
  if (predation['enabled'] === true) {
    const feeding = root['feeding']
    if (!isObject(feeding) || feeding['enabled'] !== true) {
      errors.push('predation.enabled needs feeding.enabled (creatures bite)')
    }
    const ecology = root['ecology']
    const health = isObject(ecology) ? ecology['health'] : undefined
    if (!isObject(health) || health['enabled'] !== true) {
      errors.push('predation.enabled needs ecology.health.enabled (a bite is damage)')
    }
  }
}
