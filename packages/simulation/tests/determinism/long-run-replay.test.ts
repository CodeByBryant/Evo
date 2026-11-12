import { describe, expect, it } from 'vitest'
import { World, buildGeneSpecs, genomeToVector } from '../../src/index'

/**
 * Replays at scale (see long-run-validity.test.ts for how the long-run files fit together): the
 * same seed gives the same world, a different seed a different one, and mutation changes genomes
 * identically each time. With bites (ADR 0017) populations are about 2.5 times larger and a tick
 * about 3 times slower, so these run 40,000 ticks (the same work as 100,000 before); the 100,000
 * tick milestone is in long-run-validity.test.ts.
 *
 * Three tests need seed 55 run twice (or run once and compared with seed 56), so the pair is built
 * once and shared: one pair of 40,000-tick runs, and one more run for seed 56, instead of three
 * pairs.
 */
let pair: { a: World; b: World } | undefined
const seed55 = (): { a: World; b: World } => {
  if (pair === undefined) {
    const a = World.create({ seed: 55, validateEveryTicks: 1000 })
    const b = World.create({ seed: 55, validateEveryTicks: 1000 })
    a.run(40_000)
    b.run(40_000)
    pair = { a, b }
  }
  return pair
}

describe('40,000-tick replays', () => {
  it('the same seed produces an identical hash and snapshot after 40,000 ticks', () => {
    const { a, b } = seed55()
    expect(a.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.snapshot()).toEqual(b.snapshot())
    // Time budget: this builds the shared pair, two 40,000-tick worlds, and timed out at the 180 s
    // default on a Windows CI runner (PR #138, Windows shard 1) with the default world's predation
    // pass in it; the budget is the 420 s long-run-validity uses. What it asserts is unchanged.
  }, 420_000)

  it('a different seed produces a different hash after 40,000 ticks', () => {
    const { a } = seed55()
    const other = World.create({ seed: 56 })
    other.run(40_000)
    expect(a.stateHash()).not.toBe(other.stateHash())
    // One more 40,000-tick run (and the pair, if this test runs first): the same budget.
  }, 420_000)

  it('mutation visibly changes genomes over a long run, identically each time', () => {
    // The default config mutates at every birth, so the same pair also shows mutation: the living
    // genomes differ from the baseline, and the two runs agree on them and on the lineage.
    const { a, b } = seed55()
    const baseline = buildGeneSpecs(a.config).map((spec) => spec.baseline)
    const differing = a
      .snapshot()
      .organisms.filter((o) => genomeToVector(a.genomeOf(o.id)!).some((v, i) => v !== baseline[i]))
    expect(differing.length).toBeGreaterThan(0)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.lineage.size).toBe(b.lineage.size)
  })
})
