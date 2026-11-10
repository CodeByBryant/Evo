import { describe, expect, it } from 'vitest'
import { World, buildGeneSpecs, genomeToVector } from '../../src/index'

/**
 * The roadmap's first-milestone check, at full scale: a seeded world can run 100,000 ticks
 * headlessly, with no invariant ever violated, and everything downstream of `run()` - hashes,
 * snapshots, chunked replays - stays exactly reproducible. This is deliberately slow and lives
 * outside the default `pnpm test` (see ../../vitest.config.ts); run it with
 * `pnpm test:determinism`.
 *
 * Since Phase 3, every config below reproduces heavily over 100,000 ticks (default economics
 * make that easy to reach), so these same tests now also prove that id allocation and the
 * `'reproduction'` random stream survive chunk and step boundaries exactly - not just the
 * fields Phase 2 already exercised. The explicit `reproductionSuccesses` assertions make that
 * coverage visible rather than incidental.
 *
 * Since Phase 4 the default configuration also mutates every birth, so the same runs exercise the
 * `genetics` stream, genome identity and the lineage store across chunk and step boundaries. The
 * lineage store is deliberately not part of the state hash, so its equivalence is asserted
 * explicitly rather than inherited from the hash comparison.
 *
 * The long determinism runs are split over several files (this one, long-run-replay,
 * long-run-chunking, long-run-population and long-run-extinction) so the CI job can run them in
 * parallel, and a world that two tests would build identically is built once and shared.
 */
describe('100,000-tick runs', () => {
  // The milestone run and the genome-drift check are the same world (seed 1, validated every 500
  // ticks), so it is run once: the first test asserts the milestone, the second reads the same world.
  let hundredThousand: World | undefined
  const longRun = (): World => {
    if (hundredThousand === undefined) {
      const world = World.create({ seed: 1, validateEveryTicks: 500 })
      world.run(100_000)
      hundredThousand = world
    }
    return hundredThousand
  }

  // About 100 s on an idle 4-core machine when this was written, and the 180 s default timed out on a
  // Windows runner running three files at once (PR 129). With every part type reachable (ADR 0016)
  // bodies are richer and it takes 142 s idle: a time budget, not a weaker claim.
  it('runs 100,000 ticks headlessly without ever violating an invariant', () => {
    const world = World.create({ seed: 1, validateEveryTicks: 500 })
    expect(() => world.run(100_000)).not.toThrow()
    hundredThousand = world
    expect(world.clock.tick).toBe(100_000)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  }, 420_000)

  it('keeps every genome valid and every trait mean near baseline over 100,000 ticks', () => {
    // validateEveryTicks runs World.validate(), which checks each living genome against the gene
    // table and brain architecture and each lineage record against its genome, every 500 ticks.
    // This is the world of the test above (same seed, same config), not a second 100,000-tick run.
    const world = longRun()

    const specs = buildGeneSpecs(world.config)
    const genomes = world.snapshot().organisms.map((o) => world.genomeOf(o.id)!)
    expect(genomes.length).toBeGreaterThan(0)
    expect(genomes.length).toBeLessThan(world.config.maxPopulation)
    specs.forEach((spec, i) => {
      const average =
        genomes.reduce((sum, g) => sum + (genomeToVector(g)[i] as number), 0) / genomes.length
      // Drift is bounded: no gene's population mean runs off toward an edge of its range
      // (measured worst case over 100,000 ticks on two seeds: 0.20 of the range width).
      expect(Math.abs(average - spec.baseline) / (spec.max - spec.min)).toBeLessThan(0.35)
    })
    // One lineage record per genome ever created: the founders plus every birth.
    expect(world.lineage.size).toBe(world.snapshot().metrics.organismsBorn)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('keeps every genome valid under heavy mutation pressure', () => {
    // Ten times the default mutation rate and strength is far outside normal use; validity is
    // guaranteed by construction (bounded operators), so no invariant may ever fire.
    const world = World.create({
      seed: 3,
      validateEveryTicks: 250,
      config: { genetics: { mutationRateScale: 10, mutationStrengthScale: 10 } }
    })
    expect(() => world.run(30_000)).not.toThrow()
    expect(world.validate()).toEqual({ ok: true, errors: [] })
    expect(world.lineage.size).toBeGreaterThan(world.config.organisms.initialCount)
  })
})
