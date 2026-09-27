import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { PerceptionBuffer, IntentBuffer } from '../src/buffers/types'
import { IdGenerator } from '../src/entities/IdGenerator'
import { OrganismStore } from '../src/entities/OrganismStore'
import type { OrganismState } from '../src/entities/OrganismStore'
import { ResourceStore } from '../src/entities/ResourceStore'
import type { ResourceState } from '../src/entities/ResourceStore'
import { EventLog } from '../src/events/EventLog'
import { atan2 } from '../src/math/trig'
import { SeededRandom } from '../src/random/SeededRandom'
import { deriveStreamWords } from '../src/random/streams'
import { SpatialHash } from '../src/spatial/SpatialHash'
import { DeathSystem } from '../src/systems/DeathSystem'
import { DecisionSystem } from '../src/systems/DecisionSystem'
import { EnvironmentSystem } from '../src/systems/EnvironmentSystem'
import { InteractionSystem } from '../src/systems/InteractionSystem'
import { MetabolismSystem } from '../src/systems/MetabolismSystem'
import { MovementSystem } from '../src/systems/MovementSystem'
import { PerceptionSystem } from '../src/systems/PerceptionSystem'
import { ReproductionSystem } from '../src/systems/ReproductionSystem'

const stream = (seed: number, name: Parameters<typeof deriveStreamWords>[1]) =>
  new SeededRandom(deriveStreamWords(seed, name))

const organism = (id: number, overrides: Partial<OrganismState> = {}): OrganismState => ({
  id,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  heading: 0,
  age: 0,
  energy: 50,
  parentIds: [],
  birthTick: 0,
  reproductionCooldownRemaining: 0,
  lastTurnMagnitude: 0,
  ...overrides
})

const resource = (id: number, overrides: Partial<ResourceState> = {}): ResourceState => ({
  id,
  x: 0,
  y: 0,
  remaining: 30,
  ...overrides
})

const makeResourceIndex = (): SpatialHash<ResourceState> =>
  new SpatialHash<ResourceState>(60, (r) => r)

describe('EnvironmentSystem', () => {
  it('spawnInitial creates exactly resources.initialCount resources within bounds', () => {
    const config = resolveWorldConfig({
      environment: { width: 50, height: 50 },
      resources: { initialCount: 5, maxCount: 100 }
    })
    const resources = new ResourceStore()
    const events = new EventLog(100)
    events.beginTick()
    const system = new EnvironmentSystem(
      config,
      resources,
      new IdGenerator(),
      stream(1, 'environment'),
      events
    )
    system.spawnInitial(0)

    expect(resources.size).toBe(5)
    for (const r of resources.values()) {
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.x).toBeLessThanOrEqual(50)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeLessThanOrEqual(50)
      expect(r.remaining).toBe(config.resources.energyValue)
    }
    expect(events.eventsThisTick()).toHaveLength(5)
    expect(
      events.eventsThisTick().every((e) => e.type === 'resource-spawned' && e.tick === 0)
    ).toBe(true)
  })

  it('never spawns beyond resources.maxCount', () => {
    const config = resolveWorldConfig({
      resources: { initialCount: 0, maxCount: 3, spawnRate: 1000 }
    })
    const resources = new ResourceStore()
    const events = new EventLog(1000)
    const system = new EnvironmentSystem(
      config,
      resources,
      new IdGenerator(),
      stream(1, 'environment'),
      events
    )
    for (let tick = 1; tick <= 10; tick++) {
      events.beginTick()
      system.update(tick)
    }
    expect(resources.size).toBe(3)
  })

  it('accumulates fractional spawn rate deterministically (spawnRate 0.5, timestep 1 -> one every two ticks)', () => {
    const config = resolveWorldConfig({
      timestep: 1,
      resources: { initialCount: 0, maxCount: 1000, spawnRate: 0.5 }
    })
    const resources = new ResourceStore()
    const events = new EventLog(1000)
    const system = new EnvironmentSystem(
      config,
      resources,
      new IdGenerator(),
      stream(1, 'environment'),
      events
    )
    const counts: number[] = []
    for (let tick = 1; tick <= 6; tick++) {
      events.beginTick()
      system.update(tick)
      counts.push(resources.size)
    }
    expect(counts).toEqual([0, 1, 1, 2, 2, 3])
  })
})

