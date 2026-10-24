import type { RandomSource } from '../random/RandomSource'
import { boundGene } from './geneMath'
import type { GeneSpec } from './GeneSpecs'

export interface MutationScales {
  /** Multiplies every mutation rate. `0` disables mutation. */
  rate: number
  /** Multiplies every mutation standard deviation. `0` disables mutation. */
  strength: number
}

interface GroupDraw {
  fire: boolean
  z: number
}

/**
 * Mutates a gene vector, returning a new one (the input is never modified). Each gene mutates
 * with its own operator and its own bounds (docs/genetics/genome.md):
 *
 * - float: Gaussian step of `std * range` (or `std * |value|` for a relative gene), clamped;
 * - integer: step of one in a random direction, clamped;
 * - boolean: flipped;
 * - circular: Gaussian step on the circle, wrapped;
 * - genes sharing a `correlationGroup` move together by one shared draw (trait-shift), each
 *   scaled to its own range.
 *
 * Each independent gene (or correlated group) consumes the same three draws (gate, normal, coin)
 * whether or not it mutates and whatever the configured rates are, so a configuration change
 * never shifts later draws. Ordered genes are re-bounded even when they do not mutate, because
 * the gene they must follow may have moved.
 */
export function mutateVector(
  values: readonly number[],
  specs: readonly GeneSpec[],
  random: RandomSource,
  scales: MutationScales
): number[] {
  const out = values.slice()
  const groups = new Map<string, GroupDraw>()

  specs.forEach((spec, index) => {
    const current = out[index] as number
    let draw: GroupDraw
    let coin: boolean
    const shared =
      spec.correlationGroup === undefined ? undefined : groups.get(spec.correlationGroup)
    if (shared) {
      draw = shared
      coin = false
    } else {
      const gate = random.float()
      const z = random.normal()
      coin = random.boolean()
      draw = { fire: gate < Math.min(1, spec.mutationRate * scales.rate), z }
      if (spec.correlationGroup !== undefined) groups.set(spec.correlationGroup, draw)
    }

    let candidate = current
    if (draw.fire) {
      const std = spec.mutationStd * scales.strength
      const span = spec.max - spec.min
      switch (spec.kind) {
        case 'float':
          candidate = current + draw.z * std * (spec.relative ? Math.abs(current) : span)
          break
        case 'circular':
          candidate = current + draw.z * std * span
          break
        case 'int':
          candidate = current + (coin ? 1 : -1)
          break
        case 'bool':
          candidate = current === 0 ? 1 : 0
          break
      }
    }
    out[index] = spec.kind === 'bool' ? candidate : boundGene(spec, out, candidate)
  })
  return out
}

export interface WeightMutation {
  /** Probability in `[0, 1]` that one weight mutates. */
  rate: number
  /** Standard deviation of the Gaussian step. */
  std: number
}

/** Mutates brain weights independently (sparse Gaussian), returning a new array. */
export function mutateWeights(
  weights: readonly number[],
  random: RandomSource,
  mutation: WeightMutation,
  scales: MutationScales
): number[] {
  const probability = Math.min(1, mutation.rate * scales.rate)
  const std = mutation.std * scales.strength
  return weights.map((weight) => {
    const gate = random.float()
    const z = random.normal()
    return gate < probability ? weight + z * std : weight
  })
}
