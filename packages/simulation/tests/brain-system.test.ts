import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { WorldConfigOverrides } from '@evo/contracts'
import { ACTION_SIZE, OBSERVATION_SIZE } from '@evo/contracts'
import type { IntentBuffer, PeerBuffer, PerceptionBuffer } from '../src/buffers/types'
import { OrganismStore } from '../src/entities/OrganismStore'
import type { OrganismState } from '../src/entities/OrganismStore'
import { ResourceStore } from '../src/entities/ResourceStore'
import type { ResourceState } from '../src/entities/ResourceStore'
import { EventLog } from '../src/events/EventLog'
import { architectureOf } from '../src/genetics/GenomeFactory'
import { brainLayoutOf } from '../src/learning/BrainLayout'
import { createBrainState } from '../src/learning/BrainState'
import { World } from '../src/index'
import { SeededRandom } from '../src/random/SeededRandom'
import { deriveStreamWords } from '../src/random/streams'
import type { RandomStreams } from '../src/random/streams'
import { SpatialHash } from '../src/spatial/SpatialHash'
import { BrainSystem } from '../src/systems/BrainSystem'
import { InteractionSystem } from '../src/systems/InteractionSystem'
import { MetabolismSystem } from '../src/systems/MetabolismSystem'
import { MovementSystem } from '../src/systems/MovementSystem'
import { PerceptionSystem } from '../src/systems/PerceptionSystem'
import { idsFrom, makeReproduction, organismFor, withGenes } from './support/organism'

const BRAIN: WorldConfigOverrides = { learning: { controller: 'brain' } }

const withBrain = (
  config: ReturnType<typeof resolveWorldConfig>,
  id: number,
  overrides: Partial<OrganismState> = {}
): OrganismState => {
  const organism = organismFor(config, id, overrides)
  const layout = brainLayoutOf(architectureOf(config.genetics.brain))
  return { ...organism, brain: createBrainState(organism.genome, layout, organism.energy) }
}

const stream = (seed: number, name: Parameters<typeof deriveStreamWords>[1]) =>
  new SeededRandom(deriveStreamWords(seed, name))

