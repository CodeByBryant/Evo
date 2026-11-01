import { describe, expect, it } from 'vitest'
import { SEASONS } from '@evo/contracts'
import { World } from '../src/index'
import { withoutEcology } from './support/ecology'

/**
 * The read-only surface a presentation layer uses (docs/decisions/0011): the region map, the
 * current season, and capacities on organism snapshots. None of it is hashed or draws randomness.
 */
describe('World.terrain()', () => {
  const world = World.create({ seed: 42 })

  it('describes every cell of the region grid', () => {
    const terrain = world.terrain()
    expect(terrain).not.toBeNull()
    if (terrain === null) return
    expect(terrain.width).toBe(world.config.environment.width)
    expect(terrain.height).toBe(world.config.environment.height)
    expect(terrain.gridSize).toBe(world.config.ecology.regions.gridSize)
    expect(terrain.cells).toHaveLength(terrain.gridSize * terrain.gridSize)
    expect(terrain.regions).toHaveLength(world.config.ecology.regions.seedCount)
  })

  it('agrees with the point queries at every cell centre', () => {
    const terrain = world.terrain()
    if (terrain === null) throw new Error('regions are on by default')
    const { gridSize, width, height } = terrain
    for (let row = 0; row < gridSize; row += 3) {
      for (let column = 0; column < gridSize; column += 3) {
        const x = ((column + 0.5) * width) / gridSize
        const y = ((row + 0.5) * height) / gridSize
        const index = terrain.cells[row * gridSize + column]
        expect(index).toBe(world.regionIndexAt(x, y))
        expect(terrain.regions[index as number]?.type).toBe(world.regionTypeAt(x, y))
      }
    }
  })

  it('is a copy: changing it changes nothing in the world', () => {
    const before = world.stateHash()
    const terrain = world.terrain()
    if (terrain === null) throw new Error('regions are on by default')
    ;(terrain.cells as number[]).fill(0)
    ;(terrain.regions as unknown as { type: string }[]).forEach((region) => (region.type = 'cave'))
    expect(world.stateHash()).toBe(before)
    const again = world.terrain()
    expect(again?.cells).not.toEqual(terrain.cells)
  })

  it('is null when regions are off', () => {
    expect(World.create({ seed: 1, config: withoutEcology() }).terrain()).toBeNull()
  })
})

describe('World.season', () => {
  it('is null when seasons are off', () => {
    expect(World.create({ seed: 1, config: withoutEcology() }).season).toBeNull()
  })

  it('follows the clock through the four seasons in order', () => {
    const world = World.create({ seed: 7 })
    const length = world.config.ecology.seasons.seasonLength
    const seen: string[] = []
    while (world.clock.time < length * 4.5) {
      world.run(100)
      const expected = SEASONS[Math.floor(world.clock.time / length) % 4]
      expect(world.season).toBe(expected)
      if (seen[seen.length - 1] !== world.season) seen.push(world.season as string)
    }
    expect(seen.slice(0, 5)).toEqual(['spring', 'summer', 'autumn', 'winter', 'spring'])
  })
})

describe('organism snapshots', () => {
  it('carry the capacities a presentation layer needs for ratios', () => {
    const world = World.create({ seed: 3 })
    world.run(500)
    const { organisms } = world.snapshot()
    expect(organisms.length).toBeGreaterThan(0)
    for (const organism of organisms) {
      const genome = world.genomeOf(organism.id)
      expect(organism.maxAge).toBe(genome?.physical.maxAge)
      expect(organism.maxEnergy).toBeGreaterThan(0)
      expect(organism.maxHealth).toBeGreaterThan(0)
      expect(organism.energy).toBeLessThanOrEqual(organism.maxEnergy + 1e-9)
      expect(organism.health).toBeLessThanOrEqual(organism.maxHealth + 1e-9)
    }
  })

  it('cannot be used to change the world', () => {
    const world = World.create({ seed: 3 })
    world.run(200)
    const before = world.stateHash()
    const snapshot = world.snapshot()
    for (const organism of snapshot.organisms) {
      ;(organism.position as { x: number }).x = -1
      ;(organism as { energy: number }).energy = 1e9
    }
    ;(snapshot.resources as unknown[]).length = 0
    expect(world.stateHash()).toBe(before)
    world.run(50)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})
