import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { FREE_SLOT, HUB_SLOT, isNode } from '../../src/entities/ResourceStore'
import type { ResourceState, ResourceStore } from '../../src/entities/ResourceStore'
import { missingSlot, nodePosition, ringPhase } from '../../src/ecology/Plants'
import { World } from '../../src/world/World'

// Renewable plants (ADR 0021): a hub and six nodes, regrowth from the hub's store, photosynthesis,
// a lifespan, and the invariants that keep every node pointing at a live hub.

/** A world with only plants: no organisms, one kind of food (30 energy), no spawning unless asked. */
const plantWorld = (
  plants: object = {},
  resources: object = {},
  seed = 3,
  seasons: object = { seasons: { enabled: false } }
): World =>
  World.create({
    seed,
    config: {
      organisms: { initialCount: 0 },
      resources: {
        initialCount: 14, // two plants of seven items
        maxCount: 400,
        spawnRate: 0,
        plants: { enabled: true, lifespan: 0, ...plants },
        ...resources
      },
      ecology: { resourceKinds: { enabled: false }, ...seasons }
    } as WorldConfigOverrides
  })

const storeOf = (world: World): ResourceStore =>
  (world as unknown as { resources: ResourceStore }).resources
const hubsOf = (world: World): ResourceState[] =>
  storeOf(world)
    .values()
    .filter((r) => r.slot === HUB_SLOT)
const nodesOf = (world: World, hubId: number): ResourceState[] =>
  storeOf(world)
    .values()
    .filter((r) => isNode(r) && r.parent === hubId)
/** Everything a plant holds: the hub's store, the growing node's progress and every node. */
const energyOf = (world: World, hub: ResourceState): number =>
  hub.remaining +
  (hub.sproutProgress ?? 0) +
  nodesOf(world, hub.id).reduce((sum, node) => sum + node.remaining, 0)

describe('plant geometry', () => {
  it('turns each hub by a phase from its id: in [0, 2 pi), deterministic, different between hubs', () => {
    for (const id of [1, 2, 3, 1000, 123456]) {
      const phase = ringPhase(id)
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(Math.PI * 2)
      expect(ringPhase(id)).toBe(phase)
    }
    expect(new Set([1, 2, 3, 4, 5, 6].map(ringPhase)).size).toBe(6)
  })

  it('spreads the nodes evenly round the hub at the ring distance, and clamps them into the world', () => {
    const hub = { id: 5, x: 250, y: 250 }
    const at = [1, 2, 3, 4, 5, 6].map((slot) => nodePosition(hub, slot, 6, 9, 500, 500))
    for (const p of at) expect(Math.hypot(p.x - 250, p.y - 250)).toBeCloseTo(9, 6)
    // six nodes, 60 degrees apart: neighbours are one ring radius apart, and all are distinct
    for (let i = 0; i < 6; i++) {
      const a = at[i]!
      const b = at[(i + 1) % 6]!
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(9, 6)
    }
    expect(new Set(at.map((p) => `${p.x},${p.y}`)).size).toBe(6)
    // a hub in the corner keeps its nodes inside the world
    for (let slot = 1; slot <= 6; slot++) {
      const p = nodePosition({ id: 5, x: 1, y: 1 }, slot, 6, 9, 500, 500)
      expect(p.x).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeGreaterThanOrEqual(0)
    }
  })

  it('says which node grows next: the lowest slot that is missing, or none', () => {
    expect(missingSlot(0, 6)).toBe(1)
    expect(missingSlot(0b1111110, 6)).toBe(0)
    expect(missingSlot(0b0001110, 6)).toBe(4)
    expect(missingSlot(0b0000110, 6)).toBe(3)
    // only the slots this plant has count
    expect(missingSlot(0b0001110, 3)).toBe(0)
  })
})

