import { ORDER_MARGIN } from './GeneSpecs'
import type { GeneSpec } from './GeneSpecs'

/** Wraps `value` into the half-open period `[min, max)`; values already inside are untouched. */
export function wrapToRange(value: number, min: number, max: number): number {
  if (value >= min && value < max) return value
  const period = max - min
  let remainder = (value - min) % period
  if (remainder < 0) remainder += period
  const wrapped = min + remainder
  return wrapped >= max ? min : wrapped
}

/** The signed shortest displacement from `from` to `to` on a circle of the given period. */
export function shortestDelta(from: number, to: number, period: number): number {
  const half = period / 2
  let delta = (to - from) % period
  if (delta >= half) delta -= period
  if (delta < -half) delta += period
  return delta
}

/**
 * Brings a candidate value for gene `index` into its legal set: clamped into `[min, max]` (or
 * wrapped, for a circular gene) and, for an ordered gene, kept strictly above the gene it must
 * follow, which must already be final in `values`. If the ordering leaves no room the value is
 * pinned to the upper bound, which `validateGenome` then reports.
 */
export function boundGene(spec: GeneSpec, values: readonly number[], candidate: number): number {
  if (spec.kind === 'circular') return wrapToRange(candidate, spec.min, spec.max)
  let lower = spec.min
  if (spec.orderedAfter >= 0) {
    const floor = (values[spec.orderedAfter] as number) + ORDER_MARGIN
    if (floor > lower) lower = floor
  }
  if (candidate > spec.max) return spec.max
  return candidate < lower ? Math.min(lower, spec.max) : candidate
}