describe('PerceptionSystem', () => {
  it('finds the nearest resource within sensor range and null otherwise', () => {
    const config = resolveWorldConfig({ organisms: { sensorRadius: 10 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0 }))
    organisms.add(organism(2, { x: 100, y: 100 }))
    const resources = new ResourceStore()
    resources.add(resource(1, { x: 5, y: 0 }))
    resources.add(resource(2, { x: 3, y: 0 }))
    const index = makeResourceIndex()
    index.rebuild(resources.values())
    const buffer: PerceptionBuffer = new Map()

    new PerceptionSystem(config, organisms, index, buffer).update()

    expect(buffer.get(1)?.resourceId).toBe(2)
    expect(buffer.get(2)).toBeNull()
  })

  it('clears stale entries for organisms that no longer exist', () => {
    const config = resolveWorldConfig({ organisms: { sensorRadius: 10 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1))
    const index = makeResourceIndex()
    index.rebuild([])
    const buffer: PerceptionBuffer = new Map([[99, null]])

    new PerceptionSystem(config, organisms, index, buffer).update()

    expect(buffer.has(99)).toBe(false)
    expect(buffer.has(1)).toBe(true)
  })
})

describe('DecisionSystem', () => {
  it('seeks directly toward a perceived resource with zero turn error', () => {
    const config = resolveWorldConfig()
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0, heading: 0 }))
    const perceptionBuffer: PerceptionBuffer = new Map([
      [1, { resourceId: 1, position: { x: 10, y: 0 }, distanceSquared: 100 }]
    ])
    const intentBuffer: IntentBuffer = new Map()

    new DecisionSystem(
      config,
      organisms,
      perceptionBuffer,
      intentBuffer,
      stream(1, 'world')
    ).update()

    const intent = intentBuffer.get(1)
    expect(intent?.thrust).toBe(1)
    expect(intent?.turn).toBeCloseTo(0, 12)
  })

  it('computes the correct signed turn toward an off-axis resource', () => {
    const config = resolveWorldConfig()
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0, heading: 0 }))
    const perceptionBuffer: PerceptionBuffer = new Map([
      [1, { resourceId: 1, position: { x: 0, y: 10 }, distanceSquared: 100 }]
    ])
    const intentBuffer: IntentBuffer = new Map()

    new DecisionSystem(
      config,
      organisms,
      perceptionBuffer,
      intentBuffer,
      stream(1, 'world')
    ).update()

    expect(intentBuffer.get(1)?.turn).toBeCloseTo(atan2(10, 0), 12)
  })

  it('wanders with a bounded, RNG-driven turn and half thrust when nothing is perceived', () => {
    const config = resolveWorldConfig({ organisms: { wanderJitter: 2 }, timestep: 0.5 })
    const organisms = new OrganismStore()
    organisms.add(organism(1))
    const perceptionBuffer: PerceptionBuffer = new Map([[1, null]])
    const intentBuffer: IntentBuffer = new Map()

    new DecisionSystem(
      config,
      organisms,
      perceptionBuffer,
      intentBuffer,
      stream(1, 'world')
    ).update()

    const intent = intentBuffer.get(1)
    expect(intent?.thrust).toBe(0.5)
    expect(Math.abs(intent?.turn ?? Infinity)).toBeLessThanOrEqual(2 * 0.5)
  })

  it('is deterministic given the same random stream state', () => {
    const config = resolveWorldConfig()
    const run = () => {
      const organisms = new OrganismStore()
      organisms.add(organism(1))
      const perceptionBuffer: PerceptionBuffer = new Map([[1, null]])
      const intentBuffer: IntentBuffer = new Map()
      new DecisionSystem(
        config,
        organisms,
        perceptionBuffer,
        intentBuffer,
        stream(7, 'world')
      ).update()
      return intentBuffer.get(1)
    }
    expect(run()).toEqual(run())
  })
})

