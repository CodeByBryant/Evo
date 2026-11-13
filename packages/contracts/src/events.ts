import type { EntityId } from './entity'
import type { GenomeId } from './genome'
import type { DeathCause } from './world'
import type { Vec2 } from './math'
import type { HazardKind, Season } from './ecology'
import type { SpeciesId } from './species'

interface BaseEvent {
  /** Tick at which the event occurred (initial population events use tick 0). */
  readonly tick: number
}

export interface OrganismBornEvent extends BaseEvent {
  readonly type: 'organism-born'
  readonly organismId: EntityId
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentIds: readonly EntityId[]
  /** The species the organism was assigned to, or `null` when species are disabled. */
  readonly speciesId: SpeciesId | null
  readonly position: Readonly<Vec2>
}

/** A female laid an egg (ADR 0027). The clutch was conceived `incubation` seconds earlier. */
export interface EggLaidEvent extends BaseEvent {
  readonly type: 'egg-laid'
  readonly eggId: EntityId
  readonly motherId: EntityId
  readonly fatherId: EntityId
  readonly position: Readonly<Vec2>
}

/** An egg hatched; the new creature also gets an `organism-born` event (ADR 0027). */
export interface EggHatchedEvent extends BaseEvent {
  readonly type: 'egg-hatched'
  readonly eggId: EntityId
  readonly organismId: EntityId
  readonly motherId: EntityId
  readonly fatherId: EntityId
}

/** A carrying female died before she laid: the clutch and its energy are lost (ADR 0027). */
export interface ClutchLostEvent extends BaseEvent {
  readonly type: 'clutch-lost'
  readonly motherId: EntityId
  readonly fatherId: EntityId
}

/** A mouth took an egg (ADR 0027): the egg is gone and its energy went to the biter's gut. */
export interface EggEatenEvent extends BaseEvent {
  readonly type: 'egg-eaten'
  readonly eggId: EntityId
  readonly predatorId: EntityId
  /** The egg's stored energy. */
  readonly energyTaken: number
  /** Energy that entered the gut. */
  readonly intake: number
}

/** A parent defended its egg: the biter lost health and the egg was left alone (ADR 0027). */
export interface EggGuardedEvent extends BaseEvent {
  readonly type: 'egg-guarded'
  readonly eggId: EntityId
  readonly guardId: EntityId
  readonly biterId: EntityId
  readonly damage: number
}

export interface OrganismDiedEvent extends BaseEvent {
  readonly type: 'organism-died'
  readonly organismId: EntityId
  readonly cause: DeathCause
  /** For a death by predation: the creature that bit it last. */
  readonly killerId?: EntityId
  readonly position: Readonly<Vec2>
}

export interface ResourceSpawnedEvent extends BaseEvent {
  readonly type: 'resource-spawned'
  readonly resourceId: EntityId
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
  readonly position: Readonly<Vec2>
}

/** One bite taken out of a resource; the resource stays until its last bite (ADR 0017). */
export interface ResourceBittenEvent extends BaseEvent {
  readonly type: 'resource-bitten'
  readonly organismId: EntityId
  readonly resourceId: EntityId
  readonly kind: number
  /** Food energy taken out of the resource by this bite. */
  readonly chunk: number
  /** Energy that entered the gut: `chunk` times the mouth form's yield for this kind. */
  readonly intake: number
  /** Food energy still on the resource after the bite. */
  readonly remaining: number
  readonly position: Readonly<Vec2>
}

/** A creature bit another creature (ADR 0023). */
export interface OrganismBittenEvent extends BaseEvent {
  readonly type: 'organism-bitten'
  readonly predatorId: EntityId
  readonly preyId: EntityId
  /** Health damage the bite dealt, after the prey's armor. */
  readonly damage: number
  /** Energy taken from the prey. */
  readonly energyTaken: number
  /** Energy that entered the predator's gut: the energy taken times the trophic yield and the mouth's flesh yield. */
  readonly intake: number
  /** Where the prey was. */
  readonly position: Readonly<Vec2>
}

export interface ResourceConsumedEvent extends BaseEvent {
  readonly type: 'resource-consumed'
  readonly organismId: EntityId
  readonly resourceId: EntityId
  readonly kind: number
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
  readonly reason: 'consumption' | 'metabolism' | 'digestion'
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

/** Health lost in one tick (one event per damaged organism per tick). */
export interface OrganismDamagedEvent extends BaseEvent {
  readonly type: 'organism-damaged'
  readonly organismId: EntityId
  /** Health lost this tick. */
  readonly amount: number
  readonly source: DamageSource
  /** For damage from a bite: the creature that bit (the one that bit hardest this tick). */
  readonly attackerId?: EntityId
  readonly healthAfter: number
  readonly position: Readonly<Vec2>
}

export type DamageSource = 'hazard' | 'toxin' | 'bite' | 'both'

/** A new season began. */
export interface SeasonChangedEvent extends BaseEvent {
  readonly type: 'season-changed'
  readonly season: Season
}

export interface HazardSpawnedEvent extends BaseEvent {
  readonly type: 'hazard-spawned'
  readonly hazardId: number
  readonly kind: HazardKind
  readonly position: Readonly<Vec2>
  readonly radius: number
}

export interface HazardExpiredEvent extends BaseEvent {
  readonly type: 'hazard-expired'
  readonly hazardId: number
  readonly kind: HazardKind
}

export type WorldEvent =
  | OrganismBornEvent
  | OrganismDiedEvent
  | EggLaidEvent
  | EggHatchedEvent
  | ClutchLostEvent
  | EggEatenEvent
  | EggGuardedEvent
  | ResourceSpawnedEvent
  | ResourceBittenEvent
  | OrganismBittenEvent
  | ResourceConsumedEvent
  | OrganismMovedEvent
  | EnergyChangedEvent
  | ReproductionAttemptedEvent
  | OrganismDamagedEvent
  | SeasonChangedEvent
  | HazardSpawnedEvent
  | HazardExpiredEvent

export type WorldEventType = WorldEvent['type']
