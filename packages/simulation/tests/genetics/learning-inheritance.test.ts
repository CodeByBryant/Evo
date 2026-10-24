import { describe, expect, it } from 'vitest'
import { inheritedBrainWeights } from '../../src/genetics/LearningInheritance'

const genome = [0, 1, 2, 3]
const learned = [4, 1, 0, 11]

describe('inheritedBrainWeights', () => {
  it('baldwinian: learning is never inherited - the child starts from the genome weights', () => {
    expect(inheritedBrainWeights(genome, learned, 'baldwinian', 0.15)).toEqual(genome)
    expect(inheritedBrainWeights(genome, learned, 'baldwinian', 1)).toEqual(genome)
  })

  it('lamarckian: everything learned is inherited - the child starts from the learned weights', () => {
    expect(inheritedBrainWeights(genome, learned, 'lamarckian', 0)).toEqual(learned)
    expect(inheritedBrainWeights(genome, learned, 'lamarckian', 0.15)).toEqual(learned)
  })

  it('partial: the child inherits the configured fraction of what was learned', () => {
    // genome + fraction * (learned - genome) = [0 + .5*4, 1, 2 + .5*-2, 3 + .5*8]
    expect(inheritedBrainWeights(genome, learned, 'partial', 0.5)).toEqual([2, 1, 1, 7])
  })

  it('partial at the default fraction of 0.15', () => {
    const result = inheritedBrainWeights(genome, learned, 'partial', 0.15)
    expect(result[0]).toBeCloseTo(0.6, 12)
    expect(result[1]).toBe(1)
    expect(result[2]).toBeCloseTo(1.7, 12)
    expect(result[3]).toBeCloseTo(4.2, 12)
  })

  it('partial reduces to the other two modes at the ends of the fraction range', () => {
    expect(inheritedBrainWeights(genome, learned, 'partial', 0)).toEqual(genome)
    expect(inheritedBrainWeights(genome, learned, 'partial', 1)).toEqual(learned)
  })

  it('partial lands between the genome and learned weights', () => {
    const result = inheritedBrainWeights(genome, learned, 'partial', 0.3)
    result.forEach((value, i) => {
      const low = Math.min(genome[i] as number, learned[i] as number)
      const high = Math.max(genome[i] as number, learned[i] as number)
      expect(value).toBeGreaterThanOrEqual(low)
      expect(value).toBeLessThanOrEqual(high)
    })
  })

  it('inherits nothing different when nothing was learned, in every mode', () => {
    for (const mode of ['baldwinian', 'partial', 'lamarckian'] as const) {
      expect(inheritedBrainWeights(genome, genome, mode, 0.15)).toEqual(genome)
    }
  })

  it('returns a new array and never modifies its inputs', () => {
    const g = genome.slice()
    const l = learned.slice()
    const out = inheritedBrainWeights(g, l, 'baldwinian', 0.15)
    out[0] = 99
    expect(g).toEqual(genome)
    const lamarckian = inheritedBrainWeights(g, l, 'lamarckian', 0.15)
    lamarckian[0] = 99
    expect(l).toEqual(learned)
  })

  it('rejects weight vectors of different lengths', () => {
    expect(() => inheritedBrainWeights([1, 2], [1], 'partial', 0.5)).toThrow(RangeError)
  })

  it('rejects a partial fraction outside [0, 1]', () => {
    expect(() => inheritedBrainWeights(genome, learned, 'partial', 1.1)).toThrow(RangeError)
    expect(() => inheritedBrainWeights(genome, learned, 'partial', -0.1)).toThrow(RangeError)
  })
})
