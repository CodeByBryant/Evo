import { describe, expect, it } from 'vitest'
import { SpatialHash } from '../src/spatial/SpatialHash'

interface Point {
  id: number
  x: number
  y: number
}

const point = (id: number, x: number, y: number): Point => ({ id, x, y })

describe('SpatialHash', () => {
  it('rejects a non-positive cell size', () => {
    expect(() => new SpatialHash<Point>(0, (p) => p)).toThrow(RangeError)
    expect(() => new SpatialHash<Point>(-1, (p) => p)).toThrow(RangeError)
    expect(() => new SpatialHash<Point>(Number.NaN, (p) => p)).toThrow(RangeError)
  })

  it('returns nothing before rebuild() and after rebuilding with an empty list', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    expect(index.queryRadius({ x: 0, y: 0 }, 100)).toEqual([])
    index.rebuild([point(1, 5, 5)])
    index.rebuild([])
    expect(index.queryRadius({ x: 5, y: 5 }, 100)).toEqual([])
  })

  it('finds points within radius and excludes points outside it', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    index.rebuild([point(1, 3, 4), point(2, 100, 100)])
    const hits = index.queryRadius({ x: 0, y: 0 }, 5)
    expect(hits).toHaveLength(1)
    expect(hits[0]?.item.id).toBe(1)
    expect(hits[0]?.distanceSquared).toBe(25)
  })

  it('includes points exactly on the radius boundary', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    index.rebuild([point(1, 5, 0)])
    expect(index.queryRadius({ x: 0, y: 0 }, 5)).toHaveLength(1)
    expect(index.queryRadius({ x: 0, y: 0 }, 4.999)).toHaveLength(0)
  })

  it('sorts results by ascending distanceSquared, ties broken by id', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    index.rebuild([point(3, 10, 0), point(1, 0, 10), point(2, 0, 10), point(4, 5, 0)])
    const hits = index.queryRadius({ x: 0, y: 0 }, 100)
    expect(hits.map((h) => h.item.id)).toEqual([4, 1, 2, 3])
  })

  it('finds points across cell boundaries (query radius spans multiple cells)', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    // Cell size 10: these two points live in different cells but are 2 apart.
    index.rebuild([point(1, 9, 9), point(2, 11, 11)])
    const hits = index.queryRadius({ x: 10, y: 10 }, 3)
    expect(hits.map((h) => h.item.id).sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('rebuild() replaces the previous contents entirely', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    index.rebuild([point(1, 0, 0)])
    index.rebuild([point(2, 0, 0)])
    const hits = index.queryRadius({ x: 0, y: 0 }, 1)
    expect(hits.map((h) => h.item.id)).toEqual([2])
  })

  it('rejects a negative query radius', () => {
    const index = new SpatialHash<Point>(10, (p) => p)
    expect(() => index.queryRadius({ x: 0, y: 0 }, -1)).toThrow(RangeError)
  })

  describe('nearest()', () => {
    it('returns the closest item, or null when none are in range', () => {
      const index = new SpatialHash<Point>(10, (p) => p)
      index.rebuild([point(1, 3, 0), point(2, 1, 0)])
      expect(index.nearest({ x: 0, y: 0 }, 100)?.item.id).toBe(2)
      expect(index.nearest({ x: 0, y: 0 }, 0.5)).toBeNull()
    })

    it('breaks distance ties by the lower id', () => {
      const index = new SpatialHash<Point>(10, (p) => p)
      index.rebuild([point(7, 2, 0), point(3, -2, 0), point(5, 0, 2)])
      expect(index.nearest({ x: 0, y: 0 }, 10)?.item.id).toBe(3)
    })

    it('skips the excluded id', () => {
      const index = new SpatialHash<Point>(10, (p) => p)
      index.rebuild([point(1, 0, 0), point(2, 4, 0), point(3, 1, 0)])
      expect(index.nearest({ x: 0, y: 0 }, 10, 1)?.item.id).toBe(3)
      expect(index.nearest({ x: 0, y: 0 }, 0.5, 1)).toBeNull()
    })

    it('agrees with the first element of queryRadius on a scattered set', () => {
      const index = new SpatialHash<Point>(13, (p) => p)
      const points: Point[] = []
      for (let i = 1; i <= 200; i++) points.push(point(i, (i * 37) % 101, (i * 53) % 97))
      index.rebuild(points)
      for (let i = 0; i < 100; i++) {
        const center = { x: (i * 7) % 100, y: (i * 11) % 90 }
        const radius = 5 + (i % 40)
        const first = index.queryRadius(center, radius)[0]
        const near = index.nearest(center, radius)
        expect(near?.item.id).toBe(first?.item.id)
        expect(near?.distanceSquared).toBe(first?.distanceSquared)
      }
    })
  })
})
