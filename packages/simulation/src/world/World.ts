import { resolveWorldConfig, validateSeed } from '@evo/config'
import { ACTION_SIZE, OBSERVATION_SIZE, visualGeneIndex } from '@evo/contracts'
import type {
  AnatomyView,
  BrainSnapshot,
  Capabilities,
  ClusterLayoutSnapshot,
  ClusterReport,
  EggSnapshot,
  EntityId,
  EvolutionSeries,
  Genome,
  HazardSnapshot,
  HistoricalOrganismRecord,
  MigrationSummary,
  ObstacleSnapshot,
  RegionType,
  ResourceSnapshot,
  Season,
  TerrainSnapshot,
  ValidationResult,
  WorldConfig,
  WorldOptions,
  WorldSnapshot
} from '@evo/contracts'
import type {
  DamageBuffer,
  HazardBuffer,
  MateBuffer,
  IntentBuffer,
  LastBitten,
  PeerBuffer,
  PerceptionBuffer,
  PredationBuffer,
  PreyBuffer,
  RegenBuffer,
  ThreatBuffer
} from '../buffers/types'
import type { ClockState } from '../clock/SimulationClock'
import { SimulationClock } from '../clock/SimulationClock'
import { EcologyModel } from '../ecology/EcologyModel'
import { FoodField } from '../ecology/FoodField'
import { HazardStore } from '../ecology/HazardStore'
import { MigrationTracker } from '../ecology/MigrationTracker'
import { Carcasses } from '../ecology/Carcasses'
import { ObstacleField } from '../ecology/ObstacleField'
import { ClusterTerrain } from '../ecology/ClusterTerrain'
import { RegionMap } from '../ecology/RegionMap'
import { EggStore } from '../entities/EggStore'
import { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState } from '../entities/OrganismStore'
import { OrganismStore } from '../entities/OrganismStore'
import { lifeStageFor } from '../organisms/lifeStage'
import { ReproductionReadiness } from '../organisms/reproductionReadiness'
import {
  bodyRadiusOf,
  drawnOutlineOf,
  drawnPartsOf,
  maxEnergyOf,
  maxHealthOf,
  gutCapacityOf
} from '../organisms/traits'
import type { ResourceState } from '../entities/ResourceStore'
import { FREE_SLOT, HUB_SLOT, ResourceStore, isNode } from '../entities/ResourceStore'
import { missingSlot, nodePosition } from '../ecology/Plants'
import { EventLog } from '../events/EventLog'
import { capabilitiesOf, viewOf } from '../development/capabilities'
import { developAnatomy } from '../development/develop'
import {
  assignFounderGroups,
  buildBodySpecs,
  chooseStartingBody,
  founderBodyVector
} from '../genetics/BodyGenes'
import { buildGeneSpecs } from '../genetics/GeneSpecs'
import type { GeneSpec } from '../genetics/GeneSpecs'
import { kindNamesOf, massScaleOf } from '../organisms/bodyFactors'
import { planClusterFounders } from '../genetics/ClusterFounders'
import type { FounderPlan } from '../genetics/ClusterFounders'
import { createFounderGenome, genomeToVector } from '../genetics/GenomeFactory'
import { GenomeRecombiner } from '../genetics/Recombination'
import { HistoryStore } from '../history/HistoryStore'
import { LineageStore } from '../lineage/LineageStore'
import type { LineageQueries } from '../lineage/LineageStore'
import { TWO_PI, wrapAngle } from '../math/scalar'
import { architectureOf } from '../genetics/GenomeFactory'
import { brainLayoutOf } from '../learning/BrainLayout'
import type { BrainLayout } from '../learning/BrainLayout'
import { createBrainState, writeBrainState } from '../learning/BrainState'
import { MetricsCollector } from '../metrics/MetricsCollector'
import { innatePriorWeights } from '../learning/InnatePrior'
import { learnedGap, priorDistance } from '../observatory/brainDrift'
import { ObservatoryRecorder } from '../observatory/ObservatoryRecorder'
import { RandomStreams, STREAM_NAMES } from '../random/streams'
import { SpeciesRegistry } from '../species/SpeciesRegistry'
import type { SpeciesQueries } from '../species/SpeciesRegistry'
import { StateHasher } from '../serialization/hash'
import { SpatialHash } from '../spatial/SpatialHash'
import { BrainSystem } from '../systems/BrainSystem'
import { DeathSystem } from '../systems/DeathSystem'
import { EggSystem } from '../systems/EggSystem'
import { DecisionSystem } from '../systems/DecisionSystem'
import { EnvironmentSystem } from '../systems/EnvironmentSystem'
import { HealthSystem } from '../systems/HealthSystem'
import { MigrationSystem } from '../systems/MigrationSystem'
import { DigestionSystem } from '../systems/DigestionSystem'
import { InteractionSystem } from '../systems/InteractionSystem'
import { MetabolismSystem } from '../systems/MetabolismSystem'
import { MovementSystem } from '../systems/MovementSystem'
import { PerceptionSystem } from '../systems/PerceptionSystem'
import type { SightBlockers } from '../systems/PerceptionSystem'
import { ReproductionSystem } from '../systems/ReproductionSystem'
import { ClusterLayout } from '../ecology/ClusterLayout'
import { effectiveConfig } from './clusterScaling'
import { CARRION_KIND, withCarrion } from './predationConfig'
import { checkInvariants } from './invariants'

export interface WorldCreateOptions extends WorldOptions {
  /**
   * When set, `validate()` runs automatically every Nth tick, throwing on the first violation
   * found. Meant for tests and development; leave unset otherwise (docs/simulation/determinism.md
   * describes what is checked).
   */
  validateEveryTicks?: number
}

/** Founders start within this fraction of their cluster's radius (ADR 0015). */
const FOUNDER_CORE = 0.8

/** How far beyond the clusters a camera may look, in world units. */
/** The camera may look this fraction of a cluster's radius beyond the clusters. */
const CLUSTER_VIEW_MARGIN = 0.6

