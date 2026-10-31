import { describe, expect, it } from 'vitest'
import type { Genome, SpeciesConfig, SpeciesDistanceWeights } from '@evo/contracts'
import { genomeDistance, weightedDistance } from '../../src/genetics/GeneticDistance'
import { SpeciesRegistry } from '../../src/species/SpeciesRegistry'
import { fixture, genomeWith } from '../genetics/helpers'
import type { Fixture } from '../genetics/helpers'

const f: Fixture = fixture()
const std = f.config.genetics.brain.initialWeightStd
const baselineGene = (spec: { min: number; max: number }): number => (spec.min + spec.max) / 2

/** A genome whose scalar genes are mid-range and whose brain weights are all `weight`. */
const genome = (id: number, weight: number): Genome => genomeWith(f, id, baselineGene, weight)

function registry(overrides: Partial<SpeciesConfig> = {}): SpeciesRegistry {
  return new SpeciesRegistry({ ...f.config.species, ...overrides }, f.specs, std)
}

describe('weightedDistance', () => {
  const distance = genomeDistance(genome(0, 0), genome(1, 0.3), f.specs, std)

  it('is zero for identical genomes', () => {
    const same = genomeDistance(genome(0, 0.1), genome(1, 0.1), f.specs, std)
    expect(weightedDistance(same, f.config.species.distanceWeights)).toBe(0)
  })

  it('equals the unweighted total when every weight is equal', () => {
    const equal: SpeciesDistanceWeights = {
      physical: 1,
      sensory: 1,
      metabolic: 1,
      behavioral: 1,
      reproduction: 1,
      learning: 1,
      brain: 1
    }
    expect(weightedDistance(distance, equal)).toBeCloseTo(distance.total, 12)
  })

  it('with a single nonzero weight equals that group', () => {
    const only = (group: keyof SpeciesDistanceWeights): SpeciesDistanceWeights => ({
      physical: 0,
      sensory: 0,
      metabolic: 0,
      behavioral: 0,
      reproduction: 0,
      learning: 0,
      brain: 0,
      [group]: 7
    })
    expect(weightedDistance(distance, only('brain'))).toBeCloseTo(distance.brain, 12)
    expect(weightedDistance(distance, only('physical'))).toBe(0)
  })

  it('is invariant to scaling all weights and is zero for all-zero weights', () => {
    const w = f.config.species.distanceWeights
    const scaled = Object.fromEntries(
      Object.entries(w).map(([key, value]) => [key, value * 10])
    ) as unknown as SpeciesDistanceWeights
    expect(weightedDistance(distance, scaled)).toBeCloseTo(weightedDistance(distance, w), 12)
    const zero = Object.fromEntries(
      Object.entries(w).map(([key]) => [key, 0])
    ) as unknown as SpeciesDistanceWeights
    expect(weightedDistance(distance, zero)).toBe(0)
  })

  it('stays within [0, 1]', () => {
    const far = genomeDistance(genome(0, -5), genome(1, 5), f.specs, std)
    const value = weightedDistance(far, f.config.species.distanceWeights)
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThanOrEqual(1)
  })
})

