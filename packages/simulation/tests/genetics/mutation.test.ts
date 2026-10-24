import { describe, expect, it } from 'vitest'
import { mutateVector, mutateWeights } from '../../src/genetics/Mutation'
import { genomeToVector } from '../../src/genetics/GenomeFactory'
import { validateGeneValues } from '../../src/genetics/GenomeValidation'
import { fixture, founder, geneticsStream, sameState, synthetic } from './helpers'

const FULL = { rate: 1, strength: 1 }
const OFF = { rate: 0, strength: 0 }

describe('mutateVector', () => {
  it('never changes the vector it was given', () => {
    const f = fixture()
    const input = genomeToVector(founder(f, 0, 1))
    const copy = input.slice()
    mutateVector(input, f.specs, geneticsStream(1), { rate: 10, strength: 5 })
    expect(input).toEqual(copy)
  })

  it('leaves everything unchanged when mutation is disabled', () => {
    const f = fixture()
    const input = genomeToVector(founder(f, 0, 1))
    expect(mutateVector(input, f.specs, geneticsStream(1), OFF)).toEqual(input)
  })

  it('changes genes when mutation is on, and only by bounded steps', () => {
    const f = fixture()
    const input = genomeToVector(founder(f, 0, 1))
    const out = mutateVector(input, f.specs, geneticsStream(2), { rate: 10, strength: 1 })
    expect(out).not.toEqual(input)
    expect(validateGeneValues(out, f.specs)).toEqual([])
  })

  it('keeps every gene inside its range, however hard it is pushed', () => {
    const f = fixture()
    for (let seed = 0; seed < 300; seed++) {
      const input = genomeToVector(founder(f, 0, 1))
      const out = mutateVector(input, f.specs, geneticsStream(seed), { rate: 10, strength: 50 })
      expect(validateGeneValues(out, f.specs)).toEqual([])
    }
  })

  it('keeps the life-stage ages strictly ordered through repeated mutation', () => {
    const f = fixture()
    let vector = genomeToVector(founder(f, 0, 1))
    const random = geneticsStream(9)
    const index = (path: string): number => f.specs.findIndex((spec) => spec.path === path)
    for (let generation = 0; generation < 500; generation++) {
      vector = mutateVector(vector, f.specs, random, { rate: 10, strength: 20 })
      expect(vector[index('physical.senescenceAge')]).toBeGreaterThan(
        vector[index('physical.maturityAge')] as number
      )
      expect(vector[index('physical.maxAge')]).toBeGreaterThan(
        vector[index('physical.senescenceAge')] as number
      )
    }
  })

  it('re-orders an ordered gene that did not mutate when the gene before it moved above it', () => {
    const specs = synthetic([
      { path: 'a.first', kind: 'float', min: 0, max: 20, mutationRate: 1, mutationStd: 0.1 },
      {
        path: 'a.second',
        kind: 'float',
        min: 0,
        max: 30,
        mutationRate: 0,
        orderedAfter: 0
      }
    ])
    let sawRaise = false
    for (let seed = 0; seed < 200; seed++) {
      const out = mutateVector([3, 4], specs, geneticsStream(seed), FULL)
      expect(out[1]).toBeGreaterThan(out[0] as number)
      if ((out[1] as number) !== 4) sawRaise = true
    }
    expect(sawRaise).toBe(true)
  })

  it('draws the same amount from the stream whatever the rates are', () => {
    const f = fixture()
    const input = genomeToVector(founder(f, 0, 1))
    const a = geneticsStream(4)
    const b = geneticsStream(4)
    mutateVector(input, f.specs, a, OFF)
    mutateVector(input, f.specs, b, { rate: 10, strength: 3 })
    expect(sameState(a, b)).toBe(true)
  })

  describe('operators by gene kind (synthetic table)', () => {
    const specs = synthetic([
      { path: 'g.float', kind: 'float', min: 0, max: 10, baseline: 5 },
      { path: 'g.int', kind: 'int', min: 0, max: 5, baseline: 2 },
      { path: 'g.bool', kind: 'bool', min: 0, max: 1, baseline: 0 },
      { path: 'g.hue', kind: 'circular', min: 0, max: 1, baseline: 0.5 }
    ])

    it('keeps integer genes integral and inside their range', () => {
      for (let seed = 0; seed < 200; seed++) {
        const out = mutateVector([5, 2, 0, 0.5], specs, geneticsStream(seed), FULL)
        expect(Number.isInteger(out[1])).toBe(true)
        expect(out[1]).toBeGreaterThanOrEqual(0)
        expect(out[1]).toBeLessThanOrEqual(5)
      }
    })

    it('moves an integer gene by exactly one step, or holds it at a bound', () => {
      for (let seed = 0; seed < 100; seed++) {
        const middle = mutateVector([5, 2, 0, 0.5], specs, geneticsStream(seed), FULL)
        expect(Math.abs((middle[1] as number) - 2)).toBe(1)
        const atBound = mutateVector([5, 5, 0, 0.5], specs, geneticsStream(seed), FULL)
        expect([4, 5]).toContain(atBound[1])
      }
    })

    it('flips a boolean gene when it mutates and leaves it otherwise', () => {
      expect(mutateVector([5, 2, 0, 0.5], specs, geneticsStream(1), FULL)[2]).toBe(1)
      expect(mutateVector([5, 2, 1, 0.5], specs, geneticsStream(1), FULL)[2]).toBe(0)
      expect(mutateVector([5, 2, 1, 0.5], specs, geneticsStream(1), OFF)[2]).toBe(1)
    })

    it('wraps a circular gene around its period instead of clamping it', () => {
      let wrapped = false
      for (let seed = 0; seed < 300; seed++) {
        const out = mutateVector([5, 2, 0, 0.98], specs, geneticsStream(seed), {
          rate: 1,
          strength: 3
        })
        expect(out[3]).toBeGreaterThanOrEqual(0)
        expect(out[3]).toBeLessThan(1)
        if ((out[3] as number) < 0.5) wrapped = true
      }
      expect(wrapped).toBe(true)
    })

    it('scales a float step by the range width', () => {
      const wide = synthetic([
        { path: 'g.float', kind: 'float', min: 0, max: 1000, baseline: 500, mutationStd: 0.01 }
      ])
      const narrow = synthetic([
        { path: 'g.float', kind: 'float', min: 0, max: 10, baseline: 5, mutationStd: 0.01 }
      ])
      const wideStep = Math.abs(
        (mutateVector([500], wide, geneticsStream(3), FULL)[0] as number) - 500
      )
      const narrowStep = Math.abs(
        (mutateVector([5], narrow, geneticsStream(3), FULL)[0] as number) - 5
      )
      expect(wideStep / narrowStep).toBeCloseTo(100, 6)
    })

    it('scales a relative gene by its current value instead of its range', () => {
      const relative = synthetic([
        {
          path: 'g.rate',
          kind: 'float',
          min: 0.001,
          max: 1000,
          baseline: 1,
          mutationStd: 0.1,
          relative: true
        }
      ])
      const small = (mutateVector([1], relative, geneticsStream(3), FULL)[0] as number) - 1
      const large = (mutateVector([10], relative, geneticsStream(3), FULL)[0] as number) - 10
      expect(large / small).toBeCloseTo(10, 6)
    })

    it('moves correlated genes together by one shared draw, each scaled to its own range', () => {
      const correlated = synthetic([
        {
          path: 'size.small',
          kind: 'float',
          min: 0,
          max: 10,
          baseline: 5,
          mutationStd: 0.01,
          correlationGroup: 'size'
        },
        {
          path: 'size.large',
          kind: 'float',
          min: 0,
          max: 100,
          baseline: 50,
          mutationStd: 0.01,
          correlationGroup: 'size'
        }
      ])
      for (let seed = 0; seed < 50; seed++) {
        const out = mutateVector([5, 50], correlated, geneticsStream(seed), FULL)
        const smallShift = ((out[0] as number) - 5) / 10
        const largeShift = ((out[1] as number) - 50) / 100
        expect(smallShift).toBeCloseTo(largeShift, 9)
        expect(smallShift).not.toBe(0)
      }
    })

    it('mutates correlated genes together or not at all', () => {
      const correlated = synthetic([
        {
          path: 'size.a',
          kind: 'float',
          min: 0,
          max: 10,
          mutationRate: 0.5,
          correlationGroup: 'size'
        },
        {
          path: 'size.b',
          kind: 'float',
          min: 0,
          max: 10,
          mutationRate: 0.5,
          correlationGroup: 'size'
        }
      ])
      for (let seed = 0; seed < 100; seed++) {
        const out = mutateVector([5, 5], correlated, geneticsStream(seed), FULL)
        expect(out[0] === 5).toBe(out[1] === 5)
      }
    })
  })
})

