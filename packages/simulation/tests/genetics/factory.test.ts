import { describe, expect, it } from 'vitest'
import { GENE_DEFINITIONS } from '@evo/contracts'
import { ORDER_MARGIN } from '../../src/genetics/GeneSpecs'
import {
  architectureOf,
  brainBlockLengths,
  brainWeightCount,
  createFounderGenome,
  genomeFromParts,
  genomeToVector
} from '../../src/genetics/GenomeFactory'
import { validateGenome } from '../../src/genetics/GenomeValidation'
import { fixture, founder, geneticsStream, sameState } from './helpers'

describe('buildGeneSpecs', () => {
  it('produces one spec per gene, in the canonical order', () => {
    const { specs } = fixture()
    expect(specs.map((spec) => spec.path)).toEqual(GENE_DEFINITIONS.map((d) => d.path))
    expect(specs).toHaveLength(23)
  })

  it('takes baselines from the config fields the genes replace', () => {
    const { specs, config } = fixture({ organisms: { maxSpeed: 33 } })
    const speed = specs.find((spec) => spec.path === 'physical.maxSpeed')
    expect(speed?.baseline).toBe(33)
    expect(config.organisms.maxSpeed).toBe(33)
  })

  it('widens a default range to include a changed baseline', () => {
    const { specs } = fixture({ organisms: { maxSpeed: 100 } })
    const speed = specs.find((spec) => spec.path === 'physical.maxSpeed')
    expect(speed?.max).toBe(100)
  })

  it('honors per-gene range overrides', () => {
    const { specs } = fixture({ genetics: { genes: { 'physical.maxSpeed': { max: 60 } } } })
    expect(specs.find((spec) => spec.path === 'physical.maxSpeed')?.max).toBe(60)
  })

  it('links ordered genes to the gene they must follow, by index', () => {
    const { specs } = fixture()
    const index = (path: string): number => specs.findIndex((spec) => spec.path === path)
    expect(specs[index('physical.senescenceAge')]?.orderedAfter).toBe(index('physical.maturityAge'))
    expect(specs[index('physical.maxAge')]?.orderedAfter).toBe(index('physical.senescenceAge'))
    expect(specs[index('physical.radius')]?.orderedAfter).toBe(-1)
  })

  it('marks only the learning rate as relative and only hue as circular', () => {
    const { specs } = fixture()
    expect(specs.filter((s) => s.relative).map((s) => s.path)).toEqual(['learning.learningRate'])
    expect(specs.filter((s) => s.kind === 'circular').map((s) => s.path)).toEqual(['physical.hue'])
  })

  it('uses a margin far below anything observable in seconds', () => {
    expect(ORDER_MARGIN).toBeGreaterThan(0)
    expect(ORDER_MARGIN).toBeLessThan(1e-3)
  })
})

describe('brain layout', () => {
  it('splits the weights into eight blocks that add up to the default 394', () => {
    const { config } = fixture()
    const lengths = brainBlockLengths(architectureOf(config.genetics.brain))
    expect(lengths).toEqual([264, 32, 8, 32, 4, 40, 5, 9])
    expect(brainWeightCount(architectureOf(config.genetics.brain))).toBe(394)
  })

  it('follows a custom architecture', () => {
    const architecture = { inputSize: 3, hiddenSize: 2, memorySize: 1, outputSize: 2 }
    expect(brainBlockLengths(architecture)).toEqual([6, 2, 2, 2, 1, 4, 2, 3])
    expect(brainWeightCount(architecture)).toBe(22)
  })
})

