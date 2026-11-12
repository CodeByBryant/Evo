import { describe, expect, it } from 'vitest'
import { MIN_OBSTACLE_RADIUS } from '@evo/contracts'
import type { WorldConfig } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import type { IntentBuffer } from '../../src/buffers/types'
import { ObstacleField } from '../../src/ecology/ObstacleField'
import type { Obstacle } from '../../src/ecology/ObstacleField'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { EventLog } from '../../src/events/EventLog'
import { bodyRadiusOf } from '../../src/organisms/traits'
import { MovementSystem } from '../../src/systems/MovementSystem'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

// Obstacles that block movement (ADR 0022) are solid: a body is pushed out to its own radius plus
// the circle's along the line from the centre, slides along an edge and stops head-on, and the
// velocity it keeps is the one it actually achieved.

const config: WorldConfig = resolveWorldConfig(
  withoutEcology({ environment: { width: 400, height: 400 } })
)
const GO: IntentBuffer = new Map([[1, { turn: 0, thrust: 1, strafe: 0, interact: false }]])

const rock = (x: number, y: number, radius = 10, extra: Partial<Obstacle> = {}) => ({
  kind: 'boulder' as const,
  x,
  y,
  radius,
  blocksMovement: true,
  blocksSight: true,
  ...extra
})

/** One body at (`x`, `y`) heading `heading`, thrusting flat out, for `ticks` ticks. */
function drive(
  field: ObstacleField | null,
  start: Partial<OrganismState>,
  ticks: number,
  cfg: WorldConfig = config
): { body: OrganismState; trail: { x: number; y: number }[] } {
  const organisms = new OrganismStore()
  const body = organismFor(cfg, 1, { age: 1000, ...start })
  organisms.add(body)
  const events = new EventLog(10)
  const system = new MovementSystem(cfg, organisms, GO, events, null, field)
  const trail: { x: number; y: number }[] = []
  for (let t = 1; t <= ticks; t++) {
    events.beginTick()
    system.update(t)
    trail.push({ x: body.x, y: body.y })
  }
  return { body, trail }
}

const radiusOfBody = (cfg: WorldConfig = config): number =>
  bodyRadiusOf(organismFor(cfg, 1).genome, cfg)

