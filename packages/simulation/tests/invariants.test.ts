import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD_CONFIG } from '@evo/config'
import type { MetricsSnapshot } from '@evo/contracts'
import { checkInvariants } from '../src/world/invariants'
import type { InvariantContext } from '../src/world/invariants'
import type { OrganismState } from '../src/entities/OrganismStore'
import type { ResourceState } from '../src/entities/ResourceStore'

const zeroMetrics: MetricsSnapshot = {
  organismsBorn: 0,
  deathsByStarvation: 0,
  deathsByAge: 0,
  resourcesSpawned: 0,
  resourcesConsumed: 0,
  reproductionAttempts: 0,
  reproductionSuccesses: 0,
  reproductionFailures: 0,
  energyConsumed: 0,
  energyWasted: 0
}

const organism = (id: number, overrides: Partial<OrganismState> = {}): OrganismState => ({
  id,
  x: 10,
  y: 10,
  vx: 0,
  vy: 0,
  heading: 0,
  age: 1,
  energy: 50,
  parentIds: [],
  birthTick: 0,
  reproductionCooldownRemaining: 0,
  lastTurnMagnitude: 0,
  ...overrides
})

const resource = (id: number, overrides: Partial<ResourceState> = {}): ResourceState => ({
  id,
  x: 10,
  y: 10,
  remaining: 30,
  ...overrides
})

const baseContext = (overrides: Partial<InvariantContext> = {}): InvariantContext => ({
  organisms: [],
  resources: [],
  config: DEFAULT_WORLD_CONFIG,
  tick: 100,
  extinctionTick: null,
  metrics: zeroMetrics,
  nextEntityId: 1000,
  ...overrides
})

