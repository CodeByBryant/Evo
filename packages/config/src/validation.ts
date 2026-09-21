import { MAX_SEED } from '@evo/contracts'
import type { ValidationResult, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { DEFAULT_WORLD_CONFIG } from './defaults'

type PlainObject = Record<string, unknown>

const isObject = (value: unknown): value is PlainObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ROOT_KEYS = [
  'timestep',
  'maxPopulation',
  'extinctionPolicy',
  'environment',
  'organisms',
  'resources',
  'history'
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
  'maxAge'
]
const RESOURCE_KEYS = ['initialCount', 'maxCount', 'spawnRate', 'energyValue', 'radius']
const HISTORY_KEYS = ['maxEvents', 'eventDetail']

const EXTINCTION_POLICIES = ['stop', 'allow-immigration', 'seed-bank', 'sandbox-recovery']
const EVENT_DETAILS = ['essential', 'verbose']

interface NumberRule {
  integer?: boolean
  /** Value must be strictly greater than zero. */
  positive?: boolean
  /** Value must be zero or greater. */
  nonnegative?: boolean
}

function checkNumber(
  section: PlainObject,
  key: string,
  path: string,
  rule: NumberRule,
  errors: string[]
): number | undefined {
  const value = section[key]
  if (value === undefined) {
    errors.push(`${path} is required`)
    return undefined
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number`)
    return undefined
  }
  if (rule.integer && !Number.isInteger(value)) {
    errors.push(`${path} must be an integer`)
    return undefined
  }
  if (rule.positive && value <= 0) {
    errors.push(
      rule.integer
        ? `${path} must be an integer greater than zero`
        : `${path} must be greater than zero`
    )
    return undefined
  }
  if (rule.nonnegative && value < 0) {
    errors.push(`${path} must be nonnegative`)
    return undefined
  }
  return value
}

function checkKeys(section: PlainObject, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(section)) {
    if (!allowed.includes(key)) {
      errors.push(`unknown property "${path === '' ? key : `${path}.${key}`}"`)
    }
  }
}

function checkSection(
  root: PlainObject,
  key: string,
  allowed: string[],
  errors: string[]
): PlainObject | undefined {
  const section = root[key]
  if (section === undefined) {
    errors.push(`${key} is required`)
    return undefined
  }
  if (!isObject(section)) {
    errors.push(`${key} must be an object`)
    return undefined
  }
  checkKeys(section, allowed, key, errors)
  return section
}

function checkChoice(
  section: PlainObject,
  key: string,
  path: string,
  choices: string[],
  errors: string[]
): string | undefined {
  const value = section[key]
  if (value === undefined) {
    errors.push(`${path} is required`)
    return undefined
  }
  if (typeof value !== 'string' || !choices.includes(value)) {
    errors.push(`${path} must be one of: ${choices.join(', ')}`)
    return undefined
  }
  return value
}

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
    const radius = checkNumber(organisms, 'radius', 'organisms.radius', { positive: true }, errors)
    checkNumber(organisms, 'maxSpeed', 'organisms.maxSpeed', { nonnegative: true }, errors)
    checkNumber(organisms, 'maxTurnRate', 'organisms.maxTurnRate', { nonnegative: true }, errors)
    checkNumber(organisms, 'sensorRadius', 'organisms.sensorRadius', { positive: true }, errors)
    checkNumber(organisms, 'wanderJitter', 'organisms.wanderJitter', { nonnegative: true }, errors)
    checkNumber(organisms, 'basalCost', 'organisms.basalCost', { nonnegative: true }, errors)
    checkNumber(organisms, 'movementCost', 'organisms.movementCost', { nonnegative: true }, errors)
    checkNumber(organisms, 'maxAge', 'organisms.maxAge', { positive: true }, errors)

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

    if (initialCount !== undefined && maxCount !== undefined && initialCount > maxCount) {
      errors.push('resources.initialCount must not exceed resources.maxCount')
    }
    if (radius !== undefined && width !== undefined && height !== undefined) {
      if (radius * 2 >= Math.min(width, height)) {
        errors.push('resources.radius must be less than half of the smaller environment dimension')
      }
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
  }

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
    history: mergeSection(base.history, given['history'])
  }
  const result = validateWorldConfig(merged)
  if (!result.ok) throw new ConfigValidationError(result.errors)
  return merged as unknown as WorldConfig
}
