import { describe, expect, it } from 'vitest'
import { MAX_SEED } from '@evo/contracts'
import type { WorldConfig } from '@evo/contracts'
import {
  ConfigValidationError,
  DEFAULT_WORLD_CONFIG,
  resolveWorldConfig,
  validateSeed,
  validateWorldConfig
} from '../src/index'

/** A fresh, mutable deep copy of the defaults for building invalid variants. */
function clone(): WorldConfig {
  return JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
}

/** Applies a mutation to a clone and returns the resulting error messages. */
function errorsFor(mutate: (config: WorldConfig) => void): readonly string[] {
  const config = clone()
  mutate(config)
  return validateWorldConfig(config).errors
}

describe('DEFAULT_WORLD_CONFIG', () => {
  it('is valid', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
  })

  it('is deeply frozen', () => {
    expect(Object.isFrozen(DEFAULT_WORLD_CONFIG)).toBe(true)
    expect(Object.isFrozen(DEFAULT_WORLD_CONFIG.organisms)).toBe(true)
    expect(Object.isFrozen(DEFAULT_WORLD_CONFIG.history)).toBe(true)
  })

  it('defaults to the stop extinction policy', () => {
    expect(DEFAULT_WORLD_CONFIG.extinctionPolicy).toBe('stop')
  })
})

describe('validateWorldConfig', () => {
  it('rejects non-objects', () => {
    for (const value of [null, undefined, 5, 'x', [], true]) {
      expect(validateWorldConfig(value).errors).toEqual(['configuration must be an object'])
    }
  })

  it('names the field and rule for scalar problems', () => {
    expect(errorsFor((c) => (c.timestep = 0))).toContain('timestep must be greater than zero')
    expect(errorsFor((c) => (c.timestep = -1))).toContain('timestep must be greater than zero')
    expect(errorsFor((c) => (c.maxPopulation = 0))).toContain(
      'maxPopulation must be an integer greater than zero'
    )
    expect(errorsFor((c) => (c.maxPopulation = 1.5))).toContain('maxPopulation must be an integer')
    expect(errorsFor((c) => (c.resources.spawnRate = -1))).toContain(
      'resources.spawnRate must be nonnegative'
    )
    expect(errorsFor((c) => (c.organisms.maxSpeed = -0.1))).toContain(
      'organisms.maxSpeed must be nonnegative'
    )
    expect(errorsFor((c) => (c.environment.width = 0))).toContain(
      'environment.width must be greater than zero'
    )
    expect(errorsFor((c) => (c.organisms.initialCount = 2.5))).toContain(
      'organisms.initialCount must be an integer'
    )
    expect(errorsFor((c) => (c.resources.maxCount = -1))).toContain(
      'resources.maxCount must be nonnegative'
    )
    expect(errorsFor((c) => (c.history.maxEvents = -1))).toContain(
      'history.maxEvents must be nonnegative'
    )
  })

  it('rejects NaN and infinities instead of accepting or repairing them', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity]) {
      expect(errorsFor((c) => (c.timestep = bad))).toContain('timestep must be a finite number')
      expect(errorsFor((c) => (c.organisms.maxAge = bad))).toContain(
        'organisms.maxAge must be a finite number'
      )
    }
  })

  it('rejects wrong types', () => {
    expect(
      errorsFor((c) => ((c as unknown as Record<string, unknown>)['timestep'] = '0.1'))
    ).toContain('timestep must be a finite number')
  })

  it('reports missing fields and sections', () => {
    const config = clone() as unknown as Record<string, unknown>
    delete config['timestep']
    delete config['resources']
    const errors = validateWorldConfig(config).errors
    expect(errors).toContain('timestep is required')
    expect(errors).toContain('resources is required')
  })

  it('rejects sections that are not objects', () => {
    const config = clone() as unknown as Record<string, unknown>
    config['organisms'] = 5
    expect(validateWorldConfig(config).errors).toContain('organisms must be an object')
  })

  it('rejects unknown properties, catching typos', () => {
    const config = clone() as unknown as Record<string, unknown>
    config['timeStep'] = 1
    ;(config['organisms'] as Record<string, unknown>)['maxSped'] = 3
    const errors = validateWorldConfig(config).errors
    expect(errors).toContain('unknown property "timeStep"')
    expect(errors).toContain('unknown property "organisms.maxSped"')
  })

  it('only supports the stop extinction policy for now', () => {
    for (const policy of ['allow-immigration', 'seed-bank', 'sandbox-recovery'] as const) {
      expect(errorsFor((c) => (c.extinctionPolicy = policy))).toContain(
        `extinctionPolicy "${policy}" is not implemented yet; only "stop" is supported`
      )
    }
    const config = clone() as unknown as Record<string, unknown>
    config['extinctionPolicy'] = 'respawn'
    expect(validateWorldConfig(config).errors).toContain(
      'extinctionPolicy must be one of: stop, allow-immigration, seed-bank, sandbox-recovery'
    )
  })

  it('validates the event detail level', () => {
    const config = clone() as unknown as { history: Record<string, unknown> }
    config.history['eventDetail'] = 'everything'
    expect(validateWorldConfig(config).errors).toContain(
      'history.eventDetail must be one of: essential, verbose'
    )
  })

  it('enforces cross-field consistency', () => {
    expect(errorsFor((c) => (c.organisms.initialCount = c.maxPopulation + 1))).toContain(
      'organisms.initialCount must not exceed maxPopulation'
    )
    expect(errorsFor((c) => (c.organisms.initialEnergy = c.organisms.maxEnergy + 1))).toContain(
      'organisms.initialEnergy must not exceed organisms.maxEnergy'
    )
    expect(errorsFor((c) => (c.resources.initialCount = c.resources.maxCount + 1))).toContain(
      'resources.initialCount must not exceed resources.maxCount'
    )
    expect(errorsFor((c) => (c.organisms.radius = 250))).toContain(
      'organisms.radius must be less than half of the smaller environment dimension'
    )
    expect(errorsFor((c) => (c.resources.radius = 250))).toContain(
      'resources.radius must be less than half of the smaller environment dimension'
    )
  })

  it('reports every problem at once, not just the first', () => {
    const errors = errorsFor((c) => {
      c.timestep = 0
      c.resources.spawnRate = -1
      c.organisms.maxAge = Number.NaN
    })
    expect(errors).toHaveLength(3)
  })

  it('accepts zero organisms and zero resources (extinction scenarios)', () => {
    const result = validateWorldConfig({
      ...clone(),
      organisms: { ...DEFAULT_WORLD_CONFIG.organisms, initialCount: 0 },
      resources: { ...DEFAULT_WORLD_CONFIG.resources, initialCount: 0, spawnRate: 0 }
    })
    expect(result.ok).toBe(true)
  })
})

