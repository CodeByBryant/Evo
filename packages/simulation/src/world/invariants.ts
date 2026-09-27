import type { MetricsSnapshot, ValidationResult, WorldConfig } from '@evo/contracts'
import type { OrganismState } from '../entities/OrganismStore'
import type { ResourceState } from '../entities/ResourceStore'

export interface InvariantContext {
  readonly organisms: readonly OrganismState[]
  readonly resources: readonly ResourceState[]
  readonly config: WorldConfig
  readonly tick: number
  readonly extinctionTick: number | null
  readonly metrics: MetricsSnapshot
}

function checkFinite(label: string, field: string, value: number, errors: string[]): void {
  if (!Number.isFinite(value)) errors.push(`${label}: ${field} is not finite (${value})`)
}

function checkOrganism(
  organism: OrganismState,
  width: number,
  height: number,
  errors: string[]
): void {
  const label = `organism ${organism.id}`
  checkFinite(label, 'x', organism.x, errors)
  checkFinite(label, 'y', organism.y, errors)
  checkFinite(label, 'vx', organism.vx, errors)
  checkFinite(label, 'vy', organism.vy, errors)
  checkFinite(label, 'heading', organism.heading, errors)
  checkFinite(label, 'age', organism.age, errors)
  checkFinite(label, 'energy', organism.energy, errors)
  if (organism.age < 0) errors.push(`${label}: age is negative`)
  if (organism.energy < 0) errors.push(`${label}: energy is negative`)
  if (organism.x < 0 || organism.x > width) errors.push(`${label}: x is outside [0, ${width}]`)
  if (organism.y < 0 || organism.y > height) errors.push(`${label}: y is outside [0, ${height}]`)
}

function checkResource(
  resource: ResourceState,
  width: number,
  height: number,
  errors: string[]
): void {
  const label = `resource ${resource.id}`
  checkFinite(label, 'x', resource.x, errors)
  checkFinite(label, 'y', resource.y, errors)
  checkFinite(label, 'remaining', resource.remaining, errors)
  if (resource.remaining < 0) errors.push(`${label}: remaining is negative`)
  if (resource.x < 0 || resource.x > width) errors.push(`${label}: x is outside [0, ${width}]`)
  if (resource.y < 0 || resource.y > height) errors.push(`${label}: y is outside [0, ${height}]`)
}

/**
 * Checks the invariants a correct world must always satisfy between ticks (never mid-step):
 * finite numbers, ascending unique ids, resources non-negative, bounds respected, and
 * extinction reported consistently. Reports every violation found; repairs nothing.
 */
export function checkInvariants(context: InvariantContext): ValidationResult {
  const errors: string[] = []
  const { organisms, resources, config, tick, extinctionTick, metrics } = context
  const width = config.environment.width
  const height = config.environment.height

  let previousOrganismId = -1
  for (const organism of organisms) {
    if (organism.id <= previousOrganismId) {
      errors.push(`organisms are not in strictly ascending id order at organism ${organism.id}`)
    }
    previousOrganismId = organism.id
    checkOrganism(organism, width, height, errors)
  }

  let previousResourceId = -1
  for (const resource of resources) {
    if (resource.id <= previousResourceId) {
      errors.push(`resources are not in strictly ascending id order at resource ${resource.id}`)
    }
    previousResourceId = resource.id
    checkResource(resource, width, height, errors)
  }

  if (extinctionTick !== null) {
    if (!Number.isInteger(extinctionTick) || extinctionTick < 0 || extinctionTick > tick) {
      errors.push(`extinctionTick (${extinctionTick}) is not a valid tick in [0, ${tick}]`)
    }
    if (organisms.length !== 0) {
      errors.push('extinctionTick is set but the population is not empty')
    }
  }

  checkFinite('metrics', 'organismsBorn', metrics.organismsBorn, errors)
  checkFinite('metrics', 'deathsByStarvation', metrics.deathsByStarvation, errors)
  checkFinite('metrics', 'deathsByAge', metrics.deathsByAge, errors)
  checkFinite('metrics', 'resourcesSpawned', metrics.resourcesSpawned, errors)
  checkFinite('metrics', 'resourcesConsumed', metrics.resourcesConsumed, errors)
  checkFinite('metrics', 'energyConsumed', metrics.energyConsumed, errors)
  checkFinite('metrics', 'energyWasted', metrics.energyWasted, errors)
  if (metrics.organismsBorn < 0) errors.push('metrics.organismsBorn is negative')
  if (metrics.deathsByStarvation < 0) errors.push('metrics.deathsByStarvation is negative')
  if (metrics.deathsByAge < 0) errors.push('metrics.deathsByAge is negative')
  if (metrics.resourcesSpawned < 0) errors.push('metrics.resourcesSpawned is negative')
  if (metrics.resourcesConsumed < 0) errors.push('metrics.resourcesConsumed is negative')
  if (metrics.energyConsumed < 0) errors.push('metrics.energyConsumed is negative')
  if (metrics.energyWasted < 0) errors.push('metrics.energyWasted is negative')

  return { ok: errors.length === 0, errors }
}
