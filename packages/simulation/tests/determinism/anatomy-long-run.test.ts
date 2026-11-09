import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'
import { PHASE3_ECONOMY } from '../support/phase3'

/**
 * Evolving bodies over a long run (ADR 0012). Bodies are derived from genes that are hashed, and
 * development has no randomness, so replays must agree exactly however the run is sliced; and
 * a body that cannot change is the founder body, whose capability factors are exactly 1 (ADR 0015),
 * so anatomy on with a frozen body must not change a single dynamic against anatomy off.
 */
// The pre-tuning economy (ADR 0018): this is a stress test of body genes, which the restrained
// breeding of the default economy does not survive at these mutation rates.
const BUSY: WorldConfigOverrides = {
  ...PHASE3_ECONOMY,
  anatomy: {
    enabled: true,
    // A stress rate, not a default. Each slot now carries 14 genes (ADR 0016) against 9 before, so
    // the old 0.2 mutated about 50% more genes per birth and drove most seeds extinct (seeds 22 to
    // 24 at 0.2: only 24 survives; at 0.12, seeds 22 to 26: only 22 and 25 survive). Seed 22 is pinned because it
    // survives 50,000 ticks with 18 distinct plans among 19 organisms.
    mutation: { presenceRate: 0.05, typeRate: 0.05, continuousRate: 0.12, visualRate: 0.2 }
  },
  genetics: { ...PHASE3_ECONOMY.genetics, mutationRateScale: 2 }
}

/** The part types of every living body, for a quick structural fingerprint of the population. */
const plans = (world: World): string[] =>
  world
    .snapshot()
    .organisms.map((o) => (world.anatomyOf(o.id)?.anatomy.parts ?? []).map((p) => p.type).join(','))

describe('anatomy long run', () => {
  it('50,000 ticks: same seed, same state hash, whether stepped, chunked or run in one go', () => {
    const single = World.create({ seed: 21, config: BUSY, validateEveryTicks: 5_000 })
    single.run(50_000)
    const chunked = World.create({ seed: 21, config: BUSY })
    for (let i = 0; i < 10; i++) chunked.run(5_000)
    const stepped = World.create({ seed: 21, config: BUSY })
    for (let i = 0; i < 50_000; i++) stepped.step()

    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(stepped.stateHash()).toBe(single.stateHash())
    expect(single.validate()).toEqual({ ok: true, errors: [] })
  }, 300_000)

  it('bodies really evolve: many distinct body plans, all developing within budget', () => {
    const world = World.create({ seed: 22, config: BUSY })
    world.run(50_000)
    expect(world.isExtinct).toBe(false)
    const fingerprints = new Set(plans(world))
    expect(fingerprints.size).toBeGreaterThan(3)
    for (const o of world.snapshot().organisms) {
      const view = world.anatomyOf(o.id)
      expect(view?.anatomy.sizeUsed).toBeLessThanOrEqual(world.config.anatomy.structuralBudget)
      expect(view?.anatomy.parts.length).toBeLessThanOrEqual(12)
    }
  }, 300_000)

  it('anatomy on with a frozen body leaves the legacy dynamics alone: birth for birth', () => {
    // Anatomy is on by default (ADR 0015), so the baseline must switch it off explicitly.
    const off = World.create({
      seed: 23,
      config: { ...PHASE3_ECONOMY, genetics: BUSY.genetics ?? {}, anatomy: { enabled: false } }
    })
    const on = World.create({
      seed: 23,
      config: {
        ...BUSY,
        anatomy: {
          ...BUSY.anatomy,
          mutation: {
            ...BUSY.anatomy?.mutation,
            outlineRate: 0,
            presenceRate: 0,
            typeRate: 0,
            parentRate: 0,
            continuousRate: 0
          }
        }
      }
    })
    off.run(30_000)
    on.run(30_000)
    expect(on.snapshot().metrics).toEqual(off.snapshot().metrics)
    expect(on.snapshot().organisms.map((o) => [o.id, o.position, o.energy])).toEqual(
      off.snapshot().organisms.map((o) => [o.id, o.position, o.energy])
    )
    expect(on.stateHash()).not.toBe(off.stateHash()) // the bodies themselves differ
  }, 300_000)

  it('works under the reflex controller too', () => {
    const config: WorldConfigOverrides = { ...BUSY, learning: { controller: 'reflex' } }
    const a = World.create({ seed: 24, config })
    const b = World.create({ seed: 24, config })
    a.run(40_000)
    for (let i = 0; i < 8; i++) b.run(5_000)
    expect(b.stateHash()).toBe(a.stateHash())
  }, 300_000)
})
