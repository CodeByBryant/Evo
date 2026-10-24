import { resolveWorldConfig, validateSeed } from '@evo/config'
import { ACTION_SIZE, OBSERVATION_SIZE } from '@evo/contracts'
import type {
  BrainSnapshot,
  EntityId,
  Genome,
  HistoricalOrganismRecord,
  ValidationResult,
  WorldConfig,
  WorldOptions,
  WorldSnapshot
} from '@evo/contracts'
import type { IntentBuffer, PeerBuffer, PerceptionBuffer } from '../buffers/types'
import type { ClockState } from '../clock/SimulationClock'
import { SimulationClock } from '../clock/SimulationClock'
import { IdGenerator } from '../entities/IdGenerator'
import type { OrganismState } from '../entities/OrganismStore'
import { OrganismStore } from '../entities/OrganismStore'
import { lifeStageFor } from '../organisms/lifeStage'
import type { ResourceState } from '../entities/ResourceStore'
import { ResourceStore } from '../entities/ResourceStore'
import { EventLog } from '../events/EventLog'
import { buildGeneSpecs } from '../genetics/GeneSpecs'
import type { GeneSpec } from '../genetics/GeneSpecs'
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
import { StateHasher } from '../serialization/hash'
import { SpatialHash } from '../spatial/SpatialHash'
import { BrainSystem } from '../systems/BrainSystem'
import { DeathSystem } from '../systems/DeathSystem'
import { DecisionSystem } from '../systems/DecisionSystem'
import { EnvironmentSystem } from '../systems/EnvironmentSystem'
import { InteractionSystem } from '../systems/InteractionSystem'
import { MetabolismSystem } from '../systems/MetabolismSystem'
import { MovementSystem } from '../systems/MovementSystem'
import { PerceptionSystem } from '../systems/PerceptionSystem'
import { ReproductionSystem } from '../systems/ReproductionSystem'
import { checkInvariants } from './invariants'