describe('brain controller in a running world', () => {
  it('gives every organism a brain state, inspectable through brainOf', () => {
    const world = World.create({ seed: 1, config: BRAIN, validateEveryTicks: 10 })
    world.run(5)
    const id = world.snapshot().organisms[0]!.id
    const brain = world.brainOf(id)!
    expect(brain.observation).toHaveLength(OBSERVATION_SIZE)
    expect(brain.output).toHaveLength(ACTION_SIZE)
    expect(brain.action).toHaveLength(ACTION_SIZE)
    expect(brain.hidden).toHaveLength(8)
    expect(brain.memory).toHaveLength(4)
    expect(brain.memory.some((m) => m !== 0)).toBe(true)
    expect(world.brainOf(99999)).toBeUndefined()
  })

  it('has no brain under the reflex controller, and never advances the learning stream', () => {
    const world = World.create({ seed: 1, config: { learning: { controller: 'reflex' } } })
    world.run(50)
    const id = world.snapshot().organisms[0]!.id
    expect(world.brainOf(id)).toBeUndefined()
    const used = (world as unknown as { randomStreams: RandomStreams }).randomStreams.get(
      'learning'
    )
    expect(used.getState()).toEqual(stream(1, 'learning').getState())
  })

  it.each([true, false])(
    'draws exactly five normals per organism per tick from the learning stream (learning enabled: %s)',
    (enabled) => {
      const world = World.create({
        seed: 4,
        config: {
          maxPopulation: 1,
          organisms: { initialCount: 1 },
          learning: { controller: 'brain', enabled }
        }
      })
      world.run(20)
      const used = (world as unknown as { randomStreams: RandomStreams }).randomStreams.get(
        'learning'
      )
      const reference = stream(4, 'learning')
      for (let i = 0; i < 20 * ACTION_SIZE; i++) reference.normal()
      expect(used.getState()).toEqual(reference.getState())
    }
  )

  it('learning on and off differ only in what learning changes', () => {
    const make = (enabled: boolean) =>
      World.create({
        seed: 4,
        config: {
          maxPopulation: 1,
          organisms: { initialCount: 1 },
          learning: { controller: 'brain', enabled }
        }
      })
    const on = make(true)
    const off = make(false)
    on.run(20)
    off.run(20)
    expect(on.stateHash()).not.toBe(off.stateHash())
    expect(on.snapshot().resources.map((r) => r.position)).toEqual(
      off.snapshot().resources.map((r) => r.position)
    )
  })

  it('is deterministic and independent of how the run is chunked', () => {
    const a = World.create({ seed: 8, config: BRAIN })
    const b = World.create({ seed: 8, config: BRAIN })
    a.run(400)
    for (let i = 0; i < 400; i++) b.step()
    expect(a.stateHash()).toBe(b.stateHash())
    const c = World.create({ seed: 9, config: BRAIN })
    c.run(400)
    expect(c.stateHash()).not.toBe(a.stateHash())
  })

  it('changes the brain state while the organism lives', () => {
    const world = World.create({ seed: 2, config: BRAIN })
    world.run(30)
    const id = world.snapshot().organisms[0]!.id
    const early = world.brainOf(id)!
    world.run(200)
    const later = world.brainOf(id)
    if (later) {
      expect(later.memory).not.toEqual(early.memory)
      expect(later.telemetry.updates).toBeGreaterThan(early.telemetry.updates)
    }
  })

  it('fails validation when a brain state is corrupted', () => {
    const world = World.create({ seed: 2, config: BRAIN })
    world.run(5)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
    const internals = world as unknown as { organisms: OrganismStore }
    const organism = internals.organisms.values()[0]!
    organism.brain!.learned[0] = Number.NaN
    const result = world.validate()
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/brain: learned contains a non-finite value/)
  })

  it('fails validation when the brain state does not match the controller', () => {
    const world = World.create({ seed: 2, config: BRAIN })
    const internals = world as unknown as { organisms: OrganismStore }
    internals.organisms.values()[0]!.brain = null
    expect(world.validate().errors.join('\n')).toMatch(/has no brain state/)
    const reflex = World.create({ seed: 2 })
    const organism = (reflex as unknown as { organisms: OrganismStore }).organisms.values()[0]!
    const donor = World.create({ seed: 2, config: BRAIN })
    organism.brain = (donor as unknown as { organisms: OrganismStore }).organisms.values()[0]!.brain
    expect(reflex.validate().errors.join('\n')).toMatch(/has a brain state but the controller/)
  })
})

