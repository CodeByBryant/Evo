import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'
import { FREE_FOOD } from '../support/food'

// the cluster world's food is free food (ADR 0021)
const CLUSTERS: WorldConfigOverrides = { ...FREE_FOOD, environment: { layout: 'clusters' } }
/** The same world with 4 founders per species (72 organisms), for the long or repeated runs. */
const LIGHT: WorldConfigOverrides = {
  ...FREE_FOOD,
  environment: { layout: 'clusters', clusters: { organismsPerSpecies: 4 } }
}
const SEED = 4

describe('the cluster world at tick 0', () => {
  const world = World.create({ seed: SEED, config: CLUSTERS })

  it('starts 432 founders, 72 per cluster, in their home clusters', () => {
    const report = world.clusterReport()
    expect(world.snapshot().organisms).toHaveLength(432)
    expect(report?.clusters.map((c) => c.alive)).toEqual([72, 72, 72, 72, 72, 72])
    expect(report?.clusters.every((c) => c.inVoid === 0)).toBe(true)
    expect(report?.meanPurity).toBe(1)
  })

  it('has exactly 18 species, 3 in each cluster, each with 24 founders', () => {
    const report = world.clusterReport()
    expect(world.species.active()).toHaveLength(18)
    const perCluster = [0, 0, 0, 0, 0, 0]
    for (const species of report?.species ?? []) {
      expect(species.alive).toBe(24)
      expect(species.purity).toBe(1)
      perCluster[species.dominantCluster] = (perCluster[species.dominantCluster] as number) + 1
    }
    expect(perCluster).toEqual([3, 3, 3, 3, 3, 3])
  })

  it('colors each cluster as a hue family and each species as a shade of it', () => {
    const report = world.clusterReport()
    const hueOf = new Map<number, number>()
    for (const o of world.snapshot().organisms) {
      const species = world.species.speciesOf(o.id) as number
      hueOf.set(species, o.hue)
    }
    for (const species of report?.species ?? []) {
      const family = species.dominantCluster / 6
      const hue = hueOf.get(species.speciesId) as number
      const gap = Math.abs(hue - family)
      expect(Math.min(gap, 1 - gap)).toBeLessThan(0.1) // within the cluster's family
    }
    // clusters are far apart on the colour wheel from each other
    const clusterHues = [0, 1, 2, 3, 4, 5].map((c) => c / 6)
    for (let a = 0; a < 6; a++) {
      for (let b = a + 1; b < 6; b++) {
        const gap = Math.abs((clusterHues[a] as number) - (clusterHues[b] as number))
        expect(Math.min(gap, 1 - gap)).toBeGreaterThan(0.1)
      }
    }
  })

  it('gives species of one cluster similar bodies and clusters different bodies', () => {
    const bodies = new Map<number, number[]>()
    for (const o of world.snapshot().organisms) {
      const species = world.species.speciesOf(o.id) as number
      bodies.set(species, [...world.genomeOf(o.id)!.body.genes])
    }
    const report = world.clusterReport()
    const rows = report?.species ?? []
    const dist = (a: number[], b: number[]): number => {
      let total = 0
      for (let i = 0; i < a.length; i++) total += Math.abs((a[i] as number) - (b[i] as number))
      return total / a.length
    }
    let within = 0
    let withinCount = 0
    let between = 0
    let betweenCount = 0
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const d = dist(
          bodies.get(rows[i]!.speciesId) as number[],
          bodies.get(rows[j]!.speciesId) as number[]
        )
        if (rows[i]!.dominantCluster === rows[j]!.dominantCluster) {
          within += d
          withinCount++
        } else {
          between += d
          betweenCount++
        }
      }
    }
    expect(within / withinCount).toBeGreaterThan(0) // the species differ ...
    expect(within / withinCount).toBeLessThan(between / betweenCount) // ... less than the clusters do
  })

  it('has biome patches inside every cluster and several biomes overall', () => {
    const layout = world.clusterLayout()
    expect(layout?.clusters).toHaveLength(6)
    expect(layout?.radius).toBe(500)
    for (const cluster of layout?.clusters ?? []) {
      expect(cluster.patches).toHaveLength(12)
      expect(new Set(cluster.patches.map((p) => p.type)).size).toBeGreaterThan(1)
    }
  })
})

