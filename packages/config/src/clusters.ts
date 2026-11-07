import { checkChoice, checkNumber, checkSection } from './checks'
import type { PlainObject } from './checks'

const CLUSTER_KEYS = [
  'count',
  'radius',
  'spacing',
  'speciesPerCluster',
  'organismsPerSpecies',
  'patches',
  'voidSpeedScale',
  'voidVisibility',
  'mateSignalCap',
  'speciesThreshold',
  'clusterSpread',
  'speciesSpread',
  'foodFloor',
  'strandedFoodPerTick'
]

/** The most clusters a layout can hold (a regular polygon; more would be a crowd, not a map). */
export const MAX_CLUSTERS = 12

/**
 * Validates `environment.layout` and `environment.clusters` (ADR 0014). `environment` is the
 * already-checked section; problems are appended to `errors`.
 */
export function checkClusters(environment: PlainObject, errors: string[]): void {
  checkChoice(environment, 'layout', 'environment.layout', ['field', 'clusters'], errors)
  const clusters = checkSection(
    environment,
    'clusters',
    CLUSTER_KEYS,
    errors,
    'environment.clusters'
  )
  if (!clusters) return
  const whole = (key: string, min: number, max: number): number | undefined => {
    const value = checkNumber(
      clusters,
      key,
      `environment.clusters.${key}`,
      { integer: true },
      errors
    )
    if (value !== undefined && (value < min || value > max)) {
      errors.push(`environment.clusters.${key} must be an integer from ${min} to ${max}`)
      return undefined
    }
    return value
  }
  const unit = (key: string, openLow: boolean): number | undefined => {
    const value = checkNumber(clusters, key, `environment.clusters.${key}`, {}, errors)
    if (value !== undefined && ((openLow ? value <= 0 : value < 0) || value > 1)) {
      errors.push(
        `environment.clusters.${key} must be ${openLow ? 'greater than zero' : 'at least zero'} and at most one`
      )
      return undefined
    }
    return value
  }
  whole('count', 1, MAX_CLUSTERS)
  const radius = checkNumber(
    clusters,
    'radius',
    'environment.clusters.radius',
    { positive: true },
    errors
  )
  const spacing = checkNumber(
    clusters,
    'spacing',
    'environment.clusters.spacing',
    { positive: true },
    errors
  )
  if (radius !== undefined && spacing !== undefined && spacing < 2 * radius) {
    errors.push('environment.clusters.spacing must be at least twice environment.clusters.radius')
  }
  whole('speciesPerCluster', 1, 6)
  whole('organismsPerSpecies', 1, 100)
  whole('patches', 1, 16)
  unit('voidSpeedScale', true)
  unit('voidVisibility', true)
  const cap = checkNumber(
    clusters,
    'mateSignalCap',
    'environment.clusters.mateSignalCap',
    { positive: true },
    errors
  )
  if (
    cap !== undefined &&
    radius !== undefined &&
    spacing !== undefined &&
    cap >= spacing - 2 * radius
  ) {
    errors.push(
      'environment.clusters.mateSignalCap must be less than the void width (spacing minus twice the radius)'
    )
  }
  unit('speciesThreshold', false)
  const clusterSpread = unit('clusterSpread', false)
  const speciesSpread = unit('speciesSpread', false)
  if (clusterSpread !== undefined && speciesSpread !== undefined && speciesSpread > clusterSpread) {
    errors.push(
      'environment.clusters.speciesSpread must not exceed environment.clusters.clusterSpread'
    )
  }
  unit('foodFloor', false)
  checkNumber(
    clusters,
    'strandedFoodPerTick',
    'environment.clusters.strandedFoodPerTick',
    { integer: true, nonnegative: true },
    errors
  )
}
