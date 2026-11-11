import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'

// Tests push deliberately invalid values into a copy of the defaults.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('food distribution (ADR 0021)', () => {
  it('defaults to a uniform spread, is valid, and merges field by field', () => {
    expect(DEFAULT_WORLD_CONFIG.resources.distribution).toEqual({
      mode: 'uniform',
      scale: 120,
      contrast: 1,
      floor: 0.05,
      turnover: 1200
    })
    const merged = resolveWorldConfig({ resources: { distribution: { mode: 'noise', scale: 80 } } })
    expect(merged.resources.distribution).toEqual({
      mode: 'noise',
      scale: 80,
      contrast: 1,
      floor: 0.05,
      turnover: 1200
    })
    // the rest of resources is untouched by a distribution override
    expect(merged.resources.spawnRate).toBe(DEFAULT_WORLD_CONFIG.resources.spawnRate)
  })

  it('rejects a bad mode, scale, contrast, floor and turnover, and unknown keys', () => {
    const errors = (change: (c: Loose) => void): string[] => {
      const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as Loose
      change(config)
      return [...validateWorldConfig(config).errors]
    }
    expect(errors((c) => (c.resources.distribution.mode = 'random')).length).toBeGreaterThan(0)
    expect(errors((c) => (c.resources.distribution.scale = 0)).length).toBeGreaterThan(0)
    expect(errors((c) => (c.resources.distribution.contrast = 1.5))).toContain(
      'resources.distribution.contrast must be from 0 to 1'
    )
    expect(errors((c) => (c.resources.distribution.floor = 0))).toContain(
      'resources.distribution.floor must be greater than 0 and at most 1'
    )
    expect(errors((c) => (c.resources.distribution.turnover = -1)).length).toBeGreaterThan(0)
    expect(errors((c) => (c.resources.distribution.extra = 1))).toContain(
      'unknown property "resources.distribution.extra"'
    )
    expect(errors((c) => delete c.resources.distribution)).toContain(
      'resources.distribution is required'
    )
  })
})
