import type { PartSnapshot, RenderOrganism } from '@evo/contracts'
import { beatRate, phaseOf, stalkSway, tailPoint } from './animation'
import type { TailSpec } from './animation'

/**
 * Where each part is at an animation time (ADR 0016, task "children follow the parent"). A part
 * attached to the body sits at its anchor. A part that hangs from another part is carried by it:
 * it rides the parent's animated centreline at the same fraction along the parent that it was
 * developed at, and keeps its direction relative to the parent. So an eye on a sniffer on a beating
 * tail moves with the tail, instead of hanging in the air where the tail was at rest.
 *
 * Pure arithmetic on the snapshot, no Pixi: the drawing code reads the posed parts and the tests
 * read them directly.
 */

/** The tail a flagellum draws, as a spec: the same one the drawing uses, so a rider stays on it. */
export function tailSpecOf(
  part: PartSnapshot,
  bodyRadius: number,
  time: number,
  phase: number,
  rate: number
): TailSpec {
  const dirX = Math.cos(part.orientation)
  const dirY = Math.sin(part.orientation)
  return {
    baseX: part.x - dirX * bodyRadius * 0.05,
    baseY: part.y - dirY * bodyRadius * 0.05,
    dirX,
    dirY,
    // The developed length, so the tail is as long as its stat says and a child placed at a
    // fraction of the length in the body frame lands on the drawn tail.
    length: Math.max(part.length, bodyRadius * 0.4),
    baseWidth: Math.max(bodyRadius * 0.06, part.radius * 0.35),
    time,
    phase,
    rate
  }
}

/** How far a stalk reaches in the drawing: its length, never less than a stub. */
export function stalkReach(part: PartSnapshot, bodyRadius: number): number {
  return Math.max(part.length, bodyRadius * 0.15)
}

const needsPoseCache = new WeakMap<readonly PartSnapshot[], boolean>()

/** Whether any part moves other than by the body: a rider, or a swaying stalk. */
export function needsPose(parts: readonly PartSnapshot[]): boolean {
  let known = needsPoseCache.get(parts)
  if (known === undefined) {
    known = parts.some((p) => p.parent >= 0 || p.type === 'eyestalk' || p.type === 'join')
    needsPoseCache.set(parts, known)
  }
  return known
}

/**
 * The parts at `time` seconds, with `x`, `y` and `orientation` replaced by their animated values.
 * Returns the same array when nothing moves (no rider, no stalk). Parts come in development
 * order, a parent always before its children, so one pass is enough.
 */
export function posedParts(
  o: Pick<RenderOrganism, 'id' | 'radius' | 'speedRatio' | 'parts'>,
  time: number
): readonly PartSnapshot[] {
  const parts = o.parts
  if (!needsPose(parts)) return parts
  const r = o.radius
  const phase = phaseOf(o.id)
  const rate = beatRate(o.speedRatio)
  const posed: PartSnapshot[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] as PartSnapshot
    const t = part.functional ? time : 0
    let x = part.x
    let y = part.y
    let angle = part.orientation

    if (part.parent >= 0) {
      const rest = parts[part.parent] as PartSnapshot
      const carrier = posed[part.parent] as PartSnapshot
      // How far along the parent the part was developed (0 at its anchor, 1 at its tip), then the
      // same fraction along where the parent is now.
      const along = rest.length > 1e-9 ? fractionAlong(rest, part) : 0
      let carrierX = carrier.x
      let carrierY = carrier.y
      let carrierAngle = carrier.orientation
      if (rest.type === 'flagellum') {
        const point = tailPoint(
          tailSpecOf(rest, r, rest.functional ? time : 0, phase + (part.parent + 1) * 1.3, rate),
          along
        )
        carrierX = point.x
        carrierY = point.y
        carrierAngle = point.angle
      } else if (rest.length > 1e-9) {
        // A straight parent (stalk, skeleton, cilia) carries its child along its present direction.
        const reach =
          rest.type === 'eyestalk' || rest.type === 'join' ? stalkReach(rest, r) : rest.length
        carrierX = carrier.x + Math.cos(carrier.orientation) * reach * along
        carrierY = carrier.y + Math.sin(carrier.orientation) * reach * along
      }
      x = carrierX
      y = carrierY
      // The part keeps its direction relative to the parent's.
      angle = carrierAngle + (part.orientation - rest.orientation)
    } else if (part.type === 'eyestalk' || part.type === 'join') {
      angle = part.orientation + stalkSway(t, phase + (i + 1) * 0.9)
    }
    posed.push(
      part.parent < 0 && angle === part.orientation ? part : { ...part, x, y, orientation: angle }
    )
  }
  return posed
}

/** The fraction of the parent's length at which `child` was developed, from their rest positions. */
function fractionAlong(parent: PartSnapshot, child: PartSnapshot): number {
  const ux = Math.cos(parent.orientation)
  const uy = Math.sin(parent.orientation)
  const f = ((child.x - parent.x) * ux + (child.y - parent.y) * uy) / parent.length
  return Math.min(1, Math.max(0, f))
}
