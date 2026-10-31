import { describe, expect, it } from 'vitest'
import { World } from '../../src/world/World'

/** The species registry is not hashed, so the state hash cannot catch drift in it; compare it directly. */
const digest = (world: World): string => JSON.stringify(world.species.list())

describe('species long run', () => {
  it('50,000 ticks: same seed, same registry, whether stepped, chunked or run in one go', () => {
    const single = World.create({ seed: 11, validateEveryTicks: 2_500 })
    single.run(50_000)

    const chunked = World.create({ seed: 11 })
    for (let i = 0; i < 10; i++) chunked.run(5_000)

    expect(digest(chunked)).toBe(digest(single))
    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(single.validate()).toEqual({ ok: true, errors: [] })
    expect(single.species.size).toBeGreaterThan(1)
    expect(single.species.active().length).toBeLessThanOrEqual(25)
  })

  it('turning species off leaves the 50,000-tick state hash unchanged', () => {
    const on = World.create({ seed: 12 })
    const off = World.create({ seed: 12, config: { species: { enabled: false } } })
    on.run(50_000)
    off.run(50_000)
    expect(on.stateHash()).toBe(off.stateHash())
    expect(on.species.size).toBeGreaterThan(0)
    expect(off.species.size).toBe(0)
  })
})
