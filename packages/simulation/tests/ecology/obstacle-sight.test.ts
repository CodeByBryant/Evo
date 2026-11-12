import { describe, expect, it } from 'vitest'
import type { WorldConfig } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import type { PeerBuffer, PerceptionBuffer } from '../../src/buffers/types'
import { ObstacleField } from '../../src/ecology/ObstacleField'
import type { Obstacle } from '../../src/ecology/ObstacleField'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

// Obstacles whose kind blocks sight hide food and peers behind them (ADR 0022), whether or not
// creatures hide each other, and ones that do not block sight (a pond) do not.

const config: WorldConfig = resolveWorldConfig(
  withoutEcology({ learning: { controller: 'brain' } })
)
const ORIGIN = 100

const circle = (dx: number, dy: number, radius: number, extra: Partial<Obstacle> = {}) => ({
  kind: 'boulder' as const,
  x: ORIGIN + dx,
  y: ORIGIN + dy,
  radius,
  blocksMovement: true,
  blocksSight: true,
  ...extra
})

interface Scene {
  readonly obstacles?: readonly ReturnType<typeof circle>[]
  /** Food items: [id, dx, dy] from the viewer. */
  readonly foods?: ReadonlyArray<readonly [number, number, number]>
  /** Other creatures: [id, dx, dy] from the viewer. */
  readonly others?: ReadonlyArray<readonly [number, number, number]>
  /** Whether creatures also hide each other (`perception.organismsBlockSight`). */
  readonly organismsBlock?: boolean
  /** Leave the obstacle field out of the blockers altogether (a world without obstacles). */
  readonly noBlockers?: boolean
  readonly viewerAt?: { dx: number; dy: number }
}

function look(scene: Scene): { food: number | null; peer: number | null } {
  const viewer = organismFor(config, 1, {
    x: ORIGIN + (scene.viewerAt?.dx ?? 0),
    y: ORIGIN + (scene.viewerAt?.dy ?? 0),
    heading: 0
  })
  const organisms = new OrganismStore()
  organisms.add(viewer)
  for (const [id, dx, dy] of scene.others ?? []) {
    organisms.add(organismFor(config, id, { x: ORIGIN + dx, y: ORIGIN + dy }))
  }
  const resources = new ResourceStore()
  for (const [id, dx, dy] of scene.foods ?? []) {
    resources.add({ id, x: ORIGIN + dx, y: ORIGIN + dy, remaining: 30, kind: 0 })
  }
  const foodIndex = new SpatialHash<ResourceState>(60, (r) => r)
  foodIndex.rebuild(resources.values())
  const organismIndex = new SpatialHash<OrganismState>(60, (o) => o)
  organismIndex.rebuild(organisms.values())
  const food: PerceptionBuffer = new Map()
  const peers: PeerBuffer = new Map()
  const field = ObstacleField.fromCircles(scene.obstacles ?? [])
  const blockers = scene.noBlockers
    ? undefined
    : {
        organismIndex: scene.organismsBlock ? organismIndex : undefined,
        obstacles: field.maxSightRadius > 0 ? field : undefined
      }
  new PerceptionSystem(
    config,
    organisms,
    foodIndex,
    food,
    { organismIndex, buffer: peers },
    null,
    undefined,
    undefined,
    blockers
  ).update(0)
  const f = food.get(1) as { resourceId: number } | null | undefined
  const p = peers.get(1) as { organismId: number } | null | undefined
  return { food: f?.resourceId ?? null, peer: p?.organismId ?? null }
}

