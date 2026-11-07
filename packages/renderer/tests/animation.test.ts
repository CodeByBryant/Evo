import { describe, expect, it } from 'vitest'
import {
  TAU,
  TAIL_SEGMENTS,
  beatRate,
  blinkOpen,
  ciliaRow,
  exitPoint,
  feelerPoints,
  mouthOpen,
  phaseOf,
  pulse,
  pupilOffset,
  tailPolygon
} from '../src/animation'
import type { TailSpec } from '../src/animation'

/** A regular polygon outline of `n` points and the given radius (front along +x). */
function circle(radius: number, n = 16): number[] {
  const points: number[] = []
  for (let i = 0; i < n; i++) {
    points.push(Math.cos((i / n) * TAU) * radius, Math.sin((i / n) * TAU) * radius)
  }
  return points
}

const spec: TailSpec = {
  baseX: 0,
  baseY: 0,
  dirX: -1,
  dirY: 0,
  length: 10,
  baseWidth: 0.6,
  time: 0.3,
  phase: 1,
  rate: 2
}

describe('phaseOf', () => {
  it('is deterministic, in range and spreads neighbouring ids', () => {
    expect(phaseOf(7)).toBe(phaseOf(7))
    const phases = Array.from({ length: 200 }, (_, id) => phaseOf(id))
    for (const phase of phases) {
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(TAU)
    }
    expect(new Set(phases.map((p) => p.toFixed(4))).size).toBe(200)
    // a crowd does not move in step: consecutive ids are not all close together
    const gaps = phases.slice(1).map((p, i) => Math.abs(p - (phases[i] as number)))
    expect(gaps.filter((gap) => gap > 0.5).length).toBeGreaterThan(100)
  })

  it('survives negative and huge ids', () => {
    for (const id of [-1, 0, 2 ** 31, 2 ** 40]) {
      const phase = phaseOf(id)
      expect(Number.isFinite(phase)).toBe(true)
      expect(phase).toBeGreaterThanOrEqual(0)
      expect(phase).toBeLessThan(TAU)
    }
  })
})

describe('beatRate', () => {
  it('rises with speed, never below one cycle a second, and is bounded', () => {
    expect(beatRate(0)).toBe(1)
    expect(beatRate(1)).toBeGreaterThan(beatRate(0))
    expect(beatRate(2)).toBeGreaterThan(beatRate(1))
    expect(beatRate(-5)).toBe(1)
    expect(beatRate(1000)).toBe(beatRate(2.5))
  })
})

describe('exitPoint', () => {
  it('finds the outline along a ray from the centre', () => {
    const outline = circle(5, 64)
    for (const angle of [0, 1, 2.5, -2]) {
      const rim = exitPoint(outline, 0, 0, Math.cos(angle), Math.sin(angle))
      expect(Math.hypot(rim.x, rim.y)).toBeGreaterThan(4.9)
      expect(Math.hypot(rim.x, rim.y)).toBeLessThanOrEqual(5.0001)
      // the normal points outward, along the ray
      expect(rim.nx * Math.cos(angle) + rim.ny * Math.sin(angle)).toBeGreaterThan(0.9)
      expect(Math.hypot(rim.nx, rim.ny)).toBeCloseTo(1, 6)
    }
  })

  it('works from an off-centre start and in any direction', () => {
    const outline = circle(5, 64)
    const rim = exitPoint(outline, 2, 0, 1, 0)
    expect(rim.x).toBeCloseTo(5, 1)
    expect(rim.y).toBeCloseTo(0, 6)
    const back = exitPoint(outline, 2, 0, -1, 0)
    expect(back.x).toBeCloseTo(-5, 1)
  })

  it('always returns a finite point, even for a start outside or a degenerate outline', () => {
    const outline = circle(5, 32)
    const outside = exitPoint(outline, 100, 100, 1, 0)
    expect(Number.isFinite(outside.x)).toBe(true)
    expect(Number.isFinite(outside.y)).toBe(true)
    expect(exitPoint([], 0, 0, 1, 0)).toEqual({ x: 0, y: 0, nx: 1, ny: 0 })
    expect(exitPoint(outline, 0, 0, 0, 0)).toEqual({ x: 0, y: 0, nx: 1, ny: 0 })
  })
})