/**
 * A headless, seeded, fixed-timestep world. `step()`/`run()` are the only ways state changes;
 * `snapshot()` and `stateHash()` never mutate anything. See docs/simulation/update-order.md for
 * the exact pipeline and docs/simulation/determinism.md for the reproducibility guarantee.
 */
export class World {
  readonly seed: number
  readonly config: WorldConfig
  readonly events: EventLog

  private readonly clockImpl: SimulationClock
  private readonly ids: IdGenerator
  private readonly randomStreams: RandomStreams
  private readonly organisms: OrganismStore
  /** The eggs in the world (ADR 0027); always empty with `reproduction.eggs` off. */
  private readonly eggStore: EggStore = new EggStore()
  private readonly resources: ResourceStore
  private readonly metricsCollector: MetricsCollector
  /** The evolution observatory (ADR 0024): read-only, unhashed, `null` when switched off. */
  private readonly observatoryRecorder: ObservatoryRecorder | null = null
  private readonly resourceIndex: SpatialHash<ResourceState>
  private readonly organismIndex: SpatialHash<OrganismState>
  private readonly historyStore: HistoryStore
  private readonly lineageStore: LineageStore
  private readonly speciesRegistry: SpeciesRegistry
  private readonly regionMap: RegionMap | null
  private readonly obstacleField: ObstacleField
  private readonly clusters: ClusterLayout | null
  private readonly clusterTerrain: ClusterTerrain | null
  private readonly ecology: EcologyModel
  private readonly hazardStore: HazardStore
  private readonly migrationTracker: MigrationTracker
  private readonly geneSpecs: GeneSpec[]
  private readonly bodySpecs: GeneSpec[]
  /** The founder plan: the reference every capability is measured against (ADR 0020). */
  private readonly founderBody: number[]
  /** The body this world's founders start with, and its archetype's name (`null`: the founder plan). */
  private startBody: number[]
  private startName: string | null = null
  private startGroups: { name: string; count: number }[] = []
  private readonly founderCapabilities: Capabilities
  private readonly genomeIds: IdGenerator
  private readonly perceptionBuffer: PerceptionBuffer = new Map()
  private readonly peerBuffer: PeerBuffer = new Map()
  private readonly intentBuffer: IntentBuffer = new Map()
  private readonly hazardBuffer: HazardBuffer = new Map()
  private readonly mateBuffer: MateBuffer = new Map()
  /** What each creature could bite and what could bite it, this tick (ADR 0023); empty with predation off. */
  private readonly preyBuffer: PreyBuffer = new Map()
  private readonly threatBuffer: ThreatBuffer = new Map()
  private readonly damageBuffer: DamageBuffer = new Map()
  /** Bite damage this tick, and who bit whom last (ADR 0023); both only used with predation on. */
  private readonly predationBuffer: PredationBuffer = new Map()
  private readonly lastBitten: LastBitten = new Map()
  /** What the dead leave for scavengers, or `null` without predation or carcasses. */
  private readonly carcasses: Carcasses | null
  private readonly regenBuffer: RegenBuffer = new Map()
  private readonly brainLayout: BrainLayout

  private readonly environmentSystem: EnvironmentSystem
  private readonly perceptionSystem: PerceptionSystem
  private readonly decisionSystem: DecisionSystem
  private readonly brainSystem: BrainSystem
  private readonly movementSystem: MovementSystem
  private readonly interactionSystem: InteractionSystem
  private readonly digestionSystem: DigestionSystem
  private readonly metabolismSystem: MetabolismSystem
  private readonly healthSystem: HealthSystem
  private readonly migrationSystem: MigrationSystem
  private readonly reproductionSystem: ReproductionSystem
  /** Lays and hatches eggs (ADR 0027); `null` with eggs off. */
  private readonly eggSystem: EggSystem | null
  private readonly deathSystem: DeathSystem

  private readonly validateEveryTicks: number | undefined

