import { describe, expect, it } from 'vitest'
import {
  effectiveTypes,
  mean,
  meanPairwise,
  standardDeviation,
  stridedSample,
  unit
} from '../../src/observatory/stats'

describe('mean and standard deviation', () => {
  it('are exact on small inputs and 0 on empty or single ones (negative)', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5)
    expect(mean([])).toBe(0)
    expect(standardDeviation([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
    expect(standardDeviation([5])).toBe(0)
    expect(standardDeviation([])).toBe(0)
  })
})

describe('stridedSample', () => {
  it('keeps everything under the cap, in order, and a bounded evenly spread subset over it', () => {
    expect(stridedSample([1, 2, 3], 5)).toEqual([1, 2, 3])
    const many = Array.from({ length: 1000 }, (_, i) => i)
    const kept = stridedSample(many, 200)
    expect(kept.length).toBeLessThanOrEqual(200)
    expect(kept[0]).toBe(0)
    expect(kept[1]).toBe(5)
    expect(Math.max(...kept)).toBeGreaterThan(900)
    // the same input always gives the same subset (no randomness)
    expect(stridedSample(many, 200)).toEqual(kept)
  })

  it('a zero cap keeps nothing (negative)', () => {
    expect(stridedSample([1, 2, 3], 0)).toEqual([])
  })
})

describe('meanPairwise', () => {
  const d = (a: number, b: number) => Math.abs(a - b)

  it('averages over unordered pairs', () => {
    expect(meanPairwise([0, 1, 3], d)).toBeCloseTo((1 + 3 + 2) / 3, 12)
  })

  it('is 0 for fewer than two items, and 0 for identical ones (negatives)', () => {
    expect(meanPairwise([], d)).toBe(0)
    expect(meanPairwise([4], d)).toBe(0)
    expect(meanPairwise([2, 2, 2, 2], d)).toBe(0)
  })

  it('costs a bounded number of pairs however many items there are', () => {
    let calls = 0
    meanPairwise(
      Array.from({ length: 5000 }, (_, i) => i),
      (a, b) => {
        calls += 1
        return Math.abs(a - b)
      },
      50
    )
    expect(calls).toBeLessThanOrEqual((50 * 49) / 2)
  })
})

describe('effectiveTypes (inverse Simpson)', () => {
  it('one type is 1, k equal types are k, and a rare type adds little', () => {
    expect(effectiveTypes([10])).toBe(1)
    expect(effectiveTypes([5, 5])).toBe(2)
    expect(effectiveTypes([4, 4, 4, 4])).toBe(4)
    expect(effectiveTypes([99, 1])).toBeLessThan(1.05)
  })

  it('is 0 for an empty population and ignores zero counts (negatives)', () => {
    expect(effectiveTypes([])).toBe(0)
    expect(effectiveTypes([0, 0])).toBe(0)
    expect(effectiveTypes([5, 0, 5])).toBe(2)
  })
})

describe('unit', () => {
  it('clamps to [0, 1]', () => {
    expect(unit(-3)).toBe(0)
    expect(unit(0.4)).toBe(0.4)
    expect(unit(9)).toBe(1)
  })
})
