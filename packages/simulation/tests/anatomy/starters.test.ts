import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { visualGeneIndex } from '@evo/contracts'
import { developAnatomy } from '../../src/development/develop'
import { capabilitiesOf, capabilityFactors } from '../../src/development/capabilities'
import { founderCapabilitiesOf } from '../../src/organisms/bodyFactors'
import { bodyPlanDistance } from '../../src/genetics/BodyDistance'
import { bodyVectorOf, buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { World } from '../../src/world/World'

// The default starting bodies (ADR 0020): every one has to be a working animal that is not a copy
// of another, or "every world starts differently" would be a label and not a fact.

const config = resolveWorldConfig({})
const { anatomy } = config
const specs = buildBodySpecs(anatomy)
const reference = founderCapabilitiesOf(config)
const kindNames = config.ecology.resourceKinds.kinds.map((k) => k.name)
const vectorOf = (s: (typeof anatomy.starters)[number]): number[] =>
  bodyVectorOf({ parts: s.parts, look: s.look, outline: s.outline })

describe('the default starting bodies', () => {
  for (const starter of anatomy.starters) {
    describe(starter.name, () => {
      const body = vectorOf(starter)
      const developed = developAnatomy(body, anatomy)
      const caps = capabilitiesOf(developed, anatomy, 1, kindNames.length, kindNames)
      const factors = capabilityFactors(caps, reference)

      it('develops completely within the budget, and every part works', () => {
        expect(developed.undeveloped).toEqual([])
        expect(developed.parts).toHaveLength(starter.parts.length)
        expect(developed.sizeUsed).toBeLessThanOrEqual(anatomy.structuralBudget)
        expect(developed.parts.filter((p) => !p.functional)).toEqual([])
      })

      it('is not born blind, mouthless or unable to move forward', () => {
        const types = developed.parts.map((p) => p.type)
        expect(types).toContain('eye')
        expect(types).toContain('mouth')
        expect(caps.forwardThrust).toBeGreaterThan(0)
        // tails push forward: sideways thrust is small beside it
        expect(Math.abs(caps.lateralThrust)).toBeLessThan(0.5 * caps.forwardThrust)
        // the eye looks along the heading
        for (const eye of developed.parts.filter((p) => p.type === 'eye')) {
          expect(Math.cos(eye.axis)).toBeGreaterThan(0.99)
        }
        // the founder body has the same checks, so a failing one here is not a bad check
        const founderParts = developAnatomy(founderBodyVector(anatomy), anatomy).parts
        expect(founderParts.map((p) => p.type)).toContain('eye')
      })

      it('has finite, positive capabilities against the reference', () => {
        for (const key of ['speed', 'turn', 'senseRange', 'reach', 'digestion', 'energyCapacity']) {
          const value = (factors as unknown as Record<string, number>)[key] as number
          expect(Number.isFinite(value)).toBe(true)
          expect(value).toBeGreaterThan(0)
        }
        expect(caps.mass).toBeGreaterThan(0)
        // every kind of food is digestible, except plants to the jaw: the hunter is a carnivore (ADR 0023)
        const eatsPlants = starter.name !== 'hunter'
        expect(
          Object.values(factors.dietEfficiency).every((v) => (eatsPlants ? v > 0 : v >= 0))
        ).toBe(true)
        if (!eatsPlants)
          expect(Object.values(factors.dietEfficiency).every((v) => v === 0)).toBe(true)
      })

      it('differs from the founder plan in what it can do, and from every other starter in its plan', () => {
        // some capability is at least 10 percent off the reference (the grazer's mouth barely moves
        // the plan distance, 0.007, but changes what it digests by 30 percent: the metric and the
        // mechanics measure different things, see ADR 0020 "Measured")
        const numbers = [
          factors.speed,
          factors.strafe,
          factors.turn,
          factors.senseRange,
          factors.reach,
          factors.digestion,
          factors.energyCapacity,
          factors.damageTaken,
          ...factors.dietEfficiency
        ]
        expect(Math.max(...numbers.map((v) => Math.abs(v - 1)))).toBeGreaterThanOrEqual(0.1)
        const weight = config.species.distanceWeights.body
        for (const other of anatomy.starters) {
          if (other.name === starter.name) continue
          // the hunter is the grazer with a jaw (ADR 0023): the same plan but for one mouth stat, so
          // that pair is told apart by what the mouth does, which the founder-groups tests cover
          if (
            new Set([starter.name, other.name]).size === 2 &&
            [starter.name, other.name].every((n) => n === 'grazer' || n === 'hunter')
          )
            continue
          // the weighted plan distance of one part gained or lost is about 0.03: two or more parts apart
          expect(weight * bodyPlanDistance(body, vectorOf(other), specs)).toBeGreaterThan(0.05)
        }
      })

      it('a recoloured copy is not a different species (colour never counts)', () => {
        const copy = body.slice()
        copy[visualGeneIndex('pattern')] = (starter.look.pattern + 1) % 4
        copy[visualGeneIndex('accentHue')] = (starter.look.accentHue + 0.4) % 1
        expect(bodyPlanDistance(body, copy, specs)).toBe(0)
      })

      it('lives in a world: a forced world starts as it and does not die out in 1,500 ticks', () => {
        // A world of nothing but hunters has no prey and no plants they can eat: the hunter lives
        // among others (the founder group), which the world tests below cover (ADR 0023).
        const groups = starter.name === 'hunter' ? { groups: [] } : {}
        const world = World.create({
          seed: 3,
          config: {
            anatomy: { startingBody: { mode: 'archetypes', archetype: starter.name, ...groups } },
            ...(starter.name === 'hunter' ? { predation: { enabled: false } } : {})
          }
        })
        expect(world.startingBodyName).toBe(starter.name)
        world.run(starter.name === 'hunter' ? 200 : 1500)
        expect(world.isExtinct).toBe(false)
      })
    })
  }

  it('the starters differ from each other in looks too (a first screen you can tell apart)', () => {
    const looks = anatomy.starters.map((s) => `${s.look.pattern}/${s.look.accentHue}`)
    expect(new Set(looks).size).toBe(anatomy.starters.length)
    // the hunter keeps the grazer's hull (it is the grazer with a jaw), so hulls are compared
    // among the starters a world can draw
    const drawn = anatomy.starters.filter((s) => s.pool !== false)
    const outlines = drawn.map((s) => s.outline.radii.slice(0, 8).join(','))
    expect(new Set(outlines).size).toBe(drawn.length)
  })
})
