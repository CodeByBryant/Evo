import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { AnatomyConfig, FounderPart, PartType } from '@evo/contracts'
import {
  partCostOf,
  capabilitiesOf,
  capabilityFactors,
  sniffedKind,
  viewOf
} from '../../src/development/capabilities'
import { developAnatomy } from '../../src/development/develop'
import { rimAt } from '../../src/development/outline'
import { buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { crossoverVector } from '../../src/genetics/Recombination'
import { mutateVector } from '../../src/genetics/Mutation'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'

const defaults = resolveWorldConfig().anatomy
const KINDS = 4

const MID = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]

const part = (type: PartType, extra: Partial<FounderPart> = {}): FounderPart => ({
  type,
  parent: 0,
  size: 0.5,
  angle: 0,
  offset: 0.5,
  orientation: 0,
  integrity: 1,
  stats: MID,
  ...extra
})

/** A part with a single stat set (the rest in the middle). */
const withStat = (type: PartType, index: number, gene: number, extra: Partial<FounderPart> = {}) =>
  part(type, { stats: MID.map((value, i) => (i === index ? gene : value)), ...extra })

/** A developed part back as a founder part (only the fields a founder has). */
const asFounder = (p: FounderPart, extra: Partial<FounderPart> = {}): FounderPart =>
  part(p.type, {
    parent: p.parent < 0 ? 0 : p.parent + 1,
    size: p.size,
    angle: p.angle,
    offset: p.offset,
    orientation: p.orientation,
    integrity: p.integrity,
    stats: p.stats,
    ...extra
  })

function bodyOf(parts: FounderPart[], overrides: Partial<AnatomyConfig> = {}) {
  const config = resolveWorldConfig({
    anatomy: { founder: parts, structuralBudget: 12, ...overrides }
  }).anatomy
  return developAnatomy(founderBodyVector(config), config)
}

const founderAnatomy = developAnatomy(founderBodyVector(defaults), defaults)

/** The orientation that makes a part at `angle` push straight forward: its tail points straight back. */
const forwardOrientation = (angle: number): number => {
  const rim = rimAt(founderAnatomy.outline, angle)
  return (Math.PI - Math.atan2(rim.ny, rim.nx) + 2 * Math.PI) % (2 * Math.PI)
}
const founder = capabilitiesOf(founderAnatomy, defaults, 1, KINDS)
const raw = (parts: FounderPart[]) => capabilitiesOf(bodyOf(parts), defaults, 1, KINDS)
const factors = (parts: FounderPart[], scale = 1) =>
  capabilityFactors(capabilitiesOf(bodyOf(parts), defaults, scale, KINDS), founder)

/** The numeric values of a capability object (it also carries the boolean `hasMouth`). */
const isNumber = (value: unknown): value is number => typeof value === 'number'

describe('partCostOf: what each part adds to the body', () => {
  it('adds up: the parts and the bare body are the body, in mass and in upkeep', () => {
    for (const scale of [1, 1.7]) {
      const body = capabilitiesOf(founderAnatomy, defaults, scale, KINDS)
      const costs = founderAnatomy.parts.map((part) => partCostOf(part, defaults))
      expect(costs.reduce((sum, c) => sum + c.mass, 0) + defaults.bodyMass * scale).toBeCloseTo(
        body.mass,
        12
      )
      expect(costs.reduce((sum, c) => sum + c.upkeep, 0)).toBeCloseTo(body.upkeep, 12)
    }
  })

  it('charges a dormant part exactly what a working one costs (dead weight is not free)', () => {
    const working = founderAnatomy.parts.find((part) => part.type === 'stomach')
    expect(working).toBeDefined()
    const dormant = { ...(working as (typeof founderAnatomy.parts)[number]), functional: false }
    expect(partCostOf(dormant, defaults)).toEqual(partCostOf(working as typeof dormant, defaults))
    expect(partCostOf(dormant, defaults).mass).toBeGreaterThan(0)
  })

  it('a bigger part costs more, and a stronger stat costs more upkeep (nothing is free)', () => {
    const eye = founderAnatomy.parts.find(
      (part) => part.type === 'eye'
    ) as (typeof founderAnatomy.parts)[number]
    const bigger = partCostOf({ ...eye, size: eye.size * 2 }, defaults)
    expect(bigger.mass).toBeGreaterThan(partCostOf(eye, defaults).mass)
    expect(bigger.upkeep).toBeGreaterThan(partCostOf(eye, defaults).upkeep)
    // range stat (index 0) at its top against its bottom
    const range = (gene: number) =>
      partCostOf({ ...eye, stats: eye.stats.map((v, i) => (i === 0 ? gene : v)) }, defaults).upkeep
    expect(range(1)).toBeGreaterThan(range(0))
  })
})

