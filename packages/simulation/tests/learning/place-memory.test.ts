import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { OBSERVATION_LABELS, OBSERVATION_SIZE } from '@evo/contracts'
import { buildObservation } from '../../src/learning/ObservationBuilder'
import type { ObservationInput } from '../../src/learning/ObservationBuilder'
import { World } from '../../src/index'

// Where it last fed (ADR 0025): a 4-slot input group (recallPresent, bearing cos and sin in the body
// frame, proximity) fed by a remembered site that a bite of real food sets and that fades, is
// forgotten on arrival with no food, and is never a carcass.

const RECALL = OBSERVATION_LABELS.indexOf('recallPresent')

const base: ObservationInput = {
  energy: 0.5,
  age: 0.1,
  x: 100,
  y: 100,
  vx: 0,
  vy: 0,
  heading: 0,
  maxSpeed: 20,
  sensorRadius: 60,
  worldWidth: 500,
  worldHeight: 500,
  food: null,
  peer: null,
  timeSinceFood: 0,
  previousReward: 0,
  previousAction: [0, 0, 0, 0, 0]
}
const site = (dx: number, dy: number, freshness = 1, range = 300) => ({
  dx,
  dy,
  distanceSquared: dx * dx + dy * dy,
  freshness,
  range
})

describe('the recall input group', () => {
  it('is the last four slots, labelled', () => {
    expect(RECALL).toBe(OBSERVATION_SIZE - 4)
    expect(OBSERVATION_LABELS.slice(RECALL)).toEqual([
      'recallPresent',
      'recallBearingCos',
      'recallBearingSin',
      'recallProximity'
    ])
  })

  it('is zero with nothing remembered (negative: the other slots are untouched)', () => {
    const none = buildObservation(base)
    expect(none.slice(RECALL)).toEqual([0, 0, 0, 0])
    const withSite = buildObservation({ ...base, recall: site(150, 0) })
    expect(withSite.slice(0, RECALL)).toEqual(none.slice(0, RECALL))
  })

  it('gives freshness, a body-frame bearing and a proximity that falls off with distance', () => {
    const ahead = buildObservation({ ...base, recall: site(150, 0, 0.8) }).slice(RECALL)
    expect(ahead[0]).toBeCloseTo(0.8)
    expect(ahead[1]).toBeCloseTo(1)
    expect(ahead[2]).toBeCloseTo(0)
    expect(ahead[3]).toBeCloseTo(1 - 150 / 300)
    // The same site seen by a creature facing the other way is behind it, on the left when it faces north.
    const behind = buildObservation({ ...base, heading: Math.PI, recall: site(150, 0) }).slice(
      RECALL
    )
    expect(behind[1]).toBeCloseTo(-1)
    const left = buildObservation({ ...base, heading: -Math.PI / 2, recall: site(150, 0) }).slice(
      RECALL
    )
    expect(left[1]).toBeCloseTo(0)
    expect(Math.abs(left[2] as number)).toBeCloseTo(1)
    // Beyond the range the proximity is zero but the bearing and freshness remain.
    const far = buildObservation({ ...base, recall: site(900, 0) }).slice(RECALL)
    expect(far[3]).toBe(0)
    expect(far[1]).toBeCloseTo(1)
  })

  it('treats a creature standing on its site as having it ahead, with full proximity', () => {
    const here = buildObservation({ ...base, recall: site(0, 0) }).slice(RECALL)
    expect(here).toEqual([1, 1, 0, 1])
  })
})

const BRAIN: WorldConfigOverrides = { learning: { controller: 'brain' } }

interface Internals {
  organisms: { values(): Array<{ id: number; x: number; y: number; brain: BrainLike | null }> }
  events: { beginTick(): void; record(event: object): void }
  brainSystem: { settle(tick: number): void }
}
interface BrainLike {
  recallX: number
  recallY: number
  recallTick: number
  recallStay: number
  decisions: number
}

function bite(world: World, id: number, kind: number, x: number, y: number, intake = 5): void {
  const w = world as unknown as Internals
  w.events.beginTick()
  w.events.record({
    type: 'resource-bitten',
    tick: world.clock.tick,
    organismId: id,
    resourceId: 1,
    kind,
    chunk: intake,
    intake,
    remaining: 0,
    position: { x, y }
  })
  w.brainSystem.settle(world.clock.tick)
}

function firstBrain(world: World): { id: number; brain: BrainLike } {
  const w = world as unknown as Internals
  for (const o of w.organisms.values()) if (o.brain !== null) return { id: o.id, brain: o.brain }
  throw new Error('no organism with a brain')
}

