import { describe, expect, it } from 'vitest'
import {
  PART_EXTENT_STAT,
  PART_STATS,
  PART_STAT_COUNT,
  SURFACE_PARTS,
  statMultiplier,
  statValue,
  BODY_GENE_COUNT,
  OUTLINE_COUNT_INDEX,
  outlineAngleIndex,
  outlineRadiusIndex,
  BODY_GENE_DEFINITIONS,
  BODY_SLOT_COUNT,
  PART_DEFINITIONS,
  PART_TYPES,
  SLOT_FIELDS,
  VISUAL_FIELDS,
  slotGeneIndex,
  visualGeneIndex
} from '../src/index'
import type { PartStatSpec } from '../src/index'

describe('anatomy contracts', () => {
  it('fixes the vocabulary: ten part types in functional order, twelve slots', () => {
    expect(PART_TYPES).toEqual([
      'flagellum',
      'cilia',
      'eye',
      'sniffer',
      'mouth',
      'intestine',
      'stomach',
      'armor',
      'membrane',
      'mender'
    ])
    expect(BODY_SLOT_COUNT).toBe(12)
    expect(SLOT_FIELDS).toHaveLength(14)
    expect(SLOT_FIELDS.slice(0, 8)).toEqual([
      'present',
      'type',
      'parent',
      'size',
      'angle',
      'offset',
      'orientation',
      'integrity'
    ])
    expect(SLOT_FIELDS.slice(8)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5'])
    expect(VISUAL_FIELDS).toEqual(['pattern', 'accentHue'])
  })

  it('lays out 203 body genes in canonical order', () => {
    expect(BODY_GENE_COUNT).toBe(203)
    expect(BODY_GENE_DEFINITIONS).toHaveLength(203)
    expect(BODY_GENE_DEFINITIONS[0]?.path).toBe('body.slot0.present')
    expect(BODY_GENE_DEFINITIONS[13]?.path).toBe('body.slot0.s5')
    expect(BODY_GENE_DEFINITIONS[14]?.path).toBe('body.slot1.present')
    expect(BODY_GENE_DEFINITIONS[167]?.path).toBe('body.slot11.s5')
    expect(BODY_GENE_DEFINITIONS[168]?.path).toBe('body.visual.pattern')
    expect(BODY_GENE_DEFINITIONS[169]?.path).toBe('body.visual.accentHue')
    expect(BODY_GENE_DEFINITIONS[170]?.path).toBe('body.outline.count')
    expect(BODY_GENE_DEFINITIONS[171]?.path).toBe('body.outline.radius0')
    expect(BODY_GENE_DEFINITIONS[186]?.path).toBe('body.outline.radius15')
    expect(BODY_GENE_DEFINITIONS[187]?.path).toBe('body.outline.angle0')
    expect(BODY_GENE_DEFINITIONS[202]?.path).toBe('body.outline.angle15')
    expect(OUTLINE_COUNT_INDEX).toBe(170)
    expect(outlineRadiusIndex(15)).toBe(186)
    expect(outlineAngleIndex(0)).toBe(187)
    expect(BODY_GENE_DEFINITIONS[170]).toMatchObject({ kind: 'int', min: 5, max: 16 })
    expect(new Set(BODY_GENE_DEFINITIONS.map((d) => d.path)).size).toBe(203)
  })

  it('indexes slot and visual genes consistently with the definitions', () => {
    for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
      for (const field of SLOT_FIELDS) {
        expect(BODY_GENE_DEFINITIONS[slotGeneIndex(slot, field)]?.path).toBe(
          `body.slot${slot}.${field}`
        )
      }
    }
    for (const field of VISUAL_FIELDS) {
      expect(BODY_GENE_DEFINITIONS[visualGeneIndex(field)]?.path).toBe(`body.visual.${field}`)
    }
  })

  it('gives every gene a sensible kind and range', () => {
    for (const gene of BODY_GENE_DEFINITIONS) {
      expect(gene.max).toBeGreaterThan(gene.min)
    }
    const kinds = new Map(BODY_GENE_DEFINITIONS.map((d) => [d.path, d.kind]))
    expect(kinds.get('body.slot3.present')).toBe('bool')
    expect(kinds.get('body.slot3.type')).toBe('int')
    expect(kinds.get('body.slot3.angle')).toBe('circular')
    expect(kinds.get('body.slot3.size')).toBe('float')
    expect(kinds.get('body.slot3.parent')).toBe('int')
    expect(kinds.get('body.slot3.integrity')).toBe('float')
    expect(kinds.get('body.slot3.s4')).toBe('float')
    const type = BODY_GENE_DEFINITIONS[slotGeneIndex(0, 'type')]
    expect(type?.max).toBe(PART_TYPES.length - 1)
  })

  it('has a definition for every type, in order, whose requirements something provides', () => {
    expect(PART_DEFINITIONS.map((d) => d.type)).toEqual([...PART_TYPES])
    const provided = new Set(PART_DEFINITIONS.flatMap((d) => d.provides))
    for (const definition of PART_DEFINITIONS) {
      for (const need of definition.requires) expect(provided.has(need)).toBe(true)
    }
  })

  it("names every part type's stats: unique keys, sane ranges, at most six, and extents that exist", () => {
    for (const type of PART_TYPES) {
      const stats = PART_STATS[type]
      expect(stats.length).toBeGreaterThan(0)
      expect(stats.length).toBeLessThanOrEqual(PART_STAT_COUNT)
      expect(new Set(stats.map((stat) => stat.key)).size).toBe(stats.length)
      for (const stat of stats) {
        expect(stat.max).toBeGreaterThan(stat.min)
        expect(stat.label.length).toBeGreaterThan(0)
      }
      expect(typeof SURFACE_PARTS[type]).toBe('boolean')
      const extent = PART_EXTENT_STAT[type]
      if (extent !== undefined) expect(stats.some((stat) => stat.key === extent)).toBe(true)
    }
  })

  it('maps a stat gene to real units and to a multiplier that is 1 in the middle', () => {
    const spec = PART_STATS.flagellum[0] as PartStatSpec
    expect(statValue(spec, 0)).toBe(spec.min)
    expect(statValue(spec, 1)).toBe(spec.max)
    expect(statValue(spec, 0.5)).toBeCloseTo((spec.min + spec.max) / 2, 12)
    expect(statMultiplier(0.5)).toBe(1)
    expect(statMultiplier(0)).toBe(0.5)
    expect(statMultiplier(1)).toBe(1.5)
  })
})
