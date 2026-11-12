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
 *
 * Patches, plants and the 700 field (ADR 0021): seeds 1-4 now give means 50.5-75.7, minimum 24,
 * maximum 114 (the 16 seeds of the ecology gates together: means 43.0-81.5, minimum 16, maximum
 * 123), no world extinct. Only the ceiling moved, 110 to 140, a seventh of `maxPopulation`.
 */
/** The population band every seed in `seeds` must hold (the seeds are split over brain-long-run-1 and -2 so CI can run them in parallel). */
export function describeBrainBand(seeds: readonly number[]): void {
  describe('the brain controller keeps the ecology alive', () => {
    it.each(seeds)(
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
        // Bounds were 15-40 (mean), 5 and 60 until bites (ADR 0017): seeds 1-4 now give means
        // 58.0-70.2, minimum 42, maximum 87, and none goes extinct.
        expect(mean).toBeGreaterThan(25)
        expect(mean).toBeLessThan(90)
        expect(Math.min(...samples)).toBeGreaterThanOrEqual(15)
        // The ceiling was 140. With the jaw eating meat only (ADR 0023 step three) seeds 1-4 give means
        // 59.3-75.6, minimum 30, maximum 85-154 (seed 2 peaks at 154, a seventh to a sixth of
        // `maxPopulation`, a single boom), none extinct; the ceiling is 180, about a fifth of it.
        expect(Math.max(...samples)).toBeLessThanOrEqual(180)
        expect(world.validate()).toEqual({ ok: true, errors: [] })
      },
      300_000
    )
  })
}
