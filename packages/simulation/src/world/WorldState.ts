import type { EntityId, MetricsSnapshot } from '@evo/contracts'
import type { HazardState } from '../ecology/HazardStore'
import type { EggState } from '../entities/EggStore'
import type { OrganismState } from '../entities/OrganismStore'
import type { ResourceState } from '../entities/ResourceStore'
import type { LineageState } from '../lineage/LineageStore'
import type { SpeciesState } from '../species/SpeciesRegistry'
import type { RandomState } from '../random/SeededRandom'

/** The format of `WorldState`; bumped if a field is added, removed or reinterpreted. */
export const WORLD_STATE_FORMAT = 1

/**
 * Everything of a world that decides its future, as plain data (docs/simulation/determinism.md,
 * "Saving and restoring"): what the state hash covers (clock, id counters, random streams,
 * creatures with their genomes, brains and clutches, resources, eggs, hazards, the counters and the
 * two spawn remainders) plus the four pieces of unhashed state that change later hashed state or that
 * births and the invariants check (the recent bites that label a death as predation, the carcass
 * count, the lineage store, whose parents a newborn must find registered, and the species registry).
 *
 * **Not carried:** the history of the dead, the observatory series and the event log's past. They
 * restart empty in the receiving world (they are read-only views, nothing in the simulation reads them).
 */
export interface WorldState {
  readonly format: typeof WORLD_STATE_FORMAT
  /** The hash schema the state was saved under: a state is only valid for the same schema. */
  readonly hashSchema: number
  readonly seed: number
  readonly tick: number
  readonly nextId: EntityId
  readonly genomeNextId: EntityId
  readonly streams: readonly RandomState[]
  readonly organisms: OrganismState[]
  readonly resources: ResourceState[]
  readonly eggs: EggState[]
  readonly hazards: HazardState[]
  readonly hazardNextId: number
  readonly metrics: MetricsSnapshot
  readonly extinctionTick: number | null
  readonly eventsEmitted: number
  readonly spawnRemainder: number
  readonly stormRemainder: number
  /** Victim id to the attacker and tick of its latest bite (predation only). */
  readonly lastBitten: Array<[EntityId, { attackerId: EntityId; tick: number }]>
  /** The carcass count carried between ticks; `null` without carcasses. */
  readonly carcassCount: number | null
  /** Every genome ever registered and who is alive; births check that parents are registered. */
  readonly lineage: LineageState
  /** The species of every creature and the species themselves (a derived view, carried so ids continue). */
  readonly species: SpeciesState
}
