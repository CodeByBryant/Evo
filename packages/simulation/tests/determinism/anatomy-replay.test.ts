import { describe, expect, it } from 'vitest'
import { World } from '../../src/world/World'
import { BUSY } from '../support/busy-bodies'

/**
 * Evolving bodies over a long run (ADR 0012). Bodies are derived from genes that are hashed, and
 * development has no randomness, so replays must agree exactly however the run is sliced; and
 * a body that cannot change is the founder body, whose capability factors are exactly 1 (ADR 0015),
 * so anatomy on with a frozen body must not change a single dynamic against anatomy off.
 */
/** How many ticks the one-tick-at-a-time variants run (they are compared with a `run()` world at that tick). */
const STEPPED_TICKS = 10_000

describe('anatomy replay', () => {
  it('50,000 ticks: same seed, same state hash, whether stepped, chunked or run in one go', () => {
    const single = World.create({ seed: 21, config: BUSY, validateEveryTicks: 5_000 })
    single.run(50_000)
    const chunked = World.create({ seed: 21, config: BUSY })
    let hashAtStepped = ''
    for (let i = 1; i <= 10; i++) {
      chunked.run(5_000)
      if (i * 5_000 === STEPPED_TICKS) hashAtStepped = chunked.stateHash()
    }
    // One tick at a time is checked over the first 10,000 ticks, against the hash the chunked world
    // (a `run()` world) had at that tick: body births, mutation and deaths are all in that stretch,
    // and the whole 50,000 stepped one by one would be a third of this test's time again.
    const stepped = World.create({ seed: 21, config: BUSY })
    for (let i = 0; i < STEPPED_TICKS; i++) stepped.step()

    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(stepped.stateHash()).toBe(hashAtStepped)
    expect(single.validate()).toEqual({ ok: true, errors: [] })
  }, 300_000)
})
