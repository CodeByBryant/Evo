import { MAX_SEED } from '@evo/contracts'
import type { ValidationResult, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { DEFAULT_WORLD_CONFIG } from './defaults'
import {
  checkChoice,
  checkFraction,
  checkKeys,
  checkNumber,
  checkSection,
  isObject
} from './checks'
import type { PlainObject } from './checks'
import { checkGenetics } from './genetics'
import { checkLearning, checkRegion } from './learning'
import { checkEcology } from './ecology'
import { checkSpecies } from './species'

const ROOT_KEYS = [
  'timestep',
  'maxPopulation',
  'extinctionPolicy',
  'environment',
  'organisms',
  'resources',
  'reproduction',
  'history',
  'genetics',
  'learning',
  'species',
  'ecology'
]
const ENVIRONMENT_KEYS = ['width', 'height']
const ORGANISM_KEYS = [
  'initialCount',
  'initialEnergy',
  'maxEnergy',
  'radius',
  'maxSpeed',
  'maxTurnRate',
  'sensorRadius',
  'wanderJitter',
  'basalCost',
  'movementCost',
  'turningCost',
  'sensorCost',
  'learningCost',
  'hue',
  'maxAge',
  'maturityAge',
  'senescenceAge',
  'juvenileSizeScale',
  'juvenileSpeedScale',
  'juvenileMetabolicScale'
]
const RESOURCE_KEYS = ['initialCount', 'maxCount', 'spawnRate', 'energyValue', 'radius', 'region']
const REPRODUCTION_KEYS = [
  'minEnergy',
  'offspringInvestment',
  'overheadFraction',
  'cooldown',
  'searchRadius'
]
const HISTORY_KEYS = ['maxEvents', 'eventDetail', 'maxHistoricalOrganisms']

const EXTINCTION_POLICIES = ['stop', 'allow-immigration', 'seed-bank', 'sandbox-recovery']
const EVENT_DETAILS = ['essential', 'verbose']

/**
 * Validates a complete world configuration of unknown origin (for example parsed JSON).
 * Reports every problem found; never repairs or normalizes values.
 */
export function validateWorldConfig(value: unknown): ValidationResult {
  const errors: string[] = []
  if (!isObject(value)) {
    return { ok: false, errors: ['configuration must be an object'] }
  }
  checkKeys(value, ROOT_KEYS, '', errors)

  checkNumber(value, 'timestep', 'timestep', { positive: true }, errors)
  const maxPopulation = checkNumber(
    value,
    'maxPopulation',
    'maxPopulation',
    { integer: true, positive: true },
    errors
  )

  const policy = checkChoice(
    value,
    'extinctionPolicy',
    'extinctionPolicy',
    EXTINCTION_POLICIES,
    errors
  )
  if (policy !== undefined && policy !== 'stop') {
    errors.push(`extinctionPolicy "${policy}" is not implemented yet; only "stop" is supported`)
  }

  const environment = checkSection(value, 'environment', ENVIRONMENT_KEYS, errors)
  let width: number | undefined
  let height: number | undefined
  if (environment) {
    width = checkNumber(environment, 'width', 'environment.width', { positive: true }, errors)
    height = checkNumber(environment, 'height', 'environment.height', { positive: true }, errors)
  }

  const organisms = checkSection(value, 'organisms', ORGANISM_KEYS, errors)
  let organismsMaxEnergy: number | undefined
  if (organisms) {
    const initialCount = checkNumber(
      organisms,
      'initialCount',
      'organisms.initialCount',
      { integer: true, nonnegative: true },
      errors
    )
    const initialEnergy = checkNumber(
      organisms,
      'initialEnergy',
      'organisms.initialEnergy',
      { positive: true },
      errors
    )
    const maxEnergy = checkNumber(
      organisms,
      'maxEnergy',
      'organisms.maxEnergy',
      { positive: true },
      errors
    )
    organismsMaxEnergy = maxEnergy
    const radius = checkNumber(organisms, 'radius', 'organisms.radius', { positive: true }, errors)
    checkNumber(organisms, 'maxSpeed', 'organisms.maxSpeed', { nonnegative: true }, errors)
    checkNumber(organisms, 'maxTurnRate', 'organisms.maxTurnRate', { nonnegative: true }, errors)
    checkNumber(organisms, 'sensorRadius', 'organisms.sensorRadius', { positive: true }, errors)
    checkNumber(organisms, 'wanderJitter', 'organisms.wanderJitter', { nonnegative: true }, errors)
    checkNumber(organisms, 'basalCost', 'organisms.basalCost', { nonnegative: true }, errors)
    checkNumber(organisms, 'movementCost', 'organisms.movementCost', { nonnegative: true }, errors)
    checkNumber(organisms, 'turningCost', 'organisms.turningCost', { nonnegative: true }, errors)
    checkNumber(organisms, 'sensorCost', 'organisms.sensorCost', { nonnegative: true }, errors)
    checkNumber(organisms, 'learningCost', 'organisms.learningCost', { nonnegative: true }, errors)
    const maxAge = checkNumber(organisms, 'maxAge', 'organisms.maxAge', { positive: true }, errors)
    const maturityAge = checkNumber(
      organisms,
      'maturityAge',
      'organisms.maturityAge',
      { positive: true },
      errors
    )
    const senescenceAge = checkNumber(
      organisms,
      'senescenceAge',
      'organisms.senescenceAge',
      { positive: true },
      errors
    )
    checkFraction(organisms, 'juvenileSizeScale', 'organisms.juvenileSizeScale', errors)
    checkFraction(organisms, 'juvenileSpeedScale', 'organisms.juvenileSpeedScale', errors)
    checkFraction(organisms, 'juvenileMetabolicScale', 'organisms.juvenileMetabolicScale', errors)
    const hue = checkNumber(organisms, 'hue', 'organisms.hue', {}, errors)
    if (hue !== undefined && (hue < 0 || hue >= 1)) {
      errors.push('organisms.hue must be at least zero and less than one')
    }

    if (initialCount !== undefined && maxPopulation !== undefined && initialCount > maxPopulation) {
      errors.push('organisms.initialCount must not exceed maxPopulation')
    }
    if (initialEnergy !== undefined && maxEnergy !== undefined && initialEnergy > maxEnergy) {
      errors.push('organisms.initialEnergy must not exceed organisms.maxEnergy')
    }
    if (radius !== undefined && width !== undefined && height !== undefined) {
      if (radius * 2 >= Math.min(width, height)) {
        errors.push('organisms.radius must be less than half of the smaller environment dimension')
      }
    }
    if (maturityAge !== undefined && senescenceAge !== undefined && maturityAge >= senescenceAge) {
      errors.push('organisms.maturityAge must be less than organisms.senescenceAge')
    }
    if (senescenceAge !== undefined && maxAge !== undefined && senescenceAge >= maxAge) {
      errors.push('organisms.senescenceAge must be less than organisms.maxAge')
    }
  }

  const resources = checkSection(value, 'resources', RESOURCE_KEYS, errors)
  if (resources) {
    const initialCount = checkNumber(
      resources,
      'initialCount',
      'resources.initialCount',
      { integer: true, nonnegative: true },
      errors
    )
    const maxCount = checkNumber(
      resources,
      'maxCount',
      'resources.maxCount',
      { integer: true, nonnegative: true },
      errors
    )
    checkNumber(resources, 'spawnRate', 'resources.spawnRate', { nonnegative: true }, errors)
    checkNumber(resources, 'energyValue', 'resources.energyValue', { positive: true }, errors)
    const radius = checkNumber(resources, 'radius', 'resources.radius', { positive: true }, errors)

    checkRegion(resources, width, height, errors)
    if (initialCount !== undefined && maxCount !== undefined && initialCount > maxCount) {
      errors.push('resources.initialCount must not exceed resources.maxCount')
    }
    if (radius !== undefined && width !== undefined && height !== undefined) {
      if (radius * 2 >= Math.min(width, height)) {
        errors.push('resources.radius must be less than half of the smaller environment dimension')
      }
    }
  }

  const reproduction = checkSection(value, 'reproduction', REPRODUCTION_KEYS, errors)
  if (reproduction) {
    const minEnergy = checkNumber(
      reproduction,
      'minEnergy',
      'reproduction.minEnergy',
      { positive: true },
      errors
    )
    const investment = checkNumber(
      reproduction,
      'offspringInvestment',
      'reproduction.offspringInvestment',
      { positive: true },
      errors
    )
    const overhead = checkNumber(
      reproduction,
      'overheadFraction',
      'reproduction.overheadFraction',
      { nonnegative: true },
      errors
    )
    checkNumber(reproduction, 'cooldown', 'reproduction.cooldown', { nonnegative: true }, errors)
    checkNumber(
      reproduction,
      'searchRadius',
      'reproduction.searchRadius',
      { positive: true },
      errors
    )

    if (
      investment !== undefined &&
      overhead !== undefined &&
      minEnergy !== undefined &&
      investment * (1 + overhead) > minEnergy
    ) {
      errors.push(
        'reproduction.offspringInvestment * (1 + reproduction.overheadFraction) must not exceed reproduction.minEnergy'
      )
    }
    if (
      investment !== undefined &&
      organismsMaxEnergy !== undefined &&
      investment * 2 > organismsMaxEnergy
    ) {
      errors.push('twice reproduction.offspringInvestment must not exceed organisms.maxEnergy')
    }
  }

  const history = checkSection(value, 'history', HISTORY_KEYS, errors)
  if (history) {
    checkNumber(
      history,
      'maxEvents',
      'history.maxEvents',
      { integer: true, nonnegative: true },
      errors
    )
    checkChoice(history, 'eventDetail', 'history.eventDetail', EVENT_DETAILS, errors)
    checkNumber(
      history,
      'maxHistoricalOrganisms',
      'history.maxHistoricalOrganisms',
      { integer: true, nonnegative: true },
      errors
    )
  }

  checkGenetics(value, errors)
  checkLearning(value, errors)
  checkSpecies(value, errors)
  checkEcology(value, errors)

  return { ok: errors.length === 0, errors }
}

/** Validates a world seed: an integer in `[0, 2^32 - 1]`. */
export function validateSeed(value: unknown): ValidationResult {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_SEED) {
    return { ok: false, errors: [`seed must be an integer between 0 and ${MAX_SEED}`] }
  }
  return { ok: true, errors: [] }
}

