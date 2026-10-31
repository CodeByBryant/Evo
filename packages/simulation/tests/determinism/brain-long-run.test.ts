import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'

/**
 * Long runs under the default brain controller (ADR 0007): the ecology must stay alive and
 * bounded when organisms are driven by the learned brain instead of the hand-coded forager.
 * The band is what was measured, not what was hoped: when first measured, over 50,000 ticks on
 * four seeds the population (sampled every 1,000 ticks after a 10,000-tick burn-in) never went
 * extinct, ranged 9-47 and averaged 20-32, against a Phase 4 reflex average of about 27. The
 * assertions are deliberately looser than that sample (mean 15-40, never below 5 or above 60).
 *
 * Since Phase 6 the default world also has the ecology on (regions, seasons, hazards, resource
 * kinds, health). The same band holds for seeds 1-4: means 24-35, minimum 12, maximum 51 when the
 * ecology defaults were set, with the defaults tuned to keep it (docs/ecology/ecology.md).
 */
const SEEDS = [1, 2, 3, 4]

describe('the brain controller keeps the ecology alive', () => {
  it.each(SEEDS)(
    'seed %i: 50,000 ticks stay valid, populated and bounded',
    (seed) => {
      const world = World.create({ seed, validateEveryTicks: 1000 })
      const samples: number[] = []
      for (let i = 0; i < 50; i++) {
        world.run(1000)
        if (i >= 10) samples.push(world.snapshot().population.active)
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      expect(world.isExtinct).toBe(false)
      expect(mean).toBeGreaterThan(15)
      expect(mean).toBeLessThan(40)
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(5)
      expect(Math.max(...samples)).toBeLessThanOrEqual(60)
      expect(world.validate()).toEqual({ ok: true, errors: [] })
    },
    300_000
  )

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
