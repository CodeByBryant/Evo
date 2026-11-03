import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'

/**
 * The cluster layout over a long run (docs/decisions/0014): unbounded positions, area-scaled food,
 * founder species by group. Replays must agree exactly however the run is sliced.
 */
const CLUSTERS: WorldConfigOverrides = { environment: { layout: 'clusters' } }

describe('cluster layout long run', () => {
  it('30,000 ticks: same seed, same state hash, whether stepped, chunked or run in one go', () => {
    const single = World.create({ seed: 3, config: CLUSTERS, validateEveryTicks: 5_000 })
    single.run(30_000)
    const chunked = World.create({ seed: 3, config: CLUSTERS })
    for (let i = 0; i < 6; i++) chunked.run(5_000)
    const stepped = World.create({ seed: 3, config: CLUSTERS })
    for (let i = 0; i < 30_000; i++) stepped.step()

    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(stepped.stateHash()).toBe(single.stateHash())
    expect(single.validate()).toEqual({ ok: true, errors: [] })
  }, 300_000)

  it('works under the reflex controller too', () => {
    const config: WorldConfigOverrides = { ...CLUSTERS, learning: { controller: 'reflex' } }
    const a = World.create({ seed: 5, config })
    const b = World.create({ seed: 5, config })
    a.run(20_000)
    for (let i = 0; i < 4; i++) b.run(5_000)
    expect(b.stateHash()).toBe(a.stateHash())
  }, 300_000)

  it('works with anatomy on, so outlines evolve across clusters', () => {
    const config: WorldConfigOverrides = { ...CLUSTERS, anatomy: { enabled: true } }
    const a = World.create({ seed: 6, config, validateEveryTicks: 5_000 })
    const b = World.create({ seed: 6, config })
    a.run(15_000)
    for (let i = 0; i < 3; i++) b.run(5_000)
    expect(b.stateHash()).toBe(a.stateHash())
  }, 300_000)
})
