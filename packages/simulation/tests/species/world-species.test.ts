import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { WorldConfigOverrides } from '@evo/contracts'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { EventLog } from '../../src/events/EventLog'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import { SpeciesRegistry } from '../../src/species/SpeciesRegistry'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { World } from '../../src/world/World'
import { fixture, genomeWith } from '../genetics/helpers'
import { idsFrom, makeReproduction, organismFor } from '../support/organism'

/** A small, fast world that still reproduces and diverges. */
const base: WorldConfigOverrides = {
  organisms: { initialCount: 20 },
  genetics: { mutationRateScale: 3, mutationStrengthScale: 2 }
}

const make = (seed: number, overrides: WorldConfigOverrides = {}): World =>
  World.create({
    seed,
    config: {
      ...base,
      ...overrides,
      genetics: { ...base.genetics, ...overrides.genetics },
      species: { ...overrides.species }
    }
  })

/** A string that changes if anything about any species changes. */
const digest = (world: World): string => JSON.stringify(world.species.list())

describe('World species', () => {
  it('assigns every founder a species and reports it everywhere', () => {
    const world = make(1)
    const snapshot = world.snapshot()
    expect(snapshot.organisms).toHaveLength(20)
    for (const organism of snapshot.organisms) {
      expect(organism.speciesId).not.toBeNull()
      expect(world.species.speciesOf(organism.id)).toBe(organism.speciesId)
    }
    const born = world.events.list().filter((e) => e.type === 'organism-born')
    expect(born).toHaveLength(20)
    for (const event of born) {
      expect(event.type === 'organism-born' && event.speciesId).toBe(
        world.species.speciesOf(event.organismId)
      )
    }
    expect(world.species.size).toBeGreaterThan(0)
    expect(world.species.size).toBeLessThanOrEqual(20)
  })

  it('keeps the registry consistent with the living population over a run', () => {
    const world = make(2)
    for (let i = 0; i < 20; i++) {
      world.run(150)
      expect(world.validate()).toEqual({ ok: true, errors: [] })
      const snapshot = world.snapshot()
      const members = world.species.active().reduce((sum, s) => sum + s.memberCount, 0)
      expect(members).toBe(snapshot.population.active)
      for (const organism of snapshot.organisms) {
        expect(world.species.get(organism.speciesId as number)?.extinctAtTick).toBeNull()
      }
    }
  })

  it('stamps births and deaths with the species and keeps extinct species queryable', () => {
    const world = make(3)
    world.run(3000)
    const records = world.historicalOrganisms()
    expect(records.length).toBeGreaterThan(0)
    for (const record of records) {
      expect(record.speciesId).not.toBeNull()
      expect(world.species.get(record.speciesId as number)).toBeDefined()
    }
    for (const event of world.events.list()) {
      if (event.type === 'organism-born') expect(event.speciesId).not.toBeNull()
    }
    for (const species of world.species.list()) {
      if (species.extinctAtTick !== null) {
        expect(species.memberCount).toBe(0)
        expect(species.extinctAtTick).toBeGreaterThanOrEqual(species.createdAtTick)
        expect(species.lastSeenTick).toBeLessThanOrEqual(species.extinctAtTick)
      }
    }
  })

  it('tracks descendants consistently with ancestry', () => {
    const world = make(4, { species: { threshold: 0.04 } })
    world.run(4000)
    for (const species of world.species.list()) {
      for (const ancestorId of world.species.ancestry(species.id)) {
        expect(world.species.descendants(ancestorId)).toContain(species.id)
      }
    }
  })

  it('is disabled by species.enabled: false', () => {
    const world = make(1, { species: { enabled: false } })
    world.run(500)
    expect(world.species.size).toBe(0)
    for (const organism of world.snapshot().organisms) expect(organism.speciesId).toBeNull()
    for (const record of world.historicalOrganisms()) expect(record.speciesId).toBeNull()
    expect(world.validate().ok).toBe(true)
  })

  it('does not change the simulation: species on and off hash identically', () => {
    for (const seed of [1, 5]) {
      const on = make(seed)
      const off = make(seed, { species: { enabled: false } })
      on.run(3000)
      off.run(3000)
      expect(on.stateHash()).toBe(off.stateHash())
      expect(on.events.emittedCount).toBe(off.events.emittedCount)
      expect(on.historicalOrganisms().map((r) => r.id)).toEqual(
        off.historicalOrganisms().map((r) => r.id)
      )
    }
  })

  it('is reproducible: the same seed gives the same registry, stepped or chunked', () => {
    const stepped = make(6)
    for (let i = 0; i < 2400; i++) stepped.step()
    const chunked = make(6)
    chunked.run(1000)
    chunked.run(1400)
    const again = make(6)
    again.run(2400)
    expect(digest(stepped)).toBe(digest(chunked))
    expect(digest(stepped)).toBe(digest(again))
    expect(stepped.stateHash()).toBe(chunked.stateHash())
  })

  it('gives different seeds different registries', () => {
    const a = make(7)
    const b = make(8)
    a.run(2000)
    b.run(2000)
    expect(digest(a)).not.toBe(digest(b))
  })
})

