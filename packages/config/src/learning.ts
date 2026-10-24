import type { LearningAlgorithmName, LearningController } from '@evo/contracts'
import { checkChoice, checkNumber, checkSection, isObject } from './checks'
import type { PlainObject } from './checks'

export const LEARNING_CONTROLLERS: LearningController[] = ['reflex', 'brain']
export const LEARNING_ALGORITHMS: LearningAlgorithmName[] = ['hebbian', 'actorCritic']

const LEARNING_KEYS = [
  'controller',
  'enabled',
  'algorithm',
  'rewardWeights',
  'weightLimit',
  'baselineRate',
  'valueRateScale',
  'foodHorizon'
]
const REWARD_WEIGHT_KEYS = ['feeding', 'reproduction', 'energyCost']
const REGION_KEYS = ['x', 'y', 'width', 'height']

/** Validates the top-level `learning` section of a complete configuration. */
export function checkLearning(root: PlainObject, errors: string[]): void {
  const learning = checkSection(root, 'learning', LEARNING_KEYS, errors)
  if (!learning) return

  checkChoice(learning, 'controller', 'learning.controller', LEARNING_CONTROLLERS, errors)
  checkChoice(learning, 'algorithm', 'learning.algorithm', LEARNING_ALGORITHMS, errors)
  if (learning['enabled'] === undefined) errors.push('learning.enabled is required')
  else if (typeof learning['enabled'] !== 'boolean')
    errors.push('learning.enabled must be a boolean')

  const weights = checkSection(
    learning,
    'rewardWeights',
    REWARD_WEIGHT_KEYS,
    errors,
    'learning.rewardWeights'
  )
  if (weights) {
    for (const key of REWARD_WEIGHT_KEYS) {
      checkNumber(weights, key, `learning.rewardWeights.${key}`, { nonnegative: true }, errors)
    }
  }
  checkNumber(learning, 'weightLimit', 'learning.weightLimit', { positive: true }, errors)
  const baselineRate = checkNumber(
    learning,
    'baselineRate',
    'learning.baselineRate',
    { positive: true },
    errors
  )
  if (baselineRate !== undefined && baselineRate > 1) {
    errors.push('learning.baselineRate must be at most one')
  }
  checkNumber(learning, 'valueRateScale', 'learning.valueRateScale', { positive: true }, errors)
  checkNumber(learning, 'foodHorizon', 'learning.foodHorizon', { positive: true }, errors)
}

/**
 * Validates `resources.region`: `null` (the whole world) or a rectangle that lies inside the
 * world. `worldWidth` and `worldHeight` are the world dimensions when known.
 */
export function checkRegion(
  resources: PlainObject,
  worldWidth: number | undefined,
  worldHeight: number | undefined,
  errors: string[]
): void {
  const region = resources['region']
  if (region === undefined) {
    errors.push('resources.region is required')
    return
  }
  if (region === null) return
  if (!isObject(region)) {
    errors.push('resources.region must be null or an object')
    return
  }
  for (const key of Object.keys(region)) {
    if (!REGION_KEYS.includes(key)) errors.push(`unknown property "resources.region.${key}"`)
  }
  const x = checkNumber(region, 'x', 'resources.region.x', { nonnegative: true }, errors)
  const y = checkNumber(region, 'y', 'resources.region.y', { nonnegative: true }, errors)
  const width = checkNumber(region, 'width', 'resources.region.width', { positive: true }, errors)
  const height = checkNumber(
    region,
    'height',
    'resources.region.height',
    { positive: true },
    errors
  )
  if (
    x !== undefined &&
    width !== undefined &&
    worldWidth !== undefined &&
    x + width > worldWidth
  ) {
    errors.push('resources.region must lie inside the world (x + width exceeds environment.width)')
  }
  if (
    y !== undefined &&
    height !== undefined &&
    worldHeight !== undefined &&
    y + height > worldHeight
  ) {
    errors.push(
      'resources.region must lie inside the world (y + height exceeds environment.height)'
    )
  }
}
