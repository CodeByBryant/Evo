import type { GeneticsConfig, GeneticsConfigOverrides } from './genome'
import type { LearningConfig, LearningConfigOverrides } from './learning'
import type { Rect } from './math'
import type { EcologyConfig, EcologyConfigOverrides } from './ecology'
import type { SpeciesConfig, SpeciesConfigOverrides } from './species'
import type { AnatomyConfig, AnatomyConfigOverrides, MouthForm } from './anatomy'

/** Largest valid world seed (seeds are unsigned 32-bit integers). */
export const MAX_SEED = 4_294_967_295

export type DeathCause = 'starvation' | 'age' | 'damage' | 'predation' | 'environment'

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

/** What a dead creature leaves behind for scavengers (ADR 0023). */
export interface PredationCarcassConfig {
  /** `false` leaves nothing: the energy of the dead is lost, as before. */
  enabled: boolean
  /** The share of a dead creature's energy and gut that becomes a carcass, in `(0, 1]`. */
  energyFraction: number
  /** A carcass worth less than this is not left. */
  minEnergy: number
  /** Seconds before a carcass rots away (0: never). */
  lifespan: number
  /** The most carcasses on the field at once. */
  maxCount: number
  /** A carcass's radius, in world units. */
  radius: number
  /** How many times harder a carcass is to bite than the baseline, `> 0`. */
  hardness: number
  /** What each mouth form yields from a carcass, per unit bitten, `> 0`. */
  yields: Record<MouthForm, number>
}

/** Creatures that bite other creatures (ADR 0023). Needs `feeding` and `ecology.health`. */
export interface PredationConfig {
  enabled: boolean
  /** Health damage of a bite at the baseline gape, before the victim's armor. */
  biteDamage: number
  /** Energy a bite takes from the victim at the baseline gape. */
  biteEnergy: number
  /** The share of the energy taken that reaches the predator's gut, in `(0, 1]` (the rest is the trophic loss). */
  trophicYield: number
  /** A creature bites only prey whose body radius is at most this many times its own. */
  maxPreyRatio: number
  /** What each mouth form yields from a creature it bites, `>= 0`; zero means that form never bites creatures. */
  fleshYield: Record<MouthForm, number>
  /** Seconds after a bite during which a death by starvation or damage counts as predation. */
  attackWindow: number
  carcass: PredationCarcassConfig
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
  /** Two sexes: only a female and a male mate (ADR 0027). Off: any two ready creatures may. */
  sexes: SexesConfig
  /** Incubation, eggs and guarding (ADR 0027). Off: a child is born at conception, as before. */
  eggs: EggsConfig
  /** A partner has to accept too, and a creature has tastes (ADR 0027). Off: the nearest ready partner. */
  mateChoice: MateChoiceConfig
}

/** Two sexes (ADR 0027). A newborn's sex is one draw from the `reproduction` stream; founders alternate. */
export interface SexesConfig {
  enabled: boolean
}

/**
 * A pregnancy and an egg instead of an instant birth (ADR 0027). Needs `sexes.enabled`: the female
 * carries the clutch, lays an egg, and the egg hatches into a creature after `hatch`.
 */
export interface EggsConfig {
  enabled: boolean
  /** Seconds a female carries the clutch before laying. */
  incubation: number
  /** Seconds an egg takes to hatch after it is laid. */
  hatch: number
  /** Energy per second a carrying female pays on top of her metabolism. */
  carryCost: number
  /** A living parent within this distance of its egg guards it (ADR 0027). */
  guardRadius: number
  /** Energy per second a guarding parent pays, per guarded egg. */
  guardCost: number
  /** Health a biter loses when a guarded egg is defended. */
  guardDamage: number
}

/**
 * Mate choice (ADR 0027). A creature looks at the nearest `candidates` ready partners and takes the
 * first that both of them accept. A creature scores a candidate `(1 - preference) x condition +
 * preference x difference`, where condition is the candidate's spare energy over what it needs to be
 * ready, and difference is how far apart the genomes are against the species threshold; it accepts if
 * the score reaches `choosiness x threshold`. Refusing costs `searchCost` energy and a `retryDelay` wait.
 */