  constructor(options: WorldCreateOptions) {
    const seedCheck = validateSeed(options.seed)
    if (!seedCheck.ok) throw new RangeError(seedCheck.errors.join('; '))
    if (
      options.validateEveryTicks !== undefined &&
      (!Number.isInteger(options.validateEveryTicks) || options.validateEveryTicks <= 0)
    ) {
      throw new RangeError('validateEveryTicks must be a positive integer when provided')
    }

    this.seed = options.seed
    this.config = withCarrion(effectiveConfig(resolveWorldConfig(options.config)))
    this.validateEveryTicks = options.validateEveryTicks

    this.clockImpl = new SimulationClock(this.config.timestep)
    this.ids = new IdGenerator()
    this.genomeIds = new IdGenerator()
    this.geneSpecs = buildGeneSpecs(this.config)
    this.bodySpecs = buildBodySpecs(this.config.anatomy)
    this.founderBody = founderBodyVector(this.config.anatomy)
    this.startBody = this.founderBody
    this.randomStreams = new RandomStreams(this.seed)
    this.organisms = new OrganismStore()
    this.resources = new ResourceStore()
    this.events = new EventLog(this.config.history.maxEvents)
    this.metricsCollector = new MetricsCollector()
    // Grid cell sizes are the upper bound of the gene ranges: a query is correct for any cell
    // size, so this only affects efficiency, and it must not depend on an individual genome.
    this.resourceIndex = new SpatialHash<ResourceState>(
      // Eyes can double the sensor range, and a query is correct for any cell size.
      2 * this.config.organisms.sensorRadius,
      (resource) => resource
    )
    this.organismIndex = new SpatialHash<OrganismState>(
      geneRangeMax(this.geneSpecs, 'reproduction.searchRadius'),
      (organism) => organism
    )
    this.historyStore = new HistoryStore(this.config.history.maxHistoricalOrganisms)
    this.lineageStore = new LineageStore()
    this.speciesRegistry = new SpeciesRegistry(
      this.config.species,
      this.geneSpecs,
      this.config.genetics.brain.initialWeightStd,
      this.bodySpecs
    )

    // The terrain is drawn once, from its own stream, and only when regions are on.
    const { regions } = this.config.ecology
    const { environment } = this.config
    if (environment.layout === 'clusters') {
      // The cluster layout (docs/decisions/0014): biome patches inside circular clusters, void between.
      this.clusters = new ClusterLayout(environment.clusters)
      this.clusterTerrain = regions.enabled
        ? new ClusterTerrain(
            this.clusters,
            environment.clusters.patches,
            this.randomStreams.get('terrain')
          )
        : null
      this.regionMap = null
    } else {
      this.clusters = null
      this.clusterTerrain = null
      this.regionMap = regions.enabled
        ? RegionMap.generate(
            regions,
            environment.width,
            environment.height,
            this.randomStreams.get('terrain')
          )
        : null
    }
    this.ecology = new EcologyModel(
      this.config,
      this.clusterTerrain ?? this.regionMap,
      this.clusters
    )
    // Static obstacles (ADR 0022): drawn from the `terrain` stream after the region map and before
    // the static hazards; with obstacles off nothing is drawn and the field is empty.
    this.obstacleField = ObstacleField.generate(
      this.config,
      this.ecology,
      this.randomStreams.get('terrain')
    )
    this.founderCapabilities = capabilitiesOf(
      developAnatomy(this.founderBody, this.config.anatomy),
      this.config.anatomy,
      1,
      Math.max(1, this.ecology.kindCount),
      kindNamesOf(this.config)
    )
    this.hazardStore = new HazardStore()
    this.migrationTracker = new MigrationTracker(this.config.ecology.migration.dwellTime)
    const brainControlled = this.config.learning.controller === 'brain'

    this.environmentSystem = new EnvironmentSystem(
      this.config,
      this.resources,
      this.ids,
      this.randomStreams.get('environment'),
      this.events,
      this.ecology,
      this.hazardStore,
      this.randomStreams.get('events'),
      this.clusters === null ? null : () => this.livingPerCluster(),
      this.config.resources.distribution.mode === 'noise'
        ? new FoodField(this.seed, this.config.resources.distribution)
        : null,
      this.obstacleField
    )
    this.brainLayout = brainLayoutOf(architectureOf(this.config.genetics.brain))
    this.perceptionSystem = new PerceptionSystem(
      this.config,
      this.organisms,
      this.resourceIndex,
      this.perceptionBuffer,
      brainControlled ? { organismIndex: this.organismIndex, buffer: this.peerBuffer } : undefined,
      this.ecology,
      brainControlled ? { hazards: this.hazardStore, buffer: this.hazardBuffer } : undefined,
      brainControlled
        ? {
            organismIndex: this.organismIndex,
            buffer: this.mateBuffer,
            radius: this.config.reproduction.mateSenseRadius,
            readiness: new ReproductionReadiness(this.config, this.ecology),
            compatible: (a, b) =>
              (!this.config.reproduction.sexes.enabled || a.sex !== b.sex) &&
              (!this.config.species.enabled ||
                !this.config.species.reproductiveIsolation ||
                this.speciesRegistry.speciesOf(a.id) === this.speciesRegistry.speciesOf(b.id))
          }
        : undefined,
      // Creatures' bodies (ADR 0016 "Line of sight") and obstacles that block sight (ADR 0022) hide
      // what is behind them; with neither the occluding search is not used at all.
      this.sightBlockers(),
      // Prey and threats (ADR 0023): only with predation on; the buffers stay empty otherwise.
      this.config.predation.enabled
        ? { organismIndex: this.organismIndex, prey: this.preyBuffer, threat: this.threatBuffer }
        : undefined
    )
    this.decisionSystem = new DecisionSystem(
      this.config,
      this.organisms,
      this.perceptionBuffer,
      this.intentBuffer,
      this.randomStreams.get('world'),
      this.config.predation.enabled ? this.preyBuffer : undefined,
      this.config.predation.enabled ? this.threatBuffer : undefined
    )
    this.brainSystem = new BrainSystem(
      this.config,
      this.organisms,
      this.perceptionBuffer,
      this.peerBuffer,
      this.intentBuffer,
      this.events,
      this.randomStreams.get('learning'),
      this.ecology,
      this.hazardBuffer,
      this.mateBuffer,
      this.preyBuffer,
      this.threatBuffer
    )
    this.movementSystem = new MovementSystem(
      this.config,
      this.organisms,
      this.intentBuffer,
      this.events,
      this.ecology,
      this.obstacleField
    )
    this.migrationSystem = new MigrationSystem(
      this.config,
      this.organisms,
      this.ecology,
      this.migrationTracker
    )
    this.interactionSystem = new InteractionSystem(
      this.config,
      this.organisms,
      this.resources,
      this.resourceIndex,
      this.events,
      this.intentBuffer,
      this.ecology,
      this.damageBuffer,
      this.config.predation.enabled
        ? {
            organismIndex: this.organismIndex,
            buffer: this.predationBuffer,
            lastBitten: this.lastBitten,
            obstacles: this.obstacleField
          }
        : undefined
    )
    this.digestionSystem = new DigestionSystem(this.config, this.organisms, this.events)
    this.healthSystem = new HealthSystem(
      this.config,
      this.organisms,
      this.hazardStore,
      this.damageBuffer,
      this.regenBuffer,
      this.events,
      this.ecology,
      this.config.predation.enabled ? this.predationBuffer : undefined
    )
    this.metabolismSystem = new MetabolismSystem(
      this.config,
      this.organisms,
      this.events,
      this.ecology,
      this.regenBuffer
    )
    this.reproductionSystem = new ReproductionSystem(
      this.config,
      this.organisms,
      this.organismIndex,
      this.ids,
      new GenomeRecombiner(this.geneSpecs, this.config.genetics, () => this.genomeIds.allocate(), {
        specs: this.bodySpecs,
        random: this.randomStreams.get('anatomy'),
        enabled: this.config.anatomy.enabled
      }),
      this.randomStreams.get('genetics'),
      this.lineageStore,
      this.randomStreams.get('reproduction'),
      this.events,
      this.speciesRegistry,
      this.ecology,
      this.eggStore
    )
    this.eggSystem = this.config.reproduction.eggs.enabled
      ? new EggSystem(
          this.config,
          this.organisms,
          this.eggStore,
          this.ids,
          this.lineageStore,
          this.randomStreams.get('reproduction'),
          this.events,
          this.speciesRegistry
        )
      : null
    const carrionKind = kindNamesOf(this.config).indexOf(CARRION_KIND)
    this.carcasses =
      carrionKind >= 0
        ? new Carcasses(this.config, this.resources, this.ids, this.events, carrionKind)
        : null
    this.deathSystem = new DeathSystem(
      this.organisms,
      this.events,
      this.historyStore,
      this.lineageStore,
      this.speciesRegistry,
      this.migrationTracker,
      this.config.predation.enabled
        ? {
            lastBitten: this.lastBitten,
            windowTicks: Math.ceil(this.config.predation.attackWindow / this.config.timestep)
          }
        : undefined,
      (organism, _cause, tick) => {
        this.carcasses?.drop(organism, tick)
        // A carrying mother who dies loses the clutch and its energy (ADR 0027).
        if (organism.pregnancy !== null) {
          this.events.record({
            type: 'clutch-lost',
            tick,
            motherId: organism.id,
            fatherId: organism.pregnancy.fatherId
          })
        }
      }
    )

    this.events.beginTick()
    this.environmentSystem.placeStaticHazards(0, this.randomStreams.get('terrain'))
    this.spawnInitialPopulation()
    this.metricsCollector.recordEvents(this.events.eventsThisTick())
    this.metricsCollector.updatePopulation(this.organisms.size, 0)
    this.speciesRegistry.observe(0)
    if (this.config.observatory.enabled) {
      this.observatoryRecorder = new ObservatoryRecorder({
        config: this.config,
        organisms: this.organisms,
        lineage: this.lineageStore,
        species: this.speciesRegistry,
        geneSpecs: this.geneSpecs,
        bodySpecs: this.bodySpecs,
        carrionKind: kindNamesOf(this.config).indexOf(CARRION_KIND)
      })
      this.observatoryRecorder.afterTick(0, this.events.eventsThisTick())
    }
  }

