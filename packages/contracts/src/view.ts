import type { PartType } from './anatomy'
import type { EntityId } from './entity'
import type { LifeStage } from './organism'
import type { ClusterReport, MigrationSummary, RegionType, Season } from './ecology'
import type { MetricsSnapshot } from './snapshots'
import type { SpeciesId } from './species'
import type { RenderLayerName, RenderLayers } from './render'

/**
 * What the user interface shows and what it may ask for (docs/decisions/0011). The UI receives a
 * `ViewState` a few times a second and calls `SimulationControls`; it never sees the engine and
 * never mutates it.
 */

/** Simulation speed as a multiple of real time (10 ticks per second), or as fast as the frame budget allows. */
export type SpeedSetting = 1 | 5 | 25 | 100 | 'max'
export const SPEED_SETTINGS: readonly SpeedSetting[] = [1, 5, 25, 100, 'max']

export type RunStatus = 'running' | 'paused' | 'extinct'

export interface PresetOption {
  readonly name: string
  readonly label: string
  readonly description: string
}

/**
 * One sample of the run's history. Every series is sampled at the same ticks, so they line up; the
 * death counters are cumulative (a rate is a difference over `time`, see the interface's helpers).
 */
export interface HistoryPoint {
  readonly tick: number
  /** Simulated seconds. */
  readonly time: number
  /** Living organisms. */
  readonly count: number
  /** Living species. */
  readonly species: number
  /** Food items in the world. */
  readonly food: number
  /** Deaths since the start, by cause. */
  readonly starved: number
  readonly aged: number
  readonly damaged: number
}

export interface SpeciesRow {
  readonly id: SpeciesId
  readonly color: string
  readonly members: number
  readonly createdAtTick: number
  readonly extinctAtTick: number | null
  readonly ancestorId: SpeciesId | null
  /** Recent living-member counts, oldest first. */
  readonly history: readonly number[]
}

export interface GeneRow {
  readonly group: string
  readonly name: string
  readonly value: number
}

export interface LabelledValue {
  readonly label: string
  readonly value: number
}

export interface InspectorBrain {
  readonly inputs: readonly LabelledValue[]
  readonly outputs: readonly LabelledValue[]
  readonly actions: readonly LabelledValue[]
  readonly value: number
  readonly reward: readonly LabelledValue[]
  readonly rewardTotal: number
  readonly updates: number
  readonly weightChange: number
}

/** One part in the inspector's anatomy tab; positions are in body-radius units (front along +x). */
export interface InspectorPart {
  readonly slot: number
  readonly type: PartType
  /** The slot this part hangs from, or `-1` when it attaches to the body. */
  readonly parent: number
  readonly size: number
  readonly x: number
  readonly y: number
  /** Where the far end of the part is (equal to the anchor for a part with no length). */
  readonly tipX: number
  readonly tipY: number
  readonly orientation: number
  readonly functional: boolean
  /** What a working eye sees, in world units (`half` in radians, pi for all round); `null` for any other part. */
  readonly sight: { readonly half: number; readonly reach: number } | null
  /** Developmental quality in `[0.1, 1]`. */
  readonly integrity: number
  /** What the part adds to the body's mass and upkeep (energy per second); a dormant part still counts. */
  readonly mass: number
  readonly upkeep: number
  /** The part's named stats in real units (`PART_STATS`), in table order. */
  readonly stats: readonly InspectorStat[]
}

/** One named stat of a part: its label, its value in real units and the unit. */
export interface InspectorStat {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly unit: string
}

/** The selected organism's body: its outline, parts and what they do (ADR 0015). */
export interface InspectorAnatomy {
  /** The outline as `x0, y0, x1, y1, ...` in body-radius units. */
  readonly outline: readonly number[]
  readonly parts: readonly InspectorPart[]
  /** Slots that carry a part that did not develop because the structural budget was spent. */
  readonly undeveloped: readonly number[]
  readonly sizeUsed: number
  readonly budget: number
  /** What the body does relative to the founder body (1 is the founder), and what it costs. */
  readonly capabilities: readonly LabelledValue[]
}

/** One selected organism, as the inspector tabs show it. */
export interface InspectorView {
  readonly id: EntityId
  readonly speciesId: SpeciesId | null
  readonly speciesColor: string
  readonly overview: {
    readonly lifeStage: LifeStage
    readonly age: number
    readonly maxAge: number
    readonly energy: number
    readonly maxEnergy: number
    readonly health: number
    readonly maxHealth: number
    readonly x: number
    readonly y: number
    readonly cooldown: number
    /** Food bitten and not yet absorbed (ADR 0017). */
    readonly gut: number
    /** Gut capacity; zero when feeding is off, so the interface shows no gut. */
    readonly gutCapacity: number
  }
  readonly genome: readonly GeneRow[]
  /** The body, or `null` when the organism is not known to the world. */
  readonly anatomy: InspectorAnatomy | null
  /** `null` under the reflex controller. */
  readonly brain: InspectorBrain | null
  readonly lineage: {
    readonly parentIds: readonly EntityId[]
    readonly genomeId: number
    readonly ancestorGenomes: number
    readonly descendantGenomes: number
    readonly speciesAncestry: readonly SpeciesId[]
  }
  readonly environment: {
    readonly regionType: RegionType | null
    readonly season: Season | null
    readonly migration: MigrationSummary | null
  }
}

export interface ViewState {
  readonly status: RunStatus
  readonly seed: number
  readonly preset: string
  readonly presets: readonly PresetOption[]
  readonly speed: SpeedSetting
  /** Ticks per second actually achieved over the last second (0 while paused). */
  readonly achievedTicksPerSecond: number
  readonly tick: number
  /** Simulated seconds. */
  readonly time: number
  readonly season: Season | null
  readonly population: number
  readonly resources: number
  readonly extinctionTick: number | null
  readonly metrics: MetricsSnapshot
  /** Sampled history of the run (population, species, food, deaths), oldest first. */
  readonly history: readonly HistoryPoint[]
  /** Living species, largest first. */
  readonly species: readonly SpeciesRow[]
  readonly activeSpecies: number
  /** Species that have gone extinct so far (their rows are not sent). */
  readonly extinctSpecies: number
  /** Where the living organisms are in the cluster layout; `null` in the field layout. */
  readonly clusters: ClusterReport | null
  readonly layers: RenderLayers
  readonly following: boolean
  readonly selected: InspectorView | null
  readonly selectedId: EntityId | null
}

/** Everything the UI may ask of the application. */
export interface SimulationControls {
  start(): void
  pause(): void
  toggle(): void
  /** Advances exactly this many ticks (default 1) while paused. */
  step(ticks?: number): void
  /** Starts the same seed and preset again. */
  reset(): void
  /** Starts a new world; a random seed when none is given. */
  newWorld(seed?: number): void
  setSpeed(speed: SpeedSetting): void
  setPreset(name: string): void
  select(id: EntityId | null): void
  setLayer(layer: RenderLayerName, on: boolean): void
  focusSelected(): void
  toggleFollow(): void
  fitWorld(): void
}
