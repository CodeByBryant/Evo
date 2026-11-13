import { describe, expect, it } from 'vitest'
import { resolveBefore } from './support/life'
import { resolveWorldConfig } from '@evo/config'
import type { GenePath } from '@evo/contracts'
import type { IntentBuffer, PerceptionBuffer } from '../src/buffers/types'
import { OrganismStore } from '../src/entities/OrganismStore'
import type { OrganismState } from '../src/entities/OrganismStore'
import { ResourceStore } from '../src/entities/ResourceStore'
import type { ResourceState } from '../src/entities/ResourceStore'
import { EventLog } from '../src/events/EventLog'
import { buildGeneSpecs } from '../src/genetics/GeneSpecs'
import { validateGenome } from '../src/genetics/GenomeValidation'
import { HistoryStore } from '../src/history/HistoryStore'
import { LineageStore } from '../src/lineage/LineageStore'
import { SeededRandom } from '../src/random/SeededRandom'
import { deriveStreamWords } from '../src/random/streams'
import { SpatialHash } from '../src/spatial/SpatialHash'
import { DeathSystem } from '../src/systems/DeathSystem'
import { DecisionSystem } from '../src/systems/DecisionSystem'
import { InteractionSystem } from '../src/systems/InteractionSystem'
import { MetabolismSystem } from '../src/systems/MetabolismSystem'
import { MovementSystem } from '../src/systems/MovementSystem'
import { PerceptionSystem } from '../src/systems/PerceptionSystem'
import { idsFrom, makeReproduction, organismFor, withGenes } from './support/organism'

/**
 * Each system reads an organism's traits from its own genome where a gene still exists
 * (docs/decisions/0006), and from the config baseline times the body's factor where the old gene
 * was retired (docs/decisions/0015).
 */
// These tests are about the original way of eating (touch food and take it whole); bites are tested in feeding/.
const config = resolveBefore({ feeding: { enabled: false }, predation: { enabled: false } })
const MATURE = 200

const mature = (id: number, overrides: Partial<OrganismState> = {}): OrganismState =>
  organismFor(config, id, { age: MATURE, ...overrides })

const stream = (name: Parameters<typeof deriveStreamWords>[1]) =>
  new SeededRandom(deriveStreamWords(1, name))

describe('MovementSystem reads the baseline speed and turn rate (docs/decisions/0015)', () => {
  function runMovement(
    c: typeof config,
    organism: OrganismState,
    intent: { turn: number; thrust: number }
  ) {
    const full = { ...intent, strafe: 0, interact: true }
    const organisms = new OrganismStore()
    organisms.add(organism)
    const intents: IntentBuffer = new Map([[organism.id, full]])
    const events = new EventLog(10)
    events.beginTick()
    new MovementSystem(c, organisms, intents, events).update(1)
    return organisms.get(organism.id) as OrganismState
  }

  it('moves at the configured maxSpeed (a founder body delivers exactly the baseline)', () => {
    for (const speed of [10, 30]) {
      const c = resolveWorldConfig({ organisms: { maxSpeed: speed } })
      const moved = runMovement(c, organismFor(c, 1, { age: MATURE }), { turn: 0, thrust: 1 })
      expect(moved.vx).toBeCloseTo(speed, 10)
    }
  })

  it('clamps the turn to the configured maxTurnRate', () => {
    for (const rate of [1, 5]) {
      const c = resolveWorldConfig({ organisms: { maxTurnRate: rate } })
      const turned = runMovement(c, organismFor(c, 1, { age: MATURE }), { turn: 10, thrust: 0 })
      expect(turned.heading).toBeCloseTo(rate * c.timestep, 12)
    }
  })
})