/** Thrown when a configuration or seed is invalid; lists every problem found. */
export class ConfigValidationError extends Error {
  readonly errors: readonly string[]

  constructor(errors: readonly string[]) {
    super(`Invalid world configuration:\n${errors.map((message) => `  - ${message}`).join('\n')}`)
    this.name = 'ConfigValidationError'
    this.errors = errors
  }
}

/** Merges the genetics section: its nested sections merge field by field, `genes` by gene path. */
function mergeGenetics(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  return {
    ...base,
    ...override,
    brain: mergeSection(defaults['brain'] as object, override['brain']),
    learning: mergeSection(defaults['learning'] as object, override['learning']),
    learningInheritance: mergeSection(
      defaults['learningInheritance'] as object,
      override['learningInheritance']
    ),
    genes: mergeSection(defaults['genes'] as object, override['genes'])
  }
}

/** Merges the learning section: `rewardWeights` merges field by field. */
function mergeLearning(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  return {
    ...base,
    ...override,
    rewardWeights: mergeSection(defaults['rewardWeights'] as object, override['rewardWeights'])
  }
}

/** Merges the species section: `distanceWeights` merges field by field. */
function mergeSpecies(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  return {
    ...base,
    ...override,
    distanceWeights: mergeSection(
      defaults['distanceWeights'] as object,
      override['distanceWeights']
    )
  }
}