describe('validateSeed', () => {
  it('accepts integers across the uint32 range', () => {
    for (const seed of [0, 1, 12345, MAX_SEED]) {
      expect(validateSeed(seed).ok).toBe(true)
    }
  })

  it('rejects everything else', () => {
    for (const seed of [
      -1,
      0.5,
      MAX_SEED + 1,
      Number.NaN,
      Infinity,
      '1',
      null,
      undefined,
      2 ** 53
    ]) {
      expect(validateSeed(seed)).toEqual({
        ok: false,
        errors: ['seed must be an integer between 0 and 4294967295']
      })
    }
  })
})

describe('resolveWorldConfig', () => {
  it('returns the defaults when given nothing', () => {
    expect(resolveWorldConfig()).toEqual(DEFAULT_WORLD_CONFIG)
  })

  it('returns a mutable copy, never the shared frozen defaults', () => {
    const config = resolveWorldConfig()
    expect(config).not.toBe(DEFAULT_WORLD_CONFIG)
    expect(config.organisms).not.toBe(DEFAULT_WORLD_CONFIG.organisms)
    config.organisms.initialCount = 3
    expect(DEFAULT_WORLD_CONFIG.organisms.initialCount).toBe(20)
  })

  it('merges partial overrides section by section', () => {
    const config = resolveWorldConfig({
      timestep: 0.05,
      organisms: { initialCount: 10 },
      resources: { initialCount: 100 }
    })
    expect(config.timestep).toBe(0.05)
    expect(config.organisms.initialCount).toBe(10)
    expect(config.organisms.maxEnergy).toBe(DEFAULT_WORLD_CONFIG.organisms.maxEnergy)
    expect(config.environment).toEqual(DEFAULT_WORLD_CONFIG.environment)
  })

  it('throws ConfigValidationError listing every problem', () => {
    try {
      resolveWorldConfig({ timestep: 0, resources: { spawnRate: -2 } })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigValidationError)
      const failure = error as ConfigValidationError
      expect(failure.errors).toEqual([
        'timestep must be greater than zero',
        'resources.spawnRate must be nonnegative'
      ])
      expect(failure.message).toContain('  - timestep must be greater than zero')
    }
  })

  it('reports section overrides that are not objects', () => {
    expect(() =>
      resolveWorldConfig({ organisms: 5 as unknown as Partial<WorldConfig['organisms']> })
    ).toThrow(/organisms must be an object/)
  })

  it('reports unknown override keys', () => {
    expect(() =>
      resolveWorldConfig({
        organisms: { maxSped: 3 } as unknown as Partial<WorldConfig['organisms']>
      })
    ).toThrow(/unknown property "organisms.maxSped"/)
  })

  it('rejects overrides that are not an object', () => {
    expect(() => resolveWorldConfig(5 as never)).toThrow(/overrides must be an object/)
  })
})
