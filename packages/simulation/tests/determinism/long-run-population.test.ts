import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'
import { withoutEcology } from '../support/ecology'
import { PHASE3_ECONOMY } from '../support/phase3'

/** Population bands over a long run (see long-run-validity.test.ts for how these files fit together). */
describe('long-run population', () => {
  it('sustains a bounded population over 50,000 ticks (roadmap: sustained population)', () => {
    // Population must neither collapse nor run away toward maxPopulation over a long run - this
    // is what "the engine can sustain a population for a long simulated period" (roadmap Phase 3
    // exit criteria) means in practice. This is the Phase 3/4 evidence, so it runs the reflex
    // controller; the brain controller's measured bands are in brain-long-run.test.ts.
    // It is Phase 3/4 evidence, so it keeps Phase 3's way of eating (touch and take whole): the
    // bites of ADR 0017 raise the population, and the default world's bands are in
    // ecology-stability.test.ts and brain-long-run.test.ts.
    const world = World.create({
      seed: 1,
      // ...and the pre-tuning economy (ADR 0018), which is what this band was measured on.
      config: withoutEcology({
        ...PHASE3_ECONOMY,
        learning: { controller: 'reflex' },
        feeding: { enabled: false },
        predation: { enabled: false }
      }),
      validateEveryTicks: 1000
    })
    const samples: number[] = []
    for (let i = 0; i < 50; i++) {
      world.run(1000)
      samples.push(world.snapshot().population.active)
    }

    expect(world.isExtinct).toBe(false)
    const backHalf = samples.slice(25)
    for (const active of backHalf) {
      expect(active).toBeGreaterThanOrEqual(15)
      // 40 until ADR 0016: parts anchored to the outline changed every body's mass and thrust,
      // and seed 1's back half moved from 15-40 to 25-46 (seeds 1 to 6 span 21-46). Still a
      // bounded band far below maxPopulation, with no collapse, so the claim is unchanged.
      expect(active).toBeLessThanOrEqual(50)
    }
    expect(world.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})
