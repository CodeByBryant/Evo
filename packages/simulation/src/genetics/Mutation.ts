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
 * - integer: step of one in a random direction, clamped; or, for a gene whose values are
 *   categories (`jump`), a jump to any other value with equal chance;
 * - boolean: flipped;
 * - circular: Gaussian step on the circle, wrapped;
 * - genes sharing a `correlationGroup` move together by one shared draw (trait-shift), each
 *   scaled to its own range.
 *
 * - a gene with `resetWith` takes a uniformly random value in its range when its switch gene
 *   turned on in this pass (a slot of the body waking up), instead of mutating.
 *
 * Each independent gene (or correlated group) consumes the same three draws (gate, normal, coin)
 * whether or not it mutates and whatever the configured rates are, so a configuration change
 * never shifts later draws. A jump and a reset take their random value from the gene's own gate
 * draw (uniform in `[0, 1)`; given that the gene fired, `gate / rate` is uniform too), so they
 * need no draw of their own. Ordered genes are re-bounded even when they do not mutate, because
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
    let gate = 0
    let probability = 0
    const shared =
      spec.correlationGroup === undefined ? undefined : groups.get(spec.correlationGroup)
    if (shared) {
      draw = shared
      coin = false
    } else {
      gate = random.float()
      const z = random.normal()
      coin = random.boolean()
      probability = Math.min(1, spec.mutationRate * scales.rate)
      draw = { fire: gate < probability, z }
      if (spec.correlationGroup !== undefined) groups.set(spec.correlationGroup, draw)
    }

    let candidate = current
    const switchIndex = spec.resetWith
    const woken =
      switchIndex !== undefined &&
      shared === undefined &&
      values[switchIndex] === 0 &&
      out[switchIndex] === 1
    if (woken) {
      const span = spec.max - spec.min
      candidate =
        spec.kind === 'int' ? spec.min + Math.floor(gate * (span + 1)) : spec.min + gate * span
    } else if (draw.fire) {
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
          if (spec.jump === true && shared === undefined && span >= 1) {
            // One of the `span` other values, each as likely as the next.
            const other = spec.min + Math.min(span - 1, Math.floor((gate / probability) * span))
            candidate = other >= current ? other + 1 : other
          } else {
            candidate = current + (coin ? 1 : -1)
          }
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
