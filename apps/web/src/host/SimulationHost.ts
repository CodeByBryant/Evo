import { DEFAULT_PRESET, PRESETS } from '@evo/config'
import type { WorldPreset } from '@evo/config'
import { DEFAULT_RENDER_LAYERS } from '@evo/contracts'
import type {
  EntityId,
  InspectorView,
  PopulationPoint,
  PresetOption,
  RenderEffect,
  RenderLayerName,
  RenderLayers,
  RenderSnapshot,
  SimulationControls,
  SpeciesRow,
  SpeedSetting,
  TerrainSnapshot,
  ViewState,
  WorldSnapshot
} from '@evo/contracts'
import { buildRenderSnapshot } from '@evo/renderer'
import { World } from '@evo/simulation'
import { buildInspector, buildSpeciesRows, buildViewState, lineageCounts } from './viewState'

/** Real time is 10 ticks a second (`timestep` 0.1 s), so `1x` means 10 ticks per second. */
export const TICKS_PER_SECOND_AT_1X = 10
/** Ticks a birth, death or damage marker stays in the render snapshot. */
const EFFECT_TICKS = 14
const MAX_EFFECTS = 300
const HISTORY_CAP = 600
const LINEAGE_REFRESH_MS = 3000
/** `step()` stops after this many ticks even if asked for more, so a click can never freeze the page. */
const MAX_STEP_TICKS = 2000

/** The few things the host needs from the outside world, injected so it is testable without a browser. */
export interface HostEnvironment {
  /** Milliseconds, monotonic. */
  now(): number
  requestFrame(callback: () => void): number
  cancelFrame(handle: number): void
  /** A fresh random seed in `[0, MAX_SEED]`. */
  randomSeed(): number
}

/** What the host asks of the renderer's camera; the renderer is not known to the host otherwise. */
export interface ViewportHandle {
  focusSelected(): void
  setFollow(follow: boolean): void
  fitWorld(): void
}

export interface WorldInfo {
  readonly width: number
  readonly height: number
  readonly terrain: TerrainSnapshot | null
}

export interface HostOptions {
  readonly env: HostEnvironment
  readonly seed?: number
  readonly preset?: string
  /** The presets on offer (default: those in `@evo/config`); tests pass their own. */
  readonly presets?: readonly WorldPreset[]
  readonly speed?: SpeedSetting
  readonly layers?: RenderLayers
  readonly autoStart?: boolean
  /** Milliseconds of stepping allowed per animation frame. */
  readonly stepBudgetMs?: number
  /** Minimum milliseconds between updates of the interface state. */
  readonly viewIntervalMs?: number
  readonly speciesIntervalMs?: number
  readonly onWorldChange?: (seed: number, preset: string) => void
}

/**
 * The only owner of the `World` (docs/decisions/0011). It advances the world in time-sliced
 * batches, derives a `RenderSnapshot` for the renderer every time the world has moved, and derives
 * a `ViewState` for the interface at a low fixed rate. The interface asks for things through
 * `SimulationControls`; nothing outside this class can reach the engine, and nothing it publishes
 * aliases engine state.
 */
export class SimulationHost implements SimulationControls {
  private readonly env: HostEnvironment
  private readonly stepBudgetMs: number
  private readonly viewIntervalMs: number
  private readonly speciesIntervalMs: number
  private readonly onWorldChange: ((seed: number, preset: string) => void) | undefined
  private readonly presetList: readonly WorldPreset[]
  private readonly presets: readonly PresetOption[]

  private world!: World
  private seed = 0
  private preset = DEFAULT_PRESET
  private speed: SpeedSetting
  private layers: RenderLayers
  private following = false
  private selectedId: EntityId | null = null
  private running = false
  private disposed = false
  private frameHandle: number | null = null
  private lastFrameAt = 0
  private accumulator = 0

  private worldInfo!: WorldInfo
  private latestWorld!: WorldSnapshot
  private latestFrame!: RenderSnapshot
  private effects: RenderEffect[] = []
  /** When each organism last showed a damage marker, so one is not drawn every tick it stays in a hazard. */
  private lastDamageMarker = new Map<EntityId, number>()
  private history: PopulationPoint[] = []
  private sampleEvery = 50
  private lastSampledTick = -Infinity

  private view!: ViewState
  private lastViewAt = -Infinity
  private speciesCache: { rows: readonly SpeciesRow[]; extinct: number } = { rows: [], extinct: 0 }
  private speciesAt = -Infinity
  private lineageCache: {
    id: EntityId
    counts: { ancestors: number; descendants: number }
    at: number
  } | null = null
  private inspector: InspectorView | null = null

