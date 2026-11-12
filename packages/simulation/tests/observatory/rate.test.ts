import { describe, expect, it } from 'vitest'
import {
  STASIS_SAMPLES,
  StasisDetector,
  columnStatistics,
  evolutionaryRate
} from '../../src/observatory/rate'

describe('evolutionaryRate', () => {
  it('is exactly 0 when no mean moved, and 1 for a move of one standard deviation', () => {
    expect(evolutionaryRate([1, 2], [1, 2], [0.5, 0.5], [0.5, 0.5])).toBe(0)
    expect(evolutionaryRate([1], [1.5], [0.5], [0.5])).toBeCloseTo(1, 12)
  })

  it('skips dimensions with no spread, and is 0 when none has any (negatives)', () => {
    expect(evolutionaryRate([1, 5], [2, 9], [1, 0], [1, 0])).toBeCloseTo(1, 12)
    expect(evolutionaryRate([1], [9], [0], [0])).toBe(0)
  })

  it('a bigger move reads as a bigger rate', () => {
    const slow = evolutionaryRate([0], [0.1], [1], [1])
    const fast = evolutionaryRate([0], [0.9], [1], [1])
    expect(fast).toBeGreaterThan(slow)
  })
})

describe('columnStatistics', () => {
  it('gives each column its mean and standard deviation', () => {
    const { means, sds } = columnStatistics([
      [1, 10],
      [3, 10]
    ])
    expect(means).toEqual([2, 10])
    expect(sds).toEqual([1, 0])
    expect(columnStatistics([])).toEqual({ means: [], sds: [] })
  })
})

describe('StasisDetector', () => {
  const quiet = { newSignatures: 0, newlyPersistent: 0, rate: 0.01, driftChange: 0.001 }

  it('needs the full run of quiet samples, not one fewer', () => {
    const detector = new StasisDetector()
    for (let i = 0; i < STASIS_SAMPLES - 1; i++) expect(detector.push(quiet)).toBe(false)
    expect(detector.push(quiet)).toBe(true)
    expect(detector.quietSamples).toBe(STASIS_SAMPLES)
  })

  it('one busy sample of any kind resets it', () => {
    const busy = [
      { ...quiet, newSignatures: 1 },
      { ...quiet, newlyPersistent: 1 },
      { ...quiet, rate: 0.5 },
      { ...quiet, driftChange: 0.1 }
    ]
    for (const signal of busy) {
      const detector = new StasisDetector()
      for (let i = 0; i < STASIS_SAMPLES; i++) detector.push(quiet)
      expect(detector.push(signal)).toBe(false)
      expect(detector.quietSamples).toBe(0)
      for (let i = 0; i < STASIS_SAMPLES - 1; i++) expect(detector.push(quiet)).toBe(false)
      expect(detector.push(quiet)).toBe(true)
    }
  })
})