describe('founder genomes', () => {
  it('start every scalar gene at its baseline', () => {
    const f = fixture()
    const genome = founder(f, 0, 1)
    expect(genomeToVector(genome)).toEqual(f.specs.map((spec) => spec.baseline))
    expect(genome.version).toBe(1)
    expect(genome.parentIds).toEqual([])
  })

  it('are valid for the world they were built for', () => {
    const f = fixture()
    const genome = founder(f, 0, 1)
    expect(
      validateGenome(genome, f.specs, { brain: genome.brain.architecture, nextGenomeId: 1 })
    ).toEqual({ ok: true, errors: [] })
  })

  it('give each founder its own random brain, reproducibly', () => {
    const f = fixture()
    const a = founder(f, 0, 1)
    const b = founder(f, 1, 2)
    expect(a.brain.weights).toHaveLength(394)
    expect(a.brain.weights).not.toEqual(b.brain.weights)
    expect(founder(f, 0, 1).brain.weights).toEqual(a.brain.weights)
  })

  it('draw exactly one normal per weight from the supplied stream', () => {
    const f = fixture()
    const used = geneticsStream(5)
    createFounderGenome(0, f.specs, f.config.genetics.brain, used)
    const reference = geneticsStream(5)
    for (let i = 0; i < 394; i++) reference.normal(0, 1)
    expect(sameState(used, reference)).toBe(true)
  })

  it('draw weights with the configured standard deviation', () => {
    const f = fixture({ genetics: { brain: { initialWeightStd: 2 } } })
    const weights = founder(f, 0, 3).brain.weights
    const mean = weights.reduce((sum, w) => sum + w, 0) / weights.length
    const variance = weights.reduce((sum, w) => sum + (w - mean) * (w - mean), 0) / weights.length
    expect(Math.sqrt(variance)).toBeGreaterThan(1.6)
    expect(Math.sqrt(variance)).toBeLessThan(2.4)
  })

  it('are deeply frozen, so a lineage cannot be corrupted by accident', () => {
    const genome = founder(fixture(), 0, 1)
    expect(Object.isFrozen(genome)).toBe(true)
    expect(Object.isFrozen(genome.physical)).toBe(true)
    expect(Object.isFrozen(genome.brain)).toBe(true)
    expect(Object.isFrozen(genome.brain.weights)).toBe(true)
    expect(Object.isFrozen(genome.parentIds)).toBe(true)
    expect(() => {
      ;(genome.physical as { radius: number }).radius = 99
    }).toThrow(TypeError)
  })
})

describe('genome vectors', () => {
  it('round-trips every gene through the vector form', () => {
    const f = fixture()
    const original = founder(f, 7, 1)
    const vector = f.specs.map((_, index) => index + 0.5)
    const rebuilt = genomeFromParts({
      id: 8,
      parentIds: [3, 7],
      vector,
      architecture: original.brain.architecture,
      weights: original.brain.weights
    })
    expect(genomeToVector(rebuilt)).toEqual(vector)
    expect(rebuilt.id).toBe(8)
    expect(rebuilt.parentIds).toEqual([3, 7])
  })

  it('places each gene in the group its path names', () => {
    const f = fixture()
    const vector = f.specs.map((spec) => spec.baseline)
    const genome = genomeFromParts({
      id: 0,
      parentIds: [],
      vector,
      architecture: founder(f, 0, 1).brain.architecture,
      weights: founder(f, 0, 1).brain.weights
    })
    expect(genome.physical.maxSpeed).toBe(f.config.organisms.maxSpeed)
    expect(genome.sensory.sensorRadius).toBe(f.config.organisms.sensorRadius)
    expect(genome.metabolic.basalCost).toBe(f.config.organisms.basalCost)
    expect(genome.behavioral.wanderJitter).toBe(f.config.organisms.wanderJitter)
    expect(genome.reproduction.offspringInvestment).toBe(f.config.reproduction.offspringInvestment)
    expect(genome.learning.discountFactor).toBe(f.config.genetics.learning.discountFactor)
  })

  it('copies its inputs, so later changes to them cannot reach the genome', () => {
    const f = fixture()
    const vector = f.specs.map((spec) => spec.baseline)
    const weights = founder(f, 0, 1).brain.weights.slice()
    const genome = genomeFromParts({
      id: 0,
      parentIds: [],
      vector,
      architecture: founder(f, 0, 1).brain.architecture,
      weights
    })
    vector[0] = -1
    weights[0] = -1
    expect(genome.physical.radius).toBe(f.config.organisms.radius)
    expect(genome.brain.weights[0]).not.toBe(-1)
  })
})