describe('SpeciesRegistry assignment', () => {
  it('founds species 0 for the first organism, with no ancestor', () => {
    const r = registry()
    expect(r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })).toBe(
      0
    )
    expect(r.get(0)).toMatchObject({
      id: 0,
      representativeGenomeId: 0,
      ancestorSpeciesId: null,
      memberCount: 1,
      createdAtTick: 0,
      extinctAtTick: null
    })
    expect(r.speciesOf(0)).toBe(0)
  })

  it('puts a close genome in the existing species and a far genome in a new one', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    // brain distance 0.5 -> weighted well under the threshold
    expect(r.assign({ organismId: 1, genome: genome(1, 0.3), parentOrganismId: 0, tick: 1 })).toBe(
      0
    )
    // brain distance 1 -> weighted over the threshold
    expect(r.assign({ organismId: 2, genome: genome(2, 0.9), parentOrganismId: 0, tick: 2 })).toBe(
      1
    )
    expect(r.get(0)?.memberCount).toBe(2)
    expect(r.get(1)).toMatchObject({ ancestorSpeciesId: 0, createdAtTick: 2, memberCount: 1 })
  })

  it('joins the nearest species, and the lower id on an exact tie', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0.3), parentOrganismId: null, tick: 0 })
    r.assign({ organismId: 1, genome: genome(1, -0.3), parentOrganismId: 0, tick: 0 })
    expect(r.size).toBe(2)
    // equidistant from both representatives
    expect(r.assign({ organismId: 2, genome: genome(2, 0), parentOrganismId: 1, tick: 1 })).toBe(0)
    // closer to species 1
    expect(
      r.assign({ organismId: 3, genome: genome(3, -0.25), parentOrganismId: 1, tick: 1 })
    ).toBe(1)
  })

  it('treats the threshold as inclusive', () => {
    const exact = weightedDistance(
      genomeDistance(genome(0, 0), genome(1, 0.3), f.specs, std),
      f.config.species.distanceWeights
    )
    const at = registry({ threshold: exact })
    at.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    expect(at.assign({ organismId: 1, genome: genome(1, 0.3), parentOrganismId: 0, tick: 0 })).toBe(
      0
    )
    const below = registry({ threshold: exact - 1e-9 })
    below.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    expect(
      below.assign({ organismId: 1, genome: genome(1, 0.3), parentOrganismId: 0, tick: 0 })
    ).toBe(1)
  })

  it('never changes a species representative', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.assign({ organismId: 1, genome: genome(1, 0.3), parentOrganismId: 0, tick: 1 })
    expect(r.get(0)?.representativeGenomeId).toBe(0)
  })

  it('rejects assigning the same organism twice', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    expect(() =>
      r.assign({ organismId: 0, genome: genome(1, 0), parentOrganismId: null, tick: 1 })
    ).toThrow(/already has a species/)
  })

  it('is deterministic: the same inputs give the same registry', () => {
    const build = (): string => {
      const r = registry()
      const weights = [0, 0.3, 0.9, 0.2, -0.9, -0.3, 0.6]
      weights.forEach((w, i) =>
        r.assign({
          organismId: i,
          genome: genome(i, w),
          parentOrganismId: i === 0 ? null : 0,
          tick: i
        })
      )
      return JSON.stringify(r.list())
    }
    expect(build()).toBe(build())
  })
})

describe('SpeciesRegistry extinction', () => {
  it('marks a species extinct when its last member dies, and keeps it', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.assign({ organismId: 1, genome: genome(1, 0.9), parentOrganismId: 0, tick: 1 })
    r.release(1, 5)
    expect(r.get(1)).toMatchObject({ memberCount: 0, extinctAtTick: 5 })
    expect(r.active().map((s) => s.id)).toEqual([0])
    expect(r.list().map((s) => s.id)).toEqual([0, 1])
    expect(r.speciesOf(1)).toBeUndefined()
  })

  it('does not extinguish a species that still has members', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.assign({ organismId: 1, genome: genome(1, 0.1), parentOrganismId: 0, tick: 0 })
    r.release(0, 3)
    expect(r.get(0)).toMatchObject({ memberCount: 1, extinctAtTick: null })
  })

  it('never rejoins an extinct species; a lookalike founds a new one descended from its mother', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.assign({ organismId: 1, genome: genome(1, 0.9), parentOrganismId: 0, tick: 1 })
    r.release(1, 2)
    // identical to the extinct species' representative
    const id = r.assign({ organismId: 2, genome: genome(2, 0.9), parentOrganismId: 0, tick: 3 })
    expect(id).toBe(2)
    expect(r.get(2)?.ancestorSpeciesId).toBe(0)
    expect(r.get(1)?.extinctAtTick).toBe(2)
  })

  it('ignores releasing an unknown organism', () => {
    const r = registry()
    expect(() => r.release(99, 1)).not.toThrow()
  })
})

describe('SpeciesRegistry ancestry', () => {
  function chain(): SpeciesRegistry {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 }) // s0
    r.assign({ organismId: 1, genome: genome(1, 0.9), parentOrganismId: 0, tick: 1 }) // s1 <- s0
    r.assign({ organismId: 2, genome: genome(2, 1.8), parentOrganismId: 1, tick: 2 }) // s2 <- s1
    r.assign({ organismId: 3, genome: genome(3, -0.9), parentOrganismId: 0, tick: 3 }) // s3 <- s0
    return r
  }

  it('walks ancestors nearest first', () => {
    const r = chain()
    expect(r.ancestry(2)).toEqual([1, 0])
    expect(r.ancestry(0)).toEqual([])
    expect(r.ancestry(99)).toEqual([])
  })

  it('finds descendants transitively, ascending', () => {
    const r = chain()
    expect(r.descendants(0)).toEqual([1, 2, 3])
    expect(r.descendants(1)).toEqual([2])
    expect(r.descendants(3)).toEqual([])
    expect(r.descendants(99)).toEqual([])
  })

  it('keeps ancestry for extinct species', () => {
    const r = chain()
    r.release(1, 9)
    r.release(2, 9)
    expect(r.ancestry(2)).toEqual([1, 0])
    expect(r.descendants(0)).toEqual([1, 2, 3])
  })
})