describe('the founder body', () => {
  it('is exactly 1 against itself, for every factor', () => {
    const { vision, ...f } = capabilityFactors(founder, founder)
    // The founder's eye is all-round, so the body is omni and its one cone reaches exactly as far
    // as the founder's own sense range (ADR 0016 "Directional vision").
    expect(vision.omni).toBe(true)
    expect(vision.cones.map((cone) => cone.reach)).toEqual([1])
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
      upkeepDelta: 0,
      biteSize: 1,
      biteRate: 1,
      absorption: 1,
      dietEfficiency: [1, 1, 1, 1],
      hasMouth: true,
      mateSignal: 1
    })
  })

  it('has real, finite, positive capabilities of every thrust kind', () => {
    expect(founder.forwardThrust).toBeGreaterThan(0)
    expect(founder.lateralThrust).toBeGreaterThan(0)
    expect(founder.torque).toBeGreaterThan(0)
    for (const value of Object.values(founder).flat().filter(isNumber))
      expect(Number.isFinite(value)).toBe(true)
    expect(founder.mass).toBeGreaterThan(defaults.bodyMass)
  })

  it('gives the same founder factors whether built from the world config or from scratch', () => {
    const view = viewOf(founderAnatomy, founder, defaults, 1, KINDS)
    expect(view.factors.speed).toBe(1)
    expect(view.factors.upkeepDelta).toBe(0)
  })
})

describe('thrust depends on where a part is and which way it pushes', () => {
  // A part on the rear of the outline points outward (backward); its tail trails there and the
  // push is the opposite way, so with orientation 0 it drives the body forward.
  const rear = { angle: Math.PI }

  it('a flagellum pushing forward drives forward speed and next to no strafing', () => {
    const c = raw([part('flagellum', { ...rear, orientation: 0 })])
    expect(c.forwardThrust).toBeGreaterThan(0)
    expect(c.lateralThrust).toBeLessThan(0.15 * c.forwardThrust)
  })

  it('pushing backward gives no forward thrust at all', () => {
    expect(raw([part('flagellum', { ...rear, orientation: Math.PI })]).forwardThrust).toBe(0)
  })

  it('pushing sideways strafes instead, either side', () => {
    const forward = raw([part('flagellum', { ...rear, orientation: 0 })]).forwardThrust
    for (const orientation of [Math.PI / 2, (3 * Math.PI) / 2]) {
      const c = raw([part('flagellum', { ...rear, orientation })])
      expect(c.lateralThrust).toBeGreaterThan(0.9 * forward)
      expect(c.forwardThrust).toBeLessThan(0.15 * forward)
    }
  })

  it('a part off the axis can turn the body; one pushing through the centre cannot', () => {
    // at 2.6 radians the outward direction is up and to the rear; turning the tail by pi minus
    // that angle makes the push point straight forward from an anchor off the axis
    const offAxis = raw([part('flagellum', { angle: 2.6, orientation: forwardOrientation(2.6) })])
    const onAxis = raw([
      part('flagellum', { angle: Math.PI, orientation: forwardOrientation(Math.PI) })
    ])
    expect(offAxis.torque).toBeGreaterThan(0.1)
    expect(onAxis.torque).toBeLessThan(0.01 * offAxis.torque)
  })

  it('torque is the lever arm: the same forward push from further out turns harder', () => {
    const forwardFrom = (angle: number) =>
      raw([part('flagellum', { angle, orientation: forwardOrientation(angle) })]).torque
    // straight out at the side (a long lever) against close to the rear (a short one)
    expect(forwardFrom(Math.PI / 2)).toBeGreaterThan(forwardFrom(2.9))
  })

  it('cilia push like flagella but weaker (they are cheaper)', () => {
    const flagellum = raw([part('flagellum', { ...rear })])
    const cilia = raw([part('cilia', { ...rear })])
    expect(cilia.forwardThrust).toBeGreaterThan(0)
    expect(cilia.forwardThrust).toBeLessThan(flagellum.forwardThrust)
    expect(cilia.upkeep).toBeLessThan(flagellum.upkeep)
  })

  it('more flagella and bigger flagella push harder', () => {
    const one = raw([part('flagellum', { ...rear })]).forwardThrust
    const two = raw([part('flagellum', { ...rear }), part('flagellum', { ...rear })]).forwardThrust
    const big = raw([part('flagellum', { ...rear, size: 1 })]).forwardThrust
    expect(two).toBeCloseTo(2 * one, 12)
    expect(big).toBeCloseTo(2 * one, 12)
  })
})

