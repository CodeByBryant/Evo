import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { GenePath } from '@evo/contracts'
import type { IntentBuffer, PerceptionBuffer } from '../src/buffers/types'
import { IdGenerator } from '../src/entities/IdGenerator'
import { OrganismStore } from '../src/entities/OrganismStore'
import type { OrganismState } from '../src/entities/OrganismStore'
import { ResourceStore } from '../src/entities/ResourceStore'
import type { ResourceState } from '../src/entities/ResourceStore'
import { EventLog } from '../src/events/EventLog'
import { genomeToVector } from '../src/genetics/GenomeFactory'
import { HistoryStore } from '../src/history/HistoryStore'
import { SeededRandom } from '../src/random/SeededRandom'
import { deriveStreamWords } from '../src/random/streams'
import { SpatialHash } from '../src/spatial/SpatialHash'
import { DeathSystem } from '../src/systems/DeathSystem'
import { DecisionSystem } from '../src/systems/DecisionSystem'
import { InteractionSystem } from '../src/systems/InteractionSystem'
import { MetabolismSystem } from '../src/systems/MetabolismSystem'
import { MovementSystem } from '../src/systems/MovementSystem'
import { PerceptionSystem } from '../src/systems/PerceptionSystem'
import { ReproductionSystem } from '../src/systems/ReproductionSystem'
import { organismFor, withGenes } from './support/organism'

/**
 * Each system reads an organism's traits from its own genome, not from global config
 * (docs/decisions/0006): two organisms in the same world, under the same config, behave
 * differently when their genes differ.
 */
const config = resolveWorldConfig()
const MATURE = 200

const mature = (id: number, overrides: Partial<OrganismState> = {}): OrganismState =>
  organismFor(config, id, { age: MATURE, ...overrides })

const stream = (name: Parameters<typeof deriveStreamWords>[1]) =>
  new SeededRandom(deriveStreamWords(1, name))

const idsFrom = (n: number): IdGenerator => {
  const ids = new IdGenerator()
  for (let i = 0; i < n; i++) ids.allocate()
  return ids
}

describe('MovementSystem reads physical genes', () => {
  function runMovement(organism: OrganismState, intent: { turn: number; thrust: number }) {
    const organisms = new OrganismStore()
    organisms.add(organism)
    const intents: IntentBuffer = new Map([[organism.id, intent]])
    const events = new EventLog(10)
    events.beginTick()
    new MovementSystem(config, organisms, intents, events).update(1)
    return organisms.get(organism.id) as OrganismState
  }

  it('uses the organism’s own maxSpeed gene', () => {
    const slow = runMovement(withGenes(mature(1), { 'physical.maxSpeed': 10 }), {
      turn: 0,
      thrust: 1
    })
    const fast = runMovement(withGenes(mature(2), { 'physical.maxSpeed': 30 }), {
      turn: 0,
      thrust: 1
    })
    expect(slow.vx).toBeCloseTo(10, 10)
    expect(fast.vx).toBeCloseTo(30, 10)
  })

  it('clamps the turn to the organism’s own maxTurnRate gene', () => {
    const sluggish = runMovement(withGenes(mature(1), { 'physical.maxTurnRate': 1 }), {
      turn: 10,
      thrust: 0
    })
    const agile = runMovement(withGenes(mature(2), { 'physical.maxTurnRate': 5 }), {
      turn: 10,
      thrust: 0
    })
    expect(sluggish.heading).toBeCloseTo(1 * config.timestep, 12)
    expect(agile.heading).toBeCloseTo(5 * config.timestep, 12)
  })

  it('judges juvenility by the organism’s own maturityAge gene', () => {
    const early = withGenes(organismFor(config, 1, { age: 60 }), { 'physical.maturityAge': 50 })
    const late = withGenes(organismFor(config, 2, { age: 60 }), { 'physical.maturityAge': 100 })
    const fullSpeed = runMovement(early, { turn: 0, thrust: 1 }).vx
    const juvenileSpeed = runMovement(late, { turn: 0, thrust: 1 }).vx
    expect(juvenileSpeed).toBeCloseTo(fullSpeed * config.organisms.juvenileSpeedScale, 10)
  })
})

