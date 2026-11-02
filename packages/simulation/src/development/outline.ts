import {
  OUTLINE_COUNT_INDEX,
  OUTLINE_MAX_POINTS,
  OUTLINE_MIN_POINTS,
  outlineAngleIndex,
  outlineRadiusIndex
} from '@evo/contracts'
import type { AnatomyConfig, BodyOutline } from '@evo/contracts'
import { cos, sin } from '../math/trig'
import { founderBodyVector } from '../genetics/BodyGenes'

const TWO_PI = Math.PI * 2
/** A point sits between 10% and 90% of its own sector, so neighbours never touch or cross. */
const SECTOR_MARGIN = 0.1
const SECTOR_SPAN = 0.8

/**
 * Develops the body outline (ADR 0013): the first `count` points of the outline genes become a
 * closed star-shaped polygon around the centre. Point `i` lies in sector `i` of `count` equal
 * sectors, so the polygon is always simple whatever the genes. Pure: no randomness, no state.
 */
export function developOutline(body: readonly number[]): BodyOutline {
  const raw = body[OUTLINE_COUNT_INDEX] as number
  const count = Math.min(OUTLINE_MAX_POINTS, Math.max(OUTLINE_MIN_POINTS, Math.round(raw)))
  const sector = TWO_PI / count
  const points: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const angle =
      (i + SECTOR_MARGIN + SECTOR_SPAN * (body[outlineAngleIndex(i)] as number)) * sector
    const radius = body[outlineRadiusIndex(i)] as number
    points.push({ x: radius * cos(angle), y: radius * sin(angle) })
  }
  let twiceArea = 0
  let perimeter = 0
  for (let i = 0; i < count; i++) {
    const a = points[i] as { x: number; y: number }
    const b = points[(i + 1) % count] as { x: number; y: number }
    twiceArea += a.x * b.y - b.x * a.y
    const dx = b.x - a.x
    const dy = b.y - a.y
    perimeter += Math.sqrt(dx * dx + dy * dy)
  }
  const area = twiceArea / 2
  const areaRadius = Math.sqrt(area / Math.PI)
  return { points, area, areaRadius, perimeter, roughness: perimeter / (TWO_PI * areaRadius) }
}

const profiles = new WeakMap<readonly number[], BodyOutline>()

/** `developOutline`, remembered per body-gene array (genomes are frozen, so the array never changes). */
export function outlineOf(body: readonly number[]): BodyOutline {
  let outline = profiles.get(body)
  if (outline === undefined) {
    outline = developOutline(body)
    profiles.set(body, outline)
  }
  return outline
}

const founders = new WeakMap<AnatomyConfig, BodyOutline>()

/** The founder outline of a configuration (what every size and drag factor is measured against). */
export function founderOutlineOf(anatomy: AnatomyConfig): BodyOutline {
  let outline = founders.get(anatomy)
  if (outline === undefined) {
    outline = developOutline(founderBodyVector(anatomy))
    founders.set(anatomy, outline)
  }
  return outline
}

/** Body size relative to the founder (area-equivalent radius ratio). Exactly 1 for the founder outline. */
export function outlineScaleOf(body: readonly number[], anatomy: AnatomyConfig): number {
  return outlineOf(body).areaRadius / founderOutlineOf(anatomy).areaRadius
}

/**
 * Multiplier on movement energy for the body's roughness: `1 + outlineDrag * (roughness -
 * founderRoughness)`, never below a small floor, and exactly 1 for the founder outline.
 */
export function outlineDragOf(body: readonly number[], anatomy: AnatomyConfig): number {
  const excess = outlineOf(body).roughness - founderOutlineOf(anatomy).roughness
  return Math.max(0.25, 1 + anatomy.outlineDrag * excess)
}
