/** pi as the nearest binary64 value. */
export const PI = 3.141592653589793

export const TWO_PI = 6.283185307179586

export const HALF_PI = 1.5707963267948966

/** Restricts `value` to the inclusive range `[min, max]`. */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Linear interpolation: `a` at `t = 0`, `b` at `t = 1` (not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Wraps an angle in radians into `[-PI, PI)` using only exact arithmetic.
 * Precision degrades for very large magnitudes; the engine keeps headings wrapped every tick.
 */
export function wrapAngle(angle: number): number {
  return angle - TWO_PI * Math.floor((angle + PI) / TWO_PI)
}
