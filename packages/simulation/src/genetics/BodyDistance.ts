import {
  BODY_SLOT_COUNT,
  OUTLINE_COUNT_INDEX,
  OUTLINE_MAX_POINTS,
  OUTLINE_MIN_POINTS,
  SLOT_FIELDS,
  outlineAngleIndex,
  outlineRadiusIndex,
  slotGeneIndex
} from '@evo/contracts'
import { shortestDelta } from './geneMath'
import type { GeneSpec } from './GeneSpecs'

/**
 * How different two body plans are, in `[0, 1]`, as bodies and not as lists of numbers.
 *
 * A plain mean over the body genes would be wrong in three ways: an empty slot still carries latent
 * genes (two identical bodies would differ by genes neither expresses), the part type is a category
 * and not a quantity (a flagellum is no nearer to cilia than to a gyro), and the colour genes say
 * nothing about the body. So:
 *
 * - each of the twelve slots contributes `0` when it is empty in both bodies, `1` when it holds a
 *   part in one and not the other or holds different part types, and otherwise the mean difference
 *   of what that part is like (its parent as same-or-not, its size, placement, integrity and stats
 *   as a share of each gene's range);
 * - the outline contributes the mean difference of the points both bodies have, with every point
 *   only one of them has counting as fully different;
 * - the body's cosmetic genes are left out.
 *
 * The parts count for `SLOT_SHARE` of the result and the outline for the rest. Symmetric, and `0`
 * exactly when the two bodies develop from the same expressed genes.
 */
export const SLOT_SHARE = 0.8

/** The fields of a slot that describe a part once it is there (everything but presence and type). */
const PART_FIELDS = SLOT_FIELDS.filter(
  (field) => field !== 'present' && field !== 'type' && field !== 'parent'
)

function share(spec: GeneSpec, a: number, b: number): number {
  const span = spec.max - spec.min
  if (span <= 0) return 0
  if (spec.kind === 'circular') return Math.abs(shortestDelta(a, b, span)) / (span / 2)
  return Math.min(1, Math.abs(a - b) / span)
}

function outlineCount(genes: readonly number[]): number {
  const raw = Math.round(genes[OUTLINE_COUNT_INDEX] as number)
  return Math.min(OUTLINE_MAX_POINTS, Math.max(OUTLINE_MIN_POINTS, raw))
}

export function bodyPlanDistance(
  a: readonly number[],
  b: readonly number[],
  specs: readonly GeneSpec[]
): number {
  let slots = 0
  for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
    const presentIndex = slotGeneIndex(slot, 'present')
    const inA = a[presentIndex] === 1
    const inB = b[presentIndex] === 1
    if (!inA && !inB) continue
    const typeIndex = slotGeneIndex(slot, 'type')
    if (inA !== inB || Math.round(a[typeIndex] as number) !== Math.round(b[typeIndex] as number)) {
      slots += 1
      continue
    }
    const parentIndex = slotGeneIndex(slot, 'parent')
    let sum = Math.round(a[parentIndex] as number) === Math.round(b[parentIndex] as number) ? 0 : 1
    for (const field of PART_FIELDS) {
      const index = slotGeneIndex(slot, field)
      sum += share(specs[index] as GeneSpec, a[index] as number, b[index] as number)
    }
    slots += sum / (PART_FIELDS.length + 1)
  }

  const countA = outlineCount(a)
  const countB = outlineCount(b)
  const shared = Math.min(countA, countB)
  const most = Math.max(countA, countB)
  let outline = most - shared
  for (let point = 0; point < shared; point++) {
    const radius = outlineRadiusIndex(point)
    const angle = outlineAngleIndex(point)
    outline +=
      (share(specs[radius] as GeneSpec, a[radius] as number, b[radius] as number) +
        share(specs[angle] as GeneSpec, a[angle] as number, b[angle] as number)) /
      2
  }

  return SLOT_SHARE * (slots / BODY_SLOT_COUNT) + (1 - SLOT_SHARE) * (outline / most)
}
