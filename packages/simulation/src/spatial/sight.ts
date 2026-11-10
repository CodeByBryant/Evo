/**
 * Line of sight (ADR 0016 "Line of sight"): whether a round body stands in the way of what a
 * creature is looking at. Pure arithmetic: `+ - * /` only, so it is identical on every platform.
 */

/**
 * The widest body any creature can have, in world units, plus a margin: blockers are looked for
 * this far beyond the half-length of the line of sight. The largest body radius is the gene range
 * maximum (10) times the outline's size factor (below 2), so 20 never misses one.
 */
export const SIGHT_BLOCKER_MARGIN = 20

/**
 * Whether the straight line from the eye at (`ox`, `oy`) to the target at (`tx`, `ty`) passes
 * through the circle of radius `r` centred at (`cx`, `cy`).
 *
 * - The closest point of the segment to the centre decides: blocked when it is nearer than `r`.
 * - A circle behind the eye or beyond the target does not block (the closest point is clamped to
 *   the segment's ends, which are then outside the circle unless the target is inside it).
 * - A target inside the circle is blocked (food under another creature is hidden).
 * - A circle that already holds the eye does not block: a creature overlapping another body is not
 *   blinded by it (bodies do not push each other apart).
 */
export function segmentHitsCircle(
  ox: number,
  oy: number,
  tx: number,
  ty: number,
  cx: number,
  cy: number,
  r: number
): boolean {
  const px = cx - ox
  const py = cy - oy
  const radiusSquared = r * r
  if (px * px + py * py < radiusSquared) return false
  const dx = tx - ox
  const dy = ty - oy
  const lengthSquared = dx * dx + dy * dy
  let t = lengthSquared > 0 ? (px * dx + py * dy) / lengthSquared : 0
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const qx = ox + dx * t - cx
  const qy = oy + dy * t - cy
  return qx * qx + qy * qy < radiusSquared
}
