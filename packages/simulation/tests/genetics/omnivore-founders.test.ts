import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { WorldConfigOverrides } from '@evo/contracts'
import { mouthsOf } from '../../src/organisms/mouths'
import { World } from '../../src/world/World'

// The omnivore hunters (ADR 0028): the grazer with a second mouth, a jaw, started as a founder group
// like the hunter. Config only, so nothing a world draws may move.

const OMNIVORES = ['omnivore-sprout', 'omnivore-mandible'] as const
const plantForm = { 'omnivore-sprout': 'sprout', 'omnivore-mandible': 'mandible' } as const

const withGroup = (name: string, share: number): WorldConfigOverrides => ({
  anatomy: { startingBody: { groups: [{ archetype: name, share }] } }
})

/** The mouth forms of every founder, in founder order. */
function formsOf(world: World): string[][] {
  return world.snapshot().organisms.map((o) =>
    mouthsOf(world.genomeOf(o.id)!, world.config)
      .map((m) => m.form)
      .sort()
  )
}

describe('the omnivore starters', () => {
  const config = resolveWorldConfig()

  for (const name of OMNIVORES) {
    describe(name, () => {
      it('is the grazer with a second mouth: a plant mouth and a jaw, both working', () => {
        const world = World.create({ seed: 5, config: withGroup(name, 0.5) })
        const two = formsOf(world).filter((f) => f.length === 2)
        expect(two.length).toBe(10)
        for (const forms of two) expect(forms).toEqual([plantForm[name], 'jaw'].sort())
      })

      it('takes plants with one mouth and creatures with the other (an omnivore by the probe rule)', () => {
        const { predation, anatomy } = config
        const plant = plantForm[name]
        const takesPlants = (form: string): boolean =>
          Object.entries(anatomy.mouthForms[form as keyof typeof anatomy.mouthForms]).some(
            ([kind, y]) => kind !== 'carrion' && y > 0
          )
        expect(predation.fleshYield.jaw).toBeGreaterThan(0)
        expect(takesPlants(plant)).toBe(true)
        expect(predation.fleshYield[plant]).toBe(0)
        // The jaw takes no plant, so the two mouths never compete for the same food.
        expect(takesPlants('jaw')).toBe(false)
      })

      it('is not drawn as a world base body (it can only be a founder group or forced)', () => {
        const starter = config.anatomy.starters.find((s) => s.name === name)
        expect(starter?.pool).toBe(false)
      })
    })
  }

  it('the hunter is not an omnivore: one mouth, a jaw (negative)', () => {
    const world = World.create({ seed: 5, config: withGroup('hunter', 0.5) })
    const forms = formsOf(world)
    expect(forms.filter((f) => f.length === 2)).toEqual([])
    expect(forms.filter((f) => f.join() === 'jaw')).toHaveLength(10)
  })
})

describe('a founder group of omnivores', () => {
  it('starts exactly round(20 x share) founders with the two-mouth body, 2, 4, 5 and 8 of 20', () => {
    for (const [share, count] of [
      [0.1, 2],
      [0.2, 4],
      [0.25, 5],
      [0.4, 8]
    ] as const) {
      const world = World.create({ seed: 3, config: withGroup('omnivore-mandible', share) })
      const forms = formsOf(world)
      expect(forms).toHaveLength(20)
      expect(forms.filter((f) => f.length === 2)).toHaveLength(count)
      // Everyone else keeps the base body (a single mouth).
      expect(forms.filter((f) => f.length === 1)).toHaveLength(20 - count)
    }
  })

  it('draws nothing: founders are placed and their brains drawn exactly as with no group (negative: a group does not shift a stream)', () => {
    const none = World.create({ seed: 8, config: { anatomy: { startingBody: { groups: [] } } } })
    const group = World.create({ seed: 8, config: withGroup('omnivore-sprout', 0.2) })
    expect(group.startingBodyName).toBe(none.startingBodyName)
    const a = none.snapshot().organisms
    const b = group.snapshot().organisms
    expect(b.map((o) => [o.position.x, o.position.y, o.heading])).toEqual(
      a.map((o) => [o.position.x, o.position.y, o.heading])
    )
    for (let i = 0; i < a.length; i++) {
      const wa = none.genomeOf((a[i] as { id: number }).id)!.brain.weights
      const wb = group.genomeOf((b[i] as { id: number }).id)!.brain.weights
      expect(wb).toEqual(wa)
    }
  })

  it('an unknown group name is a config error, and a share above a half is too (negatives)', () => {
    expect(() => resolveWorldConfig(withGroup('omnivore-nope', 0.1))).toThrow(/starter/)
    expect(() => resolveWorldConfig(withGroup('omnivore-mandible', 0.6))).toThrow(/0.5/)
  })

  it('is deterministic, and a world with it is the same stepped, chunked or run at once', () => {
    const config = withGroup('omnivore-mandible', 0.25)
    const a = World.create({ seed: 4, config })
    a.run(1500)
    const b = World.create({ seed: 4, config })
    b.run(600)
    b.run(900)
    expect(b.stateHash()).toBe(a.stateHash())
    expect(a.isExtinct).toBe(false)
  })
})
