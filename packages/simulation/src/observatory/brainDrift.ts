import { BRAIN_INPUT_GROUPS } from '@evo/contracts'
import type { BrainInputGroup } from '@evo/contracts'
import type { BrainLayout } from '../learning/BrainLayout'
import { meanPairwise } from './stats'

/**
 * Where a brain's input weights come from (ADR 0024): the observation slots in groups a person can
 * name. Indices follow `OBSERVATION_LABELS` (docs/learning/brain.md); a test pins the table to the
 * labels so a new input cannot be added without saying which group it belongs to.
 */
export const INPUT_GROUPS = BRAIN_INPUT_GROUPS
export type InputGroup = BrainInputGroup

/** The group an observation slot belongs to. */
export function inputGroupOf(index: number): InputGroup {
  if (index < 8) return 'self' // energy, age, velocity, position, heading
  if (index < 12) return 'food'
  if (index < 16) return 'peer'
  if (index < 24) return 'self' // time since food, last reward, last action, own health
  if (index < 28) return 'hazard'
  if (index === 28) return 'food' // the perceived food's kind
  if (index < 33) return 'season' // season, region temperature and movement
  if (index < 37) return 'mate'
  if (index < 40) return 'home'
  if (index < 44) return 'prey'
  if (index < 48) return 'threat'
  if (index < 52) return 'recall'
  throw new RangeError(`observation slot ${index} belongs to no input group`)
}

/**
 * How far a heritable brain is from the innate prior it started near: `||w - p|| / ||p||` over the
 * whole weight vector. 0 is the prior itself; founders sit above 0 by the noise they are drawn
 * with, which the recorder reports as the tick-0 floor.
 */
export function priorDistance(weights: readonly number[], prior: readonly number[]): number {
  let diff = 0
  let norm = 0
  const n = Math.min(weights.length, prior.length)
  for (let i = 0; i < n; i++) {
    const d = (weights[i] as number) - (prior[i] as number)
    diff += d * d
    norm += (prior[i] as number) * (prior[i] as number)
  }
  return norm === 0 ? 0 : Math.sqrt(diff / norm)
}

/**
 * Mean absolute input-to-hidden weight per input group: how strongly the brain is wired to each kind
 * of sense. The prey and threat groups starting near the prior's value and then moving is the "did
 * evolution take up the new senses" signal.
 */
export function groupUsage(
  weights: readonly number[],
  layout: BrainLayout
): Record<InputGroup, number> {
  const { inputSize, hiddenSize } = layout.architecture
  const sums = new Map<InputGroup, number>()
  const counts = new Map<InputGroup, number>()
  for (let h = 0; h < hiddenSize; h++) {
    for (let i = 0; i < inputSize; i++) {
      const group = inputGroupOf(i)
      const w = weights[layout.inputToHidden.offset + h * inputSize + i] as number
      sums.set(group, (sums.get(group) ?? 0) + Math.abs(w))
      counts.set(group, (counts.get(group) ?? 0) + 1)
    }
  }
  const out = {} as Record<InputGroup, number>
  for (const group of INPUT_GROUPS) {
    const count = counts.get(group) ?? 0
    out[group] = count === 0 ? 0 : (sums.get(group) as number) / count
  }
  return out
}

/**
 * How much a life has learned: the distance of the learnable tail now (`learned`) from the tail the
 * creature was born with, relative to the born tail's size. 0 for a creature that has learned
 * nothing (or has no brain).
 */
export function learnedGap(born: readonly number[], learned: readonly number[]): number {
  let diff = 0
  let norm = 0
  const n = Math.min(born.length, learned.length)
  for (let i = 0; i < n; i++) {
    const d = (learned[i] as number) - (born[i] as number)
    diff += d * d
    norm += (born[i] as number) * (born[i] as number)
  }
  return norm === 0 ? 0 : Math.sqrt(diff / norm)
}

/**
 * The same brain distance `genomeDistance` uses (RMS weight difference over `2 x initialWeightStd`,
 * clamped to 1), averaged over pairs of a (strided) population.
 */
export function brainDiversity(
  population: readonly (readonly number[])[],
  initialWeightStd: number,
  cap = 200
): number {
  return meanPairwise(
    population,
    (a, b) => {
      const n = Math.min(a.length, b.length)
      if (n === 0) return 0
      let squared = 0
      for (let i = 0; i < n; i++) {
        const d = (a[i] as number) - (b[i] as number)
        squared += d * d
      }
      return Math.min(1, Math.sqrt(squared / n) / (2 * initialWeightStd))
    },
    cap
  )
}
