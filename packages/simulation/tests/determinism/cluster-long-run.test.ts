import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'

/**
 * The cluster layout over a long run (docs/decisions/0014): unbounded positions, area-scaled food,
 * founder species by group. Replays must agree exactly however the run is sliced.
 */
const CLUSTERS: WorldConfigOverrides = {
  environment: { layout: 'clusters', clusters: { organismsPerSpecies: 4 } }
}

describe('cluster layout long run', () => {
  it('10,000 ticks: same seed, same state hash, whether stepped, chunked or run in one go', () => {
    const single = World.create({ seed: 3, config: CLUSTERS, validateEveryTicks: 5_000 })
    single.run(10_000)
    const chunked = World.create({ seed: 3, config: CLUSTERS })
    chunked.run(5_000)
    // One tick at a time is checked over the first 5,000 ticks, against the hash the chunked world
    // (a `run()` world) had at that tick, instead of repeating all 10,000 of a slow cluster world.
    const hashAtStepped = chunked.stateHash()
    chunked.run(5_000)
    const stepped = World.create({ seed: 3, config: CLUSTERS })
    for (let i = 0; i < 5_000; i++) stepped.step()

    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(stepped.stateHash()).toBe(hashAtStepped)
    expect(single.validate()).toEqual({ ok: true, errors: [] })
  }, 900_000)

  it('works under the reflex controller too', () => {
    const config: WorldConfigOverrides = { ...CLUSTERS, learning: { controller: 'reflex' } }
    const a = World.create({ seed: 5, config })
    const b = World.create({ seed: 5, config })
    // 20,000 ticks before bites (ADR 0017): a cluster world now grows several times larger and runs
    // about 4 times slower, and CI runners are slower than a laptop.
    a.run(10_000)
    for (let i = 0; i < 2; i++) b.run(5_000)
    expect(b.stateHash()).toBe(a.stateHash())
  }, 600_000)

  it('works with anatomy on, so outlines evolve across clusters', () => {
    const config: WorldConfigOverrides = { ...CLUSTERS, anatomy: { enabled: true } }
    const a = World.create({ seed: 6, config, validateEveryTicks: 5_000 })
    const b = World.create({ seed: 6, config })
    // 15,000 ticks before bites (ADR 0017): a cluster world now grows to several times its size
    // and runs about 4 times slower (35 against 146 ticks per second at 432 creatures).
    a.run(5_000)
    for (let i = 0; i < 2; i++) b.run(2_500)
    expect(b.stateHash()).toBe(a.stateHash())
  }, 600_000)
})
