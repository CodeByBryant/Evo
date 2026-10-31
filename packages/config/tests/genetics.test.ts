import { describe, expect, it } from 'vitest'
import { GENE_DEFINITIONS } from '@evo/contracts'
import type { WorldConfig } from '@evo/contracts'
import {
  DEFAULT_GENE_RANGES,
  DEFAULT_WORLD_CONFIG,
  geneBaselines,
  resolveGeneRanges,
  resolveWorldConfig,
  validateWorldConfig
} from '../src/index'

function clone(): WorldConfig {
  return JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
}

function errorsFor(mutate: (config: WorldConfig) => void): readonly string[] {
  const config = clone()
  mutate(config)
  return validateWorldConfig(config).errors
}

/** The loosely-typed view tests need to inject malformed values. */
function loose(config: WorldConfig): Record<string, Record<string, unknown>> {
  return config as unknown as Record<string, Record<string, unknown>>
}

describe('gene ranges', () => {
  it('has a default range for every gene, in the canonical order', () => {
    for (const definition of GENE_DEFINITIONS) {
      expect(DEFAULT_GENE_RANGES[definition.path]).toBeDefined()
    }
    expect(Object.keys(resolveGeneRanges({}))).toEqual(GENE_DEFINITIONS.map((d) => d.path))
  })

  it('every founder baseline lies inside its default range', () => {
    const baselines = geneBaselines(DEFAULT_WORLD_CONFIG)
    for (const definition of GENE_DEFINITIONS) {
      const range = DEFAULT_GENE_RANGES[definition.path]
      const value = baselines[definition.path]
      expect(value).toBeGreaterThanOrEqual(range.min)
      expect(value).toBeLessThanOrEqual(range.max)
    }
  })

  it('maps each gene to the config field it replaces', () => {
    const config = resolveWorldConfig({
      organisms: { radius: 4, maxSpeed: 11, hue: 0.2, sensorRadius: 70 },
      reproduction: { minEnergy: 70, cooldown: 20 },
      genetics: { learning: { learningRate: 0.2 } }
    })
    const baselines = geneBaselines(config)
    expect(baselines['physical.radius']).toBe(4)
    expect(baselines['physical.maxSpeed']).toBe(11)
    expect(baselines['physical.hue']).toBe(0.2)
    expect(baselines['sensory.sensorRadius']).toBe(70)
    expect(baselines['reproduction.minEnergy']).toBe(70)
    expect(baselines['reproduction.cooldown']).toBe(20)
    expect(baselines['learning.learningRate']).toBe(0.2)
  })

  it('merges per-gene overrides field by field onto the defaults', () => {
    const ranges = resolveGeneRanges({ 'physical.maxSpeed': { max: 50, mutationRate: 0.5 } })
    expect(ranges['physical.maxSpeed']).toEqual({
      ...DEFAULT_GENE_RANGES['physical.maxSpeed'],
      max: 50,
      mutationRate: 0.5
    })
    expect(ranges['physical.radius']).toEqual(DEFAULT_GENE_RANGES['physical.radius'])
  })

  it('widens a default edge to include a changed founder baseline', () => {
    const baselines = { 'physical.maxSpeed': 0, 'physical.radius': 50 }
    const ranges = resolveGeneRanges({}, baselines)
    expect(ranges['physical.maxSpeed'].min).toBe(0)
    expect(ranges['physical.maxSpeed'].max).toBe(DEFAULT_GENE_RANGES['physical.maxSpeed'].max)
    expect(ranges['physical.radius'].max).toBe(50)
    expect(ranges['physical.radius'].min).toBe(DEFAULT_GENE_RANGES['physical.radius'].min)
  })

  it('never moves an edge set explicitly by an override', () => {
    const ranges = resolveGeneRanges(
      { 'physical.maxSpeed': { min: 25 } },
      { 'physical.maxSpeed': 20 }
    )
    expect(ranges['physical.maxSpeed'].min).toBe(25)
  })

  it('declares the life-stage ages as ordered genes', () => {
    const ordered = GENE_DEFINITIONS.filter((d) => d.orderedAfter !== undefined).map((d) => [
      d.path,
      d.orderedAfter
    ])
    expect(ordered).toEqual([
      ['physical.senescenceAge', 'physical.maturityAge'],
      ['physical.maxAge', 'physical.senescenceAge']
    ])
  })
})