describe('food behind an obstacle', () => {
  const rockAt25 = [circle(25, 0, 8)]
  const behind = { obstacles: rockAt25, foods: [[9, 45, 0]] as const }

  it('is not seen through a rock; with no blockers at all it is (the world without obstacles)', () => {
    expect(look(behind).food).toBeNull()
    expect(look({ ...behind, noBlockers: true }).food).toBe(9)
  })

  it('is hidden by a rock even when creatures do not hide each other', () => {
    expect(look({ ...behind, organismsBlock: false }).food).toBeNull()
    expect(look({ ...behind, organismsBlock: true }).food).toBeNull()
  })

  it('is seen when the rock is off the line by more than its radius (negative)', () => {
    expect(look({ obstacles: [circle(25, 12, 8)], foods: [[9, 45, 0]] }).food).toBe(9)
  })

  it('is seen across a pond, which does not block sight, and hidden by reeds, which do (kinds differ)', () => {
    const pond = circle(25, 0, 8, { kind: 'pond', blocksSight: false })
    const reeds = circle(25, 0, 8, { kind: 'reeds', blocksMovement: false })
    expect(look({ obstacles: [pond], foods: [[9, 45, 0]] }).food).toBe(9)
    expect(look({ obstacles: [reeds], foods: [[9, 45, 0]] }).food).toBeNull()
  })

  it('is seen when the rock is beyond the food or behind the viewer (negative)', () => {
    expect(look({ obstacles: [circle(60, 0, 8)], foods: [[9, 45, 0]] }).food).toBe(9)
    expect(look({ obstacles: [circle(-25, 0, 8)], foods: [[9, 45, 0]] }).food).toBe(9)
  })

  it('falls back to the next nearest food that is not hidden', () => {
    const scene = {
      obstacles: rockAt25,
      foods: [
        [8, 45, 0],
        [9, 30, 40]
      ] as const
    }
    expect(look(scene).food).toBe(9)
    // Without the rock the nearer one (id 8 at 45 beats id 9 at 50) is chosen.
    expect(look({ ...scene, obstacles: [] }).food).toBe(8)
  })

  it('is not hidden from a viewer standing inside the rock (a body pushed out next tick sees on)', () => {
    expect(
      look({ obstacles: [circle(0, 0, 8)], foods: [[9, 40, 0]], viewerAt: { dx: 0, dy: 0 } }).food
    ).toBe(9)
  })

  it('is hidden when it is itself inside the rock (and so never offered to a creature)', () => {
    expect(look({ obstacles: [circle(45, 0, 8)], foods: [[9, 45, 0]] }).food).toBeNull()
  })

  it('gives up after maxSightChecks hidden candidates, so the work is bounded', () => {
    // Seven hidden items nearer than one that is in the open: with six checks it is never reached.
    const wall = [circle(20, 0, 14), circle(20, 20, 14), circle(20, -20, 14)]
    const hidden: [number, number, number][] = [
      [10, 40, 0],
      [11, 40, 6],
      [12, 40, -6],
      [13, 40, 12],
      [14, 40, -12],
      [15, 42, 0],
      [16, 42, 6]
    ]
    const open: [number, number, number] = [17, 30, 60]
    const scene = { obstacles: wall, foods: [...hidden, open] }
    expect(config.perception.maxSightChecks).toBe(6)
    expect(look(scene).food).toBeNull()
    // Negative: with no rocks the nearest is simply seen.
    expect(look({ ...scene, obstacles: [] }).food).not.toBeNull()
  })
})

describe('a peer behind an obstacle', () => {
  it('is hidden by a rock and seen without it', () => {
    const scene = { obstacles: [circle(25, 0, 8)], others: [[2, 45, 0]] as const }
    expect(look(scene).peer).toBeNull()
    expect(look({ ...scene, obstacles: [] }).peer).toBe(2)
  })

  it('is seen across a pond and when the rock is off the line (negative)', () => {
    const pond = circle(25, 0, 8, { kind: 'pond', blocksSight: false })
    expect(look({ obstacles: [pond], others: [[2, 45, 0]] }).peer).toBe(2)
    expect(look({ obstacles: [circle(25, 14, 8)], others: [[2, 45, 0]] }).peer).toBe(2)
  })
})

describe('obstacles and creatures hiding things together', () => {
  it('a creature and a rock each hide food on their own', () => {
    const food = [[9, 60, 0]] as const
    expect(
      look({
        obstacles: [circle(40, 0, 6)],
        foods: food,
        others: [[2, 20, 0]],
        organismsBlock: true
      }).food
    ).toBeNull()
    expect(look({ foods: food, others: [[2, 20, 0]], organismsBlock: true }).food).toBeNull()
    expect(look({ foods: food, others: [[2, 20, 0]], organismsBlock: false }).food).toBe(9)
  })
})

describe('a world with obstacles', () => {
  it('a world of ponds only has nothing that blocks sight, so it keeps the cheaper search', () => {
    const ponds = (enabled: boolean) =>
      World.create({
        seed: 12,
        config: {
          ecology: {
            obstacles: {
              enabled,
              kinds: {
                boulder: {
                  density: { meadow: 0, forest: 0, wetland: 0, desert: 0, cave: 0, volcanic: 0 }
                },
                tree: {
                  density: { meadow: 0, forest: 0, wetland: 0, desert: 0, cave: 0, volcanic: 0 }
                },
                ridge: {
                  density: { meadow: 0, forest: 0, wetland: 0, desert: 0, cave: 0, volcanic: 0 }
                },
                reeds: {
                  density: { meadow: 0, forest: 0, wetland: 0, desert: 0, cave: 0, volcanic: 0 }
                },
                pond: {
                  density: { meadow: 2, forest: 2, wetland: 2, desert: 2, cave: 2, volcanic: 2 }
                }
              }
            }
          }
        }
      })
    const world = ponds(true)
    expect(world.obstacles().length).toBeGreaterThan(0)
    expect(world.obstacles().every((o) => !o.blocksSight)).toBe(true)
  })
})
