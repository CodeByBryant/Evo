import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import {
  crossoverVector,
  crossoverWeights,
  GenomeRecombiner
} from '../../src/genetics/Recombination'
import { brainBlockLengths, genomeToVector } from '../../src/genetics/GenomeFactory'
import { validateGenome } from '../../src/genetics/GenomeValidation'
import { fixture, founder, genomeWith, geneticsStream, sameState, synthetic } from './helpers'

describe('crossoverVector', () => {
  const specs = synthetic([
    { path: 'g.float', kind: 'float', min: 0, max: 100 },
    { path: 'g.int', kind: 'int', min: 0, max: 10 },
    { path: 'g.bool', kind: 'bool', min: 0, max: 1 },
    { path: 'g.hue', kind: 'circular', min: 0, max: 1 }
  ])

  it('returns the shared value when both parents are identical', () => {
    const parent = [37, 4, 1, 0.3]
    for (let seed = 0; seed < 50; seed++) {
      expect(crossoverVector(parent, parent, specs, geneticsStream(seed), 0.25)).toEqual(parent)
    }
  })

  it('draws a continuous gene from the blend interval around the parents', () => {
    const lowest = 20
    const highest = 60
    const alpha = 0.25
    let belowLow = false
    let aboveHigh = false
    for (let seed = 0; seed < 400; seed++) {
      const child = crossoverVector(
        [lowest, 0, 0, 0],
        [highest, 0, 0, 0],
        specs,
        geneticsStream(seed),
        alpha
      )
      const value = child[0] as number
      expect(value).toBeGreaterThanOrEqual(lowest - alpha * 40)
      expect(value).toBeLessThanOrEqual(highest + alpha * 40)
      if (value < lowest) belowLow = true
      if (value > highest) aboveHigh = true
    }
    expect(belowLow).toBe(true)
    expect(aboveHigh).toBe(true)
  })

  it('stays strictly between the parents when alpha is zero', () => {
    for (let seed = 0; seed < 100; seed++) {
      const child = crossoverVector([20, 0, 0, 0], [60, 0, 0, 0], specs, geneticsStream(seed), 0)
      expect(child[0]).toBeGreaterThanOrEqual(20)
      expect(child[0]).toBeLessThanOrEqual(60)
    }
  })

  it('clamps an extended blend to the gene range', () => {
    for (let seed = 0; seed < 200; seed++) {
      const child = crossoverVector([0, 0, 0, 0], [100, 0, 0, 0], specs, geneticsStream(seed), 2)
      expect(child[0]).toBeGreaterThanOrEqual(0)
      expect(child[0]).toBeLessThanOrEqual(100)
    }
  })

  it('inherits integer and boolean genes whole from one parent or the other', () => {
    const seen = { ints: new Set<number>(), bools: new Set<number>() }
    for (let seed = 0; seed < 100; seed++) {
      const child = crossoverVector([0, 3, 0, 0], [0, 8, 1, 0], specs, geneticsStream(seed), 0.25)
      expect([3, 8]).toContain(child[1])
      expect([0, 1]).toContain(child[2])
      seen.ints.add(child[1] as number)
      seen.bools.add(child[2] as number)
    }
    expect(seen.ints.size).toBe(2)
    expect(seen.bools.size).toBe(2)
  })

  it('keeps integer genes integral', () => {
    for (let seed = 0; seed < 100; seed++) {
      const child = crossoverVector([0, 3, 0, 0], [0, 8, 0, 0], specs, geneticsStream(seed), 0.25)
      expect(Number.isInteger(child[1])).toBe(true)
    }
  })

  it('blends a circular gene along the shortest arc', () => {
    for (let seed = 0; seed < 200; seed++) {
      const child = crossoverVector(
        [0, 0, 0, 0.95],
        [0, 0, 0, 0.05],
        specs,
        geneticsStream(seed),
        0
      )
      const hue = child[3] as number
      // The short way from 0.95 to 0.05 crosses 0, so the child is near 0/1, never near 0.5.
      const distanceFromZero = Math.min(hue, 1 - hue)
      expect(distanceFromZero).toBeLessThanOrEqual(0.05 + 1e-9)
    }
  })

  it('consumes exactly one draw per gene', () => {
    const used = geneticsStream(3)
    crossoverVector([1, 1, 1, 0.1], [2, 2, 0, 0.2], specs, used, 0.25)
    const reference = geneticsStream(3)
    for (let i = 0; i < 4; i++) reference.float()
    expect(sameState(used, reference)).toBe(true)
  })

  it('keeps ordered genes in order', () => {
    const ordered = synthetic([
      { path: 'a.first', kind: 'float', min: 0, max: 100 },
      { path: 'a.second', kind: 'float', min: 0, max: 200, orderedAfter: 0 }
    ])
    for (let seed = 0; seed < 300; seed++) {
      const child = crossoverVector([80, 85], [20, 25], ordered, geneticsStream(seed), 1)
      expect(child[1]).toBeGreaterThan(child[0] as number)
    }
  })
})

