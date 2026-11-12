import { describe, expect, it } from 'vitest'
import { World } from '../../src/world/World'
import { observatoryCsv } from '../../src/observatory/csv'

describe('observatoryCsv', () => {
  const world = World.create({ seed: 3, config: { observatory: { sampleEvery: 100 } } })
  world.run(300)
  const csv = observatoryCsv(world.observatory()!)
  const lines = csv.trimEnd().split('\n')

  it('has a header and one row per sample, every row as wide as the header', () => {
    expect(lines).toHaveLength(1 + 4) // ticks 0, 100, 200, 300
    const width = (lines[0] as string).split(',').length
    for (const line of lines) expect(line.split(',')).toHaveLength(width)
    expect((lines[0] as string).split(',').slice(0, 3)).toEqual(['tick', 'time', 'population'])
  })

  it('reads the sample ticks in order and the founders at tick 0', () => {
    const rows = lines.slice(1).map((l) => l.split(','))
    expect(rows.map((r) => r[0])).toEqual(['0', '100', '200', '300'])
    expect(rows[0]?.[2]).toBe('20')
  })

  it('every value is a finite number (negative: no NaN or Infinity reaches a spreadsheet)', () => {
    for (const line of lines.slice(1)) {
      for (const cell of line.split(',')) expect(Number.isFinite(Number(cell))).toBe(true)
    }
  })

  it('an empty series is only the header', () => {
    const empty = observatoryCsv({ sampleEvery: 500, baseline: null, samples: [] })
    expect(empty.trimEnd().split('\n')).toHaveLength(1)
  })
})