describe('a plant', () => {
  it('is spawned whole: a hub with a full store and six distinct nodes, each in its own slot', () => {
    const world = plantWorld()
    const hubs = hubsOf(world)
    expect(hubs).toHaveLength(2)
    for (const hub of hubs) {
      expect(hub.parent).toBe(0)
      expect(hub.remaining).toBe(3 * 30) // hubEnergyScale x the kind's energy
      const nodes = nodesOf(world, hub.id)
      expect(nodes.map((n) => n.slot).sort()).toEqual([1, 2, 3, 4, 5, 6])
      for (const node of nodes) {
        expect(node.remaining).toBeCloseTo(0.6 * 30, 9)
        expect(node.id).toBeGreaterThan(hub.id)
        expect(Math.hypot(node.x - hub.x, node.y - hub.y)).toBeGreaterThan(0)
      }
    }
    expect(storeOf(world).size).toBe(14)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })

  it('counts items against initialCount: 15 items make two plants, not three', () => {
    const world = World.create({
      seed: 3,
      config: {
        organisms: { initialCount: 0 },
        resources: { initialCount: 15, spawnRate: 0, plants: { enabled: true } },
        ecology: { resourceKinds: { enabled: false } }
      }
    })
    expect(hubsOf(world)).toHaveLength(2)
    expect(storeOf(world).size).toBe(14)
  })

  it('grows an eaten node back from the hub, in the same slot, conserving energy to the unit', () => {
    // no photosynthesis, so everything a plant holds is fixed: the growing node is paid for by the hub
    const world = plantWorld({ photosynthesis: 0 })
    const hub = hubsOf(world)[0]!
    const gone = nodesOf(world, hub.id).find((n) => n.slot === 3)!
    storeOf(world).remove(gone.id)
    const before = energyOf(world, hub)
    expect(nodesOf(world, hub.id)).toHaveLength(5)
    let back = -1
    for (let tick = 1; tick <= 400; tick++) {
      world.run(1)
      expect(energyOf(world, hub)).toBeCloseTo(before, 9)
      if (back < 0 && nodesOf(world, hub.id).length === 6) back = tick
    }
    expect(back).toBeGreaterThan(0)
    const regrown = nodesOf(world, hub.id).find((n) => n.slot === 3)!
    expect(regrown.remaining).toBeCloseTo(0.6 * 30, 9)
    // the hub paid for it
    expect(hub.remaining).toBeLessThan(3 * 30)
    expect(world.validate().ok).toBe(true)
  })

  it('does not grow a node it cannot afford: the hub keeps a reserve and never empties itself', () => {
    const world = plantWorld({ photosynthesis: 0, regrowRate: 50 })
    const hub = hubsOf(world)[0]!
    for (const node of nodesOf(world, hub.id)) storeOf(world).remove(node.id)
    world.run(2000)
    expect(hub.remaining).toBeGreaterThanOrEqual(0.2 * 3 * 30 - 1e-6)
    // 90 energy of store, 18 kept back: 72 pays four nodes of 18, not six
    expect(nodesOf(world, hub.id).length).toBeLessThan(6)
    expect(storeOf(world).has(hub.id)).toBe(true)
  })

  it('gains energy from photosynthesis up to its capacity and no further', () => {
    const world = plantWorld({ photosynthesis: 2 })
    const hub = hubsOf(world)[0]!
    hub.remaining = 10
    world.run(10) // one simulated second: +2
    expect(hub.remaining).toBeCloseTo(12, 6)
    world.run(5000)
    expect(hub.remaining).toBeLessThanOrEqual(3 * 30 + 1e-9)
    expect(hub.remaining).toBeGreaterThan(3 * 30 - 20) // nearly full again (it also feeds nodes)
    // negative: with photosynthesis off nothing is gained
    const still = plantWorld({ photosynthesis: 0 })
    const other = hubsOf(still)[0]!
    other.remaining = 10
    still.run(500)
    expect(other.remaining).toBe(10)
  })

  it('grows back with the season too: a dim season regrows a node more slowly', () => {
    const ticksToRegrow = (regeneration: number): number => {
      const world = plantWorld({ photosynthesis: 0, regrowRate: 3 }, {}, 3, {
        seasons: {
          enabled: true,
          seasonLength: 100_000,
          seasons: {
            spring: { regeneration },
            summer: { regeneration },
            autumn: { regeneration },
            winter: { regeneration }
          }
        }
      })
      const hub = hubsOf(world)[0]!
      storeOf(world).remove(nodesOf(world, hub.id)[0]!.id)
      for (let tick = 1; tick <= 3000; tick++) {
        world.run(1)
        if (nodesOf(world, hub.id).length === 6) return tick
      }
      return Infinity
    }
    const normal = ticksToRegrow(1)
    const dim = ticksToRegrow(0.5)
    expect(normal).toBeGreaterThan(0)
    expect(normal).toBeLessThan(3000)
    // half the light, twice as long to grow (within a tick or two)
    expect(dim).toBeGreaterThanOrEqual(Math.floor(normal * 2) - 2)
    expect(dim).toBeLessThanOrEqual(Math.ceil(normal * 2) + 2)
  })

  it('photosynthesizes with the season: a dim season gains less energy, a bright one more', () => {
    const seasonal = (regeneration: number): number => {
      const world = plantWorld({ photosynthesis: 2 }, {}, 3, {
        seasons: {
          enabled: true,
          seasonLength: 1000,
          seasons: {
            spring: { regeneration },
            summer: { regeneration },
            autumn: { regeneration },
            winter: { regeneration }
          }
        }
      })
      const hub = hubsOf(world)[0]!
      hub.remaining = 10
      world.run(10) // one simulated second
      return hub.remaining - 10
    }
    expect(seasonal(1)).toBeCloseTo(2, 6)
    expect(seasonal(0.5)).toBeCloseTo(1, 6)
    expect(seasonal(1.5)).toBeCloseTo(3, 6)
    // negative: a plain world with the seasons off gains the full rate
    expect(hubsOf(plantWorld({ photosynthesis: 2 }))[0]!.remaining).toBe(90)
  })

  it('dies with its hub: the nodes are left as free food and nothing regrows', () => {
    const world = plantWorld()
    const hub = hubsOf(world)[0]!
    const ids = nodesOf(world, hub.id).map((n) => n.id)
    storeOf(world).remove(hub.id)
    for (const id of ids) {
      const node = storeOf(world).get(id)!
      expect(node.parent).toBe(0)
      expect(node.slot).toBe(FREE_SLOT)
    }
    expect(world.validate()).toEqual({ ok: true, errors: [] })
    const before = storeOf(world).size
    world.run(3000)
    // the other plant lives on, but these seven are not replaced and nothing sprouts from them
    expect(storeOf(world).size).toBe(before)
    expect(hubsOf(world)).toHaveLength(1)
  })

  it('withers after its lifespan, taking its nodes with it, and leaves nothing behind', () => {
    const world = plantWorld({ lifespan: 30 }) // 300 ticks
    world.run(299)
    expect(hubsOf(world)).toHaveLength(2)
    world.run(2)
    expect(hubsOf(world)).toHaveLength(0)
    expect(storeOf(world).size).toBe(0)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
    // negative: lifespan 0 lives forever
    const forever = plantWorld({ lifespan: 0 })
    forever.run(5000)
    expect(hubsOf(forever)).toHaveLength(2)
  })

  it('is replaced by new plants as spawnRate allows, within maxPlants and maxCount', () => {
    const world = plantWorld(
      { lifespan: 20, maxPlants: 5 },
      { spawnRate: 3, maxCount: 40, initialCount: 0 }
    )
    for (let i = 0; i < 20; i++) {
      world.run(150)
      expect(hubsOf(world).length).toBeLessThanOrEqual(5)
      expect(storeOf(world).size).toBeLessThanOrEqual(40)
      expect(world.validate().ok).toBe(true)
    }
    expect(world.snapshot().metrics.resourcesSpawned).toBeGreaterThan(14)
  })

  it('shows its links and its growing bud in the snapshot, and nothing of that without plants', () => {
    const world = plantWorld()
    const hub = hubsOf(world)[0]!
    const gone = nodesOf(world, hub.id).find((n) => n.slot === 2)!
    storeOf(world).remove(gone.id)
    world.run(5)
    const items = world.snapshot().resources
    const hubSnap = items.find((r) => r.id === hub.id)!
    expect(hubSnap.slot).toBe(0)
    expect(hubSnap.parent).toBe(0)
    expect(hubSnap.bud).not.toBeNull()
    expect(hubSnap.bud!.progress).toBeGreaterThan(0)
    expect(hubSnap.bud!.progress).toBeLessThanOrEqual(1)
    expect(hubSnap.energyValue).toBe(90)
    const node = items.find(
      (r) => (r.slot ?? 0) >= 1 && (r.slot ?? 0) < 255 && r.parent === hub.id
    )!
    expect(node.slot).toBeGreaterThanOrEqual(1)
    expect(node.energyValue).toBeCloseTo(18, 9)
    // free food and a plant-less world carry no plant fields
    const off = World.create({
      seed: 3,
      config: { organisms: { initialCount: 0 }, resources: { plants: { enabled: false } } }
    })
    for (const r of off.snapshot().resources) {
      expect(r.slot).toBeUndefined()
      expect(r.parent).toBeUndefined()
    }
  })

  it('keeps free food in the cluster layout: plants are a field-layout feature', () => {
    const world = World.create({
      seed: 3,
      config: {
        environment: { layout: 'clusters' },
        resources: { plants: { enabled: true } }
      }
    })
    world.run(200)
    expect(hubsOf(world)).toHaveLength(0)
    expect(world.snapshot().resources.length).toBeGreaterThan(0)
  })
})

