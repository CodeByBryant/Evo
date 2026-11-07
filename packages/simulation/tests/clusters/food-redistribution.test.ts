import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { WorldConfig } from '@evo/contracts'
import { ClusterLayout } from '../../src/ecology/ClusterLayout'
import { EcologyModel } from '../../src/ecology/EcologyModel'
import { HazardStore } from '../../src/ecology/HazardStore'
import { IdGenerator } from '../../src/entities/IdGenerator'
import { ResourceStore } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { EnvironmentSystem } from '../../src/systems/EnvironmentSystem'

/**
 * Food in the cluster layout follows the living (ADR 0014 revision): every cluster with somebody in
 * it gets an equal share of new food, an empty one gets `foodFloor` of a share, and food stranded
 * in clusters nobody lives in is cleared, so an emptied cluster cannot sit on the global food cap.
 */

const COUNT = 6

function configWith(clusters: object, resources: object = {}): WorldConfig {
  return resolveWorldConfig({
    environment: { layout: 'clusters', clusters: { count: COUNT, ...clusters } },
    resources: { initialCount: 0, spawnRate: 100, maxCount: 1_000_000, ...resources },
    ecology: {
      health: { enabled: false },
      regions: { enabled: false },
      seasons: { enabled: false },
      hazards: { enabled: false },
      resourceKinds: { enabled: false },
      migration: { enabled: false }
    }
  })
}

function harness(cfg: WorldConfig, living: () => readonly number[]) {
  const layout = new ClusterLayout(cfg.environment.clusters)
  const eco = new EcologyModel(cfg, null, layout)
  const resources = new ResourceStore()
  const events = new EventLog(1000)
  events.beginTick()
  const random = new SeededRandom(deriveStreamWords(1, 'environment'))
  const system = new EnvironmentSystem(
    cfg,
    resources,
    new IdGenerator(),
    random,
    events,
    eco,
    new HazardStore(),
    new SeededRandom(deriveStreamWords(1, 'events')),
    living
  )
  return { system, resources, layout, random }
}

/** Food per cluster. */
function stock(resources: ResourceStore, layout: ClusterLayout): number[] {
  const counts = Array.from({ length: layout.count }, () => 0)
  for (const r of resources.values()) {
    const cluster = layout.clusterAt(r.x, r.y)
    if (cluster >= 0) counts[cluster] = (counts[cluster] as number) + 1
  }
  return counts
}

function run(system: EnvironmentSystem, ticks: number): void {
  for (let tick = 1; tick <= ticks; tick++) system.update(tick)
}

describe('food follows the living', () => {
  it('gives an empty cluster only the floor share of new food', () => {
    const cfg = configWith({ foodFloor: 0.05, strandedFoodPerTick: 0 })
    const { system, resources, layout } = harness(cfg, () => [0, 60, 60, 60, 60, 60])
    run(system, 300)
    const counts = stock(resources, layout)
    const total = counts.reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(2500)
    // the empty cluster would get a sixth (about 500) of a uniform spread; its share is 0.05 / 5.05
    expect(counts[0] as number).toBeLessThan(0.03 * total)
    for (let c = 1; c < COUNT; c++) {
      const share = (counts[c] as number) / total
      expect(share).toBeGreaterThan(0.17)
      expect(share).toBeLessThan(0.23)
    }
  })

  it('gives every populated cluster an equal share, however many live there', () => {
    // a share that grew with population would let a crowded cluster starve its neighbours out
    const cfg = configWith({ foodFloor: 0.05, strandedFoodPerTick: 0 })
    const { system, resources, layout } = harness(cfg, () => [1, 20, 30, 40, 50, 150])
    run(system, 300)
    const counts = stock(resources, layout)
    const total = counts.reduce((a, b) => a + b, 0)
    for (const count of counts) {
      expect(count / total).toBeGreaterThan(0.13)
      expect(count / total).toBeLessThan(0.2)
    }
  })

  it('is an even spread when every cluster is equally populated', () => {
    const cfg = configWith({ foodFloor: 0.05, strandedFoodPerTick: 0 })
    const { system, resources, layout } = harness(cfg, () => [40, 40, 40, 40, 40, 40])
    run(system, 300)
    const counts = stock(resources, layout)
    const total = counts.reduce((a, b) => a + b, 0)
    for (const count of counts) {
      expect(count / total).toBeGreaterThan(0.13)
      expect(count / total).toBeLessThan(0.2)
    }
  })

  it('lets a cluster that is trying to recover keep a trickle, set by the floor', () => {
    const none = harness(configWith({ foodFloor: 0, strandedFoodPerTick: 0 }), () => [
      0, 50, 50, 50, 50, 50
    ])
    const floored = harness(configWith({ foodFloor: 0.5, strandedFoodPerTick: 0 }), () => [
      0, 50, 50, 50, 50, 50
    ])
    run(none.system, 300)
    run(floored.system, 300)
    expect(stock(none.resources, none.layout)[0]).toBe(0)
    expect(stock(floored.resources, floored.layout)[0] as number).toBeGreaterThan(100)
  })

  it('falls back to an even spread when nobody is alive anywhere, and never divides by zero', () => {
    const cfg = configWith({ foodFloor: 0, strandedFoodPerTick: 0 })
    const { system, resources, layout } = harness(cfg, () => [0, 0, 0, 0, 0, 0])
    run(system, 100)
    const counts = stock(resources, layout)
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThan(900)
    for (const count of counts) expect(count).toBeGreaterThan(80)
  })

  it('draws exactly three environment values per food item, whatever the counts', () => {
    const cfg = configWith({ foodFloor: 0.5, strandedFoodPerTick: 0 })
    const { system, resources, random } = harness(cfg, () => [0, 5, 50, 500, 5, 0])
    run(system, 50)
    const reference = new SeededRandom(deriveStreamWords(1, 'environment'))
    for (let i = 0; i < 3 * resources.size; i++) reference.float()
    expect(JSON.stringify(random.getState())).toBe(JSON.stringify(reference.getState()))
  })

  it('is deterministic: the same counts give the same food, however the run is sliced', () => {
    const cfg = configWith({ foodFloor: 0.05, strandedFoodPerTick: 4 })
    const live = (): readonly number[] => [0, 30, 10, 0, 70, 5]
    const a = harness(cfg, live)
    const b = harness(cfg, live)
    run(a.system, 200)
    for (let tick = 1; tick <= 200; tick++) b.system.update(tick)
    expect(b.resources.values()).toEqual(a.resources.values())
  })
})

