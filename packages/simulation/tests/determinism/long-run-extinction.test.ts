import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'
import { ALL_ROUND } from '../support/bodies'
import { withoutEcology } from '../support/ecology'
import { PHASE3_ECONOMY } from '../support/phase3'

/** Extinction is permanent and the lineage outlives it (see long-run-validity.test.ts for how these files fit together). */
describe('extinction over a long run', () => {
  it('extinction, once reached, is never reversed across a long remaining run', () => {
    const world = World.create({
      seed: 1,
      // The Phase 5 world: slower terrain lowers movement cost, which changes how long starvation takes.
      config: withoutEcology({
        organisms: { initialCount: 10 },
        resources: { initialCount: 0, spawnRate: 0 }
      }),
      validateEveryTicks: 1000
    })
    // Starvation takes about 1,100 ticks with this brain (it was just under 1,000 before Phase 6
    // changed each founder brain's shape); the property is permanence, not the exact timing.
    world.run(2000)
    expect(world.isExtinct).toBe(true)
    const extinctionTick = world.snapshot().population.extinctionTick
    // This config starves organisms before any of them ever reach reproduction.minEnergy, so
    // reproduction never even attempts here - see the boom-then-bust test below for the case
    // where reproduction succeeds repeatedly before the population still goes extinct.
    expect(world.snapshot().metrics.reproductionSuccesses).toBe(0)

    world.run(98_000)

    expect(world.snapshot().population.active).toBe(0)
    expect(world.snapshot().population.extinctionTick).toBe(extinctionTick)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('extinction is permanent even after reproduction has already succeeded repeatedly', () => {
    // A population that initially thrives (resources.spawnRate too slow to keep up with a
    // reproducing population) still goes fully and permanently extinct once resources run out -
    // reproduction having worked earlier gives it nothing to revive from once organisms=0.
    const world = World.create({
      seed: 6,
      config: withoutEcology({
        ...PHASE3_ECONOMY,
        // The Phase 3 body: an all-round eye (the founder's own 135 degree cone moved this tick to
        // 18,223; ADR 0016 "The founder sees 135 degrees") and a transparent world (line of sight
        // moved it to 8,610; ADR 0019).
        ...ALL_ROUND,
        perception: { organismsBlockSight: false },
        // And the mutation of that world: parts only step to their neighbour in the list and a
        // woken slot is a latent flagellum (`openTypes: false`, rates 0.004). With every part type
        // reachable (ADR 0016 "Every part type is reachable") this scarce world no longer dies out:
        // 15 to 27 creatures are alive through 100,000 ticks with lipid stores, intestines and
        // pheromone glands among their parts. This test is about extinction, so it keeps the world
        // that goes extinct, and the old mutation reproduces that world's extinction (tick 10,231 for seed 5 before step two).
        anatomy: {
          ...ALL_ROUND.anatomy,
          mutation: { openTypes: false, presenceRate: 0.004, typeRate: 0.004 }
        },
        organisms: { ...PHASE3_ECONOMY.organisms, initialCount: 15 },
        resources: { initialCount: 80, maxCount: 80, spawnRate: 1 },
        // Reflex controller, ecology off: this pin is about the Phase 4 forager. It moved from
        // 11,901 (Phase 4) to 18,482 (Phase 5) to 48,820 (Phase 6) to 8,913 (Phase 7) to 8,305
        // (ADR 0015: bodies are on by default and five scalar genes retired) to 10,231 (ADR 0016:
        // per-type stats and outline anchoring) only because the genome changes how many values the
        // genetics stream draws and what each body can do; the population hovers at 5-10
        // for a long time before the last animals die. It moved once more (ADR 0023 step two): the
        // brain gained eight inputs, so founders draw 64 more weights from the `genetics` stream and
        // every later mutation shifts. Seed 5 then stopped going extinct (14 alive at 60,000 ticks); this
        // scarce world is a knife edge, measured over seeds 1 to 12 at 60,000 ticks: 7 go extinct (at
        // 14,130, 16,430, 19,582, 20,110, 23,431, 31,664 and 47,640) and 5 do not. The test is about
        // extinction, so it uses seed 6, which goes extinct at 19,582 with 28 successful births.
        learning: { controller: 'reflex' },
        // Phase 3's way of eating: with bites (ADR 0017) nothing is wasted and this world no longer dies out.
        feeding: { enabled: false },
        predation: { enabled: false }
      }),
      validateEveryTicks: 1000
    })

    world.run(60_000)
    expect(world.isExtinct).toBe(true)
    expect(world.snapshot().population.extinctionTick).toBe(19_582)
    expect(world.snapshot().metrics.reproductionSuccesses).toBeGreaterThan(0)

    world.run(40_000)

    expect(world.snapshot().population.active).toBe(0)
    expect(world.snapshot().population.extinctionTick).toBe(19_582)
    expect(world.snapshot().organisms).toEqual([])
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('keeps the whole lineage queryable after the population goes extinct', () => {
    const world = World.create({
      seed: 5,
      validateEveryTicks: 1000,
      config: {
        organisms: { initialCount: 15 },
        resources: { initialCount: 80, maxCount: 80, spawnRate: 1 },
        // Phase 3's way of eating: with bites (ADR 0017) nothing is wasted and this world no longer dies out.
        feeding: { enabled: false },
        predation: { enabled: false }
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
