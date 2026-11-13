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
import { checkAnatomy } from './anatomy'
import { checkFeeding } from './feeding'
import { checkPerception } from './perception'
import { checkPredation } from './predation'
import { checkClusters } from './clusters'

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
  'ecology',
  'anatomy',
  'feeding',
  'predation',
  'perception',
  'observatory'
]
const ENVIRONMENT_KEYS = ['width', 'height', 'layout', 'clusters']
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
const RESOURCE_KEYS = [
  'initialCount',
  'maxCount',
  'spawnRate',
  'energyValue',
  'radius',
  'region',
  'distribution',
  'plants'
]
const DISTRIBUTION_KEYS = ['mode', 'scale', 'contrast', 'floor', 'turnover']
const PLANT_KEYS = [
  'enabled',
  'nodes',
  'ring',
  'hubEnergyScale',
  'nodeEnergyScale',
  'hubHardness',
  'regrowRate',
  'photosynthesis',
  'lifespan',
  'maxPlants'
]
const SEXES_KEYS = ['enabled']
const EGGS_KEYS = [
  'enabled',
  'incubation',
  'hatch',
  'carryCost',
  'guardRadius',
  'guardCost',
  'guardDamage'
]
const REPRODUCTION_KEYS = [
  'minEnergy',
  'offspringInvestment',
  'overheadFraction',
  'cooldown',
  'searchRadius',
  'mateSenseRadius',
  'sexes',
  'eggs'
]
const HISTORY_KEYS = ['maxEvents', 'eventDetail', 'maxHistoricalOrganisms']
const OBSERVATORY_KEYS = ['enabled', 'sampleEvery', 'behaviourEvery', 'maxSamples']

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
    checkClusters(environment, errors)
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
    const distribution = checkSection(
      resources,
      'distribution',
      DISTRIBUTION_KEYS,
      errors,
      'resources.distribution'
    )
    if (distribution) {
      checkChoice(distribution, 'mode', 'resources.distribution.mode', ['uniform', 'noise'], errors)
      checkNumber(distribution, 'scale', 'resources.distribution.scale', { positive: true }, errors)
      const contrast = checkNumber(
        distribution,
        'contrast',
        'resources.distribution.contrast',
        {},
        errors
      )
      if (contrast !== undefined && (contrast < 0 || contrast > 1)) {
        errors.push('resources.distribution.contrast must be from 0 to 1')
      }
      const floor = checkNumber(distribution, 'floor', 'resources.distribution.floor', {}, errors)
      if (floor !== undefined && (floor <= 0 || floor > 1)) {
        errors.push('resources.distribution.floor must be greater than 0 and at most 1')
      }
      checkNumber(
        distribution,
        'turnover',
        'resources.distribution.turnover',
        { nonnegative: true },
        errors
      )
    }
    const plants = checkSection(resources, 'plants', PLANT_KEYS, errors, 'resources.plants')
    if (plants) {
      if (typeof plants['enabled'] !== 'boolean') {
        errors.push('resources.plants.enabled must be a boolean')
      }
      const nodes = checkNumber(
        plants,
        'nodes',
        'resources.plants.nodes',
        { integer: true },
        errors
      )
      if (nodes !== undefined && (nodes < 1 || nodes > 6)) {
        errors.push('resources.plants.nodes must be an integer from 1 to 6')
      }
      for (const key of ['ring', 'hubEnergyScale', 'nodeEnergyScale'] as const) {
        checkNumber(plants, key, `resources.plants.${key}`, { positive: true }, errors)
      }
      const hardness = checkNumber(
        plants,
        'hubHardness',
        'resources.plants.hubHardness',
        {},
        errors
      )
      if (hardness !== undefined && hardness < 1) {
        errors.push('resources.plants.hubHardness must be at least 1')
      }
      for (const key of ['regrowRate', 'photosynthesis', 'lifespan'] as const) {
        checkNumber(plants, key, `resources.plants.${key}`, { nonnegative: true }, errors)
      }
      checkNumber(
        plants,
        'maxPlants',
        'resources.plants.maxPlants',
        { integer: true, positive: true },
        errors
      )
    }
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
    checkNumber(
      reproduction,
      'mateSenseRadius',
      'reproduction.mateSenseRadius',
      { positive: true },
      errors
    )
    const sexes = checkSection(reproduction, 'sexes', SEXES_KEYS, errors, 'reproduction.sexes')
    if (sexes && typeof sexes['enabled'] !== 'boolean') {
      errors.push('reproduction.sexes.enabled must be a boolean')
    }
    const eggs = checkSection(reproduction, 'eggs', EGGS_KEYS, errors, 'reproduction.eggs')
    if (eggs) {
      if (typeof eggs['enabled'] !== 'boolean') {
        errors.push('reproduction.eggs.enabled must be a boolean')
      }
      for (const key of ['incubation', 'hatch', 'guardRadius'] as const) {
        checkNumber(eggs, key, `reproduction.eggs.${key}`, { positive: true }, errors)
      }
      for (const key of ['carryCost', 'guardCost', 'guardDamage'] as const) {
        checkNumber(eggs, key, `reproduction.eggs.${key}`, { nonnegative: true }, errors)
      }
      if (eggs['enabled'] === true && sexes && sexes['enabled'] !== true) {
        errors.push(
          'reproduction.eggs.enabled requires reproduction.sexes.enabled (the female lays)'
        )
      }
    }

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

  const observatory = checkSection(value, 'observatory', OBSERVATORY_KEYS, errors)
  if (observatory) {
    if (typeof observatory['enabled'] !== 'boolean') {
      errors.push('observatory.enabled must be a boolean')
    }
    for (const key of ['sampleEvery', 'behaviourEvery', 'maxSamples']) {
      checkNumber(observatory, key, `observatory.${key}`, { integer: true, positive: true }, errors)
    }
  }

  checkGenetics(value, errors)
  checkLearning(value, errors)
  checkSpecies(value, errors)
  checkEcology(value, errors)
  checkAnatomy(value, errors)
  checkFeeding(value, errors)
  checkPredation(value, errors)
  checkPerception(value, errors)

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
 * Merges the predation section: fields merge one by one, `fleshYield` per mouth form, and the
 * carcass section field by field with its `yields` per mouth form (ADR 0023).
 */