  /** Equivalent to `new World(options)`. */
  static create(options: WorldCreateOptions): World {
    return new World(options)
  }

  private spawnInitialPopulation(): void {
    this.environmentSystem.spawnInitial(0)

    const worldRandom = this.randomStreams.get('world')
    const geneticsRandom = this.randomStreams.get('genetics')
    const { width, height } = this.config.environment
    // The body every founder of this world starts with (ADR 0020): one draw in `archetypes` mode,
    // none in `reference` mode, so the founder plan's worlds are exactly as before.
    const start = chooseStartingBody(this.config.anatomy, geneticsRandom)
    this.startBody = start.body
    this.startName = start.name
    // A small group of founders may start with a different body (ADR 0023): chosen by an even
    // spread over the founders, so it spends no draw and the base body above is unchanged.
    const initialCount = this.config.organisms.initialCount
    const groupOf = assignFounderGroups(
      initialCount,
      start.groups.map((group) => group.share)
    )
    this.startGroups = start.groups.map((group, g) => ({
      name: group.name,
      count: groupOf.filter((member) => member === g).length
    }))
    // In the cluster layout the founders are planned first (a body of genes per species), then
    // placed species by species inside their home cluster (docs/decisions/0014).
    const clusters = this.clusters
    const plans: FounderPlan[] =
      clusters === null
        ? []
        : planClusterFounders(
            this.geneSpecs,
            this.startBody,
            this.bodySpecs,
            this.config.environment.clusters,
            geneticsRandom
          )
    const perSpecies = this.config.environment.clusters.organismsPerSpecies
    for (let i = 0; i < this.config.organisms.initialCount; i++) {
      const id = this.ids.allocate()
      const plan =
        clusters === null ? undefined : (plans[Math.floor(i / perSpecies)] as FounderPlan)
      let x: number
      let y: number
      if (clusters !== null && plan !== undefined) {
        const point = clusters.pointIn(
          plan.cluster,
          worldRandom.float(),
          worldRandom.float(),
          FOUNDER_CORE
        )
        x = point.x
        y = point.y
      } else {
        x = worldRandom.float() * width
        y = worldRandom.float() * height
      }
      const heading = wrapAngle(worldRandom.float() * TWO_PI)
      const group = groupOf[i] as number
      const genome = createFounderGenome(
        this.genomeIds.allocate(),
        this.geneSpecs,
        this.config.genetics.brain,
        geneticsRandom,
        group >= 0
          ? (start.groups[group] as { body: number[] }).body
          : plan === undefined
            ? this.startBody
            : plan.body,
        plan?.vector
      )
      const organism: OrganismState = {
        id,
        genome,
        x,
        y,
        vx: 0,
        vy: 0,
        heading,
        age: 0,
        energy: this.config.organisms.initialEnergy,
        health: maxHealthOf(genome, this.config),
        parentIds: [],
        birthTick: 0,
        reproductionCooldownRemaining: 0,
        lastTurnMagnitude: 0,
        gut: 0,
        biteCooldown: 0,
        brain:
          this.config.learning.controller === 'brain'
            ? createBrainState(genome, this.brainLayout, this.config.organisms.initialEnergy)
            : null,
        // Founders alternate sex, draw-free (ADR 0027); all the same sex with one sex.
        sex: this.config.reproduction.sexes.enabled ? ((i % 2) as 0 | 1) : 0,
        pregnancy: null
      }
      this.organisms.add(organism)
      this.lineageStore.register({
        genomeId: genome.id,
        parentGenomeIds: [],
        organismId: id,
        tick: 0
      })
      const speciesId = this.speciesRegistry.assign({
        organismId: id,
        genome,
        parentOrganismId: null,
        tick: 0,
        ...(plan === undefined ? {} : { founderGroup: plan.group })
      })
      this.events.record({
        type: 'organism-born',
        tick: 0,
        organismId: id,
        genomeId: genome.id,
        parentIds: [],
        speciesId,
        position: { x, y }
      })
    }
  }

  /**
   * Who descended from whom, for every genome that has ever existed, including those whose
   * organisms have died. Read-only; a derived record, not part of the state hash.
   */
  get lineage(): LineageQueries {
    return this.lineageStore
  }

