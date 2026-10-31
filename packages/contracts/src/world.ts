import type { GeneticsConfig, GeneticsConfigOverrides } from './genome'
import type { LearningConfig, LearningConfigOverrides } from './learning'
import type { Rect } from './math'
import type { SpeciesConfig, SpeciesConfigOverrides } from './species'

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
  /** Energy lost per second per squared radian of `lastTurnMagnitude`. */
  turningCost: number
  /** Flat energy lost per second for maintaining senses. */
  sensorCost: number
  /**
   * Energy lost per second for learning at the baseline learning rate; scaled by the organism's
   * `learningRate` gene, and charged only while learning is enabled under the brain controller.
   */
  learningCost: number
  /** Founder baseline hue in turns, `[0, 1)` (cosmetic; the `hue` gene's starting value). */
  hue: number
  /** Age in seconds at which an organism dies of old age. */
  maxAge: number
  /** Age in seconds below which an organism is a juvenile: cannot reproduce, smaller and slower. */
  maturityAge: number
  /** Age in seconds at and after which an organism is senescent (still able to reproduce). */
  senescenceAge: number
  /** Multiplier in `(0, 1]` applied to capture radius and effective `maxEnergy` while juvenile. */
  juvenileSizeScale: number
  /** Multiplier in `(0, 1]` applied to `maxSpeed` while juvenile. */
  juvenileSpeedScale: number
  /** Multiplier in `(0, 1]` applied to the whole metabolism formula while juvenile. */
  juvenileMetabolicScale: number
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
  /** Where resources spawn: a rectangle inside the world, or `null` for the whole world. */
  region: Rect | null
}

/**
 * Local, continuous reproduction. A partner is required; there is no asexual fallback
 * (docs/decisions/0005-continuous-organism-ecology.md).
 */
export interface ReproductionConfig {
  /** Energy required to attempt reproduction. */
  minEnergy: number
  /** Energy each parent gives the child; the child receives the sum, capped by its capacity. */
  offspringInvestment: number
  /** Fraction of the investment lost in the transfer: a parent pays `investment * (1 + overheadFraction)`. */
  overheadFraction: number
  /** Seconds before either parent may reproduce again. */
  cooldown: number
  /** Distance within which a partner is sought. */
  searchRadius: number
}

export interface HistoryConfig {
  /** Events retained in the bounded event log; older events are dropped. `0` retains none. */
  maxEvents: number
  eventDetail: EventDetail
  /** Historical (dead) organism records retained; older records are dropped. `0` retains none. */
  maxHistoricalOrganisms: number
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
  reproduction: ReproductionConfig
  history: HistoryConfig
  genetics: GeneticsConfig
  learning: LearningConfig
  species: SpeciesConfig
}

/** A partial configuration merged onto the defaults. */
export interface WorldConfigOverrides {
  timestep?: number
  maxPopulation?: number
  extinctionPolicy?: ExtinctionPolicy
  environment?: Partial<EnvironmentConfig>
  organisms?: Partial<OrganismConfig>
  resources?: Partial<ResourceConfig>
  reproduction?: Partial<ReproductionConfig>
  history?: Partial<HistoryConfig>
  genetics?: GeneticsConfigOverrides
  learning?: LearningConfigOverrides
  species?: SpeciesConfigOverrides
}

export interface WorldOptions {
  /** Integer in `[0, MAX_SEED]`. */
  seed: number
  config?: WorldConfigOverrides
}