/**
 * Merges the ecology section: each feature merges field by field; `regions.types` and
 * `seasons.seasons` merge per name; `resourceKinds.kinds` is replaced whole.
 */
function mergeEcology(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, Record<string, unknown>>
  const merged: Record<string, unknown> = { ...base, ...override }
  for (const key of ['health', 'hazards', 'resourceKinds', 'migration']) {
    merged[key] = mergeSection(defaults[key] as object, override[key])
  }
  const regions = override['regions']
  merged['regions'] =
    isObject(regions) && isObject(regions['types'])
      ? {
          ...(mergeSection(defaults['regions'] as object, regions) as object),
          types: mergeNamed(
            defaults['regions']!['types'] as Record<string, object>,
            regions['types']
          )
        }
      : mergeSection(defaults['regions'] as object, regions)
  const seasons = override['seasons']
  merged['seasons'] =
    isObject(seasons) && isObject(seasons['seasons'])
      ? {
          ...(mergeSection(defaults['seasons'] as object, seasons) as object),
          seasons: mergeNamed(
            defaults['seasons']!['seasons'] as Record<string, object>,
            seasons['seasons']
          )
        }
      : mergeSection(defaults['seasons'] as object, seasons)
  return merged
}

/** Merges a table of named sections, keeping unknown names so validation can report them. */
function mergeNamed(base: Record<string, object>, override: Record<string, unknown>): unknown {
  const result: Record<string, unknown> = { ...base }
  for (const name of [...Object.keys(base), ...Object.keys(override)]) {
    result[name] =
      name in base ? mergeSection(base[name] as object, override[name]) : override[name]
  }
  return result
}

/** Merges one section, keeping non-object overrides so validation can report them. */
function mergeSection(base: object, override: unknown): unknown {
  if (override === undefined) return { ...base }
  return isObject(override) ? { ...base, ...override } : override
}

/**
 * Merges overrides onto the defaults and validates the result.
 * @throws ConfigValidationError listing every problem, if the merged configuration is invalid.
 */
export function resolveWorldConfig(overrides?: WorldConfigOverrides): WorldConfig {
  const base = DEFAULT_WORLD_CONFIG
  if (overrides !== undefined && !isObject(overrides)) {
    throw new ConfigValidationError(['configuration overrides must be an object'])
  }
  const given: PlainObject = overrides ?? {}
  const merged = {
    ...base,
    ...given,
    environment: mergeSection(base.environment, given['environment']),
    organisms: mergeSection(base.organisms, given['organisms']),
    resources: mergeSection(base.resources, given['resources']),
    reproduction: mergeSection(base.reproduction, given['reproduction']),
    history: mergeSection(base.history, given['history']),
    genetics: mergeGenetics(base.genetics, given['genetics']),
    learning: mergeLearning(base.learning, given['learning']),
    species: mergeSpecies(base.species, given['species']),
    ecology: mergeEcology(base.ecology, given['ecology'])
  }
  const result = validateWorldConfig(merged)
  if (!result.ok) throw new ConfigValidationError(result.errors)
  return merged as unknown as WorldConfig
}