describe('stranded food', () => {
  /** Puts `n` food items inside a cluster with ids `1000 + 100 * cluster + i`. */
  function stranded(system: ReturnType<typeof harness>, cluster: number, n: number): void {
    const { resources, layout } = system
    for (let i = 0; i < n; i++) {
      const point = layout.pointIn(cluster, (i + 0.5) / n, 0.25)
      resources.add({
        id: 1000 + cluster * 100 + i,
        x: point.x,
        y: point.y,
        remaining: 30,
        kind: 0
      })
    }
  }

  it('clears food from clusters with nobody in them, a few per tick, lowest id first', () => {
    const cfg = configWith({ foodFloor: 0, strandedFoodPerTick: 2 }, { spawnRate: 0 })
    const h = harness(cfg, () => [0, 10, 10, 10, 10, 10])
    stranded(h, 0, 10)
    stranded(h, 1, 10)
    const before = h.resources.values().map((r) => r.id)
    h.system.update(1)
    const after = h.resources.values().map((r) => r.id)
    const removed = before.filter((id) => !after.includes(id))
    expect(removed).toEqual([1000, 1001])
    h.system.update(2)
    expect(stock(h.resources, h.layout)).toEqual([6, 10, 0, 0, 0, 0])
    for (let tick = 3; tick <= 10; tick++) h.system.update(tick)
    expect(stock(h.resources, h.layout)).toEqual([0, 10, 0, 0, 0, 0])
  })

  it('leaves the food of populated clusters alone, however long it runs', () => {
    const cfg = configWith({ foodFloor: 0, strandedFoodPerTick: 50 }, { spawnRate: 0 })
    const h = harness(cfg, () => [1, 1, 1, 1, 1, 1])
    for (let c = 0; c < COUNT; c++) stranded(h, c, 20)
    run(h.system, 20)
    expect(stock(h.resources, h.layout)).toEqual([20, 20, 20, 20, 20, 20])
  })

  it('is off when strandedFoodPerTick is zero', () => {
    const cfg = configWith({ foodFloor: 0, strandedFoodPerTick: 0 }, { spawnRate: 0 })
    const h = harness(cfg, () => [0, 0, 0, 0, 0, 0])
    stranded(h, 0, 10)
    run(h.system, 20)
    expect(stock(h.resources, h.layout)[0]).toBe(10)
  })
})

describe('a dead cluster no longer takes the food of the living', () => {
  /** Live clusters eat at a fixed rate; returns the stock per cluster at the end. */
  function scenario(clusters: object): number[] {
    const cfg = configWith(clusters, { spawnRate: 30, maxCount: 600 })
    const h = harness(cfg, () => [0, 60, 60, 60, 60, 60])
    for (let tick = 1; tick <= 3000; tick++) {
      h.system.update(tick)
      // each live cluster's organisms eat one item every other tick (2.5 a tick in all, against 3 spawned)
      if (tick % 2 === 0) continue
      const eaten = [0, 0, 0, 0, 0, 0]
      for (const r of h.resources.values()) {
        const c = h.layout.clusterAt(r.x, r.y)
        if (c > 0 && (eaten[c] as number) < 1) {
          eaten[c] = (eaten[c] as number) + 1
          h.resources.remove(r.id)
        }
      }
    }
    return stock(h.resources, h.layout)
  }

  it('under an even spread (the old behavior) the dead cluster fills the cap; now it does not', () => {
    // foodFloor 1 makes every weight equal, which is the old uniform spread
    const old = scenario({ foodFloor: 1, strandedFoodPerTick: 0 })
    const now = scenario({ foodFloor: 0.05, strandedFoodPerTick: 4 })
    const oldLive = old.slice(1).reduce((a, b) => a + b, 0)
    const nowLive = now.slice(1).reduce((a, b) => a + b, 0)
    // the old spread piles up in the dead cluster and starves the live ones of cap
    expect(old[0] as number).toBeGreaterThan(300)
    expect(now[0] as number).toBeLessThan(10)
    expect(nowLive).toBeGreaterThan(oldLive)
  })
})
