import { describe, expect, it } from 'vitest'
import { MIN_OBSTACLE_RADIUS, OBSTACLE_KINDS, REGION_TYPES } from '@evo/contracts'
import type {
  ObstacleKind,
  ObstacleSnapshot,
  RegionType,
  WorldConfigOverrides
} from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import { ObstacleField } from '../../src/ecology/ObstacleField'
import type { Obstacle } from '../../src/ecology/ObstacleField'
import { SeededRandom } from '../../src/random/SeededRandom'
import { World } from '../../src/world/World'

// The static obstacle field (ADR 0022): placed once at creation, by biome, from a fixed number of
// draws, and never part of the state hash.

const ZERO_DENSITY = Object.fromEntries(REGION_TYPES.map((type) => [type, 0])) as Record<
  RegionType,
  number
>

/** Every kind at zero density, so a test turns on only the kind it is about. */
function only(
  kind: ObstacleKind,
  density: Partial<Record<RegionType, number>>,
  extra: Record<string, unknown> = {}
): WorldConfigOverrides {
  const kinds: Record<string, unknown> = {}
  for (const k of OBSTACLE_KINDS)
    kinds[k] = { density: k === kind ? { ...ZERO_DENSITY, ...density } : ZERO_DENSITY }
  return {
    ecology: { obstacles: { enabled: true, ...extra, kinds } as never }
  }
}

const ON: WorldConfigOverrides = { ecology: { obstacles: { enabled: true } } }

function field(seed: number, config: WorldConfigOverrides = ON): ObstacleSnapshot[] {
  return World.create({ seed, config }).obstacles()
}

/** The region type at a position, read from the world's own terrain snapshot. */
function typeAt(world: World, x: number, y: number): RegionType {
  const terrain = world.terrain()
  if (terrain === null) throw new Error('regions are off')
  const g = terrain.gridSize
  const column = Math.min(g - 1, Math.max(0, Math.floor((x / terrain.width) * g)))
  const row = Math.min(g - 1, Math.max(0, Math.floor((y / terrain.height) * g)))
  const region = terrain.regions[terrain.cells[row * g + column] as number]
  return (region as { type: RegionType }).type
}

