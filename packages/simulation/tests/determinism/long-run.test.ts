import { describe, expect, it } from 'vitest'
import { World } from '../../src/index'

/**
 * The roadmap's first-milestone check, at full scale: a seeded world can run 100,000 ticks
 * headlessly, with no invariant ever violated, and everything downstream of `run()` - hashes,
 * snapshots, chunked replays - stays exactly reproducible. This is deliberately slow and lives
 * outside the default `pnpm test` (see ../../vitest.config.ts); run it with
 * `pnpm test:determinism`.
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

    expect(chunked.clock.tick).toBe(direct.clock.tick)
    expect(chunked.stateHash()).toBe(direct.stateHash())
    expect(chunked.snapshot()).toEqual(direct.snapshot())
  })

  it('running in many small chunks still matches a single run of the same total', () => {
    const chunked = World.create({ seed: 7, config: { organisms: { initialCount: 10 } } })
    for (let i = 0; i < 100; i++) chunked.run(1000)

    const direct = World.create({ seed: 7, config: { organisms: { initialCount: 10 } } })
    direct.run(100_000)

    expect(chunked.stateHash()).toBe(direct.stateHash())
  })

  it('stepping one tick at a time matches run() for the same total', () => {
    const stepped = World.create({ seed: 42, config: { organisms: { initialCount: 5 } } })
    for (let i = 0; i < 20_000; i++) stepped.step()

    const ran = World.create({ seed: 42, config: { organisms: { initialCount: 5 } } })
    ran.run(20_000)

    expect(stepped.stateHash()).toBe(ran.stateHash())
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

    world.run(99_000)

    expect(world.snapshot().population.active).toBe(0)
    expect(world.snapshot().population.extinctionTick).toBe(extinctionTick)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})
