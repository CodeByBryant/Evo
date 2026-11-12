import { describe, expect, it } from 'vitest'
import {
  STASIS_DRIFT,
  STASIS_RATE,
  STASIS_SAMPLES,
  StasisDetector,
  columnMeans,
  evolutionaryRate
} from '../../src/observatory/rate'

describe('evolutionaryRate', () => {
  it('is exactly 0 when no mean moved, and the share of the range a mean moved', () => {
    expect(evolutionaryRate([1, 2], [1, 2], [4, 4])).toBe(0)
    expect(evolutionaryRate([1], [2], [4])).toBeCloseTo(0.25, 12)
    expect(evolutionaryRate([0, 0], [1, 2], [4, 4])).toBeCloseTo((0.25 + 0.5) / 2, 12)
  })

  it('skips dimensions with no scale (cosmetic genes), and is 0 when none has one (negatives)', () => {
    expect(evolutionaryRate([1, 5], [2, 9], [4, 0])).toBeCloseTo(0.25, 12)
    expect(evolutionaryRate([1], [9], [0])).toBe(0)
  })

  it('a bigger move reads as a bigger rate, whatever the spread of the population (the reason it is not standardised)', () => {
    const slow = evolutionaryRate([0], [0.1], [1])
    const fast = evolutionaryRate([0], [0.9], [1])
    expect(fast).toBeGreaterThan(slow)
  })
})

describe('columnMeans', () => {
  it('gives each column its mean', () => {
    expect(
      columnMeans([
        [1, 10],
        [3, 10]
      ])
    ).toEqual([2, 10])
    expect(columnMeans([])).toEqual([])
  })
})

describe('StasisDetector', () => {
  const quiet = {
    newSignatures: 0,
    newlyPersistent: 0,
    rate: STASIS_RATE / 2,
    driftChange: STASIS_DRIFT / 2
  }

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
      { ...quiet, rate: STASIS_RATE * 10 },
      { ...quiet, driftChange: STASIS_DRIFT * 10 }
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