  /**
   * Species by genetic distance, including extinct ones (docs/simulation/species.md). Read-only; a
   * derived record, not part of the state hash.
   */
  get species(): SpeciesQueries {
    return this.speciesRegistry
  }

  /** The active hazards (damage areas and storms), ascending id. Deep-copied. */
  private hazardSnapshots(): HazardSnapshot[] {
    return this.hazardStore.values().map((hazard) => ({
      id: hazard.id,
      kind: hazard.kind,
      position: { x: hazard.x, y: hazard.y },
      radius: hazard.radius,
      damagePerSecond: hazard.damagePerSecond,
      expiresAtTick: hazard.expiresAtTick
    }))
  }

  /**
   * The static region map for drawing, or `null` when regions are off. A copy; the map never
   * changes during a run, so a presentation layer reads it once. Not part of the state hash.
   */
  terrain(): TerrainSnapshot | null {
    return this.regionMap === null ? null : this.regionMap.toSnapshot()
  }

  /** What hides things from a viewer, or `undefined` when nothing does (the cheaper searches are used then). */
  private sightBlockers(): SightBlockers | undefined {
    const organisms = this.config.perception.organismsBlockSight
    const obstacles = this.obstacleField.maxSightRadius > 0
    if (!organisms && !obstacles) return undefined
    return {
      organismIndex: organisms ? this.organismIndex : undefined,
      obstacles: obstacles ? this.obstacleField : undefined
    }
  }

  /**
   * The static obstacle circles for drawing (empty when obstacles are off). A copy; the field never
   * changes during a run, so a presentation layer reads it once. Not part of the state hash.
   */
  obstacles(): ObstacleSnapshot[] {
    return this.obstacleField.toSnapshot()
  }

  /** The cluster layout for drawing, or `null` in the field layout. A copy; it never changes during a run. */
  clusterLayout(): ClusterLayoutSnapshot | null {
    if (this.clusters === null) return null
    const margin = CLUSTER_VIEW_MARGIN * this.clusters.radius
    if (this.clusterTerrain !== null) return this.clusterTerrain.toSnapshot(margin)
    const b = this.clusters.bounds(margin)
    return {
      radius: this.clusters.radius,
      bounds: b,
      clusters: this.clusters.centres.map((centre) => ({ x: centre.x, y: centre.y, patches: [] }))
    }
  }

  /** Living organisms per cluster (nearest centre; the void counts for its nearest cluster). */
  private livingPerCluster(): number[] {
    const layout = this.clusters as ClusterLayout
    const alive = layout.centres.map(() => 0)
    for (const organism of this.organisms.values()) {
      const cluster = layout.nearestCluster(organism.x, organism.y)
      alive[cluster] = (alive[cluster] as number) + 1
    }
    return alive
  }

  /**
   * Where the living organisms are in the cluster layout: per cluster and per species, and the
   * mean purity (docs/decisions/0014); `null` in the field layout. A read: it never changes state.
   */
  clusterReport(): ClusterReport | null {
    const layout = this.clusters
    if (layout === null) return null
    const alive = layout.centres.map(() => 0)
    const inVoid = layout.centres.map(() => 0)
    const bySpecies = new Map<number, number[]>()
    for (const organism of this.organisms.values()) {
      const cluster = layout.nearestCluster(organism.x, organism.y)
      alive[cluster] = (alive[cluster] as number) + 1
      if (layout.clusterAt(organism.x, organism.y) < 0)
        inVoid[cluster] = (inVoid[cluster] as number) + 1
      const speciesId = this.speciesRegistry.speciesOf(organism.id)
      if (speciesId === undefined || speciesId === null) continue
      let counts = bySpecies.get(speciesId)
      if (counts === undefined) {
        counts = layout.centres.map(() => 0)
        bySpecies.set(speciesId, counts)
      }
      counts[cluster] = (counts[cluster] as number) + 1
    }
    const species: ClusterReport['species'][number][] = []
    let weighted = 0
    let total = 0
    for (const [speciesId, counts] of bySpecies) {
      let best = 0
      let sum = 0
      for (let c = 0; c < counts.length; c++) {
        sum += counts[c] as number
        if ((counts[c] as number) > (counts[best] as number)) best = c
      }
      const purity = (counts[best] as number) / sum
      species.push({ speciesId, alive: sum, dominantCluster: best, purity })
      weighted += purity * sum
      total += sum
    }
    species.sort((a, b) => a.speciesId - b.speciesId)
    return {
      clusters: layout.centres.map((_, index) => ({
        index,
        alive: alive[index] as number,
        inVoid: inVoid[index] as number
      })),
      species,
      meanPurity: total === 0 ? 1 : weighted / total
    }
  }

  /** The current season, or `null` when seasons are off. */
  get season(): Season | null {
    return this.ecology.seasonAt(this.clockImpl.tick)
  }

  /** The region type at a position, or `null` when regions are off. */
  regionTypeAt(x: number, y: number): RegionType | null {
    return this.ecology.regionTypeAt(x, y)
  }

  /** The region instance (a Voronoi point index) at a position, or `-1` when regions are off. */
  regionIndexAt(x: number, y: number): number {
    return this.ecology.regionIndexAt(x, y)
  }

  /**
   * How a living organism has moved between regions (docs/ecology/ecology.md); `undefined` when
   * it is not alive, migration is off, or it has not been observed yet. A derived record, not
   * part of the state hash.
   */
  migrationOf(organismId: EntityId): MigrationSummary | undefined {
    return this.migrationTracker.summary(organismId)
  }

  /**
   * The genome of an active organism, or `undefined` if there is no such organism. Genomes are
   * deeply frozen, so the returned object is safe to hold or share.
   */
  genomeOf(organismId: EntityId): Genome | undefined {
    return this.organisms.get(organismId)?.genome
  }

