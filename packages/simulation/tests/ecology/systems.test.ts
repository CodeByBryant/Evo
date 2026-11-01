import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { OBSERVATION_LABELS, OBSERVATION_SIZE } from '@evo/contracts'
import type { RegionType, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { DamageBuffer, HazardBuffer, IntentBuffer, RegenBuffer } from '../../src/buffers/types'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { HazardStore } from '../../src/ecology/HazardStore'
import { MigrationTracker } from '../../src/ecology/MigrationTracker'
import { RegionMap } from '../../src/ecology/RegionMap'
import { IdGenerator } from '../../src/entities/IdGenerator'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { HistoryStore } from '../../src/history/HistoryStore'
import { LineageStore } from '../../src/lineage/LineageStore'
import { buildObservation } from '../../src/learning/ObservationBuilder'
import { computeReward } from '../../src/learning/RewardModel'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { DeathSystem } from '../../src/systems/DeathSystem'
import { EnvironmentSystem } from '../../src/systems/EnvironmentSystem'
import { HealthSystem } from '../../src/systems/HealthSystem'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { MetabolismSystem } from '../../src/systems/MetabolismSystem'
import { MigrationSystem } from '../../src/systems/MigrationSystem'
import { MovementSystem } from '../../src/systems/MovementSystem'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { maxHealthOf } from '../../src/organisms/traits'
import { withoutEcology } from '../support/ecology'
import { makeReproduction, organismFor, idsFrom } from '../support/organism'

type EcologyOverrides = NonNullable<WorldConfigOverrides['ecology']>

const stream = (seed: number, name: Parameters<typeof deriveStreamWords>[1]): SeededRandom =>
  new SeededRandom(deriveStreamWords(seed, name))

/** A reflex-controller world config with some ecology features switched on. */
const config = (ecology: EcologyOverrides = {}, extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(
    withoutEcology({
      ...extra,
      learning: { controller: 'reflex', ...(extra.learning ?? {}) },
      ecology
    })
  )

/** The first seed whose one-region map is of the given type: a world of a single region type. */
function seedForRegion(type: RegionType): number {
  for (let seed = 1; seed < 500; seed++) {
    const map = RegionMap.generate({ seedCount: 1, gridSize: 4 }, 500, 500, stream(seed, 'terrain'))
    if (map.typeOf(0) === type) return seed
  }
  throw new Error(`no seed makes a ${type} world`)
}

/** An ecology model for a config; with regions on it is a one-region world of `type`. */
function modelFor(cfg: WorldConfig, type?: RegionType): EcologyModel {
  if (!cfg.ecology.regions.enabled) return new EcologyModel(cfg, null)
  const seed = type === undefined ? 1 : seedForRegion(type)
  const map = RegionMap.generate(
    cfg.ecology.regions,
    cfg.environment.width,
    cfg.environment.height,
    stream(seed, 'terrain')
  )
  return new EcologyModel(cfg, map)
}

/** Regions on with a single point, so the whole world is one region type. */
const oneRegion = (extra: EcologyOverrides = {}): EcologyOverrides => ({
  ...extra,
  regions: { enabled: true, seedCount: 1, gridSize: 4, ...(extra.regions ?? {}) }
})

const resource = (id: number, overrides: Partial<ResourceState> = {}): ResourceState => ({
  id,
  x: 0,
  y: 0,
  remaining: 30,
  kind: 0,
  ...overrides
})

describe('EnvironmentSystem and the ecology', () => {
  function environment(cfg: WorldConfig, eco: EcologyModel | null, hazards = new HazardStore()) {
    const resources = new ResourceStore()
    const events = new EventLog(1000)
    events.beginTick()
    const random = stream(1, 'environment')
    const storms = stream(1, 'events')
    const system = new EnvironmentSystem(
      cfg,
      resources,
      new IdGenerator(),
      random,
      events,
      eco,
      hazards,
      storms
    )
    return { system, resources, events, hazards, random, storms }
  }
  const drawn = (random: SeededRandom, count: number, name: 'environment' | 'events'): boolean => {
    const reference = stream(1, name)
    for (let i = 0; i < count; i++) reference.float()
    return JSON.stringify(random.getState()) === JSON.stringify(reference.getState())
  }

  it('draws exactly two environment values per resource with every feature off', () => {
    const cfg = config({}, { resources: { initialCount: 12 } })
    for (const eco of [null, modelFor(cfg)]) {
      const { system, resources, random, storms } = environment(cfg, eco)
      system.spawnInitial(0)
      expect(resources.size).toBe(12)
      expect(drawn(random, 24, 'environment')).toBe(true)
      expect(drawn(storms, 0, 'events')).toBe(true)
    }
  })

  it('draws a kind and a position (three values) per resource when kinds are on', () => {
    const cfg = config({ resourceKinds: { enabled: true } }, { resources: { initialCount: 10 } })
    const { system, resources, random } = environment(cfg, modelFor(cfg))
    system.spawnInitial(0)
    expect(resources.size).toBe(10)
    expect(drawn(random, 30, 'environment')).toBe(true)
    const kinds = new Set(resources.values().map((r) => r.kind))
    expect(kinds.size).toBeGreaterThan(1)
    for (const r of resources.values()) {
      expect(r.remaining).toBe(
        cfg.resources.energyValue * (cfg.ecology.resourceKinds.kinds[r.kind]?.energyScale ?? NaN)
      )
    }
  })

  it('drops the spawn of a kind that grows in no region of this map', () => {
    const type: RegionType = 'meadow'
    const other: RegionType = 'cave'
    const kind = {
      name: 'cave moss',
      energyScale: 1,
      radiusScale: 1,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 0,
      regions: [other]
    }
    const cfg = config(oneRegion({ resourceKinds: { enabled: true, kinds: [kind] } }), {
      resources: { initialCount: 6 }
    })
    const { system, resources, events, random } = environment(cfg, modelFor(cfg, type))
    system.spawnInitial(0)
    expect(resources.size).toBe(0)
    expect(events.eventsThisTick()).toEqual([])
    // one kind draw plus eight attempts of two values, six times
    expect(drawn(random, 6 * 17, 'environment')).toBe(true)
  })

  it('keeps a kind that grows in the region and places it there', () => {
    const kind = {
      name: 'meadow clover',
      energyScale: 1.5,
      radiusScale: 2,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 0,
      regions: ['meadow' as const]
    }
    const cfg = config(oneRegion({ resourceKinds: { enabled: true, kinds: [kind] } }), {
      resources: { initialCount: 5 }
    })
    const { system, resources } = environment(cfg, modelFor(cfg, 'meadow'))
    system.spawnInitial(0)
    expect(resources.size).toBe(5)
    expect(resources.values()[0]?.remaining).toBe(cfg.resources.energyValue * 1.5)
  })

  it('multiplies the spawn rate by the season', () => {
    const seasons = (regeneration: number): EcologyOverrides => ({
      seasons: {
        enabled: true,
        seasons: {
          spring: { regeneration },
          summer: { regeneration },
          autumn: { regeneration },
          winter: { regeneration }
        }
      }
    })
    const spawned = (regeneration: number): number => {
      const cfg = config(seasons(regeneration), {
        resources: { initialCount: 0, spawnRate: 2, maxCount: 10_000 }
      })
      const { system, resources } = environment(cfg, modelFor(cfg))
      for (let tick = 1; tick <= 100; tick++) system.update(tick)
      return resources.size
    }
    expect(spawned(0)).toBe(0)
    expect(spawned(1)).toBe(20)
    expect(spawned(3)).toBe(60)
  })

  it('announces a new season exactly when the clock crosses a boundary', () => {
    const cfg = config(
      { seasons: { enabled: true, seasonLength: 1 } },
      {
        resources: { initialCount: 0, spawnRate: 0 }
      }
    )
    const { system, events } = environment(cfg, modelFor(cfg))
    const seen: Array<[number, string]> = []
    for (let tick = 1; tick <= 45; tick++) {
      events.beginTick()
      system.update(tick)
      for (const e of events.eventsThisTick()) {
        if (e.type === 'season-changed') seen.push([e.tick, e.season])
      }
    }
    expect(seen).toEqual([
      [10, 'summer'],
      [20, 'autumn'],
      [30, 'winter'],
      [40, 'spring']
    ])
  })

  it('places static damage areas only where the region has hazard exposure', () => {
    const volcanic = config(oneRegion({ hazards: { enabled: true, areaCount: 3 } }))
    const a = environment(volcanic, modelFor(volcanic, 'volcanic'))
    a.system.placeStaticHazards(0, stream(1, 'terrain'))
    expect(a.hazards.size).toBe(3)
    expect(
      a.hazards.values().every((h) => h.kind === 'damage-area' && h.expiresAtTick === null)
    ).toBe(true)
    expect(a.events.eventsThisTick().filter((e) => e.type === 'hazard-spawned')).toHaveLength(3)

    const meadow = config(oneRegion({ hazards: { enabled: true, areaCount: 3 } }))
    const b = environment(meadow, modelFor(meadow, 'meadow'))
    b.system.placeStaticHazards(0, stream(1, 'terrain'))
    expect(b.hazards.size).toBe(0)
  })

  it('places areas anywhere when regions are off, and draws nothing when hazards are off', () => {
    const on = config({ hazards: { enabled: true, areaCount: 4 } })
    const a = environment(on, modelFor(on))
    a.system.placeStaticHazards(0, stream(1, 'terrain'))
    expect(a.hazards.size).toBe(4)
    const off = config({ hazards: { enabled: false } })
    const terrain = stream(1, 'terrain')
    const b = environment(off, modelFor(off))
    b.system.placeStaticHazards(0, terrain)
    expect(b.hazards.size).toBe(0)
    expect(JSON.stringify(terrain.getState())).toBe(JSON.stringify(stream(1, 'terrain').getState()))
  })

  it('spawns storms from the events stream, expires them on time, and caps a tick at eight', () => {
    const cfg = config(
      { hazards: { enabled: true, areaCount: 0, stormRate: 20, stormDuration: 1 } },
      { resources: { initialCount: 0, spawnRate: 0 } }
    )
    const { system, hazards, events, storms, random } = environment(cfg, modelFor(cfg))
    events.beginTick()
    system.update(1)
    // 20 per second * 0.1 s = 2 per tick
    expect(hazards.size).toBe(2)
    expect(hazards.values()[0]).toMatchObject({ kind: 'storm', expiresAtTick: 1 + 10 })
    expect(drawn(storms, 4, 'events')).toBe(true)
    expect(drawn(random, 0, 'environment')).toBe(true)
    for (let tick = 2; tick <= 11; tick++) {
      events.beginTick()
      system.update(tick)
    }
    // the first two storms expire at tick 11 and are announced
    expect(events.eventsThisTick().filter((e) => e.type === 'hazard-expired')).toHaveLength(2)
    expect(hazards.values().every((h) => (h.expiresAtTick as number) > 11)).toBe(true)

    const flood = config(
      { hazards: { enabled: true, areaCount: 0, stormRate: 10_000 } },
      { resources: { initialCount: 0, spawnRate: 0 } }
    )
    const f = environment(flood, modelFor(flood))
    f.system.update(1)
    expect(f.hazards.size).toBe(8)
  })

  it('exposes its two remainders for hashing', () => {
    const cfg = config({ hazards: { enabled: true, areaCount: 0, stormRate: 0.25 } })
    const { system } = environment(cfg, modelFor(cfg))
    system.update(1)
    expect(system.spawnRemainder).toBeGreaterThan(0)
    expect(system.stormRemainder).toBeCloseTo(0.025, 12)
  })
})

describe('HealthSystem', () => {
  function health(cfg: WorldConfig, eco: EcologyModel, organisms: OrganismState[]) {
    const store = new OrganismStore()
    for (const o of organisms) store.add(o)
    const hazards = new HazardStore()
    const toxins: DamageBuffer = new Map()
    const regen: RegenBuffer = new Map()
    const events = new EventLog(100)
    events.beginTick()
    const system = new HealthSystem(cfg, store, hazards, toxins, regen, events, eco)
    return { system, store, hazards, toxins, regen, events }
  }
  const storm = {
    kind: 'storm' as const,
    x: 100,
    y: 100,
    radius: 20,
    damagePerSecond: 10,
    expiresAtTick: null
  }
  const base = config({ health: { enabled: true }, hazards: { enabled: true } })

  it('damages an organism inside a hazard by damagePerSecond * dt and records it', () => {
    const o = organismFor(base, 1, { x: 100, y: 100 })
    const { system, hazards, events } = health(base, modelFor(base), [o])
    hazards.add(storm)
    const before = o.health
    system.update(5)
    expect(o.health).toBeCloseTo(before - 10 * 0.1, 12)
    expect(events.eventsThisTick()).toEqual([
      {
        type: 'organism-damaged',
        tick: 5,
        organismId: 1,
        amount: expect.closeTo(1, 12),
        source: 'hazard',
        healthAfter: o.health,
        position: { x: 100, y: 100 }
      }
    ])
  })

  it('leaves an organism outside the circle alone, and treats the edge as inside', () => {
    const inside = organismFor(base, 1, { x: 120, y: 100 }) // exactly on the edge
    const outside = organismFor(base, 2, { x: 120.01, y: 100 })
    const { system, hazards } = health(base, modelFor(base), [inside, outside])
    hazards.add(storm)
    const max = outside.health
    system.update(1)
    expect(inside.health).toBeLessThan(max)
    expect(outside.health).toBe(max)
  })

  it('scales by the region exposure and the season intensity', () => {
    const cfg = config(
      oneRegion({
        health: { enabled: true },
        hazards: { enabled: true },
        seasons: { enabled: true }
      })
    )
    const o = organismFor(cfg, 1, { x: 100, y: 100 })
    const { system, hazards } = health(cfg, modelFor(cfg, 'desert'), [o])
    hazards.add(storm)
    const max = o.health
    system.update(6000) // winter
    const exposure = cfg.ecology.regions.types.desert.hazardExposure
    const intensity = cfg.ecology.seasons.seasons.winter.hazardIntensity
    expect(max - o.health).toBeCloseTo(10 * exposure * intensity * 0.1, 12)
  })

  it('applies toxin damage, and reports both sources together', () => {
    const o = organismFor(base, 1, { x: 100, y: 100 })
    const p = organismFor(base, 2, { x: 300, y: 300 })
    const { system, hazards, toxins, events } = health(base, modelFor(base), [o, p])
    hazards.add(storm)
    toxins.set(1, 4)
    toxins.set(2, 3)
    system.update(1)
    const byId = new Map(
      events.eventsThisTick().map((e) => [e.type === 'organism-damaged' ? e.organismId : -1, e])
    )
    expect(byId.get(1)).toMatchObject({ source: 'both' })
    expect(byId.get(2)).toMatchObject({ source: 'toxin', amount: 3 })
    expect(p.health).toBe(organismFor(base, 2).health - 3)
  })

  it('never takes health below zero and reports the real loss', () => {
    const o = organismFor(base, 1, { x: 100, y: 100, health: 0.25 })
    const { system, toxins, events } = health(base, modelFor(base), [o])
    toxins.set(1, 50)
    system.update(1)
    expect(o.health).toBe(0)
    expect(events.eventsThisTick()[0]).toMatchObject({ amount: 0.25, healthAfter: 0 })
  })

  it('heals a hurt, well-fed organism and passes the energy cost to metabolism', () => {
    const o = organismFor(base, 1, { energy: 80 })
    o.health = o.health - 10
    const { system, regen } = health(base, modelFor(base), [o])
    const hurt = o.health
    system.update(1)
    const rate = base.ecology.health.regenRate * base.timestep
    expect(o.health).toBeCloseTo(hurt + rate, 12)
    expect(regen.get(1)).toBeCloseTo(rate * base.ecology.health.regenEnergyCost, 12)
    expect(o.energy).toBe(80) // health does not touch energy itself
  })

  it('does not heal past the maximum, when hungry, or in the tick it was damaged', () => {
    const full = organismFor(base, 1, { energy: 80 })
    const max = full.health
    const nearly = organismFor(base, 2, { energy: 80, health: max - 0.01 })
    const hungry = organismFor(base, 3, { energy: 10, health: max - 5 })
    const hit = organismFor(base, 4, { energy: 80, health: max - 5 })
    const { system, toxins, regen } = health(base, modelFor(base), [full, nearly, hungry, hit])
    toxins.set(4, 1)
    system.update(1)
    expect(full.health).toBe(max)
    expect(nearly.health).toBeCloseTo(max, 12)
    expect(regen.get(2)).toBeCloseTo(0.01 * base.ecology.health.regenEnergyCost, 12)
    expect(hungry.health).toBe(max - 5)
    expect(regen.has(3)).toBe(false)
    expect(hit.health).toBe(max - 6)
    expect(regen.has(4)).toBe(false)
  })

  it('does nothing with health disabled, but still clears the regen buffer', () => {
    const cfg = config({ health: { enabled: false }, hazards: { enabled: true } })
    const o = organismFor(cfg, 1, { x: 100, y: 100 })
    const { system, hazards, toxins, regen, events } = health(cfg, modelFor(cfg), [o])
    hazards.add(storm)
    toxins.set(1, 9)
    regen.set(1, 5)
    const max = o.health
    system.update(1)
    expect(o.health).toBe(max)
    expect(regen.size).toBe(0)
    expect(events.eventsThisTick()).toEqual([])
  })

  it('scales maximum health with body size', () => {
    const big = organismFor(base, 1, {})
    expect(big.health).toBe(base.ecology.health.maxHealth)
  })
})

describe('DeathSystem and health', () => {
  const death = (organisms: OrganismState[]) => {
    const store = new OrganismStore()
    for (const o of organisms) store.add(o)
    const events = new EventLog(100)
    events.beginTick()
    new DeathSystem(store, events, new HistoryStore(10), new LineageStore()).update(3)
    return { store, events }
  }
  const cfg = config({ health: { enabled: true } })

  it('kills at zero health with cause damage, and starvation still comes first', () => {
    const dying = organismFor(cfg, 1, { health: 0 })
    const both = organismFor(cfg, 2, { health: 0, energy: 0 })
    const fine = organismFor(cfg, 3)
    const { store, events } = death([dying, both, fine])
    expect(store.size).toBe(1)
    const causes = events
      .eventsThisTick()
      .map((e) => (e.type === 'organism-died' ? `${e.organismId}:${e.cause}` : ''))
    expect(causes).toEqual(['1:damage', '2:starvation'])
  })
})

describe('InteractionSystem with resource kinds', () => {
  const kinds = [
    {
      name: 'plain',
      energyScale: 1,
      radiusScale: 1,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 0,
      regions: []
    },
    {
      name: 'big',
      energyScale: 2,
      radiusScale: 4,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 0,
      regions: []
    },
    {
      name: 'toxic',
      energyScale: 1,
      radiusScale: 1,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 7,
      regions: []
    }
  ]
  const cfg = config({ resourceKinds: { enabled: true, kinds }, health: { enabled: true } })

  function feed(placements: Array<{ kind: number; dx: number }>) {
    const eco = modelFor(cfg)
    const organisms = new OrganismStore()
    const o = organismFor(cfg, 1, { x: 100, y: 100, age: 100, energy: 10 })
    organisms.add(o)
    const resources = new ResourceStore()
    placements.forEach((p, i) =>
      resources.add(
        resource(i + 10, {
          x: 100 + p.dx,
          y: 100,
          kind: p.kind,
          remaining: eco.kind(p.kind).energy
        })
      )
    )
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(resources.values())
    const events = new EventLog(100)
    events.beginTick()
    const toxins: DamageBuffer = new Map()
    new InteractionSystem(cfg, organisms, resources, index, events, undefined, eco, toxins).update(
      2
    )
    return { o, resources, events, toxins }
  }

  it('uses each kind radius for reach and records the kind and its energy', () => {
    const body = organismFor(cfg, 1).genome.physical.radius
    const near = feed([{ kind: 0, dx: body + cfg.resources.radius - 0.5 }])
    expect(near.resources.size).toBe(0)
    expect(near.events.eventsThisTick()[0]).toMatchObject({ type: 'resource-consumed', kind: 0 })

    const tooFar = feed([{ kind: 0, dx: body + cfg.resources.radius + 0.5 }])
    expect(tooFar.resources.size).toBe(1)

    // the big kind has four times the radius, so the same distance now reaches it
    const big = feed([{ kind: 1, dx: body + cfg.resources.radius + 0.5 }])
    expect(big.resources.size).toBe(0)
    expect(big.o.energy).toBe(10 + cfg.resources.energyValue * 2)
    expect(big.events.eventsThisTick()[0]).toMatchObject({ kind: 1 })
  })

  it('writes the toxicity of a toxic kind for the health stage, and nothing for a benign one', () => {
    expect(feed([{ kind: 2, dx: 0 }]).toxins.get(1)).toBe(7)
    expect(feed([{ kind: 0, dx: 0 }]).toxins.size).toBe(0)
  })
})

describe('PerceptionSystem with the ecology', () => {
  function perceive(cfg: WorldConfig, eco: EcologyModel, resources: ResourceState[], tick = 0) {
    const organisms = new OrganismStore()
    organisms.add(organismFor(cfg, 1, { x: 100, y: 100 }))
    const store = new ResourceStore()
    for (const r of resources) store.add(r)
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(store.values())
    const buffer = new Map()
    new PerceptionSystem(organisms, index, buffer, undefined, eco).update(tick)
    return buffer.get(1) as { resourceId: number; kind: number } | null
  }
  const kinds = [
    {
      name: 'a',
      energyScale: 1,
      radiusScale: 1,
      spawnWeight: 1,
      detectability: 1,
      toxicity: 0,
      regions: []
    },
    {
      name: 'dim',
      energyScale: 1,
      radiusScale: 1,
      spawnWeight: 1,
      detectability: 0.5,
      toxicity: 0,
      regions: []
    }
  ]

  it('sees a low-detectability kind only within its share of the sensor radius', () => {
    const cfg = config({ resourceKinds: { enabled: true, kinds } })
    const radius = organismFor(cfg, 1).genome.sensory.sensorRadius
    const eco = modelFor(cfg)
    expect(
      perceive(cfg, eco, [resource(1, { x: 100 + radius * 0.4, kind: 1, y: 100 })])
    ).toMatchObject({ kind: 1 })
    expect(perceive(cfg, eco, [resource(1, { x: 100 + radius * 0.6, kind: 1, y: 100 })])).toBeNull()
    expect(
      perceive(cfg, eco, [resource(1, { x: 100 + radius * 0.6, kind: 0, y: 100 })])
    ).toMatchObject({ kind: 0 })
  })

  it('skips a hidden near resource for a visible farther one', () => {
    const cfg = config({ resourceKinds: { enabled: true, kinds } })
    const radius = organismFor(cfg, 1).genome.sensory.sensorRadius
    const found = perceive(cfg, modelFor(cfg), [
      resource(1, { x: 100 + radius * 0.7, kind: 1, y: 100 }),
      resource(2, { x: 100 + radius * 0.9, kind: 0, y: 100 })
    ])
    expect(found).toMatchObject({ resourceId: 2 })
  })

  it('shrinks the range with the region and season visibility', () => {
    const cfg = config(oneRegion({ seasons: { enabled: true } }))
    const radius = organismFor(cfg, 1).genome.sensory.sensorRadius
    const cave = cfg.ecology.regions.types.cave.visibility
    const winter = cfg.ecology.seasons.seasons.winter.visibility
    // a target just inside the meadow-in-spring range but outside the cave's and winter's
    const reach = Math.max(cave, winter)
    const target = resource(1, { x: 100 + radius * (reach + (1 - reach) / 2), y: 100 })
    expect(cave).toBeLessThan(1)
    expect(winter).toBeLessThan(1)
    expect(perceive(cfg, modelFor(cfg, 'cave'), [target], 0)).toBeNull()
    const meadow = modelFor(cfg, 'meadow')
    expect(perceive(cfg, meadow, [target], 0)).not.toBeNull()
    expect(perceive(cfg, meadow, [target], 6000)).toBeNull()
  })

  it('is identical to the plain nearest scan when every feature is off', () => {
    const cfg = config()
    const eco = modelFor(cfg)
    const set = [
      resource(1, { x: 130, y: 100 }),
      resource(2, { x: 110, y: 105 }),
      resource(3, { x: 400, y: 400 })
    ]
    expect(perceive(cfg, eco, set)).toMatchObject({ resourceId: 2, kind: 0 })
  })

  it('finds the hazard whose edge is nearest, within the sensor range', () => {
    const cfg = config({ hazards: { enabled: true } })
    const eco = modelFor(cfg)
    const organisms = new OrganismStore()
    const o = organismFor(cfg, 1, { x: 100, y: 100 })
    organisms.add(o)
    const hazards = new HazardStore()
    hazards.add({
      kind: 'damage-area',
      x: 160,
      y: 100,
      radius: 5,
      damagePerSecond: 1,
      expiresAtTick: null
    })
    hazards.add({
      kind: 'storm',
      x: 100,
      y: 170,
      radius: 40,
      damagePerSecond: 1,
      expiresAtTick: null
    })
    hazards.add({
      kind: 'storm',
      x: 900,
      y: 900,
      radius: 5,
      damagePerSecond: 1,
      expiresAtTick: null
    })
    const buffer: HazardBuffer = new Map()
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild([])
    new PerceptionSystem(organisms, index, new Map(), undefined, eco, { hazards, buffer }).update(0)
    // edge distances: first = 60 - 5 = 55, second = 70 - 40 = 30, third is out of range
    expect(buffer.get(1)).toMatchObject({ hazardId: 1, radius: 40 })
    o.y = 135 // now inside the second hazard: edge distance 0
    new PerceptionSystem(organisms, index, new Map(), undefined, eco, { hazards, buffer }).update(0)
    expect(buffer.get(1)).toMatchObject({ hazardId: 1 })
    o.x = 900
    o.y = 400
    new PerceptionSystem(organisms, index, new Map(), undefined, eco, { hazards, buffer }).update(0)
    expect(buffer.get(1)).toBeNull()
  })
})

describe('MovementSystem, MetabolismSystem and ReproductionSystem with the ecology', () => {
  it('scales top speed by region and season', () => {
    const cfg = config(oneRegion({ seasons: { enabled: true } }))
    const run = (type: RegionType, tick: number): number => {
      const organisms = new OrganismStore()
      const o = organismFor(cfg, 1, { x: 100, y: 100, age: 100 })
      organisms.add(o)
      const intents: IntentBuffer = new Map([
        [1, { turn: 0, thrust: 1, strafe: 0, interact: true }]
      ])
      const events = new EventLog(10)
      events.beginTick()
      new MovementSystem(cfg, organisms, intents, events, modelFor(cfg, type)).update(tick)
      return o.x - 100
    }
    const flat = run('meadow', 0)
    expect(flat).toBeCloseTo(cfg.organisms.maxSpeed * cfg.timestep, 9)
    const desert = cfg.ecology.regions.types.desert.movementScale
    const winter = cfg.ecology.seasons.seasons.winter.movementScale
    expect(run('desert', 0)).toBeCloseTo(flat * desert, 9)
    expect(run('desert', 6000)).toBeCloseTo(flat * desert * winter, 9)
  })

  it('charges environmental cost outside the comfortable temperature and the healing energy', () => {
    const cfg = config(oneRegion({ health: { enabled: true } }))
    const energyAfter = (type: RegionType, regenCost = 0): number => {
      const organisms = new OrganismStore()
      const o = organismFor(cfg, 1, { x: 100, y: 100, age: 100, energy: 50 })
      organisms.add(o)
      const regen: RegenBuffer = new Map(regenCost > 0 ? [[1, regenCost]] : [])
      const events = new EventLog(10)
      events.beginTick()
      new MetabolismSystem(cfg, organisms, events, modelFor(cfg, type), regen).update(1)
      return o.energy
    }
    const comfortable = energyAfter('meadow')
    const { temperatureTolerance, temperatureCost } = cfg.ecology.regions
    const excess = cfg.ecology.regions.types.volcanic.temperature - temperatureTolerance
    expect(excess).toBeGreaterThan(0)
    // spring has no temperature offset, so the cost is the quadratic charge on the excess
    expect(comfortable - energyAfter('volcanic')).toBeCloseTo(
      temperatureCost * excess * excess * cfg.timestep,
      12
    )
    expect(energyAfter('meadow', 0.3)).toBeCloseTo(comfortable - 0.3, 12)
  })

  it('divides the reproduction cost by the region scale, and gives the child full health', () => {
    const cfg = config(oneRegion())
    const attempt = (type: RegionType, conf: WorldConfig = cfg) => {
      const organisms = new OrganismStore()
      organisms.add(organismFor(conf, 1, { x: 10, y: 10, age: 100, energy: 100 }))
      organisms.add(organismFor(conf, 2, { x: 11, y: 10, age: 100, energy: 100 }))
      const index = new SpatialHash<OrganismState>(50, (o) => o)
      index.rebuild(organisms.values())
      const events = new EventLog(20)
      events.beginTick()
      const { system } = makeReproduction(conf, organisms, index, idsFrom(3), events, {
        ecology: modelFor(conf, type)
      })
      system.update(1)
      return { organisms, events }
    }
    const cost = cfg.reproduction.offspringInvestment * (1 + cfg.reproduction.overheadFraction)
    const scale = (type: RegionType): number => cfg.ecology.regions.types[type].reproductionScale

    const meadow = attempt('meadow')
    expect(meadow.organisms.size).toBe(3)
    const child = meadow.organisms.get(3) as OrganismState
    expect(child.health).toBe(maxHealthOf(child.genome, cfg))
    expect(meadow.organisms.get(1)?.energy).toBeCloseTo(100 - cost / scale('meadow'), 12)

    // a harsher region makes reproduction costlier but, below the energy cap, still possible
    const volcanic = attempt('volcanic')
    expect(scale('volcanic')).toBeLessThan(1)
    expect(volcanic.organisms.size).toBe(3)
    expect(volcanic.organisms.get(1)?.energy).toBeCloseTo(100 - cost / scale('volcanic'), 12)
    // a more fertile one makes it cheaper
    const wetland = attempt('wetland')
    expect(wetland.organisms.get(1)?.energy).toBeCloseTo(100 - cost / scale('wetland'), 12)
    expect(wetland.organisms.get(1)?.energy).toBeGreaterThan(
      meadow.organisms.get(1)?.energy as number
    )

    // a scale so small the cost exceeds the organism's energy blocks it silently
    const barren = config(
      oneRegion({ regions: { types: { volcanic: { reproductionScale: 0.1 } } } })
    )
    const blocked = attempt('volcanic', barren)
    expect(blocked.organisms.size).toBe(2)
    expect(blocked.events.eventsThisTick()).toEqual([])
  })
})

describe('MigrationTracker and MigrationSystem', () => {
  it('records a home region, crossings, distance outside home and the dwell rule', () => {
    const tracker = new MigrationTracker(1)
    tracker.observe(1, 0, 0, 3, 'meadow', 0.1)
    expect(tracker.summary(1)).toMatchObject({ homeRegion: 3, crossings: 0, migrated: false })
    tracker.observe(1, 3, 4, 3, 'meadow', 0.1) // still home
    expect(tracker.summary(1)?.distanceOutsideHome).toBe(0)
    tracker.observe(1, 6, 8, 5, 'forest', 0.4) // crosses; moved 5
    expect(tracker.summary(1)).toMatchObject({
      crossings: 1,
      currentRegion: 5,
      currentType: 'forest',
      distanceOutsideHome: 5
    })
    tracker.observe(1, 6, 8, 5, 'forest', 0.4)
    expect(tracker.summary(1)?.migrated).toBe(false) // 0.8 s outside
    tracker.observe(1, 6, 8, 5, 'forest', 0.4)
    expect(tracker.summary(1)?.migrated).toBe(true) // 1.2 s
    tracker.observe(1, 6, 8, 3, 'meadow', 0.1) // goes home: stays migrated, counts a crossing
    expect(tracker.summary(1)).toMatchObject({ migrated: true, crossings: 2 })
  })

  it('resets the dwell timer when the organism returns home before the dwell time', () => {
    const tracker = new MigrationTracker(1)
    tracker.observe(1, 0, 0, 1, 'meadow', 0.1)
    tracker.observe(1, 1, 0, 2, 'forest', 0.6)
    tracker.observe(1, 0, 0, 1, 'meadow', 0.1)
    tracker.observe(1, 1, 0, 2, 'forest', 0.6)
    expect(tracker.summary(1)?.migrated).toBe(false)
  })

  it('finishes (and forgets) an organism, and knows nothing about strangers', () => {
    const tracker = new MigrationTracker(1)
    tracker.observe(1, 0, 0, 0, 'cave', 0.1)
    expect(tracker.finish(1)).toMatchObject({ homeType: 'cave' })
    expect(tracker.finish(1)).toBeNull()
    expect(tracker.summary(9)).toBeUndefined()
    expect(tracker.size).toBe(0)
  })

  it('is fed by MigrationSystem only when migration and regions are on', () => {
    const on = config(oneRegion({ migration: { enabled: true } }))
    const organisms = new OrganismStore()
    organisms.add(organismFor(on, 1, { x: 100, y: 100 }))
    const tracker = new MigrationTracker(20)
    new MigrationSystem(on, organisms, modelFor(on, 'cave'), tracker).update()
    expect(tracker.summary(1)).toMatchObject({ homeType: 'cave', homeRegion: 0 })

    const noRegions = config({ migration: { enabled: true } })
    const t2 = new MigrationTracker(20)
    new MigrationSystem(noRegions, organisms, modelFor(noRegions), t2).update()
    expect(t2.size).toBe(0)

    const off = config(oneRegion({ migration: { enabled: false } }))
    const t3 = new MigrationTracker(20)
    new MigrationSystem(off, organisms, modelFor(off, 'cave'), t3).update()
    expect(t3.size).toBe(0)
  })
})

describe('the brain inputs and reward terms', () => {
  const base = {
    energy: 0.5,
    age: 0.1,
    x: 250,
    y: 250,
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

  it('has thirty-seven labelled slots in the documented order', () => {
    expect(OBSERVATION_SIZE).toBe(37)
    expect(OBSERVATION_LABELS.slice(23, 33)).toEqual([
      'ownHealth',
      'hazardPresent',
      'hazardBearingCos',
      'hazardBearingSin',
      'hazardProximity',
      'foodKind',
      'seasonCos',
      'seasonSin',
      'regionTemperature',
      'regionMovementScale'
    ])
    expect(OBSERVATION_LABELS.slice(33)).toEqual([
      'matePresent',
      'mateBearingCos',
      'mateBearingSin',
      'mateProximity'
    ])
  })

  it('appends neutral values by default and leaves the first 23 slots untouched', () => {
    const plain = buildObservation(base)
    expect(plain).toHaveLength(37)
    expect(plain.slice(23, 33)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 1])
    expect(plain.slice(33)).toEqual([0, 0, 0, 0])
    const rich = buildObservation({
      ...base,
      health: 0.4,
      foodKind: 0.5,
      seasonCos: -1,
      seasonSin: 0.25,
      temperature: -0.5,
      movementScale: 0.8
    })
    expect(rich.slice(0, 23)).toEqual(plain.slice(0, 23))
    expect(rich.slice(23, 33)).toEqual([0.4, 0, 0, 0, 0, 0.5, -1, 0.25, -0.5, 0.8])
  })

  it('encodes a hazard ahead, inside it, and beside it in the body frame', () => {
    const ahead = buildObservation({
      ...base,
      hazard: { dx: 40, dy: 0, distanceSquared: 1600, radius: 10 }
    })
    expect(ahead.slice(24, 28)).toEqual([1, 1, 0, 1 - 30 / 60])
    const inside = buildObservation({
      ...base,
      hazard: { dx: 5, dy: 0, distanceSquared: 25, radius: 10 }
    })
    expect(inside[27]).toBe(1)
    const left = buildObservation({
      ...base,
      hazard: { dx: 0, dy: 40, distanceSquared: 1600, radius: 10 }
    })
    expect(left[25]).toBeCloseTo(0, 12)
    expect(left[26]).toBeCloseTo(1, 12)
  })

  it('clamps every appended value into its range', () => {
    const wild = buildObservation({
      ...base,
      health: 9,
      foodKind: 9,
      seasonCos: 9,
      seasonSin: -9,
      temperature: 9,
      movementScale: 9
    })
    expect(wild.slice(23, 33)).toEqual([1, 0, 0, 0, 0, 1, 1, -1, 1, 1])
  })

  it('encodes an eligible partner like any other sighting, and zeros without one', () => {
    const none = buildObservation(base)
    expect(none.slice(33)).toEqual([0, 0, 0, 0])
    const ahead = buildObservation({ ...base, mate: { dx: 40, dy: 0, distanceSquared: 1600 } })
    expect(ahead.slice(33)).toEqual([1, 1, 0, 1 - 40 / 60])
    const left = buildObservation({ ...base, mate: { dx: 0, dy: 30, distanceSquared: 900 } })
    expect(left[33]).toBe(1)
    expect(left[34]).toBeCloseTo(0, 12)
    expect(left[35]).toBeCloseTo(1, 12)
    // a partner beyond the sensor radius (the mating signal is longer-ranged) has no proximity
    const far = buildObservation({ ...base, mate: { dx: 200, dy: 0, distanceSquared: 40000 } })
    expect(far.slice(33)).toEqual([1, 1, 0, 0])
    // the first 33 slots are unaffected by a mate
    expect(ahead.slice(0, 33)).toEqual(none.slice(0, 33))
  })

  it('subtracts damage scaled by the weight and by one minus riskTolerance', () => {
    const weights = { feeding: 1, reproduction: 0.5, energyCost: 5, damage: 4, exploration: 0 }
    const input = { energyGained: 0, reproduced: false, energyCost: 0, capacity: 100, damage: 0.25 }
    expect(computeReward({ ...input, riskTolerance: 0 }, weights).damage).toBeCloseTo(1, 12)
    expect(computeReward({ ...input, riskTolerance: 0.5 }, weights).damage).toBeCloseTo(0.5, 12)
    expect(computeReward({ ...input, riskTolerance: 1 }, weights).damage).toBe(0)
    expect(computeReward({ ...input, riskTolerance: 0.5 }, weights).total).toBeCloseTo(-0.5, 12)
    // zero weight or zero damage: no term
    expect(computeReward(input, { ...weights, damage: 0 }).damage).toBe(0)
    expect(computeReward({ ...input, damage: 0 }, weights).damage).toBe(0)
  })

  it('adds exploration only for a new cell, scaled by noveltyPreference', () => {
    const weights = { feeding: 1, reproduction: 0.5, energyCost: 5, damage: 0, exploration: 0.2 }
    const input = { energyGained: 0, reproduced: false, energyCost: 0, capacity: 100 }
    expect(
      computeReward({ ...input, novel: true, noveltyPreference: 0.5 }, weights).exploration
    ).toBeCloseTo(0.1, 12)
    expect(
      computeReward({ ...input, novel: false, noveltyPreference: 0.5 }, weights).exploration
    ).toBe(0)
    expect(
      computeReward({ ...input, novel: true, noveltyPreference: 0 }, weights).exploration
    ).toBe(0)
    expect(
      computeReward({ ...input, novel: true, noveltyPreference: 1 }, weights).total
    ).toBeCloseTo(0.2, 12)
  })

  it('leaves the Phase 5 reward unchanged when the new weights are zero', () => {
    const weights = { feeding: 1, reproduction: 0.5, energyCost: 5, damage: 0, exploration: 0 }
    const reward = computeReward(
      {
        energyGained: 30,
        reproduced: true,
        energyCost: 0.05,
        capacity: 100,
        damage: 0.4,
        novel: true,
        noveltyPreference: 1,
        riskTolerance: 0
      },
      weights
    )
    expect(reward.total).toBeCloseTo(0.3 + 0.5 - 0.0025, 12)
  })
})