describe('SpeciesRegistry population history', () => {
  it('samples every sampleInterval ticks and tracks lastSeenTick', () => {
    const r = registry({ sampleInterval: 10, maxHistorySamples: 100 })
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    for (let tick = 1; tick <= 25; tick++) r.observe(tick)
    expect(r.get(0)?.populationHistory).toEqual([
      { tick: 10, count: 1 },
      { tick: 20, count: 1 }
    ])
    expect(r.get(0)?.lastSeenTick).toBe(25)
  })

  it('drops the oldest samples past the cap', () => {
    const r = registry({ sampleInterval: 1, maxHistorySamples: 3 })
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    for (let tick = 1; tick <= 6; tick++) r.observe(tick)
    expect(r.get(0)?.populationHistory.map((s) => s.tick)).toEqual([4, 5, 6])
  })

  it('keeps no samples when maxHistorySamples is zero', () => {
    const r = registry({ sampleInterval: 1, maxHistorySamples: 0 })
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.observe(1)
    expect(r.get(0)?.populationHistory).toEqual([])
  })

  it('stops updating an extinct species', () => {
    const r = registry({ sampleInterval: 1, maxHistorySamples: 10 })
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.observe(1)
    r.release(0, 2)
    r.observe(2)
    r.observe(3)
    expect(r.get(0)).toMatchObject({ lastSeenTick: 1, extinctAtTick: 2 })
    expect(r.get(0)?.populationHistory).toHaveLength(1)
  })

  it('returns copies that cannot corrupt the registry', () => {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    const record = r.get(0)!
    record.memberCount = 99
    record.populationHistory.push({ tick: 1, count: 1 })
    r.list()[0]!.memberCount = 77
    expect(r.get(0)?.memberCount).toBe(1)
    expect(r.get(0)?.populationHistory).toEqual([])
  })
})

describe('SpeciesRegistry disabled', () => {
  it('assigns nothing and reports nothing', () => {
    const r = registry({ enabled: false })
    expect(r.enabled).toBe(false)
    expect(r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })).toBe(
      null
    )
    r.release(0, 1)
    r.observe(1)
    expect(r.size).toBe(0)
    expect(r.list()).toEqual([])
    expect(r.speciesOf(0)).toBeUndefined()
    expect(r.problems([0, 1, 2])).toEqual([])
  })
})

describe('SpeciesRegistry.problems', () => {
  function sound(): SpeciesRegistry {
    const r = registry()
    r.assign({ organismId: 0, genome: genome(0, 0), parentOrganismId: null, tick: 0 })
    r.assign({ organismId: 1, genome: genome(1, 0.9), parentOrganismId: 0, tick: 1 })
    r.assign({ organismId: 2, genome: genome(2, 0.9), parentOrganismId: 1, tick: 1 })
    return r
  }

  it('is empty for a sound registry', () => {
    expect(sound().problems([0, 1, 2])).toEqual([])
  })

  it('stays sound through releases', () => {
    const r = sound()
    r.release(0, 4)
    expect(r.problems([1, 2])).toEqual([])
    r.release(1, 5)
    r.release(2, 5)
    expect(r.problems([])).toEqual([])
  })

  it('reports a living organism with no species', () => {
    expect(sound().problems([0, 1, 2, 3])).toContain('organism 3 has no species')
  })

  it('reports an organism the registry still tracks but the world no longer has', () => {
    const problems = sound().problems([0, 1])
    expect(problems.some((p) => p.includes('tracks 3 organisms but 2 are alive'))).toBe(true)
    expect(problems.some((p) => p.includes('memberCount'))).toBe(true)
  })

  it('reports a corrupted member count and a wrongly extinct species', () => {
    const r = sound()
    // reach into the private entries to corrupt them, as an invariant negative test
    const entries = (
      r as unknown as { entries: { memberCount: number; extinctAtTick: number | null }[] }
    ).entries
    entries[1]!.memberCount = 5
    expect(r.problems([0, 1, 2]).some((p) => p.includes('species 1 memberCount 5'))).toBe(true)
    entries[1]!.memberCount = 2
    entries[1]!.extinctAtTick = 3
    expect(r.problems([0, 1, 2]).some((p) => p.includes('has members but is marked extinct'))).toBe(
      true
    )
  })
})
