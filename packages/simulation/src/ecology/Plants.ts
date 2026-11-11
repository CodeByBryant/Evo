import { cos, sin } from '../math/trig'
import { MAX_NODES } from '../entities/ResourceStore'

/**
 * Plant geometry (ADR 0021), pure and draw-free: where a node sits around its hub, and which node a
 * hub is growing next. The angle of the first node comes from a hash of the hub's id, so every
 * plant is turned a little differently and nothing is drawn from a random stream.
 */

const TWO_PI = Math.PI * 2

/** The turn of a hub's ring, in radians `[0, 2 pi)`, from its id. */
export function ringPhase(hubId: number): number {
  let h = Math.imul(hubId | 0, 0x9e3779b1)
  h ^= h >>> 15
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  return ((h >>> 0) / 4294967296) * TWO_PI
}

/**
 * Where node `slot` (1 to `MAX_NODES`) of the hub at `(x, y)` sits: `distance` from the hub, the
 * slots spread evenly round the ring starting at the hub's phase, clamped into the world.
 */
export function nodePosition(
  hub: { readonly id: number; readonly x: number; readonly y: number },
  slot: number,
  nodes: number,
  distance: number,
  width: number,
  height: number
): { x: number; y: number } {
  const angle = ringPhase(hub.id) + ((slot - 1) / Math.max(1, nodes)) * TWO_PI
  const x = hub.x + distance * cos(angle)
  const y = hub.y + distance * sin(angle)
  return {
    x: Math.min(width, Math.max(0, x)),
    y: Math.min(height, Math.max(0, y))
  }
}

/** The lowest node slot in `1..nodes` that is not set in `present` (a bit per slot), or `0` when all are. */
export function missingSlot(present: number, nodes: number): number {
  for (let slot = 1; slot <= Math.min(nodes, MAX_NODES); slot++) {
    if ((present & (1 << slot)) === 0) return slot
  }
  return 0
}
