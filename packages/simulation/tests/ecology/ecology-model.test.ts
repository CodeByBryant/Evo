import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { REGION_TYPES } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { HazardStore } from '../../src/ecology/HazardStore'
import { RegionMap } from '../../src/ecology/RegionMap'
import { SeasonModel } from '../../src/ecology/SeasonModel'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { withoutEcology } from '../support/ecology'

const terrain = (seed: number): SeededRandom => new SeededRandom(deriveStreamWords(seed, 'terrain'))

function model(overrides: WorldConfigOverrides = {}, seed = 1): EcologyModel {
  const config = resolveWorldConfig(withoutEcology(overrides))
  const map = config.ecology.regions.enabled
    ? RegionMap.generate(
        config.ecology.regions,
        config.environment.width,
        config.environment.height,
        terrain(seed)
      )
    : null
  return new EcologyModel(config, map)
}

describe('RegionMap', () => {
  const cfg = { seedCount: 12, gridSize: 25 }

  it('is deterministic for a seed and different for another', () => {
    const a = RegionMap.generate(cfg, 500, 500, terrain(1))
    const b = RegionMap.generate(cfg, 500, 500, terrain(1))
    const c = RegionMap.generate(cfg, 500, 500, terrain(2))
    expect(JSON.stringify(a.points)).toBe(JSON.stringify(b.points))
    expect(JSON.stringify(a.points)).not.toBe(JSON.stringify(c.points))
    for (let x = 0; x <= 500; x += 37)
      for (let y = 0; y <= 500; y += 41) {
        expect(a.indexAt(x, y)).toBe(b.indexAt(x, y))
      }
  })

  it('draws exactly three values per point', () => {
    const used = terrain(5)
    RegionMap.generate(cfg, 500, 500, used)
    const reference = terrain(5)
    for (let i = 0; i < 36; i++) reference.float()
    expect(used.getState()).toEqual(reference.getState())
  })

  it('puts every position in a valid region and covers the whole grid', () => {
    const map = RegionMap.generate(cfg, 500, 500, terrain(3))
    for (let x = -10; x <= 510; x += 13)
      for (let y = -10; y <= 510; y += 17) {
        const index = map.indexAt(x, y)
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(12)
        expect(REGION_TYPES).toContain(map.typeAt(x, y))
      }
    expect(map.cellCountsByType().reduce((a, b) => a + b, 0)).toBe(25 * 25)
  })

  it('assigns a point to its own location', () => {
    const map = RegionMap.generate(cfg, 500, 500, terrain(4))
    // a point's cell belongs to that point unless a nearer point exists; its type matches at least
    for (const point of map.points) {
      const index = map.indexAt(point.x, point.y)
      const nearest = map.points[index]!
      const d = (p: { x: number; y: number }): number => (p.x - point.x) ** 2 + (p.y - point.y) ** 2
      expect(d(nearest)).toBeLessThanOrEqual(d(point) + 20 * 20 * 2)
    }
  })

  it('with one point makes one region', () => {
    const map = RegionMap.generate({ seedCount: 1, gridSize: 4 }, 100, 100, terrain(1))
    expect(map.indexAt(1, 1)).toBe(0)
    expect(map.indexAt(99, 99)).toBe(0)
  })

  it('rejects absurd point counts', () => {
    expect(() =>
      RegionMap.generate({ seedCount: 70_000, gridSize: 2 }, 10, 10, terrain(1))
    ).toThrow()
  })
})

describe('SeasonModel', () => {
  const seasons = new SeasonModel({ seasonLength: 200 }, 0.1)

  it('cycles spring, summer, autumn, winter every 2000 ticks', () => {
    expect(seasons.seasonAt(0)).toBe('spring')
    expect(seasons.seasonAt(1999)).toBe('spring')
    expect(seasons.seasonAt(2000)).toBe('summer')
    expect(seasons.seasonAt(4000)).toBe('autumn')
    expect(seasons.seasonAt(6000)).toBe('winter')
    expect(seasons.seasonAt(7999)).toBe('winter')
    expect(seasons.seasonAt(8000)).toBe('spring')
    expect(seasons.seasonAt(80_000)).toBe('spring')
  })

  it('has a year phase in [0, 1) that wraps', () => {
    expect(seasons.yearPhase(0)).toBe(0)
    expect(seasons.yearPhase(4000)).toBeCloseTo(0.5, 12)
    expect(seasons.yearPhase(8000)).toBeCloseTo(0, 12)
    for (let tick = 0; tick < 20_000; tick += 331) {
      expect(seasons.yearPhase(tick)).toBeGreaterThanOrEqual(0)
      expect(seasons.yearPhase(tick)).toBeLessThan(1)
    }
  })
})

