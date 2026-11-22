import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { AnatomyConfig, FounderPart, Genome, PartType } from '@evo/contracts'
import { capabilitiesOf } from '../../src/development/capabilities'
import { developAnatomy } from '../../src/development/develop'
import { bodyVectorOf } from '../../src/genetics/BodyGenes'
import { mouthsOf } from '../../src/organisms/mouths'
import { World } from '../../src/world/World'

// The limb levers (ADR 0029): a part hung on a tail sits far from the body, and a mouth there bit
// from there for free. Three config switches, all off by default: a cap on how far a mouth bites
// from the centre, carriers-only parents, and an upkeep price for the lever arm.

const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]
const LONG_TAIL = [1, 0.5, 0.5, 0.5, 0.5, 0.5] // a flagellum of the longest length, 2.5 body radii

function configWith(effects: Partial<AnatomyConfig['effects']> = {}): AnatomyConfig {
  return resolveWorldConfig({ anatomy: { structuralBudget: 40, effects } }).anatomy
}

const base = (anatomy: AnatomyConfig): FounderPart[] =>
  anatomy.founder.filter((p) => p.type !== 'mouth').map((p) => ({ ...p }))

/** The founder without its mouth, plus a tail (slot `base.length`) and a part hung on its tip. */
function limbBody(
  anatomy: AnatomyConfig,
  hung: PartType,
  carrier: PartType = 'flagellum'
): FounderPart[] {
  const parts = base(anatomy)
  const carrierSlot = parts.length
  parts.push({
    type: carrier,
    parent: 0,
    size: 0.5,
    angle: 1.2,
    offset: 1,
    orientation: 0,
    integrity: 1,
    stats: LONG_TAIL
  })
  parts.push({
    type: hung,
    parent: carrierSlot + 1,
    size: 0.3,
    angle: 0,
    offset: 1,
    orientation: 0,
    integrity: 1,
    stats: MID
  })
  return parts
}

const genomeOf = (anatomy: AnatomyConfig, parts: FounderPart[]): Genome =>
  ({
    body: {
      genes: bodyVectorOf({ parts, look: anatomy.founderLook, outline: anatomy.founderOutline })
    }
  }) as unknown as Genome

const developed = (anatomy: AnatomyConfig, parts: FounderPart[]) =>
  developAnatomy(
    bodyVectorOf({ parts, look: anatomy.founderLook, outline: anatomy.founderOutline }),
    anatomy
  )

/** `mouthsOf` takes the whole world config; only its anatomy matters here. */
const mouthPoints = (effects: Partial<AnatomyConfig['effects']>, parts?: FounderPart[]) => {
  const config = resolveWorldConfig({ anatomy: { structuralBudget: 40, effects } })
  const body = parts ?? limbBody(config.anatomy, 'mouth')
  return mouthsOf(genomeOf(config.anatomy, body), config)
}

const firstMouth = (effects: Partial<AnatomyConfig['effects']>): { x: number; y: number } =>
  mouthPoints(effects)[0] as { x: number; y: number }

const norm = (m: { x: number; y: number }): number => Math.sqrt(m.x * m.x + m.y * m.y)

