import { GENE_DEFINITIONS } from '@evo/contracts'
import type { GenePath, GeneRange, GeneRangeOverrides, WorldConfig } from '@evo/contracts'
import { checkChoice, checkKeys, checkNumber, checkSection, isObject } from './checks'
import type { PlainObject } from './checks'
import { DEFAULT_GENE_RANGES } from './defaults'

const GENETICS_KEYS = [
  'mutationRateScale',
  'mutationStrengthScale',
  'blendAlpha',
  'brain',
  'learning',
  'learningInheritance',
  'genes'
]
const BRAIN_KEYS = [
  'hiddenSize',
  'memorySize',
  'innatePrior',
  'initialWeightStd',
  'weightMutationRate',
  'weightMutationStd'
]
const LEARNING_KEYS = [
  'learningRate',
  'discountFactor',
  'eligibilityTraceDecay',
  'explorationRate',
  'riskTolerance',
  'noveltyPreference',
  'persistence'
]
const INHERITANCE_KEYS = ['mode', 'fraction']
const INHERITANCE_MODES = ['baldwinian', 'partial', 'lamarckian']
const RANGE_KEYS = ['min', 'max', 'mutationRate', 'mutationStd']
const GENE_PATHS: readonly string[] = GENE_DEFINITIONS.map((definition) => definition.path)

/**
 * The effective range of every gene: the default range, with per-gene overrides applied field by
 * field. A default edge that excludes the gene's founder baseline is widened to include it, so
 * changing a baseline in `organisms.*` / `reproduction.*` never needs a matching range override.
 * An edge set explicitly by an override is never moved (validation rejects a baseline outside it).
 */
export function resolveGeneRanges(
  overrides: GeneRangeOverrides,
  baselines: Partial<Record<GenePath, number>> = {}
): Record<GenePath, GeneRange> {
  const resolved = {} as Record<GenePath, GeneRange>
  for (const definition of GENE_DEFINITIONS) {
    const raw: unknown = overrides[definition.path]
    const override: Partial<GeneRange> = isObject(raw) ? (raw as Partial<GeneRange>) : {}
    const range = { ...DEFAULT_GENE_RANGES[definition.path], ...override }
    const baseline = baselines[definition.path]
    if (baseline !== undefined) {
      if (override.min === undefined && baseline < range.min) range.min = baseline
      if (override.max === undefined && baseline > range.max) range.max = baseline
    }
    resolved[definition.path] = range
  }
  return resolved
}

/** Each gene's founder value: the config field it was previously read from. */
export function geneBaselines(config: WorldConfig): Record<GenePath, number> {
  const { organisms, reproduction, genetics } = config
  return {
    'physical.radius': organisms.radius,
    'physical.maxSpeed': organisms.maxSpeed,
    'physical.maxTurnRate': organisms.maxTurnRate,
    'physical.maturityAge': organisms.maturityAge,
    'physical.senescenceAge': organisms.senescenceAge,
    'physical.maxAge': organisms.maxAge,
    'physical.hue': organisms.hue,
    'sensory.sensorRadius': organisms.sensorRadius,
    'metabolic.basalCost': organisms.basalCost,
    'metabolic.movementCost': organisms.movementCost,
    'metabolic.turningCost': organisms.turningCost,
    'behavioral.wanderJitter': organisms.wanderJitter,
    'reproduction.minEnergy': reproduction.minEnergy,
    'reproduction.offspringInvestment': reproduction.offspringInvestment,
    'reproduction.cooldown': reproduction.cooldown,
    'reproduction.searchRadius': reproduction.searchRadius,
    'learning.learningRate': genetics.learning.learningRate,
    'learning.discountFactor': genetics.learning.discountFactor,
    'learning.eligibilityTraceDecay': genetics.learning.eligibilityTraceDecay,
    'learning.explorationRate': genetics.learning.explorationRate,
    'learning.riskTolerance': genetics.learning.riskTolerance,
    'learning.noveltyPreference': genetics.learning.noveltyPreference,
    'learning.persistence': genetics.learning.persistence
  }
}

/** A number in the closed interval `[0, 1]`. */
function checkUnit(
  section: PlainObject,
  key: string,
  path: string,
  errors: string[]
): number | undefined {
  const value = checkNumber(section, key, path, {}, errors)
  if (value === undefined) return undefined
  if (value < 0 || value > 1) {
    errors.push(`${path} must be between zero and one`)
    return undefined
  }
  return value
}