describe('crossoverWeights', () => {
  const blocks = [10, 6, 1, 8]
  const mother = Array.from({ length: 25 }, () => 0)
  const father = Array.from({ length: 25 }, () => 1)

  it('takes weights from both parents in every block that can hold both', () => {
    for (let seed = 0; seed < 100; seed++) {
      const child = crossoverWeights(mother, father, blocks, geneticsStream(seed))
      let offset = 0
      for (const length of blocks) {
        const slice = child.slice(offset, offset + length)
        if (length >= 2) {
          expect(slice).toContain(0)
          expect(slice).toContain(1)
        }
        offset += length
      }
    }
  })

  it('is a single cut per block: one parent supplies a prefix, the other the remainder', () => {
    const child = crossoverWeights(
      mother.slice(0, 12),
      father.slice(0, 12),
      [12],
      geneticsStream(4)
    )
    const changes = child.filter((value, i) => i > 0 && value !== child[i - 1]).length
    expect(changes).toBe(1)
  })

  it('draws the cut and the starting parent at random', () => {
    const starts = new Set<number>()
    const cuts = new Set<number>()
    for (let seed = 0; seed < 200; seed++) {
      const child = crossoverWeights(
        mother.slice(0, 12),
        father.slice(0, 12),
        [12],
        geneticsStream(seed)
      )
      starts.add(child[0] as number)
      cuts.add(child.filter((value) => value === child[0]).length)
    }
    expect(starts.size).toBe(2)
    expect(cuts.size).toBeGreaterThan(3)
  })

  it('preserves the vector length', () => {
    expect(crossoverWeights(mother, father, blocks, geneticsStream(1))).toHaveLength(25)
  })

  it('rejects vectors that do not match the architecture', () => {
    expect(() => crossoverWeights(mother, father.slice(1), blocks, geneticsStream(1))).toThrow(
      RangeError
    )
    expect(() => crossoverWeights(mother, father, [5, 5], geneticsStream(1))).toThrow(RangeError)
  })

  it('handles the default architecture block by block', () => {
    const f = fixture()
    const lengths = brainBlockLengths(f.config.genetics.brain)
    const a = founder(f, 0, 1).brain.weights
    const b = founder(f, 1, 2).brain.weights
    const child = crossoverWeights(a, b, lengths, geneticsStream(1))
    expect(child).toHaveLength(249)
    expect(child.every((value, i) => value === a[i] || value === b[i])).toBe(true)
  })
})

