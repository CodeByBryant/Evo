import type { EntityId } from './entity'
import type { LifeStage } from './organism'
import type { HazardKind, Season } from './ecology'
import type { SpeciesId } from './species'

/**
 * What the renderer draws, and nothing else (docs/decisions/0011). A `RenderSnapshot` holds display
 * data only: no genomes, no brains, no references into the engine. It is derived from a
 * `WorldSnapshot` once per animation frame and is never mutated by the renderer.
 */

export interface RenderOrganism {
  readonly id: EntityId
  readonly x: number
  readonly y: number
  /** Heading in radians, counter-clockwise from the +x axis. */
  readonly rotation: number
  readonly radius: number
  /** Hue in degrees `[0, 360)`, derived from the species. */
  readonly hue: number
  /** The species color as `#rrggbb`. */
  readonly speciesColor: string
  readonly speciesId: SpeciesId | null
  readonly lifeStage: LifeStage
  /** Energy over capacity, in `[0, 1]`. */
  readonly energyRatio: number
  /** Health over its maximum, in `[0, 1]`. */
  readonly healthRatio: number
  readonly selected: boolean
}

export interface RenderResource {
  readonly id: EntityId
  readonly x: number
  readonly y: number
  readonly radius: number
  /** Index into the resource kinds (0 when kinds are off). */
  readonly kind: number
  /** What is left of the resource, in `[0, 1]`. */
  readonly remainingRatio: number
}

export interface RenderHazard {
  readonly id: number
  readonly kind: HazardKind
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** A short-lived marker for something that just happened (derived from events). */
export interface RenderEffect {
  readonly kind: 'birth' | 'death' | 'damage'
  readonly x: number
  readonly y: number
  /** The tick it happened, so the renderer can fade it out. */
  readonly tick: number
}

export interface RenderSnapshot {
  readonly tick: number
  readonly time: number
  readonly worldWidth: number
  readonly worldHeight: number
  readonly season: Season | null
  readonly organisms: readonly RenderOrganism[]
  readonly resources: readonly RenderResource[]
  readonly hazards: readonly RenderHazard[]
  readonly effects: readonly RenderEffect[]
  readonly selectedEntityId: EntityId | null
}

/** The visual layers, in drawing order (roadmap 7.4). Each can be switched on and off. */
export const RENDER_LAYERS = [
  'grid',
  'terrain',
  'hazards',
  'resources',
  'shadows',
  'organisms',
  'trails',
  'selection',
  'debug'
] as const
export type RenderLayerName = (typeof RENDER_LAYERS)[number]
export type RenderLayers = Readonly<Record<RenderLayerName, boolean>>

export const DEFAULT_RENDER_LAYERS: RenderLayers = {
  grid: true,
  terrain: true,
  hazards: true,
  resources: true,
  shadows: true,
  organisms: true,
  trails: false,
  selection: true,
  debug: false
}
