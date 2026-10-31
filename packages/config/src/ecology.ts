import { REGION_TYPES, SEASONS } from '@evo/contracts'
import type { RegionType } from '@evo/contracts'
import { checkNumber, checkSection, isObject } from './checks'
import type { PlainObject } from './checks'

const HEALTH_KEYS = [
  'enabled',
  'maxHealth',
  'regenRate',
  'regenEnergyCost',
  'regenMinEnergyFraction'
]
const REGIONS_KEYS = [
  'enabled',
  'seedCount',
  'gridSize',
  'temperatureTolerance',
  'temperatureCost',
  'types'
]
const REGION_TYPE_KEYS = [
  'movementScale',
  'visibility',
  'temperature',
  'hazardExposure',
  'reproductionScale'
]
const SEASONS_KEYS = ['enabled', 'seasonLength', 'seasons']
const SEASON_KEYS = [
  'regeneration',
  'movementScale',
  'hazardIntensity',
  'reproductionScale',
  'temperature',
  'visibility'
]
const HAZARDS_KEYS = [
  'enabled',
  'areaCount',
  'areaRadius',
  'areaDamage',
  'stormRate',
  'stormRadius',
  'stormDuration',
  'stormDamage'
]
const RESOURCE_KINDS_KEYS = ['enabled', 'kinds']
const RESOURCE_KIND_KEYS = [
  'name',
  'energyScale',
  'radiusScale',
  'spawnWeight',
  'detectability',
  'toxicity',
  'regions'
]
const MIGRATION_KEYS = ['enabled', 'dwellTime']
const ECOLOGY_KEYS = ['health', 'regions', 'seasons', 'hazards', 'resourceKinds', 'migration']

function checkEnabled(section: PlainObject, path: string, errors: string[]): void {
  const value = section['enabled']
  if (value === undefined) errors.push(`${path}.enabled is required`)
  else if (typeof value !== 'boolean') errors.push(`${path}.enabled must be a boolean`)
}

/** A number in `(0, 1]` (a multiplier that may shrink but never grow or vanish). */
function checkUnitMultiplier(
  section: PlainObject,
  key: string,
  path: string,
  errors: string[]
): void {
  const value = checkNumber(section, key, path, {}, errors)
  if (value !== undefined && (value <= 0 || value > 1)) {
    errors.push(`${path} must be greater than zero and at most one`)
  }
}

function checkRange(
  section: PlainObject,
  key: string,
  path: string,
  min: number,
  max: number,
  errors: string[]
): void {
  const value = checkNumber(section, key, path, {}, errors)
  if (value !== undefined && (value < min || value > max)) {
    errors.push(`${path} must be between ${min} and ${max}`)
  }
}

function checkHealth(ecology: PlainObject, errors: string[]): void {
  const health = checkSection(ecology, 'health', HEALTH_KEYS, errors, 'ecology.health')
  if (!health) return
  checkEnabled(health, 'ecology.health', errors)
  checkNumber(health, 'maxHealth', 'ecology.health.maxHealth', { positive: true }, errors)
  checkNumber(health, 'regenRate', 'ecology.health.regenRate', { nonnegative: true }, errors)
  checkNumber(
    health,
    'regenEnergyCost',
    'ecology.health.regenEnergyCost',
    { nonnegative: true },
    errors
  )
  checkRange(
    health,
    'regenMinEnergyFraction',
    'ecology.health.regenMinEnergyFraction',
    0,
    1,
    errors
  )
}

function checkRegions(ecology: PlainObject, errors: string[]): void {
  const regions = checkSection(ecology, 'regions', REGIONS_KEYS, errors, 'ecology.regions')
  if (!regions) return
  checkEnabled(regions, 'ecology.regions', errors)
  checkNumber(
    regions,
    'seedCount',
    'ecology.regions.seedCount',
    { integer: true, positive: true },
    errors
  )
  checkNumber(
    regions,
    'gridSize',
    'ecology.regions.gridSize',
    { integer: true, positive: true },
    errors
  )
  checkRange(regions, 'temperatureTolerance', 'ecology.regions.temperatureTolerance', 0, 1, errors)
  checkNumber(
    regions,
    'temperatureCost',
    'ecology.regions.temperatureCost',
    { nonnegative: true },
    errors
  )
  const types = checkSection(regions, 'types', [...REGION_TYPES], errors, 'ecology.regions.types')
  if (!types) return
  for (const type of REGION_TYPES) {
    const path = `ecology.regions.types.${type}`
    const entry = checkSection(types, type, REGION_TYPE_KEYS, errors, path)
    if (!entry) continue
    checkUnitMultiplier(entry, 'movementScale', `${path}.movementScale`, errors)
    checkUnitMultiplier(entry, 'visibility', `${path}.visibility`, errors)
    checkRange(entry, 'temperature', `${path}.temperature`, -1, 1, errors)
    checkNumber(entry, 'hazardExposure', `${path}.hazardExposure`, { nonnegative: true }, errors)
    checkNumber(entry, 'reproductionScale', `${path}.reproductionScale`, { positive: true }, errors)
  }
}