describe('GenomeRecombiner', () => {
  function recombiner(overrides: WorldConfigOverrides = {}) {
    const f = fixture(overrides)
    let next = 100
    return { f, recombiner: new GenomeRecombiner(f.specs, f.config.genetics, () => next++) }
  }

  it('gives the child a fresh id and its parents ids in ascending order', () => {
    const { f, recombiner: r } = recombiner()
    const low = founder(f, 3, 1)
    const high = founder(f, 9, 2)
    const child = r.combine(low, high, geneticsStream(1))
    expect(child.id).toBe(100)
    expect(child.parentIds).toEqual([3, 9])
    expect(r.combine(high, low, geneticsStream(1)).parentIds).toEqual([3, 9])
  })

  it('allocates a new id for every child', () => {
    const { f, recombiner: r } = recombiner()
    const a = founder(f, 0, 1)
    const b = founder(f, 1, 2)
    const ids = [1, 2, 3].map(() => r.combine(a, b, geneticsStream(1)).id)
    expect(ids).toEqual([100, 101, 102])
  })

  it('produces valid genomes however hard mutation is pushed', () => {
    const { f, recombiner: r } = recombiner({
      genetics: { mutationRateScale: 10, mutationStrengthScale: 30 }
    })
    const mother = founder(f, 0, 1)
    const father = founder(f, 1, 2)
    for (let seed = 0; seed < 100; seed++) {
      const child = r.combine(mother, father, geneticsStream(seed))
      expect(
        validateGenome(child, f.specs, { brain: child.brain.architecture, nextGenomeId: 1000 })
      ).toEqual({ ok: true, errors: [] })
    }
  })

  it('never modifies its parents', () => {
    const { f, recombiner: r } = recombiner({ genetics: { mutationRateScale: 10 } })
    const mother = founder(f, 0, 1)
    const father = founder(f, 1, 2)
    const before = JSON.stringify([mother, father])
    r.combine(mother, father, geneticsStream(1))
    expect(JSON.stringify([mother, father])).toBe(before)
  })

  it('passes both parents scalar genes on when mutation is off', () => {
    const { f, recombiner: r } = recombiner({
      genetics: { mutationRateScale: 0, blendAlpha: 0 }
    })
    const mother = genomeWith(f, 0, (spec) => spec.min, 0.1)
    const father = genomeWith(f, 1, (spec) => spec.min + (spec.max - spec.min) / 2, 0.9)
    const firstGene = new Set<number>()
    for (let seed = 0; seed < 100; seed++) {
      const child = genomeToVector(r.combine(mother, father, geneticsStream(seed)))
      const motherVector = genomeToVector(mother)
      const fatherVector = genomeToVector(father)
      child.forEach((value, i) => {
        // Circular genes blend along the shortest arc, which can leave the linear interval.
        if (f.specs[i]?.kind === 'circular') return
        expect(value).toBeGreaterThanOrEqual(
          Math.min(motherVector[i] as number, fatherVector[i] as number)
        )
        expect(value).toBeLessThanOrEqual(
          Math.max(motherVector[i] as number, fatherVector[i] as number)
        )
      })
      firstGene.add(child[0] as number)
    }
    expect(firstGene.size).toBeGreaterThan(50)
  })

  it('takes brain weights from both parents', () => {
    const { f, recombiner: r } = recombiner({ genetics: { mutationRateScale: 0 } })
    const mother = genomeWith(f, 0, (spec) => spec.baseline, 0)
    const father = genomeWith(f, 1, (spec) => spec.baseline, 1)
    for (let seed = 0; seed < 30; seed++) {
      const weights = r.combine(mother, father, geneticsStream(seed)).brain.weights
      expect(weights).toContain(0)
      expect(weights).toContain(1)
      expect(weights.every((w) => w === 0 || w === 1)).toBe(true)
    }
  })

  it('preserves the brain architecture and weight count', () => {
    const { f, recombiner: r } = recombiner()
    const mother = founder(f, 0, 1)
    const child = r.combine(mother, founder(f, 1, 2), geneticsStream(1))
    expect(child.brain.architecture).toEqual(mother.brain.architecture)
    expect(child.brain.weights).toHaveLength(mother.brain.weights.length)
  })

  it('produces a child that differs from both parents when mutation is on', () => {
    const { f, recombiner: r } = recombiner({ genetics: { mutationRateScale: 10 } })
    const mother = founder(f, 0, 1)
    const father = founder(f, 1, 2)
    const child = r.combine(mother, father, geneticsStream(1))
    expect(genomeToVector(child)).not.toEqual(genomeToVector(mother))
    expect(child.brain.weights).not.toEqual(mother.brain.weights)
    expect(child.brain.weights).not.toEqual(father.brain.weights)
  })

  it('reproduces the same child from the same stream', () => {
    const { f, recombiner: r } = recombiner()
    const mother = founder(f, 0, 1)
    const father = founder(f, 1, 2)
    const a = r.combine(mother, father, geneticsStream(7))
    const b = r.combine(mother, father, geneticsStream(7))
    expect({ ...a, id: 0 }).toEqual({ ...b, id: 0 })
  })

  it('uses a fixed number of draws per birth, whatever the mutation settings', () => {
    const off = recombiner({ genetics: { mutationRateScale: 0, mutationStrengthScale: 0 } })
    const on = recombiner({ genetics: { mutationRateScale: 10, mutationStrengthScale: 5 } })
    const streamOff = geneticsStream(2)
    const streamOn = geneticsStream(2)
    off.recombiner.combine(founder(off.f, 0, 1), founder(off.f, 1, 2), streamOff)
    on.recombiner.combine(founder(on.f, 0, 1), founder(on.f, 1, 2), streamOn)
    expect(sameState(streamOff, streamOn)).toBe(true)
  })

  it('refuses parents with different brain architectures', () => {
    const { f, recombiner: r } = recombiner()
    const other = fixture({ genetics: { brain: { hiddenSize: 4 } } })
    expect(() => r.combine(founder(f, 0, 1), founder(other, 1, 1), geneticsStream(1))).toThrow(
      RangeError
    )
  })
})
