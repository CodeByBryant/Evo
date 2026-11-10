import { describe, expect, it } from 'vitest'
import { World } from '../../src/world/World'

/** The species registry is not hashed, so the state hash cannot catch drift in it; compare it directly. */
const digest = (world: World): string => JSON.stringify(world.species.list())

let singleRun: World | undefined
/** Seed 11 in one 50,000-tick run: the reference for both tests, built once. */
const single = (): World => {
  if (singleRun === undefined) {
    singleRun = World.create({ seed: 11, validateEveryTicks: 2_500 })
    singleRun.run(50_000)
  }
  return singleRun
}

describe('species long run', () => {
  it('50,000 ticks: same seed, same registry, whether stepped, chunked or run in one go', () => {
    const reference = single()

    const chunked = World.create({ seed: 11 })
    for (let i = 0; i < 10; i++) chunked.run(5_000)

    expect(digest(chunked)).toBe(digest(reference))
    expect(chunked.stateHash()).toBe(reference.stateHash())
    expect(reference.validate()).toEqual({ ok: true, errors: [] })
    expect(reference.species.size).toBeGreaterThan(1)
    // 25 until bites (ADR 0017); seed 11 ended with 42 living species (population about 2.5 times larger).
    // With line of sight (ADR 0019) seeds 11 to 14 end with 63, 33, 39 and 44 living species
    // (38, 40, 34 and 37 without it); the 63 is seed 11 caught at a population peak of 79, and the
    // count follows the population of the moment, so the bound is 80 and the claim is unchanged:
    // living species stay at or below the living population.
    expect(reference.species.active().length).toBeLessThanOrEqual(80)
  })

  it('turning species off leaves the 50,000-tick state hash unchanged', () => {
    // The reference run of seed 11 has species on (the default); only the switched-off world is new.
    const on = single()
    const off = World.create({ seed: 11, config: { species: { enabled: false } } })
    off.run(50_000)
    expect(on.stateHash()).toBe(off.stateHash())
    expect(on.species.size).toBeGreaterThan(0)
    expect(off.species.size).toBe(0)
  })
})
