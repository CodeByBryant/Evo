import { describe, expect, it } from 'vitest'
import { ConfigValidationError } from '@evo/config'
import { ENGINE_VERSION, World } from '../src/index'

describe('World.create', () => {
  it('exposes an engine version', () => {
    expect(ENGINE_VERSION).toMatch(/^[0-9]+[.][0-9]+[.][0-9]+$/)
  })

  it('creates a world with the resolved default configuration when none is given', () => {
    const world = World.create({ seed: 12345 })
    expect(world.seed).toBe(12345)
    expect(world.config.organisms.initialCount).toBe(20)
    expect(world.clock).toEqual({ tick: 0, time: 0, deltaTime: world.config.timestep })
    expect(world.isExtinct).toBe(false)
  })

  it('rejects an invalid seed', () => {
    expect(() => World.create({ seed: -1 })).toThrow(RangeError)
    expect(() => World.create({ seed: 1.5 })).toThrow(RangeError)
    expect(() => World.create({ seed: 2 ** 32 })).toThrow(RangeError)
  })

  it('surfaces configuration problems as ConfigValidationError, listing every one', () => {
    expect(() =>
      World.create({ seed: 1, config: { timestep: 0, resources: { spawnRate: -1 } } })
    ).toThrow(ConfigValidationError)
    try {
      World.create({ seed: 1, config: { timestep: 0, resources: { spawnRate: -1 } } })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect((error as ConfigValidationError).errors).toEqual([
        'timestep must be greater than zero',
        'resources.spawnRate must be nonnegative'
      ])
    }
  })

  it('rejects an invalid validateEveryTicks', () => {
    expect(() => World.create({ seed: 1, validateEveryTicks: 0 })).toThrow(RangeError)
    expect(() => World.create({ seed: 1, validateEveryTicks: -5 })).toThrow(RangeError)
    expect(() => World.create({ seed: 1, validateEveryTicks: 1.5 })).toThrow(RangeError)
  })

  it('creates exactly the configured initial population, within bounds, in ascending id order', () => {
    const world = World.create({
      seed: 1,
      config: { organisms: { initialCount: 7 }, resources: { initialCount: 13 } }
    })
    const snapshot = world.snapshot()
    expect(snapshot.organisms).toHaveLength(7)
    expect(snapshot.resources).toHaveLength(13)
    expect(snapshot.organisms.map((o) => o.id)).toEqual(
      [...snapshot.organisms.map((o) => o.id)].sort((a, b) => a - b)
    )
    expect(snapshot.resources.map((r) => r.id)).toEqual(
      [...snapshot.resources.map((r) => r.id)].sort((a, b) => a - b)
    )
    for (const organism of snapshot.organisms) {
      expect(organism.energy).toBe(world.config.organisms.initialEnergy)
      expect(organism.age).toBe(0)
      expect(organism.position.x).toBeGreaterThanOrEqual(0)
      expect(organism.position.x).toBeLessThanOrEqual(world.config.environment.width)
    }
    expect(snapshot.metrics.organismsBorn).toBe(7)
    expect(snapshot.metrics.resourcesSpawned).toBe(13)
    expect(world.events.emittedCount).toBe(20)
  })

  it('accepts a world with zero initial organisms or resources', () => {
    const world = World.create({
      seed: 1,
      config: { organisms: { initialCount: 0 }, resources: { initialCount: 0 } }
    })
    expect(world.snapshot().organisms).toEqual([])
    expect(world.isExtinct).toBe(true)
    expect(world.snapshot().population.extinctionTick).toBe(0)
  })
})

describe('determinism', () => {
  it('two worlds created with the same seed and config produce identical hashes after identical runs', () => {
    const a = World.create({ seed: 4242 })
    const b = World.create({ seed: 4242 })
    expect(a.stateHash()).toBe(b.stateHash())
    a.run(1000)
    b.run(1000)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.snapshot()).toEqual(b.snapshot())
  })

  it('different seeds produce different hashes', () => {
    const a = World.create({ seed: 1 })
    const b = World.create({ seed: 2 })
    a.run(500)
    b.run(500)
    expect(a.stateHash()).not.toBe(b.stateHash())
  })

  it('stateHash() is pure: calling it repeatedly without stepping never changes the result', () => {
    const world = World.create({ seed: 5 })
    world.run(10)
    const hash = world.stateHash()
    expect(world.stateHash()).toBe(hash)
    expect(world.stateHash()).toBe(hash)
  })

  it('stepping changes the hash', () => {
    const world = World.create({ seed: 5 })
    const before = world.stateHash()
    world.step()
    expect(world.stateHash()).not.toBe(before)
  })

  it('running in two chunks matches running the same total in one call', () => {
    const chunked = World.create({ seed: 777, config: { organisms: { initialCount: 15 } } })
    chunked.run(137)
    chunked.run(163)

    const direct = World.create({ seed: 777, config: { organisms: { initialCount: 15 } } })
    direct.run(300)

    expect(chunked.stateHash()).toBe(direct.stateHash())
    expect(chunked.snapshot()).toEqual(direct.snapshot())
  })

  it('rejects a non-integer or negative step count', () => {
    const world = World.create({ seed: 1 })
    expect(() => world.run(-1)).toThrow(RangeError)
    expect(() => world.run(1.5)).toThrow(RangeError)
  })
})

