import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'

/**
 * Chunking and stepping at scale (see long-run-validity.test.ts for how the long-run files fit
 * together). One world of seed 7 is run in a single `run(40_000)`, and the others are compared with
 * it: two uneven chunks, forty chunks of a thousand, and one tick at a time.
 *
 * `run(n)` is `step()` n times, so the one-tick-at-a-time variant differs from a single call only
 * where a boundary could matter; it is checked over the first 10,000 ticks against the hash the
 * forty-chunk world had at that tick (a `run()` world, not the step-by-step one), which covers
 * births, deaths and mutation, instead of repeating the whole 40,000. The two chunked variants and
 * the single run stay at full length.
 */
const CONFIG = { organisms: { initialCount: 10 } }
const TICKS = 40_000
const STEPPED_TICKS = 10_000

let direct: World | undefined
const single = (): World => {
  if (direct === undefined) {
    direct = World.create({ seed: 7, config: CONFIG })
    direct.run(TICKS)
  }
  return direct
}

let small: { world: World; hashAtStepped: string; successesAtStepped: number } | undefined
const manyChunks = (): NonNullable<typeof small> => {
  if (small === undefined) {
    const world = World.create({ seed: 7, config: CONFIG })
    let hashAtStepped = ''
    let successesAtStepped = 0
    for (let i = 1; i <= TICKS / 1000; i++) {
      world.run(1000)
      if (i * 1000 === STEPPED_TICKS) {
        hashAtStepped = world.stateHash()
        successesAtStepped = world.snapshot().metrics.reproductionSuccesses
      }
    }
    small = { world, hashAtStepped, successesAtStepped }
  }
  return small
}

describe('40,000-tick chunking', () => {
  it('running in two uneven chunks matches a single run of the same total, at scale', () => {
    const chunked = World.create({ seed: 7, config: CONFIG })
    chunked.run(14_965)
    chunked.run(25_035)
    const direct = single()

    // Reproduction allocates ids and draws from the 'reproduction' stream mid-run; this config
    // reproduces heavily by 40,000 ticks, so a mismatched chunk boundary around a birth would
    // show up here as a hash divergence, not just a tick-count coincidence.
    expect(chunked.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(chunked.clock.tick).toBe(direct.clock.tick)
    expect(chunked.stateHash()).toBe(direct.stateHash())
    expect(chunked.snapshot()).toEqual(direct.snapshot())

    // The lineage store is not hashed, so chunking must be shown not to disturb it directly.
    expect(chunked.lineage.size).toBe(direct.lineage.size)
    expect(chunked.lineage.size).toBeGreaterThan(chunked.config.organisms.initialCount)
    expect(chunked.lineage.founders()).toEqual(direct.lineage.founders())
    const last = chunked.lineage.size - 1
    expect(chunked.lineage.record(last)).toEqual(direct.lineage.record(last))
    expect(chunked.lineage.ancestorsOf(last)).toEqual(direct.lineage.ancestorsOf(last))
    expect(chunked.historicalOrganisms()).toEqual(direct.historicalOrganisms())
  })

  it('running in many small chunks still matches a single run of the same total', () => {
    const { world: chunked } = manyChunks()
    const direct = single()
    expect(chunked.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(chunked.stateHash()).toBe(direct.stateHash())
  })

  it('stepping one tick at a time matches run() for the same total', () => {
    const { hashAtStepped, successesAtStepped } = manyChunks()
    const stepped = World.create({ seed: 7, config: CONFIG })
    for (let i = 0; i < STEPPED_TICKS; i++) stepped.step()

    expect(stepped.clock.tick).toBe(STEPPED_TICKS)
    expect(stepped.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(stepped.snapshot().metrics.reproductionSuccesses).toBe(successesAtStepped)
    expect(stepped.stateHash()).toBe(hashAtStepped)
  })
})