describe('BrainSystem', () => {
  function setup(overrides: Partial<OrganismState> = {}, config = resolveWorldConfig(BRAIN)) {
    const organisms = new OrganismStore()
    organisms.add(withBrain(config, 1, { x: 100, y: 100, ...overrides }))
    const perception: PerceptionBuffer = new Map()
    const peers: PeerBuffer = new Map()
    const intents: IntentBuffer = new Map()
    const events = new EventLog(100)
    events.beginTick()
    const system = new BrainSystem(
      config,
      organisms,
      perception,
      peers,
      intents,
      events,
      stream(1, 'learning')
    )
    return { config, organisms, perception, peers, intents, events, system }
  }

  it('turns a perceived food source into an intent that heads toward it', () => {
    const { system, perception, intents, organisms } = setup({ age: 30 })
    perception.set(1, {
      resourceId: 9,
      position: { x: 100, y: 120 },
      distanceSquared: 400
    })
    system.decide()
    const intent = intents.get(1)!
    // Food is to the left (+y) of an organism heading along +x, so it turns left and drives.
    expect(intent.turn).toBeGreaterThan(0)
    expect(intent.thrust).toBeGreaterThan(0.5)
    expect(intent.interact).toBe(true)
    expect(organisms.get(1)!.brain!.decisions).toBe(1)
  })

  it('clears the previous tick intents and writes one per organism', () => {
    const { system, intents, perception } = setup()
    intents.set(77, { turn: 1, thrust: 1, strafe: 0, interact: true })
    perception.set(1, null)
    system.decide()
    expect([...intents.keys()]).toEqual([1])
  })

  it('settles feeding, reproduction and energy cost into the reward breakdown', () => {
    const { system, organisms, events, config } = setup({ energy: 50, age: 100 })
    perception(system)
    function perception(s: BrainSystem) {
      s.decide()
    }
    const organism = organisms.get(1)!
    // This tick: ate 30 (energy 50 -> 80), then paid 0.05 metabolic cost.
    organism.energy = 80 - 0.05
    events.record({
      type: 'resource-consumed',
      tick: 1,
      organismId: 1,
      resourceId: 5,
      amount: 30,
      energyGained: 30,
      energyWasted: 0,
      position: { x: 0, y: 0 }
    })
    system.settle()
    const { reward } = organism.brain!
    const w = config.learning.rewardWeights
    expect(reward.feeding).toBeCloseTo((w.feeding * 30) / config.organisms.maxEnergy, 8)
    expect(reward.reproduction).toBe(0)
    expect(reward.energyCost).toBeCloseTo((w.energyCost * 0.05) / config.organisms.maxEnergy, 8)
    expect(reward.total).toBeCloseTo(reward.feeding - reward.energyCost, 12)
    expect(organism.brain!.timeSinceFood).toBe(0)
  })

  it('counts a successful reproduction for the initiator and the partner', () => {
    const config = resolveWorldConfig(BRAIN)
    const { system, organisms, events } = setup({ energy: 60, age: 100 }, config)
    organisms.add(withBrain(config, 2, { x: 100, y: 100, energy: 60, age: 100 }))
    system.decide()
    for (const o of organisms.values()) o.energy = 60 - 20
    events.record({
      type: 'reproduction-attempted',
      tick: 1,
      organismId: 1,
      partnerId: 2,
      childId: 3,
      succeeded: true,
      failureReason: null
    })
    system.settle()
    for (const o of organisms.values()) {
      expect(o.brain!.reward.reproduction).toBe(config.learning.rewardWeights.reproduction)
      // The 20 paid for reproduction is not charged as metabolic cost.
      expect(o.brain!.reward.energyCost).toBeCloseTo(0, 12)
    }
  })

  it('advances time since food until the organism eats', () => {
    const { system, organisms, config } = setup()
    for (let i = 0; i < 3; i++) {
      system.decide()
      system.settle()
    }
    expect(organisms.get(1)!.brain!.timeSinceFood).toBeCloseTo(3 * config.timestep, 12)
  })

  it('does not reward an organism that has not decided yet (a newborn)', () => {
    const { system, organisms, events } = setup()
    const brain = organisms.get(1)!.brain!
    events.record({
      type: 'resource-consumed',
      tick: 1,
      organismId: 1,
      resourceId: 5,
      amount: 30,
      energyGained: 30,
      energyWasted: 0,
      position: { x: 0, y: 0 }
    })
    system.settle()
    expect(brain.reward.total).toBe(0)
    expect(brain.rewardTotal).toBe(0)
  })
})

describe('PerceptionSystem peers', () => {
  it('finds the nearest other organism, never itself, only when asked to', () => {
    const config = resolveWorldConfig({ ...BRAIN, organisms: { sensorRadius: 30 } })
    const organisms = new OrganismStore()
    organisms.add(organismFor(config, 1, { x: 0, y: 0 }))
    organisms.add(organismFor(config, 2, { x: 10, y: 0 }))
    organisms.add(organismFor(config, 3, { x: 5, y: 0 }))
    organisms.add(organismFor(config, 4, { x: 400, y: 400 }))
    const resources = new SpatialHash<ResourceState>(60, (r) => r)
    resources.rebuild([])
    const organismIndex = new SpatialHash<OrganismState>(100, (o) => o)
    organismIndex.rebuild(organisms.values())
    const buffer: PeerBuffer = new Map()

    new PerceptionSystem(organisms, resources, new Map(), { organismIndex, buffer }).update()
    expect(buffer.get(1)?.organismId).toBe(3)
    expect(buffer.get(2)?.organismId).toBe(3)
    expect(buffer.get(3)?.organismId).toBe(1)
    expect(buffer.get(4)).toBeNull()

    const none: PeerBuffer = new Map()
    new PerceptionSystem(organisms, resources, new Map()).update()
    expect(none.size).toBe(0)
  })
})

