import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'

/**
 * The other long-run checks of the brain controller (ADR 0007): finite brains, a chunked and a
 * stepped run that end identically, and permanent extinction. Its population band over seeds 1-4
 * is in brain-long-run-1 and -2 (see ../support/brain-band.ts for what was measured).
 */
describe('the brain controller over a long run', () => {
  it('brains stay finite and learned weights stay inside the limit after a long run', () => {
    const world = World.create({ seed: 6, validateEveryTicks: 1000 })
    world.run(20_000)
    const limit = world.config.learning.weightLimit
    const internals = world as unknown as {
      organisms: { values(): Array<{ brain: { learned: number[] } | null }> }
    }
    for (const organism of internals.organisms.values()) {
      for (const weight of organism.brain!.learned) {
        expect(Math.abs(weight)).toBeLessThanOrEqual(limit + 1e-9)
      }
    }
  }, 300_000)

  it('a chunked run and a stepped run end in the identical state', () => {
    const chunked = World.create({ seed: 21, config: { organisms: { initialCount: 30 } } })
    for (const steps of [1, 999, 4000, 5000]) chunked.run(steps)
    const stepped = World.create({ seed: 21, config: { organisms: { initialCount: 30 } } })
    for (let i = 0; i < 10_000; i++) stepped.step()
    expect(chunked.stateHash()).toBe(stepped.stateHash())
    expect(chunked.lineage.size).toBe(stepped.lineage.size)
  }, 300_000)

  it('extinction without food is permanent under the brain controller too', () => {
    const world = World.create({
      seed: 1,
      config: { organisms: { initialCount: 10 }, resources: { initialCount: 0, spawnRate: 0 } },
      validateEveryTicks: 100
    })
    world.run(2000)
    expect(world.isExtinct).toBe(true)
    const tick = world.snapshot().population.extinctionTick
    world.run(5000)
    expect(world.snapshot().population.active).toBe(0)
    expect(world.snapshot().population.extinctionTick).toBe(tick)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  }, 300_000)
})
