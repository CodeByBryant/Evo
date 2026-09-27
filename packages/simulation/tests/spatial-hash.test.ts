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
  })
})
