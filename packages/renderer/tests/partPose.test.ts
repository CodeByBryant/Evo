import { describe, expect, it } from 'vitest'
import type { PartSnapshot } from '@evo/contracts'
import {
  TAIL_SEGMENTS,
  beatRate,
  phaseOf,
  stalkSway,
  tailPoint,
  tailPolygon
} from '../src/animation'
import { needsPose, posedParts, stalkReach, tailSpecOf } from '../src/partPose'

/** A part with every field set; tests override what they care about. */
const part = (over: Partial<PartSnapshot>): PartSnapshot => ({
  slot: 0,
  parent: -1,
  sight: null,
  type: 'flagellum',
  x: 0,
  y: 0,
  radius: 1,
  orientation: 0,
  functional: true,
  length: 0,
  form: 0,
  ...over
})

const organism = (parts: readonly PartSnapshot[]) => ({ id: 7, radius: 10, speedRatio: 0.5, parts })

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y))

describe('tailPoint', () => {
  const spec = tailSpecOf(
    part({ x: 10, y: 0, orientation: Math.PI, length: 15, radius: 1.4 }),
    10,
    0.7,
    1.3,
    beatRate(0.5)
  )

  it('starts at the base and runs about as long as the tail', () => {
    const start = tailPoint(spec, 0)
    expect(start.x).toBeCloseTo(spec.baseX, 9)
    expect(start.y).toBeCloseTo(spec.baseY, 9)
    const end = tailPoint(spec, 1)
    expect(distance(start, end)).toBeGreaterThan(spec.length * 0.9)
    expect(distance(start, end)).toBeLessThan(spec.length * 1.1)
  })

  it('lies on the centreline the polygon is drawn around (so a rider stays on the tail)', () => {
    const polygon = tailPolygon(spec)
    const n = TAIL_SEGMENTS + 1
    for (const i of [0, 4, 9, TAIL_SEGMENTS]) {
      const left = { x: polygon[i * 2] as number, y: polygon[i * 2 + 1] as number }
      const j = n * 2 + (TAIL_SEGMENTS - i) * 2
      const right = { x: polygon[j] as number, y: polygon[j + 1] as number }
      const centre = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
      const point = tailPoint(spec, i / TAIL_SEGMENTS)
      expect(distance(centre, point)).toBeLessThan(1e-9)
    }
  })

  it('moves with time: the same fraction is somewhere else a moment later (negative: not at rest)', () => {
    const later = { ...spec, time: spec.time + 0.4 }
    expect(distance(tailPoint(spec, 0.8), tailPoint(later, 0.8))).toBeGreaterThan(0.1)
    // the base does not move
    expect(distance(tailPoint(spec, 0), tailPoint(later, 0))).toBeLessThan(1e-9)
  })
})

describe('parts that only hang from the body', () => {
  it('are not posed: the very same array comes back (negative: nothing rides, nothing sways)', () => {
    const parts = [
      part({ type: 'flagellum', x: -9, length: 12, orientation: Math.PI }),
      part({ slot: 1, type: 'eye', x: 4, y: 3 }),
      part({ slot: 2, type: 'mouth', x: 10 })
    ]
    expect(needsPose(parts)).toBe(false)
    expect(posedParts(organism(parts), 3.3)).toBe(parts)
  })
})