describe('PerceptionSystem reads the sensorRadius gene', () => {
  it('lets a long-sighted organism see a resource a short-sighted one cannot', () => {
    const organisms = new OrganismStore()
    organisms.add(withGenes(mature(1), { 'sensory.sensorRadius': 30 }))
    organisms.add(withGenes(mature(2), { 'sensory.sensorRadius': 100 }))
    const resource: ResourceState = { id: 3, x: 50, y: 0, remaining: 30 }
    const index = new SpatialHash<ResourceState>(120, (r) => r)
    index.rebuild([resource])
    const buffer: PerceptionBuffer = new Map()
    new PerceptionSystem(organisms, index, buffer).update()
    expect(buffer.get(1)).toBeNull()
    expect(buffer.get(2)).toMatchObject({ resourceId: 3 })
  })
})

describe('DecisionSystem reads the wanderJitter gene', () => {
  it('wanders only as far as the organism’s own jitter allows', () => {
    const organisms = new OrganismStore()
    organisms.add(withGenes(mature(1), { 'behavioral.wanderJitter': 0 }))
    organisms.add(withGenes(mature(2), { 'behavioral.wanderJitter': 3 }))
    const perception: PerceptionBuffer = new Map()
    const intents: IntentBuffer = new Map()
    const system = new DecisionSystem(config, organisms, perception, intents, stream('world'))
    for (let tick = 0; tick < 50; tick++) {
      system.update()
      expect(Math.abs(intents.get(1)?.turn ?? 1)).toBe(0)
      expect(Math.abs(intents.get(2)?.turn ?? 0)).toBeLessThanOrEqual(3 * config.timestep)
    }
  })
})

describe('MetabolismSystem reads cost genes and derives size-linked costs', () => {
  const costless = resolveWorldConfig({
    organisms: { movementCost: 0, turningCost: 0, sensorCost: 0, juvenileMetabolicScale: 1 }
  })

  function energyAfter(organism: OrganismState, c = costless): number {
    const organisms = new OrganismStore()
    organisms.add(organism)
    const events = new EventLog(10)
    events.beginTick()
    new MetabolismSystem(c, organisms, events).update(1)
    return (organisms.get(organism.id) as OrganismState).energy
  }

  it('charges the organism’s own basalCost gene', () => {
    const cheap = withGenes(organismFor(costless, 1, { age: MATURE, energy: 100 }), {
      'metabolic.basalCost': 0.3
    })
    expect(energyAfter(cheap)).toBeCloseTo(100 - 0.3 * costless.timestep, 12)
  })

  it('charges a larger body more, in proportion to its size factor', () => {
    const small = organismFor(costless, 1, { age: MATURE, energy: 100 })
    const big = withGenes(organismFor(costless, 2, { age: MATURE, energy: 100 }), {
      'physical.radius': 10
    })
    const smallCost = 100 - energyAfter(small)
    const bigCost = 100 - energyAfter(big)
    expect(bigCost / smallCost).toBeCloseTo(4, 8)
  })

  it('charges more to run a longer sensor', () => {
    const sensing = resolveWorldConfig({
      organisms: { basalCost: 0, movementCost: 0, turningCost: 0, juvenileMetabolicScale: 1 }
    })
    const near = withGenes(organismFor(sensing, 1, { age: MATURE, energy: 100 }), {
      'sensory.sensorRadius': 30
    })
    const far = withGenes(organismFor(sensing, 2, { age: MATURE, energy: 100 }), {
      'sensory.sensorRadius': 120
    })
    expect((100 - energyAfter(far, sensing)) / (100 - energyAfter(near, sensing))).toBeCloseTo(4, 8)
  })

  it('charges the movementCost and turningCost genes against realized speed and turn', () => {
    const moving = resolveWorldConfig({
      organisms: { basalCost: 0, sensorCost: 0, juvenileMetabolicScale: 1 }
    })
    const base = organismFor(moving, 1, { age: MATURE, energy: 100, vx: 10, vy: 0 })
    const costly = withGenes(base, { 'metabolic.movementCost': 0.008 })
    const thrifty = withGenes(base, { 'metabolic.movementCost': 0.004 })
    expect((100 - energyAfter(costly, moving)) / (100 - energyAfter(thrifty, moving))).toBeCloseTo(
      2,
      8
    )
    const turning = organismFor(moving, 2, {
      age: MATURE,
      energy: 100,
      lastTurnMagnitude: 0.2
    })
    const sharp = withGenes(turning, { 'metabolic.turningCost': 0.08 })
    const gentle = withGenes(turning, { 'metabolic.turningCost': 0.04 })
    expect((100 - energyAfter(sharp, moving)) / (100 - energyAfter(gentle, moving))).toBeCloseTo(
      2,
      8
    )
  })
})