describe('strafe and interact', () => {
  function move(strafe: number, thrust: number, heading = 0) {
    const config = resolveWorldConfig()
    const organisms = new OrganismStore()
    organisms.add(organismFor(config, 1, { x: 100, y: 100, heading, age: 100 }))
    const intents: IntentBuffer = new Map([[1, { turn: 0, thrust, strafe, interact: true }]])
    const events = new EventLog(10)
    events.beginTick()
    new MovementSystem(config, organisms, intents, events).update(1)
    return { organism: organisms.get(1)!, config }
  }

  it('adds lateral velocity to the left of the heading', () => {
    const { organism, config } = move(0.5, 0)
    expect(organism.vx).toBeCloseTo(0, 12)
    expect(organism.vy).toBeCloseTo(0.5 * config.organisms.maxSpeed, 12)
  })

  it('limits the combined speed to the top speed, so strafing is never a free boost', () => {
    const { organism, config } = move(1, 1)
    const speed = Math.sqrt(organism.vx * organism.vx + organism.vy * organism.vy)
    expect(speed).toBeCloseTo(config.organisms.maxSpeed, 9)
  })

  it('leaves the reflex motion bit-identical when strafe is zero', () => {
    const { organism, config } = move(0, 0.7, 0.3)
    const forward = move(-0, 0.7, 0.3).organism
    expect(organism.vx).toBe(forward.vx)
    expect(organism.vy).toBe(forward.vy)
    expect(organism.vx).toBeCloseTo(0.7 * config.organisms.maxSpeed * Math.cos(0.3), 9)
  })

  it('an organism that does not interact eats nothing, one that does eats the food', () => {
    const run = (interact: boolean) => {
      const config = resolveWorldConfig()
      const organisms = new OrganismStore()
      organisms.add(organismFor(config, 1, { x: 10, y: 10, energy: 50, age: 100 }))
      const resources = new ResourceStore()
      resources.add({ id: 2, x: 10, y: 10, remaining: 30 })
      const index = new SpatialHash<ResourceState>(60, (r) => r)
      index.rebuild(resources.values())
      const intents: IntentBuffer = new Map([[1, { turn: 0, thrust: 0, strafe: 0, interact }]])
      const events = new EventLog(10)
      events.beginTick()
      new InteractionSystem(config, organisms, resources, index, events, intents).update(1)
      return { energy: organisms.get(1)!.energy, left: resources.size }
    }
    expect(run(false)).toEqual({ energy: 50, left: 1 })
    expect(run(true)).toEqual({ energy: 80, left: 0 })
  })
})

