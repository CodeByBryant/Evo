import { describe, expect, it } from 'vitest'
import { MetricsCollector } from '../src/metrics/MetricsCollector'
import type { WorldEvent } from '@evo/contracts'

const pos = { x: 0, y: 0 }

describe('MetricsCollector', () => {
  it('starts at all zeros with no extinction', () => {
    const metrics = new MetricsCollector()
    expect(metrics.extinctionTick).toBeNull()
    expect(metrics.snapshot()).toEqual({
      organismsBorn: 0,
      deathsByStarvation: 0,
      deathsByAge: 0,
      resourcesSpawned: 0,
      resourcesConsumed: 0,
      energyConsumed: 0,
      energyWasted: 0
    })
  })

  it('tallies every countable event type', () => {
    const metrics = new MetricsCollector()
    const events: WorldEvent[] = [
      { type: 'organism-born', tick: 0, organismId: 1, parentIds: [], position: pos },
      { type: 'organism-born', tick: 0, organismId: 2, parentIds: [], position: pos },
      { type: 'organism-died', tick: 1, organismId: 1, cause: 'starvation', position: pos },
      { type: 'organism-died', tick: 1, organismId: 2, cause: 'age', position: pos },
      { type: 'resource-spawned', tick: 0, resourceId: 1, position: pos },
      {
        type: 'resource-consumed',
        tick: 1,
        organismId: 1,
        resourceId: 1,
        amount: 30,
        energyGained: 20,
        energyWasted: 10,
        position: pos
      }
    ]
    metrics.recordEvents(events)
    expect(metrics.snapshot()).toEqual({
      organismsBorn: 2,
      deathsByStarvation: 1,
      deathsByAge: 1,
      resourcesSpawned: 1,
      resourcesConsumed: 1,
      energyConsumed: 20,
      energyWasted: 10
    })
  })

  it('accumulates across multiple calls', () => {
    const metrics = new MetricsCollector()
    metrics.recordEvents([
      { type: 'organism-born', tick: 0, organismId: 1, parentIds: [], position: pos }
    ])
    metrics.recordEvents([
      { type: 'organism-born', tick: 1, organismId: 2, parentIds: [], position: pos }
    ])
    expect(metrics.snapshot().organismsBorn).toBe(2)
  })

  it('death causes not produced yet (damage, environment) do not affect any counter', () => {
    const metrics = new MetricsCollector()
    metrics.recordEvents([
      { type: 'organism-died', tick: 0, organismId: 1, cause: 'damage', position: pos },
      { type: 'organism-died', tick: 0, organismId: 2, cause: 'environment', position: pos }
    ])
    expect(metrics.snapshot()).toMatchObject({ deathsByStarvation: 0, deathsByAge: 0 })
  })

  it('verbose-only and reserved events are ignored', () => {
    const metrics = new MetricsCollector()
    metrics.recordEvents([
      { type: 'organism-moved', tick: 0, organismId: 1, from: pos, to: pos },
      {
        type: 'energy-changed',
        tick: 0,
        organismId: 1,
        previous: 1,
        current: 2,
        reason: 'metabolism'
      },
      { type: 'reproduction-attempted', tick: 0, organismId: 1, partnerId: null, succeeded: false }
    ])
    expect(metrics.snapshot()).toEqual({
      organismsBorn: 0,
      deathsByStarvation: 0,
      deathsByAge: 0,
      resourcesSpawned: 0,
      resourcesConsumed: 0,
      energyConsumed: 0,
      energyWasted: 0
    })
  })

  it('sets extinctionTick the first time the population reaches zero, and never changes it again', () => {
    const metrics = new MetricsCollector()
    metrics.updatePopulation(5, 0)
    expect(metrics.extinctionTick).toBeNull()
    metrics.updatePopulation(0, 10)
    expect(metrics.extinctionTick).toBe(10)
    metrics.updatePopulation(0, 11)
    expect(metrics.extinctionTick).toBe(10)
    metrics.updatePopulation(3, 12)
    expect(metrics.extinctionTick).toBe(10)
  })

  it('treats an initial population of zero as extinct at tick 0', () => {
    const metrics = new MetricsCollector()
    metrics.updatePopulation(0, 0)
    expect(metrics.extinctionTick).toBe(0)
  })
})