describe('MovementSystem', () => {
  it('clamps turning to maxTurnRate * timestep', () => {
    const config = resolveWorldConfig({ organisms: { maxTurnRate: 1, maxSpeed: 0 }, timestep: 0.5 })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { heading: 0 }))
    const intentBuffer: IntentBuffer = new Map([[1, { turn: 10, thrust: 0 }]])
    const events = new EventLog(10)
    events.beginTick()

    new MovementSystem(config, organisms, intentBuffer, events).update(1)

    expect(organisms.get(1)?.heading).toBeCloseTo(0.5, 12)
  })

  it('derives velocity from heading and thrust, scaled by maxSpeed', () => {
    const config = resolveWorldConfig({ organisms: { maxSpeed: 10, maxTurnRate: 100 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { heading: 0, age: 100 }))
    const intentBuffer: IntentBuffer = new Map([[1, { turn: 0, thrust: 0.5 }]])
    const events = new EventLog(10)
    events.beginTick()

    new MovementSystem(config, organisms, intentBuffer, events).update(1)

    const moved = organisms.get(1)
    expect(moved?.vx).toBeCloseTo(5, 10)
    expect(moved?.vy).toBeCloseTo(0, 10)
  })

  it('scales maxSpeed by juvenileSpeedScale for juveniles', () => {
    const config = resolveWorldConfig({
      organisms: { maxSpeed: 10, maxTurnRate: 100, maturityAge: 90, juvenileSpeedScale: 0.4 }
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { heading: 0, age: 1 }))
    const intentBuffer: IntentBuffer = new Map([[1, { turn: 0, thrust: 1 }]])
    const events = new EventLog(10)
    events.beginTick()

    new MovementSystem(config, organisms, intentBuffer, events).update(1)

    expect(organisms.get(1)?.vx).toBeCloseTo(4, 10)
  })

  it('records the clamped turn magnitude as lastTurnMagnitude', () => {
    const config = resolveWorldConfig({ organisms: { maxTurnRate: 1 }, timestep: 0.5 })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { heading: 0 }))
    const intentBuffer: IntentBuffer = new Map([[1, { turn: -10, thrust: 0 }]])
    const events = new EventLog(10)
    events.beginTick()

    new MovementSystem(config, organisms, intentBuffer, events).update(1)

    expect(organisms.get(1)?.lastTurnMagnitude).toBeCloseTo(0.5, 12)
  })

  it('clamps position to the world rectangle', () => {
    const config = resolveWorldConfig({
      environment: { width: 100, height: 100 },
      organisms: { maxSpeed: 1000, maxTurnRate: 100 },
      timestep: 10
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 90, y: 5, heading: 0 }))
    const intentBuffer: IntentBuffer = new Map([[1, { turn: 0, thrust: 1 }]])
    const events = new EventLog(10)
    events.beginTick()

    new MovementSystem(config, organisms, intentBuffer, events).update(1)

    expect(organisms.get(1)?.x).toBe(100)
  })

  it('treats a missing intent as "do nothing" rather than throwing', () => {
    const config = resolveWorldConfig()
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 5, y: 5 }))
    const events = new EventLog(10)
    events.beginTick()
    expect(() => new MovementSystem(config, organisms, new Map(), events).update(1)).not.toThrow()
  })

  it('emits organism-moved only when history.eventDetail is verbose', () => {
    const essential = resolveWorldConfig({ history: { maxEvents: 10, eventDetail: 'essential' } })
    const verbose = resolveWorldConfig({ history: { maxEvents: 10, eventDetail: 'verbose' } })
    for (const [config, expected] of [
      [essential, 0],
      [verbose, 1]
    ] as const) {
      const organisms = new OrganismStore()
      organisms.add(organism(1))
      const intentBuffer: IntentBuffer = new Map([[1, { turn: 0, thrust: 1 }]])
      const events = new EventLog(10)
      events.beginTick()
      new MovementSystem(config, organisms, intentBuffer, events).update(1)
      expect(events.eventsThisTick()).toHaveLength(expected)
    }
  })
})