describe('remembering where it fed', () => {
  const settled = (overrides: WorldConfigOverrides = {}): World => {
    const world = World.create({ seed: 3, config: { ...BRAIN, ...overrides } })
    world.run(5) // every creature has decided at least once, so a reward can settle
    return world
  }

  it('records the place of a bite that took in food', () => {
    const world = settled()
    const { id, brain } = firstBrain(world)
    brain.recallTick = -1 // it may already have fed in the warm-up ticks
    bite(world, id, 0, 111, 222)
    expect(brain.recallTick).toBe(world.clock.tick)
    expect([brain.recallX, brain.recallY]).toEqual([111, 222])
    // A later bite elsewhere replaces it.
    bite(world, id, 0, 333, 44)
    expect([brain.recallX, brain.recallY]).toEqual([333, 44])
  })

  it('does not record a bite with no intake, or a bite of carrion (negatives)', () => {
    const world = settled()
    const { id, brain } = firstBrain(world)
    brain.recallTick = -1
    bite(world, id, 0, 10, 10, 0)
    expect(brain.recallTick).toBe(-1)
    const carrion = world.config.ecology.resourceKinds.kinds.findIndex((k) => k.name === 'carrion')
    expect(carrion).toBeGreaterThanOrEqual(0) // predation is on by default, so the kind exists
    bite(world, id, carrion, 10, 10)
    expect(brain.recallTick).toBe(-1)
    // The same bite of ordinary food does record it.
    bite(world, id, 0, 10, 10)
    expect(brain.recallTick).toBe(world.clock.tick)
  })

  it('records nothing with the sense switched off, and the input stays zero', () => {
    const world = settled({ learning: { controller: 'brain', placeMemory: { enabled: false } } })
    const { id, brain } = firstBrain(world)
    bite(world, id, 0, 111, 222)
    expect(brain.recallTick).toBe(-1)
    world.run(3)
    expect(world.brainOf(id)?.observation.slice(RECALL)).toEqual([0, 0, 0, 0])
  })

  it('shows it as an input, fading with age, and forgets it past the horizon', () => {
    const world = settled({ learning: { controller: 'brain', placeMemory: { horizon: 2 } } })
    const { id, brain } = firstBrain(world)
    const o = (world as unknown as Internals).organisms.values().find((x) => x.id === id)!
    brain.recallX = o.x + 80
    brain.recallY = o.y
    brain.recallTick = world.clock.tick
    brain.recallStay = 0
    world.run(1)
    const fresh = world.brainOf(id)!.observation.slice(RECALL)
    expect(fresh[0]).toBeGreaterThan(0.9)
    expect(fresh[3]).toBeGreaterThan(0)
    world.run(8) // 0.9 s of a 2 s horizon: still remembered, but fading
    const fading = world.brainOf(id)!.observation.slice(RECALL)
    expect(fading[0]).toBeLessThan(fresh[0] as number)
    expect(fading[0]).toBeGreaterThan(0)
    world.run(15) // past the 2 s horizon (20 ticks): forgotten, zeros, state cleared
    expect(world.brainOf(id)!.observation.slice(RECALL)).toEqual([0, 0, 0, 0])
    expect(brain.recallTick).toBe(-1)
  })

  it('forgets a site it has stood at for the arrive window with no bite (the food is gone), not before', () => {
    const world = settled({
      learning: { controller: 'brain', placeMemory: { arriveWindow: 0.5, arriveRadius: 1000 } }
    })
    const { id, brain } = firstBrain(world)
    const o = (world as unknown as Internals).organisms.values().find((x) => x.id === id)!
    brain.recallX = o.x
    brain.recallY = o.y
    brain.recallTick = world.clock.tick
    brain.recallStay = 0
    world.run(3) // 0.3 s: still within the window
    expect(brain.recallTick).toBeGreaterThanOrEqual(0)
    world.run(5) // past 0.5 s without a bite
    expect(brain.recallTick).toBe(-1)
  })

  it('is hashed: the same world with a different remembered site has a different hash', () => {
    const a = settled()
    const b = settled()
    expect(a.stateHash()).toBe(b.stateHash())
    bite(b, firstBrain(b).id, 0, 12, 34)
    expect(a.stateHash()).not.toBe(b.stateHash())
  })

  it('is the same stepped one tick at a time or in chunks', () => {
    const run = (chunks: number[]): string => {
      const world = World.create({ seed: 8, config: BRAIN })
      for (const n of chunks) world.run(n)
      return world.stateHash()
    }
    expect(run([300])).toBe(run([100, 100, 100]))
  })

  it('does record sites in a running world, and they are places where food was bitten', () => {
    const world = World.create({ seed: 5, config: BRAIN })
    let remembering = 0
    const w = world as unknown as Internals
    for (let t = 0; t < 600; t++) {
      world.step()
      if (t % 100 === 99) {
        for (const o of w.organisms.values()) {
          if (o.brain !== null && o.brain.recallTick >= 0) {
            remembering++
            expect(o.brain.recallTick).toBeLessThanOrEqual(world.clock.tick)
            expect(Number.isFinite(o.brain.recallX)).toBe(true)
          }
        }
      }
    }
    expect(remembering).toBeGreaterThan(0)
  })
})
