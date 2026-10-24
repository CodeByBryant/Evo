import type { Genome, GenomeId, GeneticsConfig } from '@evo/contracts'
import type { RandomSource } from '../random/RandomSource'
import { boundGene, shortestDelta, wrapToRange } from './geneMath'
import type { GeneSpec } from './GeneSpecs'
import {
  brainBlockLengths,
  genomeFromParts,
  genomeToVector,
  sameArchitecture
} from './GenomeFactory'
import { mutateVector, mutateWeights } from './Mutation'
import type { MutationScales } from './Mutation'

/** Builds a child genome from two parents (roadmap 4.4). */
export interface RecombinationStrategy {
  combine(mother: Genome, father: Genome, random: RandomSource): Genome
}

/**
 * Recombines two gene vectors into a new one. Per gene, in table order:
 *
 * - integer and boolean: uniform pick from either parent;
 * - float: blend crossover (BLX-alpha): uniform in `[lo - alpha*d, hi + alpha*d]` where `d` is the
 *   parents' difference, then bounded. Identical parents give an identical child;
 * - circular: the same blend along the shortest arc, wrapped.
 *
 * Each gene consumes exactly one uniform draw.
 */
export function crossoverVector(
  mother: readonly number[],
  father: readonly number[],
  specs: readonly GeneSpec[],
  random: RandomSource,
  alpha: number
): number[] {
  const out: number[] = []
  specs.forEach((spec, index) => {
    const a = mother[index] as number
    const b = father[index] as number
    const u = random.float()
    let candidate: number
    switch (spec.kind) {
      case 'int':
      case 'bool':
        candidate = u < 0.5 ? a : b
        break
      case 'circular': {
        const delta = shortestDelta(a, b, spec.max - spec.min)
        candidate = wrapToRange(a + delta * (u * (1 + 2 * alpha) - alpha), spec.min, spec.max)
        break
      }
      case 'float': {
        const lo = Math.min(a, b)
        const difference = Math.max(a, b) - lo
        const extension = alpha * difference
        candidate = lo - extension + u * (difference + 2 * extension)
        break
      }
    }
    out.push(spec.kind === 'bool' ? candidate : boundGene(spec, out, candidate))
  })
  return out
}

/**
 * Recombines brain weights block by block: each block is cut at one random interior point and
 * one parent supplies the prefix, the other the rest. A block therefore always holds weights from
 * both parents (a one-weight block can only come from one), so both brains contribute. Consumes
 * two draws per block.
 */
export function crossoverWeights(
  mother: readonly number[],
  father: readonly number[],
  blockLengths: readonly number[],
  random: RandomSource
): number[] {
  let total = 0
  for (const length of blockLengths) total += length
  if (mother.length !== total || father.length !== total) {
    throw new RangeError('brain weight vectors must match the architecture')
  }
  const out: number[] = []
  let offset = 0
  for (const length of blockLengths) {
    const cut = random.integer(1, Math.max(1, length - 1))
    const motherFirst = random.boolean()
    const first = motherFirst ? mother : father
    const second = motherFirst ? father : mother
    for (let i = 0; i < length; i++) {
      out.push((i < cut ? first : second)[offset + i] as number)
    }
    offset += length
  }
  return out
}

/**
 * The default strategy: crossover, then mutation of the recombined result. Uses only the random
 * source it is given (the `genetics` stream) and draws in a fixed order: gene crossover, weight
 * crossover, gene mutation, weight mutation.
 */
export class GenomeRecombiner implements RecombinationStrategy {
  constructor(
    private readonly specs: readonly GeneSpec[],
    private readonly genetics: GeneticsConfig,
    private readonly allocateId: () => GenomeId
  ) {}

  combine(mother: Genome, father: Genome, random: RandomSource): Genome {
    const architecture = mother.brain.architecture
    if (!sameArchitecture(architecture, father.brain.architecture)) {
      throw new RangeError('parents must share one brain architecture')
    }
    const scales: MutationScales = {
      rate: this.genetics.mutationRateScale,
      strength: this.genetics.mutationStrengthScale
    }
    const crossed = crossoverVector(
      genomeToVector(mother),
      genomeToVector(father),
      this.specs,
      random,
      this.genetics.blendAlpha
    )
    const crossedWeights = crossoverWeights(
      mother.brain.weights,
      father.brain.weights,
      brainBlockLengths(architecture),
      random
    )
    const vector = mutateVector(crossed, this.specs, random, scales)
    const weights = mutateWeights(
      crossedWeights,
      random,
      { rate: this.genetics.brain.weightMutationRate, std: this.genetics.brain.weightMutationStd },
      scales
    )
    const parentIds = mother.id <= father.id ? [mother.id, father.id] : [father.id, mother.id]
    return genomeFromParts({
      id: this.allocateId(),
      parentIds,
      vector,
      architecture,
      weights
    })
  }
}
