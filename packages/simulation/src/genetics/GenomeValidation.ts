import type { BrainArchitecture, Genome, GenomeId, ValidationResult } from '@evo/contracts'
import { boundGene } from './geneMath'
import type { GeneSpec } from './GeneSpecs'
import {
  brainWeightCount,
  genomeFromParts,
  genomeToVector,
  sameArchitecture
} from './GenomeFactory'

/**
 * Checks a gene vector against a spec table: every value finite and inside its range, integers
 * integral, booleans 0 or 1, and ordered genes strictly above the gene they follow. Reports every
 * violation; never repairs.
 */
export function validateGeneValues(
  values: readonly number[],
  specs: readonly GeneSpec[]
): string[] {
  const errors: string[] = []
  if (values.length !== specs.length) {
    errors.push(`expected ${specs.length} genes but found ${values.length}`)
    return errors
  }
  specs.forEach((spec, index) => {
    const value = values[index] as number
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors.push(`${spec.path} is not a finite number`)
      return
    }
    if (spec.kind === 'bool') {
      if (value !== 0 && value !== 1) errors.push(`${spec.path} must be 0 or 1`)
      return
    }
    if (spec.kind === 'int' && !Number.isInteger(value)) {
      errors.push(`${spec.path} must be an integer`)
    }
    const insideRange =
      spec.kind === 'circular'
        ? value >= spec.min && value < spec.max
        : value >= spec.min && value <= spec.max
    if (!insideRange) {
      errors.push(`${spec.path} (${value}) is outside its range [${spec.min}, ${spec.max}]`)
    }
    if (spec.orderedAfter >= 0) {
      const earlier = specs[spec.orderedAfter] as GeneSpec
      if (!(value > (values[spec.orderedAfter] as number))) {
        errors.push(`${spec.path} must be greater than ${earlier.path}`)
      }
    }
  })
  return errors
}

export interface GenomeValidationContext {
  /** The architecture every brain in the world must have. */
  brain: BrainArchitecture
  /** When given, genome ids must be below it (the next id the world will allocate). */
  nextGenomeId?: GenomeId
}

/**
 * Validates a genome (roadmap 4.5): its genes against `specs`, its identity, and its brain.
 * Reports every violation found and never modifies anything.
 */
export function validateGenome(
  genome: Genome,
  specs: readonly GeneSpec[],
  context: GenomeValidationContext
): ValidationResult {
  const errors: string[] = []

  if (genome.version !== 1) errors.push(`unsupported genome version ${String(genome.version)}`)
  if (!Number.isInteger(genome.id) || genome.id < 0) {
    errors.push(`genome id (${genome.id}) must be a nonnegative integer`)
  } else if (context.nextGenomeId !== undefined && genome.id >= context.nextGenomeId) {
    errors.push(`genome id (${genome.id}) has not been allocated yet`)
  }
  let previousParent = -1
  for (const parentId of genome.parentIds) {
    if (!Number.isInteger(parentId) || parentId < 0 || parentId >= genome.id) {
      errors.push(`parent id (${parentId}) must be a nonnegative integer below the genome id`)
    }
    if (parentId <= previousParent) errors.push('parent ids must be strictly ascending')
    previousParent = parentId
  }

  errors.push(...validateGeneValues(genomeToVector(genome), specs))

  const { learning, reproduction } = genome
  if (!(learning.learningRate >= 0)) errors.push('learningRate must be nonnegative')
  if (!(learning.discountFactor >= 0 && learning.discountFactor <= 1)) {
    errors.push('discountFactor must be between zero and one')
  }
  if (!(reproduction.offspringInvestment > 0)) errors.push('offspringInvestment must be positive')

  const { architecture, weights } = genome.brain
  const dimensionsValid = [
    architecture.inputSize,
    architecture.hiddenSize,
    architecture.memorySize,
    architecture.outputSize
  ].every((size) => Number.isInteger(size) && size > 0)
  if (!dimensionsValid) {
    errors.push('brain dimensions must be positive integers')
  } else if (!sameArchitecture(architecture, context.brain)) {
    errors.push('brain architecture does not match the world configuration')
  } else if (weights.length !== brainWeightCount(architecture)) {
    errors.push(
      `brain has ${weights.length} weights but its architecture needs ${brainWeightCount(architecture)}`
    )
  }
  if (weights.some((weight) => typeof weight !== 'number' || !Number.isFinite(weight))) {
    errors.push('brain weights must all be finite numbers')
  }

  return { ok: errors.length === 0, errors }
}

/**
 * Forces a gene vector into its legal set: non-finite values reset to the baseline, values
 * clamped (ordered genes kept in order), integers rounded, booleans snapped to 0 or 1 and
 * circular genes wrapped.
 */
export function repairGeneValues(values: readonly number[], specs: readonly GeneSpec[]): number[] {
  const repaired: number[] = []
  specs.forEach((spec, index) => {
    let value = values[index] as number
    if (typeof value !== 'number' || !Number.isFinite(value)) value = spec.baseline
    if (spec.kind === 'bool') {
      repaired.push(value >= 0.5 ? 1 : 0)
      return
    }
    if (spec.kind === 'int') value = Math.round(value)
    repaired.push(boundGene(spec, repaired, value))
  })
  return repaired
}

/**
 * Returns a copy of the genome with every gene forced into its legal set (see
 * `repairGeneValues`) and non-finite weights zeroed. A tooling helper only - the engine never
 * repairs a genome, it rejects an invalid one (roadmap 4.5).
 */
export function repairGenome(genome: Genome, specs: readonly GeneSpec[]): Genome {
  return genomeFromParts({
    id: genome.id,
    parentIds: genome.parentIds,
    vector: repairGeneValues(genomeToVector(genome), specs),
    architecture: genome.brain.architecture,
    weights: genome.brain.weights.map((weight) => (Number.isFinite(weight) ? weight : 0))
  })
}
