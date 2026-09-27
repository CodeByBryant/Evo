import type { EntityId } from './entity'
import type { DeathCause } from './world'
import type { Vec2 } from './math'

interface BaseEvent {
  /** Tick at which the event occurred (initial population events use tick 0). */
  readonly tick: number
}

export interface OrganismBornEvent extends BaseEvent {
  readonly type: 'organism-born'
  readonly organismId: EntityId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  readonly position: Readonly<Vec2>
}

export interface OrganismDiedEvent extends BaseEvent {
  readonly type: 'organism-died'
  readonly organismId: EntityId
  readonly cause: DeathCause
  readonly position: Readonly<Vec2>
}

export interface ResourceSpawnedEvent extends BaseEvent {
  readonly type: 'resource-spawned'
  readonly resourceId: EntityId
  readonly position: Readonly<Vec2>
}

export interface ResourceConsumedEvent extends BaseEvent {
  readonly type: 'resource-consumed'
  readonly organismId: EntityId
  readonly resourceId: EntityId
  /** Energy taken from the resource; `energyGained + energyWasted`. */
  readonly amount: number
  readonly energyGained: number
  /** Energy that did not fit under the organism's capacity. */
  readonly energyWasted: number
  readonly position: Readonly<Vec2>
}

/** Verbose detail level only. */
export interface OrganismMovedEvent extends BaseEvent {
  readonly type: 'organism-moved'
  readonly organismId: EntityId
  readonly from: Readonly<Vec2>
  readonly to: Readonly<Vec2>
}

/** Verbose detail level only. */
export interface EnergyChangedEvent extends BaseEvent {
  readonly type: 'energy-changed'
  readonly organismId: EntityId
  readonly previous: number
  readonly current: number
  readonly reason: 'consumption' | 'metabolism'
}

/**
 * Only organisms that clear the maturity/cooldown/energy gates count as "attempting" - an
 * organism that's simply immature never generates one of these, the same way an organism that
 * finds no food never generates a failed `resource-consumed` (docs/decisions/0005).
 */
export type ReproductionFailureReason = 'no-partner' | 'population-cap'

/** Essential tier: not gated by `history.eventDetail`. Emitted starting in Phase 3. */
export interface ReproductionAttemptedEvent extends BaseEvent {
  readonly type: 'reproduction-attempted'
  readonly organismId: EntityId
  readonly partnerId: EntityId | null
  /** Set when `succeeded` is `true`. */
  readonly childId: EntityId | null
  readonly succeeded: boolean
  /** Set when `succeeded` is `false`. */
  readonly failureReason: ReproductionFailureReason | null
}

export type WorldEvent =
  | OrganismBornEvent
  | OrganismDiedEvent
  | ResourceSpawnedEvent
  | ResourceConsumedEvent
  | OrganismMovedEvent
  | EnergyChangedEvent
  | ReproductionAttemptedEvent

export type WorldEventType = WorldEvent['type']
