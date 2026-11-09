/**
 * The maths behind the creatures' motion: how a flagellum waves, how cilia beat, when an eye blinks.
 * Pure functions of time, a per-creature phase and the creature's outline, so every rule is
 * unit-tested and nothing here touches Pixi or the engine. Animation is presentation only: it
 * reads a wall-clock time and never feeds back into the simulation.
 */

export const TAU = Math.PI * 2

const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value

/** A stable phase in `[0, TAU)` for an id, so a crowd of creatures does not move in step. */
export function phaseOf(id: number): number {
  let h = Math.imul((id | 0) ^ 0x2545f491, 0x9e3779b1) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = (h ^ (h >>> 12)) >>> 0
  return (h / 4294967296) * TAU
}

/** How fast a flagellum or a row of cilia beats, in cycles per second, for a creature's speed. */
export function beatRate(speedRatio: number): number {
  return 1 + 1.8 * clamp(speedRatio, 0, 2.5)
}

/** A point on the outline where a ray leaves it, and the outward direction there. */
export interface RimPoint {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
}

/**
 * Where a ray from `(px, py)` in direction `(dx, dy)` leaves the closed outline (`x0, y0, x1, y1,
 * ...`). The start is normally inside the body; when the ray finds no exit, the nearest outline
 * point in that direction from the centre is returned instead, so a caller always gets a point.
 */
export function exitPoint(
  outline: readonly number[],
  px: number,
  py: number,
  dx: number,
  dy: number
): RimPoint {
  const n = Math.floor(outline.length / 2)
  const length = Math.hypot(dx, dy)
  if (n < 3 || length === 0) return { x: px, y: py, nx: 1, ny: 0 }
  const ux = dx / length
  const uy = dy / length
  let best = Infinity
  let bestNx = ux
  let bestNy = uy
  for (let i = 0; i < n; i++) {
    const ax = outline[i * 2] as number
    const ay = outline[i * 2 + 1] as number
    const bx = outline[((i + 1) % n) * 2] as number
    const by = outline[((i + 1) % n) * 2 + 1] as number
    const ex = bx - ax
    const ey = by - ay
    const denominator = ux * ey - uy * ex
    if (Math.abs(denominator) < 1e-12) continue
    const t = ((ax - px) * ey - (ay - py) * ex) / denominator
    const s = ((ax - px) * uy - (ay - py) * ux) / denominator
    if (t > 1e-9 && s >= 0 && s <= 1 && t < best) {
      best = t
      const edge = Math.hypot(ex, ey) || 1
      // The edge normal that points away from the ray's start.
      const sign = denominator > 0 ? 1 : -1
      bestNx = (sign * ey) / edge
      bestNy = (-sign * ex) / edge
    }
  }
  if (!Number.isFinite(best)) {
    // No exit (the start is outside, or the outline is degenerate): use the nearest vertex.
    let nearest = 0
    let nearestDistance = Infinity
    for (let i = 0; i < n; i++) {
      const vx = outline[i * 2] as number
      const vy = outline[i * 2 + 1] as number
      const along = (vx - px) * ux + (vy - py) * uy
      const across = Math.abs((vx - px) * uy - (vy - py) * ux)
      const score = across - along * 0.01
      if (score < nearestDistance) {
        nearestDistance = score
        nearest = i
      }
    }
    return {
      x: outline[nearest * 2] as number,
      y: outline[nearest * 2 + 1] as number,
      nx: ux,
      ny: uy
    }
  }
  return { x: px + ux * best, y: py + uy * best, nx: bestNx, ny: bestNy }
}

export interface TailSpec {
  /** Where the tail leaves the body. */
  readonly baseX: number
  readonly baseY: number
  /** The direction it trails in (a unit vector). */
  readonly dirX: number
  readonly dirY: number
  readonly length: number
  /** Half the width where it leaves the body. */
  readonly baseWidth: number
  /** Seconds of animation time. */
  readonly time: number
  readonly phase: number
  /** Cycles per second (`beatRate`). */
  readonly rate: number
}

/** How many segments a tail polyline has by default. */
export const TAIL_SEGMENTS = 14

/**
 * A tapered, waving tail as a closed polygon `x0, y0, x1, y1, ...`: the left edge from base to tip,
 * then the right edge from tip to base. A travelling wave whose amplitude grows toward the tip, so
 * the base stays attached and the tip whips; the width falls to a hair at the tip.
 */
export function tailPolygon(spec: TailSpec, segments = TAIL_SEGMENTS): number[] {
  const normalX = -spec.dirY
  const normalY = spec.dirX
  const amplitude = spec.length * 0.17
  const left: number[] = []
  const right: number[] = []
  for (let i = 0; i <= segments; i++) {
    const s = i / segments
    const wave =
      Math.sin(TAU * (s * 1.25 - spec.rate * spec.time * 0.55) + spec.phase) *
      amplitude *
      Math.pow(s, 1.15)
    const cx = spec.baseX + spec.dirX * spec.length * s + normalX * wave
    const cy = spec.baseY + spec.dirY * spec.length * s + normalY * wave
    const half = spec.baseWidth * Math.pow(1 - s, 0.85) + spec.length * 0.002
    left.push(cx + normalX * half, cy + normalY * half)
    right.push(cx - normalX * half, cy - normalY * half)
  }
  const polygon = left
  for (let i = segments; i >= 0; i--)
    polygon.push(right[i * 2] as number, right[i * 2 + 1] as number)
  return polygon
}

