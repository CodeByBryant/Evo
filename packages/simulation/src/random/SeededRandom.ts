import { ln } from '../math/trig'
import type { RandomSource } from './RandomSource'

/** Serializable generator state: the four xoshiro words plus the cached normal spare. */
export interface RandomState {
  readonly words: readonly [number, number, number, number]
  /** Raw (unscaled) second value produced by the polar method, or `null` when none is cached. */
  readonly spare: number | null
}

/** Replacement for the invalid all-zero xoshiro state. */
export const FALLBACK_WORDS: readonly [number, number, number, number] = [
  0x9e3779b9, 0x243f6a88, 0xb7e15162, 0x71374491
]

const TWO_POW_32 = 4_294_967_296

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

/**
 * xoshiro128** generator (32-bit arithmetic only). Its output sequence is specified bit for bit in
 * docs/simulation/determinism.md, section 3.
 */
export class SeededRandom implements RandomSource {
  private s0: number
  private s1: number
  private s2: number
  private s3: number
  private spare: number | null = null

  /** Words must be uint32 and not all zero; use `expandSeed` in `streams.ts` to derive them. */
  constructor(words: readonly [number, number, number, number]) {
    const [w0, w1, w2, w3] = words
    for (const word of words) {
      if (!Number.isInteger(word) || word < 0 || word >= TWO_POW_32) {
        throw new RangeError('random state words must be uint32 values')
      }
    }
    if (w0 === 0 && w1 === 0 && w2 === 0 && w3 === 0) {
      throw new RangeError('the all-zero xoshiro state is invalid')
    }
    this.s0 = w0
    this.s1 = w1
    this.s2 = w2
    this.s3 = w3
  }

  /** Next raw 32-bit output. */
  nextUint32(): number {
    const result = Math.imul(rotl(Math.imul(this.s1, 5), 7), 9) >>> 0
    const t = (this.s1 << 9) >>> 0
    this.s2 = (this.s2 ^ this.s0) >>> 0
    this.s3 = (this.s3 ^ this.s1) >>> 0
    this.s1 = (this.s1 ^ this.s2) >>> 0
    this.s0 = (this.s0 ^ this.s3) >>> 0
    this.s2 = (this.s2 ^ t) >>> 0
    this.s3 = rotl(this.s3, 11)
    return result
  }

  float(): number {
    const high = this.nextUint32() >>> 5
    const low = this.nextUint32() >>> 6
    return (high * 67_108_864 + low) / 9_007_199_254_740_992
  }

  integer(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
      throw new RangeError('integer requires safe integers with min <= max')
    }
    const range = max - min + 1
    if (range > TWO_POW_32) throw new RangeError('integer range must not exceed 2^32')
    const limit = Math.floor(TWO_POW_32 / range) * range
    let draw = this.nextUint32()
    while (draw >= limit) draw = this.nextUint32()
    return min + (draw % range)
  }

  boolean(probability = 0.5): boolean {
    if (!(probability >= 0 && probability <= 1)) {
      throw new RangeError('probability must be within [0, 1]')
    }
    return this.float() < probability
  }

  normal(mean = 0, standardDeviation = 1): number {
    if (this.spare !== null) {
      const value = this.spare
      this.spare = null
      return mean + standardDeviation * value
    }
    for (;;) {
      const u = 2 * this.float() - 1
      const v = 2 * this.float() - 1
      const q = u * u + v * v
      if (q >= 1 || q === 0) continue
      const m = Math.sqrt((-2 * ln(q)) / q)
      this.spare = v * m
      return mean + standardDeviation * (u * m)
    }
  }

  choose<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError('choose requires a non-empty list')
    return items[this.integer(0, items.length - 1)] as T
  }

  getState(): RandomState {
    return { words: [this.s0, this.s1, this.s2, this.s3], spare: this.spare }
  }

  setState(state: RandomState): void {
    const restored = new SeededRandom(state.words)
    this.s0 = restored.s0
    this.s1 = restored.s1
    this.s2 = restored.s2
    this.s3 = restored.s3
    this.spare = state.spare
  }
}