describe('InteractionSystem reads the radius gene and derives capacity from it', () => {
  function feed(organism: OrganismState, resourceX: number) {
    const organisms = new OrganismStore()
    organisms.add(organism)
    const resources = new ResourceStore()
    resources.add({ id: 9, x: resourceX, y: 0, remaining: 30 })
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(resources.values())
    const events = new EventLog(10)
    events.beginTick()
    new InteractionSystem(config, organisms, resources, index, events).update(1)
    return { organism: organisms.get(organism.id) as OrganismState, resources }
  }

  it('reaches as far as the organism’s own radius plus the resource radius', () => {
    const distance = 10.5 // a radius-10 body reaches it (10 + 3), a radius-5 body (5 + 3) does not
    const big = feed(withGenes(mature(1, { energy: 10 }), { 'physical.radius': 10 }), distance)
    const small = feed(mature(2, { energy: 10 }), distance)
    expect(big.resources.has(9)).toBe(false)
    expect(big.organism.energy).toBe(40)
    expect(small.resources.has(9)).toBe(true)
    expect(small.organism.energy).toBe(10)
  })

  it('caps energy at the capacity its body size derives', () => {
    const tiny = feed(withGenes(mature(1, { energy: 20 }), { 'physical.radius': 2.5 }), 0)
    // capacity = 100 * 0.25 = 25, so only 5 of the 30 is absorbed
    expect(tiny.organism.energy).toBe(25)
    const giant = feed(withGenes(mature(2, { energy: 20 }), { 'physical.radius': 10 }), 0)
    expect(giant.organism.energy).toBe(50)
  })
})

describe('DeathSystem reads the maxAge gene', () => {
  it('kills an organism at its own maximum age, and not before', () => {
    const organisms = new OrganismStore()
    organisms.add(withGenes(mature(1, { age: 580 }), { 'physical.maxAge': 570 }))
    organisms.add(withGenes(mature(2, { age: 580 }), { 'physical.maxAge': 1000 }))
    const events = new EventLog(10)
    events.beginTick()
    new DeathSystem(organisms, events, new HistoryStore(10)).update(5)
    expect(organisms.has(1)).toBe(false)
    expect(organisms.has(2)).toBe(true)
    expect(events.eventsThisTick()[0]).toMatchObject({ organismId: 1, cause: 'age' })
  })
})

