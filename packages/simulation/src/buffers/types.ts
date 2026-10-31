import type { EntityId, Vec2 } from '@evo/contracts'

/**
 * Cross-system data, owned by `World` and passed into each system's `update()`. Living here
 * (rather than in `systems/` or `world/`) lets both the producing and consuming systems import
 * it without violating the "systems never import each other or world/" rule
 * (docs/simulation/update-order.md).
 */

/** What `PerceptionSystem` found for one organism: the nearest resource within sensor range. */
export interface PerceivedResource {
  readonly resourceId: EntityId
  readonly position: Readonly<Vec2>
  readonly distanceSquared: number
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
}

/** Organism id -> its nearest perceived resource, or `null` when none is in range. */
export type PerceptionBuffer = Map<EntityId, PerceivedResource | null>

/** What `PerceptionSystem` found for one organism: the nearest other organism within sensor range. */
export interface PerceivedPeer {
  readonly organismId: EntityId
  readonly position: Readonly<Vec2>
  readonly distanceSquared: number
}

/**
 * Organism id -> its nearest other organism, or `null` when none is in range. Filled only when
 * the brain controller is active (the reflex controller never reads it).
 */
export type PeerBuffer = Map<EntityId, PerceivedPeer | null>

/**
 * What `DecisionSystem` wants an organism to do this tick. Desired, not yet physically limited;
 * `MovementSystem` clamps `turn` to `maxTurnRate * deltaTime` and `thrust` to `[0, 1]`.
 */
export interface OrganismIntent {
  /** Desired heading change in radians (positive = counter-clockwise), unclamped. */
  readonly turn: number
  /** Desired fraction of `maxSpeed`, nominally in `[0, 1]`. */
  readonly thrust: number
  /** Desired lateral velocity as a fraction of `maxSpeed`, in `[-1, 1]`; positive is to the left. */
  readonly strafe: number
  /** Whether the organism tries to consume food this tick. */
  readonly interact: boolean
}

/** Organism id -> its intent for this tick. */
export type IntentBuffer = Map<EntityId, OrganismIntent>

/** What `PerceptionSystem` found for one organism: the hazard whose edge is nearest within sensor range. */
export interface PerceivedHazard {
  readonly hazardId: number
  readonly position: Readonly<Vec2>
  readonly radius: number
  /** Squared distance to the hazard's centre. */
  readonly distanceSquared: number
}

/** Organism id -> its nearest perceived hazard, or `null`. Filled only under the brain controller. */
export type HazardBuffer = Map<EntityId, PerceivedHazard | null>

/** Organism id -> health damage from the resource it ate this tick (`InteractionSystem` writes, `HealthSystem` reads). */
export type DamageBuffer = Map<EntityId, number>

/** Organism id -> energy spent healing this tick (`HealthSystem` writes, `MetabolismSystem` charges). */
export type RegenBuffer = Map<EntityId, number>
