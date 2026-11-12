import { OBSTACLE_KINDS, REGION_TYPES } from '@evo/contracts'
import type {
  ObstacleKind,
  ObstacleKindConfig,
  ObstacleSnapshot,
  RegionType,
  WorldConfig
} from '@evo/contracts'
import { cos, sin } from '../math/trig'
import { PI, TWO_PI } from '../math/scalar'
import type { RandomSource } from '../random/RandomSource'
import { SpatialHash } from '../spatial/SpatialHash'
import type { EcologyModel } from './EcologyModel'

/** One circle of the obstacle field. A ridge or a cluster is several circles. */
export interface Obstacle {
  readonly id: number
  readonly kind: ObstacleKind
  readonly x: number
  readonly y: number
  readonly radius: number
  readonly blocksMovement: boolean
  readonly blocksSight: boolean
}

/** Floats drawn for every candidate site, whatever the recipe or the outcome: x, y, acceptance, radius, members, angle. */
export const DRAWS_PER_CANDIDATE = 6
/** The area the densities are quoted per, in square units. */
const DENSITY_AREA = 10_000
/** Neighbouring circles of a chain are this many radii apart, so they overlap into a solid wall. */
const CHAIN_SPACING = 1.2
/** Circles of a cluster sit on a ring this many radii from the centre. */
const CLUSTER_RING = 1.3
/** Cells of the obstacle index are this wide, in world units. */
const INDEX_CELL = 32

/**
 * The static obstacle field of a world (ADR 0022): circles placed once at creation, by biome, that
 * block movement, sight or both depending on their kind. Placement draws from the `terrain` stream
 * after the static hazards, a fixed `DRAWS_PER_CANDIDATE` floats per candidate site and a number of
 * candidates that depends only on the configuration and the field size, never on what was accepted,
 * so a world's draw count is the same whatever the map looks like. The field is static, so it is not
 * part of the state hash (the stream state it leaves behind is). With obstacles off, or in the
 * cluster layout, nothing is drawn and the field is empty.
 */
export class ObstacleField {
  readonly obstacles: readonly Obstacle[]
  /** The largest radius of any circle (0 when empty): how far from a point a centre may still reach it. */
  readonly maxRadius: number
  /** The largest radius among circles that block movement. */
  readonly maxMovementRadius: number
  /** The largest radius among circles that block sight. */
  readonly maxSightRadius: number
  private readonly index: SpatialHash<Obstacle>

  private constructor(obstacles: Obstacle[]) {
    this.obstacles = obstacles
    let maxRadius = 0
    let maxMovementRadius = 0
    let maxSightRadius = 0
    for (const o of obstacles) {
      maxRadius = Math.max(maxRadius, o.radius)
      if (o.blocksMovement) maxMovementRadius = Math.max(maxMovementRadius, o.radius)
      if (o.blocksSight) maxSightRadius = Math.max(maxSightRadius, o.radius)
    }
    this.maxRadius = maxRadius
    this.maxMovementRadius = maxMovementRadius
    this.maxSightRadius = maxSightRadius
    this.index = new SpatialHash<Obstacle>(INDEX_CELL, (o) => o)
    this.index.rebuild(obstacles)
  }

  /** An empty field: what a world without obstacles has. */
  static empty(): ObstacleField {
    return new ObstacleField([])
  }

  get size(): number {
    return this.obstacles.length
  }

  /**
   * Places the field. `ecology` supplies the biome of a position (`null`, or regions off, makes every
   * kind use the mean of its densities); the cluster layout has no obstacles.
   */
  static generate(
    config: WorldConfig,
    ecology: EcologyModel | null,
    random: RandomSource
  ): ObstacleField {
    const settings = config.ecology.obstacles
    if (!settings.enabled) return ObstacleField.empty()
    if (config.environment.layout !== 'field') return ObstacleField.empty()
    const { width, height } = config.environment
    const budget = settings.maxCoverage * width * height
    const placed: Obstacle[] = []
    let covered = 0

    for (const kind of OBSTACLE_KINDS) {
      const spec = settings.kinds[kind]
      const meanDensity =
        REGION_TYPES.reduce((sum, type) => sum + spec.density[type], 0) / REGION_TYPES.length
      const densityAt = (x: number, y: number): number => {
        const type: RegionType | null = ecology === null ? null : ecology.regionTypeAt(x, y)
        return type === null ? meanDensity : spec.density[type]
      }
      const maxDensity = ecology !== null && ecology.regionsOn ? maxOf(spec) : meanDensity
      if (!(maxDensity > 0)) continue
      const candidates = Math.round((maxDensity * width * height) / DENSITY_AREA)

      for (let c = 0; c < candidates; c++) {
        const fx = random.float()
        const fy = random.float()
        const accept = random.float()
        const fr = random.float()
        const fm = random.float()
        const fa = random.float()
        const x = settings.clearance + fx * Math.max(0, width - 2 * settings.clearance)
        const y = settings.clearance + fy * Math.max(0, height - 2 * settings.clearance)
        if (!(accept * maxDensity < densityAt(x, y))) continue
        const circles = layout(spec, x, y, fr, fm, fa)
        if (!fits(circles, placed, width, height, settings.clearance)) continue
        let area = 0
        for (const circle of circles) area += PI * circle.radius * circle.radius
        if (covered + area > budget) continue
        covered += area
        for (const circle of circles) {
          placed.push({
            id: placed.length,
            kind,
            x: circle.x,
            y: circle.y,
            radius: circle.radius,
            blocksMovement: spec.blocksMovement,
            blocksSight: spec.blocksSight
          })
        }
      }
    }
    return new ObstacleField(placed)
  }