  /**
   * The name of the starting body this world drew (ADR 0020), or `null` when its founders started
   * with the founder plan itself. A derived fact about the seed and the configuration, not state.
   */
  /** The food in the snapshot; a plant's hub and nodes carry their links and the hub its growing bud. */
  private resourceSnapshots(): ResourceSnapshot[] {
    const items = this.resources.values()
    const plants = this.config.resources.plants
    const masks = new Map<number, number>()
    if (plants.enabled) {
      for (const r of items) {
        if (isNode(r)) {
          const hub = r.parent as number
          masks.set(hub, (masks.get(hub) ?? 0) | (1 << (r.slot as number)))
        }
      }
    }
    const { width, height } = this.config.environment
    return items.map((resource) => {
      const kind = this.ecology.kind(resource.kind)
      const base = {
        id: resource.id,
        position: { x: resource.x, y: resource.y },
        radius: kind.radius,
        energyValue: kind.energy,
        remaining: resource.remaining,
        kind: resource.kind
      }
      if (!plants.enabled) return base
      const slot = resource.slot ?? FREE_SLOT
      if (slot === HUB_SLOT) {
        const next = missingSlot(masks.get(resource.id) ?? 0, plants.nodes)
        const nodeEnergy = plants.nodeEnergyScale * kind.energy
        const at =
          next === 0
            ? null
            : nodePosition(resource, next, plants.nodes, plants.ring * kind.radius, width, height)
        return {
          ...base,
          energyValue: plants.hubEnergyScale * kind.energy,
          parent: 0,
          slot,
          bud:
            at === null
              ? null
              : {
                  x: at.x,
                  y: at.y,
                  progress: Math.min(1, Math.max(0, (resource.sproutProgress ?? 0) / nodeEnergy))
                }
        }
      }
      if (slot === FREE_SLOT) return { ...base, parent: 0, slot, bud: null }
      return {
        ...base,
        energyValue: plants.nodeEnergyScale * kind.energy,
        parent: resource.parent ?? 0,
        slot,
        bud: null
      }
    })
  }

  /**
   * What the evolution observatory has recorded (ADR 0024): indicators of whether the world is still
   * changing, sampled every `observatory.sampleEvery` ticks. A derived view, never hashed and never
   * read back by the simulation; `null` when `observatory.enabled` is false.
   */
  observatory(): EvolutionSeries | null {
    return this.observatoryRecorder?.series() ?? null
  }

  get startingBodyName(): string | null {
    return this.startName
  }

  /** The founder groups that started with a body of their own, and how many founders each has (ADR 0023). */
  get startingGroups(): readonly { name: string; count: number }[] {
    return this.startGroups
  }

  /**
   * An active organism's body (ADR 0012): the anatomy grown from its genes, its capabilities, and
   * them relative to the founder body. Computed on demand from the genome (development is a pure
   * function), so it is always consistent with it; `undefined` if there is no such organism. A
   * derived view, not part of the state hash.
   */
  anatomyOf(organismId: EntityId): AnatomyView | undefined {
    const organism = this.organisms.get(organismId)
    if (organism === undefined) return undefined
    return viewOf(
      developAnatomy(organism.genome.body.genes, this.config.anatomy),
      this.founderCapabilities,
      this.config.anatomy,
      massScaleOf(organism.genome.body.genes, this.config.anatomy),
      Math.max(1, this.ecology.kindCount),
      kindNamesOf(this.config)
    )
  }

  /**
   * A read-only view of an organism's brain: its latest observation, hidden activations, memory,
   * network output and action taken, value estimate, last reward breakdown and lifetime
   * telemetry (docs/learning/brain.md). `undefined` when there is no such organism or the
   * controller is `'reflex'`. Before an organism's first decision its vectors are zeros.
   */
  brainOf(organismId: EntityId): BrainSnapshot | undefined {
    const brain = this.organisms.get(organismId)?.brain
    if (!brain) return undefined
    const zeros = (length: number): number[] => new Array<number>(length).fill(0)
    return {
      organismId,
      observation:
        brain.lastObservation.length > 0 ? brain.lastObservation.slice() : zeros(OBSERVATION_SIZE),
      hidden: brain.prevHidden.slice(),
      memory: brain.memory.slice(),
      output: brain.lastOutput.length > 0 ? brain.lastOutput.slice() : zeros(ACTION_SIZE),
      action: brain.prevAction.slice(),
      value: brain.prevValue,
      reward: { ...brain.reward },
      telemetry: {
        rewardTotal: brain.rewardTotal,
        updates: brain.updates,
        weightChange: brain.weightChange
      },
      drift: this.driftOf(organismId)
    }
  }

  private brainPrior: number[] | null = null

  /** How far an organism's inherited weights are from the innate prior, and how far its life has moved them (ADR 0024). */
  private driftOf(organismId: EntityId): { fromPrior: number; learned: number } {
    const organism = this.organisms.get(organismId)
    if (organism === undefined) return { fromPrior: 0, learned: 0 }
    this.brainPrior ??= innatePriorWeights(this.brainLayout.architecture)
    const weights = organism.genome.brain.weights
    return {
      fromPrior: priorDistance(weights, this.brainPrior),
      learned:
        organism.brain === null
          ? 0
          : learnedGap(weights.slice(this.brainLayout.learnOffset), organism.brain.learned)
    }
  }

  /** The current tick, simulated time, and timestep. Read-only: `step()` is the only mutator. */
  get clock(): ClockState {
    return this.clockImpl.state()
  }

  /** Whether the population has ever reached zero. Never becomes `false` again once `true`. */
  get isExtinct(): boolean {
    return this.metricsCollector.extinctionTick !== null
  }

