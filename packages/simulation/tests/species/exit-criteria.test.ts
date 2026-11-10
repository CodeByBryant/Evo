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
    // 80 until bites (ADR 0017): with no food wasted the population peaks near 90 instead of 40,
    // and species follow births. Seeds 1 to 4 end with 106, 163, 125 and 130 species (36, 22, 17
    // and 46 before). Still bounded, which is the claim; the threshold is re-tuned with the ecology.
    // After the 135 degree founder eye (ADR 0016) seeds 1 to 4 end with 225, 214, 215 and 207
    // (202, 219, 196 and 183 before it), so the limit moved from 220 to 260.
    // Colour no longer counts and the body plan does, with a threshold of 0.1 (ADR 0008 addendum):
    // seeds 1 to 4 end with 21, 32, 18 and 6 species created, so the limit was 60, the highest
    // measurement about doubled. Once every part type became reachable (ADR 0016) bodies really
    // differ more, and at the threshold of 0.12 seeds 1 to 4 end with 27, 44, 41 and 17 created: the
    // limit is 90, the highest about doubled. Still far below the 260 it was before the species fix.
    expect(species.length).toBeLessThanOrEqual(90)
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
    // Two 30,000-tick worlds; with bites (ADR 0017) they hold 2.5 times the creatures and CI runners
    // are slower than a laptop (69 s against the old 60 s default).
  }, 240_000)

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
      // 20 before bites (ADR 0017). Seeds 1 to 8 over 30,000 ticks peak at 39 to 48 living species
      // before directional eyes (mean 43.8) and 38 to 55 after (mean 44.3, seed 3 the outlier at 55)
      // with about 94 creatures at the peak: the spread moved with the dynamics, not the mean.
      // With colour out of the distance and the body plan in (ADR 0008 addendum) seeds 1, 3, 5 and 6
      // peak at 12, 7, 6 and 8 living species, so the limit was 25 (it was 60 against 38 to 55).
      // With every part type reachable (ADR 0016) and the threshold at 0.12 seeds 1, 3, 5 and 6
      // peak at 12, 14, 7 and 11, so the limit is 30.
      expect(maxActive).toBeLessThanOrEqual(30)
      expect(world.validate()).toEqual({ ok: true, errors: [] })
    }
    // Two 30,000-tick worlds take about 52 s on an idle laptop and 77 s on a busy one; the default
    // budget of 60 s timed out in the fresh-clone gate.
  }, 240_000)

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