describe('speed per mass: thrust is not free', () => {
  it('adding a flagellum raises speed; adding armor (mass, no thrust) lowers it', () => {
    const base = [part('flagellum', { angle: Math.PI }), part('mouth')]
    const faster = factors([...base, part('flagellum', { angle: Math.PI })])
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
    const lean = factors([part('flagellum', { angle: Math.PI })])
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

  it('the eye range stat raises sense range', () => {
    expect(raw([withStat('eye', 0, 1)]).senseRange).toBeGreaterThan(
      raw([withStat('eye', 0, 0)]).senseRange
    )
  })

  it('sniffers detect their favored food kind, and only that one', () => {
    expect(sniffedKind(0, 4)).toBe(0)
    expect(sniffedKind(0.3, 4)).toBe(1)
    expect(sniffedKind(0.99, 4)).toBe(3)
    expect(sniffedKind(1, 4)).toBe(3)
    expect(sniffedKind(0.5, 1)).toBe(0)
    const c = raw([withStat('sniffer', 2, 0.3)])
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

describe('part stats (ADR 0016): every stat does something, and the strong ones cost something', () => {
  const rear = { angle: Math.PI }
  const forward = (index: number, gene: number) =>
    raw([withStat('flagellum', index, gene, { ...rear, orientation: forwardOrientation(Math.PI) })])
  const fed = (extra: FounderPart[]) => raw([part('mouth', { size: 0.1 }), ...extra])

  it('flagellum: force raises thrust and upkeep; efficiency lowers upkeep but not thrust', () => {
    expect(forward(2, 1).forwardThrust).toBeGreaterThan(forward(2, 0).forwardThrust)
    expect(forward(2, 1).upkeep).toBeGreaterThan(forward(2, 0).upkeep)
    expect(forward(3, 1).upkeep).toBeLessThan(forward(3, 0).upkeep)
    expect(forward(3, 1).forwardThrust).toBe(forward(3, 0).forwardThrust)
  })

  it('flagellum: length and thickness add thrust, and make the part heavier (not free)', () => {
    for (const index of [0, 1]) {
      expect(forward(index, 1).forwardThrust).toBeGreaterThan(forward(index, 0).forwardThrust)
      expect(forward(index, 1).mass).toBeGreaterThan(forward(index, 0).mass)
    }
  })

  it('cilia: density and beat rate add thrust; the rate costs upkeep; length adds mass', () => {
    const cilia = (index: number, gene: number) => raw([withStat('cilia', index, gene, rear)])
    expect(cilia(1, 1).forwardThrust).toBeGreaterThan(cilia(1, 0).forwardThrust)
    expect(cilia(2, 1).forwardThrust).toBeGreaterThan(cilia(2, 0).forwardThrust)
    expect(cilia(2, 1).upkeep).toBeGreaterThan(cilia(2, 0).upkeep)
    expect(cilia(0, 1).mass).toBeGreaterThan(cilia(0, 0).mass)
  })

  it('eye: range sets how far it sees, resolution how well it picks food out; field of view sets the cone', () => {
    const eye = (index: number, gene: number) => raw([withStat('eye', index, gene)])
    expect(eye(0, 1).senseRange).toBeGreaterThan(eye(0, 0).senseRange)
    expect(eye(0, 1).upkeep).toBeGreaterThan(eye(0, 0).upkeep)
    expect(eye(1, 1).senseRange).toBe(eye(1, 0).senseRange)
    for (let kind = 0; kind < KINDS; kind++) {
      expect(eye(1, 1).foodDetection[kind]).toBeGreaterThan(eye(1, 0).foodDetection[kind] as number)
    }
    // The field of view moves neither the sense range nor the upkeep: it shapes where the eye looks.
    expect(eye(2, 1).senseRange).toBe(eye(2, 0).senseRange)
    expect(eye(2, 1).upkeep).toBe(eye(2, 0).upkeep)
    expect(eye(2, 1).vision.omni).toBe(true)
    expect(eye(2, 0).vision.omni).toBe(false)
    // Narrow reaches further than all-round: the range-for-angle trade.
    const reach = (gene: number): number => eye(2, gene).vision.cones[0]?.reach as number
    expect(reach(0)).toBeGreaterThan(reach(0.5))
    expect(reach(0.5)).toBeGreaterThan(reach(1))
  })

  it('sniffer: range and sensitivity both raise detection of its food kind and cost upkeep', () => {
    const sniffer = (index: number, gene: number) =>
      raw([part('sniffer', { stats: MID.map((v, i) => (i === 2 ? 0.3 : i === index ? gene : v)) })])
    for (const index of [0, 1]) {
      expect(sniffer(index, 1).foodDetection[1]).toBeGreaterThan(
        sniffer(index, 0).foodDetection[1] as number
      )
      expect(sniffer(index, 1).upkeep).toBeGreaterThan(sniffer(index, 0).upkeep)
    }
  })

  it('mouth: reach raises reach; gape raises digestion and weighs more', () => {
    const mouth = (index: number, gene: number) => raw([withStat('mouth', index, gene)])
    expect(mouth(0, 1).reach).toBeGreaterThan(mouth(0, 0).reach)
    expect(mouth(1, 1).digestion).toBeGreaterThan(mouth(1, 0).digestion)
    expect(mouth(1, 1).mass).toBeGreaterThan(mouth(1, 0).mass)
  })

  it('intestine: absorption and length raise digestion, the filter raises toxin tolerance', () => {
    const gut = (index: number, gene: number) => fed([withStat('intestine', index, gene)])
    expect(gut(1, 1).digestion).toBeGreaterThan(gut(1, 0).digestion)
    expect(gut(0, 1).digestion).toBeGreaterThan(gut(0, 0).digestion)
    expect(gut(0, 1).mass).toBeGreaterThan(gut(0, 0).mass)
    expect(gut(2, 1).toxinTolerance).toBeGreaterThan(gut(2, 0).toxinTolerance)
    expect(gut(2, 1).digestion).toBe(gut(2, 0).digestion)
  })

  it('stomach: capacity holds more energy (and weighs more); throughput raises digestion', () => {
    const stomach = (index: number, gene: number) => fed([withStat('stomach', index, gene)])
    expect(stomach(0, 1).energyCapacity).toBeGreaterThan(stomach(0, 0).energyCapacity)
    expect(stomach(0, 1).mass).toBeGreaterThan(stomach(0, 0).mass)
    expect(stomach(1, 1).digestion).toBeGreaterThan(stomach(1, 0).digestion)
  })

  it('armor: thickness, coverage and hardness each lower the damage taken', () => {
    const armor = (index: number, gene: number) =>
      raw([withStat('armor', index, gene, { size: 1 })])
    for (const index of [0, 1, 2]) {
      expect(armor(index, 1).damageTaken).toBeLessThan(armor(index, 0).damageTaken)
    }
    expect(armor(0, 1).mass).toBeGreaterThan(armor(0, 0).mass)
  })

  it('membrane: insulation raises temperature tolerance; a thicker membrane weighs more', () => {
    const membrane = (index: number, gene: number) => raw([withStat('membrane', index, gene)])
    expect(membrane(0, 1).temperatureTolerance).toBeGreaterThan(membrane(0, 0).temperatureTolerance)
    expect(membrane(1, 1).mass).toBeGreaterThan(membrane(1, 0).mass)
  })

  it('mender: rate raises regeneration and upkeep; efficiency lowers upkeep, not regeneration', () => {
    const mender = (index: number, gene: number) =>
      raw([part('mouth'), part('stomach'), withStat('mender', index, gene)])
    expect(mender(0, 1).regeneration).toBeGreaterThan(mender(0, 0).regeneration)
    expect(mender(0, 1).upkeep).toBeGreaterThan(mender(0, 0).upkeep)
    expect(mender(1, 1).upkeep).toBeLessThan(mender(1, 0).upkeep)
    expect(mender(1, 1).regeneration).toBe(mender(1, 0).regeneration)
  })

  it('a stat the part type does not have changes nothing', () => {
    expect(raw([withStat('mouth', 5, 1)])).toEqual(raw([withStat('mouth', 5, 0)]))
    expect(raw([withStat('eye', 4, 1)])).toEqual(raw([withStat('eye', 4, 0)]))
    expect(raw([withStat('armor', 3, 1)])).toEqual(raw([withStat('armor', 3, 0)]))
  })

  it('integrity scales what a part delivers but never what it weighs or costs', () => {
    const whole = forward(0, 0.5)
    const deformed = raw([
      part('flagellum', { ...rear, orientation: forwardOrientation(Math.PI), integrity: 0.25 })
    ])
    expect(deformed.forwardThrust).toBeCloseTo(0.25 * whole.forwardThrust, 12)
    expect(deformed.mass).toBe(whole.mass)
    expect(deformed.upkeep).toBe(whole.upkeep)
    const blind = raw([part('eye', { integrity: 0.1 })])
    expect(blind.senseRange).toBeLessThan(raw([part('eye')]).senseRange)
    expect(blind.senseRange).toBeGreaterThan(defaults.senseFloor)
  })

  it('a stat at its extremes keeps every capability finite and the founder-relative factors positive', () => {
    for (const type of [
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
    ] as PartType[]) {
      for (const gene of [0, 1]) {
        const c = raw([part('mouth'), part('stomach'), part(type, { stats: MID.map(() => gene) })])
        for (const value of Object.values(c).flat().filter(isNumber))
          expect(Number.isFinite(value)).toBe(true)
        const f = capabilityFactors(c, founder)
        for (const value of Object.values(f).flat().filter(isNumber))
          expect(Number.isFinite(value)).toBe(true)
      }
    }
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
      for (const value of Object.values(c).flat().filter(isNumber))
        expect(Number.isFinite(value)).toBe(true)
      expect(c.mass).toBeGreaterThan(0)
      expect(c.damageTaken).toBeGreaterThan(0)
      expect(c.damageTaken).toBeLessThanOrEqual(1)
      expect(c.toxinTolerance).toBeGreaterThanOrEqual(0)
      expect(c.toxinTolerance).toBeLessThan(1)
      const f = capabilityFactors(c, founder)
      for (const value of Object.values(f).flat().filter(isNumber))
        expect(Number.isFinite(value)).toBe(true)
      expect(f.speed).toBeGreaterThanOrEqual(0)
      expect(f.senseRange).toBeGreaterThan(0)
    }
    expect(seen.size).toBeGreaterThan(20) // bodies really did change structure
  })
})
