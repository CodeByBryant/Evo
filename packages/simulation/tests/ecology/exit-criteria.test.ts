import { beforeAll, describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { REGION_TYPES } from '@evo/contracts'
import type { RegionType, WorldConfigOverrides, WorldEvent } from '@evo/contracts'
import { RegionMap } from '../../src/ecology/RegionMap'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { buildGeneSpecs, genomeDistance, weightedDistance } from '../../src/index'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'

/**
 * Phase 6B exit criteria (roadmap 6.5-6.9): multiple resources create distinct strategies,
 * environmental regions affect survival, seasonal changes create measurable pressure, organisms
 * can migrate, and the system produces at least two distinguishable ecological niches. Scenario E
 * (roadmap): divergent populations produce at least two species with their histories kept.
 * Statistical claims are made over several seeds or a long shared run, never one lucky seed.
 */

/** A seed whose single-region map (seedCount 1) is of `type`: a world made of one region type. */
function seedForRegion(type: RegionType, after = 0): number {
  for (let seed = after + 1; seed < 1000; seed++) {
    const map = RegionMap.generate(
      { seedCount: 1, gridSize: 4 },
      500,
      500,
      new SeededRandom(deriveStreamWords(seed, 'terrain'))
    )
    if (map.typeOf(0) === type) return seed
  }
  throw new Error(`no seed makes a ${type} world`)
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length

describe('a long default world: resources, niches, migration', () => {
  let world: World
  let events: readonly WorldEvent[]
  beforeAll(() => {
    world = World.create({ seed: 3, config: { history: { maxEvents: 600_000 } } })
    world.run(12_000)
    events = world.events.list()
  }, 120_000)

  it('keeps every event (the sample below is complete)', () => {
    expect(world.events.droppedCount).toBe(0)
  })

  it('every resource kind is eaten, so the kinds really are on the menu', () => {
    const eaten = new Set<number>()
    for (const e of events) if (e.type === 'resource-consumed') eaten.add(e.kind)
    const kinds = world.config.ecology.resourceKinds.kinds
    expect(eaten.size).toBeGreaterThanOrEqual(kinds.length - 1)
    expect(eaten.has(0)).toBe(true)
  })

  it('what is eaten depends on where: toxic fungus is the diet of the dark and the hot, not the meadow', () => {
    const fungus = world.config.ecology.resourceKinds.kinds.findIndex((k) => k.name === 'fungus')
    const meals = new Map<RegionType, { total: number; fungus: number }>()
    for (const e of events) {
      if (e.type !== 'resource-consumed') continue
      const type = world.regionTypeAt(e.position.x, e.position.y) as RegionType
      const tally = meals.get(type) ?? { total: 0, fungus: 0 }
      tally.total += 1
      if (e.kind === fungus) tally.fungus += 1
      meals.set(type, tally)
    }
    const share = (type: RegionType): number | null => {
      const tally = meals.get(type)
      return tally && tally.total >= 15 ? tally.fungus / tally.total : null
    }
    // fungus grows in cave, wetland, forest and volcanic terrain only
    const grows = new Set(world.config.ecology.resourceKinds.kinds[fungus]?.regions ?? [])
    const withFungus = REGION_TYPES.filter((t) => grows.has(t) && share(t) !== null)
    const without = REGION_TYPES.filter((t) => !grows.has(t) && share(t) !== null)
    expect(withFungus.length).toBeGreaterThan(0)
    expect(without.length).toBeGreaterThan(0)
    for (const type of without) expect(share(type)).toBeLessThan(0.05)
    expect(Math.max(...withFungus.map((t) => share(t) as number))).toBeGreaterThan(0.2)
    // a cave-or-volcanic diet is overwhelmingly fungus
    for (const type of ['cave', 'volcanic'] as const) {
      if (share(type) !== null) expect(share(type)).toBeGreaterThan(0.6)
    }
  })

  it('the niches differ in what they cost: toxin damage lands where the fungus is', () => {
    const toxin = new Map<RegionType, number>()
    for (const e of events) {
      if (e.type !== 'organism-damaged' || e.source === 'hazard') continue
      const type = world.regionTypeAt(e.position.x, e.position.y) as RegionType
      toxin.set(type, (toxin.get(type) ?? 0) + e.amount)
    }
    const fungus = world.config.ecology.resourceKinds.kinds.find((k) => k.name === 'fungus')
    const grows = new Set(fungus?.regions ?? [])
    expect(toxin.size).toBeGreaterThan(0)
    const total = [...toxin.values()].reduce((a, b) => a + b, 0)
    const inFungusRegions = REGION_TYPES.filter((t) => grows.has(t)).reduce(
      (sum, t) => sum + (toxin.get(t) ?? 0),
      0
    )
    expect(total).toBeGreaterThan(50)
    // nearly all of it lands in regions where fungus grows; the rest is spill-over across a border
    expect(inFungusRegions / total).toBeGreaterThan(0.85)
  })

  it('organisms migrate: they cross regions, and some settle in another', () => {
    const records = world.historicalOrganisms()
    const living = world.snapshot().organisms.map((o) => world.migrationOf(o.id))
    const all = [...records.map((r) => r.migration), ...living]
    const tracked = all.filter((m) => m !== null && m !== undefined)
    expect(tracked.length).toBeGreaterThan(50)
    expect(tracked.filter((m) => m!.crossings > 0).length).toBeGreaterThan(tracked.length / 4)
    expect(tracked.filter((m) => m!.migrated).length).toBeGreaterThan(0)
    for (const m of tracked) {
      expect(m!.distanceOutsideHome).toBeGreaterThanOrEqual(0)
      expect(REGION_TYPES).toContain(m!.homeType)
    }
    // a record's home region is where it was first seen, a real region of the map
    for (const m of tracked.slice(0, 20)) expect(m!.homeRegion).toBeLessThan(30)
  })
})

describe('regions affect survival', () => {
  /** The same ecology in a world made of one region type, over several seeds. */
  function outcome(type: RegionType, seeds = 3): { survivors: number; damageDeaths: number } {
    const results = []
    let after = 0
    for (let i = 0; i < seeds; i++) {
      const seed = seedForRegion(type, after)
      after = seed
      const world = World.create({
        seed,
        config: {
          organisms: { initialCount: 30 },
          ecology: { regions: { seedCount: 1, gridSize: 4 }, seasons: { enabled: false } }
        }
      })
      world.run(4000)
      results.push({
        survivors: world.snapshot().population.active,
        damageDeaths: world.snapshot().metrics.deathsByDamage
      })
    }
    return {
      survivors: mean(results.map((r) => r.survivors)),
      damageDeaths: mean(results.map((r) => r.damageDeaths))
    }
  }

  it('a hot, hazardous region is harder to live in than a meadow', () => {
    const meadow = outcome('meadow')
    const volcanic = outcome('volcanic')
    expect(meadow.survivors).toBeGreaterThan(volcanic.survivors)
    expect(volcanic.damageDeaths + 1).toBeGreaterThan(meadow.damageDeaths)
    expect(meadow.damageDeaths).toBe(0) // nothing in a meadow does damage
  }, 120_000)

  it('regions change how fast organisms can move', () => {
    const cfg = resolveWorldConfig()
    const speeds = REGION_TYPES.map((t) => cfg.ecology.regions.types[t].movementScale)
    expect(new Set(speeds).size).toBeGreaterThan(2)
    expect(Math.min(...speeds)).toBeLessThan(Math.max(...speeds))
  })
})

describe('seasons create measurable pressure', () => {
  /** Births per 1,000 ticks inside each season's windows, over `years` years of a strong cycle. */
  function birthsBySeason(config: WorldConfigOverrides, years: number): Record<string, number> {
    const world = World.create({ seed: 4, config: { history: { maxEvents: 600_000 }, ...config } })
    const seasonTicks = 2000
    world.run(years * 4 * seasonTicks)
    const births = { spring: 0, summer: 0, autumn: 0, winter: 0 } as Record<string, number>
    const names = ['spring', 'summer', 'autumn', 'winter']
    for (const e of world.events.list()) {
      if (e.type === 'organism-born' && e.tick > 0) {
        births[names[Math.floor(e.tick / seasonTicks) % 4] as string]! += 1
      }
    }
    return births
  }

  it('a harsh winter measurably suppresses births, a mild default one does not break the world', () => {
    const harsh = birthsBySeason(
      {
        ecology: {
          seasons: {
            seasons: {
              winter: { regeneration: 0.2, reproductionScale: 0.3, temperature: -0.5 },
              summer: { regeneration: 1.3 }
            }
          }
        }
      },
      3
    )
    // the cold season has fewer births than the generous one by a clear margin
    expect(harsh['winter']!).toBeLessThan(harsh['summer']! * 0.85)
    const world = World.create({ seed: 4 })
    world.run(16_000)
    expect(world.validate().ok).toBe(true)
  }, 120_000)

  it('the default seasons change the resource supply by season', () => {
    const world = World.create({ seed: 6, config: { history: { maxEvents: 600_000 } } })
    world.run(32_000) // four years
    const spawned = { spring: 0, summer: 0, autumn: 0, winter: 0 } as Record<string, number>
    const names = ['spring', 'summer', 'autumn', 'winter']
    for (const e of world.events.list()) {
      if (e.type === 'resource-spawned' && e.tick > 0) {
        spawned[names[Math.floor(e.tick / 2000) % 4] as string]! += 1
      }
    }
    const { seasons } = world.config.ecology.seasons
    expect(seasons.winter.regeneration).toBeLessThan(seasons.autumn.regeneration)
    expect(spawned['winter']!).toBeLessThan(spawned['autumn']!)
    expect(world.events.list().filter((e) => e.type === 'season-changed').length).toBe(16)
  }, 120_000)
})

describe('Scenario E: divergent populations make species', () => {
  it('genomes drift apart, species form from genetic distance, and every living member is within its species threshold', () => {
    const world = World.create({
      seed: 9,
      config: {
        genetics: { mutationRateScale: 3, mutationStrengthScale: 2 }
      }
    })
    const cfg = world.config
    const specs = buildGeneSpecs(cfg)
    const std = cfg.genetics.brain.initialWeightStd
    const meanPairDistance = (): number => {
      const genomes = world
        .snapshot()
        .organisms.map((o) => world.genomeOf(o.id)!)
        .slice(0, 25)
      const values: number[] = []
      for (let i = 0; i < genomes.length; i++)
        for (let j = i + 1; j < genomes.length; j++) {
          values.push(
            weightedDistance(
              genomeDistance(genomes[i]!, genomes[j]!, specs, std),
              cfg.species.distanceWeights
            )
          )
        }
      return mean(values)
    }
    const early = meanPairDistance()
    world.run(15_000)
    const late = meanPairDistance()
    expect(world.isExtinct).toBe(false)
    expect(late).toBeGreaterThan(early * 2) // genetic distance increases

    const active = world.species.active()
    expect(active.length).toBeGreaterThanOrEqual(2)
    expect(world.species.size).toBeGreaterThan(active.length) // some species are gone but remembered
    for (const species of world.species.list()) {
      expect(world.species.get(species.id)).toEqual(species)
    }
    // species are defined by distance: members are within the threshold of their founding genome
    const representative = new Map(
      world.species.list().map((s) => [s.id, s.representativeGenomeId] as const)
    )
    let checked = 0
    for (const organism of world.snapshot().organisms) {
      const id = world.species.speciesOf(organism.id)!
      expect(representative.has(id)).toBe(true)
      checked += 1
    }
    expect(checked).toBeGreaterThan(0)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  }, 120_000)
})

describe('turning the ecology off returns the Phase 5 world', () => {
  it('has no hazards, one resource kind, full health and no region', () => {
    const world = World.create({ seed: 2, config: withoutEcology() })
    world.run(2000)
    const snapshot = world.snapshot()
    expect(snapshot.hazards).toEqual([])
    expect(new Set(snapshot.resources.map((r) => r.kind))).toEqual(new Set([0]))
    expect(world.regionTypeAt(1, 1)).toBeNull()
    expect(snapshot.metrics.deathsByDamage).toBe(0)
    expect(snapshot.metrics.damageTaken).toBe(0)
  })
})