  /** Advances the world by exactly one tick, following the fixed pipeline. */
  step(): void {
    this.events.beginTick()
    this.clockImpl.advance()
    const tick = this.clockImpl.tick

    this.environmentSystem.update(tick)
    this.resourceIndex.rebuild(this.resources.values())
    this.organismIndex.rebuild(this.organisms.values())
    this.perceptionSystem.update(tick)
    if (this.config.learning.controller === 'brain') this.brainSystem.decide(tick)
    else this.decisionSystem.update()
    this.movementSystem.update(tick)
    this.migrationSystem.update()
    this.interactionSystem.update(tick)
    this.digestionSystem.update(tick)
    this.healthSystem.update(tick)
    this.metabolismSystem.update(tick)
    this.reproductionSystem.update(tick)
    this.eggSystem?.update(tick)
    this.deathSystem.update(tick)
    this.carcasses?.update(tick)
    if (this.config.learning.controller === 'brain') this.brainSystem.settle(tick)

    this.metricsCollector.recordEvents(this.events.eventsThisTick())
    this.metricsCollector.updatePopulation(this.organisms.size, tick)
    this.speciesRegistry.observe(tick)
    this.observatoryRecorder?.afterTick(tick, this.events.eventsThisTick())

    if (this.validateEveryTicks !== undefined && tick % this.validateEveryTicks === 0) {
      const result = this.validate()
      if (!result.ok) {
        throw new Error(`World invariant violated at tick ${tick}:\n${result.errors.join('\n')}`)
      }
    }
  }

  /** Advances the world by exactly `steps` ticks. */
  run(steps: number): void {
    if (!Number.isInteger(steps) || steps < 0) {
      throw new RangeError('steps must be a nonnegative integer')
    }
    for (let i = 0; i < steps; i++) this.step()
  }

  /** Checks the invariants in docs/simulation/determinism.md and update-order.md. Never repairs. */
  validate(): ValidationResult {
    return checkInvariants({
      organisms: this.organisms.values(),
      eggs: this.eggStore.values(),
      resources: this.resources.values(),
      config: this.config,
      tick: this.clockImpl.tick,
      extinctionTick: this.metricsCollector.extinctionTick,
      metrics: this.metricsCollector.snapshot(),
      nextEntityId: this.ids.nextId,
      nextGenomeId: this.genomeIds.nextId,
      geneSpecs: this.geneSpecs,
      bodySpecs: this.bodySpecs,
      lineage: this.lineageStore,
      species: this.speciesRegistry,
      hazards: this.hazardStore.values()
    })
  }

  /** The eggs, ascending id (ADR 0027). Deep-copied. */
  private eggSnapshots(): EggSnapshot[] {
    const tick = this.clockImpl.tick
    return this.eggStore.values().map((egg) => ({
      id: egg.id,
      position: { x: egg.x, y: egg.y },
      motherId: egg.motherId,
      fatherId: egg.fatherId,
      energy: egg.energy,
      progress: Math.min(1, Math.max(0, (tick - egg.layTick) / (egg.hatchTick - egg.layTick))),
      guarded: false
    }))
  }

  /** A read-only, deep-copied view of the world, safe to hand to a renderer or UI. */
  snapshot(): WorldSnapshot {
    const clockState = this.clockImpl.state()
    return {
      seed: this.seed,
      tick: clockState.tick,
      time: clockState.time,
      population: {
        active: this.organisms.size,
        extinctionTick: this.metricsCollector.extinctionTick
      },
      organisms: this.organisms.values().map((organism) => ({
        id: organism.id,
        genomeId: organism.genome.id,
        parentIds: organism.parentIds,
        speciesId: this.speciesRegistry.speciesOf(organism.id) ?? null,
        position: { x: organism.x, y: organism.y },
        velocity: { x: organism.vx, y: organism.vy },
        heading: organism.heading,
        radius: bodyRadiusOf(organism.genome, this.config),
        outline: drawnOutlineOf(organism.genome, this.config),
        parts: drawnPartsOf(organism.genome, this.config),
        hue: organism.genome.physical.hue,
        pattern: organism.genome.body.genes[visualGeneIndex('pattern')] as number,
        accentHue: organism.genome.body.genes[visualGeneIndex('accentHue')] as number,
        age: organism.age,
        maxAge: organism.genome.physical.maxAge,
        energy: organism.energy,
        maxEnergy: maxEnergyOf(organism.genome, this.config),
        health: organism.health,
        maxHealth: maxHealthOf(organism.genome, this.config),
        lifeStage: lifeStageFor(organism.age, this.config.organisms),
        reproductionCooldownRemaining: organism.reproductionCooldownRemaining,
        gut: organism.gut,
        gutCapacity: this.config.feeding.enabled ? gutCapacityOf(organism.genome, this.config) : 0,
        sex: organism.sex,
        carrying:
          organism.pregnancy === null
            ? null
            : Math.max(0, organism.pregnancy.layTick - clockState.tick) * this.config.timestep
      })),
      resources: this.resourceSnapshots(),
      hazards: this.hazardSnapshots(),
      eggs: this.eggSnapshots(),
      metrics: this.metricsCollector.snapshot()
    }
  }

  /**
   * A compact, retained record of every organism that has died, oldest first (bounded by
   * `history.maxHistoricalOrganisms`). Separate from `snapshot()` so the hot render-loop path
   * stays cheap; history is queried occasionally, not every frame (docs/decisions/0005).
   */
  historicalOrganisms(): HistoricalOrganismRecord[] {
    return this.historyStore.list()
  }