describe('reproductive isolation', () => {
  /** The species of each organism, from the born events (a species never changes). */
  function crossSpeciesPairs(world: World): number {
    const speciesOfOrganism = new Map<number, number>()
    let cross = 0
    for (const event of world.events.list()) {
      if (event.type !== 'organism-born' || event.speciesId === null) continue
      speciesOfOrganism.set(event.organismId, event.speciesId)
      if (event.parentIds.length === 2) {
        const [a, b] = event.parentIds as [number, number]
        if (speciesOfOrganism.get(a) !== speciesOfOrganism.get(b)) cross += 1
      }
    }
    return cross
  }

  it('is off by default and then labels only', () => {
    expect(resolveWorldConfig().species.reproductiveIsolation).toBe(false)
  })

  it('with isolation on, every child has two parents of the same species', () => {
    const world = make(9, {
      history: { maxEvents: 200_000 },
      species: { threshold: 0.03, reproductiveIsolation: true }
    })
    world.run(6000)
    expect(world.events.droppedCount).toBe(0)
    expect(world.species.size).toBeGreaterThan(1)
    expect(world.historicalOrganisms().length).toBeGreaterThan(0)
    expect(crossSpeciesPairs(world)).toBe(0)
  })

  describe('at the system level', () => {
    const f = fixture()
    const config = f.config
    const std = config.genetics.brain.initialWeightStd
    const mid = (spec: { min: number; max: number }): number => (spec.min + spec.max) / 2

    function setup(isolation: boolean, sameGenome: boolean) {
      const cfg = resolveWorldConfig({
        species: { threshold: 0.05, reproductiveIsolation: isolation }
      })
      const specs = buildGeneSpecs(cfg)
      const registry = new SpeciesRegistry(cfg.species, specs, std)
      const organisms = new OrganismStore()
      const a = organismFor(cfg, 1, { x: 10, y: 10, age: 100, energy: 100 })
      const b = organismFor(cfg, 2, { x: 11, y: 10, age: 100, energy: 100 })
      organisms.add(a)
      organisms.add(b)
      // two clearly different brains -> two species; or the same brain -> one species
      const ga = genomeWith(f, 1, mid, 0)
      const gb = genomeWith(f, 2, mid, sameGenome ? 0 : 0.9)
      registry.assign({ organismId: 1, genome: ga, parentOrganismId: null, tick: 0 })
      registry.assign({ organismId: 2, genome: gb, parentOrganismId: null, tick: 0 })
      const index = new SpatialHash<OrganismState>(50, (o) => o)
      index.rebuild(organisms.values())
      const events = new EventLog(20)
      events.beginTick()
      makeReproduction(cfg, organisms, index, idsFrom(3), events, {
        species: registry
      }).system.update(1)
      return { organisms, events, registry }
    }

    it('blocks cross-species mating when on', () => {
      const { organisms, events, registry } = setup(true, false)
      expect(registry.speciesOf(1)).not.toBe(registry.speciesOf(2))
      expect(organisms.size).toBe(2)
      expect(events.eventsThisTick().every((e) => e.type === 'reproduction-attempted')).toBe(true)
      expect(
        events.eventsThisTick().every((e) => e.type === 'reproduction-attempted' && !e.succeeded)
      ).toBe(true)
    })

    it('allows cross-species mating when off', () => {
      const { organisms, registry } = setup(false, false)
      expect(registry.speciesOf(1)).not.toBe(registry.speciesOf(2))
      expect(organisms.size).toBe(3)
    })

    it('allows same-species mating when on', () => {
      const { organisms, registry } = setup(true, true)
      expect(registry.speciesOf(1)).toBe(registry.speciesOf(2))
      expect(organisms.size).toBe(3)
      // the child joined a species too
      expect(registry.speciesOf(3)).toBeDefined()
    })
  })
})
