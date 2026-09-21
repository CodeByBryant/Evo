import { describe, expect, it } from 'vitest'
import {
  HALF_PI,
  PI,
  TWO_PI,
  add,
  angle,
  circleContainsPoint,
  circleIntersectsRect,
  circlesIntersect,
  clamp,
  clampLength,
  clampToRect,
  distance,
  distanceSquared,
  dot,
  fromAngle,
  length,
  lengthSquared,
  lerp,
  lerpVec,
  normalize,
  rectContainsPoint,
  scale,
  sub,
  vec,
  wrapAngle
} from '../src/index'

describe('scalar', () => {
  it('constants match the platform values', () => {
    expect(PI).toBe(Math.PI)
    expect(TWO_PI).toBe(Math.PI * 2)
    expect(HALF_PI).toBe(Math.PI / 2)
  })

  it('clamp restricts to the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })

  it('lerp interpolates and extrapolates', () => {
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
    expect(lerp(10, 20, 0.25)).toBe(12.5)
    expect(lerp(10, 20, 2)).toBe(30)
  })

  it('wrapAngle maps into [-PI, PI)', () => {
    expect(wrapAngle(0)).toBe(0)
    expect(wrapAngle(PI)).toBeCloseTo(-PI, 12)
    expect(wrapAngle(-PI)).toBeCloseTo(-PI, 12)
    expect(wrapAngle(3 * PI)).toBeCloseTo(-PI, 12)
    expect(wrapAngle(TWO_PI + 0.5)).toBeCloseTo(0.5, 12)
    expect(wrapAngle(-TWO_PI - 0.5)).toBeCloseTo(-0.5, 12)
    for (let x = -50; x <= 50; x += 0.37) {
      const wrapped = wrapAngle(x)
      expect(wrapped).toBeGreaterThanOrEqual(-PI)
      expect(wrapped).toBeLessThan(PI)
    }
  })
})

describe('vector', () => {
  it('adds, subtracts and scales without mutating inputs', () => {
    const a = vec(1, 2)
    const b = vec(3, 5)
    expect(add(a, b)).toEqual({ x: 4, y: 7 })
    expect(sub(b, a)).toEqual({ x: 2, y: 3 })
    expect(scale(a, 3)).toEqual({ x: 3, y: 6 })
    expect(a).toEqual({ x: 1, y: 2 })
    expect(b).toEqual({ x: 3, y: 5 })
  })

  it('computes dot products, lengths and distances', () => {
    expect(dot(vec(1, 2), vec(3, 4))).toBe(11)
    expect(lengthSquared(vec(3, 4))).toBe(25)
    expect(length(vec(3, 4))).toBe(5)
    expect(distanceSquared(vec(1, 1), vec(4, 5))).toBe(25)
    expect(distance(vec(1, 1), vec(4, 5))).toBe(5)
  })

  it('normalizes, treating the zero vector as its own normal', () => {
    expect(normalize(vec(0, 5))).toEqual({ x: 0, y: 1 })
    expect(length(normalize(vec(3, 4)))).toBeCloseTo(1, 15)
    expect(normalize(vec(0, 0))).toEqual({ x: 0, y: 0 })
  })

  it('clampLength shortens but never lengthens', () => {
    expect(clampLength(vec(3, 4), 10)).toEqual({ x: 3, y: 4 })
    const shortened = clampLength(vec(3, 4), 2.5)
    expect(length(shortened)).toBeCloseTo(2.5, 15)
    expect(shortened.x / shortened.y).toBeCloseTo(0.75, 15)
  })

  it('angle and fromAngle are inverse operations', () => {
    expect(angle(vec(1, 0))).toBe(0)
    expect(angle(vec(0, 1))).toBeCloseTo(HALF_PI, 15)
    expect(angle(vec(-1, 0))).toBeCloseTo(PI, 15)
    const v = fromAngle(1, 2)
    expect(length(v)).toBeCloseTo(2, 15)
    expect(angle(v)).toBeCloseTo(1, 15)
    expect(fromAngle(0)).toEqual({ x: 1, y: 0 })
  })

  it('lerpVec interpolates componentwise', () => {
    expect(lerpVec(vec(0, 10), vec(10, 20), 0.5)).toEqual({ x: 5, y: 15 })
  })
})

describe('geometry', () => {
  const rect = { x: 10, y: 20, width: 100, height: 50 }

  it('rectContainsPoint includes the edges', () => {
    expect(rectContainsPoint(rect, vec(10, 20))).toBe(true)
    expect(rectContainsPoint(rect, vec(110, 70))).toBe(true)
    expect(rectContainsPoint(rect, vec(60, 45))).toBe(true)
    expect(rectContainsPoint(rect, vec(9.99, 45))).toBe(false)
    expect(rectContainsPoint(rect, vec(60, 70.01))).toBe(false)
  })

  it('clampToRect moves outside points onto the boundary', () => {
    expect(clampToRect(vec(0, 0), rect)).toEqual({ x: 10, y: 20 })
    expect(clampToRect(vec(500, 500), rect)).toEqual({ x: 110, y: 70 })
    expect(clampToRect(vec(50, 30), rect)).toEqual({ x: 50, y: 30 })
  })

  it('circleContainsPoint includes the boundary', () => {
    const circle = { center: vec(0, 0), radius: 5 }
    expect(circleContainsPoint(circle, vec(3, 4))).toBe(true)
    expect(circleContainsPoint(circle, vec(3, 4.01))).toBe(false)
  })

  it('circlesIntersect counts touching circles as intersecting', () => {
    const a = { center: vec(0, 0), radius: 5 }
    expect(circlesIntersect(a, { center: vec(10, 0), radius: 5 })).toBe(true)
    expect(circlesIntersect(a, { center: vec(10.01, 0), radius: 5 })).toBe(false)
    expect(circlesIntersect(a, { center: vec(1, 1), radius: 0.5 })).toBe(true)
  })

  it('circleIntersectsRect handles inside, edge, corner and separated cases', () => {
    expect(circleIntersectsRect({ center: vec(50, 40), radius: 1 }, rect)).toBe(true)
    expect(circleIntersectsRect({ center: vec(5, 40), radius: 5 }, rect)).toBe(true)
    expect(circleIntersectsRect({ center: vec(5, 40), radius: 4.9 }, rect)).toBe(false)
    expect(circleIntersectsRect({ center: vec(7, 17), radius: 5 }, rect)).toBe(true)
    expect(circleIntersectsRect({ center: vec(0, 0), radius: 5 }, rect)).toBe(false)
  })
})
