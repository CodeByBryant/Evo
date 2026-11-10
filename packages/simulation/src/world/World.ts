import { resolveWorldConfig, validateSeed } from '@evo/config'
import { ACTION_SIZE, OBSERVATION_SIZE, visualGeneIndex } from '@evo/contracts'
import type {
  AnatomyView,
  BrainSnapshot,
  Capabilities,
  ClusterLayoutSnapshot,
  ClusterReport,
  EntityId,
  Genome,
  HazardSnapshot,
  HistoricalOrganismRecord,
  MigrationSummary,
  RegionType,
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
  PeerBuffer,
  PerceptionBuffer,
  RegenBuffer
} from '../buffers/types'
import type { ClockState } from '../clock/SimulationClock'
import { SimulationClock } from '../clock/SimulationClock'
import { EcologyModel } from '../ecology/EcologyModel'
import { HazardStore } from '../ecology/HazardStore'
import { MigrationTracker } from '../ecology/MigrationTracker'
import { ClusterTerrain } from '../ecology/ClusterTerrain'
import { RegionMap } from '../ecology/RegionMap'
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
import { ResourceStore } from '../entities/ResourceStore'
import { EventLog } from '../events/EventLog'
import { capabilitiesOf, viewOf } from '../development/capabilities'
import { developAnatomy } from '../development/develop'
import { buildBodySpecs, founderBodyVector } from '../genetics/BodyGenes'
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
import { RandomStreams, STREAM_NAMES } from '../random/streams'
import { SpeciesRegistry } from '../species/SpeciesRegistry'
import type { SpeciesQueries } from '../species/SpeciesRegistry'
import { StateHasher } from '../serialization/hash'
import { SpatialHash } from '../spatial/SpatialHash'
import { BrainSystem } from '../systems/BrainSystem'
import { DeathSystem } from '../systems/DeathSystem'
import { DecisionSystem } from '../systems/DecisionSystem'
import { EnvironmentSystem } from '../systems/EnvironmentSystem'
import { HealthSystem } from '../systems/HealthSystem'
import { MigrationSystem } from '../systems/MigrationSystem'
import { DigestionSystem } from '../systems/DigestionSystem'
import { InteractionSystem } from '../systems/InteractionSystem'
import { MetabolismSystem } from '../systems/MetabolismSystem'
import { MovementSystem } from '../systems/MovementSystem'
import { PerceptionSystem } from '../systems/PerceptionSystem'
import { ReproductionSystem } from '../systems/ReproductionSystem'
import { ClusterLayout } from '../ecology/ClusterLayout'
import { effectiveConfig } from './clusterScaling'
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
  private readonly resources: ResourceStore
  private readonly metricsCollector: MetricsCollector
  private readonly resourceIndex: SpatialHash<ResourceState>
  private readonly organismIndex: SpatialHash<OrganismState>
  private readonly historyStore: HistoryStore
  private readonly lineageStore: LineageStore
  private readonly speciesRegistry: SpeciesRegistry
  private readonly regionMap: RegionMap | null
  private readonly clusters: ClusterLayout | null
  private readonly clusterTerrain: ClusterTerrain | null
  private readonly ecology: EcologyModel
  private readonly hazardStore: HazardStore
  private readonly migrationTracker: MigrationTracker
  private readonly geneSpecs: GeneSpec[]
  private readonly bodySpecs: GeneSpec[]
  private readonly founderBody: number[]
  private readonly founderCapabilities: Capabilities
  private readonly genomeIds: IdGenerator
  private readonly perceptionBuffer: PerceptionBuffer = new Map()
  private readonly peerBuffer: PeerBuffer = new Map()
  private readonly intentBuffer: IntentBuffer = new Map()
  private readonly hazardBuffer: HazardBuffer = new Map()
  private readonly mateBuffer: MateBuffer = new Map()
  private readonly damageBuffer: DamageBuffer = new Map()
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
    this.config = effectiveConfig(resolveWorldConfig(options.config))
    this.validateEveryTicks = options.validateEveryTicks

    this.clockImpl = new SimulationClock(this.config.timestep)
    this.ids = new IdGenerator()
    this.genomeIds = new IdGenerator()
    this.geneSpecs = buildGeneSpecs(this.config)
    this.bodySpecs = buildBodySpecs(this.config.anatomy)
    this.founderBody = founderBodyVector(this.config.anatomy)
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
      this.clusters === null ? null : () => this.livingPerCluster()
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
              !this.config.species.enabled ||
              !this.config.species.reproductiveIsolation ||
              this.speciesRegistry.speciesOf(a.id) === this.speciesRegistry.speciesOf(b.id)
          }
        : undefined,
      // Creatures' bodies hide what is behind them (ADR 0016 "Line of sight").
      this.config.perception.organismsBlockSight ? { organismIndex: this.organismIndex } : undefined
    )
    this.decisionSystem = new DecisionSystem(
      this.config,
      this.organisms,
      this.perceptionBuffer,
      this.intentBuffer,
      this.randomStreams.get('world')
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
      this.mateBuffer
    )
    this.movementSystem = new MovementSystem(
      this.config,
      this.organisms,
      this.intentBuffer,
      this.events,
      this.ecology
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
      this.damageBuffer
    )
    this.digestionSystem = new DigestionSystem(this.config, this.organisms, this.events)
    this.healthSystem = new HealthSystem(
      this.config,
      this.organisms,
      this.hazardStore,
      this.damageBuffer,
      this.regenBuffer,
      this.events,
      this.ecology
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
      this.ecology
    )
    this.deathSystem = new DeathSystem(
      this.organisms,
      this.events,
      this.historyStore,
      this.lineageStore,
      this.speciesRegistry,
      this.migrationTracker
    )

    this.events.beginTick()
    this.environmentSystem.placeStaticHazards(0, this.randomStreams.get('terrain'))
    this.spawnInitialPopulation()
    this.metricsCollector.recordEvents(this.events.eventsThisTick())
    this.metricsCollector.updatePopulation(this.organisms.size, 0)
    this.speciesRegistry.observe(0)
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
    // In the cluster layout the founders are planned first (a body of genes per species), then
    // placed species by species inside their home cluster (docs/decisions/0014).
    const clusters = this.clusters
    const plans: FounderPlan[] =
      clusters === null
        ? []
        : planClusterFounders(
            this.geneSpecs,
            this.founderBody,
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
      const genome = createFounderGenome(
        this.genomeIds.allocate(),
        this.geneSpecs,
        this.config.genetics.brain,
        geneticsRandom,
        plan === undefined ? this.founderBody : plan.body,
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
            : null
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
      }
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
    this.deathSystem.update(tick)
    if (this.config.learning.controller === 'brain') this.brainSystem.settle(tick)

    this.metricsCollector.recordEvents(this.events.eventsThisTick())
    this.metricsCollector.updatePopulation(this.organisms.size, tick)
    this.speciesRegistry.observe(tick)

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
        gutCapacity: this.config.feeding.enabled ? gutCapacityOf(organism.genome, this.config) : 0
      })),
      resources: this.resources.values().map((resource) => ({
        id: resource.id,
        position: { x: resource.x, y: resource.y },
        radius: this.ecology.kind(resource.kind).radius,
        energyValue: this.ecology.kind(resource.kind).energy,
        remaining: resource.remaining,
        kind: resource.kind
      })),
      hazards: this.hazardSnapshots(),
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

      const genome = organism.genome
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

    return hasher.digest()
  }
}

/** The upper bound of a gene's range, used to size spatial grids. */
function geneRangeMax(specs: readonly GeneSpec[], path: string): number {
  const spec = specs.find((candidate) => candidate.path === path)
  if (!spec) throw new Error(`missing gene spec ${path}`)
  return spec.max
}
