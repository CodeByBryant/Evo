import { describe, expect, it } from 'vitest'
import { OBSTACLE_KINDS, REGION_TYPES } from '@evo/contracts'
import type { ObstacleSnapshot, RegionType, WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'

// Whole worlds with obstacles (ADR 0022): food and plants stay out of rocks, bodies stay out of
// rocks, the run is the same however it is sliced, and a world whose obstacles amount to nothing
// is the world without them.

const everywhere = (value: number): Record<RegionType, number> =>
  Object.fromEntries(REGION_TYPES.map((type) => [type, value])) as Record<RegionType, number>

/** Dense boulders (and nothing else) so a short run meets plenty of them. */
function dense(extra: WorldConfigOverrides = {}): WorldConfigOverrides {
  const kinds: Record<string, unknown> = {}
  for (const kind of OBSTACLE_KINDS) {
    kinds[kind] = { density: everywhere(kind === 'boulder' ? 6 : 0) }
  }
  return {
    ...extra,
    ecology: { obstacles: { enabled: true, kinds } as never }
  }
}

function blockers(world: World): ObstacleSnapshot[] {
  return world.obstacles().filter((o) => o.blocksMovement)
}

/** The smallest gap, over every blocking circle, between a body of `radius` at (x, y) and its edge. */
function overlap(list: readonly ObstacleSnapshot[], x: number, y: number, radius: number): number {
  let worst = Infinity
  for (const o of list) {
    const gap = Math.sqrt((x - o.x) ** 2 + (y - o.y) ** 2) - (o.radius + radius)
    if (gap < worst) worst = gap
  }
  return worst
}

describe('food and plants in a world with obstacles', () => {
  it('never start or grow inside a rock: free food, hubs and nodes, at creation and for a long time after', () => {
    for (const seed of [1, 2, 3]) {
      const world = World.create({ seed, config: dense() })
      const rocks = blockers(world)
      expect(rocks.length).toBeGreaterThan(10)
      for (let t = 0; t <= 2000; t += 250) {
        if (t > 0) world.run(250)
        for (const item of world.snapshot().resources) {
          // Not inside the circle (the placement margin keeps a plant's nodes out too).
          expect(overlap(rocks, item.position.x, item.position.y, 0)).toBeGreaterThan(0)
        }
      }
    }
  })

  it('also holds with free uniform food and with kinds off (the other two placement paths)', () => {
    const uniform: WorldConfigOverrides = {
      resources: { distribution: { mode: 'uniform' }, plants: { enabled: false } }
    }
    const noKinds: WorldConfigOverrides = {
      ...uniform,
      ecology: { resourceKinds: { enabled: false } }
    }
    for (const base of [uniform, noKinds]) {
      const config = dense(base)
      config.ecology = { ...base.ecology, ...config.ecology }
      const world = World.create({ seed: 4, config })
      const rocks = blockers(world)
      world.run(800)
      for (const item of world.snapshot().resources) {
        expect(overlap(rocks, item.position.x, item.position.y, 0)).toBeGreaterThan(0)
      }
    }
  })

  it('does place food in the open: the obstacles do not starve a world of it', () => {
    const world = World.create({ seed: 5, config: dense() })
    world.run(500)
    expect(world.snapshot().resources.length).toBeGreaterThan(20)
  })
})

describe('creatures in a world with obstacles', () => {
  it('are never left inside a rock after their first tick, tick after tick (founders are pushed out)', () => {
    for (const seed of [1, 2]) {
      const world = World.create({ seed, config: dense() })
      const rocks = blockers(world)
      for (let tick = 0; tick < 400; tick++) {
        world.run(1)
        for (const body of world.snapshot().organisms) {
          // A newborn is placed beside its parent after movement and is pushed out on its first
          // move, so a body is only checked once it has had one tick of its own.
          if (body.age <= 2 * world.config.timestep) continue
          // A little slack for the world's own wall, which a body can be pressed against.
          // Movement uses the juvenile's smaller body (as eating does); the snapshot's radius is the adult's.
          const { maturityAge, juvenileSizeScale } = world.config.organisms
          const radius = body.radius * (body.age < maturityAge ? juvenileSizeScale : 1)
          const gap = overlap(rocks, body.position.x, body.position.y, radius)
          expect(
            gap,
            `seed ${seed} tick ${tick} age ${body.age} id ${body.id} x ${body.position.x} y ${body.position.y} r ${body.radius}`
          ).toBeGreaterThan(-0.5)
        }
      }
    }
  })

  it('still live and breed in a rocky world', () => {
    const world = World.create({ seed: 6, config: dense() })
    world.run(3000)
    const { organisms } = world.snapshot()
    expect(organisms.length).toBeGreaterThan(5)
    expect(world.validate().ok).toBe(true)
  })
})

describe('determinism with obstacles', () => {
  it('a run in one go, in chunks and tick by tick end in the same state', () => {
    const one = World.create({ seed: 9, config: dense() })
    const chunks = World.create({ seed: 9, config: dense() })
    const steps = World.create({ seed: 9, config: dense() })
    one.run(600)
    chunks.run(250)
    chunks.run(350)
    for (let i = 0; i < 600; i++) steps.run(1)
    expect(chunks.stateHash()).toBe(one.stateHash())
    expect(steps.stateHash()).toBe(one.stateHash())
  })

  it('obstacles actually change the run (the switch does something)', () => {
    const without = World.create({ seed: 9 })
    const withRocks = World.create({ seed: 9, config: dense() })
    without.run(300)
    withRocks.run(300)
    expect(withRocks.stateHash()).not.toBe(without.stateHash())
  })

  it('a world whose obstacles amount to nothing is exactly the world without them', () => {
    // Switched on, but every density is zero: no circle, no draw, no difference.
    const kinds: Record<string, unknown> = {}
    for (const kind of OBSTACLE_KINDS) kinds[kind] = { density: everywhere(0) }
    const empty: WorldConfigOverrides = {
      ecology: { obstacles: { enabled: true, kinds } as never }
    }
    const a = World.create({ seed: 13 })
    const b = World.create({ seed: 13, config: empty })
    expect(b.obstacles()).toEqual([])
    a.run(400)
    b.run(400)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})