describe('the cluster world while it runs', () => {
  it('puts food only inside clusters', () => {
    const world = World.create({ seed: SEED, config: CLUSTERS })
    for (let t = 0; t < 6; t++) {
      world.run(200)
      const snapshot = world.snapshot()
      const layout = world.clusterLayout()
      const clusters = layout?.clusters ?? []
      const inside = (x: number, y: number): boolean =>
        clusters.some((c) => Math.hypot(x - c.x, y - c.y) <= (layout?.radius ?? 0))
      for (const food of snapshot.resources)
        expect(inside(food.position.x, food.position.y)).toBe(true)
    }
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('has no walls: an organism far outside every cluster keeps its position, and nothing clamps it', () => {
    const world = World.create({ seed: SEED, config: CLUSTERS })
    const internals = world as unknown as {
      organisms: { values(): Array<{ x: number; y: number; vx: number }> }
    }
    const organism = internals.organisms.values()[0]
    if (!organism) throw new Error('expected a population')
    organism.x = -40_000
    organism.y = 40_000
    world.run(20)
    const moved = internals.organisms.values()[0]
    expect(moved?.x).toBeLessThan(-30_000)
    expect(moved?.y).toBeGreaterThan(30_000)
    expect(world.validate().errors.join('\n')).not.toContain('outside')
  })

  it('slows and blinds organisms in the void only', () => {
    const world = World.create({ seed: SEED, config: CLUSTERS })
    const eco = (
      world as unknown as {
        ecology: {
          movementScale: (x: number, y: number, tick: number) => number
          visibilityScale: (x: number, y: number, tick: number) => number
          inVoid: (x: number, y: number) => boolean
        }
      }
    ).ecology
    const layout = world.clusterLayout()
    const c = layout?.clusters[0] as { x: number; y: number }
    expect(eco.inVoid(c.x, c.y)).toBe(false)
    expect(eco.inVoid(0, 0)).toBe(true)
    const inside = eco.movementScale(c.x, c.y, 0)
    const outside = eco.movementScale(0, 0, 0)
    expect(outside).toBeLessThan(inside)
    expect(eco.visibilityScale(0, 0, 0)).toBeLessThan(eco.visibilityScale(c.x, c.y, 0))
  })

  it('is deterministic, however the run is sliced', () => {
    const a = World.create({ seed: 11, config: LIGHT })
    const b = World.create({ seed: 11, config: LIGHT })
    a.run(1500)
    for (let i = 0; i < 1500; i++) b.step()
    expect(b.stateHash()).toBe(a.stateHash())
    const c = World.create({ seed: 12, config: LIGHT })
    c.run(1500)
    expect(c.stateHash()).not.toBe(a.stateHash())
  }, 120_000)

  it('keeps the invariants for a few thousand ticks', () => {
    const world = World.create({ seed: 13, config: LIGHT, validateEveryTicks: 500 })
    world.run(3000)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('reports a read-only picture: reading it does not change the state hash', () => {
    const world = World.create({ seed: 14, config: CLUSTERS })
    world.run(500)
    const before = world.stateHash()
    world.clusterReport()
    world.clusterLayout()
    expect(world.stateHash()).toBe(before)
  })
})

describe('the field layout is untouched', () => {
  it('has no cluster layout or report, and walls', () => {
    const world = World.create({ seed: SEED, config: FREE_FOOD })
    expect(world.clusterLayout()).toBeNull()
    expect(world.clusterReport()).toBeNull()
    world.run(2000)
    for (const o of world.snapshot().organisms) {
      expect(o.position.x).toBeGreaterThanOrEqual(0)
      expect(o.position.x).toBeLessThanOrEqual(500)
    }
  })
})
