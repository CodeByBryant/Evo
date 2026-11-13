import type { EntityId, WorldConfig } from '@evo/contracts'
import type { EggState } from '../entities/EggStore'
import type { OrganismState, OrganismStore } from '../entities/OrganismStore'

/** The size of an egg as a bite target: as big as a piece of food. */
export function eggRadiusOf(config: WorldConfig): number {
  return config.resources.radius
}

/**
 * The living parents of `egg` that are guarding it (ADR 0027): within `guardRadius` of it right now,
 * mother first. A dead or distant parent guards nothing.
 */
export function guardsOf(
  egg: EggState,
  organisms: OrganismStore,
  guardRadius: number
): OrganismState[] {
  const guards: OrganismState[] = []
  const limit = guardRadius * guardRadius
  for (const id of [egg.motherId, egg.fatherId] as readonly EntityId[]) {
    const parent = organisms.get(id)
    if (parent === undefined || parent.health <= 0) continue
    const dx = parent.x - egg.x
    const dy = parent.y - egg.y
    if (dx * dx + dy * dy <= limit) guards.push(parent)
  }
  return guards
}
