import { ACTION_SIZE, GENE_DEFINITIONS, OBSERVATION_SIZE } from '@evo/contracts'
import type { BrainArchitecture, BrainConfig, Genome, GenomeId } from '@evo/contracts'
import type { RandomSource } from '../random/RandomSource'
import { brainBlockLengths } from '../learning/BrainLayout'
import { innatePriorWeights } from '../learning/InnatePrior'
import type { GeneSpec } from './GeneSpecs'

export { brainBlockLengths }

export function brainWeightCount(architecture: BrainArchitecture): number {
  let total = 0
  for (const length of brainBlockLengths(architecture)) total += length
  return total
}

export function sameArchitecture(a: BrainArchitecture, b: BrainArchitecture): boolean {
  return (
    a.inputSize === b.inputSize &&
    a.hiddenSize === b.hiddenSize &&
    a.memorySize === b.memorySize &&
    a.outputSize === b.outputSize
  )
}

/**
 * The brain architecture for a world: hidden and memory widths from config, input and output
 * sizes from the `OBSERVATION_SIZE` and `ACTION_SIZE` constants. The single place the shape is
 * derived, so config and code can never disagree about it.
 */
export function architectureOf(
  brain: Pick<BrainConfig, 'hiddenSize' | 'memorySize'>
): BrainArchitecture {
  return {
    inputSize: OBSERVATION_SIZE,
    hiddenSize: brain.hiddenSize,
    memorySize: brain.memorySize,
    outputSize: ACTION_SIZE
  }
}

/** Founder noise around the innate prior, as a fraction of `initialWeightStd`. */
const INNATE_NOISE_SCALE = 0.1

type GroupedGenes = Record<string, Record<string, number>>

/** The scalar genes of a genome as a flat vector in `GENE_DEFINITIONS` order. */
export function genomeToVector(genome: Genome): number[] {
  const groups = genome as unknown as GroupedGenes
  return GENE_DEFINITIONS.map((definition) => {
    const [group, name] = definition.path.split('.') as [string, string]
    return (groups[group] as Record<string, number>)[name] as number
  })
}

export interface GenomeParts {
  id: GenomeId
  parentIds: readonly GenomeId[]
  /** One value per `GENE_DEFINITIONS` entry, in order. */
  vector: readonly number[]
  architecture: BrainArchitecture
  weights: readonly number[]
}

/** Assembles an immutable genome from a gene vector and brain weights. */
export function genomeFromParts(parts: GenomeParts): Genome {
  const groups: GroupedGenes = {
    physical: {},
    sensory: {},
    metabolic: {},
    behavioral: {},
    reproduction: {},
    learning: {}
  }
  GENE_DEFINITIONS.forEach((definition, index) => {
    const [group, name] = definition.path.split('.') as [string, string]
    ;(groups[group] as Record<string, number>)[name] = parts.vector[index] as number
  })
  const genome = {
    version: 1,
    id: parts.id,
    parentIds: [...parts.parentIds],
    ...groups,
    brain: { architecture: { ...parts.architecture }, weights: [...parts.weights] }
  } as unknown as Genome
  return freezeGenome(genome)
}

/** Deep-freezes a genome so accidental mutation throws instead of silently corrupting a lineage. */
function freezeGenome(genome: Genome): Genome {
  Object.freeze(genome.parentIds)
  Object.freeze(genome.physical)
  Object.freeze(genome.sensory)
  Object.freeze(genome.metabolic)
  Object.freeze(genome.behavioral)
  Object.freeze(genome.reproduction)
  Object.freeze(genome.learning)
  Object.freeze(genome.brain.architecture)
  Object.freeze(genome.brain.weights)
  Object.freeze(genome.brain)
  return Object.freeze(genome)
}

/**
 * A founder: every scalar gene at its baseline and brain weights drawn from the supplied stream
 * (Gaussian, one draw per weight in storage order, whether or not the innate prior is used so the
 * draw count never depends on the setting). With `innatePrior` the draw is a small noise added to
 * the hand-wired forager template; otherwise it is the weight itself. Founders are identical
 * except for their brains; variation in the other genes enters only at births.
 */
export function createFounderGenome(
  id: GenomeId,
  specs: readonly GeneSpec[],
  brain: BrainConfig,
  random: RandomSource
): Genome {
  const architecture = architectureOf(brain)
  const count = brainWeightCount(architecture)
  const weights: number[] = []
  if (brain.innatePrior) {
    const template = innatePriorWeights(architecture)
    const noiseStd = brain.initialWeightStd * INNATE_NOISE_SCALE
    for (let i = 0; i < count; i++)
      weights.push((template[i] as number) + random.normal(0, noiseStd))
  } else {
    for (let i = 0; i < count; i++) weights.push(random.normal(0, brain.initialWeightStd))
  }
  return genomeFromParts({
    id,
    parentIds: [],
    vector: specs.map((spec) => spec.baseline),
    architecture,
    weights
  })
}
