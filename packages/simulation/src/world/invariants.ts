import type { MetricsSnapshot, ValidationResult, WorldConfig } from '@evo/contracts'
import type { HazardState } from '../ecology/HazardStore'
import type { EggState } from '../entities/EggStore'
import type { OrganismState } from '../entities/OrganismStore'
import { FREE_SLOT, HUB_SLOT } from '../entities/ResourceStore'
import type { ResourceState } from '../entities/ResourceStore'
import type { GeneSpec } from '../genetics/GeneSpecs'
import { architectureOf } from '../genetics/GenomeFactory'
import { brainLayoutOf } from '../learning/BrainLayout'
import { brainStateProblems } from '../learning/BrainState'
import { validateGenome } from '../genetics/GenomeValidation'
import { gutCapacityOf, maxHealthOf } from '../organisms/traits'
import type { LineageQueries } from '../lineage/LineageStore'

export interface InvariantContext {
  readonly organisms: readonly OrganismState[]
  readonly resources: readonly ResourceState[]
  /** The eggs (ADR 0027), ascending id; empty with eggs off. */
  readonly eggs: readonly EggState[]
  readonly config: WorldConfig
  readonly tick: number
  readonly extinctionTick: number | null
  readonly metrics: MetricsSnapshot
  /** The next id `IdGenerator` will allocate; used to validate `parentIds` reference real ids. */
  readonly nextEntityId: number
  /** The next genome id that will be allocated; every living genome id is below it. */
  readonly nextGenomeId: number
  /** The world's gene table, which every living genome must satisfy. */
  readonly geneSpecs: readonly GeneSpec[]
  /** The body gene table (ADR 0012), which every living genome's body must satisfy. */
  readonly bodySpecs: readonly GeneSpec[]
  /** Every living genome, and every parent it names, must have a lineage record. */
  readonly lineage: LineageQueries
  /** Every living organism must have an active species and the counts must agree. */
  readonly species: { problems(livingOrganismIds: readonly number[]): string[] }
  /** Every active hazard must be finite and positive-sized. */
  readonly hazards: readonly HazardState[]
}

function checkFinite(label: string, field: string, value: number, errors: string[]): void {
  if (!Number.isFinite(value)) errors.push(`${label}: ${field} is not finite (${value})`)
}

function checkOrganism(
  organism: OrganismState,
  width: number,
  height: number,
  tick: number,
  nextEntityId: number,
  maxHealth: number,
  maxGut: number,
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
  checkFinite(label, 'health', organism.health, errors)
  checkFinite(
    label,
    'reproductionCooldownRemaining',
    organism.reproductionCooldownRemaining,
    errors
  )
  checkFinite(label, 'gut', organism.gut, errors)
  checkFinite(label, 'biteCooldown', organism.biteCooldown, errors)
  if (organism.gut < 0) errors.push(`${label}: gut is negative`)
  if (organism.gut > maxGut * (1 + 1e-9)) {
    errors.push(`${label}: gut (${organism.gut}) exceeds its capacity (${maxGut})`)
  }
  if (organism.biteCooldown < 0) errors.push(`${label}: biteCooldown is negative`)
  if (organism.age < 0) errors.push(`${label}: age is negative`)
  if (organism.energy < 0) errors.push(`${label}: energy is negative`)
  if (organism.health <= 0) errors.push(`${label}: health is not positive`)
  if (organism.health > maxHealth * (1 + 1e-9)) {
    errors.push(`${label}: health (${organism.health}) exceeds its maximum (${maxHealth})`)
  }
  if (organism.reproductionCooldownRemaining < 0) {
    errors.push(`${label}: reproductionCooldownRemaining is negative`)
  }
  if (organism.x > width || (width !== Infinity && organism.x < 0))
    errors.push(`${label}: x is outside [0, ${width}]`)
  if (organism.y > height || (height !== Infinity && organism.y < 0))
    errors.push(`${label}: y is outside [0, ${height}]`)
  if (!Number.isFinite(organism.x) || !Number.isFinite(organism.y)) {
    errors.push(`${label}: position is not finite`)
  }
  if (
    !Number.isInteger(organism.birthTick) ||
    organism.birthTick < 0 ||
    organism.birthTick > tick
  ) {
    errors.push(`${label}: birthTick (${organism.birthTick}) is not a valid tick in [0, ${tick}]`)
  }
  for (const parentId of organism.parentIds) {
    if (!Number.isInteger(parentId) || parentId < 0 || parentId >= nextEntityId) {
      errors.push(`${label}: parentIds contains an invalid id (${parentId})`)
    }
  }
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
  if (resource.x > width || (width !== Infinity && resource.x < 0))
    errors.push(`${label}: x is outside [0, ${width}]`)
  if (resource.y > height || (height !== Infinity && resource.y < 0))
    errors.push(`${label}: y is outside [0, ${height}]`)
}

