import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { BODY_SLOT_COUNT, PART_TYPES, slotGeneIndex } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { mutateVector } from '../../src/genetics/Mutation'
import { geneticsStream, sameState, synthetic } from './helpers'

const FULL = { rate: 1, strength: 1 }

describe('category genes jump', () => {
  // g.kind is a category of six values; g.step is an ordinary integer for the negative.
  const specs = synthetic([
    { path: 'g.kind', kind: 'int', min: 0, max: 5, baseline: 2, jump: true },
    { path: 'g.step', kind: 'int', min: 0, max: 5, baseline: 2 }
  ])

  it('reaches every other value, never the current one, with about equal chance', () => {
    const counts = new Map<number, number>()
    const runs = 3000
    for (let seed = 0; seed < runs; seed++) {
      const out = mutateVector([2, 2], specs, geneticsStream(seed), FULL)[0] as number
      expect(Number.isInteger(out)).toBe(true)
      counts.set(out, (counts.get(out) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual([0, 1, 3, 4, 5])
    for (const count of counts.values()) {
      // five values, 600 each expected; three standard deviations is about 66
      expect(Math.abs(count - runs / 5)).toBeLessThan(80)
    }
  })

  it('is uniform at a lower rate too (the gate draw is rescaled by the rate)', () => {
    const rare = synthetic([
      { path: 'g.kind', kind: 'int', min: 0, max: 5, baseline: 2, jump: true, mutationRate: 0.2 }
    ])
    const counts = new Map<number, number>()
    let fired = 0
    for (let seed = 0; seed < 10_000; seed++) {
      const out = mutateVector([2], rare, geneticsStream(seed), FULL)[0] as number
      if (out === 2) continue
      fired++
      counts.set(out, (counts.get(out) ?? 0) + 1)
    }
    expect(fired).toBeGreaterThan(1800)
    expect(fired).toBeLessThan(2200)
    expect([...counts.keys()].sort()).toEqual([0, 1, 3, 4, 5])
    for (const count of counts.values()) expect(Math.abs(count - fired / 5)).toBeLessThan(70)
  })

  it('an ordinary integer gene still moves by one step (the negative)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const out = mutateVector([2, 2], specs, geneticsStream(seed), FULL)[1] as number
      expect(Math.abs(out - 2)).toBe(1)
    }
  })

  it('jumps from either end of the range and stays inside it', () => {
    for (let seed = 0; seed < 300; seed++) {
      const low = mutateVector([0, 2], specs, geneticsStream(seed), FULL)[0] as number
      const high = mutateVector([5, 2], specs, geneticsStream(seed), FULL)[0] as number
      expect(low).toBeGreaterThanOrEqual(1)
      expect(low).toBeLessThanOrEqual(5)
      expect(high).toBeGreaterThanOrEqual(0)
      expect(high).toBeLessThanOrEqual(4)
    }
  })

  it('draws the same amount from the stream as a stepping gene', () => {
    const stepping = synthetic([
      { path: 'g.kind', kind: 'int', min: 0, max: 5, baseline: 2 },
      { path: 'g.step', kind: 'int', min: 0, max: 5, baseline: 2 }
    ])
    const a = geneticsStream(9)
    const b = geneticsStream(9)
    mutateVector([2, 2], specs, a, FULL)
    mutateVector([2, 2], stepping, b, FULL)
    expect(sameState(a, b)).toBe(true)
  })
})

describe('a gene switched on is drawn afresh', () => {
  // g.on switches g.kind, g.size and g.angle; g.kept has no switch.
  const table = (rate: number) =>
    synthetic([
      { path: 'g.on', kind: 'bool', min: 0, max: 1, baseline: 0, mutationRate: rate },
      {
        path: 'g.kind',
        kind: 'int',
        min: 0,
        max: 5,
        baseline: 0,
        jump: true,
        resetWith: 0,
        mutationRate: 0
      },
      { path: 'g.size', kind: 'float', min: 2, max: 4, baseline: 3, resetWith: 0, mutationRate: 0 },
      {
        path: 'g.angle',
        kind: 'circular',
        min: 0,
        max: 1,
        baseline: 0,
        resetWith: 0,
        mutationRate: 0
      },
      { path: 'g.kept', kind: 'float', min: 0, max: 1, baseline: 0.5, mutationRate: 0 }
    ])

  it('when the switch turns on, the genes behind it take random values across their ranges', () => {
    const kinds = new Set<number>()
    let low = Infinity
    let high = -Infinity
    for (let seed = 0; seed < 600; seed++) {
      const out = mutateVector([0, 0, 3, 0, 0.5], table(1), geneticsStream(seed), FULL)
      expect(out[0]).toBe(1)
      kinds.add(out[1] as number)
      expect(out[2]).toBeGreaterThanOrEqual(2)
      expect(out[2]).toBeLessThanOrEqual(4)
      low = Math.min(low, out[2] as number)
      high = Math.max(high, out[2] as number)
      expect(out[3]).toBeGreaterThanOrEqual(0)
      expect(out[3]).toBeLessThan(1)
      expect(out[4]).toBe(0.5) // not behind the switch
    }
    // every category, the latent one included, and sizes across the whole range
    expect([...kinds].sort()).toEqual([0, 1, 2, 3, 4, 5])
    expect(low).toBeLessThan(2.1)
    expect(high).toBeGreaterThan(3.9)
  })

  it('nothing is redrawn when the switch stays off, was already on, or turns off', () => {
    for (let seed = 0; seed < 100; seed++) {
      // stays off
      expect(mutateVector([0, 3, 2.5, 0.2, 0.5], table(0), geneticsStream(seed), FULL)).toEqual([
        0, 3, 2.5, 0.2, 0.5
      ])
      // already on
      expect(mutateVector([1, 3, 2.5, 0.2, 0.5], table(0), geneticsStream(seed), FULL)).toEqual([
        1, 3, 2.5, 0.2, 0.5
      ])
      // turns off: the genes keep their values (they are latent again)
      expect(mutateVector([1, 3, 2.5, 0.2, 0.5], table(1), geneticsStream(seed), FULL)).toEqual([
        0, 3, 2.5, 0.2, 0.5
      ])
    }
  })

  it('draws the same amount from the stream whether or not anything wakes', () => {
    const a = geneticsStream(4)
    const b = geneticsStream(4)
    mutateVector([0, 0, 3, 0, 0.5], table(1), a, FULL)
    mutateVector([0, 0, 3, 0, 0.5], table(0), b, FULL)
    expect(sameState(a, b)).toBe(true)
  })
})

describe('the body gene table', () => {
  const specsFor = (overrides?: WorldConfigOverrides) =>
    buildBodySpecs(resolveWorldConfig(overrides).anatomy)

  it('by default the type jumps and a slot wakes with a fresh type, size, placement and stats', () => {
    const specs = specsFor()
    for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
      const present = slotGeneIndex(slot, 'present')
      expect(specs[slotGeneIndex(slot, 'type')]).toMatchObject({ jump: true, resetWith: present })
      for (const field of ['size', 'angle', 'offset', 'orientation', 's0', 's5'] as const) {
        expect(specs[slotGeneIndex(slot, field)]?.resetWith).toBe(present)
      }
      // what a part hangs from and how well it developed are not redrawn
      expect(specs[slotGeneIndex(slot, 'parent')]?.resetWith).toBeUndefined()
      expect(specs[slotGeneIndex(slot, 'integrity')]?.resetWith).toBeUndefined()
      expect(specs[present]?.resetWith).toBeUndefined()
    }
  })

  it('with openTypes off no gene jumps or is redrawn (the earlier behaviour)', () => {
    const specs = specsFor({ anatomy: { mutation: { openTypes: false } } })
    for (const spec of specs) {
      expect(spec.jump).toBeUndefined()
      expect(spec.resetWith).toBeUndefined()
    }
  })

  it('a slot the founder leaves empty can wake as any part type, not only a flagellum', () => {
    const config = resolveWorldConfig()
    const specs = buildBodySpecs(config.anatomy)
    const base = founderBodyVector(config.anatomy)
    const free = Array.from({ length: BODY_SLOT_COUNT }, (_, slot) => slot).find(
      (slot) => base[slotGeneIndex(slot, 'present')] !== 1
    ) as number
    const woken = new Set<number>()
    // mutation pressure turned up so the slot wakes often; the types it wakes as are what matters
    for (let seed = 0; seed < 4000 && woken.size < PART_TYPES.length; seed++) {
      const out = mutateVector(base, specs, geneticsStream(seed), { rate: 20, strength: 1 })
      if (out[slotGeneIndex(free, 'present')] === 1) {
        woken.add(out[slotGeneIndex(free, 'type')] as number)
      }
    }
    expect(woken.size).toBe(PART_TYPES.length)

    // the negative: with openTypes off the same slot only ever wakes as its latent type or a neighbour
    const closed = buildBodySpecs(
      resolveWorldConfig({ anatomy: { mutation: { openTypes: false } } }).anatomy
    )
    const latent = base[slotGeneIndex(free, 'type')] as number
    for (let seed = 0; seed < 1500; seed++) {
      const out = mutateVector(base, closed, geneticsStream(seed), { rate: 20, strength: 1 })
      if (out[slotGeneIndex(free, 'present')] === 1) {
        expect(Math.abs((out[slotGeneIndex(free, 'type')] as number) - latent)).toBeLessThanOrEqual(
          1
        )
      }
    }
  })
})
