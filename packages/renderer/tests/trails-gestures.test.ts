import { describe, expect, it } from 'vitest'
import type { RenderOrganism } from '@evo/contracts'
import { GestureTracker, TrailBuffer } from '../src/index'

const at = (id: number, x: number, y: number): RenderOrganism => ({
  id,
  x,
  y,
  rotation: 0,
  radius: 5,
  hue: 0,
  speciesColor: '#ffffff',
  speciesId: 0,
  lifeStage: 'mature',
  energyRatio: 1,
  healthRatio: 1,
  selected: false
})

describe('TrailBuffer', () => {
  it('keeps the most recent positions, oldest first, up to its capacity', () => {
    const trails = new TrailBuffer(3)
    for (let i = 0; i < 5; i++) trails.record([at(1, i * 10, 0)])
    expect(trails.pointsOf(1).map((p) => p.x)).toEqual([20, 30, 40])
  })

  it('ignores a point that barely moved', () => {
    const trails = new TrailBuffer(5, 1)
    trails.record([at(1, 0, 0)])
    trails.record([at(1, 0.2, 0)])
    trails.record([at(1, 5, 0)])
    expect(trails.pointsOf(1).map((p) => p.x)).toEqual([0, 5])
  })

  it('drops organisms that are gone, so memory is bounded', () => {
    const trails = new TrailBuffer(4)
    trails.record([at(1, 0, 0), at(2, 0, 0), at(3, 0, 0)])
    expect(trails.size).toBe(3)
    trails.record([at(2, 9, 9)])
    expect(trails.size).toBe(1)
    expect(trails.pointsOf(1)).toEqual([])
    trails.clear()
    expect(trails.size).toBe(0)
  })

  it('never grows beyond capacity per organism over a long run', () => {
    const trails = new TrailBuffer(10)
    for (let i = 0; i < 10_000; i++) trails.record([at(1, i, 0)])
    expect(trails.pointsOf(1)).toHaveLength(10)
  })
})

describe('GestureTracker', () => {
  it('treats a press that barely moves as a click', () => {
    const g = new GestureTracker(5)
    g.pointerDown(1, 100, 100)
    expect(g.pointerMove(1, 102, 101)).toEqual([])
    expect(g.pointerUp(1, 102, 101)).toEqual([{ type: 'click', x: 102, y: 101, touch: false }])
  })

  it('reports touch clicks as touch', () => {
    const g = new GestureTracker()
    g.pointerDown(1, 5, 5, true)
    expect(g.pointerUp(1, 5, 5)).toEqual([{ type: 'click', x: 5, y: 5, touch: true }])
  })

  it('pans while dragging and does not click on release', () => {
    const g = new GestureTracker(5)
    g.pointerDown(1, 100, 100)
    const first = g.pointerMove(1, 120, 100) // passes the tolerance
    expect(first).toEqual([{ type: 'pan', dx: 20, dy: 0 }])
    expect(g.pointerMove(1, 125, 110)).toEqual([{ type: 'pan', dx: 5, dy: 10 }])
    expect(g.pointerUp(1, 125, 110)).toEqual([])
  })

  it('pinches: spreading two pointers zooms in around their midpoint', () => {
    const g = new GestureTracker()
    g.pointerDown(1, 100, 100, true)
    g.pointerDown(2, 200, 100, true)
    const actions = g.pointerMove(2, 300, 100) // distance 100 -> 200
    const zoom = actions.find((a) => a.type === 'zoom')
    expect(zoom).toMatchObject({ type: 'zoom', factor: 2, x: 200, y: 100 })
    // a pinch is never a click
    expect(g.pointerUp(2, 300, 100)).toEqual([])
    expect(g.pointerUp(1, 100, 100)).toEqual([])
  })

  it('ignores events for pointers it does not know, and cancels cleanly', () => {
    const g = new GestureTracker()
    expect(g.pointerMove(9, 1, 1)).toEqual([])
    expect(g.pointerUp(9, 1, 1)).toEqual([])
    g.pointerDown(1, 0, 0)
    g.pointerCancel(1)
    expect(g.pointerUp(1, 0, 0)).toEqual([])
  })

  it('zooms on the wheel: scrolling up zooms in, down zooms out, zero does nothing', () => {
    const g = new GestureTracker()
    const [up] = g.wheel(-100, 40, 50)
    const [down] = g.wheel(100, 40, 50)
    expect(up).toMatchObject({ type: 'zoom', x: 40, y: 50 })
    expect((up as { factor: number }).factor).toBeGreaterThan(1)
    expect((down as { factor: number }).factor).toBeLessThan(1)
    expect((up as { factor: number }).factor * (down as { factor: number }).factor).toBeCloseTo(
      1,
      12
    )
    expect(g.wheel(0, 0, 0)).toEqual([])
  })
})
