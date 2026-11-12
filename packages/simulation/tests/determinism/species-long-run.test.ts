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
    // Colour no longer counts and the body plan does (ADR 0008 addendum): seeds 11 to 14 end with
    // 6, 6, 8 and 7 living species at populations of 79, 50, 53 and 61, so the bound was 20.
    // With every part type reachable (ADR 0016) and the threshold at 0.12 they end with 9, 17, 15
    // and 18 living species at populations of 45, 60, 59 and 70, so the bound is 36, the highest
    // doubled. The claim is unchanged: living species stay well below the living population.
    expect(reference.species.active().length).toBeLessThanOrEqual(36)
    // Time budget: this runs 100,000 ticks (the reference and the chunked world) and timed out at the
    // 180 s default on a Windows CI runner (PR #137, Windows shard 3) while main's own run passed; the
    // budget is the one long-run-validity already uses. What the test asserts is unchanged.
  }, 420_000)

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
