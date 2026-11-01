import type { EntityId, RenderOrganism } from '@evo/contracts'

/**
 * The organism a click selects: the nearest one whose body, grown by a pixel tolerance, contains
 * the point. `tolerancePx / zoom` converts the tolerance to world units, so a small organism stays
 * easy to hit when zoomed out and a touch gets a larger tolerance than a mouse. Ties go to the
 * lower id, matching the engine's own rule. Returns `null` for empty space.
 */
export function pickOrganism(
  organisms: readonly RenderOrganism[],
  worldX: number,
  worldY: number,
  zoom: number,
  tolerancePx = 8
): EntityId | null {
  const slack = tolerancePx / zoom
  let best: EntityId | null = null
  let bestDistance = Infinity
  for (const organism of organisms) {
    const dx = organism.x - worldX
    const dy = organism.y - worldY
    const reach = organism.radius + slack
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared > reach * reach) continue
    if (
      distanceSquared < bestDistance ||
      (distanceSquared === bestDistance && best !== null && organism.id < best)
    ) {
      bestDistance = distanceSquared
      best = organism.id
    }
  }
  return best
}
