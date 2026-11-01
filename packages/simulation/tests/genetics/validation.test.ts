import { describe, expect, it } from 'vitest'
import type { Genome } from '@evo/contracts'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import {
  repairGeneValues,
  repairGenome,
  validateGeneValues,
  validateGenome
} from '../../src/genetics/GenomeValidation'
import { fixture, founder, synthetic } from './helpers'

const f = fixture()

function context(genome: Genome, nextGenomeId = 1000) {
  return { brain: genome.brain.architecture, nextGenomeId }
}

/** Rebuilds a genome with some scalar genes replaced, bypassing the operators' bounds. */
function withGenes(genome: Genome, changes: Record<string, number>, weights?: number[]): Genome {
  const vector = genomeToVector(genome).map((value, index) => {
    const path = f.specs[index]?.path as string
    return path in changes ? (changes[path] as number) : value
  })
  return genomeFromParts({
    id: genome.id,
    parentIds: genome.parentIds,
    vector,
    architecture: genome.brain.architecture,
    weights: weights ?? genome.brain.weights
  })
}

describe('validateGenome', () => {
  const valid = founder(f, 5, 1)

  it('accepts a valid genome', () => {
    expect(validateGenome(valid, f.specs, context(valid))).toEqual({ ok: true, errors: [] })
  })

  it.each([
    ['physical.maxSpeed', 1000, 'physical.maxSpeed (1000) is outside its range [10, 40]'],
    ['physical.radius', -1, 'physical.radius (-1) is outside its range [2.5, 10]'],
    ['sensory.sensorRadius', 5, 'sensory.sensorRadius (5) is outside its range [30, 120]'],
    ['physical.hue', 1, 'physical.hue (1) is outside its range [0, 1]']
  ])('rejects %s out of range', (path, value, message) => {
    const result = validateGenome(withGenes(valid, { [path]: value }), f.specs, context(valid))
    expect(result.ok).toBe(false)
    expect(result.errors).toContain(message)
  })

  it('rejects non-finite genes', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      const result = validateGenome(
        withGenes(valid, { 'physical.maxSpeed': bad }),
        f.specs,
        context(valid)
      )
      expect(result.errors).toContain('physical.maxSpeed is not a finite number')
    }
  })

  it('rejects life-stage ages that are not strictly ordered', () => {
    const tied = withGenes(valid, { 'physical.senescenceAge': 120, 'physical.maturityAge': 120 })
    const result = validateGenome(tied, f.specs, context(valid))
    expect(result.errors).toContain(
      'physical.senescenceAge must be greater than physical.maturityAge'
    )
  })

  it('rejects a negative learning rate, a discount factor outside [0, 1] and zero investment', () => {
    const bad = withGenes(valid, {
      'learning.learningRate': -0.1,
      'learning.discountFactor': 1.5,
      'reproduction.offspringInvestment': 0
    })
    const errors = validateGenome(bad, f.specs, context(valid)).errors
    expect(errors).toContain('learningRate must be nonnegative')
    expect(errors).toContain('discountFactor must be between zero and one')
    expect(errors).toContain('offspringInvestment must be positive')
  })

  it('rejects a brain whose weight count does not match its architecture', () => {
    const short = withGenes(valid, {}, valid.brain.weights.slice(1))
    expect(validateGenome(short, f.specs, context(valid)).errors).toContain(
      'brain has 425 weights but its architecture needs 426'
    )
  })

  it('rejects non-finite brain weights', () => {
    const weights = valid.brain.weights.slice()
    weights[3] = Number.NaN
    expect(validateGenome(withGenes(valid, {}, weights), f.specs, context(valid)).errors).toContain(
      'brain weights must all be finite numbers'
    )
  })

  it('rejects a brain architecture different from the world configuration', () => {
    const result = validateGenome(valid, f.specs, {
      brain: { inputSize: 1, hiddenSize: 1, memorySize: 1, outputSize: 1 }
    })
    expect(result.errors).toContain('brain architecture does not match the world configuration')
  })

  it('rejects a genome id that has not been allocated, and bad parent ids', () => {
    expect(validateGenome(valid, f.specs, context(valid, 5)).errors).toContain(
      'genome id (5) has not been allocated yet'
    )
    const child = genomeFromParts({
      id: 5,
      parentIds: [9, 2],
      vector: genomeToVector(valid),
      architecture: valid.brain.architecture,
      weights: valid.brain.weights
    })
    const errors = validateGenome(child, f.specs, context(child)).errors
    expect(errors).toContain('parent id (9) must be a nonnegative integer below the genome id')
    expect(errors).toContain('parent ids must be strictly ascending')
  })

  it('reports every violation at once', () => {
    const bad = withGenes(valid, { 'physical.maxSpeed': 1000, 'sensory.sensorRadius': 5 })
    expect(validateGenome(bad, f.specs, context(valid)).errors.length).toBeGreaterThanOrEqual(2)
  })

  it('does not modify the genome it checks', () => {
    const before = JSON.stringify(valid)
    validateGenome(valid, f.specs, context(valid))
    expect(JSON.stringify(valid)).toBe(before)
  })
})