  /**
   * The canonical state hash (docs/simulation/determinism.md, section 7). Two `World`s created
   * with the same seed and config, run for the same number of ticks, always produce the same hash.
   */
  stateHash(): string {
    const hasher = StateHasher.withHeader()
    hasher.writeUint32(this.seed)

    const clockState = this.clockImpl.state()
    hasher
      .writeFloat64(clockState.tick)
      .writeFloat64(clockState.time)
      .writeFloat64(clockState.deltaTime)
    hasher.writeUint32(this.ids.nextId)
    hasher.writeUint32(this.genomeIds.nextId)

    for (const name of STREAM_NAMES) {
      const state = this.randomStreams.get(name).getState()
      hasher
        .writeUint32(state.words[0])
        .writeUint32(state.words[1])
        .writeUint32(state.words[2])
        .writeUint32(state.words[3])
        .writeBoolean(state.spare !== null)
        .writeFloat64(state.spare ?? 0)
    }

    const organisms = this.organisms.values()
    hasher.writeUint32(organisms.length)
    for (const organism of organisms) {
      hasher
        .writeUint32(organism.id)
        .writeFloat64(organism.x)
        .writeFloat64(organism.y)
        .writeFloat64(organism.vx)
        .writeFloat64(organism.vy)
        .writeFloat64(organism.heading)
        .writeFloat64(organism.age)
        .writeFloat64(organism.energy)
        .writeFloat64(organism.birthTick)
        .writeFloat64(organism.lastTurnMagnitude)
        .writeFloat64(organism.reproductionCooldownRemaining)
      hasher.writeUint32(organism.parentIds.length)
      for (const parentId of organism.parentIds) hasher.writeUint32(parentId)

      writeGenome(hasher, organism.genome)
      writeBrainState(hasher, organism.brain)
      hasher.writeFloat64(organism.health)
      // Schema v10: the feeding state follows health (docs/decisions/0017).
      hasher.writeFloat64(organism.gut).writeFloat64(organism.biteCooldown)
    }

    const resources = this.resources.values()
    hasher.writeUint32(resources.length)
    for (const resource of resources) {
      hasher
        .writeUint32(resource.id)
        .writeFloat64(resource.x)
        .writeFloat64(resource.y)
        .writeFloat64(resource.remaining)
        .writeUint8(resource.kind)
        // Schema v11: the plant state follows the kind (docs/decisions/0021).
        .writeUint32(resource.parent ?? 0)
        .writeUint8(resource.slot ?? FREE_SLOT)
        .writeUint32(resource.bornTick ?? 0)
        .writeFloat64(resource.sproutProgress ?? 0)
    }

    const metrics = this.metricsCollector.snapshot()
    hasher
      .writeUint32(metrics.organismsBorn)
      .writeUint32(metrics.deathsByStarvation)
      .writeUint32(metrics.deathsByAge)
      .writeUint32(metrics.resourcesSpawned)
      .writeUint32(metrics.resourcesConsumed)
      .writeUint32(metrics.reproductionAttempts)
      .writeUint32(metrics.reproductionSuccesses)
      .writeUint32(metrics.reproductionFailures)
      .writeFloat64(metrics.energyConsumed)
      .writeFloat64(metrics.energyWasted)
      .writeUint32(metrics.deathsByDamage)
      .writeFloat64(metrics.damageTaken)

    const extinctionTick = this.metricsCollector.extinctionTick
    hasher.writeBoolean(extinctionTick !== null).writeFloat64(extinctionTick ?? 0)
    hasher.writeFloat64(this.events.emittedCount)

    // Schema v5 tail: the hazards, their id counter and the two spawn remainders (docs/simulation/determinism.md).
    const hazards = this.hazardStore.values()
    hasher.writeUint32(hazards.length).writeUint32(this.hazardStore.nextId)
    for (const hazard of hazards) {
      hasher
        .writeUint32(hazard.id)
        .writeUint8(hazard.kind === 'damage-area' ? 0 : 1)
        .writeFloat64(hazard.x)
        .writeFloat64(hazard.y)
        .writeFloat64(hazard.radius)
        .writeFloat64(hazard.damagePerSecond)
        .writeBoolean(hazard.expiresAtTick !== null)
        .writeFloat64(hazard.expiresAtTick ?? 0)
    }
    hasher
      .writeFloat64(this.environmentSystem.spawnRemainder)
      .writeFloat64(this.environmentSystem.stormRemainder)
    // Schema v12 tail: the predation counters (docs/decisions/0023).
    hasher.writeUint32(metrics.deathsByPredation).writeUint32(metrics.predationBites)
    // Schema v13 tail: the life cycle (docs/decisions/0027): the egg counters, each creature's sex
    // and carried clutch, and the eggs. All zero or empty with sexes and eggs off.
    hasher
      .writeUint32(metrics.eggsLaid)
      .writeUint32(metrics.eggsHatched)
      .writeUint32(metrics.eggsEaten)
      .writeUint32(metrics.clutchesLost)
    for (const organism of organisms) {
      hasher.writeUint8(organism.sex)
      const pregnancy = organism.pregnancy
      hasher.writeBoolean(pregnancy !== null)
      if (pregnancy !== null) {
        writeGenome(hasher, pregnancy.genome)
        hasher
          .writeUint32(pregnancy.fatherId)
          .writeBoolean(pregnancy.speciesId !== null)
          .writeUint32(pregnancy.speciesId ?? 0)
          .writeFloat64(pregnancy.energy)
          .writeFloat64(pregnancy.layTick)
      }
    }
    const eggs = this.eggStore.values()
    hasher.writeUint32(eggs.length)
    for (const egg of eggs) {
      hasher
        .writeUint32(egg.id)
        .writeFloat64(egg.x)
        .writeFloat64(egg.y)
        .writeUint32(egg.motherId)
        .writeUint32(egg.fatherId)
        .writeBoolean(egg.speciesId !== null)
        .writeUint32(egg.speciesId ?? 0)
        .writeFloat64(egg.energy)
        .writeFloat64(egg.layTick)
        .writeFloat64(egg.hatchTick)
      writeGenome(hasher, egg.genome)
    }

    return hasher.digest()
  }
}

/** Writes a genome: its ids, gene vector, brain and body (the order the hash has always used). */
function writeGenome(hasher: StateHasher, genome: Genome): void {
  hasher.writeUint32(genome.id)
  hasher.writeUint32(genome.parentIds.length)
  for (const parentId of genome.parentIds) hasher.writeUint32(parentId)
  for (const value of genomeToVector(genome)) hasher.writeFloat64(value)
  const { architecture, weights } = genome.brain
  hasher
    .writeUint32(architecture.inputSize)
    .writeUint32(architecture.hiddenSize)
    .writeUint32(architecture.memorySize)
    .writeUint32(architecture.outputSize)
    .writeUint32(weights.length)
  for (const weight of weights) hasher.writeFloat64(weight)
  // Schema v6: the body genes follow the brain weights (docs/decisions/0012).
  hasher.writeUint32(genome.body.genes.length)
  for (const gene of genome.body.genes) hasher.writeFloat64(gene)
}

/** The upper bound of a gene's range, used to size spatial grids. */
function geneRangeMax(specs: readonly GeneSpec[], path: string): number {
  const spec = specs.find((candidate) => candidate.path === path)
  if (!spec) throw new Error(`missing gene spec ${path}`)
  return spec.max
}