describe('a rider on a tail', () => {
  const tail = part({ type: 'flagellum', x: 8, y: 0, orientation: 0, length: 14, radius: 1.4 })
  // developed 40 percent of the way along the tail
  const sniffer = part({ slot: 1, type: 'sniffer', parent: 0, x: 8 + 14 * 0.4, y: 0 })
  const parts = [tail, sniffer]
  const o = organism(parts)

  it('is carried: it sits on the tail centreline at its developed fraction, at every time', () => {
    for (const time of [0, 0.5, 1.7, 4]) {
      const posed = posedParts(o, time)
      const spec = tailSpecOf(tail, o.radius, time, phaseOf(o.id) + 1 * 1.3, beatRate(o.speedRatio))
      const point = tailPoint(spec, 0.4)
      expect(posed[1]?.x).toBeCloseTo(point.x, 9)
      expect(posed[1]?.y).toBeCloseTo(point.y, 9)
    }
  })

  it('moves between two times (negative: a rider that never moved would be the old bug)', () => {
    const a = posedParts(o, 0.3)[1] as PartSnapshot
    const b = posedParts(o, 1.1)[1] as PartSnapshot
    expect(distance(a, b)).toBeGreaterThan(0.05)
  })

  it('keeps its direction relative to the tail', () => {
    const turned = part({ ...sniffer, orientation: 0.6 })
    const relative = (time: number): number => {
      const posed = posedParts(organism([tail, turned]), time)
      const carrierAngle = tailPoint(
        tailSpecOf(tail, o.radius, time, phaseOf(o.id) + 1.3, beatRate(o.speedRatio)),
        0.4
      ).angle
      return (posed[1] as PartSnapshot).orientation - carrierAngle
    }
    expect(relative(0.2)).toBeCloseTo(0.6, 9)
    expect(relative(2.9)).toBeCloseTo(0.6, 9)
  })

  it('stays put when its tail is dormant (a dormant part does not animate)', () => {
    const dormant = [part({ ...tail, functional: false }), sniffer]
    const a = posedParts(organism(dormant), 0)[1] as PartSnapshot
    const b = posedParts(organism(dormant), 5)[1] as PartSnapshot
    expect(distance(a, b)).toBeLessThan(1e-9)
  })

  it('carries a grandchild too: an eye on the sniffer rides with it', () => {
    const eye = part({ slot: 2, type: 'eye', parent: 1, x: sniffer.x, y: sniffer.y })
    const three = organism([tail, sniffer, eye])
    for (const time of [0.4, 2.2]) {
      const posed = posedParts(three, time)
      // the sniffer has no length, so the eye sits at the sniffer's own animated anchor
      expect(distance(posed[2] as PartSnapshot, posed[1] as PartSnapshot)).toBeLessThan(1e-9)
    }
    expect(
      distance(posedParts(three, 0.4)[2] as PartSnapshot, posedParts(three, 2.2)[2] as PartSnapshot)
    ).toBeGreaterThan(0.05)
  })

  it('leaves the parts that hang from the body alone', () => {
    const mouth = part({ slot: 2, type: 'mouth', x: 10, y: 0 })
    const posed = posedParts(organism([tail, sniffer, mouth]), 3.1)
    expect(posed[2]).toBe(mouth)
  })
})

describe('a rider on a straight, still parent', () => {
  it('lands where it was developed (a skeleton does not sway, so nothing moves)', () => {
    const spine = part({ type: 'skeleton', x: 2, y: 1, orientation: 0.5, length: 8 })
    const along = 0.25
    const child = part({
      slot: 1,
      type: 'eye',
      parent: 0,
      x: 2 + Math.cos(0.5) * 8 * along,
      y: 1 + Math.sin(0.5) * 8 * along,
      orientation: 0.5
    })
    for (const time of [0, 3]) {
      const posed = posedParts(organism([spine, child]), time)
      expect(posed[1]?.x).toBeCloseTo(child.x, 9)
      expect(posed[1]?.y).toBeCloseTo(child.y, 9)
    }
  })
})

describe('stalks', () => {
  const stalk = part({ type: 'eyestalk', x: 9, y: 0, orientation: 0, length: 6 })
  const eye = part({ slot: 1, type: 'eye', parent: 0, x: 15, y: 0 })

  it('sway a little about their rest direction, never far', () => {
    for (const time of [0, 0.7, 1.9, 5, 12]) {
      const swayed = posedParts(organism([stalk]), time)[0] as PartSnapshot
      expect(Math.abs(swayed.orientation)).toBeLessThanOrEqual(0.12 + 1e-12)
      // the anchor does not move
      expect(swayed.x).toBe(stalk.x)
      expect(swayed.y).toBe(stalk.y)
    }
    expect(Math.abs(stalkSway(0.9, 1))).toBeLessThanOrEqual(0.12)
  })

  it('carry their eye at the tip, along the swayed direction', () => {
    const o = organism([stalk, eye])
    for (const time of [0.3, 1.4, 3.6]) {
      const posed = posedParts(o, time)
      const swayed = posed[0] as PartSnapshot
      const reach = stalkReach(stalk, o.radius)
      expect(posed[1]?.x).toBeCloseTo(swayed.x + Math.cos(swayed.orientation) * reach, 9)
      expect(posed[1]?.y).toBeCloseTo(swayed.y + Math.sin(swayed.orientation) * reach, 9)
    }
  })

  it('a stalk with no length still has a stub for the eye to sit on', () => {
    const stub = part({ type: 'join', x: 9, y: 0, length: 0 })
    expect(stalkReach(stub, 10)).toBeCloseTo(1.5, 12)
  })
})

describe('tailSpecOf', () => {
  it('is as long as the developed tail, never shorter than a stub', () => {
    expect(tailSpecOf(part({ length: 14 }), 10, 0, 0, 1).length).toBe(14)
    expect(tailSpecOf(part({ length: 0 }), 10, 0, 0, 1).length).toBe(4)
  })

  it('leaves the body slightly inside the rim and runs along the axis', () => {
    const spec = tailSpecOf(part({ x: 10, y: 0, orientation: Math.PI }), 10, 0, 0, 1)
    expect(spec.dirX).toBeCloseTo(-1, 12)
    expect(spec.baseX).toBeCloseTo(10.5, 12)
  })
})