  private rateWindowStart = 0
  private rateWindowTicks = 0
  private achieved = 0

  private viewport: ViewportHandle | null = null
  private readonly frameListeners = new Set<(frame: RenderSnapshot) => void>()
  private readonly worldListeners = new Set<(info: WorldInfo) => void>()
  private readonly storeListeners = new Set<() => void>()

  constructor(options: HostOptions) {
    this.env = options.env
    this.stepBudgetMs = options.stepBudgetMs ?? 10
    this.viewIntervalMs = options.viewIntervalMs ?? 125
    this.speciesIntervalMs = options.speciesIntervalMs ?? 1000
    this.onWorldChange = options.onWorldChange
    this.presetList = options.presets ?? PRESETS
    this.presets = this.presetList.map((p) => ({
      name: p.name,
      label: p.label,
      description: p.description
    }))
    this.speed = options.speed ?? 5
    this.layers = options.layers ?? DEFAULT_RENDER_LAYERS
    const preset =
      options.preset !== undefined && this.findPreset(options.preset)
        ? options.preset
        : DEFAULT_PRESET
    // The interface hands these out as plain callbacks (`onClick={controls.toggle}`), so they must
    // not depend on how they are called.
    this.start = this.start.bind(this)
    this.pause = this.pause.bind(this)
    this.toggle = this.toggle.bind(this)
    this.step = this.step.bind(this)
    this.reset = this.reset.bind(this)
    this.newWorld = this.newWorld.bind(this)
    this.setSpeed = this.setSpeed.bind(this)
    this.setPreset = this.setPreset.bind(this)
    this.select = this.select.bind(this)
    this.setLayer = this.setLayer.bind(this)
    this.focusSelected = this.focusSelected.bind(this)
    this.toggleFollow = this.toggleFollow.bind(this)
    this.fitWorld = this.fitWorld.bind(this)
    this.createWorld(options.seed ?? this.env.randomSeed(), preset)
    if (options.autoStart ?? true) this.start()
  }

  // ---- what the interface and renderer read ----------------------------------------------

  /** A stable reference between updates: `useSyncExternalStore` compares it by identity. */
  getViewState(): ViewState {
    return this.view
  }

  subscribe(listener: () => void): () => void {
    this.storeListeners.add(listener)
    return () => this.storeListeners.delete(listener)
  }

  getFrame(): RenderSnapshot {
    return this.latestFrame
  }

  getWorldInfo(): WorldInfo {
    return this.worldInfo
  }

