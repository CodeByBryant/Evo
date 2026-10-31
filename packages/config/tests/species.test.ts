import { describe, expect, it } from 'vitest'
import type { WorldConfig } from '@evo/contracts'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'

function clone(): WorldConfig {
  return JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
}

function errorsFor(mutate: (config: Record<string, Record<string, unknown>>) => void): string[] {
  const config = clone() as unknown as Record<string, Record<string, unknown>>
  mutate(config)
  return [...validateWorldConfig(config).errors]
}

describe('species config', () => {
  it('has valid defaults', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    expect(DEFAULT_WORLD_CONFIG.species.enabled).toBe(true)
    expect(DEFAULT_WORLD_CONFIG.species.reproductiveIsolation).toBe(false)
  })

  it('merges distanceWeights field by field', () => {
    const config = resolveWorldConfig({
      species: { threshold: 0.3, distanceWeights: { brain: 1 } }
    })
    expect(config.species.threshold).toBe(0.3)
    expect(config.species.distanceWeights).toEqual({
      ...DEFAULT_WORLD_CONFIG.species.distanceWeights,
      brain: 1
    })
    expect(config.species.sampleInterval).toBe(DEFAULT_WORLD_CONFIG.species.sampleInterval)
  })

  it('does not mutate the shared frozen defaults', () => {
    const config = resolveWorldConfig({ species: { distanceWeights: { brain: 1 } } })
    config.species.distanceWeights.brain = 99
    expect(DEFAULT_WORLD_CONFIG.species.distanceWeights.brain).toBe(0.3)
  })

  it('requires the species section', () => {
    expect(errorsFor((c) => delete c['species'])).toContain('species is required')
  })

  it('reports unknown keys and non-booleans', () => {
    const errors = errorsFor((c) => {
      c['species']!['bogus'] = 1
      c['species']!['enabled'] = 'yes'
      c['species']!['reproductiveIsolation'] = 1
    })
    expect(errors).toContain('unknown property "species.bogus"')
    expect(errors).toContain('species.enabled must be a boolean')
    expect(errors).toContain('species.reproductiveIsolation must be a boolean')
  })

  it('rejects a threshold outside [0, 1]', () => {
    expect(errorsFor((c) => (c['species']!['threshold'] = -0.1))).toContain(
      'species.threshold must be between zero and one'
    )
    expect(errorsFor((c) => (c['species']!['threshold'] = 1.5))).toContain(
      'species.threshold must be between zero and one'
    )
    expect(errorsFor((c) => (c['species']!['threshold'] = 0))).toEqual([])
    expect(errorsFor((c) => (c['species']!['threshold'] = 1))).toEqual([])
  })

  it('validates the sampling parameters', () => {
    expect(errorsFor((c) => (c['species']!['sampleInterval'] = 0))).toContain(
      'species.sampleInterval must be an integer greater than zero'
    )
    expect(errorsFor((c) => (c['species']!['sampleInterval'] = 1.5))).toContain(
      'species.sampleInterval must be an integer'
    )
    expect(errorsFor((c) => (c['species']!['maxHistorySamples'] = -1))).toContain(
      'species.maxHistorySamples must be nonnegative'
    )
    expect(errorsFor((c) => (c['species']!['maxHistorySamples'] = 0))).toEqual([])
  })

  it('validates the distance weights', () => {
    expect(
      errorsFor((c) => ((c['species']!['distanceWeights'] as Record<string, number>)['brain'] = -1))
    ).toContain('species.distanceWeights.brain must be nonnegative')
    expect(
      errorsFor((c) => delete (c['species']!['distanceWeights'] as Record<string, number>)['brain'])
    ).toContain('species.distanceWeights.brain is required')
    expect(
      errorsFor((c) => ((c['species']!['distanceWeights'] as Record<string, number>)['extra'] = 1))
    ).toContain('unknown property "species.distanceWeights.extra"')
  })

  it('rejects all-zero weights', () => {
    const errors = errorsFor((c) => {
      const weights = c['species']!['distanceWeights'] as Record<string, number>
      for (const key of Object.keys(weights)) weights[key] = 0
    })
    expect(errors).toContain('species.distanceWeights must not all be zero')
  })

  it('accepts a single nonzero weight', () => {
    const config = resolveWorldConfig({
      species: {
        distanceWeights: {
          physical: 0,
          sensory: 0,
          metabolic: 0,
          behavioral: 0,
          reproduction: 0,
          learning: 0,
          brain: 1
        }
      }
    })
    expect(config.species.distanceWeights.brain).toBe(1)
  })
})
