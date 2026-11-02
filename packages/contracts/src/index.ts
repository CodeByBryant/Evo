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
  MigrationSummary,
  TerrainSnapshot
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
  ClusterConfig,
  EnvironmentConfig,
  EnvironmentConfigOverrides,
  EnvironmentLayout,
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
  OrganismDamagedEvent,
  DamageSource,
  SeasonChangedEvent,
  HazardSpawnedEvent,
  HazardExpiredEvent,
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
export { RENDER_LAYERS, DEFAULT_RENDER_LAYERS } from './render'
export type {
  RenderOrganism,
  RenderResource,
  RenderHazard,
  RenderEffect,
  RenderSnapshot,
  RenderLayerName,
  RenderLayers
} from './render'
export { SPEED_SETTINGS } from './view'
export type {
  SpeedSetting,
  RunStatus,
  PresetOption,
  PopulationPoint,
  SpeciesRow,
  GeneRow,
  LabelledValue,
  InspectorBrain,
  InspectorView,
  ViewState,
  SimulationControls
} from './view'
export {
  BODY_GENE_COUNT,
  BODY_GENE_DEFINITIONS,
  BODY_SLOT_COUNT,
  OUTLINE_COUNT_INDEX,
  OUTLINE_MAX_POINTS,
  OUTLINE_MIN_POINTS,
  OUTLINE_MIN_RADIUS,
  PART_DEFINITIONS,
  PART_TYPES,
  SLOT_FIELDS,
  VISUAL_FIELDS,
  outlineAngleIndex,
  outlineRadiusIndex,
  slotGeneIndex,
  visualGeneIndex
} from './anatomy'
export type {
  Anatomy,
  AnatomyView,
  AnatomyConfig,
  AnatomyConfigOverrides,
  AnatomyMutationConfig,
  AnatomyPart,
  BodyGeneDefinition,
  BodyGenome,
  BodyLook,
  BodyOutline,
  Capabilities,
  CapabilityFactors,
  FounderOutline,
  FounderPart,
  PartConfig,
  PartDefinition,
  PartType,
  SlotField,
  VisualField
} from './anatomy'