describe('ReproductionSystem reads reproduction genes', () => {
  function run(organisms: OrganismStore, genomeStart = 100) {
    const events = new EventLog(20)
    events.beginTick()
    const index = new SpatialHash<OrganismState>(100, (o) => o)
    index.rebuild(organisms.values())
    new ReproductionSystem(
      config,
      organisms,
      index,
      idsFrom(50),
      idsFrom(genomeStart),
      stream('reproduction'),
      events
    ).update(1)
    return events
  }

  type Genes = Partial<Record<GenePath, number>>

  function pair(a: Genes, b: Genes, energy = 100): OrganismStore {
    const organisms = new OrganismStore()
    organisms.add(withGenes(mature(1, { x: 0, y: 0, energy }), a))
    organisms.add(withGenes(mature(2, { x: 5, y: 0, energy }), b))
    return organisms
  }

  it('does not attempt until energy reaches the organism’s own minEnergy gene', () => {
    const organisms = pair({ 'reproduction.minEnergy': 90 }, { 'reproduction.minEnergy': 90 }, 80)
    expect(run(organisms).eventsThisTick()).toEqual([])
  })

  it('never attempts when it cannot afford to pay, whatever its minEnergy gene says', () => {
    const stingy = {
      'reproduction.minEnergy': 10,
      'reproduction.offspringInvestment': 25
    } as const
    // cost is 40, so 30 energy is not enough even though minEnergy is only 10
    expect(run(pair(stingy, stingy, 30)).eventsThisTick()).toEqual([])
    // with 45 energy both attempt, and paying leaves them non-negative
    const organisms = pair(stingy, stingy, 45)
    run(organisms)
    expect(organisms.get(1)?.energy).toBe(5)
    expect(organisms.get(2)?.energy).toBe(5)
  })

  it('makes each parent pay its own cost and gives the child the sum of the investments', () => {
    const organisms = pair(
      { 'reproduction.offspringInvestment': 6 },
      { 'reproduction.offspringInvestment': 20 }
    )
    run(organisms)
    expect(organisms.get(1)?.energy).toBeCloseTo(100 - 6 * 1.6, 12)
    expect(organisms.get(2)?.energy).toBeCloseTo(100 - 20 * 1.6, 12)
    expect(organisms.get(50)?.energy).toBe(26)
  })

  it('resets each parent’s cooldown to its own cooldown gene', () => {
    const organisms = pair({ 'reproduction.cooldown': 15 }, { 'reproduction.cooldown': 60 })
    run(organisms)
    expect(organisms.get(1)?.reproductionCooldownRemaining).toBe(15)
    expect(organisms.get(2)?.reproductionCooldownRemaining).toBe(60)
  })

  it('searches within the initiator’s own searchRadius gene', () => {
    const near = pair({ 'reproduction.searchRadius': 2 }, { 'reproduction.searchRadius': 2 })
    const events = run(near)
    expect(events.eventsThisTick().some((e) => e.type === 'organism-born')).toBe(false)
    const far = pair({ 'reproduction.searchRadius': 30 }, { 'reproduction.searchRadius': 30 })
    expect(
      run(far)
        .eventsThisTick()
        .some((e) => e.type === 'organism-born')
    ).toBe(true)
  })

  it('gives the child a fresh genome that copies its mother’s, the lower-id parent', () => {
    const organisms = pair({ 'physical.maxSpeed': 11 }, { 'physical.maxSpeed': 33 })
    const events = run(organisms, 100)
    const child = organisms.get(50) as OrganismState
    const mother = organisms.get(1) as OrganismState
    expect(child.genome.id).toBe(100)
    expect(child.genome.parentIds).toEqual([1, 2])
    expect(child.genome).not.toBe(mother.genome)
    expect(child.genome.physical.maxSpeed).toBe(11)
    expect(genomeToVector(child.genome)).toEqual(genomeToVector(mother.genome))
    expect(child.genome.brain.weights).toEqual(mother.genome.brain.weights)
    expect(events.eventsThisTick().find((e) => e.type === 'organism-born')).toMatchObject({
      organismId: 50,
      genomeId: 100,
      parentIds: [1, 2]
    })
  })

  it('records parent genome ids in ascending order even when ids are out of step', () => {
    const organisms = new OrganismStore()
    const a = mature(1, { x: 0, y: 0, energy: 100 })
    const b = mature(2, { x: 5, y: 0, energy: 100 })
    organisms.add({ ...a, genome: { ...a.genome, id: 9 } })
    organisms.add({ ...b, genome: { ...b.genome, id: 4 } })
    run(organisms)
    expect(organisms.get(50)?.genome.parentIds).toEqual([4, 9])
  })
})
