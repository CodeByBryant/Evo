import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { AnatomyConfig, FounderPart, PartType } from '@evo/contracts'
import { capabilitiesOf } from '../../src/development/capabilities'
import { developAnatomy } from '../../src/development/develop'
import { bodyVectorOf } from '../../src/genetics/BodyGenes'
import { World } from '../../src/world/World'

// limbEfficiency (ADR 0030): a part hung on a part delivers a share of its power for every parent on
// its chain that is not a carrier; mass and upkeep stay full.

const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
const LONG_TAIL = [1, 0.5, 0.5, 0.5, 0.5, 0.5]

const configWith = (limbEfficiency: number): AnatomyConfig =>
  resolveWorldConfig({ anatomy: { structuralBudget: 40, effects: { limbEfficiency } } }).anatomy

const part = (type: PartType, parent: number, stats = MID, size = 0.4): FounderPart => ({
  type,
  parent,
  size,
  angle: 1.2,
  offset: 1,
  orientation: 0,
  integrity: 1,
  stats
})

/** The founder without its mouth, then `chain` hung one on the next, the first on the body (parent 0). */
function chained(anatomy: AnatomyConfig, chain: PartType[]): FounderPart[] {
  const parts = anatomy.founder.filter((p) => p.type !== 'mouth').map((p) => ({ ...p }))
  let parent = 0
  for (const type of chain) {
    parts.push(part(type, parent, type === 'flagellum' ? LONG_TAIL : MID))
    parent = parts.length // the part just added is in slot `parts.length - 1`, so parent `parts.length`
  }
  return parts
}

const capsOf = (anatomy: AnatomyConfig, parts: FounderPart[]) =>
  capabilitiesOf(
    developAnatomy(
      bodyVectorOf({ parts, look: anatomy.founderLook, outline: anatomy.founderOutline }),
      anatomy
    ),
    anatomy,
    1,
    4,
    []
  )

describe('limbEfficiency', () => {
  it('halves a mouth on a tail and quarters one on a tail on a tail (bite size, bite rate)', () => {
    const one = configWith(1)
    const half = configWith(0.5)
    const body = capsOf(one, chained(one, ['mouth']))
    const onTail = capsOf(one, chained(one, ['flagellum', 'mouth']))
    const onTailHalf = capsOf(half, chained(half, ['flagellum', 'mouth']))
    const onTwoTails = capsOf(half, chained(half, ['flagellum', 'flagellum', 'mouth']))
    const onTwoTailsFull = capsOf(one, chained(one, ['flagellum', 'flagellum', 'mouth']))
    // A mouth on the body is untouched by any value (negative: only hung parts are cut).
    expect(capsOf(half, chained(half, ['mouth'])).biteSize).toBeCloseTo(body.biteSize, 12)
    // One hop halves, two hops quarter.
    expect(onTailHalf.biteSize).toBeCloseTo(0.5 * onTail.biteSize, 12)
    expect(onTailHalf.biteRate).toBeCloseTo(0.5 * onTail.biteRate, 12)
    expect(onTwoTails.biteSize).toBeCloseTo(0.25 * onTwoTailsFull.biteSize, 12)
  })

  it('leaves mass and upkeep exactly as they were (the weaker part still weighs and costs)', () => {
    const one = configWith(1)
    const quarter = configWith(0.25)
    const a = capsOf(one, chained(one, ['flagellum', 'mouth']))
    const b = capsOf(quarter, chained(quarter, ['flagellum', 'mouth']))
    expect(b.mass).toBe(a.mass)
    expect(b.upkeep).toBe(a.upkeep)
  })

  it('does not cut a part on a carrier: an eye on an eyestalk is as good as before (negative)', () => {
    const one = configWith(1)
    const half = configWith(0.5)
    const a = capsOf(one, chained(one, ['eyestalk', 'eye']))
    const b = capsOf(half, chained(half, ['eyestalk', 'eye']))
    expect(b.senseRange).toBe(a.senseRange)
    // But an eye on a tail is cut (the same body shape with a tail instead of the stalk).
    const onTail = capsOf(one, chained(one, ['flagellum', 'eye']))
    const onTailHalf = capsOf(half, chained(half, ['flagellum', 'eye']))
    expect(onTailHalf.senseRange).toBeLessThan(onTail.senseRange)
  })

  it('leaves the founder and every starter exactly as they were (negative: none hangs a part on a tail)', () => {
    const one = configWith(1)
    const quarter = configWith(0.25)
    for (const plan of [one.founder, ...one.starters.map((s) => s.parts)]) {
      const parts = plan.map((p) => ({ ...p }))
      expect(capsOf(quarter, parts)).toEqual(capsOf(one, parts))
    }
  })

  it('a dormant part stays dormant: a stomach on a tail with no mouth does nothing at any value', () => {
    const one = configWith(1)
    const quarter = configWith(0.25)
    const noMouth = (a: AnatomyConfig): FounderPart[] => chained(a, ['flagellum', 'stomach'])
    expect(capsOf(quarter, noMouth(quarter)).energyCapacity).toBe(
      capsOf(one, noMouth(one)).energyCapacity
    )
  })

  it('1 is the old behaviour for every body of a living world (property)', () => {
    const world = World.create({ seed: 4 })
    world.run(3000)
    const explicit = configWith(1)
    const plain = resolveWorldConfig({ anatomy: { structuralBudget: 40 } }).anatomy
    for (const o of world.snapshot().organisms) {
      const view = world.anatomyOf(o.id)
      if (view === undefined) continue
      expect(capabilitiesOf(view.anatomy, explicit, 1, 4, [])).toEqual(
        capabilitiesOf(view.anatomy, plain, 1, 4, [])
      )
    }
  })
})

describe('limbEfficiency configuration', () => {
  it('defaults to 1 and accepts anything above 0 up to 1; rejects the rest (negatives)', () => {
    expect(resolveWorldConfig({}).anatomy.effects.limbEfficiency).toBe(1)
    const set = (v: number) => () =>
      resolveWorldConfig({ anatomy: { effects: { limbEfficiency: v } } } as never)
    expect(set(0.5)).not.toThrow()
    expect(set(1)).not.toThrow()
    expect(set(0.01)).not.toThrow()
    expect(set(0)).toThrow(/limbEfficiency/)
    expect(set(-0.5)).toThrow(/limbEfficiency/)
    expect(set(1.5)).toThrow(/limbEfficiency/)
  })
})

describe('a world with limbEfficiency 0.5', () => {
  const config = { anatomy: { effects: { limbEfficiency: 0.5 } } }

  it('is deterministic, and the same stepped, chunked or run at once', () => {
    const a = World.create({ seed: 4, config })
    a.run(1500)
    const b = World.create({ seed: 4, config })
    b.run(600)
    b.run(900)
    expect(b.stateHash()).toBe(a.stateHash())
    expect(a.isExtinct).toBe(false)
  })

  it('is the world without it while no body hangs a part on a tail (negative: founders have none)', () => {
    const plain = World.create({ seed: 4 })
    const cut = World.create({ seed: 4, config })
    plain.run(300)
    cut.run(300)
    expect(cut.stateHash()).toBe(plain.stateHash())
  })
})
