import { describe, expect, it } from 'vitest'
import type { Genome } from '@evo/contracts'
import { genomeDistance } from '../../src/genetics/GeneticDistance'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { fixture, founder, genomeWith } from './helpers'

const f = fixture()
const std = f.config.genetics.brain.initialWeightStd
const distance = (a: Genome, b: Genome) => genomeDistance(a, b, f.specs, std)

/** `genome` with some scalar genes replaced. */
function withGenes(genome: Genome, changes: Record<string, number>): Genome {
  const vector = genomeToVector(genome).map((value, index) => {
    const path = f.specs[index]?.path as string
    return path in changes ? (changes[path] as number) : value
  })
  return genomeFromParts({
    id: genome.id,
    parentIds: genome.parentIds,
    vector,
    architecture: genome.brain.architecture,
    weights: genome.brain.weights
  })
}

describe('genomeDistance', () => {
  const a = founder(f, 0, 1)

  it('is zero between a genome and itself, and between identical copies', () => {
    expect(distance(a, a).total).toBe(0)
    const copy = withGenes(a, {})
    expect(distance(a, copy)).toEqual({
      total: 0,
      physical: 0,
      sensory: 0,
      metabolic: 0,
      behavioral: 0,
      reproduction: 0,
      brain: 0,
      learning: 0
    })
  })

  it('is symmetric', () => {
    const b = withGenes(founder(f, 1, 2), { 'physical.maxSpeed': 35, 'physical.hue': 0.9 })
    expect(distance(a, b)).toEqual(distance(b, a))
  })

  it('stays within [0, 1] for every group, even for opposite extremes', () => {
    const low = genomeWith(f, 0, (spec) => spec.min, -5)
    const high = genomeWith(f, 1, (spec) => (spec.kind === 'circular' ? 0.5 : spec.max), 5)
    const result = distance(low, high)
    for (const value of Object.values(result)) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
    expect(result.total).toBeGreaterThan(0.9)
  })

  it('measures a physical difference as a share of the gene range', () => {
    const range = f.specs.find((s) => s.path === 'physical.maxSpeed')
    const b = withGenes(a, { 'physical.maxSpeed': (range?.baseline ?? 0) + 15 })
    const physicalGenes = 7
    const expected = 15 / ((range?.max ?? 0) - (range?.min ?? 0)) / physicalGenes
    expect(distance(a, b).physical).toBeCloseTo(expected, 12)
    expect(distance(a, b).sensory).toBe(0)
    expect(distance(a, b).brain).toBe(0)
  })

  it('attributes a change to the group that owns the gene', () => {
    const b = withGenes(a, { 'sensory.sensorRadius': 100 })
    const result = distance(a, b)
    expect(result.sensory).toBeGreaterThan(0)
    expect(result.physical).toBe(0)
    expect(result.metabolic).toBe(0)
    expect(result.behavioral).toBe(0)
    expect(result.reproduction).toBe(0)
    expect(result.learning).toBe(0)
  })

  it('measures a circular gene along the shortest arc', () => {
    const near0 = withGenes(a, { 'physical.hue': 0.02 })
    const near1 = withGenes(a, { 'physical.hue': 0.98 })
    const opposite = withGenes(a, { 'physical.hue': 0.5 })
    // 0.02 and 0.98 are 0.04 apart around the circle, not 0.96 apart.
    const close = distance(near0, near1).physical
    const far = distance(near0, opposite).physical
    expect(close).toBeLessThan(far)
    expect(close).toBeCloseTo(0.08 / 7, 9)
  })

  it('measures brain difference as RMS weight difference over two initial standard deviations', () => {
    const base = genomeWith(f, 0, (spec) => spec.baseline, 0)
    const shifted = genomeWith(f, 1, (spec) => spec.baseline, std)
    expect(distance(base, shifted).brain).toBeCloseTo(0.5, 12)
    const far = genomeWith(f, 2, (spec) => spec.baseline, 10 * std)
    expect(distance(base, far).brain).toBe(1)
  })

  it('takes the total as the unweighted mean of the seven groups', () => {
    const b = withGenes(founder(f, 1, 2), { 'physical.maxSpeed': 35, 'metabolic.basalCost': 0.7 })
    const r = distance(a, b)
    const mean =
      (r.physical +
        r.sensory +
        r.metabolic +
        r.behavioral +
        r.reproduction +
        r.brain +
        r.learning) /
      7
    expect(r.total).toBeCloseTo(mean, 12)
  })

  it('refuses to compare genomes with different brain architectures', () => {
    const other = fixture({ genetics: { brain: { hiddenSize: 4 } } })
    expect(() => distance(a, founder(other, 1, 1))).toThrow(RangeError)
  })

  it('separates a child from its parents less than it separates unrelated founders', () => {
    const parent = founder(f, 0, 1)
    const stranger = withGenes(founder(f, 1, 2), {
      'physical.maxSpeed': 38,
      'sensory.sensorRadius': 110
    })
    const closeRelative = withGenes(parent, { 'physical.maxSpeed': 21 })
    expect(distance(parent, closeRelative).total).toBeLessThan(distance(parent, stranger).total)
  })
})