function mergePredation(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, Record<string, unknown>>
  const carcass = override['carcass']
  return {
    ...(mergeSection(base, override) as object),
    fleshYield: mergeSection(defaults['fleshYield'] as object, override['fleshYield']),
    carcass:
      isObject(carcass) && isObject(carcass['yields'])
        ? {
            ...(mergeSection(defaults['carcass'] as object, carcass) as object),
            yields: mergeSection(defaults['carcass']!['yields'] as object, carcass['yields'])
          }
        : mergeSection(defaults['carcass'] as object, carcass)
  }
}

/**
 * Merges the obstacles section: fields merge one by one, `kinds` merges per kind and each kind's
 * `density` merges per region type, so a preset can change one density without restating the rest.
 */
function mergeObstacles(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override) || !isObject(override['kinds'])) {
    return mergeSection(base, override)
  }
  const defaults = base as Record<string, Record<string, Record<string, unknown>>>
  const given = override['kinds']
  const kinds: Record<string, unknown> = {}
  for (const name of Object.keys(defaults['kinds']!)) {
    const baseKind = defaults['kinds']![name] as Record<string, unknown>
    const kind = given[name]
    kinds[name] = isObject(kind)
      ? {
          ...baseKind,
          ...kind,
          density: mergeSection(baseKind['density'] as object, kind['density'])
        }
      : mergeSection(baseKind, kind)
  }
  for (const name of Object.keys(given)) {
    if (!(name in defaults['kinds']!)) kinds[name] = given[name]
  }
  return { ...(mergeSection(base, override) as object), kinds }
}

