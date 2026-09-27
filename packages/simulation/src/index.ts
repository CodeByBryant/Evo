/** Engine version. Bumped when the public simulation API changes in a way consumers should note. */
export const ENGINE_VERSION = '0.2.0'

export { World } from './world/World'
export type { WorldCreateOptions } from './world/World'

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
