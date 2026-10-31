import type { EntityId } from './entity'

/**
 * Identifies a genome. Allocated from its own monotonic counter, separate from `EntityId`, so
 * genome identity never depends on how many resources have spawned (docs/decisions/0006).
 */
export type GenomeId = number

/** Body and life-history genes. Ages are in seconds; `hue` is in turns, `[0, 1)`. */
export interface PhysicalGenes {
  readonly radius: number
  readonly maxSpeed: number
  readonly maxTurnRate: number
  readonly maturityAge: number
  readonly senescenceAge: number
  readonly maxAge: number
  readonly hue: number
}

export interface SensoryGenes {
  readonly sensorRadius: number
}

export interface MetabolicGenes {
  readonly basalCost: number
  readonly movementCost: number
  readonly turningCost: number
}

export interface BehavioralGenes {
  readonly wanderJitter: number
}

export interface ReproductionGenes {
  readonly minEnergy: number
  /** Energy this parent contributes to the child; the parent pays more (see `overheadFraction`). */
  readonly offspringInvestment: number
  readonly cooldown: number
  readonly searchRadius: number
}

/** Fixed brain dimensions shared by every organism in a world (topology does not evolve). */
export interface BrainArchitecture {
  readonly inputSize: number
  readonly hiddenSize: number
  readonly memorySize: number
  readonly outputSize: number
}

export interface BrainGenome {
  readonly architecture: BrainArchitecture
  /** One flat vector made of the consecutive blocks documented in docs/genetics/genome.md. */
  readonly weights: readonly number[]
}

/**
 * Learning genes, all read by the brain (docs/learning/brain.md). `riskTolerance` scales how much
 * damage is penalized (`1 - riskTolerance`) and `noveltyPreference` scales the reward for entering
 * new ground; both became live in Phase 6 (docs/decisions/0009).
 */
export interface LearningGenes {
  readonly learningRate: number
  readonly discountFactor: number
  readonly eligibilityTraceDecay: number
  readonly explorationRate: number
  readonly riskTolerance: number
  readonly noveltyPreference: number
  readonly persistence: number
}

/** Immutable. One per organism; a child's genome is built from both parents' genomes. */
export interface Genome {
  readonly version: 1
  readonly id: GenomeId
  /** Empty for founders; otherwise the two parents' genome ids, ascending. */
  readonly parentIds: readonly GenomeId[]
  readonly physical: PhysicalGenes
  readonly sensory: SensoryGenes
  readonly metabolic: MetabolicGenes
  readonly behavioral: BehavioralGenes
  readonly reproduction: ReproductionGenes
  readonly brain: BrainGenome
  readonly learning: LearningGenes
}

export type GeneGroup =
  'physical' | 'sensory' | 'metabolic' | 'behavioral' | 'reproduction' | 'learning'

/**
 * How a gene mutates and recombines. `int` and `bool` genes exist so the operators are complete
 * (roadmap 4.3); the production gene list has none, and tests exercise them with synthetic tables.
 */
export type GeneKind = 'float' | 'int' | 'bool' | 'circular'

export type GenePath =
  | 'physical.radius'
  | 'physical.maxSpeed'
  | 'physical.maxTurnRate'
  | 'physical.maturityAge'
  | 'physical.senescenceAge'
  | 'physical.maxAge'
  | 'physical.hue'
  | 'sensory.sensorRadius'
  | 'metabolic.basalCost'
  | 'metabolic.movementCost'
  | 'metabolic.turningCost'
  | 'behavioral.wanderJitter'
  | 'reproduction.minEnergy'
  | 'reproduction.offspringInvestment'
  | 'reproduction.cooldown'
  | 'reproduction.searchRadius'
  | 'learning.learningRate'
  | 'learning.discountFactor'
  | 'learning.eligibilityTraceDecay'
  | 'learning.explorationRate'
  | 'learning.riskTolerance'
  | 'learning.noveltyPreference'
  | 'learning.persistence'

export interface GeneDefinition {
  readonly path: GenePath
  readonly kind: GeneKind
  /** Mutation size is a fraction of the gene's current value instead of its range width. */
  readonly relative?: true
  /**
   * This gene's value must stay strictly above the named gene's value. Mutation and
   * recombination enforce it by raising the lower bound, so ordered genes (the life-stage ages)
   * stay ordered for any ranges. The named gene must come earlier in `GENE_DEFINITIONS`.
   */
  readonly orderedAfter?: GenePath
}

/**
 * Every scalar gene in its fixed canonical order. This order is used for mutation draws, the
 * state hash and genome comparison, so it must never be reordered (append only, with a hash
 * schema bump). Nothing iterates a genome by object key.
 */