describe('checkInvariants', () => {
  it('reports no violations for a healthy empty world', () => {
    expect(checkInvariants(baseContext())).toEqual({ ok: true, errors: [] })
  })

  it('reports no violations for healthy organisms and resources', () => {
    const result = checkInvariants(
      baseContext({ organisms: [organism(1), organism(2)], resources: [resource(1)] })
    )
    expect(result).toEqual({ ok: true, errors: [] })
  })

  it.each(['x', 'y', 'vx', 'vy', 'heading', 'age', 'energy'] as const)(
    'catches a non-finite organism %s (NaN and Infinity)',
    (field) => {
      for (const bad of [Number.NaN, Infinity, -Infinity]) {
        const result = checkInvariants(baseContext({ organisms: [organism(1, { [field]: bad })] }))
        expect(result.ok).toBe(false)
        expect(result.errors.some((e) => e.includes(field) && e.includes('not finite'))).toBe(true)
      }
    }
  )

  it.each(['x', 'y', 'remaining'] as const)('catches a non-finite resource %s', (field) => {
    const result = checkInvariants(
      baseContext({ resources: [resource(1, { [field]: Number.NaN })] })
    )
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes(field))).toBe(true)
  })

  it('catches negative age and negative energy', () => {
    const result = checkInvariants(
      baseContext({ organisms: [organism(1, { age: -1, energy: -5 })] })
    )
    expect(result.errors).toContain('organism 1: age is negative')
    expect(result.errors).toContain('organism 1: energy is negative')
  })

  it('catches negative remaining resource energy', () => {
    const result = checkInvariants(baseContext({ resources: [resource(1, { remaining: -1 })] }))
    expect(result.errors).toContain('resource 1: remaining is negative')
  })

  it('catches organism and resource positions outside the environment bounds', () => {
    const config = { ...DEFAULT_WORLD_CONFIG, environment: { width: 100, height: 100 } }
    const result = checkInvariants(
      baseContext({
        config,
        organisms: [organism(1, { x: -1, y: 101 })],
        resources: [resource(1, { x: 200, y: -0.5 })]
      })
    )
    expect(result.errors).toContain('organism 1: x is outside [0, 100]')
    expect(result.errors).toContain('organism 1: y is outside [0, 100]')
    expect(result.errors).toContain('resource 1: x is outside [0, 100]')
    expect(result.errors).toContain('resource 1: y is outside [0, 100]')
  })

  it('accepts positions exactly on the environment boundary', () => {
    const config = { ...DEFAULT_WORLD_CONFIG, environment: { width: 100, height: 100 } }
    const result = checkInvariants(
      baseContext({ config, organisms: [organism(1, { x: 0, y: 100 })] })
    )
    expect(result.ok).toBe(true)
  })

  it('catches organisms out of ascending id order', () => {
    const result = checkInvariants(baseContext({ organisms: [organism(2), organism(1)] }))
    expect(result.errors.some((e) => e.includes('ascending id order'))).toBe(true)
  })

  it('catches duplicate organism ids', () => {
    const result = checkInvariants(baseContext({ organisms: [organism(1), organism(1)] }))
    expect(result.errors.some((e) => e.includes('ascending id order'))).toBe(true)
  })

  it('catches resources out of ascending id order', () => {
    const result = checkInvariants(baseContext({ resources: [resource(2), resource(1)] }))
    expect(result.errors.some((e) => e.includes('ascending id order'))).toBe(true)
  })

  it('rejects an extinctionTick inconsistent with a non-empty population', () => {
    const result = checkInvariants(baseContext({ organisms: [organism(1)], extinctionTick: 5 }))
    expect(result.errors).toContain('extinctionTick is set but the population is not empty')
  })

  it('rejects an extinctionTick in the future or otherwise invalid', () => {
    expect(
      checkInvariants(baseContext({ tick: 10, extinctionTick: 11 })).errors.some((e) =>
        e.includes('extinctionTick')
      )
    ).toBe(true)
    expect(
      checkInvariants(baseContext({ tick: 10, extinctionTick: -1 })).errors.some((e) =>
        e.includes('extinctionTick')
      )
    ).toBe(true)
    expect(
      checkInvariants(baseContext({ tick: 10, extinctionTick: 1.5 })).errors.some((e) =>
        e.includes('extinctionTick')
      )
    ).toBe(true)
  })

  it('accepts a valid extinctionTick with an empty population', () => {
    const result = checkInvariants(baseContext({ tick: 10, extinctionTick: 10, organisms: [] }))
    expect(result.ok).toBe(true)
  })

  it('catches negative or non-finite metrics counters', () => {
    const badMetrics: MetricsSnapshot = {
      ...zeroMetrics,
      deathsByStarvation: -1,
      energyWasted: Number.NaN
    }
    const result = checkInvariants(baseContext({ metrics: badMetrics }))
    expect(result.errors).toContain('metrics.deathsByStarvation is negative')
    expect(result.errors.some((e) => e.includes('energyWasted') && e.includes('not finite'))).toBe(
      true
    )
  })

  it('rejects a population exceeding maxPopulation', () => {
    const config = { ...DEFAULT_WORLD_CONFIG, maxPopulation: 1 }
    const result = checkInvariants(baseContext({ config, organisms: [organism(1), organism(2)] }))
    expect(result.errors).toContain('population (2) exceeds maxPopulation (1)')
  })

  it('accepts a population exactly at maxPopulation', () => {
    const config = { ...DEFAULT_WORLD_CONFIG, maxPopulation: 2 }
    const result = checkInvariants(baseContext({ config, organisms: [organism(1), organism(2)] }))
    expect(result.ok).toBe(true)
  })

  it('catches a negative or non-finite reproductionCooldownRemaining', () => {
    for (const bad of [-1, Number.NaN, Infinity]) {
      const result = checkInvariants(
        baseContext({ organisms: [organism(1, { reproductionCooldownRemaining: bad })] })
      )
      expect(result.ok).toBe(false)
    }
  })

  it('catches a birthTick outside [0, tick] or non-integer', () => {
    for (const bad of [-1, 1.5, 101]) {
      const result = checkInvariants(
        baseContext({ tick: 100, organisms: [organism(1, { birthTick: bad })] })
      )
      expect(result.errors.some((e) => e.includes('birthTick'))).toBe(true)
    }
  })

  it('accepts a birthTick equal to the current tick', () => {
    const result = checkInvariants(
      baseContext({ tick: 100, organisms: [organism(1, { birthTick: 100 })] })
    )
    expect(result.ok).toBe(true)
  })

  it('catches a parentIds entry that is not a real, already-allocated id', () => {
    for (const bad of [-1, 1.5, 1000, 1001]) {
      const result = checkInvariants(
        baseContext({ nextEntityId: 1000, organisms: [organism(5, { parentIds: [bad] })] })
      )
      expect(result.errors.some((e) => e.includes('parentIds'))).toBe(true)
    }
  })

  it('accepts parentIds referencing already-allocated ids', () => {
    const result = checkInvariants(
      baseContext({ nextEntityId: 10, organisms: [organism(5, { parentIds: [1, 2] })] })
    )
    expect(result.ok).toBe(true)
  })

  it('reports every violation at once, not just the first', () => {
    const result = checkInvariants(
      baseContext({
        organisms: [organism(1, { energy: -1 }), organism(2, { age: -1 })],
        metrics: { ...zeroMetrics, deathsByAge: -1 }
      })
    )
    expect(result.errors.length).toBeGreaterThanOrEqual(3)
  })
})