describe('HazardStore', () => {
  const area = { kind: 'damage-area' as const, x: 1, y: 2, radius: 3, damagePerSecond: 4 }

  it('allocates increasing ids and lists in id order', () => {
    const store = new HazardStore()
    expect(store.add({ ...area, expiresAtTick: null }).id).toBe(0)
    expect(store.add({ ...area, expiresAtTick: 10 }).id).toBe(1)
    expect(store.nextId).toBe(2)
    expect(store.values().map((h) => h.id)).toEqual([0, 1])
  })

  it('removes only expired hazards, in id order, and never reuses ids', () => {
    const store = new HazardStore()
    store.add({ ...area, expiresAtTick: null })
    store.add({ ...area, kind: 'storm', expiresAtTick: 10 })
    store.add({ ...area, kind: 'storm', expiresAtTick: 5 })
    expect(store.removeExpired(4)).toEqual([])
    expect(store.removeExpired(5).map((h) => h.id)).toEqual([2])
    expect(store.removeExpired(10).map((h) => h.id)).toEqual([1])
    expect(store.values().map((h) => h.id)).toEqual([0])
    expect(store.add({ ...area, expiresAtTick: null }).id).toBe(3)
    expect(store.size).toBe(2)
  })
})

describe('EcologyModel with everything off', () => {
  const off = model()
  it('is neutral', () => {
    expect(off.perceptionModified).toBe(false)
    expect(off.movementScale(10, 10, 5)).toBe(1)
    expect(off.visibilityScale(10, 10, 5)).toBe(1)
    expect(off.temperature(10, 10, 5)).toBe(0)
    expect(off.environmentalCost(10, 10, 5)).toBe(0)
    expect(off.hazardExposure(10, 10)).toBe(1)
    expect(off.hazardIntensity(5)).toBe(1)
    expect(off.reproductionScale(10, 10, 5)).toBe(1)
    expect(off.regenerationScale(5)).toBe(1)
    expect(off.yearPhase(5)).toBe(0)
    expect(off.regionIndexAt(10, 10)).toBe(-1)
    expect(off.regionTypeAt(10, 10)).toBeNull()
    expect(off.seasonAt(5)).toBeNull()
  })

  it('has the single baseline kind with the Phase 5 energy and radius', () => {
    const config = resolveWorldConfig()
    expect(off.kindCount).toBe(1)
    expect(off.kind(0)).toMatchObject({
      energy: config.resources.energyValue,
      radius: config.resources.radius,
      detectability: 1,
      toxicity: 0
    })
    expect(off.kindGrowsAt(0, 5, 5)).toBe(true)
    expect(off.chooseKind(0.999)).toBe(0)
  })
})