describe('InteractionSystem', () => {
  it('consumes the nearest resource, gaining energy up to maxEnergy', () => {
    const config = resolveWorldConfig({
      organisms: { radius: 1, maxEnergy: 60 },
      resources: { radius: 1 }
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0, energy: 50, age: 100 }))
    const resources = new ResourceStore()
    resources.add(resource(1, { x: 1, y: 0, remaining: config.resources.energyValue }))
    const index = makeResourceIndex()
    index.rebuild(resources.values())
    const events = new EventLog(10)
    events.beginTick()

    new InteractionSystem(config, organisms, resources, index, events).update(1)

    expect(resources.has(1)).toBe(false)
    const eaten = organisms.get(1)
    expect(eaten?.energy).toBe(60)
    const [event] = events.eventsThisTick()
    expect(event).toMatchObject({
      type: 'resource-consumed',
      organismId: 1,
      resourceId: 1,
      energyGained: 10,
      energyWasted: config.resources.energyValue - 10
    })
  })

  it('scales capture radius and effective maxEnergy by juvenileSizeScale for juveniles', () => {
    const config = resolveWorldConfig({
      organisms: { radius: 2, maxEnergy: 100, maturityAge: 90, juvenileSizeScale: 0.5 },
      resources: { radius: 1 }
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 2.5, y: 0, energy: 40, age: 1 }))
    const resources = new ResourceStore()
    resources.add(resource(1, { x: 0, y: 0, remaining: config.resources.energyValue }))
    const index = makeResourceIndex()
    index.rebuild(resources.values())
    const events = new EventLog(10)
    events.beginTick()

    // Juvenile capture radius is (2 * 0.5) + 1 = 2, so a resource 2.5 away is out of reach
    // (a mature organism's radius of (2 * 1) + 1 = 3 would have reached it).
    new InteractionSystem(config, organisms, resources, index, events).update(1)
    expect(organisms.get(1)?.energy).toBe(40)
    expect(resources.has(1)).toBe(true)
  })

  it('never lets two organisms consume the same resource in one tick', () => {
    const config = resolveWorldConfig({ organisms: { radius: 5 }, resources: { radius: 5 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0, energy: 10 }))
    organisms.add(organism(2, { x: 1, y: 0, energy: 10 }))
    const resources = new ResourceStore()
    resources.add(resource(1, { x: 0.5, y: 0 }))
    const index = makeResourceIndex()
    index.rebuild(resources.values())
    const events = new EventLog(10)
    events.beginTick()

    new InteractionSystem(config, organisms, resources, index, events).update(1)

    expect(resources.size).toBe(0)
    const consumedEvents = events.eventsThisTick().filter((e) => e.type === 'resource-consumed')
    expect(consumedEvents).toHaveLength(1)
    // Both organisms are equidistant from the resource; organisms are processed in ascending id
    // order, so the lower id (1) wins and organism 2 gets nothing.
    expect(consumedEvents[0]).toMatchObject({ organismId: 1 })
    expect(organisms.get(2)?.energy).toBe(10)
  })

  it('leaves an organism unfed when nothing is within its capture radius', () => {
    const config = resolveWorldConfig({ organisms: { radius: 1 }, resources: { radius: 1 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0, energy: 10 }))
    const resources = new ResourceStore()
    resources.add(resource(1, { x: 1000, y: 0 }))
    const index = makeResourceIndex()
    index.rebuild(resources.values())
    const events = new EventLog(10)
    events.beginTick()

    new InteractionSystem(config, organisms, resources, index, events).update(1)

    expect(resources.size).toBe(1)
    expect(organisms.get(1)?.energy).toBe(10)
    expect(events.eventsThisTick()).toHaveLength(0)
  })

  it('emits energy-changed only when history.eventDetail is verbose', () => {
    const config = resolveWorldConfig({
      organisms: { radius: 1, maxEnergy: 1000 },
      resources: { radius: 1 },
      history: { maxEvents: 10, eventDetail: 'verbose' }
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { x: 0, y: 0 }))
    const resources = new ResourceStore()
    resources.add(resource(1, { x: 0, y: 0 }))
    const index = makeResourceIndex()
    index.rebuild(resources.values())
    const events = new EventLog(10)
    events.beginTick()

    new InteractionSystem(config, organisms, resources, index, events).update(1)

    expect(events.eventsThisTick().map((e) => e.type)).toEqual([
      'resource-consumed',
      'energy-changed'
    ])
  })
})