describe('validateGeneValues (synthetic table)', () => {
  const specs = synthetic([
    { path: 'g.float', kind: 'float', min: 0, max: 10 },
    { path: 'g.int', kind: 'int', min: 0, max: 5 },
    { path: 'g.bool', kind: 'bool', min: 0, max: 1 },
    { path: 'g.hue', kind: 'circular', min: 0, max: 1 }
  ])

  it('accepts legal values', () => {
    expect(validateGeneValues([5, 3, 1, 0.5], specs)).toEqual([])
  })

  it('rejects a non-integer integer gene', () => {
    expect(validateGeneValues([5, 2.5, 0, 0.5], specs)).toContain('g.int must be an integer')
  })

  it('rejects a boolean gene that is not 0 or 1', () => {
    expect(validateGeneValues([5, 2, 0.5, 0.5], specs)).toContain('g.bool must be 0 or 1')
  })

  it('treats a circular gene as half-open: its upper bound is outside', () => {
    expect(validateGeneValues([5, 2, 0, 1], specs)).toContain(
      'g.hue (1) is outside its range [0, 1]'
    )
    expect(validateGeneValues([5, 2, 0, 0], specs)).toEqual([])
  })

  it('rejects the wrong number of genes', () => {
    expect(validateGeneValues([5, 2], specs)).toEqual(['expected 4 genes but found 2'])
  })
})

describe('repairGenome', () => {
  const valid = founder(f, 5, 1)

  it('returns an equal genome when nothing is wrong', () => {
    expect(repairGenome(valid, f.specs)).toEqual(valid)
  })

  it('clamps out-of-range genes and reports a valid result', () => {
    const broken = withGenes(valid, { 'physical.maxSpeed': 1000, 'sensory.sensorRadius': -4 })
    const repaired = repairGenome(broken, f.specs)
    expect(validateGenome(repaired, f.specs, context(valid))).toEqual({ ok: true, errors: [] })
    expect(repaired.physical.maxSpeed).toBe(40)
    expect(repaired.sensory.sensorRadius).toBe(30)
  })

  it('resets non-finite genes to their baseline and zeroes non-finite weights', () => {
    const weights = valid.brain.weights.slice()
    weights[0] = Number.NaN
    const broken = withGenes(valid, { 'physical.maxSpeed': Number.NaN }, weights)
    const repaired = repairGenome(broken, f.specs)
    expect(repaired.physical.maxSpeed).toBe(f.config.organisms.maxSpeed)
    expect(repaired.brain.weights[0]).toBe(0)
  })

  it('restores the life-stage ordering', () => {
    const broken = withGenes(valid, { 'physical.senescenceAge': 100, 'physical.maturityAge': 150 })
    const repaired = repairGenome(broken, f.specs)
    expect(repaired.physical.senescenceAge).toBeGreaterThan(repaired.physical.maturityAge)
  })

  it('keeps the genome identity', () => {
    const child = genomeFromParts({
      id: 7,
      parentIds: [1, 2],
      vector: genomeToVector(valid),
      architecture: valid.brain.architecture,
      weights: valid.brain.weights
    })
    const repaired = repairGenome(child, f.specs)
    expect(repaired.id).toBe(7)
    expect(repaired.parentIds).toEqual([1, 2])
  })
})

describe('repairGeneValues (synthetic table)', () => {
  const specs = synthetic([
    { path: 'g.float', kind: 'float', min: 0, max: 10, baseline: 5 },
    { path: 'g.int', kind: 'int', min: 0, max: 5, baseline: 2 },
    { path: 'g.bool', kind: 'bool', min: 0, max: 1, baseline: 0 },
    { path: 'g.hue', kind: 'circular', min: 0, max: 1, baseline: 0.5 }
  ])

  it('rounds integers and clamps them into range', () => {
    expect(repairGeneValues([5, 2.6, 0, 0.5], specs)[1]).toBe(3)
    expect(repairGeneValues([5, 99, 0, 0.5], specs)[1]).toBe(5)
    expect(repairGeneValues([5, -3, 0, 0.5], specs)[1]).toBe(0)
  })

  it('snaps booleans to 0 or 1', () => {
    expect(repairGeneValues([5, 2, 0.4, 0.5], specs)[2]).toBe(0)
    expect(repairGeneValues([5, 2, 0.6, 0.5], specs)[2]).toBe(1)
  })

  it('wraps circular genes instead of clamping them', () => {
    expect(repairGeneValues([5, 2, 0, 1.25], specs)[3]).toBeCloseTo(0.25, 12)
    expect(repairGeneValues([5, 2, 0, -0.25], specs)[3]).toBeCloseTo(0.75, 12)
  })

  it('resets non-finite values to the baseline', () => {
    expect(repairGeneValues([Number.NaN, Infinity, Number.NaN, -Infinity], specs)).toEqual([
      5, 2, 0, 0.5
    ])
  })

  it('produces vectors that validate', () => {
    const repaired = repairGeneValues([99, 2.6, 0.9, 7.3], specs)
    expect(validateGeneValues(repaired, specs)).toEqual([])
  })
})
