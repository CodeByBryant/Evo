import { describe, expect, it } from 'vitest'
import {
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
    expect(SLOT_FIELDS).toHaveLength(7)
    expect(VISUAL_FIELDS).toEqual(['pattern', 'accentHue'])
  })

  it('lays out 119 body genes in canonical order', () => {
    expect(BODY_GENE_COUNT).toBe(119)
    expect(BODY_GENE_DEFINITIONS).toHaveLength(119)
    expect(BODY_GENE_DEFINITIONS[0]?.path).toBe('body.slot0.present')
    expect(BODY_GENE_DEFINITIONS[6]?.path).toBe('body.slot0.param')
    expect(BODY_GENE_DEFINITIONS[7]?.path).toBe('body.slot1.present')
    expect(BODY_GENE_DEFINITIONS[83]?.path).toBe('body.slot11.param')
    expect(BODY_GENE_DEFINITIONS[84]?.path).toBe('body.visual.pattern')
    expect(BODY_GENE_DEFINITIONS[85]?.path).toBe('body.visual.accentHue')
    expect(BODY_GENE_DEFINITIONS[86]?.path).toBe('body.outline.count')
    expect(BODY_GENE_DEFINITIONS[87]?.path).toBe('body.outline.radius0')
    expect(BODY_GENE_DEFINITIONS[102]?.path).toBe('body.outline.radius15')
    expect(BODY_GENE_DEFINITIONS[103]?.path).toBe('body.outline.angle0')
    expect(BODY_GENE_DEFINITIONS[118]?.path).toBe('body.outline.angle15')
    expect(OUTLINE_COUNT_INDEX).toBe(86)
    expect(outlineRadiusIndex(15)).toBe(102)
    expect(outlineAngleIndex(0)).toBe(103)
    expect(BODY_GENE_DEFINITIONS[86]).toMatchObject({ kind: 'int', min: 5, max: 16 })
    expect(new Set(BODY_GENE_DEFINITIONS.map((d) => d.path)).size).toBe(119)
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
})