/**
 * A point on the tail's centreline at fraction `s` of its length (0 at the base, 1 at the tip) and
 * the direction the tail runs there, from the same wave as `tailPolygon`: whatever hangs from the
 * tail rides this point.
 */
export function tailPoint(spec: TailSpec, s: number): { x: number; y: number; angle: number } {
  const normalX = -spec.dirY
  const normalY = spec.dirX
  const amplitude = spec.length * 0.17
  const at = (u: number): { x: number; y: number } => {
    const wave =
      Math.sin(TAU * (u * 1.25 - spec.rate * spec.time * 0.55) + spec.phase) *
      amplitude *
      Math.pow(u, 1.15)
    return {
      x: spec.baseX + spec.dirX * spec.length * u + normalX * wave,
      y: spec.baseY + spec.dirY * spec.length * u + normalY * wave
    }
  }
  const u = Math.min(1, Math.max(0, s))
  const here = at(u)
  // The direction is the chord a little either side (clamped to the ends).
  const before = at(Math.max(0, u - 0.03))
  const after = at(Math.min(1, u + 0.03))
  return { ...here, angle: Math.atan2(after.y - before.y, after.x - before.x) }
}

/** How far a stalk (eyestalk, join) sways about its rest direction, in radians: a slow, small sweep. */
export function stalkSway(time: number, phase: number): number {
  return 0.12 * Math.sin(TAU * 0.35 * time + phase)
}

/** One cilium: where it starts, bends and ends. */
export interface Cilium {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

/**
 * A fringe of cilia along the outline around `centreAngle`, each leaning with a beat that travels
 * down the row (a metachronal wave). `span` is the arc in radians the row covers.
 */
export function ciliaRow(
  outline: readonly number[],
  centreAngle: number,
  span: number,
  length: number,
  time: number,
  phase: number,
  rate: number,
  count = 7
): Cilium[] {
  const row: Cilium[] = []
  for (let i = 0; i < count; i++) {
    const angle = centreAngle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * span)
    const rim = exitPoint(outline, 0, 0, Math.cos(angle), Math.sin(angle))
    const lean = Math.sin(TAU * rate * time * 0.6 - i * 0.7 + phase) * 0.7
    const outward = Math.atan2(rim.ny, rim.nx)
    row.push({
      x0: rim.x,
      y0: rim.y,
      x1: rim.x + Math.cos(outward + lean * 0.5) * length * 0.55,
      y1: rim.y + Math.sin(outward + lean * 0.5) * length * 0.55,
      x2: rim.x + Math.cos(outward + lean) * length,
      y2: rim.y + Math.sin(outward + lean) * length
    })
  }
  return row
}

/** A swaying feeler as a polyline `x0, y0, x1, y1, ...` of `steps + 1` points. */
export function feelerPoints(
  baseX: number,
  baseY: number,
  angle: number,
  length: number,
  time: number,
  phase: number,
  steps = 6
): number[] {
  const points = [baseX, baseY]
  let x = baseX
  let y = baseY
  const piece = length / steps
  for (let j = 1; j <= steps; j++) {
    const bend = Math.sin(TAU * 0.5 * time - j * 0.6 + phase) * 0.3 * (j / steps)
    x += Math.cos(angle + bend) * piece
    y += Math.sin(angle + bend) * piece
    points.push(x, y)
  }
  return points
}

/** How open an eye is: `1` most of the time, a quick dip toward `0.1` every few seconds. */
export function blinkOpen(time: number, phase: number): number {
  const period = 4.2
  const cycle = ((((time + phase * 0.7) % period) + period) % period) / period
  if (cycle < 0.96) return 1
  return 1 - 0.9 * Math.sin(((cycle - 0.96) / 0.04) * Math.PI)
}

/** Where a pupil sits inside its eye, in `[-1, 1]` on each axis: toward the front, drifting a little. */
export function pupilOffset(time: number, phase: number): { x: number; y: number } {
  return {
    x: 0.45 + 0.25 * Math.sin(time * 0.7 + phase),
    y: 0.3 * Math.sin(time * 0.5 + phase * 1.7)
  }
}

/** How open a mouth is, in `[0.3, 1]`: it opens and closes slowly. */
export function mouthOpen(time: number, phase: number): number {
  return 0.3 + 0.7 * Math.max(0, Math.sin(time * 1.1 + phase * 2))
}

/** A gentle pulse in `[0, 1]`, for halos and healers. */
export function pulse(time: number, phase: number, rate = 1.5): number {
  return 0.5 + 0.5 * Math.sin(time * rate + phase)
}