export const GENE_DEFINITIONS: readonly GeneDefinition[] = [
  { path: 'physical.radius', kind: 'float' },
  { path: 'physical.maxSpeed', kind: 'float' },
  { path: 'physical.maxTurnRate', kind: 'float' },
  { path: 'physical.maturityAge', kind: 'float' },
  { path: 'physical.senescenceAge', kind: 'float', orderedAfter: 'physical.maturityAge' },
  { path: 'physical.maxAge', kind: 'float', orderedAfter: 'physical.senescenceAge' },
  { path: 'physical.hue', kind: 'circular' },
  { path: 'sensory.sensorRadius', kind: 'float' },
  { path: 'metabolic.basalCost', kind: 'float' },
  { path: 'metabolic.movementCost', kind: 'float' },
  { path: 'metabolic.turningCost', kind: 'float' },
  { path: 'behavioral.wanderJitter', kind: 'float' },
  { path: 'reproduction.minEnergy', kind: 'float' },
  { path: 'reproduction.offspringInvestment', kind: 'float' },
  { path: 'reproduction.cooldown', kind: 'float' },
  { path: 'reproduction.searchRadius', kind: 'float' },
  { path: 'learning.learningRate', kind: 'float', relative: true },
  { path: 'learning.discountFactor', kind: 'float' },
  { path: 'learning.eligibilityTraceDecay', kind: 'float' },
  { path: 'learning.explorationRate', kind: 'float' },
  { path: 'learning.riskTolerance', kind: 'float' },
  { path: 'learning.noveltyPreference', kind: 'float' },
  { path: 'learning.persistence', kind: 'float' }
]

/** Bounds and mutation parameters of one gene. */
export interface GeneRange {
  /** Inclusive lower bound (for a circular gene, the start of the period). */
  min: number
  /** Inclusive upper bound (for a circular gene, the exclusive end of the period). */
  max: number
  /** Probability in `[0, 1]` that the gene mutates in one birth. */
  mutationRate: number
  /** Standard deviation: a fraction of the range width (or of the value, for relative genes). */
  mutationStd: number
}

export type GeneRangeOverrides = Partial<Record<GenePath, Partial<GeneRange>>>

export type LearningInheritanceMode = 'baldwinian' | 'partial' | 'lamarckian'

export interface LearningInheritanceConfig {
  mode: LearningInheritanceMode
  /** Share of learned change inherited in `'partial'` mode, in `[0, 1]`. */
  fraction: number
}

/**
 * The input and output sizes are not configurable: they come from `OBSERVATION_SIZE` and
 * `ACTION_SIZE` (docs/learning/brain.md).
 */
export interface BrainConfig {
  hiddenSize: number
  memorySize: number
  /** Founders start from the hand-wired forager template plus noise instead of random weights. */
  innatePrior: boolean
  /** Standard deviation of the Gaussian that draws each founder weight. */
  initialWeightStd: number
  /** Probability in `[0, 1]` that one weight mutates in a birth. */
  weightMutationRate: number
  weightMutationStd: number
}

/** Founder baseline for the learning genes (the other baselines come from `organisms.*`). */
export type LearningBaseline = { -readonly [K in keyof LearningGenes]: LearningGenes[K] }

export interface GeneticsConfig {
  /** Multiplies every mutation rate; `0` disables mutation. */
  mutationRateScale: number
  /** Multiplies every mutation standard deviation; `0` disables mutation. */
  mutationStrengthScale: number
  /** Blend-crossover extension past the parents' values, as a fraction of their difference. */
  blendAlpha: number
  brain: BrainConfig
  learning: LearningBaseline
  learningInheritance: LearningInheritanceConfig
  /** Per-gene overrides of the default ranges and rates (keyed by gene path). */
  genes: GeneRangeOverrides
}

/** Genome-level lineage bookkeeping (docs/genetics/genome.md). */
export interface LineageRecord {
  readonly genomeId: GenomeId
  /** Empty for founders. */
  readonly parentGenomeIds: readonly GenomeId[]
  readonly organismIds: readonly EntityId[]
  readonly createdAtTick: number
  /** Total descendants ever (computed on demand, not maintained per birth). */
  readonly descendantCount: number
}

/** A partial genetics configuration; nested sections merge field by field onto the defaults. */
export interface GeneticsConfigOverrides {
  mutationRateScale?: number
  mutationStrengthScale?: number
  blendAlpha?: number
  brain?: Partial<BrainConfig>
  learning?: Partial<LearningBaseline>
  learningInheritance?: Partial<LearningInheritanceConfig>
  genes?: GeneRangeOverrides
}