interface GeneticsContext {
  /** The merged value being validated; used to derive baselines and cross-field rules. */
  root: PlainObject
}

function numberAt(section: unknown, key: string): number | undefined {
  if (!isObject(section)) return undefined
  const value = section[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function checkGeneOverrides(genes: unknown, errors: string[]): void {
  if (!isObject(genes)) {
    errors.push('genetics.genes must be an object')
    return
  }
  for (const [path, override] of Object.entries(genes)) {
    if (!GENE_PATHS.includes(path)) {
      errors.push(`unknown property "genetics.genes.${path}"`)
      continue
    }
    if (!isObject(override)) {
      errors.push(`genetics.genes.${path} must be an object`)
      continue
    }
    checkKeys(override, RANGE_KEYS, `genetics.genes.${path}`, errors)
    for (const key of RANGE_KEYS) {
      if (override[key] === undefined) continue
      const value = override[key]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`genetics.genes.${path}.${key} must be a finite number`)
      }
    }
  }
}

/** Per-gene range rules, evaluated on the effective (default + override) ranges. */
function checkEffectiveRanges(context: GeneticsContext, errors: string[]): void {
  const { root } = context
  const genetics = root['genetics']
  if (!isObject(genetics) || !isObject(genetics['genes'])) return
  const genes = genetics['genes'] as GeneRangeOverrides
  const baselines = baselineValues(root)
  const ranges = resolveGeneRanges(genes, baselines)

  for (const definition of GENE_DEFINITIONS) {
    const range = ranges[definition.path]
    const label = `genetics.genes.${definition.path}`
    if (
      !Number.isFinite(range.min) ||
      !Number.isFinite(range.max) ||
      !Number.isFinite(range.mutationRate) ||
      !Number.isFinite(range.mutationStd)
    ) {
      continue
    }
    if (range.min >= range.max) {
      errors.push(`${label}: min must be less than max`)
      continue
    }
    if (range.mutationRate < 0 || range.mutationRate > 1) {
      errors.push(`${label}: mutationRate must be between zero and one`)
    }
    if (range.mutationStd < 0) {
      errors.push(`${label}: mutationStd must be nonnegative`)
    }
    const baseline = baselines[definition.path]
    if (baseline !== undefined) {
      const inside =
        definition.kind === 'circular'
          ? baseline >= range.min && baseline < range.max
          : baseline >= range.min && baseline <= range.max
      if (!inside) {
        errors.push(`${label}: the founder baseline (${baseline}) must lie within [min, max]`)
      }
    }
  }

  // Ordered genes are kept in order by the operators (lower bound raised above the earlier
  // gene), which needs room above it: the upper edges must increase strictly.
  for (const definition of GENE_DEFINITIONS) {
    if (definition.orderedAfter === undefined) continue
    if (ranges[definition.path].max <= ranges[definition.orderedAfter].max) {
      errors.push(
        `the ${definition.path} gene range max must be greater than the ${definition.orderedAfter} gene range max`
      )
    }
  }
  if (ranges['reproduction.offspringInvestment'].min <= 0) {
    errors.push('genetics.genes.reproduction.offspringInvestment: min must be greater than zero')
  }
}