describe('tailPolygon', () => {
  it('is a closed strip of left and right edges', () => {
    expect(tailPolygon(spec)).toHaveLength((TAIL_SEGMENTS + 1) * 2 * 2)
    expect(tailPolygon(spec, 4)).toHaveLength(5 * 2 * 2)
  })

  it('is deterministic for a given time and phase', () => {
    expect(tailPolygon(spec)).toEqual(tailPolygon({ ...spec }))
  })

  it('stays attached at the base and reaches out to its length at the tip', () => {
    const polygon = tailPolygon(spec)
    const n = TAIL_SEGMENTS + 1
    // first left point and last right point are both at the base (the base half-width apart)
    const baseLeft = [polygon[0], polygon[1]] as [number, number]
    const baseRight = [polygon[(2 * n - 1) * 2], polygon[(2 * n - 1) * 2 + 1]] as [number, number]
    expect(Math.hypot(baseLeft[0] - baseRight[0], baseLeft[1] - baseRight[1])).toBeCloseTo(
      2 * spec.baseWidth + 2 * spec.length * 0.002,
      6
    )
    expect(baseLeft[0]).toBeCloseTo(0, 6)
    // the tip is about one length behind the base (the wave only moves it sideways)
    const tipX = ((polygon[(n - 1) * 2] as number) + (polygon[n * 2] as number)) / 2
    expect(tipX).toBeCloseTo(-10, 3)
  })

  it('tapers from the base to a hair at the tip', () => {
    const polygon = tailPolygon({ ...spec, time: 0, phase: 0 })
    const n = TAIL_SEGMENTS + 1
    const widthAt = (i: number): number =>
      Math.hypot(
        (polygon[i * 2] as number) - (polygon[(2 * n - 1 - i) * 2] as number),
        (polygon[i * 2 + 1] as number) - (polygon[(2 * n - 1 - i) * 2 + 1] as number)
      )
    expect(widthAt(0)).toBeGreaterThan(widthAt(Math.floor(n / 2)))
    expect(widthAt(Math.floor(n / 2))).toBeGreaterThan(widthAt(n - 1))
    expect(widthAt(n - 1)).toBeLessThan(0.1 * widthAt(0))
  })

  it('waves: the shape changes with time, and the tip swings more than the base', () => {
    const a = tailPolygon({ ...spec, time: 0 })
    const b = tailPolygon({ ...spec, time: 0.2 })
    expect(a).not.toEqual(b)
    // lateral (y) excursion of the centreline grows toward the tip
    const n = TAIL_SEGMENTS + 1
    const lateral = (polygon: number[], i: number): number =>
      ((polygon[i * 2 + 1] as number) + (polygon[(2 * n - 1 - i) * 2 + 1] as number)) / 2
    let baseSwing = 0
    let tipSwing = 0
    for (let step = 0; step < 40; step++) {
      const polygon = tailPolygon({ ...spec, time: step * 0.05 })
      baseSwing = Math.max(baseSwing, Math.abs(lateral(polygon, 1)))
      tipSwing = Math.max(tipSwing, Math.abs(lateral(polygon, n - 1)))
    }
    expect(tipSwing).toBeGreaterThan(baseSwing * 3)
    // and it is bounded by the amplitude
    expect(tipSwing).toBeLessThanOrEqual(spec.length * 0.17 + 1e-9)
  })

  it('beats faster at a higher rate: the same moment is further along the wave', () => {
    const slow = tailPolygon({ ...spec, rate: 1, time: 1 })
    const fast = tailPolygon({ ...spec, rate: 3, time: 1 })
    expect(slow).not.toEqual(fast)
    // and a different phase gives a different shape at the same time
    expect(tailPolygon({ ...spec, phase: 2 })).not.toEqual(tailPolygon(spec))
  })

  it('is finite for any input', () => {
    for (const time of [0, 1e6, -3]) {
      for (const value of tailPolygon({ ...spec, time, length: 0, baseWidth: 0 })) {
        expect(Number.isFinite(value)).toBe(true)
      }
    }
  })
})