describe('plants and determinism', () => {
  const live = {
    organisms: { initialCount: 12 },
    resources: { spawnRate: 0.4, plants: { enabled: true } }
  } as WorldConfigOverrides

  it('are the same stepped, chunked, and from the same seed', () => {
    const a = World.create({ seed: 8, config: live })
    a.run(900)
    const b = World.create({ seed: 8, config: live })
    b.run(300)
    b.run(300)
    b.run(300)
    expect(b.stateHash()).toBe(a.stateHash())
    expect(World.create({ seed: 8, config: live }).stateHash()).toBe(
      World.create({ seed: 8, config: live }).stateHash()
    )
    expect(a.validate()).toEqual({ ok: true, errors: [] })
  })

  it('change the hash: the same world without plants is a different world', () => {
    const on = World.create({ seed: 8, config: live })
    const off = World.create({
      seed: 8,
      config: { ...live, resources: { spawnRate: 0.4, plants: { enabled: false } } }
    })
    on.run(200)
    off.run(200)
    expect(on.stateHash()).not.toBe(off.stateHash())
  })

  it('hash their plant state: two worlds that differ only in a hub store hash differently', () => {
    const a = plantWorld()
    const b = plantWorld()
    expect(a.stateHash()).toBe(b.stateHash())
    hubsOf(b)[0]!.remaining -= 1
    expect(a.stateHash()).not.toBe(b.stateHash())
    const c = plantWorld()
    hubsOf(c)[0]!.sproutProgress = 4
    expect(a.stateHash()).not.toBe(c.stateHash())
  })
})