describe('genetics validation', () => {
  it('accepts the defaults', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
  })

  it('validates the global mutation and blend knobs', () => {
    expect(errorsFor((c) => (c.genetics.mutationRateScale = -1))).toContain(
      'genetics.mutationRateScale must be nonnegative'
    )
    expect(errorsFor((c) => (c.genetics.mutationStrengthScale = -1))).toContain(
      'genetics.mutationStrengthScale must be nonnegative'
    )
    expect(errorsFor((c) => (c.genetics.blendAlpha = -0.1))).toContain(
      'genetics.blendAlpha must be nonnegative'
    )
    expect(
      errorsFor((c) => {
        c.genetics.mutationRateScale = 0
        c.genetics.mutationStrengthScale = 0
      })
    ).toEqual([])
  })

  it('validates the brain section', () => {
    for (const key of ['hiddenSize', 'memorySize'] as const) {
      expect(errorsFor((c) => (c.genetics.brain[key] = 0))).toContain(
        `genetics.brain.${key} must be an integer greater than zero`
      )
      expect(errorsFor((c) => (c.genetics.brain[key] = 2.5))).toContain(
        `genetics.brain.${key} must be an integer`
      )
    }
    expect(errorsFor((c) => (c.genetics.brain.initialWeightStd = 0))).toContain(
      'genetics.brain.initialWeightStd must be greater than zero'
    )
    expect(errorsFor((c) => (c.genetics.brain.weightMutationRate = 1.5))).toContain(
      'genetics.brain.weightMutationRate must be between zero and one'
    )
    expect(errorsFor((c) => (c.genetics.brain.weightMutationStd = -1))).toContain(
      'genetics.brain.weightMutationStd must be nonnegative'
    )
  })

  it('validates the founder learning baseline', () => {
    expect(errorsFor((c) => (c.genetics.learning.learningRate = 0))).toContain(
      'genetics.learning.learningRate must be greater than zero'
    )
    for (const key of [
      'discountFactor',
      'eligibilityTraceDecay',
      'explorationRate',
      'riskTolerance',
      'noveltyPreference',
      'persistence'
    ] as const) {
      expect(errorsFor((c) => (c.genetics.learning[key] = 1.1))).toContain(
        `genetics.learning.${key} must be between zero and one`
      )
      expect(errorsFor((c) => (c.genetics.learning[key] = -0.1))).toContain(
        `genetics.learning.${key} must be between zero and one`
      )
    }
  })

  it('validates the learning inheritance mode and fraction', () => {
    expect(
      errorsFor((c) => ((c.genetics.learningInheritance as { mode: string }).mode = 'magic'))
    ).toContain('genetics.learningInheritance.mode must be one of: baldwinian, partial, lamarckian')
    expect(errorsFor((c) => (c.genetics.learningInheritance.fraction = 1.5))).toContain(
      'genetics.learningInheritance.fraction must be between zero and one'
    )
    for (const mode of ['baldwinian', 'partial', 'lamarckian'] as const) {
      expect(errorsFor((c) => (c.genetics.learningInheritance.mode = mode))).toEqual([])
    }
  })

  it('rejects unknown genes and unknown range fields', () => {
    expect(errorsFor((c) => (loose(c)['genetics']!['genes'] = { 'physical.wings': {} }))).toContain(
      'unknown property "genetics.genes.physical.wings"'
    )
    expect(
      errorsFor((c) => (loose(c)['genetics']!['genes'] = { 'physical.radius': { average: 1 } }))
    ).toContain('unknown property "genetics.genes.physical.radius.average"')
    expect(errorsFor((c) => (loose(c)['genetics']!['genes'] = { 'physical.radius': 5 }))).toContain(
      'genetics.genes.physical.radius must be an object'
    )
    expect(errorsFor((c) => (loose(c)['genetics']!['genes'] = 5))).toContain(
      'genetics.genes must be an object'
    )
  })

  it('rejects non-numeric range overrides', () => {
    expect(
      errorsFor((c) => (loose(c)['genetics']!['genes'] = { 'physical.radius': { min: 'big' } }))
    ).toContain('genetics.genes.physical.radius.min must be a finite number')
  })

  it('validates the effective range of an overridden gene', () => {
    expect(
      errorsFor((c) => (c.genetics.genes['physical.maxSpeed'] = { min: 30, max: 30 }))
    ).toContain('genetics.genes.physical.maxSpeed: min must be less than max')
    expect(
      errorsFor((c) => (c.genetics.genes['physical.maxSpeed'] = { mutationRate: 2 }))
    ).toContain('genetics.genes.physical.maxSpeed: mutationRate must be between zero and one')
    expect(
      errorsFor((c) => (c.genetics.genes['physical.maxSpeed'] = { mutationStd: -1 }))
    ).toContain('genetics.genes.physical.maxSpeed: mutationStd must be nonnegative')
  })

  it('requires the founder baseline to lie inside the gene range', () => {
    expect(
      errorsFor((c) => (c.genetics.genes['physical.maxSpeed'] = { min: 25, max: 40 }))
    ).toContain(
      'genetics.genes.physical.maxSpeed: the founder baseline (20) must lie within [min, max]'
    )
  })

  it('validates organisms.hue as a turn in [0, 1)', () => {
    expect(errorsFor((c) => (c.organisms.hue = 1))).toContain(
      'organisms.hue must be at least zero and less than one'
    )
    expect(errorsFor((c) => (c.organisms.hue = -0.1))).toContain(
      'organisms.hue must be at least zero and less than one'
    )
    expect(errorsFor((c) => (c.organisms.hue = 0))).toEqual([])
  })

  it('accepts a changed baseline without a matching range override', () => {
    expect(
      errorsFor((c) => {
        c.organisms.maxSpeed = 0
        c.organisms.maturityAge = 1
        c.organisms.senescenceAge = 5
        c.organisms.maxAge = 10
        c.reproduction.cooldown = 5
      })
    ).toEqual([])
  })

  it('requires each ordered gene range to extend above the gene it must follow', () => {
    expect(errorsFor((c) => (c.genetics.genes['physical.senescenceAge'] = { max: 170 }))).toContain(
      'the physical.senescenceAge gene range max must be greater than the physical.maturityAge gene range max'
    )
    expect(errorsFor((c) => (c.genetics.genes['physical.maxAge'] = { max: 560 }))).toContain(
      'the physical.maxAge gene range max must be greater than the physical.senescenceAge gene range max'
    )
  })

  it('requires a positive minimum offspringInvestment', () => {
    expect(
      errorsFor((c) => (c.genetics.genes['reproduction.offspringInvestment'] = { min: 0 }))
    ).toContain('genetics.genes.reproduction.offspringInvestment: min must be greater than zero')
  })

  it('reports missing genetics sections', () => {
    const errors = errorsFor((c) => {
      delete loose(c)['genetics']!['brain']
      delete loose(c)['genetics']!['genes']
    })
    expect(errors).toContain('genetics.brain is required')
    expect(errors).toContain('genetics.genes is required')
  })
})