describe('a mouth on a tail (the exploit)', () => {
  it('sits several body radii from the centre with the cap off (the measured problem)', () => {
    const [m] = mouthPoints({})
    expect(m).toBeDefined()
    expect(norm(m as { x: number; y: number })).toBeGreaterThan(2)
  })

  it('bites from no farther than maxMouthOffset, in the same direction', () => {
    const free = firstMouth({})
    const capped = firstMouth({ maxMouthOffset: 1.2 })
    expect(norm(capped)).toBeCloseTo(1.2, 12)
    // The same bearing: parallel and pointing the same way.
    expect(capped.x * free.y - capped.y * free.x).toBeCloseTo(0, 9)
    expect(capped.x * free.x + capped.y * free.y).toBeGreaterThan(0)
  })

  it('a lower cap pulls it closer, a cap of 0 leaves it where it was (negative)', () => {
    const near = mouthPoints({ maxMouthOffset: 1 })[0] as { x: number; y: number }
    const far = mouthPoints({ maxMouthOffset: 1.5 })[0] as { x: number; y: number }
    expect(norm(near)).toBeLessThan(norm(far))
    const off = mouthPoints({ maxMouthOffset: 0 })[0] as { x: number; y: number }
    const free = mouthPoints({})[0] as { x: number; y: number }
    expect(off).toEqual(free)
  })

  it('moves a mouth on the body not at all, and so no founder or starter (negative)', () => {
    const config = resolveWorldConfig({ anatomy: { structuralBudget: 40 } })
    const capped = resolveWorldConfig({
      anatomy: { structuralBudget: 40, effects: { maxMouthOffset: 1.2 } }
    })
    const bodies: Array<{ name: string; parts: FounderPart[] }> = [
      { name: 'founder', parts: config.anatomy.founder.map((p) => ({ ...p })) },
      ...config.anatomy.starters.map((s) => ({
        name: s.name,
        parts: s.parts.map((p) => ({ ...p }))
      }))
    ]
    for (const { parts } of bodies) {
      const a = mouthsOf(genomeOf(config.anatomy, parts), config)
      const b = mouthsOf(genomeOf(capped.anatomy, parts), capped)
      expect(b).toEqual(a)
    }
  })

  it('clamps each mouth on its own', () => {
    const config = resolveWorldConfig({
      anatomy: { structuralBudget: 40, effects: { maxMouthOffset: 1.2 } }
    })
    const parts = limbBody(config.anatomy, 'mouth')
    parts.unshift() // keep the founder's own mouth out; add a body mouth after the limb
    parts.push({
      type: 'mouth',
      parent: 0,
      size: 0.4,
      angle: 0,
      offset: 1,
      orientation: 0,
      integrity: 1,
      stats: MID
    })
    const points = mouthsOf(genomeOf(config.anatomy, parts), config)
    expect(points).toHaveLength(2)
    expect(norm(points[0] as { x: number; y: number })).toBeCloseTo(1.2, 12)
    expect(norm(points[1] as { x: number; y: number })).toBeLessThanOrEqual(1.2)
  })
})

describe('carrierParentsOnly', () => {
  it('attaches a part hung on a flagellum to the body instead, where a body-attached part would sit', () => {
    const off = configWith({ carrierParentsOnly: 0 })
    const on = configWith({ carrierParentsOnly: 1 })
    const hungOff = developed(off, limbBody(off, 'eye')).parts.at(-1)
    const hungOn = developed(on, limbBody(on, 'eye')).parts.at(-1)
    expect(hungOff?.parent).toBeGreaterThanOrEqual(0)
    expect(hungOn?.parent).toBe(-1)
    // Placed as if its own parent were the body (angle 0 on the outline), not at the tail's tip.
    const parts = limbBody(on, 'eye')
    parts[parts.length - 1] = { ...(parts.at(-1) as FounderPart), parent: 0 }
    const direct = developed(on, parts).parts.at(-1)
    expect(hungOn?.x).toBeCloseTo(direct?.x as number, 12)
    expect(hungOn?.y).toBeCloseTo(direct?.y as number, 12)
  })

  it('does the same for cilia, and a tail mouth then bites from the body', () => {
    const on = configWith({ carrierParentsOnly: 1 })
    const cilia = developed(on, limbBody(on, 'mouth', 'cilia')).parts.at(-1)
    expect(cilia?.parent).toBe(-1)
    const m = firstMouth({ carrierParentsOnly: 1 })
    expect(norm(m)).toBeLessThan(1.5)
  })

  it('keeps a part on an eyestalk, a skeleton or a join (negative: only tails are refused)', () => {
    const on = configWith({ carrierParentsOnly: 1 })
    for (const carrier of ['eyestalk', 'skeleton', 'join'] as const) {
      const part = developed(on, limbBody(on, 'eye', carrier)).parts.at(-1)
      expect(part?.parent).toBeGreaterThanOrEqual(0)
    }
  })

  it('off leaves every founder and starter exactly as developed before (negative)', () => {
    const off = configWith({ carrierParentsOnly: 0 })
    const on = configWith({ carrierParentsOnly: 1 })
    for (const plan of [off.founder, ...off.starters.map((s) => s.parts)]) {
      const parts = plan.map((p) => ({ ...p }))
      expect(developed(on, parts)).toEqual(developed(off, parts))
    }
  })
})