  /**
   * Calls `visit` for every circle whose centre is within `reach` of `(x, y)`, in no particular order
   * and without allocating. A caller that needs circles touching a body adds `maxRadius` to `reach`.
   */
  scan(x: number, y: number, reach: number, visit: (obstacle: Obstacle) => void): void {
    if (this.obstacles.length === 0) return
    this.index.scan({ x, y }, reach, visit)
  }

  /** Whether any circle satisfying `test` has its centre within `reach` of `(x, y)` and passes the test. */
  some(x: number, y: number, reach: number, test: (obstacle: Obstacle) => boolean): boolean {
    if (this.obstacles.length === 0) return false
    return this.index.some({ x, y }, reach, test)
  }

  /**
   * Whether a point, with `margin` of room around it, lies inside a circle that blocks movement.
   * Used to keep food, plants and the like out of rocks.
   */
  blocksMovementAt(x: number, y: number, margin: number): boolean {
    if (this.obstacles.length === 0 || this.maxMovementRadius === 0) return false
    return this.index.some({ x, y }, this.maxMovementRadius + margin, (o, distanceSquared) => {
      if (!o.blocksMovement) return false
      const reach = o.radius + margin
      return distanceSquared < reach * reach
    })
  }

  /** The field as plain data for a presentation layer. A copy; it never changes during a run. */
  toSnapshot(): ObstacleSnapshot[] {
    return this.obstacles.map((o) => ({
      id: o.id,
      kind: o.kind,
      x: o.x,
      y: o.y,
      radius: o.radius,
      blocksMovement: o.blocksMovement,
      blocksSight: o.blocksSight
    }))
  }
}

function maxOf(spec: ObstacleKindConfig): number {
  let max = 0
  for (const type of REGION_TYPES) max = Math.max(max, spec.density[type])
  return max
}

interface Circle {
  readonly x: number
  readonly y: number
  readonly radius: number
}

/** The circles of one site, from the site's centre and three unit draws (radius, members, angle). */
function layout(
  spec: ObstacleKindConfig,
  x: number,
  y: number,
  fr: number,
  fm: number,
  fa: number
): Circle[] {
  const radius = spec.radiusMin + fr * (spec.radiusMax - spec.radiusMin)
  if (spec.recipe === 'single') return [{ x, y, radius }]
  const members = spec.membersMin + Math.floor(fm * (spec.membersMax - spec.membersMin + 1))
  const count = Math.min(spec.membersMax, Math.max(spec.membersMin, members))
  const angle = fa * TWO_PI
  const circles: Circle[] = []
  if (spec.recipe === 'chain') {
    const dx = cos(angle) * radius * CHAIN_SPACING
    const dy = sin(angle) * radius * CHAIN_SPACING
    for (let i = 0; i < count; i++) circles.push({ x: x + i * dx, y: y + i * dy, radius })
    return circles
  }
  circles.push({ x, y, radius })
  const around = count - 1
  for (let i = 0; i < around; i++) {
    const a = angle + (i * TWO_PI) / around
    circles.push({
      x: x + cos(a) * radius * CLUSTER_RING,
      y: y + sin(a) * radius * CLUSTER_RING,
      radius
    })
  }
  return circles
}

/** Whether a site lies inside the world's clearance box and clear of every circle already placed. */
function fits(
  circles: readonly Circle[],
  placed: readonly Obstacle[],
  width: number,
  height: number,
  clearance: number
): boolean {
  for (const c of circles) {
    if (c.x - c.radius < clearance || c.x + c.radius > width - clearance) return false
    if (c.y - c.radius < clearance || c.y + c.radius > height - clearance) return false
    for (const o of placed) {
      const dx = c.x - o.x
      const dy = c.y - o.y
      const reach = c.radius + o.radius
      if (dx * dx + dy * dy < reach * reach) return false
    }
  }
  return true
}