export interface MateChoiceConfig {
  enabled: boolean
  /** The founders' `choosiness` gene. */
  choosiness: number
  /** The founders' `preference` gene. */
  preference: number
  /** The score a fully choosy creature (`choosiness` 1) asks for, in `(0, 1]`. */
  threshold: number
  /** Energy a creature pays each time it turns every candidate down. */
  searchCost: number
  /** Seconds it waits before looking again after turning them all down. */
  retryDelay: number
  /** How many of the nearest ready partners it looks at. */
  candidates: number
}

/** A partial reproduction section merged onto the defaults. */
export type ReproductionConfigOverrides = Partial<
  Omit<ReproductionConfig, 'sexes' | 'eggs' | 'mateChoice'>
> & {
  sexes?: Partial<SexesConfig>
  eggs?: Partial<EggsConfig>
  mateChoice?: Partial<MateChoiceConfig>
}

/**
 * Ageing (ADR 0027): once a creature is past its own `senescenceAge` it declines, and instead of a
 * hard cutoff at `maxAge` it faces a chance of dying that rises with age. With `s` the share of the
 * way from `senescenceAge` to `maxAge` (above 1 past `maxAge`), off means the old behaviour exactly.
 */
export interface AgeingConfig {
  enabled: boolean
  /** Metabolism rises by this much at `s = 1` (and is capped at `s = 2`): cost times `1 + metabolismRise * s`. */
  metabolismRise: number
  /** Share of top speed lost at `s = 1`, in `[0, 1)`. */
  speedLoss: number
  /** The energy needed to reproduce rises by this share at `s = 1`: an old creature breeds less. */
  fertilityLoss: number
  /** Chance per second of dying at `s = 1`; it rises in proportion to `s`. */
  hazard: number
  /** Death is certain at this multiple of `maxAge`, so nothing is immortal. */
  ceiling: number
}

export interface HistoryConfig {
  /** Events retained in the bounded event log; older events are dropped. `0` retains none. */
  maxEvents: number
  eventDetail: EventDetail
  /** Historical (dead) organism records retained; older records are dropped. `0` retains none. */
  maxHistoricalOrganisms: number
}

/** The evolution observatory (ADR 0024): read-only indicators sampled over time; never hashed, never fed back. */
export interface ObservatoryConfig {
  /** `false` does no work at all. */
  enabled: boolean
  /** Ticks between samples of the indicators. */
  sampleEvery: number
  /** Ticks between observations of what each creature is doing (speed, turning, resting). */
  behaviourEvery: number
  /** Samples kept; the oldest are dropped past this. */
  maxSamples: number
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
  predation: PredationConfig
  perception: PerceptionConfig
  ageing: AgeingConfig
  observatory: ObservatoryConfig
}

/** A partial configuration merged onto the defaults. */
export interface WorldConfigOverrides {
  timestep?: number
  maxPopulation?: number
  extinctionPolicy?: ExtinctionPolicy
  environment?: EnvironmentConfigOverrides
  organisms?: Partial<OrganismConfig>
  resources?: ResourceConfigOverrides
  reproduction?: ReproductionConfigOverrides
  history?: Partial<HistoryConfig>
  observatory?: Partial<ObservatoryConfig>
  genetics?: GeneticsConfigOverrides
  learning?: LearningConfigOverrides
  species?: SpeciesConfigOverrides
  ecology?: EcologyConfigOverrides
  anatomy?: AnatomyConfigOverrides
  feeding?: Partial<FeedingConfig>
  predation?: Partial<Omit<PredationConfig, 'fleshYield' | 'carcass'>> & {
    fleshYield?: Partial<Record<MouthForm, number>>
    carcass?: Partial<Omit<PredationCarcassConfig, 'yields'>> & {
      yields?: Partial<Record<MouthForm, number>>
    }
  }
  perception?: Partial<PerceptionConfig>
  ageing?: Partial<AgeingConfig>
}

export interface WorldOptions {
  /** Integer in `[0, MAX_SEED]`. */
  seed: number
  config?: WorldConfigOverrides
}