describe('mutateWeights', () => {
  const weights = Array.from({ length: 200 }, (_, i) => i / 100)

  it('never changes the array it was given', () => {
    const copy = weights.slice()
    mutateWeights(weights, geneticsStream(1), { rate: 1, std: 1 }, FULL)
    expect(weights).toEqual(copy)
  })

  it('preserves the length, so the architecture is preserved', () => {
    expect(mutateWeights(weights, geneticsStream(1), { rate: 1, std: 1 }, FULL)).toHaveLength(200)
  })

  it('leaves every weight alone at rate zero or strength zero', () => {
    expect(mutateWeights(weights, geneticsStream(1), { rate: 0, std: 1 }, FULL)).toEqual(weights)
    expect(mutateWeights(weights, geneticsStream(1), { rate: 1, std: 1 }, OFF)).toEqual(weights)
  })

  it('mutates roughly the configured share of weights', () => {
    const out = mutateWeights(weights, geneticsStream(5), { rate: 0.25, std: 1 }, FULL)
    const changed = out.filter((value, i) => value !== weights[i]).length
    expect(changed).toBeGreaterThan(25)
    expect(changed).toBeLessThan(75)
  })

  it('applies the global rate and strength scales', () => {
    const baseline = mutateWeights(weights, geneticsStream(6), { rate: 0.1, std: 0.1 }, FULL)
    const boosted = mutateWeights(
      weights,
      geneticsStream(6),
      { rate: 0.1, std: 0.1 },
      {
        rate: 10,
        strength: 1
      }
    )
    const count = (out: number[]): number => out.filter((v, i) => v !== weights[i]).length
    expect(count(boosted)).toBeGreaterThan(count(baseline))
  })

  it('draws the same amount from the stream whatever the rate is', () => {
    const a = geneticsStream(8)
    const b = geneticsStream(8)
    mutateWeights(weights, a, { rate: 0, std: 1 }, FULL)
    mutateWeights(weights, b, { rate: 1, std: 1 }, FULL)
    expect(sameState(a, b)).toBe(true)
  })
})
