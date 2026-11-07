import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import {
  BODY_SLOT_COUNT,
  OUTLINE_COUNT_INDEX,
  PART_STATS,
  PART_TYPES,
  outlineAngleIndex,
  outlineRadiusIndex,
  slotGeneIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { AnatomyConfig, AnatomyPart, FounderPart, PartType } from '@evo/contracts'
import { developAnatomy, resolveFunctional } from '../../src/development/develop'
import { developOutline, rimAt } from '../../src/development/outline'
import { founderBodyVector } from '../../src/genetics/BodyGenes'

export const part = (type: PartType, extra: Partial<FounderPart> = {}): FounderPart => ({
  type,
  parent: 0,
  size: 0.5,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  integrity: 1,
  stats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  ...extra
})

/** An anatomy config whose founder is exactly these parts. */
export function configWith(parts: FounderPart[], budget = 6): AnatomyConfig {
  return resolveWorldConfig({ anatomy: { founder: parts, structuralBudget: budget } }).anatomy
}

/** The body this config's founders carry. */
const grow = (config: AnatomyConfig) => developAnatomy(founderBodyVector(config), config)

describe('developAnatomy', () => {
  const defaults = resolveWorldConfig().anatomy
  const anatomy = grow(defaults)

  it('grows the founder body: seven working parts using 3.5 of the budget', () => {
    expect(anatomy.parts.map((p) => p.type)).toEqual([
      'flagellum',
      'flagellum',
      'cilia',
      'cilia',
      'eye',
      'mouth',
      'stomach'
    ])
    expect(anatomy.parts.every((p) => p.functional)).toBe(true)
    expect(anatomy.parts.map((p) => p.slot)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(anatomy.sizeUsed).toBeCloseTo(3.5, 12)
    expect(anatomy.undeveloped).toEqual([])
    expect(anatomy.look).toEqual(defaults.founderLook)
  })

  it('anchors a surface part exactly on the outline at its angle', () => {
    const body = founderBodyVector(defaults)
    const outline = developOutline(body)
    for (const angle of [0, 0.7, Math.PI / 2, 2.6, Math.PI, 4.4, 5.9]) {
      // offset is ignored for surface parts: it must not move a mouth off the rim
      const grown = grow(configWith([part('mouth', { angle, offset: 0.2 })])).parts[0]
      const rim = rimAt(outline, angle)
      expect(grown?.x).toBeCloseTo(rim.x, 12)
      expect(grown?.y).toBeCloseTo(rim.y, 12)
    }
  })

  it('places an interior part at offset times the outline radius at its angle', () => {
    const body = founderBodyVector(defaults)
    const outline = developOutline(body)
    const rim = rimAt(outline, Math.PI / 2)
    const eye = grow(configWith([part('eye', { angle: Math.PI / 2, offset: 0.5 })])).parts[0]
    expect(eye?.x).toBeCloseTo(0.5 * rim.x, 12)
    expect(eye?.y).toBeCloseTo(0.5 * rim.y, 12)
    const centre = grow(configWith([part('stomach', { offset: 0 })])).parts[0]
    expect([centre?.x, centre?.y]).toEqual([0, 0])
  })

  it('never puts a part outside the body outline, whatever the genes (random bodies)', () => {
    let state = 12345
    const next = (): number => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state / 4294967296
    }
    for (let trial = 0; trial < 60; trial++) {
      const vector = founderBodyVector(defaults)
      // a random outline and random part genes
      for (let i = 0; i < 16; i++) {
        vector[outlineRadiusIndex(i)] = 0.35 + 0.65 * next()
        vector[outlineAngleIndex(i)] = next()
      }
      vector[OUTLINE_COUNT_INDEX] = 5 + Math.floor(next() * 12)
      for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
        vector[slotGeneIndex(slot, 'present')] = 1
        vector[slotGeneIndex(slot, 'type')] = Math.floor(next() * PART_TYPES.length)
        vector[slotGeneIndex(slot, 'size')] = 0.1 + 0.2 * next()
        vector[slotGeneIndex(slot, 'angle')] = next() * 2 * Math.PI
        vector[slotGeneIndex(slot, 'offset')] = next()
        vector[slotGeneIndex(slot, 'orientation')] = next() * 2 * Math.PI
        vector[slotGeneIndex(slot, 'parent')] = 0
      }
      const grown = developAnatomy(vector, { ...defaults, structuralBudget: 12 })
      const outline = developOutline(vector)
      for (const p of grown.parts) {
        const rim = rimAt(outline, Math.atan2(p.y, p.x))
        const distance = Math.hypot(p.x, p.y)
        // inside (or on) the outline, with only float rounding to spare
        expect(distance).toBeLessThanOrEqual(Math.hypot(rim.x, rim.y) + 1e-9)
      }
    }
  })

  it('points a body part along the outward direction, turned by its orientation', () => {
    // the mouth at the front, orientation 0: the axis is straight outward, about +x
    const mouth = grow(configWith([part('mouth', { angle: 0, orientation: 0 })])).parts[0]
    expect(Math.cos(mouth?.axis ?? NaN)).toBeGreaterThan(0.9)
    const turned = grow(configWith([part('mouth', { angle: 0, orientation: Math.PI })])).parts[0]
    expect(Math.cos(turned?.axis ?? NaN)).toBeLessThan(-0.9)
  })

  it('carries size, integrity and the stats through, decoding them to real units', () => {
    const stats = [1, 0, 0.25, 0.5, 0.5, 0.5]
    const p = part('flagellum', { size: 0.77, integrity: 0.4, stats })
    const grown = grow(configWith([p])).parts[0]
    expect(grown).toMatchObject({ type: 'flagellum', size: 0.77, integrity: 0.4, stats, slot: 0 })
    // length gene 1 is the top of its range, thickness gene 0 the bottom
    expect(grown?.statValues['length']).toBeCloseTo(PART_STATS.flagellum[0]?.max ?? NaN, 12)
    expect(grown?.statValues['thickness']).toBeCloseTo(PART_STATS.flagellum[1]?.min ?? NaN, 12)
    expect(Object.keys(grown?.statValues ?? {})).toEqual([
      'length',
      'thickness',
      'force',
      'efficiency'
    ])
  })

  describe('parents', () => {
    const flagellumWithChild = (child: Partial<FounderPart>, parent: Partial<FounderPart> = {}) =>
      grow(
        configWith([
          part('flagellum', { angle: Math.PI, stats: [1, 0.5, 0.5, 0.5, 0.5, 0.5], ...parent }),
          part('eye', { parent: 1, offset: 0.5, ...child })
        ])
      ).parts

    it("hangs a child along its parent's axis, offset being the fraction of its length", () => {
      const [parent, child] = flagellumWithChild({ offset: 1 }) as [AnatomyPart, AnatomyPart]
      expect(child.parent).toBe(0)
      expect(child.x).toBeCloseTo(parent.tipX, 12)
      expect(child.y).toBeCloseTo(parent.tipY, 12)
      const half = flagellumWithChild({ offset: 0.5 })[1] as AnatomyPart
      expect(half.x).toBeCloseTo((parent.x + parent.tipX) / 2, 12)
      expect(half.y).toBeCloseTo((parent.y + parent.tipY) / 2, 12)
      // a flagellum at its longest reaches well beyond the body
      expect(Math.hypot(parent.tipX - parent.x, parent.tipY - parent.y)).toBeGreaterThan(1)
    })

    it("points a child relative to its parent's axis", () => {
      const [parent, straight, turned] = grow(
        configWith([
          part('flagellum', { angle: Math.PI }),
          part('eye', { parent: 1, orientation: 0 }),
          part('eye', { parent: 1, orientation: Math.PI / 2 })
        ])
      ).parts as [AnatomyPart, AnatomyPart, AnatomyPart]
      expect(straight.axis).toBeCloseTo(parent.axis, 12)
      const difference = Math.abs(
        Math.atan2(Math.sin(turned.axis - parent.axis), Math.cos(turned.axis - parent.axis))
      )
      expect(difference).toBeCloseTo(Math.PI / 2, 9)
    })

    it('attaches a part to the body when its parent is not an earlier developed part', () => {
      // parent 3 names slot 2, which is not before slot 1 (the config would refuse it; mutation can make it)
      const vector = founderBodyVector(configWith([part('eye'), part('eye')]))
      vector[slotGeneIndex(1, 'parent')] = 3
      const parts = developAnatomy(vector, defaults).parts
      expect(parts.map((p) => p.parent)).toEqual([-1, -1])
      // parent 1 on the first slot would be itself
      const solo = developAnatomy(
        (() => {
          const vector = founderBodyVector(configWith([part('eye')]))
          vector[slotGeneIndex(0, 'parent')] = 1
          return vector
        })(),
        defaults
      ).parts
      expect(solo[0]?.parent).toBe(-1)
    })

    it('attaches to the body when the parent did not develop (the budget was spent)', () => {
      const vector = founderBodyVector(
        configWith(
          [
            part('armor', { size: 1 }),
            part('flagellum', { size: 1 }),
            part('eye', { size: 0.1, parent: 2 })
          ],
          6
        )
      )
      // slot 1 (the flagellum) does not fit; the eye that named it as parent hangs from the body
      const grown = developAnatomy(vector, { ...defaults, structuralBudget: 1.5 })
      expect(grown.undeveloped).toContain(1)
      expect(grown.parts.map((p) => [p.slot, p.parent])).toEqual([
        [0, -1],
        [2, -1]
      ])
    })

    it('makes a child dormant when its parent does not work (and not otherwise)', () => {
      // a stomach with no mouth is dormant, so the eye hanging from it is too
      const dormantParent = grow(configWith([part('stomach'), part('eye', { parent: 1 })])).parts
      expect(dormantParent.map((p) => p.functional)).toEqual([false, false])
      const working = grow(
        configWith([part('mouth'), part('stomach', { parent: 0 }), part('eye', { parent: 2 })])
      ).parts
      expect(working.map((p) => p.functional)).toEqual([true, true, true])
    })
  })

  it('skips empty slots and keeps slot order, with gaps', () => {
    const vector = founderBodyVector(configWith([part('eye'), part('mouth'), part('armor')]))
    vector[slotGeneIndex(1, 'present')] = 0
    const grown = developAnatomy(vector, defaults)
    expect(grown.parts.map((p) => [p.slot, p.type])).toEqual([
      [0, 'eye'],
      [2, 'armor']
    ])
  })

  it('does not develop parts beyond the structural budget; lower slots win', () => {
    const big = Array.from({ length: 5 }, () => part('armor', { size: 1 }))
    const vector = founderBodyVector(configWith(big, 6))
    const grown = developAnatomy(vector, { ...defaults, structuralBudget: 3.5 })
    expect(grown.parts.map((p) => p.slot)).toEqual([0, 1, 2])
    expect(grown.undeveloped).toEqual([3, 4])
    expect(grown.sizeUsed).toBe(3)
    expect(grown.sizeUsed).toBeLessThanOrEqual(3.5)
  })

  it('lets a small later part develop after a big one was refused', () => {
    const vector = founderBodyVector(
      configWith(
        [part('armor', { size: 1 }), part('armor', { size: 1 }), part('eye', { size: 0.1 })],
        6
      )
    )
    const tight = { ...defaults, structuralBudget: 2.1 }
    const grown = developAnatomy(vector, tight)
    expect(grown.parts.map((p) => p.slot)).toEqual([0, 1, 2])
    const tighter = { ...defaults, structuralBudget: 1.5 }
    const second = developAnatomy(vector, tighter)
    expect(second.parts.map((p) => p.slot)).toEqual([0, 2])
    expect(second.undeveloped).toEqual([1])
  })

  it('ignores a slot whose type index is outside the vocabulary', () => {
    const vector = founderBodyVector(defaults)
    vector[slotGeneIndex(0, 'type')] = PART_TYPES.length + 3
    expect(developAnatomy(vector, defaults).parts.some((p) => p.slot === 0)).toBe(false)
  })

  it('treats only a present gene of exactly 1 as a part', () => {
    const vector = founderBodyVector(defaults)
    vector[slotGeneIndex(0, 'present')] = 0.5
    expect(developAnatomy(vector, defaults).parts.some((p) => p.slot === 0)).toBe(false)
  })

  it('reads the visual genes', () => {
    const vector = founderBodyVector(defaults)
    vector[visualGeneIndex('pattern')] = 3
    vector[visualGeneIndex('accentHue')] = 0.75
    expect(developAnatomy(vector, defaults).look).toEqual({ pattern: 3, accentHue: 0.75 })
  })

  it('is pure: same genes, same body; the input is not modified', () => {
    const vector = founderBodyVector(defaults)
    const copy = [...vector]
    const a = developAnatomy(vector, defaults)
    const b = developAnatomy(vector, defaults)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(vector).toEqual(copy)
    expect(BODY_SLOT_COUNT).toBeGreaterThanOrEqual(a.parts.length)
  })
})

