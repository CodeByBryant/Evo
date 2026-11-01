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
  readonly effects?: readonly RenderEffect[]
}

const ratio = (value: number, capacity: number): number =>
  capacity > 0 ? clamp(value / capacity, 0, 1) : 0

function organismOf(organism: OrganismSnapshot, selectedId: EntityId | null): RenderOrganism {
  const hue = speciesHue(organism.speciesId)
  return {
    id: organism.id,
    x: organism.position.x,
    y: organism.position.y,
    rotation: organism.heading,
    radius: organism.radius,
    hue,
    speciesColor: hslToHex(hue),
    speciesId: organism.speciesId,
    lifeStage: organism.lifeStage,
    energyRatio: ratio(organism.energy, organism.maxEnergy),
    healthRatio: ratio(organism.health, organism.maxHealth),
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
    organisms: world.organisms.map((organism) => organismOf(organism, context.selectedId)),
    resources: world.resources.map((resource) => ({
      id: resource.id,
      x: resource.position.x,
      y: resource.position.y,
      radius: resource.radius,
      kind: resource.kind,
      remainingRatio: ratio(resource.remaining, resource.energyValue)
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
