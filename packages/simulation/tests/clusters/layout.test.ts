import { describe, expect, it } from 'vitest'
import { REGION_TYPES } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import { ClusterLayout } from '../../src/ecology/ClusterLayout'
import { effectiveConfig } from '../../src/world/clusterScaling'
import { ClusterTerrain, clusterBiomeWeights } from '../../src/ecology/ClusterTerrain'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'

const geometry = { count: 6, radius: 250, spacing: 750 }

describe('ClusterLayout', () => {
  const layout = new ClusterLayout(geometry)

  it('places the clusters on a regular polygon: neighbours are `spacing` apart', () => {
    expect(layout.count).toBe(6)
    for (let i = 0; i < 6; i++) {
      const a = layout.centres[i] as { x: number; y: number }
      const b = layout.centres[(i + 1) % 6] as { x: number; y: number }
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(750, 6)
    }
  })

  it('leaves a void of spacing minus two radii between neighbours', () => {
    const a = layout.centres[0] as { x: number; y: number }
    const b = layout.centres[1] as { x: number; y: number }
    expect(Math.hypot(a.x - b.x, a.y - b.y) - 2 * 250).toBeCloseTo(250, 6)
  })

  it('puts a single cluster at the origin', () => {
    expect(new ClusterLayout({ ...geometry, count: 1 }).centres).toEqual([{ x: 0, y: 0 }])
  })

  it('knows which cluster a point is in, and that the middle of the void is in none', () => {
    for (let i = 0; i < 6; i++) {
      const c = layout.centres[i] as { x: number; y: number }
      expect(layout.clusterAt(c.x, c.y)).toBe(i)
      expect(layout.clusterAt(c.x + 249, c.y)).toBe(i)
      expect(layout.clusterAt(c.x + 251, c.y)).toBe(-1)
    }
    expect(layout.clusterAt(0, 0)).toBe(-1) // the middle of the polygon is void
    expect(layout.clusterAt(1e6, -1e6)).toBe(-1)
    expect(layout.nearestCluster(1e6, 0)).toBeGreaterThanOrEqual(0)
  })

  it('draws uniform points inside a cluster, and none outside', () => {
    const random = new SeededRandom(deriveStreamWords(5, 'terrain'))
    for (let i = 0; i < 500; i++) {
      const cluster = i % 6
      const p = layout.pointIn(cluster, random.float(), random.float())
      expect(layout.clusterAt(p.x, p.y)).toBe(cluster)
    }
  })

  it('bounds the clusters, grown by a margin', () => {
    const b = layout.bounds(100)
    for (const c of layout.centres) {
      expect(c.x - 250).toBeGreaterThanOrEqual(b.minX + 100 - 1e-9)
      expect(c.x + 250).toBeLessThanOrEqual(b.maxX - 100 + 1e-9)
    }
  })

  it('totals the area of the clusters', () => {
    expect(layout.totalArea).toBeCloseTo(6 * Math.PI * 250 * 250, 6)
  })
})

describe('cluster biome weights and terrain', () => {
  it('sum to one for every cluster, and every biome keeps a floor', () => {
    for (let cluster = 0; cluster < 12; cluster++) {
      const weights = clusterBiomeWeights(cluster)
      expect(weights).toHaveLength(REGION_TYPES.length)
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
      for (const w of weights) expect(w).toBeGreaterThan(0)
    }
  })

  it('gives each cluster its own signature mix', () => {
    const mixes = new Set([0, 1, 2, 3, 4, 5].map((c) => clusterBiomeWeights(c).join(',')))
    expect(mixes.size).toBe(6)
  })

  it('builds patches inside their own circle, reproducibly, and calls the void null', () => {
    const layout = new ClusterLayout(geometry)
    const make = () =>
      new ClusterTerrain(layout, 6, new SeededRandom(deriveStreamWords(9, 'terrain')))
    const terrain = make()
    expect(terrain.patches).toHaveLength(36)
    for (const patch of terrain.patches) {
      expect(layout.clusterAt(patch.x, patch.y)).toBe(patch.cluster)
    }
    expect(make().patches).toEqual(terrain.patches)
    expect(terrain.typeAt(0, 0)).toBeNull()
    expect(terrain.indexAt(0, 0)).toBe(-1)
    const c = layout.centres[2] as { x: number; y: number }
    expect(terrain.typeAt(c.x, c.y)).not.toBeNull()
    expect(Math.floor(terrain.indexAt(c.x, c.y) / 6)).toBe(2)
  })
})

describe('effectiveConfig', () => {
  it('returns the field configuration untouched', () => {
    const config = resolveWorldConfig()
    expect(effectiveConfig(config)).toBe(config)
  })

  it('scales food and population to the clusters, sets the founder count, and caps the mate signal', () => {
    const config = resolveWorldConfig({ environment: { layout: 'clusters' } })
    const scaled = effectiveConfig(config)
    const scale = (6 * Math.PI * 250 * 250) / (500 * 500)
    expect(scaled.organisms.initialCount).toBe(6 * 3 * 6)
    expect(scaled.resources.maxCount).toBe(Math.round(config.resources.maxCount * scale))
    expect(scaled.resources.spawnRate).toBeCloseTo(config.resources.spawnRate * scale, 9)
    expect(scaled.maxPopulation).toBe(Math.round(config.maxPopulation * scale))
    expect(scaled.reproduction.mateSenseRadius).toBe(200)
    expect(scaled.reproduction.mateSenseRadius).toBeLessThan(750 - 2 * 250)
  })
})