  onFrame(listener: (frame: RenderSnapshot) => void): () => void {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  onWorld(listener: (info: WorldInfo) => void): () => void {
    this.worldListeners.add(listener)
    return () => this.worldListeners.delete(listener)
  }

  attachViewport(handle: ViewportHandle | null): void {
    this.viewport = handle
  }

  /** The renderer reports that the user dragged the view, which stops following. */
  notifyFollowStopped(): void {
    if (!this.following) return
    this.following = false
    this.publishView(true)
  }

  /** The state hash, for tests and debugging only: it is far too slow for the frame path. */
  stateHash(): string {
    return this.world.stateHash()
  }

  get isRunning(): boolean {
    return this.running
  }

  dispose(): void {
    this.disposed = true
    this.pause()
    this.frameListeners.clear()
    this.worldListeners.clear()
    this.storeListeners.clear()
  }

  // ---- SimulationControls ----------------------------------------------------------------

  start(): void {
    if (this.disposed || this.running || this.world.isExtinct) return
    this.running = true
    this.lastFrameAt = this.env.now()
    this.rateWindowStart = this.lastFrameAt
    this.rateWindowTicks = 0
    this.scheduleFrame()
    this.publishView(true)
  }

  pause(): void {
    if (!this.running && this.frameHandle === null) return
    this.running = false
    if (this.frameHandle !== null) {
      this.env.cancelFrame(this.frameHandle)
      this.frameHandle = null
    }
    this.achieved = 0
    this.publishView(true)
  }

  toggle(): void {
    if (this.running) this.pause()
    else this.start()
  }

  step(ticks = 1): void {
    if (this.world.isExtinct) return
    if (this.running) this.pause()
    const count = Math.max(1, Math.min(MAX_STEP_TICKS, Math.floor(ticks)))
    for (let i = 0; i < count && !this.world.isExtinct; i++) this.stepOnce()
    this.publishFrame(true)
  }

  reset(): void {
    this.createWorld(this.seed, this.preset)
    this.start()
  }

  newWorld(seed?: number): void {
    this.createWorld(seed ?? this.env.randomSeed(), this.preset)
    this.start()
  }

  setSpeed(speed: SpeedSetting): void {
    this.speed = speed
    this.accumulator = 0
    this.publishView(true)
  }

  setPreset(name: string): void {
    if (this.findPreset(name) === undefined || name === this.preset) return
    this.createWorld(this.seed, name)
    this.start()
  }

  select(id: EntityId | null): void {
    if (id === this.selectedId) return
    this.selectedId = id
    if (id === null && this.following) {
      this.following = false
      this.viewport?.setFollow(false)
    }
    this.lineageCache = null
    this.rebuildFrame()
    this.publishView(true)
  }

  setLayer(layer: RenderLayerName, on: boolean): void {
    if (this.layers[layer] === on) return
    this.layers = { ...this.layers, [layer]: on }
    this.publishView(true)
  }

  focusSelected(): void {
    if (this.selectedId !== null) this.viewport?.focusSelected()
  }

  toggleFollow(): void {
    if (this.selectedId === null && !this.following) return
    this.following = !this.following
    this.viewport?.setFollow(this.following)
    this.publishView(true)
  }

  fitWorld(): void {
    this.viewport?.fitWorld()
  }

  private findPreset(name: string): WorldPreset | undefined {
    return this.presetList.find((preset) => preset.name === name)
  }

  // ---- internals -------------------------------------------------------------------------

  private createWorld(seed: number, presetName: string): void {
    const preset = this.findPreset(presetName) ?? this.findPreset(DEFAULT_PRESET)
    this.seed = seed
    this.preset = preset?.name ?? DEFAULT_PRESET
    this.world = World.create({ seed, config: preset?.overrides ?? {} })
    this.selectedId = null
    this.following = false
    this.viewport?.setFollow(false)
    this.effects = []
    this.lastDamageMarker = new Map()
    this.history = []
    this.sampleEvery = 50
    this.lastSampledTick = -Infinity
    this.accumulator = 0
    this.speciesAt = -Infinity
    this.lineageCache = null
    this.inspector = null
    this.achieved = 0
    this.running = false
    if (this.frameHandle !== null) {
      this.env.cancelFrame(this.frameHandle)
      this.frameHandle = null
    }
    const { width, height } = this.world.config.environment
    this.worldInfo = { width, height, terrain: this.world.terrain() }
    for (const listener of this.worldListeners) listener(this.worldInfo)
    this.publishFrame(true)
    this.onWorldChange?.(this.seed, this.preset)
  }

  private scheduleFrame(): void {
    this.frameHandle = this.env.requestFrame(this.onAnimationFrame)
  }

  private readonly onAnimationFrame = (): void => {
    this.frameHandle = null
    if (!this.running || this.disposed) return
    const now = this.env.now()
    const elapsed = Math.min(now - this.lastFrameAt, 100)
    this.lastFrameAt = now
    const steps = this.advance(elapsed)
    this.recordRate(steps, now)
    if (steps > 0) this.publishFrame(false)
    else this.maybePublishView(now, false)
    if (this.world.isExtinct) {
      this.running = false
      this.achieved = 0
      this.publishView(true)
      return
    }
    if (this.running) this.scheduleFrame()
  }

  /** Steps the world for one animation frame within the time budget; returns the ticks run. */
  private advance(elapsedMs: number): number {
    const perSecond = this.speed === 'max' ? Infinity : this.speed * TICKS_PER_SECOND_AT_1X
    if (this.speed !== 'max') this.accumulator += (elapsedMs / 1000) * perSecond
    const budgetEnd = this.env.now() + this.stepBudgetMs
    let steps = 0
    while (!this.world.isExtinct) {
      if (this.speed !== 'max') {
        if (this.accumulator < 1) break
        this.accumulator -= 1
      }
      this.stepOnce()
      steps++
      if (this.env.now() >= budgetEnd) break
    }
    // Drop any backlog beyond a tenth of a second: a slow frame must not snowball into a freeze.
    if (this.speed !== 'max') this.accumulator = Math.min(this.accumulator, perSecond * 0.1)
    return steps
  }

  private stepOnce(): void {
    this.world.step()
    for (const event of this.world.events.eventsThisTick()) {
      if (event.type === 'organism-born' && event.parentIds.length > 0) {
        this.effects.push({
          kind: 'birth',
          x: event.position.x,
          y: event.position.y,
          tick: event.tick
        })
      } else if (event.type === 'organism-died') {
        this.effects.push({
          kind: 'death',
          x: event.position.x,
          y: event.position.y,
          tick: event.tick
        })
      } else if (event.type === 'organism-damaged') {
        const last = this.lastDamageMarker.get(event.organismId)
        if (last === undefined || event.tick - last >= EFFECT_TICKS) {
          this.lastDamageMarker.set(event.organismId, event.tick)
          this.effects.push({
            kind: 'damage',
            x: event.position.x,
            y: event.position.y,
            tick: event.tick
          })
        }
      }
    }
    const horizon = this.world.clock.tick - EFFECT_TICKS
    if (this.lastDamageMarker.size > 1000) {
      for (const [id, tick] of this.lastDamageMarker) {
        if (tick < horizon) this.lastDamageMarker.delete(id)
      }
    }
    if (this.effects.length > MAX_EFFECTS || (this.effects[0] && this.effects[0].tick < horizon)) {
      this.effects = this.effects.filter((e) => e.tick >= horizon).slice(-MAX_EFFECTS)
    }
  }

  private recordRate(steps: number, now: number): void {
    this.rateWindowTicks += steps
    const span = now - this.rateWindowStart
    if (span >= 1000) {
      this.achieved = (this.rateWindowTicks * 1000) / span
      this.rateWindowStart = now
      this.rateWindowTicks = 0
    }
  }

  /** Takes a snapshot, derives the render frame, tells the renderer, and (rate-limited) the interface. */
  private publishFrame(forceView: boolean): void {
    const snapshot = this.world.snapshot()
    this.latestWorld = snapshot
    this.sampleHistory(snapshot)
    if (
      this.selectedId !== null &&
      !snapshot.organisms.some((organism) => organism.id === this.selectedId)
    ) {
      this.selectedId = null
      if (this.following) {
        this.following = false
        this.viewport?.setFollow(false)
      }
      this.inspector = null
    }
    this.buildAndSendFrame(snapshot)
    this.maybePublishView(this.env.now(), forceView)
  }

  /** Rebuilds the render frame from the last snapshot (selection changed, nothing stepped). */
  private rebuildFrame(): void {
    this.buildAndSendFrame(this.latestWorld)
  }

  private buildAndSendFrame(snapshot: WorldSnapshot): void {
    this.latestFrame = buildRenderSnapshot(snapshot, {
      worldWidth: this.worldInfo.width,
      worldHeight: this.worldInfo.height,
      season: this.world.season,
      selectedId: this.selectedId,
      effects: this.effects.slice()
    })
    for (const listener of this.frameListeners) listener(this.latestFrame)
  }

  private sampleHistory(snapshot: WorldSnapshot): void {
    if (snapshot.tick - this.lastSampledTick < this.sampleEvery) return
    this.lastSampledTick = snapshot.tick
    this.history.push({ tick: snapshot.tick, count: snapshot.population.active })
    if (this.history.length >= HISTORY_CAP) {
      // Keep the whole run in a bounded array: halve the resolution, then sample half as often.
      this.history = this.history.filter((_, index) => index % 2 === 0)
      this.sampleEvery *= 2
    }
  }

  private publishView(force: boolean): void {
    this.maybePublishView(this.env.now(), force)
  }

  private maybePublishView(now: number, force: boolean): void {
    if (this.disposed) return
    if (!force && now - this.lastViewAt < this.viewIntervalMs) return
    this.lastViewAt = now
    if (force || now - this.speciesAt >= this.speciesIntervalMs) {
      this.speciesCache = buildSpeciesRows(this.world)
      this.speciesAt = now
    }
    this.inspector = this.buildSelected(now)
    const status = this.world.isExtinct ? 'extinct' : this.running ? 'running' : 'paused'
    this.view = buildViewState({
      snapshot: this.latestWorld,
      season: this.world.season,
      status,
      seed: this.seed,
      preset: this.preset,
      presets: this.presets,
      speed: this.speed,
      achievedTicksPerSecond: this.achieved,
      populationHistory: this.history,
      species: this.speciesCache,
      layers: this.layers,
      following: this.following,
      selected: this.inspector,
      selectedId: this.selectedId
    })
    for (const listener of this.storeListeners) listener()
  }

  private buildSelected(now: number): InspectorView | null {
    const id = this.selectedId
    if (id === null) return null
    const genome = this.world.genomeOf(id)
    if (genome === undefined) return null
    if (
      this.lineageCache === null ||
      this.lineageCache.id !== id ||
      now - this.lineageCache.at > LINEAGE_REFRESH_MS
    ) {
      this.lineageCache = { id, counts: lineageCounts(this.world, genome.id), at: now }
    }
    return buildInspector(this.world, this.latestWorld, id, this.lineageCache.counts)
  }
}
