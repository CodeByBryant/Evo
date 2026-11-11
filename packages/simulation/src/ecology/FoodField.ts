import type { FoodDistributionConfig } from '@evo/contracts'

/**
 * Where food is likely to appear (ADR 0021): a smooth pattern of patches over the field that fades
 * in and out and drifts, derived from the world seed alone. It is a pure function of `(x, y, time)`:
 * no random stream is read, nothing is stored, nothing is hashed. Value noise on an integer lattice
 * (a hash of the cell corners, smootherstep between them) in two octaves, with time as the third
 * axis. Only `+ - * /`, `Math.floor` and `Math.imul`, so the result is identical on every platform.
 */
export class FoodField {
  private readonly seed: number

  constructor(
    seed: number,
    private readonly settings: Pick<
      FoodDistributionConfig,
      'scale' | 'contrast' | 'floor' | 'turnover'
    >
  ) {
    // Scramble the world seed once so neighbouring seeds give unrelated patterns.
    let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    this.seed = (h ^ (h >>> 16)) | 0
  }

  /** A value in `[0, 1)` for one lattice corner. */
  private corner(x: number, y: number, z: number, octave: number): number {
    let h = this.seed ^ Math.imul(octave + 1, 0x7feb352d)
    h ^= Math.imul(x, 0x27d4eb2d)
    h ^= Math.imul(y, 0x165667b1)
    h ^= Math.imul(z, 0x9e3779b1)
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
    h ^= h >>> 16
    return (h >>> 0) / 4294967296
  }

  /** Value noise in `[0, 1)` at a point in lattice units. */
  private noise(x: number, y: number, z: number, octave: number): number {
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const iz = Math.floor(z)
    const fx = smoother(x - ix)
    const fy = smoother(y - iy)
    const fz = smoother(z - iz)
    const c = (dx: number, dy: number, dz: number): number =>
      this.corner(ix + dx, iy + dy, iz + dz, octave)
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), fx)
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), fx)
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), fx)
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), fx)
    return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz)
  }

  /**
   * How likely a site is to take food, in `[floor, 1]`: `floor + (1 - floor) * shape`, where the
   * shape mixes a flat 1 (contrast 0: every site alike) with a smoothed threshold of the noise
   * (contrast 1: patches and bare ground). `time` is in simulated seconds.
   */
  density(x: number, y: number, time: number): number {
    const { scale, contrast, floor, turnover } = this.settings
    const u = x / scale
    const v = y / scale
    const w = turnover > 0 ? time / turnover : 0
    const raw = 0.65 * this.noise(u, v, w, 0) + 0.35 * this.noise(2 * u, 2 * v, 2 * w, 1)
    // The two octaves average to 0.5 with less spread than one, so widen before thresholding.
    const spread = 0.5 + (raw - 0.5) * 1.8
    const patch = smoother(clamp01((spread - 0.3) / 0.4))
    const shape = 1 - contrast + contrast * patch
    return floor + (1 - floor) * shape
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Smootherstep: 0 at 0, 1 at 1, flat slope at both ends. */
const smoother = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)