export interface WorldCreateOptions extends WorldOptions {
  /**
   * When set, `validate()` runs automatically every Nth tick, throwing on the first violation
   * found. Meant for tests and development; leave unset otherwise (docs/simulation/determinism.md
   * describes what is checked).
   */
  validateEveryTicks?: number
}

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
  private readonly geneSpecs: GeneSpec[]
  private readonly genomeIds: IdGenerator
  private readonly perceptionBuffer: PerceptionBuffer = new Map()
  private readonly peerBuffer: PeerBuffer = new Map()
  private readonly intentBuffer: IntentBuffer = new Map()
  private readonly brainLayout: BrainLayout

  private readonly environmentSystem: EnvironmentSystem
  private readonly perceptionSystem: PerceptionSystem
  private readonly decisionSystem: DecisionSystem
  private readonly brainSystem: BrainSystem
  private readonly movementSystem: MovementSystem
  private readonly interactionSystem: InteractionSystem
  private readonly metabolismSystem: MetabolismSystem
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
    this.config = resolveWorldConfig(options.config)
    this.validateEveryTicks = options.validateEveryTicks

    this.clockImpl = new SimulationClock(this.config.timestep)
    this.ids = new IdGenerator()
    this.genomeIds = new IdGenerator()
    this.geneSpecs = buildGeneSpecs(this.config)
    this.randomStreams = new RandomStreams(this.seed)
    this.organisms = new OrganismStore()
    this.resources = new ResourceStore()
    this.events = new EventLog(this.config.history.maxEvents)
    this.metricsCollector = new MetricsCollector()
    // Grid cell sizes are the upper bound of the gene ranges: a query is correct for any cell
    // size, so this only affects efficiency, and it must not depend on an individual genome.
    this.resourceIndex = new SpatialHash<ResourceState>(
      geneRangeMax(this.geneSpecs, 'sensory.sensorRadius'),
      (resource) => resource
    )
    this.organismIndex = new SpatialHash<OrganismState>(
      geneRangeMax(this.geneSpecs, 'reproduction.searchRadius'),
      (organism) => organism
    )
    this.historyStore = new HistoryStore(this.config.history.maxHistoricalOrganisms)
    this.lineageStore = new LineageStore()

    this.environmentSystem = new EnvironmentSystem(
      this.config,
      this.resources,
      this.ids,
      this.randomStreams.get('environment'),
      this.events
    )
    this.brainLayout = brainLayoutOf(architectureOf(this.config.genetics.brain))
    this.perceptionSystem = new PerceptionSystem(
      this.organisms,
      this.resourceIndex,
      this.perceptionBuffer,
      this.config.learning.controller === 'brain'
        ? { organismIndex: this.organismIndex, buffer: this.peerBuffer }
        : undefined
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
      this.randomStreams.get('learning')
    )
    this.movementSystem = new MovementSystem(
      this.config,
      this.organisms,
      this.intentBuffer,
      this.events
    )
    this.interactionSystem = new InteractionSystem(
      this.config,
      this.organisms,
      this.resources,
      this.resourceIndex,
      this.events,
      this.intentBuffer
    )
    this.metabolismSystem = new MetabolismSystem(this.config, this.organisms, this.events)
    this.reproductionSystem = new ReproductionSystem(
      this.config,
      this.organisms,
      this.organismIndex,
      this.ids,
      new GenomeRecombiner(this.geneSpecs, this.config.genetics, () => this.genomeIds.allocate()),
      this.randomStreams.get('genetics'),
      this.lineageStore,
      this.randomStreams.get('reproduction'),
      this.events
    )
    this.deathSystem = new DeathSystem(
      this.organisms,
      this.events,
      this.historyStore,
      this.lineageStore
    )

    this.events.beginTick()
    this.spawnInitialPopulation()
    this.metricsCollector.recordEvents(this.events.eventsThisTick())
    this.metricsCollector.updatePopulation(this.organisms.size, 0)
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
    for (let i = 0; i < this.config.organisms.initialCount; i++) {
      const id = this.ids.allocate()
      const x = worldRandom.float() * width
      const y = worldRandom.float() * height
      const heading = wrapAngle(worldRandom.float() * TWO_PI)
      const genome = createFounderGenome(
        this.genomeIds.allocate(),
        this.geneSpecs,
        this.config.genetics.brain,
        geneticsRandom
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
        parentIds: [],
        birthTick: 0,
        reproductionCooldownRemaining: 0,
        lastTurnMagnitude: 0,
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
      this.events.record({
        type: 'organism-born',
        tick: 0,
        organismId: id,
        genomeId: genome.id,
        parentIds: [],
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
   * The genome of an active organism, or `undefined` if there is no such organism. Genomes are
   * deeply frozen, so the returned object is safe to hold or share.
   */
  genomeOf(organismId: EntityId): Genome | undefined {
    return this.organisms.get(organismId)?.genome
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
    this.perceptionSystem.update()
    if (this.config.learning.controller === 'brain') this.brainSystem.decide()
    else this.decisionSystem.update()
    this.movementSystem.update(tick)
    this.interactionSystem.update(tick)
    this.metabolismSystem.update(tick)
    this.reproductionSystem.update(tick)
    this.deathSystem.update(tick)
    if (this.config.learning.controller === 'brain') this.brainSystem.settle()

    this.metricsCollector.recordEvents(this.events.eventsThisTick())
    this.metricsCollector.updatePopulation(this.organisms.size, tick)

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
      lineage: this.lineageStore
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
        position: { x: organism.x, y: organism.y },
        velocity: { x: organism.vx, y: organism.vy },
        heading: organism.heading,
        radius: organism.genome.physical.radius,
        age: organism.age,
        energy: organism.energy,
        lifeStage: lifeStageFor(organism.age, this.config.organisms),
        reproductionCooldownRemaining: organism.reproductionCooldownRemaining
      })),
      resources: this.resources.values().map((resource) => ({
        id: resource.id,
        position: { x: resource.x, y: resource.y },
        radius: this.config.resources.radius,
        energyValue: this.config.resources.energyValue,
        remaining: resource.remaining
      })),
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
      writeBrainState(hasher, organism.brain)
    }

    const resources = this.resources.values()
    hasher.writeUint32(resources.length)
    for (const resource of resources) {
      hasher
        .writeUint32(resource.id)
        .writeFloat64(resource.x)
        .writeFloat64(resource.y)
        .writeFloat64(resource.remaining)
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

    const extinctionTick = this.metricsCollector.extinctionTick
    hasher.writeBoolean(extinctionTick !== null).writeFloat64(extinctionTick ?? 0)
    hasher.writeFloat64(this.events.emittedCount)

    return hasher.digest()
  }
}

/** The upper bound of a gene's range, used to size spatial grids. */
function geneRangeMax(specs: readonly GeneSpec[], path: string): number {
  const spec = specs.find((candidate) => candidate.path === path)
  if (!spec) throw new Error(`missing gene spec ${path}`)
  return spec.max
}