describe('ObstacleField generation', () => {
  it('is empty by default and when switched off, and draws nothing then', () => {
    expect(World.create({ seed: 1 }).obstacles()).toEqual([])
    expect(field(1, { ecology: { obstacles: { enabled: false } } })).toEqual([])
    // Off draws nothing: the world is identical to one that never heard of obstacles (the 41
    // golden entries prove the same against the pinned hashes).
    const a = World.create({ seed: 5 })
    const b = World.create({ seed: 5, config: { ecology: { obstacles: { enabled: false } } } })
    expect(a.stateHash()).toBe(b.stateHash())
  })

  it('places a field when it is on: the same seed gives the same one, another seed another', () => {
    const a = field(3)
    expect(a.length).toBeGreaterThan(0)
    expect(field(3)).toEqual(a)
    expect(field(4)).not.toEqual(a)
  })

  it('has no obstacles in the cluster layout, whatever is switched on', () => {
    expect(
      field(2, { environment: { layout: 'clusters' }, ecology: { obstacles: { enabled: true } } })
    ).toEqual([])
  })

  it('keeps every circle inside the world, clear of the edge, and big enough not to be tunnelled', () => {
    for (const seed of [1, 2, 3, 4]) {
      const world = World.create({ seed, config: ON })
      const { width, height } = world.config.environment
      const { clearance } = world.config.ecology.obstacles
      for (const o of world.obstacles()) {
        expect(o.radius).toBeGreaterThanOrEqual(MIN_OBSTACLE_RADIUS)
        expect(o.x - o.radius).toBeGreaterThanOrEqual(clearance)
        expect(o.x + o.radius).toBeLessThanOrEqual(width - clearance)
        expect(o.y - o.radius).toBeGreaterThanOrEqual(clearance)
        expect(o.y + o.radius).toBeLessThanOrEqual(height - clearance)
      }
    }
  })

  it('gives sequential ids and the flags of the kind', () => {
    const list = field(6)
    list.forEach((o, i) => expect(o.id).toBe(i))
    const config = World.create({ seed: 6, config: ON }).config.ecology.obstacles
    for (const o of list) {
      expect(o.blocksMovement).toBe(config.kinds[o.kind].blocksMovement)
      expect(o.blocksSight).toBe(config.kinds[o.kind].blocksSight)
    }
  })

  it('puts a kind only where its density is above zero (and none where it is zero)', () => {
    for (const seed of [1, 2, 3]) {
      const world = World.create({ seed, config: only('boulder', { cave: 5 }) })
      const list = world.obstacles()
      expect(list.length).toBeGreaterThan(0)
      for (const o of list) expect(typeAt(world, o.x, o.y)).toBe('cave')
    }
    // Negative: with every density zero there is nothing.
    expect(field(1, only('boulder', {}))).toEqual([])
  })

  it('follows the density: a biome with ten times the density gets about ten times the circles', () => {
    let rich = 0
    let poor = 0
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const world = World.create({
        seed,
        config: only('boulder', {
          forest: 1,
          meadow: 1,
          wetland: 1,
          desert: 1,
          cave: 1,
          volcanic: 1
        })
      })
      const terrain = world.terrain()
      if (terrain === null) throw new Error('regions are off')
      for (const o of world.obstacles()) {
        // Count sites in forest against the share of the field that is forest.
        if (typeAt(world, o.x, o.y) === 'forest') rich++
        else poor++
      }
    }
    expect(rich + poor).toBeGreaterThan(50)
    // The densities are equal here, so the share of circles in a biome is its share of the field:
    // not an extreme concentration anywhere (a stuck-in-one-biome generator would break this).
    expect(rich / (rich + poor)).toBeLessThan(0.5)

    const heavy = World.create({ seed: 1, config: only('boulder', { forest: 4, meadow: 0.4 }) })
    const counts = { forest: 0, meadow: 0 }
    for (const o of heavy.obstacles()) {
      const type = typeAt(heavy, o.x, o.y)
      if (type === 'forest' || type === 'meadow') counts[type]++
    }
    const forestCells = heavy
      .terrain()!
      .cells.filter((c) => heavy.terrain()!.regions[c]!.type === 'forest').length
    const meadowCells = heavy
      .terrain()!
      .cells.filter((c) => heavy.terrain()!.regions[c]!.type === 'meadow').length
    // Per unit of that biome's area, forest gets about ten times meadow (generous bounds: a
    // 25 x 25 map of 30 regions is lumpy).
    if (forestCells > 20 && meadowCells > 20 && counts.meadow > 0) {
      const ratio = counts.forest / forestCells / (counts.meadow / meadowCells)
      expect(ratio).toBeGreaterThan(3)
    }
  })

  it('never covers more than maxCoverage of the field', () => {
    const cap = 0.02
    for (const seed of [1, 2, 3]) {
      const world = World.create({
        seed,
        config: only(
          'boulder',
          { cave: 50, meadow: 50, forest: 50, desert: 50 },
          { maxCoverage: cap }
        )
      })
      const { width, height } = world.config.environment
      let area = 0
      for (const o of world.obstacles()) area += Math.PI * o.radius * o.radius
      expect(area).toBeLessThanOrEqual(cap * width * height)
      expect(world.obstacles().length).toBeGreaterThan(0)
    }
    // Negative: a cap of zero places nothing.
    expect(field(1, only('boulder', { cave: 50, meadow: 50 }, { maxCoverage: 0 }))).toEqual([])
  })

  it('does not overlap single circles', () => {
    const list = field(
      9,
      only('boulder', { cave: 9, meadow: 9, forest: 9, desert: 9, wetland: 9, volcanic: 9 })
    )
    expect(list.length).toBeGreaterThan(10)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as ObstacleSnapshot
        const b = list[j] as ObstacleSnapshot
        const reach = a.radius + b.radius
        expect((a.x - b.x) ** 2 + (a.y - b.y) ** 2).toBeGreaterThanOrEqual(reach * reach)
      }
    }
  })

  it('draws the same number of numbers whatever it accepts', () => {
    // Two worlds with the same candidate count but different densities by biome place different
    // fields, and leave the terrain stream (and so the whole state hash, which includes the stream
    // states and where the hazards landed) exactly alike.
    const spread = { forest: 3, meadow: 3, wetland: 3, desert: 3, cave: 3, volcanic: 3 }
    const peaked = { forest: 3, meadow: 0, wetland: 0, desert: 0, cave: 0, volcanic: 0 }
    const a = World.create({ seed: 11, config: only('boulder', spread) })
    const b = World.create({ seed: 11, config: only('boulder', peaked) })
    expect(a.obstacles()).not.toEqual(b.obstacles())
    expect(a.stateHash()).toBe(b.stateHash())
  })

  it('lays a ridge out as a chain of overlapping circles of one size', () => {
    const list = field(
      4,
      only('ridge', { cave: 4, volcanic: 4, desert: 4, meadow: 4, forest: 4, wetland: 4 })
    )
    expect(list.length).toBeGreaterThan(4)
    for (const o of list) {
      // Every circle has a neighbour of the same size 1.2 radii away: the chain's spacing.
      const neighbour = list.some(
        (p) =>
          p.id !== o.id &&
          p.radius === o.radius &&
          Math.abs(Math.sqrt((p.x - o.x) ** 2 + (p.y - o.y) ** 2) - 1.2 * o.radius) < 1e-6
      )
      expect(neighbour).toBe(true)
    }
  })

  it('lays reeds out as a tight cluster, and reeds do not block movement but do block sight', () => {
    const list = field(
      4,
      only('reeds', { wetland: 8, forest: 8, meadow: 8, desert: 8, cave: 8, volcanic: 8 })
    )
    expect(list.length).toBeGreaterThan(3)
    for (const o of list) {
      expect(o.blocksMovement).toBe(false)
      expect(o.blocksSight).toBe(true)
    }
  })

  it('lets a pond be seen across but not walked through', () => {
    const [pond] = field(4, only('pond', { wetland: 9, meadow: 9, forest: 9 }))
    expect(pond).toBeDefined()
    expect(pond!.blocksMovement).toBe(true)
    expect(pond!.blocksSight).toBe(false)
  })

  it('leaves the world connected: free space stays one piece over many seeds', () => {
    // Flood fill on 10-unit cells, a cell blocked when its centre is within a small body of a
    // movement-blocking circle. The largest free component must hold nearly all the free cells.
    const body = 6
    for (let seed = 1; seed <= 32; seed++) {
      const world = World.create({ seed, config: ON })
      const { width, height } = world.config.environment
      const cell = 10
      const nx = Math.ceil(width / cell)
      const ny = Math.ceil(height / cell)
      const blocking = world.obstacles().filter((o) => o.blocksMovement)
      const free = new Uint8Array(nx * ny)
      let freeCount = 0
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x = (i + 0.5) * cell
          const y = (j + 0.5) * cell
          const blocked = blocking.some((o) => {
            const reach = o.radius + body
            return (x - o.x) ** 2 + (y - o.y) ** 2 < reach * reach
          })
          if (!blocked) {
            free[j * nx + i] = 1
            freeCount++
          }
        }
      }
      const seen = new Uint8Array(nx * ny)
      let best = 0
      for (let start = 0; start < free.length; start++) {
        if (!free[start] || seen[start]) continue
        let size = 0
        const stack = [start]
        seen[start] = 1
        while (stack.length > 0) {
          const at = stack.pop() as number
          size++
          const i = at % nx
          const j = (at - i) / nx
          for (const [di, dj] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1]
          ] as const) {
            const ni = i + di
            const nj = j + dj
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue
            const next = nj * nx + ni
            if (free[next] && !seen[next]) {
              seen[next] = 1
              stack.push(next)
            }
          }
        }
        best = Math.max(best, size)
      }
      expect(best / freeCount).toBeGreaterThanOrEqual(0.95)
    }
  })

  it('answers whether a point is inside something that blocks movement, with room to spare', () => {
    // Without an ecology model every biome uses the mean density, so one field of boulders and one
    // of reeds can be built directly and queried.
    const build = (kind: ObstacleKind): ObstacleField => {
      const config = resolveWorldConfig(
        only(kind, { meadow: 9, forest: 9, wetland: 9, desert: 9, cave: 9, volcanic: 9 })
      )
      return ObstacleField.generate(config, null, new SeededRandom([1, 2, 3, 4]))
    }
    const boulders = build('boulder')
    const first = boulders.obstacles[0] as Obstacle
    expect(boulders.size).toBeGreaterThan(5)
    expect(boulders.blocksMovementAt(first.x, first.y, 0)).toBe(true)
    expect(boulders.blocksMovementAt(first.x + first.radius * 0.9, first.y, 0)).toBe(true)
    // Just outside the edge: not inside, but inside once a body's radius is added as margin.
    const outside = first.x + first.radius + 2
    const free = boulders.obstacles.every(
      (o) => (outside - o.x) ** 2 + (first.y - o.y) ** 2 >= (o.radius + 1) ** 2
    )
    if (free) {
      expect(boulders.blocksMovementAt(outside, first.y, 0)).toBe(false)
      expect(boulders.blocksMovementAt(outside, first.y, 4)).toBe(true)
    }
    // Reeds do not block movement, so the answer is always no (negative: same geometry as above).
    const reeds = build('reeds')
    expect(reeds.size).toBeGreaterThan(3)
    const reed = reeds.obstacles[0] as Obstacle
    expect(reeds.blocksMovementAt(reed.x, reed.y, 0)).toBe(false)
    // An empty field never blocks.
    expect(ObstacleField.empty().blocksMovementAt(100, 100, 50)).toBe(false)
  })

  it('runs the same stepped and in one go, with obstacles on', () => {
    const a = World.create({ seed: 8, config: ON })
    const b = World.create({ seed: 8, config: ON })
    a.run(300)
    for (let i = 0; i < 300; i++) b.run(1)
    expect(a.stateHash()).toBe(b.stateHash())
  })
})