describe('a body and a rock that blocks movement', () => {
  it('stops at the rim head-on, at its own radius plus the rock, and keeps no speed into it', () => {
    const r = radiusOfBody()
    const field = ObstacleField.fromCircles([rock(100, 100, 10)])
    const { body } = drive(field, { x: 40, y: 100, heading: 0 }, 200)
    expect(body.x).toBeCloseTo(100 - 10 - r, 6)
    expect(body.y).toBeCloseTo(100, 6)
    // Held against the rock: it has no velocity left toward it.
    expect(Math.abs(body.vx)).toBeLessThan(1e-6)
  })

  it('walks straight through the same spot when there is no obstacle (negative)', () => {
    const { body } = drive(null, { x: 40, y: 100, heading: 0 }, 200)
    expect(body.x).toBeGreaterThan(120)
  })

  it('slides along the edge when it hits at an angle, instead of stopping', () => {
    const r = radiusOfBody()
    const field = ObstacleField.fromCircles([rock(100, 100, 10)])
    // Heading a little below the rock's centre line: it should end up beyond the rock.
    const { body, trail } = drive(field, { x: 60, y: 95, heading: 0.12 }, 400)
    expect(body.x).toBeGreaterThan(100)
    for (const p of trail) {
      expect((p.x - 100) ** 2 + (p.y - 100) ** 2).toBeGreaterThanOrEqual((10 + r - 1e-6) ** 2)
    }
  })

  it('is never inside the rock after any tick, at any approach angle', () => {
    const r = radiusOfBody()
    const field = ObstacleField.fromCircles([rock(200, 200, MIN_OBSTACLE_RADIUS)])
    for (let k = 0; k < 24; k++) {
      const angle = (k / 24) * 2 * Math.PI
      const start = { x: 200 - 60 * Math.cos(angle), y: 200 - 60 * Math.sin(angle), heading: angle }
      const { trail } = drive(field, start, 200)
      for (const p of trail) {
        expect((p.x - 200) ** 2 + (p.y - 200) ** 2).toBeGreaterThanOrEqual(
          (MIN_OBSTACLE_RADIUS + r - 1e-6) ** 2
        )
      }
    }
  })

  it('cannot tunnel through the smallest legal circle at top speed', () => {
    const fast = resolveWorldConfig(
      withoutEcology({ environment: { width: 400, height: 400 }, organisms: { maxSpeed: 20 } })
    )
    const field = ObstacleField.fromCircles([rock(200, 200, MIN_OBSTACLE_RADIUS)])
    // Dead on, 5 units a tick or so at a time: it must stay on the near side.
    const { trail } = drive(field, { x: 100, y: 200, heading: 0 }, 300, fast)
    for (const p of trail) expect(p.x).toBeLessThan(200)
  })

  it('pushes a body that starts inside the rock out to the rim, along the line from the centre', () => {
    const r = radiusOfBody()
    const field = ObstacleField.fromCircles([rock(100, 100, 10)])
    const organisms = new OrganismStore()
    const body = organismFor(config, 1, { x: 103, y: 100, age: 1000 })
    organisms.add(body)
    const events = new EventLog(10)
    events.beginTick()
    new MovementSystem(config, organisms, new Map(), events, null, field).update(1)
    expect(body.x).toBeCloseTo(100 + 10 + r, 6)
    expect(body.y).toBeCloseTo(100, 6)
    // Out of a dead-centre start too: it goes somewhere, and is outside afterwards.
    const centred = organismFor(config, 2, { x: 100, y: 100, age: 1000 })
    const more = new OrganismStore()
    more.add(centred)
    events.beginTick()
    new MovementSystem(config, more, new Map(), events, null, field).update(1)
    expect((centred.x - 100) ** 2 + (centred.y - 100) ** 2).toBeCloseTo((10 + r) ** 2, 6)
  })

  it('reports the velocity it achieved, never above its top speed', () => {
    const field = ObstacleField.fromCircles([rock(100, 100, 10)])
    // Pressed at an angle, it slides: velocity equals the displacement over the tick.
    const organisms = new OrganismStore()
    const body = organismFor(config, 1, { x: 80, y: 96, heading: 0.1, age: 1000 })
    organisms.add(body)
    const events = new EventLog(10)
    let moved = 0
    const system = new MovementSystem(config, organisms, GO, events, null, field)
    for (let t = 1; t <= 120; t++) {
      const before = { x: body.x, y: body.y }
      events.beginTick()
      system.update(t)
      const ax = (body.x - before.x) / config.timestep
      const ay = (body.y - before.y) / config.timestep
      // The reported velocity points the way it actually went and is never faster than it did
      // (it is capped at top speed when a slide round the edge covers a little more ground).
      const achieved = Math.hypot(ax, ay)
      const reported = Math.hypot(body.vx, body.vy)
      expect(reported).toBeLessThanOrEqual(achieved + 1e-9)
      expect(body.vx * ay - body.vy * ax).toBeCloseTo(0, 6)
      moved = Math.max(moved, Math.hypot(ax, ay))
    }
    expect(moved).toBeGreaterThan(0)
  })

  it('leaves an unobstructed body bit-for-bit as it was (zero obstacles, and a field far away)', () => {
    const a = drive(null, { x: 40, y: 100, heading: 0.3 }, 150)
    const empty = drive(ObstacleField.empty(), { x: 40, y: 100, heading: 0.3 }, 150)
    const far = drive(
      ObstacleField.fromCircles([rock(390, 20, 8)]),
      { x: 40, y: 100, heading: 0.3 },
      150
    )
    expect(empty.trail).toEqual(a.trail)
    // The far rock is not touched on this path, so the walk is the same too.
    expect(far.trail).toEqual(a.trail)
  })

  it('does not stop at a circle that does not block movement (reeds), and does at one that does', () => {
    const reeds = ObstacleField.fromCircles([rock(100, 100, 10, { blocksMovement: false })])
    expect(drive(reeds, { x: 40, y: 100, heading: 0 }, 200).body.x).toBeGreaterThan(120)
    const solid = ObstacleField.fromCircles([rock(100, 100, 10)])
    expect(drive(solid, { x: 40, y: 100, heading: 0 }, 200).body.x).toBeLessThan(100)
  })

  it('does not end inside any circle of a wall, even pressed into the corner of two', () => {
    const r = radiusOfBody()
    // Two overlapping circles, the corner between them to the left of centre.
    const wall = ObstacleField.fromCircles([rock(100, 100, 8), rock(109.6, 100, 8)])
    for (const heading of [0, 0.4, -0.4, 0.8, -0.8]) {
      const { trail } = drive(wall, { x: 60, y: 100 + heading * 20, heading }, 300)
      for (const p of trail) {
        for (const o of wall.obstacles) {
          expect((p.x - o.x) ** 2 + (p.y - o.y) ** 2).toBeGreaterThanOrEqual(
            (o.radius + r - 1e-6) ** 2
          )
        }
      }
    }
  })

  it('lets a juvenile, which is smaller, get closer than an adult', () => {
    const field = ObstacleField.fromCircles([rock(100, 100, 10)])
    const adult = drive(field, { x: 40, y: 100, heading: 0, age: 1000 }, 200).body
    const juvenile = drive(field, { x: 40, y: 100, heading: 0, age: 1 }, 200).body
    expect(juvenile.x).toBeGreaterThan(adult.x)
  })

  it('does not depend on the order circles were placed in', () => {
    const circles = [rock(100, 100, 8), rock(109.6, 100, 8), rock(119.2, 100, 8)]
    const forward = drive(ObstacleField.fromCircles(circles), { x: 60, y: 104, heading: 0.1 }, 200)
    const reversed = drive(
      ObstacleField.fromCircles([...circles].reverse()),
      { x: 60, y: 104, heading: 0.1 },
      200
    )
    // Ids differ with the order, so allow a tiny difference, but no more than the pass order can make.
    for (let i = 0; i < forward.trail.length; i++) {
      expect(
        Math.abs((forward.trail[i] as { x: number }).x - (reversed.trail[i] as { x: number }).x)
      ).toBeLessThan(0.5)
    }
  })
})