describe('EcologyModel with features on', () => {
  const cfg = resolveWorldConfig()
  const on = model({
    ecology: {
      regions: { enabled: true },
      seasons: { enabled: true },
      resourceKinds: { enabled: true }
    }
  })
  const seasons = cfg.ecology.seasons.seasons
  const kinds = cfg.ecology.resourceKinds.kinds

  it('combines region and season multipliers', () => {
    // find a position in each region type
    const seen = new Map<string, [number, number]>()
    for (let x = 5; x < 500; x += 10)
      for (let y = 5; y < 500; y += 10) {
        const type = on.regionTypeAt(x, y)!
        if (!seen.has(type)) seen.set(type, [x, y])
      }
    expect(seen.size).toBeGreaterThan(1)
    for (const [type, [x, y]] of seen) {
      const region = cfg.ecology.regions.types[type as keyof typeof cfg.ecology.regions.types]
      expect(on.movementScale(x, y, 0)).toBeCloseTo(
        region.movementScale * seasons.spring.movementScale,
        12
      )
      expect(on.movementScale(x, y, 6000)).toBeCloseTo(
        region.movementScale * seasons.winter.movementScale,
        12
      )
      expect(on.visibilityScale(x, y, 6000)).toBeCloseTo(
        region.visibility * seasons.winter.visibility,
        12
      )
      expect(on.hazardExposure(x, y)).toBe(region.hazardExposure)
      expect(on.reproductionScale(x, y, 6000)).toBeCloseTo(
        region.reproductionScale * seasons.winter.reproductionScale,
        12
      )
    }
  })

  it('clamps temperature to [-1, 1] and charges only outside the tolerance', () => {
    const { temperatureTolerance, temperatureCost } = cfg.ecology.regions
    for (let x = 5; x < 500; x += 25)
      for (let y = 5; y < 500; y += 25) {
        for (const tick of [0, 2000, 4000, 6000]) {
          const t = on.temperature(x, y, tick)
          expect(t).toBeGreaterThanOrEqual(-1)
          expect(t).toBeLessThanOrEqual(1)
          const excess = Math.max(0, Math.abs(t) - temperatureTolerance)
          expect(on.environmentalCost(x, y, tick)).toBeCloseTo(
            temperatureCost * excess * excess,
            12
          )
        }
      }
  })

  it('scales regeneration and hazard intensity by season', () => {
    expect(on.regenerationScale(0)).toBe(seasons.spring.regeneration)
    expect(on.regenerationScale(6000)).toBe(seasons.winter.regeneration)
    expect(on.hazardIntensity(6000)).toBe(seasons.winter.hazardIntensity)
    expect(on.seasonAt(4000)).toBe('autumn')
  })

  it('derives kind properties from the baseline', () => {
    expect(on.kindCount).toBe(kinds.length)
    expect(on.kind(1).energy).toBe(cfg.resources.energyValue * (kinds[1]?.energyScale as number))
    expect(on.kind(2).toxicity).toBe(kinds[2]?.toxicity)
  })

  it('chooses kinds in proportion to spawn weight', () => {
    const weights = kinds.map((k) => k.spawnWeight)
    const total = weights.reduce((a, b) => a + b, 0)
    const edges: number[] = []
    weights.reduce((sum, w) => (edges.push((sum + w) / total), sum + w), 0)
    expect(on.chooseKind(0)).toBe(0)
    for (let i = 0; i < kinds.length; i++) {
      const lower = i === 0 ? 0 : (edges[i - 1] as number)
      const upper = edges[i] as number
      expect(on.chooseKind(lower + (upper - lower) * 0.5)).toBe(i)
    }
    expect(on.chooseKind(0.9999999)).toBe(kinds.length - 1)
    const counts = kinds.map(() => 0)
    const rnd = terrain(9)
    for (let i = 0; i < 20_000; i++) counts[on.chooseKind(rnd.float())]! += 1
    kinds.forEach((_, i) => {
      expect(counts[i]! / 20_000).toBeCloseTo((weights[i] as number) / total, 1)
    })
  })

  it('never chooses a zero-weight kind', () => {
    const zeroed = kinds.map((k, i) => ({ ...k, spawnWeight: i === 2 ? 0 : 1 }))
    const m = model({ ecology: { resourceKinds: { enabled: true, kinds: zeroed } } })
    for (let u = 0; u < 1; u += 0.001) expect(m.chooseKind(u)).not.toBe(2)
  })

  it('restricts kinds to their regions and lets empty region lists grow anywhere', () => {
    let restricted = 0
    let anywhere = 0
    const fungus = kinds[2]?.regions ?? []
    for (let x = 5; x < 500; x += 10)
      for (let y = 5; y < 500; y += 10) {
        const type = on.regionTypeAt(x, y)!
        expect(on.kindGrowsAt(2, x, y)).toBe(fungus.includes(type))
        if (on.kindGrowsAt(2, x, y)) restricted += 1
        if (on.kindGrowsAt(0, x, y)) anywhere += 1
      }
    expect(restricted).toBeGreaterThan(0)
    expect(anywhere).toBeGreaterThan(0)
    const open = kinds.map((k) => ({ ...k, regions: [] as never[] }))
    const everywhere = model({
      ecology: { regions: { enabled: true }, resourceKinds: { enabled: true, kinds: open } }
    })
    expect(everywhere.kindGrowsAt(1, 3, 3)).toBe(true)
  })
})