describe('ciliaRow', () => {
  const outline = circle(5, 48)

  it('lays the requested number of hairs on the rim, pointing outward', () => {
    const row = ciliaRow(outline, 0, 1.2, 2, 0, 0, 1, 7)
    expect(row).toHaveLength(7)
    for (const hair of row) {
      expect(Math.hypot(hair.x0, hair.y0)).toBeGreaterThan(4.8)
      expect(Math.hypot(hair.x2, hair.y2)).toBeGreaterThan(Math.hypot(hair.x0, hair.y0))
      expect(Math.hypot(hair.x2 - hair.x0, hair.y2 - hair.y0)).toBeLessThanOrEqual(2.0001)
    }
    expect(ciliaRow(outline, 0, 1.2, 2, 0, 0, 1, 1)).toHaveLength(1)
  })

  it('beats as a wave: neighbours lean differently, and the lean changes with time', () => {
    const a = ciliaRow(outline, 0, 1.2, 2, 0.1, 0, 1)
    const b = ciliaRow(outline, 0, 1.2, 2, 0.4, 0, 1)
    expect(a).not.toEqual(b)
    const tipsA = a.map((hair) => Math.atan2(hair.y2 - hair.y0, hair.x2 - hair.x0))
    expect(new Set(tipsA.map((v) => v.toFixed(3))).size).toBeGreaterThan(3)
  })
})

describe('feelerPoints', () => {
  it('is a polyline of steps + 1 points of the requested total reach', () => {
    const points = feelerPoints(1, 2, 0.5, 6, 0.3, 0, 6)
    expect(points).toHaveLength(7 * 2)
    expect(points[0]).toBe(1)
    expect(points[1]).toBe(2)
    const tip = Math.hypot((points[12] as number) - 1, (points[13] as number) - 2)
    expect(tip).toBeLessThanOrEqual(6.0001)
    expect(tip).toBeGreaterThan(5)
  })

  it('sways over time', () => {
    expect(feelerPoints(0, 0, 0, 5, 0, 0)).not.toEqual(feelerPoints(0, 0, 0, 5, 1, 0))
  })
})

describe('eyes, mouths and pulses', () => {
  it('blinks briefly and rarely, never fully closed', () => {
    let closed = 0
    const total = 4200
    for (let i = 0; i < total; i++) {
      const open = blinkOpen(i / 1000, 0)
      expect(open).toBeGreaterThanOrEqual(0.1 - 1e-9)
      expect(open).toBeLessThanOrEqual(1)
      if (open < 0.99) closed++
    }
    expect(closed).toBeGreaterThan(0)
    expect(closed / total).toBeLessThan(0.06)
    expect(blinkOpen(-1.3, 2)).toBeLessThanOrEqual(1)
  })

  it('keeps a pupil inside its eye and mostly toward the front', () => {
    for (let t = 0; t < 20; t += 0.37) {
      const pupil = pupilOffset(t, 1.2)
      expect(pupil.x).toBeGreaterThan(0)
      expect(Math.hypot(pupil.x, pupil.y)).toBeLessThanOrEqual(1)
    }
  })

  it('opens a mouth between 0.3 and 1', () => {
    for (let t = 0; t < 20; t += 0.11) {
      const open = mouthOpen(t, 0.5)
      expect(open).toBeGreaterThanOrEqual(0.3)
      expect(open).toBeLessThanOrEqual(1)
    }
  })

  it('pulses between 0 and 1', () => {
    for (let t = 0; t < 20; t += 0.13) {
      expect(pulse(t, 0)).toBeGreaterThanOrEqual(0)
      expect(pulse(t, 0)).toBeLessThanOrEqual(1)
    }
  })
})
