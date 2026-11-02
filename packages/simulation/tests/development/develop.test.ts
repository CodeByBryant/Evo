import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { BODY_SLOT_COUNT, PART_TYPES, slotGeneIndex, visualGeneIndex } from '@evo/contracts'
import type { AnatomyConfig, FounderPart, PartType } from '@evo/contracts'
import { developAnatomy, resolveFunctional } from '../../src/development/develop'
import { founderBodyVector } from '../../src/genetics/BodyGenes'

const part = (type: PartType, extra: Partial<FounderPart> = {}): FounderPart => ({
  type,
  size: 0.5,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  param: 0.5,
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

  it('places parts in polar coordinates in the body frame (x forward, y left)', () => {
    const front = grow(configWith([part('mouth', { angle: 0, offset: 1 })])).parts[0]
    expect(front?.x).toBeCloseTo(1, 12)
    expect(front?.y).toBeCloseTo(0, 12)
    const left = grow(configWith([part('eye', { angle: Math.PI / 2, offset: 0.5 })])).parts[0]
    expect(left?.x).toBeCloseTo(0, 12)
    expect(left?.y).toBeCloseTo(0.5, 12)
    const rear = grow(configWith([part('armor', { angle: Math.PI, offset: 0.4 })])).parts[0]
    expect(rear?.x).toBeCloseTo(-0.4, 12)
    const centre = grow(configWith([part('armor', { offset: 0 })])).parts[0]
    expect([centre?.x, centre?.y]).toEqual([0, 0])
  })

  it('carries every part parameter through unchanged', () => {
    const p = part('sniffer', { size: 0.77, angle: 2, offset: 0.9, orientation: 4, param: 0.33 })
    const grown = grow(configWith([p])).parts[0]
    expect(grown).toMatchObject({
      type: 'sniffer',
      size: 0.77,
      angle: 2,
      offset: 0.9,
      orientation: 4,
      param: 0.33,
      slot: 0
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
    vector[visualGeneIndex('shape')] = 8
    vector[visualGeneIndex('pattern')] = 3
    vector[visualGeneIndex('accentHue')] = 0.75
    expect(developAnatomy(vector, defaults).look).toEqual({ shape: 8, pattern: 3, accentHue: 0.75 })
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
