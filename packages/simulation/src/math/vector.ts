import type { Vec2 } from '@evo/contracts'
import { cos, sin, atan2 } from './trig'

/** Vector functions are pure: they return new objects and never mutate their arguments. */

export function vec(x: number, y: number): Vec2 {
  return { x, y }
}

export function add(a: Readonly<Vec2>, b: Readonly<Vec2>): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

export function sub(a: Readonly<Vec2>, b: Readonly<Vec2>): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

export function scale(v: Readonly<Vec2>, factor: number): Vec2 {
  return { x: v.x * factor, y: v.y * factor }
}

export function dot(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return a.x * b.x + a.y * b.y
}

export function lengthSquared(v: Readonly<Vec2>): number {
  return v.x * v.x + v.y * v.y
}

/** Euclidean length via `sqrt` (correctly rounded), never `Math.hypot`. */
export function length(v: Readonly<Vec2>): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

export function distanceSquared(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}

export function distance(a: Readonly<Vec2>, b: Readonly<Vec2>): number {
  return Math.sqrt(distanceSquared(a, b))
}

/** Unit vector in the same direction; the zero vector normalizes to the zero vector. */
export function normalize(v: Readonly<Vec2>): Vec2 {
  const len = length(v)
  return len === 0 ? { x: 0, y: 0 } : { x: v.x / len, y: v.y / len }
}

/** Shrinks `v` to at most `maxLength`, preserving direction. */
export function clampLength(v: Readonly<Vec2>, maxLength: number): Vec2 {
  const len = length(v)
  if (len <= maxLength) return { x: v.x, y: v.y }
  const factor = maxLength / len
  return { x: v.x * factor, y: v.y * factor }
}

/** Angle of `v` in radians in `[-PI, PI]`, measured counter-clockwise from the +x axis. */
export function angle(v: Readonly<Vec2>): number {
  return atan2(v.y, v.x)
}

/** Vector of the given length pointing along `radians`. */
export function fromAngle(radians: number, magnitude = 1): Vec2 {
  return { x: cos(radians) * magnitude, y: sin(radians) * magnitude }
}

export function lerpVec(a: Readonly<Vec2>, b: Readonly<Vec2>, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