function checkSeasons(ecology: PlainObject, errors: string[]): void {
  const seasons = checkSection(ecology, 'seasons', SEASONS_KEYS, errors, 'ecology.seasons')
  if (!seasons) return
  checkEnabled(seasons, 'ecology.seasons', errors)
  checkNumber(seasons, 'seasonLength', 'ecology.seasons.seasonLength', { positive: true }, errors)
  const table = checkSection(seasons, 'seasons', [...SEASONS], errors, 'ecology.seasons.seasons')
  if (!table) return
  for (const season of SEASONS) {
    const path = `ecology.seasons.seasons.${season}`
    const entry = checkSection(table, season, SEASON_KEYS, errors, path)
    if (!entry) continue
    checkNumber(entry, 'regeneration', `${path}.regeneration`, { nonnegative: true }, errors)
    checkUnitMultiplier(entry, 'movementScale', `${path}.movementScale`, errors)
    checkNumber(entry, 'hazardIntensity', `${path}.hazardIntensity`, { nonnegative: true }, errors)
    checkNumber(entry, 'reproductionScale', `${path}.reproductionScale`, { positive: true }, errors)
    checkRange(entry, 'temperature', `${path}.temperature`, -1, 1, errors)
    checkUnitMultiplier(entry, 'visibility', `${path}.visibility`, errors)
  }
}

function checkHazards(ecology: PlainObject, errors: string[]): void {
  const hazards = checkSection(ecology, 'hazards', HAZARDS_KEYS, errors, 'ecology.hazards')
  if (!hazards) return
  checkEnabled(hazards, 'ecology.hazards', errors)
  checkNumber(
    hazards,
    'areaCount',
    'ecology.hazards.areaCount',
    { integer: true, nonnegative: true },
    errors
  )
  checkNumber(hazards, 'areaRadius', 'ecology.hazards.areaRadius', { positive: true }, errors)
  checkNumber(hazards, 'areaDamage', 'ecology.hazards.areaDamage', { nonnegative: true }, errors)
  checkNumber(hazards, 'stormRate', 'ecology.hazards.stormRate', { nonnegative: true }, errors)
  checkNumber(hazards, 'stormRadius', 'ecology.hazards.stormRadius', { positive: true }, errors)
  checkNumber(hazards, 'stormDuration', 'ecology.hazards.stormDuration', { positive: true }, errors)
  checkNumber(hazards, 'stormDamage', 'ecology.hazards.stormDamage', { nonnegative: true }, errors)
}

function checkResourceKinds(ecology: PlainObject, errors: string[]): void {
  const section = checkSection(
    ecology,
    'resourceKinds',
    RESOURCE_KINDS_KEYS,
    errors,
    'ecology.resourceKinds'
  )
  if (!section) return
  checkEnabled(section, 'ecology.resourceKinds', errors)
  const kinds = section['kinds']
  if (kinds === undefined) {
    errors.push('ecology.resourceKinds.kinds is required')
    return
  }
  if (!Array.isArray(kinds)) {
    errors.push('ecology.resourceKinds.kinds must be an array')
    return
  }
  if (kinds.length === 0) errors.push('ecology.resourceKinds.kinds must not be empty')
  if (kinds.length > 255) errors.push('ecology.resourceKinds.kinds must have at most 255 entries')
  let totalWeight = 0
  kinds.forEach((entry: unknown, index) => {
    const path = `ecology.resourceKinds.kinds[${index}]`
    if (!isObject(entry)) {
      errors.push(`${path} must be an object`)
      return
    }
    for (const key of Object.keys(entry)) {
      if (!RESOURCE_KIND_KEYS.includes(key)) errors.push(`unknown property "${path}.${key}"`)
    }
    if (typeof entry['name'] !== 'string' || entry['name'] === '') {
      errors.push(`${path}.name must be a non-empty string`)
    }
    checkNumber(entry, 'energyScale', `${path}.energyScale`, { positive: true }, errors)
    checkNumber(entry, 'radiusScale', `${path}.radiusScale`, { positive: true }, errors)
    const weight = checkNumber(
      entry,
      'spawnWeight',
      `${path}.spawnWeight`,
      { nonnegative: true },
      errors
    )
    if (weight !== undefined) totalWeight += weight
    checkUnitMultiplier(entry, 'detectability', `${path}.detectability`, errors)
    checkNumber(entry, 'toxicity', `${path}.toxicity`, { nonnegative: true }, errors)
    const regions = entry['regions']
    if (regions === undefined) errors.push(`${path}.regions is required`)
    else if (!Array.isArray(regions)) errors.push(`${path}.regions must be an array`)
    else {
      for (const region of regions as unknown[]) {
        if (typeof region !== 'string' || !REGION_TYPES.includes(region as RegionType)) {
          errors.push(`${path}.regions must only contain: ${REGION_TYPES.join(', ')}`)
          break
        }
      }
    }
  })
  if (kinds.length > 0 && totalWeight <= 0) {
    errors.push('ecology.resourceKinds.kinds spawnWeight must not all be zero')
  }
}

function checkMigration(ecology: PlainObject, errors: string[]): void {
  const migration = checkSection(ecology, 'migration', MIGRATION_KEYS, errors, 'ecology.migration')
  if (!migration) return
  checkEnabled(migration, 'ecology.migration', errors)
  checkNumber(migration, 'dwellTime', 'ecology.migration.dwellTime', { positive: true }, errors)
}

/** Validates the top-level `ecology` section of a complete configuration. */
export function checkEcology(root: PlainObject, errors: string[]): void {
  const ecology = checkSection(root, 'ecology', ECOLOGY_KEYS, errors)
  if (!ecology) return
  checkHealth(ecology, errors)
  checkRegions(ecology, errors)
  checkSeasons(ecology, errors)
  checkHazards(ecology, errors)
  checkResourceKinds(ecology, errors)
  checkMigration(ecology, errors)
}
