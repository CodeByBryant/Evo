import type { GeneticsConfig, GeneticsConfigOverrides } from './genome'
import type { LearningConfig, LearningConfigOverrides } from './learning'
import type { Rect } from './math'
import type { EcologyConfig, EcologyConfigOverrides } from './ecology'
import type { SpeciesConfig, SpeciesConfigOverrides } from './species'
import type { AnatomyConfig, AnatomyConfigOverrides } from './anatomy'

/** Largest valid world seed (seeds are unsigned 32-bit integers). */
export const MAX_SEED = 4_294_967_295

export type DeathCause = 'starvation' | 'age' | 'damage' | 'environment'

export type ExtinctionPolicy = 'stop' | 'allow-immigration' | 'seed-bank' | 'sandbox-recovery'

/** `essential` records births, deaths, spawns and consumption; `verbose` adds per-tick movement and energy events. */
export type EventDetail = 'essential' | 'verbose'

/** `field`: one bounded rectangle. `clusters`: an unbounded world of circular clusters with void between them (ADR 0014). */
export type EnvironmentLayout = 'field' | 'clusters'

/** The cluster layout (ADR 0014); read only when `environment.layout` is `clusters`. */
export interface ClusterConfig {
  /** Number of clusters, placed on a regular polygon around the origin. */
  count: number
  /** Radius of each circular cluster. */
  radius: number
  /** Distance between the centres of neighbouring clusters (at least twice the radius). */
  spacing: number
  /** Founder species per cluster. */
  speciesPerCluster: number
  /** Founders of each species. */
  organismsPerSpecies: number
  /** Biome patches inside each cluster. */
  patches: number
  /** Multiplier on top speed in the void. */
  voidSpeedScale: number
  /** Multiplier on sensor range in the void. */
  voidVisibility: number
  /** The mating signal reaches at most this far, which must be less than the void width. */
  mateSignalCap: number
  /**
   * Species distance threshold in the cluster layout (at least `species.threshold`): with five
   * times the organisms the field's threshold splits lineages into over a hundred species.
   */
  speciesThreshold: number
  /** Founder gene offset between clusters, as a fraction of each gene's range. */
  clusterSpread: number
  /** Founder gene offset between the species of one cluster, as a fraction of each gene's range. */
  speciesSpread: number
  /**
   * New food goes to clusters that have somebody to eat it: every cluster with at least one living
   * organism gets an equal share, and a cluster with none gets this fraction of a share (in
   * `[0, 1]`: 1 is the old even spread, 0 gives an empty cluster nothing). A small value keeps a
   * trickle so a recovering cluster can restart. (Shares do not grow with population: that would
   * let a crowded cluster starve its neighbours out of existence.)
   */
  foodFloor: number
  /**
   * The most food items removed per tick from clusters that have no living organisms, lowest id
   * first, so stock stranded there cannot sit on the global food cap. 0 turns this off.
   */
  strandedFoodPerTick: number
}

export interface EnvironmentConfig {
  /**
   * World width in world units. For the cluster layout this is only the reference area that
   * resource counts and populations are tuned for (it is not a boundary).
   */
  width: number
  /** World height in world units (see `width`). */
  height: number
  layout: EnvironmentLayout
  clusters: ClusterConfig
}

