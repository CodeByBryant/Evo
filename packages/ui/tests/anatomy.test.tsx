import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { InspectorAnatomy } from '@evo/contracts'
import { AnatomyTab, Inspector } from '../src/index'
import {
  arrowEnd,
  bareBody,
  formatStat,
  partRadius,
  partTree,
  sightLabel,
  smoothPath
} from '../src/anatomyView'
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

const slot = (
  slotNumber: number,
  parent: number,
  functional = true
): { slot: number; parent: number; type: string; functional: boolean } => ({
  slot: slotNumber,
  parent,
  type: 'flagellum',
  functional
})

describe('partTree', () => {
  it('puts a part under its parent, one level deeper each time', () => {
    const rows = partTree([slot(0, -1), slot(1, 0), slot(2, 1)])
    expect(rows.map((r) => [r.slot, r.depth])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3]
    ])
  })

  it('lists siblings in slot order, each followed by its own children', () => {
    const rows = partTree([slot(0, -1), slot(1, -1), slot(2, 0), slot(3, 1), slot(4, 0)])
    expect(rows.map((r) => r.slot)).toEqual([0, 2, 4, 1, 3])
    expect(rows.map((r) => r.depth)).toEqual([1, 2, 2, 1, 2])
  })

  it('hangs a part with a missing, forward or self parent from the body, and shows every part once', () => {
    const rows = partTree([slot(0, 7), slot(1, 1), slot(2, 3), slot(3, -1)])
    expect(rows.map((r) => r.depth)).toEqual([1, 1, 1, 1])
    expect(rows.map((r) => r.slot).sort()).toEqual([0, 1, 2, 3])
  })

  it('keeps a dormant part in the tree, flagged', () => {
    expect(partTree([slot(0, -1, false)])[0]?.functional).toBe(false)
    expect(partTree([])).toEqual([])
  })
})

describe('formatStat, sightLabel, bareBody', () => {
  it('shows fewer digits as a value grows and puts the unit after it', () => {
    expect(formatStat(1.2345, 'radii')).toBe('1.23 radii')
    expect(formatStat(12.345, 'units')).toBe('12.3 units')
    expect(formatStat(123.45, '')).toBe('123')
    expect(formatStat(Number.NaN, 'x')).toBe('-')
  })

  it('says all round for a half-angle of pi and a field of view in degrees otherwise', () => {
    expect(sightLabel({ half: Math.PI, reach: 60.2 })).toBe('all round, reach 60')
    expect(sightLabel({ half: Math.PI / 4, reach: 109.4 })).toBe('90°, reach 109')
  })

  it('takes the parts off the total to find the bare body and never goes below zero', () => {
    const parts = [
      { mass: 0.2, upkeep: 0.01 },
      { mass: 0.3, upkeep: 0.002 }
    ]
    const bare = bareBody(parts, { mass: 1.5, upkeep: 0.05 })
    expect(bare.mass).toBeCloseTo(1, 12)
    expect(bare.upkeep).toBeCloseTo(0.038, 12)
    expect(bareBody(parts, { mass: 0.1, upkeep: 0 })).toEqual({ mass: 0, upkeep: 0 })
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
        sight: null,
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
        sight: null,
        integrity: 1,
        mass: 0.3,
        upkeep: 0.002,
        stats: []
      }
    ],
    undeveloped: [3],
    sizeUsed: 1.1,
    budget: 6,
    capabilities: [
      { label: 'speed', value: 1.25 },
      { label: 'mass', value: 1.5 },
      { label: 'upkeep (energy/s)', value: 0.05 }
    ]
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

  it('shows the parent tree, the totals and a stat table with units per part', () => {
    const html = render(anatomy)
    expect(html).toContain('aria-label="Parent tree"')
    expect(html).toContain('Bare body')
    expect(html).toContain('>1.000<') // 1.5 total - 0.2 - 0.3
    expect(html).toContain('Total')
    expect(html).toContain('>1.500<')
    expect(html).toContain('aria-label="Part 0 stats"')
    expect(html).toContain('1.50 radii')
    // mass and upkeep rows are in the table, not repeated among the founder comparisons
    expect(html.match(/upkeep \(energy\/s\)/g)).toBeNull()
    // a part's own table, not another part's: the stomach has no stats, the flagellum has one
    expect(html).toContain('Part 1 stats')
  })

  it("keeps each part's stats folded until asked, behind a button that says so", () => {
    const html = render(anatomy)
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2) // one button per part
    expect(html).not.toContain('aria-expanded="true"')
    expect(html).toMatch(/<tr hidden=""[^>]*id="evo-part-0-stats"/)
  })

  it('lists sight only for a working eye, and nothing when there is none', () => {
    expect(render(anatomy)).not.toContain('Sight')
    const eye = {
      ...anatomy.parts[0]!,
      slot: 2,
      type: 'eye' as const,
      sight: { half: Math.PI / 4, reach: 98.4 }
    }
    const html = render({ ...anatomy, parts: [...anatomy.parts, eye] })
    expect(html).toContain('Sight')
    expect(html).toContain('Eye 2')
    expect(html).toContain('90°, reach 98')
  })

  it('marks a part that does not work with a dashed outline', () => {
    expect(render(anatomy)).toContain('stroke-dasharray')
  })

  it('says so when an organism has no body', () => {
    expect(render(null)).toContain('No body for this organism')
  })

  it("is part of the inspector's Body tab, under the vitals", () => {
    const html = renderToStaticMarkup(
      <Inspector inspector={{ ...inspector(), anatomy }} controls={recorder().controls} />
    )
    expect(html).toContain('Parent tree')
    expect(html.indexOf('Energy')).toBeLessThan(html.indexOf('Parent tree'))
  })

  it('has exactly the five tabs, with Env named Environment for screen readers', () => {
    const html = renderToStaticMarkup(
      <Inspector inspector={inspector()} controls={recorder().controls} />
    )
    const tabs = [...html.matchAll(/role="tab"[^>]*>([^<]*)</g)].map((m) => m[1])
    expect(tabs).toEqual(['Body', 'Genome', 'Brain', 'Lineage', 'Env'])
    expect(html).toContain('aria-label="Environment"')
    expect(html).not.toContain('>Overview<')
  })
})