/**
 * The plants (ADR 0021): a hub has no parent, every node's parent is a hub that exists and was
 * added before it, a hub has at most one node per slot, free food has neither parent nor a node
 * slot, and the sprout progress of a hub is finite and not negative.
 */
function checkPlants(resources: readonly ResourceState[], nodes: number, errors: string[]): void {
  const byId = new Map<number, ResourceState>()
  for (const resource of resources) byId.set(resource.id, resource)
  const taken = new Set<string>()
  for (const resource of resources) {
    const label = `resource ${resource.id}`
    const slot = resource.slot ?? FREE_SLOT
    const parent = resource.parent ?? 0
    if (slot === FREE_SLOT) {
      if (parent !== 0) errors.push(`${label}: free food has a parent (${parent})`)
    } else if (slot === HUB_SLOT) {
      if (parent !== 0) errors.push(`${label}: a hub has a parent (${parent})`)
      const progress = resource.sproutProgress ?? 0
      if (!Number.isFinite(progress) || progress < 0) {
        errors.push(`${label}: sproutProgress is not a finite non-negative number`)
      }
    } else if (slot >= 1 && slot <= nodes) {
      const hub = byId.get(parent)
      if (hub === undefined || hub.slot !== HUB_SLOT) {
        errors.push(`${label}: node of slot ${slot} has no hub (parent ${parent})`)
      } else if (parent >= resource.id) {
        errors.push(`${label}: node is older than its hub ${parent}`)
      }
      const key = `${parent}:${slot}`
      if (taken.has(key)) errors.push(`${label}: hub ${parent} has two nodes in slot ${slot}`)
      taken.add(key)
    } else {
      errors.push(`${label}: slot ${slot} is not a hub, a node of this plant, or free food`)
    }
  }
}

/**
 * Checks the invariants a correct world must always satisfy between ticks (never mid-step):
 * finite numbers, ascending unique ids, resources non-negative, bounds respected, and
 * extinction reported consistently. Reports every violation found; repairs nothing.
 */
