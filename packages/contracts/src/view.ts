import type { EntityId } from './entity'
import type { LifeStage } from './organism'
import type { MigrationSummary, RegionType, Season } from './ecology'
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

export interface PopulationPoint {
  readonly tick: number
  readonly count: number
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
  }
  readonly genome: readonly GeneRow[]
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
  /** Sampled population over the run, oldest first. */
  readonly populationHistory: readonly PopulationPoint[]
  /** Living species, largest first. */
  readonly species: readonly SpeciesRow[]
  readonly activeSpecies: number
  /** Species that have gone extinct so far (their rows are not sent). */
  readonly extinctSpecies: number
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
