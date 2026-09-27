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
}

/** Organism id -> its nearest perceived resource, or `null` when none is in range. */
export type PerceptionBuffer = Map<EntityId, PerceivedResource | null>

/**
 * What `DecisionSystem` wants an organism to do this tick. Desired, not yet physically limited;
 * `MovementSystem` clamps `turn` to `maxTurnRate * deltaTime` and `thrust` to `[0, 1]`.
 */
export interface OrganismIntent {
  /** Desired heading change in radians (positive = counter-clockwise), unclamped. */
  readonly turn: number
  /** Desired fraction of `maxSpeed`, nominally in `[0, 1]`. */
  readonly thrust: number
}

/** Organism id -> its intent for this tick. */
export type IntentBuffer = Map<EntityId, OrganismIntent>