export function checkInvariants(context: InvariantContext): ValidationResult {
  const errors: string[] = []
  const {
    organisms,
    resources,
    eggs,
    config,
    tick,
    extinctionTick,
    metrics,
    nextEntityId,
    nextGenomeId,
    geneSpecs,
    bodySpecs,
    lineage
  } = context
  const seenGenomeIds = new Set<number>()
  const brainLayout = brainLayoutOf(architectureOf(config.genetics.brain))
  const expectBrains = config.learning.controller === 'brain'
  // The cluster layout has no walls (docs/decisions/0014): positions only have to be finite.
  const unbounded = config.environment.layout === 'clusters'
  const width = unbounded ? Infinity : config.environment.width
  const height = unbounded ? Infinity : config.environment.height

  if (organisms.length > config.maxPopulation) {
    errors.push(`population (${organisms.length}) exceeds maxPopulation (${config.maxPopulation})`)
  }

  // The life cycle (ADR 0027): eggs and carried clutches are creatures-to-be and count against the cap.
  const carrying = organisms.filter((organism) => organism.pregnancy !== null).length
  if (organisms.length + eggs.length + carrying > config.maxPopulation) {
    errors.push(
      `population (${organisms.length}) with ${eggs.length} eggs and ${carrying} clutches exceeds maxPopulation (${config.maxPopulation})`
    )
  }
  if (!config.reproduction.eggs.enabled && (eggs.length > 0 || carrying > 0)) {
    errors.push('eggs or clutches exist with reproduction.eggs switched off')
  }
  let previousEggId = -1
  for (const egg of eggs) {
    if (egg.id <= previousEggId)
      errors.push(`eggs are not in strictly ascending id order at egg ${egg.id}`)
    previousEggId = egg.id
    if (egg.id >= nextEntityId) errors.push(`egg ${egg.id} has an id beyond nextEntityId`)
    for (const [field, value] of [
      ['x', egg.x],
      ['y', egg.y],
      ['energy', egg.energy]
    ] as const) {
      if (!Number.isFinite(value)) errors.push(`egg ${egg.id}: ${field} is not finite (${value})`)
    }
    if (egg.energy < 0) errors.push(`egg ${egg.id}: energy is negative (${egg.energy})`)
    if (egg.hatchTick <= egg.layTick || egg.layTick > tick) {
      errors.push(
        `egg ${egg.id}: lay tick ${egg.layTick} and hatch tick ${egg.hatchTick} are inconsistent at tick ${tick}`
      )
    }
    if (egg.motherId >= nextEntityId || egg.fatherId >= nextEntityId) {
      errors.push(`egg ${egg.id} names a parent beyond nextEntityId`)
    }
  }
  for (const organism of organisms) {
    if (organism.sex !== 0 && organism.sex !== 1) {
      errors.push(`organism ${organism.id}: sex is ${organism.sex}`)
    }
    if (organism.pregnancy !== null) {
      if (organism.sex !== 0) errors.push(`organism ${organism.id}: a male is carrying a clutch`)
      if (organism.pregnancy.layTick <= tick - 1 && organism.pregnancy.layTick < tick) {
        errors.push(
          `organism ${organism.id}: clutch was due at ${organism.pregnancy.layTick} and is still carried at ${tick}`
        )
      }
    }
  }

  let previousOrganismId = -1
  for (const organism of organisms) {
    if (organism.id <= previousOrganismId) {
      errors.push(`organisms are not in strictly ascending id order at organism ${organism.id}`)
    }
    previousOrganismId = organism.id
    checkOrganism(
      organism,
      width,
      height,
      tick,
      nextEntityId,
      maxHealthOf(organism.genome, config),
      gutCapacityOf(organism.genome, config),
      errors
    )

    const genomeResult = validateGenome(organism.genome, geneSpecs, {
      brain: architectureOf(config.genetics.brain),
      nextGenomeId,
      body: bodySpecs
    })
    for (const message of genomeResult.errors) {
      errors.push(`organism ${organism.id}: genome: ${message}`)
    }
    if (seenGenomeIds.has(organism.genome.id)) {
      errors.push(
        `organism ${organism.id}: genome id ${organism.genome.id} is shared with another organism`
      )
    }
    seenGenomeIds.add(organism.genome.id)

    if (!expectBrains && organism.brain !== null) {
      errors.push(`organism ${organism.id}: has a brain state but the controller is 'reflex'`)
    } else if (expectBrains && organism.brain === null) {
      errors.push(`organism ${organism.id}: has no brain state but the controller is 'brain'`)
    } else if (organism.brain !== null) {
      for (const problem of brainStateProblems(organism.brain, brainLayout)) {
        errors.push(`organism ${organism.id}: brain: ${problem}`)
      }
    }

    const record = lineage.record(organism.genome.id)
    if (!record) {
      errors.push(`organism ${organism.id}: genome ${organism.genome.id} has no lineage record`)
    } else if (record.parentGenomeIds.join(',') !== organism.genome.parentIds.join(',')) {
      errors.push(`organism ${organism.id}: lineage parents differ from the genome's parents`)
    }
    for (const parentId of organism.genome.parentIds) {
      if (!lineage.record(parentId)) {
        errors.push(`organism ${organism.id}: parent genome ${parentId} has no lineage record`)
      }
    }
  }

  let previousResourceId = -1
  for (const resource of resources) {
    if (resource.id <= previousResourceId) {
      errors.push(`resources are not in strictly ascending id order at resource ${resource.id}`)
    }
    previousResourceId = resource.id
    checkResource(resource, width, height, errors)
  }
  checkPlants(resources, config.resources.plants.nodes, errors)

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
  checkFinite('metrics', 'damageTaken', metrics.damageTaken, errors)
  if (metrics.damageTaken < 0) errors.push('metrics.damageTaken is negative')
  if (metrics.deathsByDamage < 0) errors.push('metrics.deathsByDamage is negative')
  if (metrics.deathsByPredation < 0) errors.push('metrics.deathsByPredation is negative')
  if (metrics.predationBites < 0) errors.push('metrics.predationBites is negative')
  if (metrics.organismsBorn < 0) errors.push('metrics.organismsBorn is negative')
  if (metrics.deathsByStarvation < 0) errors.push('metrics.deathsByStarvation is negative')
  if (metrics.deathsByAge < 0) errors.push('metrics.deathsByAge is negative')
  if (metrics.resourcesSpawned < 0) errors.push('metrics.resourcesSpawned is negative')
  if (metrics.resourcesConsumed < 0) errors.push('metrics.resourcesConsumed is negative')
  if (metrics.energyConsumed < 0) errors.push('metrics.energyConsumed is negative')
  if (metrics.energyWasted < 0) errors.push('metrics.energyWasted is negative')

  errors.push(...context.species.problems(organisms.map((organism) => organism.id)))

  for (const hazard of context.hazards) {
    const label = `hazard ${hazard.id}`
    checkFinite(label, 'x', hazard.x, errors)
    checkFinite(label, 'y', hazard.y, errors)
    checkFinite(label, 'radius', hazard.radius, errors)
    checkFinite(label, 'damagePerSecond', hazard.damagePerSecond, errors)
    if (hazard.radius <= 0) errors.push(`${label}: radius is not positive`)
    if (hazard.damagePerSecond < 0) errors.push(`${label}: damagePerSecond is negative`)
    if (hazard.expiresAtTick !== null && hazard.expiresAtTick <= tick) {
      errors.push(`${label}: expired at tick ${hazard.expiresAtTick} but still active`)
    }
  }

  return { ok: errors.length === 0, errors }
}
