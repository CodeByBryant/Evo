import { describe, expect, it } from 'vitest'
import { Camera } from '../src/index'

function camera(): Camera {
  const c = new Camera({ worldWidth: 500, worldHeight: 500 })
  c.setViewport(1000, 600)
  return c
}

describe('Camera', () => {
  it('starts centred on the world at zoom 1', () => {
    expect(camera().state).toEqual({ x: 250, y: 250, zoom: 1 })
  })

  it('maps world to screen and back', () => {
    const c = camera()
    c.focus(100, 80, 2)
    const screen = c.worldToScreen(130, 90)
    expect(screen).toEqual({ x: 500 + 60, y: 300 + 20 })
    const world = c.screenToWorld(screen.x, screen.y)
    expect(world.x).toBeCloseTo(130, 9)
    expect(world.y).toBeCloseTo(90, 9)
  })

  it('pans so the content follows the pointer', () => {
    const c = camera()
    c.focus(250, 250, 2)
    const before = c.worldToScreen(260, 260)
    c.panBy(40, -10)
    const after = c.worldToScreen(260, 260)
    expect(after.x - before.x).toBeCloseTo(40, 9)
    expect(after.y - before.y).toBeCloseTo(-10, 9)
  })

  it('zooms toward the cursor: the point under it does not move', () => {
    const c = camera()
    c.focus(200, 200, 1.5)
    const anchor = c.screenToWorld(700, 200)
    c.zoomAt(1.8, 700, 200)
    const after = c.worldToScreen(anchor.x, anchor.y)
    expect(after.x).toBeCloseTo(700, 6)
    expect(after.y).toBeCloseTo(200, 6)
    expect(c.state.zoom).toBeCloseTo(2.7, 9)
  })

  it('clamps zoom to its limits', () => {
    const c = new Camera({ worldWidth: 500, worldHeight: 500, minZoom: 0.5, maxZoom: 8 })
    c.setViewport(800, 600)
    c.zoomAt(1000, 400, 300)
    expect(c.state.zoom).toBe(8)
    c.zoomAt(1e-9, 400, 300)
    expect(c.state.zoom).toBe(0.5)
  })

  it('cannot be panned out of the world', () => {
    const c = camera()
    c.panBy(-1e6, -1e6)
    expect(c.state.x).toBe(500)
    expect(c.state.y).toBe(500)
    c.panBy(1e6, 1e6)
    expect(c.state.x).toBe(0)
    expect(c.state.y).toBe(0)
  })

  it('focuses on a point and keeps the zoom unless told otherwise', () => {
    const c = camera()
    c.focus(40, 60)
    expect(c.state).toEqual({ x: 40, y: 60, zoom: 1 })
    c.focus(10, 10, 4)
    expect(c.state.zoom).toBe(4)
  })

  it('fits the whole world in the viewport, limited by the smaller dimension', () => {
    const c = camera() // 1000 x 600 viewport, 500 x 500 world: height limits
    c.fit(0)
    expect(c.state.zoom).toBeCloseTo(600 / 500, 9)
    expect(c.state.x).toBe(250)
    const corner = c.worldToScreen(0, 0)
    expect(corner.y).toBeCloseTo(0, 6)
    c.fit(0.1)
    expect(c.state.zoom).toBeCloseTo((600 * 0.8) / 500, 9)
  })

  it('reports the visible bounds', () => {
    const c = camera()
    c.focus(250, 250, 2)
    expect(c.visibleBounds()).toEqual({ left: 0, top: 100, right: 500, bottom: 400 })
  })

  it('survives a degenerate viewport and a new world size', () => {
    const c = camera()
    c.setViewport(0, 0)
    expect(c.viewport).toEqual({ width: 1, height: 1 })
    c.focus(400, 400)
    c.setWorld(300, 300)
    expect(c.state.x).toBe(300)
  })
})
