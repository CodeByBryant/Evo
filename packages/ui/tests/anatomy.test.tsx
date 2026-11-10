import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InspectorAnatomy } from '@evo/contracts'
import { AnatomyTab, Inspector } from '../src/index'
import { arrowEnd, partRadius, smoothPath } from '../src/anatomyView'
import { inspector, recorder } from './support/fixtures'

const square = [1, 0, 0, 1, -1, 0, 0, -1]

describe('smoothPath', () => {
  it('is a closed curve through every point', () => {
    const d = smoothPath(square)
    expect(d.startsWith('M 1 0')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.match(/C/g)).toHaveLength(4)
    expect(d).toContain('0 1') // passes through the second point
  })

  it('scales, and gives nothing for fewer than three points', () => {
    expect(smoothPath(square, 2).startsWith('M 2 0')).toBe(true)
    expect(smoothPath([0, 0, 1, 1])).toBe('')
    expect(smoothPath([])).toBe('')
  })
})

describe('part geometry', () => {
  it('sizes a glyph by the square root of the size, and never below zero', () => {
    expect(partRadius(1)).toBeCloseTo(0.2, 12)
    expect(partRadius(0.25)).toBeCloseTo(0.1, 12)
    expect(partRadius(-1)).toBe(0)
  })

  it('points an arrow along the orientation', () => {
    const end = arrowEnd({ x: 0.5, y: 0, orientation: Math.PI / 2 }, 0.3)
    expect(end.x).toBeCloseTo(0.5, 12)
    expect(end.y).toBeCloseTo(0.3, 12)
  })
})

describe('Anatomy tab', () => {
  const anatomy: InspectorAnatomy = {
    outline: square,
    parts: [
      {
        slot: 0,
        type: 'flagellum',
        parent: -1,
        size: 0.6,
        x: -0.5,
        y: 0.3,
        tipX: -1.2,
        tipY: 0.3,
        orientation: 0,
        functional: true,
        integrity: 1,
        mass: 0.2,
        upkeep: 0.01,
        stats: [{ key: 'length', label: 'Length', value: 1.5, unit: 'radii' }]
      },
      {
        slot: 1,
        type: 'stomach',
        parent: 0,
        size: 0.5,
        x: -0.2,
        y: 0,
        tipX: -0.2,
        tipY: 0,
        orientation: 0,
        functional: false,
        integrity: 1,
        mass: 0.3,
        upkeep: 0.002,
        stats: []
      }
    ],
    undeveloped: [3],
    sizeUsed: 1.1,
    budget: 6,
    capabilities: [{ label: 'speed', value: 1.25 }]
  }

  const render = (value: InspectorAnatomy | null): string =>
    renderToStaticMarkup(<AnatomyTab inspector={{ ...inspector(), anatomy: value }} />)

  it('draws the body, every part, and the table of what each does', () => {
    const html = render(anatomy)
    expect(html).toContain('<path')
    expect(html.match(/<circle/g)).toHaveLength(2)
    expect(html).toContain('flagellum')
    expect(html).toContain('stomach')
    expect(html).toContain('dormant')
    expect(html).toContain('2 parts')
    expect(html).toContain('1 did not develop')
    expect(html).toContain('speed')
  })

  it('marks a part that does not work with a dashed outline', () => {
    expect(render(anatomy)).toContain('stroke-dasharray')
  })

  it('says so when an organism has no body', () => {
    expect(render(null)).toContain('No body for this organism')
  })

  it('is one of the inspector tabs', () => {
    expect(
      renderToStaticMarkup(<Inspector inspector={inspector()} controls={recorder().controls} />)
    ).toContain('Anatomy')
  })
})
