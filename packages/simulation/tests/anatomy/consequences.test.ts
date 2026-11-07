import { describe, expect, it } from 'vitest'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import type {
  DamageBuffer,
  IntentBuffer,
  PerceptionBuffer,
  RegenBuffer
} from '../../src/buffers/types'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { HazardStore } from '../../src/ecology/HazardStore'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { factorsOf } from '../../src/organisms/bodyFactors'
import { maxEnergyOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { HealthSystem } from '../../src/systems/HealthSystem'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { MetabolismSystem } from '../../src/systems/MetabolismSystem'
import { MovementSystem } from '../../src/systems/MovementSystem'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { organismFor } from '../support/organism'
import { withoutEcology } from '../support/ecology'

/**
 * What each part does to a creature (docs/decisions/0015). Every consequence has a system-level
 * test (the quantity really changes in the running system) and a negative: a dormant part adds
 * nothing but still costs, and nothing is ever free.
 */
const cfg = (extra: WorldConfigOverrides = {}): WorldConfig => resolveWorldConfig(extra)
const plain = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(withoutEcology(extra))

type Parts = FounderPart[]
const part = (
  type: FounderPart['type'],
  size: number,
  angle = 0,
  offset = 0.5,
  orientation = 0,
  stats: readonly number[] = []
): FounderPart => ({ type, parent: 0, size, angle, offset, orientation, integrity: 1, stats })

const founderParts = (config: WorldConfig): Parts => config.anatomy.founder.map((p) => ({ ...p }))
const without = (parts: Parts, ...types: FounderPart['type'][]): Parts =>
  parts.filter((p) => !types.includes(p.type))

/** The organism with this body (genome id, brain and scalar genes unchanged). */
function withBody(organism: OrganismState, config: WorldConfig, parts: Parts): OrganismState {
  const body = founderBodyVector({ ...config.anatomy, founder: parts })
  const genome = genomeFromParts({
    id: organism.genome.id,
    parentIds: organism.genome.parentIds,
    vector: genomeToVector(organism.genome),
    architecture: organism.genome.brain.architecture,
    weights: organism.genome.brain.weights,
    body
  })
  return { ...organism, genome }
}

const store = (...organisms: OrganismState[]): OrganismStore => {
  const s = new OrganismStore()
  for (const o of organisms) s.add(o)
  return s
}
const log = (): EventLog => {
  const events = new EventLog(100)
  events.beginTick()
  return events
}

describe('the founder body', () => {
  it('has exactly the factor 1 for everything (parts change nothing until a body differs)', () => {
    const config = cfg()
    const f = factorsOf(organismFor(config, 1).genome, config)
    expect([f.speed, f.strafe, f.turn, f.senseRange, f.reach, f.digestion]).toEqual([
      1, 1, 1, 1, 1, 1
    ])
    expect([f.toxinDamage, f.energyCapacity, f.damageTaken, f.temperatureTolerance]).toEqual([
      1, 1, 1, 1
    ])
    expect([f.regeneration, f.upkeepDelta]).toEqual([1, 0])
    expect(f.foodDetection.every((d) => d === 1)).toBe(true)
  })
})

describe('thrust: flagella and cilia move and turn the body', () => {
  const run = (config: WorldConfig, parts: Parts, intent: { thrust: number; turn: number }) => {
    const organism = withBody(organismFor(config, 1, { x: 200, y: 200 }), config, parts)
    const organisms = store(organism)
    const intents: IntentBuffer = new Map([[1, { ...intent, strafe: 0, interact: false }]])
    new MovementSystem(config, organisms, intents, log(), null).update(1)
    return organisms.get(1) as OrganismState
  }

  it('a body with more flagella is faster than the founder', () => {
    const config = plain()
    const founder = founderParts(config)
    const base = run(config, founder, { thrust: 1, turn: 0 })
    const fast = run(config, [...founder, part('flagellum', 0.6, 2.6, 0.8)], { thrust: 1, turn: 0 })
    expect(fast.x - 200).toBeGreaterThan(base.x - 200)
  })

  it('a body with no thrust parts cannot move at all', () => {
    const config = plain()
    const still = run(config, without(founderParts(config), 'flagellum', 'cilia'), {
      thrust: 1,
      turn: 0
    })
    expect(still.x).toBe(200)
    expect(still.y).toBe(200)
  })

  it('thrust off the axis turns the body: more torque, faster turning', () => {
    const config = plain()
    const founder = founderParts(config)
    const base = run(config, founder, { thrust: 0, turn: 10 })
    const turner = run(
      config,
      [
        ...founder,
        part('flagellum', 0.6, Math.PI / 2, 1),
        part('flagellum', 0.6, (3 * Math.PI) / 2, 1)
      ],
      { thrust: 0, turn: 10 }
    )
    expect(Math.abs(turner.heading)).toBeGreaterThan(Math.abs(base.heading))
  })

  it('a heavier body is slower for the same thrust (armor is mass)', () => {
    const config = plain()
    const founder = founderParts(config)
    const heavy = factorsOf(
      withBody(organismFor(config, 1), config, [...founder, part('armor', 1)]).genome,
      config
    )
    expect(heavy.speed).toBeLessThan(1)
  })
})

describe('senses: eyes set the range', () => {
  const sees = (config: WorldConfig, parts: Parts, fraction: number): boolean => {
    const organism = withBody(organismFor(config, 1, { x: 100, y: 100 }), config, parts)
    const resources = new ResourceStore()
    const distance = config.organisms.sensorRadius * fraction
    resources.add({ id: 9, x: 100 + distance, y: 100, remaining: 30, kind: 0 })
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(resources.values())
    const buffer: PerceptionBuffer = new Map()
    new PerceptionSystem(
      config,
      store(organism),
      index,
      buffer,
      undefined,
      null,
      undefined,
      undefined
    ).update(0)
    return buffer.get(1) !== null && buffer.get(1) !== undefined
  }

  it('more eyes see further than the founder; an eyeless body sees much less', () => {
    const config = plain()
    const founder = founderParts(config)
    expect(sees(config, founder, 1.4)).toBe(false)
    expect(sees(config, [...founder, part('eye', 1), part('eye', 1)], 1.4)).toBe(true)
    expect(sees(config, founder, 0.9)).toBe(true)
    expect(sees(config, without(founder, 'eye'), 0.9)).toBe(false)
  })

  it('every eye costs upkeep, so range is never free', () => {
    const config = cfg()
    const founder = founderParts(config)
    const org = organismFor(config, 1)
    const more = factorsOf(withBody(org, config, [...founder, part('eye', 1)]).genome, config)
    expect(more.senseRange).toBeGreaterThan(1)
    expect(more.upkeepDelta).toBeGreaterThan(0)
  })

  it('a sniffer finds its own kind of food from further and leaves the others alone', () => {
    const config = cfg()
    const founder = founderParts(config)
    const org = organismFor(config, 1)
    const kinds = config.ecology.resourceKinds.kinds.length
    const f = factorsOf(
      withBody(org, config, [...founder, part('sniffer', 1, 0, 0.5, 0, [0.5, 0.5, 0])]).genome,
      config
    )
    expect(f.foodDetection).toHaveLength(kinds)
    expect(f.foodDetection[0]).toBeGreaterThan(1)
    expect(f.foodDetection.slice(1).every((d) => d === 1)).toBe(true)
  })
})

describe('eating: mouths reach, intestines digest, stomachs hold, and a missing mouth idles them', () => {
  const eat = (config: WorldConfig, parts: Parts, gap: number, energy = 10) => {
    const organism = withBody(
      organismFor(config, 1, { x: 100, y: 100, energy, age: 120 }),
      config,
      parts
    )
    const organisms = store(organism)
    const resources = new ResourceStore()
    resources.add({ id: 9, x: 100 + gap, y: 100, remaining: 30, kind: 0 })
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(resources.values())
    new InteractionSystem(config, organisms, resources, index, log()).update(1)
    return { eaten: !resources.has(9), energy: (organisms.get(1) as OrganismState).energy }
  }

  it('a bigger mouth reaches food the founder cannot', () => {
    const config = plain()
    const founder = founderParts(config)
    const body = organismFor(config, 1).genome
    const gap = body.physical.radius * 1.25 + config.resources.radius
    expect(eat(config, founder, gap).eaten).toBe(false)
    expect(eat(config, [...founder, part('mouth', 1, 0, 1)], gap).eaten).toBe(true)
  })

  it('an intestine extracts more energy from the same food', () => {
    const config = plain()
    const founder = founderParts(config)
    const plainFed = eat(config, founder, 0.5)
    const digested = eat(config, [...founder, part('intestine', 1)], 0.5)
    expect(digested.energy).toBeGreaterThan(plainFed.energy)
    expect(plainFed.energy).toBe(10 + 30)
  })

  it('a stomach raises the energy a body can hold', () => {
    const config = plain()
    const founder = founderParts(config)
    const org = organismFor(config, 1)
    const more = maxEnergyOf(withBody(org, config, [...founder, part('stomach', 1)]).genome, config)
    expect(more).toBeGreaterThan(maxEnergyOf(withBody(org, config, founder).genome, config))
  })

  it('without a mouth the intestine and stomach go dormant: no gain, still a cost', () => {
    const config = plain()
    const founder = without(founderParts(config), 'mouth', 'stomach')
    const org = organismFor(config, 1)
    const base = factorsOf(withBody(org, config, founder).genome, config)
    const dormant = factorsOf(
      withBody(org, config, [...founder, part('intestine', 1), part('stomach', 1)]).genome,
      config
    )
    expect(dormant.digestion).toBe(base.digestion)
    expect(dormant.energyCapacity).toBe(base.energyCapacity)
    expect(dormant.toxinDamage).toBe(base.toxinDamage)
    expect(dormant.upkeepDelta).toBeGreaterThan(base.upkeepDelta)
  })

  it('an intestine tolerates toxins: toxic food hurts less', () => {
    const config = cfg()
    const founder = founderParts(config)
    const org = organismFor(config, 1)
    const f = factorsOf(withBody(org, config, [...founder, part('intestine', 1)]).genome, config)
    expect(f.toxinDamage).toBeLessThan(1)
    expect(f.toxinDamage).toBeGreaterThan(0)
  })
})

describe('health: armor shields, menders heal, membranes keep warm', () => {
  const health = (config: WorldConfig, parts: Parts, hurt: boolean) => {
    const organism = withBody(organismFor(config, 1, { x: 100, y: 100, energy: 90 }), config, parts)
    organism.health = hurt ? 40 : organism.health
    const organisms = store(organism)
    const hazards = new HazardStore()
    if (!hurt) {
      hazards.add({
        kind: 'storm',
        x: 100,
        y: 100,
        radius: 30,
        damagePerSecond: 20,
        expiresAtTick: null
      })
    }
    const toxins: DamageBuffer = new Map()
    const regen: RegenBuffer = new Map()
    new HealthSystem(
      config,
      organisms,
      hazards,
      toxins,
      regen,
      log(),
      new EcologyModel(config, null)
    ).update(1)
    return (organisms.get(1) as OrganismState).health - (hurt ? 40 : organismFor(config, 1).health)
  }

  it('armor reduces hazard damage, and never to nothing', () => {
    const config = cfg()
    const founder = founderParts(config)
    const bare = health(config, founder, false)
    const armored = health(config, [...founder, part('armor', 1), part('armor', 1)], false)
    expect(bare).toBeLessThan(0)
    expect(armored).toBeLessThan(0)
    expect(armored).toBeGreaterThan(bare)
  })

  it('a mender heals faster; without a stomach it is dormant and heals like the founder', () => {
    const config = cfg()
    const founder = founderParts(config)
    const base = health(config, founder, true)
    const mended = health(config, [...founder, part('mender', 1)], true)
    expect(mended).toBeGreaterThan(base)
    const noStomach = without(founder, 'stomach', 'mouth')
    const dormant = health(config, [...noStomach, part('mender', 1)], true)
    expect(dormant).toBe(health(config, noStomach, true))
  })

  it('a membrane widens the comfortable temperature range', () => {
    const config = cfg({ ecology: { regions: { temperatureTolerance: 0.05 } } })
    const eco = new EcologyModel(config, null)
    const founder = founderParts(config)
    const org = organismFor(config, 1)
    const membrane = factorsOf(
      withBody(org, config, [...founder, part('membrane', 1)]).genome,
      config
    )
    expect(membrane.temperatureTolerance).toBeGreaterThan(1)
    let compared = 0
    for (let tick = 0; tick < 4000; tick += 50) {
      const bare = eco.environmentalCost(0, 0, tick, 1)
      if (bare === 0) continue
      expect(eco.environmentalCost(0, 0, tick, membrane.temperatureTolerance)).toBeLessThan(bare)
      compared++
    }
    expect(compared).toBeGreaterThan(0)
  })
})

describe('upkeep: every part costs energy, dormant parts included', () => {
  const drain = (config: WorldConfig, parts: Parts): number => {
    const organism = withBody(organismFor(config, 1, { energy: 80 }), config, parts)
    const organisms = store(organism)
    const regen: RegenBuffer = new Map()
    new MetabolismSystem(config, organisms, log(), null, regen).update(1)
    return 80 - (organisms.get(1) as OrganismState).energy
  }

  it('a body with more parts burns more energy per tick', () => {
    const config = plain()
    const founder = founderParts(config)
    expect(drain(config, [...founder, part('eye', 1)])).toBeGreaterThan(drain(config, founder))
  })

  it('a dormant part burns energy and gives nothing back', () => {
    const config = plain()
    const base = without(founderParts(config), 'mouth', 'stomach')
    const withDormant = [...base, part('intestine', 1)]
    expect(drain(config, withDormant)).toBeGreaterThan(drain(config, base))
  })
})

describe('extreme bodies stay finite', () => {
  it('every factor is a finite number for a body of random parts', () => {
    const config = cfg()
    const org = organismFor(config, 1)
    const types: FounderPart['type'][] = [
      'flagellum',
      'cilia',
      'eye',
      'sniffer',
      'mouth',
      'intestine',
      'stomach',
      'armor',
      'membrane',
      'mender'
    ]
    let seed = 7
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    for (let trial = 0; trial < 100; trial++) {
      const parts: Parts = []
      for (let i = 0; i < 12; i++) {
        parts.push(
          part(
            types[Math.floor(next() * 10)] as FounderPart['type'],
            0.1 + next() * 0.9,
            next() * 6.28,
            next(),
            next() * 6.28,
            [next(), next(), next()]
          )
        )
      }
      const f = factorsOf(withBody(org, config, parts).genome, config)
      for (const value of [
        f.speed,
        f.strafe,
        f.turn,
        f.senseRange,
        f.reach,
        f.digestion,
        f.toxinDamage,
        f.energyCapacity,
        f.damageTaken,
        f.temperatureTolerance,
        f.regeneration,
        f.upkeepDelta,
        ...f.foodDetection
      ]) {
        expect(Number.isFinite(value)).toBe(true)
      }
      expect(f.damageTaken).toBeGreaterThan(0)
    }
  })
})
