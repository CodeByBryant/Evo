import type {
  EntityId,
  OrganismSnapshot,
  RenderEffect,
  RenderOrganism,
  RenderSnapshot,
  Season,
  WorldSnapshot
} from '@evo/contracts'
import { clamp } from './camera'
import { hslToHex, speciesHue } from './colors'

export interface RenderContext {
  readonly worldWidth: number
  readonly worldHeight: number
  readonly season: Season | null
  readonly selectedId: EntityId | null
  /** Color creatures by their `hue` gene (the cluster layout's colour families) instead of by species. */
  readonly colorByHue?: boolean
  /** The founder's top speed, so a creature's `speedRatio` is its speed over it (default 1: raw speed). */
  readonly baselineSpeed?: number
  readonly effects?: readonly RenderEffect[]
}

const ratio = (value: number, capacity: number): number =>
  capacity > 0 ? clamp(value / capacity, 0, 1) : 0

function organismOf(
  organism: OrganismSnapshot,
  selectedId: EntityId | null,
  colorByHue: boolean,
  baselineSpeed: number
): RenderOrganism {
  const hue = colorByHue ? organism.hue * 360 : speciesHue(organism.speciesId)
  return {
    id: organism.id,
    x: organism.position.x,
    y: organism.position.y,
    rotation: organism.heading,
    radius: organism.radius,
    outline: organism.outline,
    parts: organism.parts,
    pattern: organism.pattern,
    accentColor: hslToHex(organism.accentHue * 360, 0.85, 0.7),
    hue,
    speciesColor: hslToHex(hue),
    speciesId: organism.speciesId,
    lifeStage: organism.lifeStage,
    energyRatio: ratio(organism.energy, organism.maxEnergy),
    healthRatio: ratio(organism.health, organism.maxHealth),
    speedRatio:
      baselineSpeed > 0 ? Math.hypot(organism.velocity.x, organism.velocity.y) / baselineSpeed : 0,
    selected: organism.id === selectedId
  }
}

/**
 * Maps an engine snapshot to what the renderer draws (roadmap 7.2). Pure: it reads the snapshot and
 * returns new objects, so nothing the renderer does can reach the engine.
 */
export function buildRenderSnapshot(world: WorldSnapshot, context: RenderContext): RenderSnapshot {
  return {
    tick: world.tick,
    time: world.time,
    worldWidth: context.worldWidth,
    worldHeight: context.worldHeight,
    season: context.season,
    organisms: world.organisms.map((organism) =>
      organismOf(
        organism,
        context.selectedId,
        context.colorByHue === true,
        context.baselineSpeed ?? 1
      )
    ),
    resources: world.resources.map((resource) => ({
      id: resource.id,
      x: resource.position.x,
      y: resource.position.y,
      radius: resource.radius,
      kind: resource.kind,
      remainingRatio: ratio(resource.remaining, resource.energyValue),
      // A plant's links (ADR 0021): only present when the world has plants.
      ...(resource.slot === undefined
        ? {}
        : { parent: resource.parent ?? 0, slot: resource.slot, bud: resource.bud ?? null })
    })),
    hazards: world.hazards.map((hazard) => ({
      id: hazard.id,
      kind: hazard.kind,
      x: hazard.position.x,
      y: hazard.position.y,
      radius: hazard.radius
    })),
    effects: context.effects ?? [],
    selectedEntityId: context.selectedId
  }
}
