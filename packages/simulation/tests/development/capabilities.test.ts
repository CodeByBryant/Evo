import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { AnatomyConfig, FounderPart, PartType } from '@evo/contracts'
import {
  capabilitiesOf,
  capabilityFactors,
  sniffedKind,
  viewOf
} from '../../src/development/capabilities'
import { developAnatomy } from '../../src/development/develop'
import { buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { crossoverVector } from '../../src/genetics/Recombination'
import { mutateVector } from '../../src/genetics/Mutation'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'

const defaults = resolveWorldConfig().anatomy
const KINDS = 4

const part = (type: PartType, extra: Partial<FounderPart> = {}): FounderPart => ({
  type,
  size: 0.5,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  param: 0.5,
  ...extra
})

/** A developed part back as a founder part (only the fields a founder has). */
const asFounder = (p: FounderPart, extra: Partial<FounderPart> = {}): FounderPart =>
  part(p.type, {
    size: p.size,
    angle: p.angle,
    offset: p.offset,
    orientation: p.orientation,
    param: p.param,
    ...extra
  })

function bodyOf(parts: FounderPart[], overrides: Partial<AnatomyConfig> = {}) {
  const config = resolveWorldConfig({
    anatomy: { founder: parts, structuralBudget: 12, ...overrides }
  }).anatomy
  return developAnatomy(founderBodyVector(config), config)
}

const founderAnatomy = developAnatomy(founderBodyVector(defaults), defaults)
const founder = capabilitiesOf(founderAnatomy, defaults, 1, KINDS)
const raw = (parts: FounderPart[]) => capabilitiesOf(bodyOf(parts), defaults, 1, KINDS)
const factors = (parts: FounderPart[], scale = 1) =>
  capabilityFactors(capabilitiesOf(bodyOf(parts), defaults, scale, KINDS), founder)

describe('the founder body', () => {
  it('is exactly 1 against itself, for every factor', () => {
    const f = capabilityFactors(founder, founder)
    expect(f).toEqual({
      speed: 1,
      strafe: 1,
      turn: 1,
      senseRange: 1,
      foodDetection: [1, 1, 1, 1],
      reach: 1,
      digestion: 1,
      toxinDamage: 1,
      energyCapacity: 1,
      damageTaken: 1,
      temperatureTolerance: 1,
      regeneration: 1,
      upkeepDelta: 0
    })
  })

  it('has real, finite, positive capabilities of every thrust kind', () => {
    expect(founder.forwardThrust).toBeGreaterThan(0)
    expect(founder.lateralThrust).toBeGreaterThan(0)
    expect(founder.torque).toBeGreaterThan(0)
    for (const value of Object.values(founder).flat()) expect(Number.isFinite(value)).toBe(true)
    expect(founder.mass).toBeGreaterThan(defaults.bodyMass)
  })

  it('gives the same founder factors whether built from the world config or from scratch', () => {
    const view = viewOf(founderAnatomy, founder, defaults, 1, KINDS)
    expect(view.factors.speed).toBe(1)
    expect(view.factors.upkeepDelta).toBe(0)
  })
})

describe('thrust depends on where a part is and which way it pushes', () => {
  const rear = { angle: Math.PI, offset: 0.8 }

  it('a flagellum pushing forward drives forward speed but no strafing', () => {
    const c = raw([part('flagellum', { ...rear, orientation: 0 })])
    expect(c.forwardThrust).toBeGreaterThan(0)
    expect(c.lateralThrust).toBeCloseTo(0, 12)
  })

  it('pushing backward gives no forward thrust at all', () => {
    expect(raw([part('flagellum', { ...rear, orientation: Math.PI })]).forwardThrust).toBe(0)
  })

  it('pushing sideways strafes instead, either side', () => {
    for (const orientation of [Math.PI / 2, (3 * Math.PI) / 2]) {
      const c = raw([part('flagellum', { ...rear, orientation })])
      expect(c.lateralThrust).toBeGreaterThan(0.99 * 0.5)
      expect(c.forwardThrust).toBeCloseTo(0, 12)
    }
  })

  it('a part off the axis can turn the body; one on the axis cannot', () => {
    const onAxis = raw([part('flagellum', { angle: Math.PI, offset: 0.8, orientation: 0 })])
    const offAxis = raw([part('flagellum', { angle: 2.6, offset: 0.8, orientation: 0 })])
    expect(onAxis.torque).toBeCloseTo(0, 12)
    expect(offAxis.torque).toBeGreaterThan(0.1)
  })

  it('torque grows with distance from the centre', () => {
    const near = raw([part('flagellum', { angle: Math.PI / 2, offset: 0.2, orientation: 0 })])
    const far = raw([part('flagellum', { angle: Math.PI / 2, offset: 0.9, orientation: 0 })])
    expect(far.torque).toBeGreaterThan(near.torque)
  })

  it('cilia push like flagella but weaker (they are cheaper)', () => {
    const flagellum = raw([part('flagellum')])
    const cilia = raw([part('cilia')])
    expect(cilia.forwardThrust).toBeGreaterThan(0)
    expect(cilia.forwardThrust).toBeLessThan(flagellum.forwardThrust)
    expect(cilia.upkeep).toBeLessThan(flagellum.upkeep)
  })

  it('more flagella and bigger flagella push harder', () => {
    const one = raw([part('flagellum')]).forwardThrust
    const two = raw([part('flagellum'), part('flagellum')]).forwardThrust
    const big = raw([part('flagellum', { size: 1 })]).forwardThrust
    expect(two).toBeCloseTo(2 * one, 12)
    expect(big).toBeCloseTo(2 * one, 12)
  })
})

describe('speed per mass: thrust is not free', () => {
  it('adding a flagellum raises speed; adding armor (mass, no thrust) lowers it', () => {
    const base = [part('flagellum', { angle: Math.PI, offset: 0.8 }), part('mouth')]
    const faster = factors([...base, part('flagellum', { angle: Math.PI, offset: 0.8 })])
    const heavier = factors([...base, part('armor', { size: 1 })])
    const baseline = factors(base)
    expect(faster.speed).toBeGreaterThan(baseline.speed)
    expect(heavier.speed).toBeLessThan(baseline.speed)
  })

  it('a heavier body (bigger radius) is slower with the same parts', () => {
    const parts = founderAnatomy.parts.map((p) => asFounder(p))
    expect(factors(parts, 2.25).speed).toBeLessThan(factors(parts, 1).speed)
  })
})

describe('every capability has a cost', () => {
  it('every part type adds mass and upkeep', () => {
    const empty = raw([part('mouth', { size: 0.1 })])
    for (const type of [
      'flagellum',
      'cilia',
      'eye',
      'sniffer',
      'intestine',
      'stomach',
      'armor',
      'membrane',
      'mender'
    ] as PartType[]) {
      const c = raw([part('mouth', { size: 0.1 }), part(type)])
      expect(c.mass).toBeGreaterThan(empty.mass)
      expect(c.upkeep).toBeGreaterThan(empty.upkeep)
    }
  })

  it('a dormant part still costs mass and upkeep but adds no capability', () => {
    const without = raw([part('eye')])
    const dormant = raw([part('eye'), part('mender', { size: 1 })])
    expect(dormant.mass).toBeGreaterThan(without.mass)
    expect(dormant.upkeep).toBeGreaterThan(without.upkeep)
    expect(dormant.regeneration).toBe(1)
    const working = raw([part('eye'), part('mouth'), part('stomach'), part('mender', { size: 1 })])
    expect(working.regeneration).toBeGreaterThan(1)
  })

  it('upkeepDelta is the extra energy per second against the founder', () => {
    const big = factors(founderAnatomy.parts.map((p) => asFounder(p, { size: 1 })))
    expect(big.upkeepDelta).toBeGreaterThan(0)
    const lean = factors([part('flagellum', { angle: Math.PI, offset: 0.8 })])
    expect(lean.upkeepDelta).toBeLessThan(0)
  })
})

describe('the other capabilities', () => {
  it('eyes: none still senses the touch floor; more eyes see farther, with diminishing returns', () => {
    expect(raw([part('mouth')]).senseRange).toBe(defaults.senseFloor)
    const one = raw([part('eye')]).senseRange
    const two = raw([part('eye'), part('eye')]).senseRange
    const three = raw([part('eye'), part('eye'), part('eye')]).senseRange
    expect(one).toBeGreaterThan(defaults.senseFloor)
    expect(two).toBeGreaterThan(one)
    expect(three).toBeGreaterThan(two)
    // each extra eye adds less than the one before
    expect(two - one).toBeLessThan(one - defaults.senseFloor)
    expect(three - two).toBeLessThan(two - one)
  })

  it('eye param raises range', () => {
    expect(raw([part('eye', { param: 1 })]).senseRange).toBeGreaterThan(
      raw([part('eye', { param: 0 })]).senseRange
    )
  })

  it('sniffers detect their favored food kind, and only that one', () => {
    expect(sniffedKind(0, 4)).toBe(0)
    expect(sniffedKind(0.3, 4)).toBe(1)
    expect(sniffedKind(0.99, 4)).toBe(3)
    expect(sniffedKind(1, 4)).toBe(3)
    expect(sniffedKind(0.5, 1)).toBe(0)
    const c = raw([part('sniffer', { param: 0.3 })])
    expect(c.foodDetection).toHaveLength(KINDS)
    expect(c.foodDetection[1]).toBeGreaterThan(1)
    expect([c.foodDetection[0], c.foodDetection[2], c.foodDetection[3]]).toEqual([1, 1, 1])
  })

  it('mouth reach, intestine digestion and tolerance, stomach capacity', () => {
    expect(raw([part('mouth', { size: 1 })]).reach).toBeGreaterThan(
      raw([part('mouth', { size: 0.2 })]).reach
    )
    const fed = raw([part('mouth'), part('intestine', { size: 1 })])
    expect(fed.digestion).toBeGreaterThan(1)
    expect(fed.toxinTolerance).toBeGreaterThan(0)
    expect(fed.toxinTolerance).toBeLessThan(1)
    expect(raw([part('mouth'), part('stomach', { size: 1 })]).energyCapacity).toBeGreaterThan(
      raw([part('mouth'), part('stomach', { size: 0.2 })]).energyCapacity
    )
  })

  it('armor reduces damage taken (never to zero); membrane and mender raise theirs', () => {
    const light = raw([part('armor', { size: 0.2 })]).damageTaken
    const heavy = raw([part('armor', { size: 1 }), part('armor', { size: 1 })]).damageTaken
    expect(raw([part('eye')]).damageTaken).toBe(1)
    expect(light).toBeLessThan(1)
    expect(heavy).toBeLessThan(light)
    expect(heavy).toBeGreaterThan(0)
    expect(raw([part('membrane', { size: 1 })]).temperatureTolerance).toBeGreaterThan(1)
  })

  it('the factors point the right way relative to the founder', () => {
    const more = founderAnatomy.parts.map((p) => asFounder(p))
    const f = factors([
      ...more,
      part('armor', { size: 1 }),
      part('eye'),
      part('intestine', { size: 1 })
    ])
    expect(f.damageTaken).toBeLessThan(1)
    expect(f.senseRange).toBeGreaterThan(1)
    expect(f.toxinDamage).toBeLessThan(1)
    expect(f.digestion).toBeGreaterThan(1)
    expect(f.upkeepDelta).toBeGreaterThan(0)
  })

  it('compares neutral (1) against a founder that lacks the capability instead of dividing by zero', () => {
    const noThrust = capabilitiesOf(bodyOf([part('eye')]), defaults, 1, KINDS)
    const f = capabilityFactors(raw([part('flagellum')]), noThrust)
    expect(f.speed).toBe(1)
    expect(Number.isFinite(f.turn)).toBe(true)
  })
})

describe('under extreme mutation', () => {
  it('capabilities stay finite and the factors stay positive for every body', () => {
    const specs = buildBodySpecs(
      resolveWorldConfig({
        anatomy: {
          mutation: {
            presenceRate: 0.5,
            typeRate: 0.5,
            continuousRate: 1,
            continuousStd: 0.5,
            visualRate: 1
          }
        }
      }).anatomy
    )
    const random = new SeededRandom(deriveStreamWords(1, 'anatomy'))
    let body = founderBodyVector(defaults)
    const seen = new Set<string>()
    for (let generation = 0; generation < 300; generation++) {
      body = mutateVector(
        crossoverVector(body, founderBodyVector(defaults), specs, random, 0.25),
        specs,
        random,
        { rate: 1, strength: 1 }
      )
      const grown = developAnatomy(body, defaults)
      seen.add(grown.parts.map((p) => p.type).join())
      expect(grown.sizeUsed).toBeLessThanOrEqual(defaults.structuralBudget)
      const c = capabilitiesOf(grown, defaults, 1, KINDS)
      for (const value of Object.values(c).flat()) expect(Number.isFinite(value)).toBe(true)
      expect(c.mass).toBeGreaterThan(0)
      expect(c.damageTaken).toBeGreaterThan(0)
      expect(c.damageTaken).toBeLessThanOrEqual(1)
      expect(c.toxinTolerance).toBeGreaterThanOrEqual(0)
      expect(c.toxinTolerance).toBeLessThan(1)
      const f = capabilityFactors(c, founder)
      for (const value of Object.values(f).flat()) expect(Number.isFinite(value)).toBe(true)
      expect(f.speed).toBeGreaterThanOrEqual(0)
      expect(f.senseRange).toBeGreaterThan(0)
    }
    expect(seen.size).toBeGreaterThan(20) // bodies really did change structure
  })
})