describe('snapshot()', () => {
  it('is an independent deep copy: mutating it never affects the world', () => {
    const world = World.create({ seed: 1 })
    world.run(5)
    const snapshot = world.snapshot()
    const organism = snapshot.organisms[0]
    if (organism) {
      ;(organism as { energy: number }).energy = -99999
      ;(organism.position as { x: number }).x = -99999
    }
    const again = world.snapshot()
    expect(again.organisms[0]?.energy).not.toBe(-99999)
    expect(again.organisms[0]?.position.x).not.toBe(-99999)
  })

  it('reports population and metrics consistent with the live world', () => {
    const world = World.create({ seed: 1, config: { organisms: { initialCount: 10 } } })
    world.run(50)
    const snapshot = world.snapshot()
    expect(snapshot.population.active).toBe(snapshot.organisms.length)
    expect(snapshot.tick).toBe(50)
    expect(snapshot.time).toBeCloseTo(50 * world.config.timestep, 10)
  })
})

describe('validate()', () => {
  it('reports no violations for a healthy, long-running world', () => {
    const world = World.create({ seed: 1, validateEveryTicks: 50 })
    world.run(2000)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})

describe('scenario A: stable foraging (roadmap testing scenario A)', () => {
  // 10 organisms, 100 resources (the default), no hazards, fixed seed.
  it('some organisms find food, some starve, and the world stays valid throughout', () => {
    const world = World.create({
      seed: 1,
      config: { organisms: { initialCount: 10 } },
      validateEveryTicks: 100
    })

    world.run(5000)
    const snapshot = world.snapshot()

    // Pinned exact values: this scenario is fully deterministic for this seed/config/duration.
    expect(snapshot.population.active).toBe(6)
    expect(snapshot.metrics.deathsByStarvation).toBe(4)
    expect(snapshot.metrics.deathsByAge).toBe(0)
    expect(snapshot.population.extinctionTick).toBeNull()

    // Non-pinned properties any correct implementation must satisfy:
    expect(snapshot.metrics.resourcesConsumed).toBeGreaterThan(0)
    expect(snapshot.metrics.energyConsumed).toBeGreaterThan(0)
    expect(world.validate().ok).toBe(true)
    expect(world.events.list().some((event) => event.type === 'resource-consumed')).toBe(true)
    expect(
      world.events
        .list()
        .some((event) => event.type === 'organism-died' && event.cause === 'starvation')
    ).toBe(true)
  })
})

describe('scenario B: extinction (roadmap testing scenario B)', () => {
  // 10 organisms, 0 resources, recovery disabled (the only implemented policy is 'stop').
  it('the population goes fully extinct and never silently recovers', () => {
    const world = World.create({
      seed: 1,
      config: {
        organisms: { initialCount: 10 },
        resources: { initialCount: 0, spawnRate: 0 }
      },
      validateEveryTicks: 100
    })

    // Juveniles pay a reduced metabolic cost (juvenileMetabolicScale), and this whole run stays
    // juvenile (organisms.maturityAge is 90 simulated seconds; the run ends well before that in
    // ticks but the age unit is seconds, not ticks - at timestep 0.1 that's tick 900), so
    // extinction takes longer than a single-cost-term formula would predict.
    world.run(900)
    expect(world.snapshot().population.active).toBe(0)
    expect(world.isExtinct).toBe(true)
    expect(world.snapshot().population.extinctionTick).toBe(845)
    expect(world.snapshot().metrics.deathsByStarvation).toBe(10)

    // Run far past extinction: no hidden organism ever appears, extinctionTick never changes.
    world.run(5000)
    const snapshot = world.snapshot()
    expect(snapshot.population.active).toBe(0)
    expect(snapshot.population.extinctionTick).toBe(845)
    expect(snapshot.organisms).toEqual([])
    expect(world.validate().ok).toBe(true)
  })
})

describe('events', () => {
  it('are recorded during a run and can be listed and counted', () => {
    const world = World.create({ seed: 1, config: { organisms: { initialCount: 5 } } })
    world.run(200)
    expect(world.events.emittedCount).toBeGreaterThan(0)
    expect(world.events.list().length).toBeGreaterThan(0)
    expect(world.events.list().length).toBeLessThanOrEqual(world.config.history.maxEvents)
  })

  it('never emits verbose-only events at the default (essential) detail level', () => {
    const world = World.create({ seed: 1, config: { organisms: { initialCount: 5 } } })
    world.run(200)
    expect(
      world.events.list().some((e) => e.type === 'organism-moved' || e.type === 'energy-changed')
    ).toBe(false)
  })

  it('emits verbose events when history.eventDetail is verbose', () => {
    const world = World.create({
      seed: 1,
      config: {
        organisms: { initialCount: 5 },
        history: { maxEvents: 100000, eventDetail: 'verbose' }
      }
    })
    world.run(50)
    expect(world.events.list().some((e) => e.type === 'organism-moved')).toBe(true)
  })
})
