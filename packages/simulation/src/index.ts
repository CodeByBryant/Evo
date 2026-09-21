/** Placeholder engine version; replaced when the kernel lands (Phase 2). */
export const ENGINE_VERSION = '0.0.0'

export interface WorldOptions {
  seed: number
}

/** Placeholder world. The real deterministic kernel is built in Phase 2. */
export class World {
  readonly seed: number

  constructor(options: WorldOptions) {
    this.seed = options.seed
  }
}

export { PI, TWO_PI, HALF_PI, clamp, lerp, wrapAngle } from './math/scalar'
export { MAX_TRIG_ARGUMENT, sin, cos, atan2, ln } from './math/trig'
export {
  vec,
  add,
  sub,
  scale,
  dot,
  lengthSquared,
  length,
  distanceSquared,
  distance,
  normalize,
  clampLength,
  angle,
  fromAngle,
  lerpVec
} from './math/vector'
export {
  rectContainsPoint,
  clampToRect,
  circleContainsPoint,
  circlesIntersect,
  circleIntersectsRect
} from './geometry/intersections'
export type { RandomSource } from './random/RandomSource'
export { SeededRandom, FALLBACK_WORDS } from './random/SeededRandom'
export type { RandomState } from './random/SeededRandom'
export {
  RandomStreams,
  STREAM_NAMES,
  deriveStreamWords,
  expandSeed,
  fnv1a32,
  splitmix32,
  streamDerivationBytes,
  withFallback
} from './random/streams'
export type { StreamName } from './random/streams'
export { SimulationClock } from './clock/SimulationClock'
export type { ClockState } from './clock/SimulationClock'
export { HASH_SCHEMA_VERSION, StateHasher } from './serialization/hash'
export { utf8Encode } from './serialization/utf8'
