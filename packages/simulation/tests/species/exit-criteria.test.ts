import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'

/**
 * Phase 6A exit criteria (roadmap 6.1-6.4): species are based on genetic distance, species can
 * split, and species can go extinct while remaining historically queryable. Bounds come from
 * measurements at the default threshold (docs/simulation/species.md, "Measured behavior").
 */
const run = (seed: number, ticks: number, config: WorldConfigOverrides = {}): World => {
  const world = World.create({ seed, config })
  world.run(ticks)
  return world
}

describe('Phase 6A: species exit criteria', () => {
  it('founders, which differ only in their brain weights, form one species', () => {
    for (const seed of [1, 2, 3, 4]) {
      const world = World.create({ seed })
      expect(world.species.size).toBe(1)
      expect(world.species.active()[0]?.memberCount).toBe(world.snapshot().population.active)
      expect(world.species.get(0)).toMatchObject({ ancestorSpeciesId: null, createdAtTick: 0 })
    }
  })

  it('species split as genomes drift, and each new species descends from its mother species', () => {
    const world = run(1, 30_000)
    const species = world.species.list()
    expect(species.length).toBeGreaterThanOrEqual(3)
    expect(species.length).toBeLessThanOrEqual(80)
    for (const s of species.slice(1)) {
      expect(s.ancestorSpeciesId).not.toBeNull()
      expect(s.ancestorSpeciesId as number).toBeLessThan(s.id)
      expect(s.createdAtTick).toBeGreaterThan(0)
    }
    // every species descends from species 0 here: the only founding species
    expect(world.species.descendants(0)).toEqual(species.slice(1).map((s) => s.id))
  })

  it('species go extinct and remain queryable with their history', () => {
    // Whether a given seed produces a long-lived extinct species is luck, so look across seeds.
    let longLived = 0
    for (const seed of [3, 4]) {
      const world = run(seed, 30_000)
      const extinct = world.species.list().filter((s) => s.extinctAtTick !== null)
      expect(extinct.length).toBeGreaterThanOrEqual(1)
      for (const s of extinct) {
        expect(s.memberCount).toBe(0)
        expect(world.species.get(s.id)).toEqual(s)
        expect(world.species.active().some((a) => a.id === s.id)).toBe(false)
      }
      // dead organisms still point at their extinct species
      const pointed = new Set(world.historicalOrganisms().map((r) => r.speciesId))
      expect(extinct.some((s) => pointed.has(s.id))).toBe(true)
      // a long-lived extinct species kept its population history
      for (const s of extinct.filter(
        (e) => (e.extinctAtTick as number) - e.createdAtTick > 2_000
      )) {
        longLived += 1
        expect(s.populationHistory.length).toBeGreaterThan(0)
        expect(s.populationHistory.every((p) => p.tick <= (s.extinctAtTick as number))).toBe(true)
      }
    }
    expect(longLived).toBeGreaterThanOrEqual(1)
  })

  it('keeps the number of living species bounded, and below the population', () => {
    for (const seed of [1, 3]) {
      const world = World.create({ seed })
      let maxActive = 0
      for (let i = 0; i < 30; i++) {
        world.run(1_000)
        const active = world.species.active().length
        maxActive = Math.max(maxActive, active)
        expect(active).toBeLessThanOrEqual(world.snapshot().population.active)
      }
      expect(maxActive).toBeLessThanOrEqual(20)
      expect(world.validate()).toEqual({ ok: true, errors: [] })
    }
  })

  it('more mutation gives more species (distance, not labels, drives speciation)', () => {
    const calm = run(1, 8_000, { genetics: { mutationRateScale: 0.2 } })
    const wild = run(1, 8_000, { genetics: { mutationRateScale: 3, mutationStrengthScale: 2 } })
    expect(wild.species.size).toBeGreaterThan(calm.species.size)
    // without mutation nothing diverges beyond founder noise, so there is a single species
    const frozen = run(1, 8_000, { genetics: { mutationRateScale: 0 } })
    expect(frozen.species.size).toBe(1)
  })

  it('threshold decides how finely species split', () => {
    const lumped = run(1, 8_000, { species: { threshold: 1 } })
    expect(lumped.species.size).toBe(1)
    const split = run(1, 8_000, { species: { threshold: 0 } })
    // distance 0 means identical genomes; every birth has a new genome, so every organism founds its own
    expect(split.species.size).toBe(split.snapshot().metrics.organismsBorn)
  })

  it('weights change what counts as different', () => {
    const brainOnly = {
      physical: 0,
      sensory: 0,
      metabolic: 0,
      behavioral: 0,
      reproduction: 0,
      learning: 0,
      brain: 1
    }
    const bodyOnly = { ...brainOnly, physical: 1, brain: 0 }
    const a = run(1, 8_000, { species: { distanceWeights: brainOnly, threshold: 0.02 } })
    const b = run(1, 8_000, { species: { distanceWeights: bodyOnly, threshold: 0.02 } })
    expect(JSON.stringify(a.species.list())).not.toBe(JSON.stringify(b.species.list()))
  })
})

describe('World.validate() guards the species registry', () => {
  it('fails if a member count is corrupted', () => {
    const world = run(1, 500)
    expect(world.validate().ok).toBe(true)
    const registry = (
      world as unknown as { speciesRegistry: { entries: { memberCount: number }[] } }
    ).speciesRegistry
    registry.entries[0]!.memberCount += 1
    const result = world.validate()
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('species 0 memberCount'))).toBe(true)
  })

  it('fails if a living organism loses its species', () => {
    const world = run(1, 500)
    const victim = world.snapshot().organisms[0]!
    const registry = (
      world as unknown as { speciesRegistry: { speciesByOrganism: Map<number, number> } }
    ).speciesRegistry
    registry.speciesByOrganism.delete(victim.id)
    const result = world.validate()
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes(`organism ${victim.id} has no species`))).toBe(true)
  })
})