describe('MetabolismSystem', () => {
  it('charges basalCost + movementCost * speed^2, scaled by timestep', () => {
    const config = resolveWorldConfig({
      organisms: { basalCost: 1, movementCost: 0.1, turningCost: 0, sensorCost: 0 },
      timestep: 2
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { vx: 3, vy: 4, energy: 100, age: 100 }))
    const events = new EventLog(10)
    events.beginTick()

    new MetabolismSystem(config, organisms, events).update(1)

    const speedSquared = 3 * 3 + 4 * 4
    const expectedCost = (1 + 0.1 * speedSquared) * 2
    const updated = organisms.get(1)
    expect(updated?.energy).toBeCloseTo(100 - expectedCost, 12)
    expect(updated?.age).toBeCloseTo(100 + 2, 12)
  })

  it('adds turningCost * lastTurnMagnitude^2 and sensorCost to the formula', () => {
    const config = resolveWorldConfig({
      organisms: {
        basalCost: 1,
        movementCost: 0,
        turningCost: 0.2,
        sensorCost: 0.3
      },
      timestep: 1
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { energy: 100, age: 100, lastTurnMagnitude: 2 }))
    const events = new EventLog(10)
    events.beginTick()

    new MetabolismSystem(config, organisms, events).update(1)

    const expectedCost = 1 + 0.2 * (2 * 2) + 0.3
    expect(organisms.get(1)?.energy).toBeCloseTo(100 - expectedCost, 12)
  })

  it('scales the whole formula by juvenileMetabolicScale for juveniles', () => {
    const config = resolveWorldConfig({
      organisms: {
        basalCost: 1,
        movementCost: 0,
        turningCost: 0,
        sensorCost: 0,
        maturityAge: 90,
        juvenileMetabolicScale: 0.5
      },
      timestep: 1
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { energy: 100, age: 5 }))
    const events = new EventLog(10)
    events.beginTick()

    new MetabolismSystem(config, organisms, events).update(1)

    expect(organisms.get(1)?.energy).toBeCloseTo(100 - 0.5, 12)
  })

  it('does not clamp energy at zero (Death owns removal)', () => {
    const config = resolveWorldConfig({ organisms: { basalCost: 1000 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { energy: 1 }))
    const events = new EventLog(10)
    events.beginTick()
    new MetabolismSystem(config, organisms, events).update(1)
    expect(organisms.get(1)?.energy).toBeLessThan(0)
  })

  it('emits energy-changed only when history.eventDetail is verbose', () => {
    const verbose = resolveWorldConfig({ history: { maxEvents: 10, eventDetail: 'verbose' } })
    const organisms = new OrganismStore()
    organisms.add(organism(1))
    const events = new EventLog(10)
    events.beginTick()
    new MetabolismSystem(verbose, organisms, events).update(1)
    expect(events.eventsThisTick()).toHaveLength(1)
    expect(events.eventsThisTick()[0]).toMatchObject({
      type: 'energy-changed',
      reason: 'metabolism'
    })
  })
})

describe('ReproductionSystem', () => {
  it('is a callable no-op', () => {
    expect(() => new ReproductionSystem().update()).not.toThrow()
  })
})

describe('DeathSystem', () => {
  it('removes an organism that starved and records the cause', () => {
    const config = resolveWorldConfig()
    const organisms = new OrganismStore()
    organisms.add(organism(1, { energy: 0, x: 3, y: 4 }))
    organisms.add(organism(2, { energy: 50 }))
    const events = new EventLog(10)
    events.beginTick()

    new DeathSystem(config, organisms, events).update(5)

    expect(organisms.has(1)).toBe(false)
    expect(organisms.has(2)).toBe(true)
    expect(events.eventsThisTick()).toEqual([
      {
        type: 'organism-died',
        tick: 5,
        organismId: 1,
        cause: 'starvation',
        position: { x: 3, y: 4 }
      }
    ])
  })

  it('removes an organism that reached maxAge and records the cause', () => {
    const config = resolveWorldConfig({
      organisms: { maturityAge: 1, senescenceAge: 5, maxAge: 10 }
    })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { age: 10, energy: 50 }))
    const events = new EventLog(10)
    events.beginTick()

    new DeathSystem(config, organisms, events).update(1)

    expect(organisms.has(1)).toBe(false)
    expect(events.eventsThisTick()[0]).toMatchObject({ cause: 'age' })
  })

  it('leaves healthy organisms alone', () => {
    const config = resolveWorldConfig({ organisms: { maxAge: 1000 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { energy: 1, age: 1 }))
    const events = new EventLog(10)
    events.beginTick()
    new DeathSystem(config, organisms, events).update(1)
    expect(organisms.has(1)).toBe(true)
  })

  it('processes every organism even while removing some (ascending id order)', () => {
    const config = resolveWorldConfig({ organisms: { maxAge: 1000 } })
    const organisms = new OrganismStore()
    organisms.add(organism(1, { energy: 0 }))
    organisms.add(organism(2, { energy: 50 }))
    organisms.add(organism(3, { energy: 0 }))
    const events = new EventLog(10)
    events.beginTick()
    new DeathSystem(config, organisms, events).update(1)
    expect(organisms.values().map((o) => o.id)).toEqual([2])
  })
})