function baselineValues(root: PlainObject): Partial<Record<GenePath, number>> {
  const organisms = root['organisms']
  const reproduction = root['reproduction']
  const learning = isObject(root['genetics']) ? root['genetics']['learning'] : undefined
  const values: Partial<Record<GenePath, number>> = {}
  const set = (path: GenePath, value: number | undefined): void => {
    if (value !== undefined) values[path] = value
  }
  set('physical.radius', numberAt(organisms, 'radius'))
  set('physical.maxSpeed', numberAt(organisms, 'maxSpeed'))
  set('physical.maxTurnRate', numberAt(organisms, 'maxTurnRate'))
  set('physical.maturityAge', numberAt(organisms, 'maturityAge'))
  set('physical.senescenceAge', numberAt(organisms, 'senescenceAge'))
  set('physical.maxAge', numberAt(organisms, 'maxAge'))
  set('physical.hue', numberAt(organisms, 'hue'))
  set('sensory.sensorRadius', numberAt(organisms, 'sensorRadius'))
  set('metabolic.basalCost', numberAt(organisms, 'basalCost'))
  set('metabolic.movementCost', numberAt(organisms, 'movementCost'))
  set('metabolic.turningCost', numberAt(organisms, 'turningCost'))
  set('behavioral.wanderJitter', numberAt(organisms, 'wanderJitter'))
  set('reproduction.minEnergy', numberAt(reproduction, 'minEnergy'))
  set('reproduction.offspringInvestment', numberAt(reproduction, 'offspringInvestment'))
  set('reproduction.cooldown', numberAt(reproduction, 'cooldown'))
  set('reproduction.searchRadius', numberAt(reproduction, 'searchRadius'))
  set('learning.learningRate', numberAt(learning, 'learningRate'))
  set('learning.discountFactor', numberAt(learning, 'discountFactor'))
  set('learning.eligibilityTraceDecay', numberAt(learning, 'eligibilityTraceDecay'))
  set('learning.explorationRate', numberAt(learning, 'explorationRate'))
  set('learning.riskTolerance', numberAt(learning, 'riskTolerance'))
  set('learning.noveltyPreference', numberAt(learning, 'noveltyPreference'))
  set('learning.persistence', numberAt(learning, 'persistence'))
  return values
}

/** Validates the `genetics` section of a complete configuration (`root`). */
export function checkGenetics(root: PlainObject, errors: string[]): void {
  const genetics = checkSection(root, 'genetics', GENETICS_KEYS, errors)
  if (!genetics) return

  checkNumber(
    genetics,
    'mutationRateScale',
    'genetics.mutationRateScale',
    { nonnegative: true },
    errors
  )
  checkNumber(
    genetics,
    'mutationStrengthScale',
    'genetics.mutationStrengthScale',
    { nonnegative: true },
    errors
  )
  checkNumber(genetics, 'blendAlpha', 'genetics.blendAlpha', { nonnegative: true }, errors)

  const brain = checkSection(genetics, 'brain', BRAIN_KEYS, errors, 'genetics.brain')
  if (brain) {
    if (brain['innatePrior'] === undefined) errors.push('genetics.brain.innatePrior is required')
    else if (typeof brain['innatePrior'] !== 'boolean') {
      errors.push('genetics.brain.innatePrior must be a boolean')
    }
    for (const key of ['hiddenSize', 'memorySize']) {
      checkNumber(brain, key, `genetics.brain.${key}`, { integer: true, positive: true }, errors)
    }
    // The hand-wired forager template needs five hidden units (simulation/learning/InnatePrior).
    if (
      brain['innatePrior'] === true &&
      typeof brain['hiddenSize'] === 'number' &&
      brain['hiddenSize'] < 5
    ) {
      errors.push(
        'genetics.brain.hiddenSize must be at least 5 when genetics.brain.innatePrior is true'
      )
    }
    checkNumber(
      brain,
      'initialWeightStd',
      'genetics.brain.initialWeightStd',
      { positive: true },
      errors
    )
    checkUnit(brain, 'weightMutationRate', 'genetics.brain.weightMutationRate', errors)
    checkNumber(
      brain,
      'weightMutationStd',
      'genetics.brain.weightMutationStd',
      { nonnegative: true },
      errors
    )
  }

  const learning = checkSection(genetics, 'learning', LEARNING_KEYS, errors, 'genetics.learning')
  if (learning) {
    checkNumber(
      learning,
      'learningRate',
      'genetics.learning.learningRate',
      { positive: true },
      errors
    )
    for (const key of LEARNING_KEYS.filter((name) => name !== 'learningRate')) {
      checkUnit(learning, key, `genetics.learning.${key}`, errors)
    }
  }

  const inheritance = checkSection(
    genetics,
    'learningInheritance',
    INHERITANCE_KEYS,
    errors,
    'genetics.learningInheritance'
  )
  if (inheritance) {
    checkChoice(inheritance, 'mode', 'genetics.learningInheritance.mode', INHERITANCE_MODES, errors)
    checkUnit(inheritance, 'fraction', 'genetics.learningInheritance.fraction', errors)
  }

  if (genetics['genes'] === undefined) {
    errors.push('genetics.genes is required')
  } else {
    checkGeneOverrides(genetics['genes'], errors)
    checkEffectiveRanges({ root }, errors)
  }
}
