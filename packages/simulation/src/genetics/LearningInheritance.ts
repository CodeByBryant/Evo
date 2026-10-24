import type { LearningInheritanceMode } from '@evo/contracts'

/**
 * The brain weights a child should start from, given its parent's genome weights and the weights
 * that parent had learned by the time of reproduction (roadmap 4.7):
 *
 * - `baldwinian`: learning shapes the parent's life but is never inherited - the genome weights;
 * - `lamarckian`: everything the parent learned is inherited - the learned weights;
 * - `partial`: `genome + fraction * (learned - genome)`, so `fraction` of the learned change.
 *
 * Pure. Phase 4 defines and tests it; the learning system that produces `learnedWeights`
 * arrives in Phase 5, until which `ReproductionSystem` passes genome weights only.
 */
export function inheritedBrainWeights(
  genomeWeights: readonly number[],
  learnedWeights: readonly number[],
  mode: LearningInheritanceMode,
  fraction: number
): number[] {
  if (genomeWeights.length !== learnedWeights.length) {
    throw new RangeError('genome and learned weights must have the same length')
  }
  switch (mode) {
    case 'baldwinian':
      return genomeWeights.slice()
    case 'lamarckian':
      return learnedWeights.slice()
    case 'partial': {
      if (!(fraction >= 0 && fraction <= 1)) {
        throw new RangeError('fraction must be between zero and one')
      }
      return genomeWeights.map(
        (genome, index) => genome + fraction * ((learnedWeights[index] as number) - genome)
      )
    }
  }
}
