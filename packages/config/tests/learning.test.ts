import { describe, expect, it } from 'vitest'
import type { WorldConfig } from '@evo/contracts'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'

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

describe('learning config', () => {
  it('has valid defaults', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
  })

  it('merges the learning section field by field, rewardWeights included', () => {
    const config = resolveWorldConfig({
      learning: { algorithm: 'hebbian', rewardWeights: { feeding: 2 } }
    })
    expect(config.learning.algorithm).toBe('hebbian')
    expect(config.learning.rewardWeights).toEqual({
      ...DEFAULT_WORLD_CONFIG.learning.rewardWeights,
      feeding: 2
    })
    expect(config.learning.controller).toBe(DEFAULT_WORLD_CONFIG.learning.controller)
  })

  it('does not mutate the shared frozen defaults', () => {
    const config = resolveWorldConfig({ learning: { rewardWeights: { feeding: 2 } } })
    config.learning.rewardWeights.feeding = 99
    expect(DEFAULT_WORLD_CONFIG.learning.rewardWeights.feeding).toBe(1)
  })

  it('rejects unknown choices and wrong types', () => {
    expect(errorsFor((c) => (loose(c)['learning']!['controller'] = 'magic'))).toContain(
      'learning.controller must be one of: reflex, brain'
    )
    expect(errorsFor((c) => (loose(c)['learning']!['algorithm'] = 'sarsa'))).toContain(
      'learning.algorithm must be one of: hebbian, actorCritic'
    )
    expect(errorsFor((c) => (loose(c)['learning']!['enabled'] = 'yes'))).toContain(
      'learning.enabled must be a boolean'
    )
  })

  it('validates the numeric fields', () => {
    expect(errorsFor((c) => (c.learning.weightLimit = 0))).toContain(
      'learning.weightLimit must be greater than zero'
    )
    expect(errorsFor((c) => (c.learning.baselineRate = 2))).toContain(
      'learning.baselineRate must be at most one'
    )
    expect(errorsFor((c) => (c.learning.valueRateScale = -1))).toContain(
      'learning.valueRateScale must be greater than zero'
    )
    expect(errorsFor((c) => (c.learning.foodHorizon = 0))).toContain(
      'learning.foodHorizon must be greater than zero'
    )
    expect(errorsFor((c) => (c.learning.rewardWeights.energyCost = -1))).toContain(
      'learning.rewardWeights.energyCost must be nonnegative'
    )
  })

  it('reports unknown learning properties and a missing section', () => {
    expect(errorsFor((c) => (loose(c)['learning']!['typo'] = 1))).toContain(
      'unknown property "learning.typo"'
    )
    expect(
      errorsFor((c) => {
        delete loose(c)['learning']
      })
    ).toContain('learning is required')
  })

  it('does not accept brain input and output sizes any more', () => {
    expect(
      errorsFor(
        (c) => ((loose(c)['genetics']!['brain'] as Record<string, unknown>)['inputSize'] = 16)
      )
    ).toContain('unknown property "genetics.brain.inputSize"')
  })

  it('validates organisms.learningCost and genetics.brain.innatePrior', () => {
    expect(errorsFor((c) => (c.organisms.learningCost = -1))).toContain(
      'organisms.learningCost must be nonnegative'
    )
    expect(
      errorsFor(
        (c) => ((loose(c)['genetics']!['brain'] as Record<string, unknown>)['innatePrior'] = 1)
      )
    ).toContain('genetics.brain.innatePrior must be a boolean')
    expect(
      errorsFor((c) => {
        c.genetics.brain.hiddenSize = 4
      })
    ).toContain(
      'genetics.brain.hiddenSize must be at least 5 when genetics.brain.innatePrior is true'
    )
    expect(
      errorsFor((c) => {
        c.genetics.brain.hiddenSize = 4
        c.genetics.brain.innatePrior = false
      })
    ).toEqual([])
  })
})

describe('resources.region', () => {
  it('defaults to the whole world', () => {
    expect(DEFAULT_WORLD_CONFIG.resources.region).toBeNull()
  })

  it('accepts a rectangle inside the world', () => {
    const config = resolveWorldConfig({
      resources: { region: { x: 0, y: 0, width: 100, height: 500 } }
    })
    expect(config.resources.region).toEqual({ x: 0, y: 0, width: 100, height: 500 })
  })

  it('accepts an explicit null override', () => {
    expect(resolveWorldConfig({ resources: { region: null } }).resources.region).toBeNull()
  })

  it('rejects a rectangle that leaves the world or is degenerate', () => {
    const errors = (region: unknown): readonly string[] =>
      errorsFor((c) => (loose(c)['resources']!['region'] = region))
    expect(errors({ x: 450, y: 0, width: 100, height: 10 })).toContain(
      'resources.region must lie inside the world (x + width exceeds environment.width)'
    )
    expect(errors({ x: 0, y: 450, width: 10, height: 100 })).toContain(
      'resources.region must lie inside the world (y + height exceeds environment.height)'
    )
    expect(errors({ x: 0, y: 0, width: 0, height: 10 })).toContain(
      'resources.region.width must be greater than zero'
    )
    expect(errors({ x: -1, y: 0, width: 10, height: 10 })).toContain(
      'resources.region.x must be nonnegative'
    )
    expect(errors(5)).toContain('resources.region must be null or an object')
    expect(errors({ x: 0, y: 0, width: 1, height: 1, z: 2 })).toContain(
      'unknown property "resources.region.z"'
    )
  })

  it('is required', () => {
    expect(
      errorsFor((c) => {
        delete loose(c)['resources']!['region']
      })
    ).toContain('resources.region is required')
  })
})
