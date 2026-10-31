export type { Vec2, Rect, Circle } from './math'
export type { EntityId } from './entity'
export type { ValidationResult } from './validation'
export type { LifeStage } from './organism'
export { GENE_DEFINITIONS } from './genome'
export type {
  GenomeId,
  Genome,
  PhysicalGenes,
  SensoryGenes,
  MetabolicGenes,
  BehavioralGenes,
  ReproductionGenes,
  BrainArchitecture,
  BrainGenome,
  LearningGenes,
  GeneGroup,
  GeneKind,
  GenePath,
  GeneDefinition,
  GeneRange,
  GeneRangeOverrides,
  LearningInheritanceMode,
  LearningInheritanceConfig,
  BrainConfig,
  LearningBaseline,
  GeneticsConfig,
  GeneticsConfigOverrides,
  LineageRecord
} from './genome'
export { OBSERVATION_SIZE, ACTION_SIZE, OBSERVATION_LABELS, ACTION_LABELS } from './learning'
export type {
  Observation,
  Action,
  RewardBreakdown,
  LearningController,
  LearningAlgorithmName,
  RewardWeights,
  LearningConfig,
  LearningConfigOverrides,
  BrainTelemetry,
  BrainSnapshot
} from './learning'
export { REGION_TYPES, SEASONS } from './ecology'
export type {
  RegionType,
  Season,
  HazardKind,
  HealthConfig,
  RegionTypeConfig,
  RegionsConfig,
  SeasonConfig,
  SeasonsConfig,
  HazardsConfig,
  ResourceKindConfig,
  ResourceKindsConfig,
  MigrationConfig,
  EcologyConfig,
  EcologyConfigOverrides,
  HazardSnapshot,
  MigrationSummary
} from './ecology'
export type {
  SpeciesId,
  SpeciesDistanceWeights,
  PopulationSample,
  SpeciesRecord,
  SpeciesConfig,
  SpeciesConfigOverrides
} from './species'
export { MAX_SEED } from './world'
export type {
  DeathCause,
  ExtinctionPolicy,
  EventDetail,
  EnvironmentConfig,
  OrganismConfig,
  ResourceConfig,
  ReproductionConfig,
  HistoryConfig,
  WorldConfig,
  WorldConfigOverrides,
  WorldOptions
} from './world'
export type {
  OrganismBornEvent,
  OrganismDiedEvent,
  ResourceSpawnedEvent,
  ResourceConsumedEvent,
  OrganismMovedEvent,
  EnergyChangedEvent,
  ReproductionAttemptedEvent,
  ReproductionFailureReason,
  WorldEvent,
  WorldEventType
} from './events'
export type {
  OrganismSnapshot,
  ResourceSnapshot,
  PopulationSnapshot,
  MetricsSnapshot,
  HistoricalOrganismRecord,
  WorldSnapshot
} from './snapshots'