describe('plant invariants', () => {
  it('flags a node with no hub, a hub with a parent, and two nodes in one slot', () => {
    const lone = plantWorld()
    const hub = hubsOf(lone)[0]!
    storeOf(lone).get(nodesOf(lone, hub.id)[0]!.id)!.parent = 999_999
    expect(lone.validate().ok).toBe(false)

    const parented = plantWorld()
    hubsOf(parented)[0]!.parent = 1
    expect(parented.validate().ok).toBe(false)

    const doubled = plantWorld()
    const h = hubsOf(doubled)[0]!
    const [first, second] = nodesOf(doubled, h.id)
    storeOf(doubled).get(second!.id)!.slot = first!.slot as number
    expect(doubled.validate().ok).toBe(false)

    // a healthy plant is fine
    expect(plantWorld().validate().ok).toBe(true)
  })
})

describe('the resource store', () => {
  it('visits every resource in ascending id order without copying, and frees nodes when a hub goes', () => {
    const world = plantWorld()
    const seen: number[] = []
    storeOf(world).forEach((r) => seen.push(r.id))
    expect(seen).toEqual([...seen].sort((a, b) => a - b))
    expect(seen).toHaveLength(14)
    const hub = hubsOf(world)[0]!
    storeOf(world).remove(hub.id)
    expect(nodesOf(world, hub.id)).toHaveLength(0)
    expect(
      storeOf(world)
        .values()
        .filter((r) => r.slot === FREE_SLOT)
    ).toHaveLength(6)
  })
})
