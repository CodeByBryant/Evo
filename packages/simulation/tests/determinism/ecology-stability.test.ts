import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'

/**
 * Held-out seeds for the ecology stability measurement (docs/ecology/ecology.md, "Measured
 * behavior"). Seeds 1-4 are the strict Phase 5 gate in brain-long-run.test.ts; these four were
 * not used to pick the defaults' direction and are allowed a little more room, because worlds
 * with regions, seasons and hazards vary more from map to map. Measured when the defaults were
 * set (50,000 ticks, sampled every 1,000 after a 10,000-tick burn-in): means 23.8-41, minimum 13,
 * maximum 62. The bounds below are looser than that. Across 32 seeds one world went extinct, so
 * the property tested here is "these worlds persist", not "every world must".
 *
 * Phase 7 (ADR 0010, mate seeking) added seeds 33-40, held out from the tuning that set the
 * mating-signal range and the food supply. Measured then: means 25.9-41.3, minimum 15, maximum 57.
 * Across 128 seeds one world went extinct, so these are a guard against regressions of the
 * mate-seeking benefit (the baseline lost 2 of 64), not a proof that no world can.
 */
const SEEDS = [5, 6, 7, 8, 33, 34, 35, 36, 37, 38, 39, 40]

describe('the default ecology keeps held-out worlds alive', () => {
  it.each(SEEDS)(
    'seed %i: 50,000 ticks stay valid, populated and bounded',
    (seed) => {
      const world = World.create({ seed, validateEveryTicks: 2000 })
      const samples: number[] = []
      for (let i = 0; i < 50; i++) {
        world.run(1000)
        if (i >= 10) samples.push(world.snapshot().population.active)
      }
      const mean = samples.reduce((a, b) => a + b, 0) / samples.length
      expect(world.isExtinct).toBe(false)
      expect(mean).toBeGreaterThan(15)
      expect(mean).toBeLessThan(45)
      expect(Math.min(...samples)).toBeGreaterThanOrEqual(5)
      expect(Math.max(...samples)).toBeLessThanOrEqual(70)
      expect(world.validate()).toEqual({ ok: true, errors: [] })
      // the ecology was actually in play
      const { metrics, hazards } = world.snapshot()
      expect(metrics.organismsBorn).toBeGreaterThan(200)
      expect(world.regionTypeAt(10, 10)).not.toBeNull()
      expect(hazards.length).toBeGreaterThan(0)
    },
    300_000
  )
})