describe('dependencies in the production vocabulary', () => {
  const functional = (parts: FounderPart[]) =>
    Object.fromEntries(grow(configWith(parts)).parts.map((p) => [p.type, p.functional]))

  it('make a stomach, an intestine and a mender depend on a mouth (and the mender on the stomach)', () => {
    expect(functional([part('stomach'), part('intestine'), part('mender')])).toEqual({
      stomach: false,
      intestine: false,
      mender: false
    })
    expect(functional([part('mouth'), part('stomach'), part('intestine'), part('mender')])).toEqual(
      {
        mouth: true,
        stomach: true,
        intestine: true,
        mender: true
      }
    )
    // a mender needs the stomach, not just the mouth
    expect(functional([part('mouth'), part('mender')])).toEqual({ mouth: true, mender: false })
  })

  it('does not depend on the order of the parts', () => {
    expect(functional([part('mender'), part('stomach'), part('mouth')])).toEqual({
      mender: true,
      stomach: true,
      mouth: true
    })
  })

  it('keeps a dormant part in the body (it has mass and upkeep) but marks it not functional', () => {
    const grown = grow(configWith([part('mender')]))
    expect(grown.parts).toHaveLength(1)
    expect(grown.parts[0]?.functional).toBe(false)
  })
})

describe('resolveFunctional (generic over the dependency table)', () => {
  // ADR 0004 section 10: gland -> sac -> stinger
  const venom = [
    { type: 'gland', requires: [], provides: ['toxin'] },
    { type: 'sac', requires: ['toxin'], provides: ['stored-toxin'] },
    { type: 'stinger', requires: ['stored-toxin'], provides: ['venom-delivery'] },
    { type: 'spike', requires: [], provides: [] }
  ]

  it('works through a whole chain, in any order', () => {
    expect(resolveFunctional(['gland', 'sac', 'stinger'], venom)).toEqual([true, true, true])
    expect(resolveFunctional(['stinger', 'sac', 'gland'], venom)).toEqual([true, true, true])
    expect(resolveFunctional(['sac', 'gland', 'stinger', 'spike'], venom)).toEqual([
      true,
      true,
      true,
      true
    ])
  })

  it('breaks the chain where a link is missing: a stinger without venom is just a spike', () => {
    expect(resolveFunctional(['sac', 'stinger'], venom)).toEqual([false, false])
    expect(resolveFunctional(['gland', 'stinger'], venom)).toEqual([true, false])
    expect(resolveFunctional(['stinger'], venom)).toEqual([false])
  })

  it('lets a requirement be met by any functional part that provides it', () => {
    expect(resolveFunctional(['gland', 'gland', 'sac'], venom)).toEqual([true, true, true])
  })

  it('never makes a cycle functional, and does not loop', () => {
    const cyclic = [
      { type: 'a', requires: ['y'], provides: ['x'] },
      { type: 'b', requires: ['x'], provides: ['y'] }
    ]
    expect(resolveFunctional(['a', 'b'], cyclic)).toEqual([false, false])
  })

  it('treats a type with no definition as not functional, and handles no parts', () => {
    expect(resolveFunctional(['unknown'], venom)).toEqual([false])
    expect(resolveFunctional([], venom)).toEqual([])
  })
})
