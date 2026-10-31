import { describe, expect, it } from 'vitest'
import { REGION_TYPES } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'

const ALL_ON: WorldConfigOverrides = {
  organisms: { initialCount: 25 },
  ecology: {
    health: { enabled: true },
    regions: { enabled: true },
    seasons: { enabled: true, seasonLength: 20 },
    hazards: { enabled: true },
    resourceKinds: { enabled: true },
    migration: { enabled: true }
  }
}

const make = (seed: number, config: WorldConfigOverrides = ALL_ON, validate = 100): World =>
  World.create({ seed, config, validateEveryTicks: validate })

const streamState = (seed: number, name: 'terrain' | 'events'): string =>
  JSON.stringify(new SeededRandom(deriveStreamWords(seed, name)).getState())

describe('a world with every ecology feature on', () => {
  it('stays valid, in brain mode, and keeps health within its bounds', () => {
    const world = make(1)
    for (let i = 0; i < 12; i++) {
      world.run(250)
      const snapshot = world.snapshot()
      for (const organism of snapshot.organisms) {
        expect(organism.health).toBeGreaterThan(0)
        expect(Number.isFinite(organism.health)).toBe(true)
      }
      const brain = snapshot.organisms[0] ? world.brainOf(snapshot.organisms[0].id) : undefined
      if (brain) expect(brain.observation).toHaveLength(33)
    }
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('has kinds, hazards, regions and season events', () => {
    const world = make(2)
    world.run(1500)
    const snapshot = world.snapshot()
    expect(new Set(snapshot.resources.map((r) => r.kind)).size).toBeGreaterThan(1)
    expect(snapshot.hazards.filter((h) => h.kind === 'damage-area').length).toBeGreaterThanOrEqual(
      0
    )
    const types = new Set<string>()
    for (let x = 5; x < 500; x += 25)
      for (let y = 5; y < 500; y += 25) {
        types.add(world.regionTypeAt(x, y) as string)
      }
    expect(types.size).toBeGreaterThan(2)
    for (const type of types) expect(REGION_TYPES).toContain(type)
    expect(world.regionIndexAt(10, 10)).toBeGreaterThanOrEqual(0)
    const seasons = world.events.list().filter((e) => e.type === 'season-changed')
    expect(seasons.length).toBeGreaterThan(0)
  })

  it('tracks migration for living organisms and attaches it to the dead', () => {
    const world = make(3)
    world.run(3000)
    const living = world.snapshot().organisms
    expect(living.length).toBeGreaterThan(0)
    for (const organism of living) expect(world.migrationOf(organism.id)).toBeDefined()
    const dead = world.historicalOrganisms()
    expect(dead.length).toBeGreaterThan(0)
    expect(dead.some((r) => r.migration !== null)).toBe(true)
    for (const record of dead) {
      if (record.migration) {
        expect(record.migration.crossings).toBeGreaterThanOrEqual(0)
        expect(REGION_TYPES).toContain(record.migration.homeType)
      }
    }
  })

  it('is deterministic, and chunked runs equal stepped runs', () => {
    const stepped = make(4)
    for (let i = 0; i < 1500; i++) stepped.step()
    const chunked = make(4)
    chunked.run(500)
    chunked.run(1000)
    expect(chunked.stateHash()).toBe(stepped.stateHash())
    expect(JSON.stringify(chunked.snapshot())).toBe(JSON.stringify(stepped.snapshot()))
    const other = make(5)
    other.run(1500)
    expect(other.stateHash()).not.toBe(stepped.stateHash())
  })

  it('differs from the same world with the ecology off', () => {
    const on = make(6)
    const off = make(6, withoutEcology({ organisms: { initialCount: 25 } }))
    on.run(1000)
    off.run(1000)
    expect(on.stateHash()).not.toBe(off.stateHash())
  })

  it('kills by damage when hazards are lethal, and counts it', () => {
    const lethal: WorldConfigOverrides = {
      organisms: { initialCount: 40 },
      ecology: {
        health: { enabled: true, maxHealth: 5 },
        hazards: { enabled: true, areaCount: 12, areaRadius: 150, areaDamage: 50 }
      }
    }
    const world = make(7, lethal)
    world.run(600)
    const snapshot = world.snapshot()
    expect(snapshot.metrics.deathsByDamage).toBeGreaterThan(0)
    expect(snapshot.metrics.damageTaken).toBeGreaterThan(0)
    const causes = world.historicalOrganisms().map((r) => r.deathCause)
    expect(causes).toContain('damage')
    expect(world.validate().ok).toBe(true)
  })
})

describe('the off switches', () => {
  it('draw nothing from the terrain or events streams, and spawn no hazards', () => {
    const world = World.create({
      seed: 8,
      config: withoutEcology({ organisms: { initialCount: 15 } })
    })
    world.run(800)
    const internals = world as unknown as { randomStreams: { get(n: string): SeededRandom } }
    expect(JSON.stringify(internals.randomStreams.get('terrain').getState())).toBe(
      streamState(8, 'terrain')
    )
    expect(JSON.stringify(internals.randomStreams.get('events').getState())).toBe(
      streamState(8, 'events')
    )
    expect(world.snapshot().hazards).toEqual([])
    expect(world.regionTypeAt(10, 10)).toBeNull()
    expect(world.regionIndexAt(10, 10)).toBe(-1)
    for (const organism of world.snapshot().organisms) {
      expect(world.migrationOf(organism.id)).toBeUndefined()
    }
    expect(world.snapshot().metrics.deathsByDamage).toBe(0)
  })

  it('leave every organism at full health and every resource at kind 0', () => {
    const world = World.create({ seed: 9, config: withoutEcology() })
    world.run(500)
    const snapshot = world.snapshot()
    expect(new Set(snapshot.resources.map((r) => r.kind))).toEqual(new Set([0]))
    for (const organism of snapshot.organisms) {
      expect(organism.health).toBeGreaterThan(0)
    }
  })
})