describe('learningCost', () => {
  function drain(config: ReturnType<typeof resolveWorldConfig>, rate?: number) {
    const organisms = new OrganismStore()
    let organism = organismFor(config, 1, { energy: 50, age: 100 })
    if (rate !== undefined) organism = withGenes(organism, { 'learning.learningRate': rate })
    organisms.add(organism)
    const events = new EventLog(10)
    events.beginTick()
    new MetabolismSystem(config, organisms, events).update(1)
    return 50 - organisms.get(1)!.energy
  }

  it('is charged only under the brain controller with learning enabled', () => {
    const reflex = drain(resolveWorldConfig({ organisms: { learningCost: 1 } }))
    const brain = drain(resolveWorldConfig({ ...BRAIN, organisms: { learningCost: 1 } }))
    const frozen = drain(
      resolveWorldConfig({
        learning: { controller: 'brain', enabled: false },
        organisms: { learningCost: 1 }
      })
    )
    const dt = 0.1
    expect(brain - reflex).toBeCloseTo(1 * dt, 12)
    expect(frozen).toBe(reflex)
  })

  it('makes a faster learner pay proportionally more', () => {
    const config = resolveWorldConfig({ ...BRAIN, organisms: { learningCost: 1 } })
    const base = drain(config)
    const doubled = drain(config, 2 * config.genetics.learning.learningRate)
    const none = drain(resolveWorldConfig({ organisms: { learningCost: 1 } }))
    expect(doubled - none).toBeCloseTo(2 * (base - none), 12)
  })
})

describe('children and learning inheritance', () => {
  function birth(mode: 'baldwinian' | 'partial' | 'lamarckian', fraction = 0.5) {
    const config = resolveWorldConfig({
      ...BRAIN,
      genetics: {
        mutationRateScale: 0,
        mutationStrengthScale: 0,
        brain: { weightMutationRate: 0 },
        learningInheritance: { mode, fraction }
      }
    })
    const layout = brainLayoutOf(architectureOf(config.genetics.brain))
    const organisms = new OrganismStore()
    organisms.add(withBrain(config, 1, { x: 10, y: 10, age: 100, energy: 100 }))
    organisms.add(withBrain(config, 2, { x: 11, y: 10, age: 100, energy: 100 }))
    // Each parent "learned" a constant everywhere in its learnable weights.
    organisms.get(1)!.brain!.learned.fill(1)
    organisms.get(2)!.brain!.learned.fill(1)
    const index = new SpatialHash<OrganismState>(50, (o) => o)
    index.rebuild(organisms.values())
    const events = new EventLog(10)
    events.beginTick()
    makeReproduction(config, organisms, index, idsFrom(3), events).system.update(1)
    const child = organisms.get(3)!
    const parentTails = [1, 2].map((id) =>
      organisms.get(id)!.genome.brain.weights.slice(layout.learnOffset)
    )
    return { child, layout, parentTails }
  }

  it('starts every child with a fresh brain state seeded from its own genome', () => {
    const { child, layout } = birth('baldwinian')
    const brain = child.brain!
    expect(brain.decisions).toBe(0)
    expect(brain.memory.every((m) => m === 0)).toBe(true)
    expect(brain.eligibility.every((e) => e === 0)).toBe(true)
    expect(brain.learned).toEqual(child.genome.brain.weights.slice(layout.learnOffset))
  })

  it('baldwinian: the child inherits the genome weights, not what the parents learned', () => {
    const { child, layout, parentTails } = birth('baldwinian')
    const tail = child.genome.brain.weights.slice(layout.learnOffset)
    tail.forEach((w, i) => {
      expect([parentTails[0]![i], parentTails[1]![i]]).toContain(w)
    })
  })

  it('lamarckian: the child inherits what the parents learned', () => {
    const { child, layout } = birth('lamarckian')
    expect(child.genome.brain.weights.slice(layout.learnOffset).every((w) => w === 1)).toBe(true)
  })

  it('partial: the child inherits the stated fraction of the learned change', () => {
    const { child, layout, parentTails } = birth('partial', 0.5)
    const tail = child.genome.brain.weights.slice(layout.learnOffset)
    tail.forEach((w, i) => {
      const options = parentTails.map((p) => p[i]! + 0.5 * (1 - p[i]!))
      expect(options.some((o) => Math.abs(o - w) < 1e-12)).toBe(true)
    })
  })

  it('does not alter the non-learnable weights, whatever the mode', () => {
    const { child, layout, parentTails } = birth('lamarckian')
    expect(child.genome.brain.weights.slice(0, layout.learnOffset)).toHaveLength(260)
    expect(parentTails[0]).toHaveLength(54)
  })
})