/** Environment overrides: `clusters` merges field by field. */
export type EnvironmentConfigOverrides = Partial<Omit<EnvironmentConfig, 'clusters'>> & {
  clusters?: Partial<ClusterConfig>
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

/**
 * How organisms feed (docs/decisions/0017): they bite food with their mouth, bites take the food's
 * health, and what is bitten goes into a gut that empties into energy at the speed of the
 * digestion parts. With `enabled: false` the old behavior runs: touching food with the body eats
 * it whole and credits the energy at once.
 */
/**
 * How creatures see each other (ADR 0016 "Line of sight"). Presentation of the world to the
 * senses, not of the interface: it changes what a creature perceives, so it changes the run.
 */
export interface PerceptionConfig {
  /** Whether another creature's body blocks sight of what is behind it (food and other creatures). */
  organismsBlockSight: boolean
  /** The most candidates a creature checks for something in the way before it gives up (at least 1). */
  maxSightChecks: number
}

export interface FeedingConfig {
  enabled: boolean
  /** A mouth reaches this many body radii from its anchor, times the mouth's `reach` stat. */
  biteRadius: number
  /** Half-angle in radians of the cone in front of the mouth in which food can be bitten. */
  biteCone: number
  /** Food energy removed by one bite at the founder's mouth, before the kind's `hardness`. */
  biteSize: number
  /** Seconds between bites at the founder's mouth. */
  biteInterval: number
  /** Energy a founder-sized gut holds. */
  gutCapacity: number
  /** Energy per second a founder's gut turns into body energy. */
  absorption: number
  /**
   * Speed multiplier in `(0, 1]` while a bite is on cooldown (chewing): an organism that has just
   * bitten stays at its food instead of leaving a half-eaten trail.
   */
  chewSlow: number
}

/**
 * How food is spread over the field (ADR 0021). `uniform`: every position is equally likely and a
 * spawn draws exactly two numbers, as before. `noise`: a smooth pattern of patches that fades and
 * drifts over time (value noise in x, y and time); a spawn takes a fixed number of candidate sites
 * and keeps the first the pattern accepts, so the draw count never depends on the outcome.
 */
export interface FoodDistributionConfig {
  mode: 'uniform' | 'noise'
  /** World units per feature of the pattern (the size of a patch). */
  scale: number
  /** `0` (every site equally likely) to `1` (patches and bare ground). */
  contrast: number
  /** The least likely a site is to take food, in `(0, 1]`: bare ground is sparse, not empty. */
  floor: number
  /** Simulated seconds for the pattern to turn over (change by one feature); `0` freezes it. */
  turnover: number
}

/**
 * Renewable plants (ADR 0021). With `enabled`, a spawn makes a **plant**: a hub joined to up to six
 * nodes, each an ordinary food item you can bite. Eating a node leaves the plant, which regrows it
 * from the hub's store; eating the hub kills the plant (its nodes are left as free food). The hub
 * gains `photosynthesis` energy a second up to its capacity (where energy enters the world), and a
 * plant withers after `lifespan`. With plants on, `spawnRate` counts plants per second while
 * `initialCount` and `maxCount` still count items (a plant is a hub plus its nodes). Field layout only.
 */
export interface PlantConfig {
  enabled: boolean
  /** Nodes around a hub, 1 to 6. */
  nodes: number
  /** Distance from hub to node, in food radii. */
  ring: number
  /** The hub's store, in multiples of its kind's energy. */
  hubEnergyScale: number
  /** One node's energy, in multiples of its kind's energy. */
  nodeEnergyScale: number
  /** How much harder the hub is to bite than its kind's hardness. */
  hubHardness: number
  /** Energy per second the hub moves into a growing node. */
  regrowRate: number
  /** Energy per second the hub gains, up to its capacity. */
  photosynthesis: number
  /** Seconds before a plant withers with its nodes; `0` lives forever. */
  lifespan: number
  /** Most plants alive at once. */
  maxPlants: number
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
  /** How food is spread over the field. */
  distribution: FoodDistributionConfig
  /** Renewable plants. */
  plants: PlantConfig
}

/** Overrides merge field by field; `distribution` and `plants` too. */
export type ResourceConfigOverrides = Partial<Omit<ResourceConfig, 'distribution' | 'plants'>> & {
  distribution?: Partial<FoodDistributionConfig>
  plants?: Partial<PlantConfig>
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
  /**
   * Distance at which an organism that is ready to reproduce can sense other ready organisms (a
   * mating signal, longer than the sensor radius; brain controller only, ADR 0010).
   */
  mateSenseRadius: number
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
  ecology: EcologyConfig
  anatomy: AnatomyConfig
  feeding: FeedingConfig
  perception: PerceptionConfig
}

/** A partial configuration merged onto the defaults. */
export interface WorldConfigOverrides {
  timestep?: number
  maxPopulation?: number
  extinctionPolicy?: ExtinctionPolicy
  environment?: EnvironmentConfigOverrides
  organisms?: Partial<OrganismConfig>
  resources?: ResourceConfigOverrides
  reproduction?: Partial<ReproductionConfig>
  history?: Partial<HistoryConfig>
  genetics?: GeneticsConfigOverrides
  learning?: LearningConfigOverrides
  species?: SpeciesConfigOverrides
  ecology?: EcologyConfigOverrides
  anatomy?: AnatomyConfigOverrides
  feeding?: Partial<FeedingConfig>
  perception?: Partial<PerceptionConfig>
}

export interface WorldOptions {
  /** Integer in `[0, MAX_SEED]`. */
  seed: number
  config?: WorldConfigOverrides
}