describe('genetics merging', () => {
  it('returns genetics defaults when given nothing', () => {
    expect(resolveWorldConfig().genetics).toEqual(DEFAULT_WORLD_CONFIG.genetics)
  })

  it('merges nested genetics sections field by field', () => {
    const config = resolveWorldConfig({
      genetics: {
        mutationRateScale: 2,
        brain: { hiddenSize: 12 },
        learning: { explorationRate: 0.3 },
        learningInheritance: { mode: 'lamarckian' },
        genes: { 'physical.maxSpeed': { max: 50 } }
      }
    })
    expect(config.genetics.mutationRateScale).toBe(2)
    expect(config.genetics.mutationStrengthScale).toBe(1)
    expect(config.genetics.brain.hiddenSize).toBe(12)
    expect(config.genetics.brain.memorySize).toBe(4)
    expect(config.genetics.learning.explorationRate).toBe(0.3)
    expect(config.genetics.learning.persistence).toBe(0.5)
    expect(config.genetics.learningInheritance).toEqual({ mode: 'lamarckian', fraction: 0.15 })
    expect(config.genetics.genes).toEqual({ 'physical.maxSpeed': { max: 50 } })
  })

  it('does not mutate the shared frozen defaults', () => {
    const config = resolveWorldConfig({ genetics: { brain: { hiddenSize: 12 } } })
    config.genetics.brain.hiddenSize = 99
    expect(DEFAULT_WORLD_CONFIG.genetics.brain.hiddenSize).toBe(8)
  })

  it('reports genetics overrides that are not objects', () => {
    expect(() => resolveWorldConfig({ genetics: 5 as never })).toThrow(/genetics must be an object/)
    expect(() => resolveWorldConfig({ genetics: { brain: 5 as never } })).toThrow(
      /genetics.brain must be an object/
    )
  })

  it('throws listing a genetics problem found after merging', () => {
    expect(() => resolveWorldConfig({ genetics: { brain: { memorySize: 0 } } })).toThrow(
      /genetics.brain.memorySize must be an integer greater than zero/
    )
  })
})
