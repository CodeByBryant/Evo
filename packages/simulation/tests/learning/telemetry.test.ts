import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'

describe('brain telemetry on historical records', () => {
  it('keeps what a brain did over its life after the organism dies', () => {
    const world = World.create({ seed: 3, config: { learning: { controller: 'brain' } } })
    world.run(4000)
    const records = world.historicalOrganisms()
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(record.brain).not.toBeNull()
      const lifetime = record.deathTick - record.birthTick
      expect(record.brain!.updates).toBeGreaterThanOrEqual(0)
      expect(record.brain!.updates).toBeLessThanOrEqual(lifetime)
      expect(Number.isFinite(record.brain!.rewardTotal)).toBe(true)
      expect(Number.isFinite(record.brain!.weightChange)).toBe(true)
    }
    // Brains that lived for a while actually learned something.
    expect(records.some((record) => record.brain!.weightChange > 0)).toBe(true)
  })

  it('records null telemetry under the reflex controller', () => {
    const world = World.create({ seed: 3, config: { learning: { controller: 'reflex' } } })
    world.run(4000)
    const records = world.historicalOrganisms()
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) expect(record.brain).toBeNull()
  })

  it('records no learning when learning is disabled', () => {
    const world = World.create({
      seed: 3,
      config: { learning: { controller: 'brain', enabled: false } }
    })
    world.run(4000)
    for (const record of world.historicalOrganisms()) {
      expect(record.brain!.updates).toBe(0)
      expect(record.brain!.weightChange).toBe(0)
    }
  })
})
