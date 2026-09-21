/** Largest valid world seed (seeds are unsigned 32-bit integers). */
export const MAX_SEED = 4_294_967_295

export type DeathCause = 'starvation' | 'age' | 'damage' | 'environment'

export type ExtinctionPolicy = 'stop' | 'allow-immigration' | 'seed-bank' | 'sandbox-recovery'

/** `essential` records births, deaths, spawns and consumption; `verbose` adds per-tick movement and energy events. */
export type EventDetail = 'essential' | 'verbose'

export interface EnvironmentConfig {
  /** World width in world units. */
  width: number
  /** World height in world units. */
  height: number
}

export interface OrganismConfig {
  initialCount: number
  /** Energy each initial organism starts with. */
  initialEnergy: number
  /** Energy capacity; consumption beyond it is wasted. */
  maxEnergy: number
  /** Body radius in world units. */
  radius: number
  /** Top speed in world units per second. */
  maxSpeed: number
  /** Top turning rate in radians per second. */
  maxTurnRate: number
  /** Distance at which resources are perceived, in world units. */
  sensorRadius: number
  /** Heading change per second used while wandering, in radians per second. */
  wanderJitter: number
  /** Energy lost per second just by being alive. */
  basalCost: number
  /** Energy lost per second per squared unit of speed. */
  movementCost: number
  /** Age in seconds at which an organism dies of old age. */
  maxAge: number
}

export interface ResourceConfig {
  initialCount: number
  /** Upper bound on simultaneously existing resources. */
  maxCount: number
  /** Expected new resources per second. */
  spawnRate: number
  /** Energy provided by one resource. */
  energyValue: number
  /** Resource radius in world units. */
  radius: number
}

export interface HistoryConfig {
  /** Events retained in the bounded event log; older events are dropped. `0` retains none. */
  maxEvents: number
  eventDetail: EventDetail
}

/**
 * Everything that shapes a world other than its seed.
 * Time is measured in seconds; one tick advances time by `timestep`.
 */
export interface WorldConfig {
  /** Seconds of simulated time per tick. */
  timestep: number
  maxPopulation: number
  extinctionPolicy: ExtinctionPolicy
  environment: EnvironmentConfig
  organisms: OrganismConfig
  resources: ResourceConfig
  history: HistoryConfig
}

/** A partial configuration merged onto the defaults. */
export interface WorldConfigOverrides {
  timestep?: number
  maxPopulation?: number
  extinctionPolicy?: ExtinctionPolicy
  environment?: Partial<EnvironmentConfig>
  organisms?: Partial<OrganismConfig>
  resources?: Partial<ResourceConfig>
  history?: Partial<HistoryConfig>
}

export interface WorldOptions {
  /** Integer in `[0, MAX_SEED]`. */
  seed: number
  config?: WorldConfigOverrides
}