describe('limbUpkeep', () => {
  const upkeepOf = (
    effects: Partial<AnatomyConfig['effects']>,
    hung: PartType,
    parented: boolean
  ) => {
    const anatomy = configWith(effects)
    const parts = limbBody(anatomy, hung)
    if (!parented) parts[parts.length - 1] = { ...(parts.at(-1) as FounderPart), parent: 0 }
    const body = developed(anatomy, parts)
    return { caps: capabilitiesOf(body, anatomy, 1, 4, []), body }
  }

  it('prices a part hung on a tail by size and by how far out it sits, exactly', () => {
    const off = upkeepOf({}, 'mouth', true)
    const on = upkeepOf({ limbUpkeep: 0.05 }, 'mouth', true)
    const hung = on.body.parts.at(-1) as { x: number; y: number; size: number }
    const out = Math.sqrt(hung.x * hung.x + hung.y * hung.y) / on.body.outline.areaRadius
    expect(out).toBeGreaterThan(2)
    expect(on.caps.upkeep - off.caps.upkeep).toBeCloseTo(0.05 * hung.size * (out - 1), 12)
  })

  it('charges nothing for a part on the body, or with the price at 0 (negative)', () => {
    const off = upkeepOf({}, 'mouth', false)
    const on = upkeepOf({ limbUpkeep: 0.05 }, 'mouth', false)
    expect(on.caps.upkeep).toBe(off.caps.upkeep)
    const zero = upkeepOf({ limbUpkeep: 0 }, 'mouth', true)
    const free = upkeepOf({}, 'mouth', true)
    expect(zero.caps.upkeep).toBe(free.caps.upkeep)
  })

  it('leaves the founder and every body with no part on a part with the same upkeep (the reference stays 1)', () => {
    const off = configWith({})
    const on = configWith({ limbUpkeep: 0.05 })
    const plans = [
      { name: 'founder', parts: off.founder },
      ...off.starters.map((s) => ({ name: s.name, parts: s.parts }))
    ]
    const priced: string[] = []
    for (const { name, parts: plan } of plans) {
      const parts = plan.map((p) => ({ ...p }))
      const a = capabilitiesOf(developed(off, parts), off, 1, 4, [])
      const b = capabilitiesOf(developed(on, parts), on, 1, 4, [])
      if (parts.some((p) => p.parent !== 0)) {
        // A part carried by a stalk sits beyond the rim, so a body built that way pays (and only it).
        expect(b.upkeep).toBeGreaterThan(a.upkeep)
        priced.push(name)
      } else {
        expect(b.upkeep).toBe(a.upkeep)
      }
    }
    expect(plans[0]?.parts.every((p) => p.parent === 0)).toBe(true)
    // Recorded, so a new starter that hangs parts is a visible decision, not a surprise.
    expect(priced).toEqual(['scout'])
  })
})

describe('configuration', () => {
  it('defaults every lever off', () => {
    const { effects } = resolveWorldConfig({}).anatomy
    expect(effects.maxMouthOffset).toBe(0)
    expect(effects.carrierParentsOnly).toBe(0)
    expect(effects.limbUpkeep).toBe(0)
  })

  it('accepts 0 and a cap of a radius or more, and rejects the rest (negatives)', () => {
    const effects = (e: object) => () => resolveWorldConfig({ anatomy: { effects: e } } as never)
    expect(effects({ maxMouthOffset: 0 })).not.toThrow()
    expect(effects({ maxMouthOffset: 1 })).not.toThrow()
    expect(effects({ maxMouthOffset: 1.2 })).not.toThrow()
    expect(effects({ maxMouthOffset: 0.5 })).toThrow(/maxMouthOffset/)
    expect(effects({ maxMouthOffset: -1 })).toThrow(/maxMouthOffset/)
    expect(effects({ carrierParentsOnly: 1 })).not.toThrow()
    expect(effects({ carrierParentsOnly: 2 })).toThrow(/carrierParentsOnly/)
    expect(effects({ limbUpkeep: 0.01 })).not.toThrow()
    expect(effects({ limbUpkeep: -0.01 })).toThrow(/limbUpkeep/)
  })
})

describe('a world with every lever on', () => {
  const config = {
    anatomy: { effects: { maxMouthOffset: 1.2, carrierParentsOnly: 1, limbUpkeep: 0.02 } }
  }

  it('is deterministic, and the same stepped, chunked or run at once', () => {
    const a = World.create({ seed: 4, config })
    a.run(1500)
    const b = World.create({ seed: 4, config })
    b.run(600)
    b.run(900)
    expect(b.stateHash()).toBe(a.stateHash())
    expect(a.isExtinct).toBe(false)
  })

  it('is the same world as the default one while no body hangs a part on a tail (negative: founders have no limbs)', () => {
    const plain = World.create({ seed: 4 })
    const levers = World.create({ seed: 4, config })
    // Founders have no parented parts, so the first ticks cannot differ.
    plain.run(300)
    levers.run(300)
    expect(levers.stateHash()).toBe(plain.stateHash())
  })
})
