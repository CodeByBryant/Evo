/** The only source of randomness simulation code may use. */
export interface RandomSource {
  /** Uniform float in `[0, 1)`. */
  float(): number
  /** Uniform integer in the inclusive range `[min, max]`. */
  integer(min: number, max: number): number
  /** `true` with the given probability (default one half). */
  boolean(probability?: number): boolean
  /** Normally distributed value. */
  normal(mean?: number, standardDeviation?: number): number
  /** A uniformly chosen element; throws on an empty list. */
  choose<T>(items: readonly T[]): T
}