/**
 * Merges the ecology section: each feature merges field by field; `regions.types` and
 * `seasons.seasons` merge per name; `resourceKinds.kinds` is replaced whole; `obstacles` merges per
 * kind and per density.
 */
function mergeEcology(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, Record<string, unknown>>
  const merged: Record<string, unknown> = { ...base, ...override }
  for (const key of ['health', 'hazards', 'resourceKinds', 'migration']) {
    merged[key] = mergeSection(defaults[key] as object, override[key])
  }
  merged['obstacles'] = mergeObstacles(defaults['obstacles'] as object, override['obstacles'])
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

/** Merges the resources section: `distribution` and `plants` merge field by field. */
function mergeResources(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  return {
    ...base,
    ...override,
    distribution: mergeSection(defaults['distribution'] as object, override['distribution']),
    plants: mergeSection(defaults['plants'] as object, override['plants'])
  }
}

/**
 * Merges the anatomy section: `mutation`, `founderLook` and `founderOutline` and `startingBody` merge field by
 * field, `parts` merges per type, and `founder` and `starters` (lists) are replaced whole.
 */
function mergeAnatomy(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  const parts = override['parts']
  return {
    ...base,
    ...override,
    mutation: mergeSection(defaults['mutation'] as object, override['mutation']),
    founderLook: mergeSection(defaults['founderLook'] as object, override['founderLook']),
    founderOutline: mergeSection(defaults['founderOutline'] as object, override['founderOutline']),
    startingBody: mergeSection(defaults['startingBody'] as object, override['startingBody']),
    parts: isObject(parts)
      ? mergeNamed(defaults['parts'] as Record<string, object>, parts)
      : mergeSection(defaults['parts'] as object, parts),
    effects: mergeSection(defaults['effects'] as object, override['effects']),
    mouthForms: isObject(override['mouthForms'])
      ? mergeNamed(defaults['mouthForms'] as Record<string, object>, override['mouthForms'])
      : mergeSection(defaults['mouthForms'] as object, override['mouthForms'])
  }
}

/** Merges the environment: `clusters` merges field by field. */
function mergeEnvironment(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  return {
    ...base,
    ...override,
    clusters: mergeSection(defaults['clusters'] as object, override['clusters'])
  }
}

/** Merges the reproduction section: `sexes` and `eggs` merge field by field. */
function mergeReproduction(base: object, override: unknown): unknown {
  if (override === undefined || !isObject(override)) return mergeSection(base, override)
  const defaults = base as Record<string, object>
  return {
    ...base,
    ...override,
    sexes: mergeSection(defaults['sexes'] as object, override['sexes']),
    eggs: mergeSection(defaults['eggs'] as object, override['eggs'])
  }
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
    environment: mergeEnvironment(base.environment, given['environment']),
    organisms: mergeSection(base.organisms, given['organisms']),
    resources: mergeResources(base.resources, given['resources']),
    reproduction: mergeReproduction(base.reproduction, given['reproduction']),
    history: mergeSection(base.history, given['history']),
    observatory: mergeSection(base.observatory, given['observatory']),
    genetics: mergeGenetics(base.genetics, given['genetics']),
    learning: mergeLearning(base.learning, given['learning']),
    species: mergeSpecies(base.species, given['species']),
    ecology: mergeEcology(base.ecology, given['ecology']),
    anatomy: mergeAnatomy(base.anatomy, given['anatomy']),
    feeding: mergeSection(base.feeding, given['feeding']),
    predation: mergePredation(base.predation, given['predation']),
    perception: mergeSection(base.perception, given['perception'])
  }
  const result = validateWorldConfig(merged)
  if (!result.ok) throw new ConfigValidationError(result.errors)
  return merged as unknown as WorldConfig
}
