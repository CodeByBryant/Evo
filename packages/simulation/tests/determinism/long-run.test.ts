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
 */
describe('100,000-tick runs', () => {
  it('runs 100,000 ticks headlessly without ever violating an invariant', () => {
    const world = World.create({ seed: 12345, validateEveryTicks: 500 })
    expect(() => world.run(100_000)).not.toThrow()
    expect(world.clock.tick).toBe(100_000)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('the same seed produces an identical hash and snapshot after 100,000 ticks', () => {
    const a = World.create({ seed: 55, validateEveryTicks: 1000 })
    const b = World.create({ seed: 55, validateEveryTicks: 1000 })
    a.run(100_000)
    b.run(100_000)
    expect(a.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.snapshot()).toEqual(b.snapshot())
  })

  it('a different seed produces a different hash after 100,000 ticks', () => {
    const a = World.create({ seed: 55 })
    const b = World.create({ seed: 56 })
    a.run(100_000)
    b.run(100_000)
    expect(a.stateHash()).not.toBe(b.stateHash())
  })

  it('running in two uneven chunks matches a single run of the same total, at scale', () => {
    const chunked = World.create({ seed: 314159, config: { organisms: { initialCount: 30 } } })
    chunked.run(37_412)
    chunked.run(62_588)

    const direct = World.create({ seed: 314159, config: { organisms: { initialCount: 30 } } })
    direct.run(100_000)

    // Reproduction allocates ids and draws from the 'reproduction' stream mid-run; this config
    // reproduces heavily by 100,000 ticks, so a mismatched chunk boundary around a birth would
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

  it('mutation visibly changes genomes over a long run, identically each time', () => {
    const run = (): World => {
      const world = World.create({ seed: 77, validateEveryTicks: 1000 })
      world.run(30_000)
      return world
    }
    const a = run()
    const b = run()
    const baseline = buildGeneSpecs(a.config).map((spec) => spec.baseline)
    const differing = a
      .snapshot()
      .organisms.filter((o) => genomeToVector(a.genomeOf(o.id)!).some((v, i) => v !== baseline[i]))
    expect(differing.length).toBeGreaterThan(0)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.lineage.size).toBe(b.lineage.size)
  })

  it('running in many small chunks still matches a single run of the same total', () => {
    const chunked = World.create({ seed: 7, config: { organisms: { initialCount: 10 } } })
    for (let i = 0; i < 100; i++) chunked.run(1000)

    const direct = World.create({ seed: 7, config: { organisms: { initialCount: 10 } } })
    direct.run(100_000)

    expect(chunked.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(chunked.stateHash()).toBe(direct.stateHash())
  })

  it('stepping one tick at a time matches run() for the same total', () => {
    const stepped = World.create({ seed: 42, config: { organisms: { initialCount: 5 } } })
    for (let i = 0; i < 20_000; i++) stepped.step()

    const ran = World.create({ seed: 42, config: { organisms: { initialCount: 5 } } })
    ran.run(20_000)

    expect(stepped.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(stepped.stateHash()).toBe(ran.stateHash())
  })

  it('sustains a bounded population over 50,000 ticks (roadmap: sustained population)', () => {
    // Default config, no overrides: population must neither collapse nor run away toward
    // maxPopulation over a long run - this is what "the engine can sustain a population for a
    // long simulated period" (roadmap Phase 3 exit criteria) means in practice.
    const world = World.create({ seed: 1, validateEveryTicks: 1000 })
    const samples: number[] = []
    for (let i = 0; i < 50; i++) {
      world.run(1000)
      samples.push(world.snapshot().population.active)
    }

    expect(world.isExtinct).toBe(false)
    const backHalf = samples.slice(25)
    for (const active of backHalf) {
      expect(active).toBeGreaterThanOrEqual(15)
      expect(active).toBeLessThanOrEqual(40)
    }
    expect(world.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('keeps every genome valid and every trait mean near baseline over 100,000 ticks', () => {
    // validateEveryTicks runs World.validate(), which checks each living genome against the gene
    // table and brain architecture and each lineage record against its genome, every 500 ticks.
    const world = World.create({ seed: 1, validateEveryTicks: 500 })
    world.run(100_000)

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

  it('extinction, once reached, is never reversed across a long remaining run', () => {
    const world = World.create({
      seed: 1,
      config: {
        organisms: { initialCount: 10 },
        resources: { initialCount: 0, spawnRate: 0 }
      },
      validateEveryTicks: 1000
    })
    world.run(1000)
    expect(world.isExtinct).toBe(true)
    const extinctionTick = world.snapshot().population.extinctionTick
    // This config starves organisms before any of them ever reach reproduction.minEnergy, so
    // reproduction never even attempts here - see the boom-then-bust test below for the case
    // where reproduction succeeds repeatedly before the population still goes extinct.
    expect(world.snapshot().metrics.reproductionSuccesses).toBe(0)

    world.run(99_000)

    expect(world.snapshot().population.active).toBe(0)
    expect(world.snapshot().population.extinctionTick).toBe(extinctionTick)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('extinction is permanent even after reproduction has already succeeded repeatedly', () => {
    // A population that initially thrives (resources.spawnRate too slow to keep up with a
    // reproducing population) still goes fully and permanently extinct once resources run out -
    // reproduction having worked earlier gives it nothing to revive from once organisms=0.
    const world = World.create({
      seed: 5,
      config: {
        organisms: { initialCount: 15 },
        resources: { initialCount: 80, maxCount: 80, spawnRate: 1 },
        // Reflex controller: this pin is about the Phase 4 forager. It moved from 11,901 only
        // because the larger genome draws more founder weights from the genetics stream.
        learning: { controller: 'reflex' }
      },
      validateEveryTicks: 1000
    })

    world.run(20_000)
    expect(world.isExtinct).toBe(true)
    expect(world.snapshot().population.extinctionTick).toBe(18_482)
    expect(world.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)

    world.run(80_000)

    expect(world.snapshot().population.active).toBe(0)
    expect(world.snapshot().population.extinctionTick).toBe(18_482)
    expect(world.snapshot().organisms).toEqual([])
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('keeps the whole lineage queryable after the population goes extinct', () => {
    const world = World.create({
      seed: 5,
      validateEveryTicks: 1000,
      config: {
        organisms: { initialCount: 15 },
        resources: { initialCount: 80, maxCount: 80, spawnRate: 1 }
      }
    })
    world.run(20_000)
    expect(world.isExtinct).toBe(true)

    const size = world.lineage.size
    expect(size).toBeGreaterThan(world.config.organisms.initialCount)
    // Every founder lineage has died out, yet every record and ancestry link is still there.
    for (const founder of world.lineage.founders()) {
      expect(world.lineage.isLineageExtinct(founder)).toBe(true)
      expect(world.lineage.record(founder)).toBeDefined()
    }
    const records = world.historicalOrganisms()
    expect(records.length).toBe(size)
    for (const record of records) {
      const lineage = world.lineage.record(record.genomeId)
      expect(lineage).toBeDefined()
      for (const parent of lineage!.parentGenomeIds) {
        expect(world.lineage.record(parent)).toBeDefined()
      }
    }
    const newest = records[records.length - 1]!
    if (newest.parentIds.length > 0) {
      expect(world.lineage.ancestorsOf(newest.genomeId).length).toBeGreaterThan(0)
    }

    // And extinction adds nothing: the lineage is frozen from here on.
    world.run(80_000)
    expect(world.lineage.size).toBe(size)
    for (const founder of world.lineage.founders()) {
      expect(world.lineage.isLineageExtinct(founder)).toBe(true)
    }
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})
