import type { Genome } from '@evo/contracts'
import { shortestDelta } from './geneMath'
import type { GeneSpec } from './GeneSpecs'
import { genomeToVector, sameArchitecture } from './GenomeFactory'

/** Each field is in `[0, 1]`: `0` for identical, `1` for maximally different. */
export interface GenomeDistance {
  /** The unweighted mean of the seven group distances. */
  total: number
  physical: number
  sensory: number
  metabolic: number
  behavioral: number
  reproduction: number
  brain: number
  learning: number
}

type ScalarGroup = 'physical' | 'sensory' | 'metabolic' | 'behavioral' | 'reproduction' | 'learning'

/** Distance between two gene values: range-normalized, shortest-arc for circular genes. */
function geneDistance(spec: GeneSpec, a: number, b: number): number {
  const span = spec.max - spec.min
  if (spec.kind === 'circular') {
    return Math.abs(shortestDelta(a, b, span)) / (span / 2)
  }
  return Math.min(1, Math.abs(a - b) / span)
}

/**
 * Compares two genomes (roadmap: "parent and child genomes can be compared"). Scalar genes are
 * normalized by range width (circular genes by the shortest arc), a group's distance is the mean
 * over its genes, and the brain is the RMS weight difference divided by `2 * initialWeightStd`
 * (clamped to 1). Symmetric, and `0` exactly when the genomes carry the same values.
 */
export function genomeDistance(
  a: Genome,
  b: Genome,
  specs: readonly GeneSpec[],
  initialWeightStd: number
): GenomeDistance {
  if (!sameArchitecture(a.brain.architecture, b.brain.architecture)) {
    throw new RangeError('genomes must share one brain architecture to be compared')
  }
  const left = genomeToVector(a)
  const right = genomeToVector(b)

  const sums: Record<ScalarGroup, { total: number; count: number }> = {
    physical: { total: 0, count: 0 },
    sensory: { total: 0, count: 0 },
    metabolic: { total: 0, count: 0 },
    behavioral: { total: 0, count: 0 },
    reproduction: { total: 0, count: 0 },
    learning: { total: 0, count: 0 }
  }
  specs.forEach((spec, index) => {
    const group = spec.path.split('.')[0] as ScalarGroup
    const bucket = sums[group]
    bucket.total += geneDistance(spec, left[index] as number, right[index] as number)
    bucket.count += 1
  })
  const groupDistance = (group: ScalarGroup): number =>
    sums[group].count === 0 ? 0 : sums[group].total / sums[group].count

  let squared = 0
  const weightsA = a.brain.weights
  const weightsB = b.brain.weights
  for (let i = 0; i < weightsA.length; i++) {
    const difference = (weightsA[i] as number) - (weightsB[i] as number)
    squared += difference * difference
  }
  const rms = weightsA.length === 0 ? 0 : Math.sqrt(squared / weightsA.length)
  const brain = Math.min(1, rms / (2 * initialWeightStd))

  const physical = groupDistance('physical')
  const sensory = groupDistance('sensory')
  const metabolic = groupDistance('metabolic')
  const behavioral = groupDistance('behavioral')
  const reproduction = groupDistance('reproduction')
  const learning = groupDistance('learning')
  const total = (physical + sensory + metabolic + behavioral + reproduction + brain + learning) / 7
  return { total, physical, sensory, metabolic, behavioral, reproduction, brain, learning }
}
