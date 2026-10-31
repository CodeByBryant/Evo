import { OBSERVATION_SIZE } from '@evo/contracts'
import type { Observation } from '@evo/contracts'
import { clamp } from '../math/scalar'
import { cos, sin } from '../math/trig'

/** Something sensed: the vector from the organism to it, in world space. */
export interface Sighting {
  readonly dx: number
  readonly dy: number
  readonly distanceSquared: number
}

export interface ObservationInput {
  /** Energy as a fraction of the organism's effective capacity. */
  readonly energy: number
  /** Age as a fraction of the organism's `maxAge`. */
  readonly age: number
  readonly x: number
  readonly y: number
  readonly vx: number
  readonly vy: number
  readonly heading: number
  readonly maxSpeed: number
  readonly sensorRadius: number
  readonly worldWidth: number
  readonly worldHeight: number
  readonly food: Sighting | null
  readonly peer: Sighting | null
  /** Seconds since last fed, already divided by the horizon and clamped to `[0, 1]`. */
  readonly timeSinceFood: number
  readonly previousReward: number
  readonly previousAction: readonly number[]
  /** Health as a fraction of maximum (default 1). */
  readonly health?: number
  /** The hazard whose edge is nearest within sensor range (default none). */
  readonly hazard?: HazardSighting | null
  /** The perceived food's kind, normalized to `[0, 1]` (default 0). */
  readonly foodKind?: number
  /** Cosine and sine of the year phase; 0 when seasons are off (default 0). */
  readonly seasonCos?: number
  readonly seasonSin?: number
  /** Region plus season temperature in `[-1, 1]` (default 0). */
  readonly temperature?: number
  /** Region times season movement multiplier (default 1). */
  readonly movementScale?: number
}

/** A hazard sensed: the vector to its centre and its radius. */
export interface HazardSighting {
  readonly dx: number
  readonly dy: number
  readonly distanceSquared: number
  readonly radius: number
}

function writeSighting(
  out: number[],
  sighting: Sighting | null,
  cosHeading: number,
  sinHeading: number,
  sensorRadius: number
): void {
  if (sighting === null) {
    out.push(0, 0, 0, 0)
    return
  }
  const distance = Math.sqrt(sighting.distanceSquared)
  // Rotate the world-space offset into the body frame; a target at the same spot is "ahead".
  const bodyX = sighting.dx * cosHeading + sighting.dy * sinHeading
  const bodyY = -sighting.dx * sinHeading + sighting.dy * cosHeading
  out.push(
    1,
    distance > 0 ? bodyX / distance : 1,
    distance > 0 ? bodyY / distance : 0,
    clamp(1 - distance / sensorRadius, 0, 1)
  )
}

function writeHazard(
  out: number[],
  hazard: HazardSighting | null,
  cosHeading: number,
  sinHeading: number,
  sensorRadius: number
): void {
  if (hazard === null) {
    out.push(0, 0, 0, 0)
    return
  }
  const distance = Math.sqrt(hazard.distanceSquared)
  const bodyX = hazard.dx * cosHeading + hazard.dy * sinHeading
  const bodyY = -hazard.dx * sinHeading + hazard.dy * cosHeading
  // Proximity is measured to the hazard's edge: 1 inside it, falling to 0 at the sensor radius.
  const edge = Math.max(0, distance - hazard.radius)
  out.push(
    1,
    distance > 0 ? bodyX / distance : 1,
    distance > 0 ? bodyY / distance : 0,
    clamp(1 - edge / sensorRadius, 0, 1)
  )
}

/**
 * Builds the 33-number observation in the fixed order of `OBSERVATION_LABELS`
 * (docs/learning/brain.md). Pure; every value is bounded to `[-1, 1]`.
 */
export function buildObservation(input: ObservationInput): Observation {
  const cosHeading = cos(input.heading)
  const sinHeading = sin(input.heading)
  const forward = input.vx * cosHeading + input.vy * sinHeading
  const lateral = -input.vx * sinHeading + input.vy * cosHeading
  const out: number[] = [
    clamp(input.energy, 0, 1),
    clamp(input.age, 0, 1),
    input.maxSpeed > 0 ? clamp(forward / input.maxSpeed, -1, 1) : 0,
    input.maxSpeed > 0 ? clamp(lateral / input.maxSpeed, -1, 1) : 0,
    clamp(input.x / input.worldWidth, 0, 1),
    clamp(input.y / input.worldHeight, 0, 1),
    cosHeading,
    sinHeading
  ]
  writeSighting(out, input.food, cosHeading, sinHeading, input.sensorRadius)
  writeSighting(out, input.peer, cosHeading, sinHeading, input.sensorRadius)
  out.push(clamp(input.timeSinceFood, 0, 1), clamp(input.previousReward, -1, 1))
  for (const value of input.previousAction) out.push(value)
  out.push(clamp(input.health ?? 1, 0, 1))
  writeHazard(out, input.hazard ?? null, cosHeading, sinHeading, input.sensorRadius)
  out.push(
    clamp(input.foodKind ?? 0, 0, 1),
    clamp(input.seasonCos ?? 0, -1, 1),
    clamp(input.seasonSin ?? 0, -1, 1),
    clamp(input.temperature ?? 0, -1, 1),
    clamp(input.movementScale ?? 1, 0, 1)
  )
  if (out.length !== OBSERVATION_SIZE) {
    throw new Error(`observation has ${out.length} values, expected ${OBSERVATION_SIZE}`)
  }
  return out
}
