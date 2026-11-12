import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'
import type { WorldConfig } from '@evo/contracts'

// The observatory section (ADR 0024): on by default, merged per field, validated.

type Loose = Record<string, Record<string, unknown>>

function errorsFor(mutate: (observatory: Loose) => void): string[] {
  const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
  mutate((config as unknown as Loose)['observatory'] as unknown as Loose)
  return [...validateWorldConfig(config).errors]
}

describe('observatory config', () => {
  it('has valid defaults, on, sampling every 500 ticks', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    expect(DEFAULT_WORLD_CONFIG.observatory).toEqual({
      enabled: true,
      sampleEvery: 500,
      behaviourEvery: 10,
      maxSamples: 1000
    })
  })

  it('merges field by field and leaves the defaults alone', () => {
    const before = JSON.stringify(DEFAULT_WORLD_CONFIG)
    const config = resolveWorldConfig({ observatory: { sampleEvery: 50 } })
    expect(config.observatory.sampleEvery).toBe(50)
    expect(config.observatory.enabled).toBe(true)
    expect(config.observatory.maxSamples).toBe(1000)
    expect(JSON.stringify(DEFAULT_WORLD_CONFIG)).toBe(before)
    expect(resolveWorldConfig({ observatory: { enabled: false } }).observatory.enabled).toBe(false)
  })

  it('rejects non-integers, zero and negative counts, a non-boolean switch and unknown keys', () => {
    for (const key of ['sampleEvery', 'behaviourEvery', 'maxSamples']) {
      expect(errorsFor((o) => (o[key] = 0 as never)).join('\n')).toContain(`observatory.${key}`)
      expect(errorsFor((o) => (o[key] = -5 as never)).join('\n')).toContain(`observatory.${key}`)
      expect(errorsFor((o) => (o[key] = 2.5 as never)).join('\n')).toContain(`observatory.${key}`)
    }
    expect(errorsFor((o) => (o['enabled'] = 'yes' as never))).toContain(
      'observatory.enabled must be a boolean'
    )
    expect(errorsFor((o) => (o['bogus'] = 1 as never))).toContain(
      'unknown property "observatory.bogus"'
    )
  })
})