describe('PerceptionSystem reads the baseline sensor range', () => {
  it('sees a resource only inside the configured range', () => {
    const seen = (range: number) => {
      const c = resolveWorldConfig({ organisms: { sensorRadius: range } })
      const organisms = new OrganismStore()
      organisms.add(organismFor(c, 1, { age: MATURE }))
      const resource: ResourceState = { id: 3, x: 50, y: 0, remaining: 30, kind: 0 }
      const index = new SpatialHash<ResourceState>(120, (r) => r)
      index.rebuild([resource])
      const buffer: PerceptionBuffer = new Map()
      new PerceptionSystem(c, organisms, index, buffer).update()
      return buffer.get(1)
    }
    expect(seen(30)).toBeNull()
    expect(seen(100)).toMatchObject({ resourceId: 3 })
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
    organisms: {
      movementCost: 0,
      turningCost: 0,
      sensorCost: 0,
      learningCost: 0,
      juvenileMetabolicScale: 1
    }
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

  it('charges the configured sensorCost for the baseline sensor, in proportion', () => {
    const cost = (sensorCost: number) => {
      const sensing = resolveWorldConfig({
        organisms: {
          basalCost: 0,
          movementCost: 0,
          turningCost: 0,
          learningCost: 0,
          sensorCost,
          juvenileMetabolicScale: 1
        }
      })
      return 100 - energyAfter(organismFor(sensing, 1, { age: MATURE, energy: 100 }), sensing)
    }
    expect(cost(0.04) / cost(0.01)).toBeCloseTo(4, 8)
  })

  it('charges the configured movementCost and turningCost against realized speed and turn', () => {
    const run = (movementCost: number, turningCost: number, moving: Partial<OrganismState>) => {
      const c = resolveWorldConfig({
        organisms: {
          basalCost: 0,
          sensorCost: 0,
          learningCost: 0,
          movementCost,
          turningCost,
          juvenileMetabolicScale: 1
        }
      })
      return 100 - energyAfter(organismFor(c, 1, { age: MATURE, energy: 100, ...moving }), c)
    }
    expect(run(0.008, 0.05, { vx: 10 }) / run(0.004, 0.05, { vx: 10 })).toBeCloseTo(2, 8)
    expect(
      run(0.005, 0.08, { lastTurnMagnitude: 0.2 }) / run(0.005, 0.04, { lastTurnMagnitude: 0.2 })
    ).toBeCloseTo(2, 8)
  })
})

describe('InteractionSystem reads the radius gene and derives capacity from it', () => {
  function feed(organism: OrganismState, resourceX: number) {
    const organisms = new OrganismStore()
    organisms.add(organism)
    const resources = new ResourceStore()
    resources.add({ id: 9, x: resourceX, y: 0, remaining: 30, kind: 0 })
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
    new DeathSystem(organisms, events, new HistoryStore(10), new LineageStore()).update(5)
    expect(organisms.has(1)).toBe(false)
    expect(organisms.has(2)).toBe(true)
    expect(events.eventsThisTick()[0]).toMatchObject({ organismId: 1, cause: 'age' })
  })
})

describe('ReproductionSystem reads reproduction genes', () => {
  function runFull(organisms: OrganismStore, genomeStart = 100, c = config) {
    const events = new EventLog(20)
    events.beginTick()
    const index = new SpatialHash<OrganismState>(100, (o) => o)
    index.rebuild(organisms.values())
    const { system, lineage } = makeReproduction(c, organisms, index, idsFrom(50), events, {
      genomeIdStart: genomeStart
    })
    system.update(1)
    return { events, lineage }
  }

  function run(organisms: OrganismStore, genomeStart = 100) {
    return runFull(organisms, genomeStart).events
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

  describe('the child’s genome', () => {
    const steady = resolveBefore({ genetics: { mutationRateScale: 0, blendAlpha: 0 } })

    it('gets a fresh id and names both parents’ genomes', () => {
      const organisms = pair({ 'physical.radius': 4 }, { 'physical.radius': 8 })
      const { events } = runFull(organisms, 100)
      const child = organisms.get(50) as OrganismState
      expect(child.genome.id).toBe(100)
      expect(child.genome.parentIds).toEqual([1, 2])
      expect(events.eventsThisTick().find((e) => e.type === 'organism-born')).toMatchObject({
        organismId: 50,
        genomeId: 100,
        parentIds: [1, 2]
      })
    })

    it('takes each gene from between its parents’ values when mutation is off', () => {
      const organisms = pair(
        { 'physical.radius': 4, 'behavioral.wanderJitter': 1 },
        { 'physical.radius': 8, 'behavioral.wanderJitter': 3 }
      )
      runFull(organisms, 100, steady)
      const child = (organisms.get(50) as OrganismState).genome
      expect(child.physical.radius).toBeGreaterThanOrEqual(4)
      expect(child.physical.radius).toBeLessThanOrEqual(8)
      expect(child.behavioral.wanderJitter).toBeGreaterThanOrEqual(1)
      expect(child.behavioral.wanderJitter).toBeLessThanOrEqual(3)
    })

    it('takes brain weights from both parents when mutation is off', () => {
      const organisms = pair({}, {})
      runFull(organisms, 100, steady)
      const child = (organisms.get(50) as OrganismState).genome.brain.weights
      const mother = (organisms.get(1) as OrganismState).genome.brain.weights
      const father = (organisms.get(2) as OrganismState).genome.brain.weights
      expect(child.every((w, i) => w === mother[i] || w === father[i])).toBe(true)
      expect(child.some((w, i) => w === mother[i] && w !== father[i])).toBe(true)
      expect(child.some((w, i) => w === father[i] && w !== mother[i])).toBe(true)
    })

    it('differs from both parents when mutation is on', () => {
      const organisms = pair({}, {})
      runFull(organisms)
      const child = (organisms.get(50) as OrganismState).genome
      for (const parentId of [1, 2]) {
        const parent = (organisms.get(parentId) as OrganismState).genome
        expect(child.brain.weights).not.toEqual(parent.brain.weights)
      }
    })

    it('is always a valid genome', () => {
      const organisms = pair({}, {})
      runFull(organisms)
      const child = (organisms.get(50) as OrganismState).genome
      const specs = buildGeneSpecs(config)
      expect(validateGenome(child, specs, { brain: child.brain.architecture })).toEqual({
        ok: true,
        errors: []
      })
    })

    it('is registered in the lineage store with both parents', () => {
      const organisms = pair({}, {})
      const { lineage } = runFull(organisms, 100)
      expect(lineage.record(100)).toEqual({
        genomeId: 100,
        parentGenomeIds: [1, 2],
        organismIds: [50],
        createdAtTick: 1,
        descendantCount: 0
      })
      expect(lineage.descendantsOf(1)).toEqual([100])
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
