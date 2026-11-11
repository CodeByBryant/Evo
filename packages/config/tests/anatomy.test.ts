import { describe, expect, it } from 'vitest'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'

// Tests push deliberately invalid values (wrong types, missing keys) into a copy of the defaults.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = Record<string, any>
/* eslint-enable @typescript-eslint/no-explicit-any */

function errorsFor(change: (config: Loose) => void): string[] {
  const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as Loose
  change(config)
  return [...validateWorldConfig(config).errors]
}

describe('anatomy config', () => {
  it('defaults are valid, bodies evolve, and the founder fits its budget', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    const { anatomy } = DEFAULT_WORLD_CONFIG
    expect(anatomy.enabled).toBe(true)
    expect(anatomy.founder).toHaveLength(7)
    const total = anatomy.founder.reduce((sum, part) => sum + part.size, 0)
    expect(total).toBeCloseTo(3.5, 12)
    expect(total).toBeLessThanOrEqual(anatomy.structuralBudget)
    // the body plan leads what makes a species (it counted for nothing until the species fix)
    expect(DEFAULT_WORLD_CONFIG.species.distanceWeights.body).toBe(0.5)
  })

  it('merges overrides: sections field by field, parts per type, the founder whole', () => {
    const config = resolveWorldConfig({
      anatomy: {
        enabled: true,
        mutation: { presenceRate: 0.5 },
        parts: { eye: { strength: 2 } },
        founder: [
          {
            type: 'mouth',
            parent: 0,
            size: 0.5,
            angle: 0,
            offset: 1,
            orientation: 0,
            integrity: 1,
            stats: [0.5, 0.5]
          }
        ],
        founderLook: { pattern: 2 }
      }
    })
    expect(config.anatomy.enabled).toBe(true)
    expect(config.anatomy.mutation.presenceRate).toBe(0.5)
    expect(config.anatomy.mutation.typeRate).toBe(DEFAULT_WORLD_CONFIG.anatomy.mutation.typeRate)
    expect(config.anatomy.parts.eye).toEqual({ mass: 0.1, upkeep: 0.01, strength: 2 })
    expect(config.anatomy.parts.flagellum).toEqual(DEFAULT_WORLD_CONFIG.anatomy.parts.flagellum)
    expect(config.anatomy.founder).toHaveLength(1)
    expect(config.anatomy.founderLook).toEqual({ pattern: 2, accentHue: 0.1 })
  })

  it('does not change the shared defaults', () => {
    resolveWorldConfig({ anatomy: { enabled: true, parts: { eye: { strength: 9 } } } })
    expect(DEFAULT_WORLD_CONFIG.anatomy.enabled).toBe(true)
    expect(DEFAULT_WORLD_CONFIG.anatomy.parts.eye.strength).toBe(1)
  })

  it('rejects bad scalars', () => {
    expect(errorsFor((c) => (c.anatomy.structuralBudget = 0))).toContain(
      'anatomy.structuralBudget must be greater than zero'
    )
    expect(errorsFor((c) => (c.anatomy.bodyMass = -1))).toContain(
      'anatomy.bodyMass must be greater than zero'
    )
    expect(errorsFor((c) => (c.anatomy.senseFloor = 0))).toContain(
      'anatomy.senseFloor must be greater than zero and at most one'
    )
    expect(errorsFor((c) => (c.anatomy.enabled = 'yes'))).toContain(
      'anatomy.enabled must be a boolean'
    )
    expect(errorsFor((c) => delete c.anatomy.enabled)).toContain('anatomy.enabled is required')
  })

  it('rejects bad mutation rates', () => {
    expect(errorsFor((c) => (c.anatomy.mutation.presenceRate = 1.5))).toContain(
      'anatomy.mutation.presenceRate must be from 0 to 1'
    )
    expect(errorsFor((c) => (c.anatomy.mutation.continuousStd = 0))).toContain(
      'anatomy.mutation.continuousStd must be greater than zero'
    )
    expect(errorsFor((c) => (c.anatomy.mutation.bogus = 1))).toContain(
      'unknown property "anatomy.mutation.bogus"'
    )
  })

  it('rejects bad part tables', () => {
    expect(errorsFor((c) => (c.anatomy.parts.flagellum.mass = -1))).toContain(
      'anatomy.parts.flagellum.mass must be nonnegative'
    )
    expect(errorsFor((c) => (c.anatomy.parts.eye.strength = 0))).toContain(
      'anatomy.parts.eye.strength must be greater than zero'
    )
    expect(errorsFor((c) => delete c.anatomy.parts.mender)).toContain(
      'anatomy.parts.mender is required'
    )
    expect(
      errorsFor((c) => (c.anatomy.parts.wing = { mass: 1, upkeep: 1, strength: 1 }))
    ).toContain('unknown property "anatomy.parts.wing"')
  })

  it('rejects a bad founder, reporting every problem', () => {
    const errors = errorsFor((c) => {
      c.anatomy.founder = [
        {
          type: 'wing',
          parent: 3,
          size: 5,
          angle: 7,
          offset: 2,
          orientation: -1,
          integrity: 0,
          stats: [0.5, 2, 'x']
        },
        'not an object'
      ]
    })
    expect(errors).toContain(
      'anatomy.founder[0].type must be one of: flagellum, cilia, eye, sniffer, mouth, intestine, stomach, armor, membrane, mender, eyestalk, gyro, lipid, pheromone, skeleton, join'
    )
    expect(errors).toContain('anatomy.founder[0].size must be from 0.1 to 1')
    expect(errors).toContain(
      'anatomy.founder[0].angle must be from 0 to 6.283185307179586 (exclusive)'
    )
    expect(errors).toContain('anatomy.founder[0].offset must be from 0 to 1')
    expect(errors).toContain(
      'anatomy.founder[0].orientation must be from 0 to 6.283185307179586 (exclusive)'
    )
    expect(errors).toContain('anatomy.founder[0].integrity must be from 0.1 to 1')
    expect(errors).toContain(
      'anatomy.founder[0].parent must be 0 (the body) or the number of an earlier part, 1 to 0'
    )
    expect(errors).toContain('anatomy.founder[0].stats[1] must be a number from 0 to 1')
    expect(errors).toContain('anatomy.founder[0].stats[2] must be a number from 0 to 1')
    expect(errors).toContain('anatomy.founder[1] must be an object')
  })

  it('rejects a founder with too many parts or too much size for its budget', () => {
    const part = {
      type: 'eye',
      parent: 0,
      size: 1,
      angle: 0,
      offset: 0.5,
      orientation: 0,
      integrity: 1,
      stats: [0.5]
    }
    expect(
      errorsFor((c) => (c.anatomy.founder = Array.from({ length: 13 }, () => part)))
    ).toContain('anatomy.founder has 13 parts but a body has 12 slots')
    const heavy = errorsFor((c) => {
      c.anatomy.founder = [part, part, part]
      c.anatomy.structuralBudget = 2
    })
    expect(heavy.some((e) => e.includes('the founder body must develop completely'))).toBe(true)
    expect(errorsFor((c) => (c.anatomy.founder = 'none'))).toContain(
      'anatomy.founder must be an array'
    )
  })

  it('rejects a bad founder look', () => {
    expect(errorsFor((c) => (c.anatomy.founderLook.pattern = 4))).toContain(
      'anatomy.founderLook.pattern must be an integer from 0 to 3'
    )
    expect(errorsFor((c) => (c.anatomy.founderLook.accentHue = 1))).toContain(
      'anatomy.founderLook.accentHue must be from 0 to 1 (exclusive)'
    )
  })

  it('requires the body species weight and rejects a negative one', () => {
    expect(errorsFor((c) => delete c.species.distanceWeights.body)).toContain(
      'species.distanceWeights.body is required'
    )
    expect(errorsFor((c) => (c.species.distanceWeights.body = -1))).toContain(
      'species.distanceWeights.body must be nonnegative'
    )
  })
})

describe('feeding config (ADR 0017)', () => {
  it('defaults are valid, bites are on, and a preset can switch them off', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    expect(DEFAULT_WORLD_CONFIG.feeding.enabled).toBe(true)
    expect(resolveWorldConfig({ feeding: { enabled: false } }).feeding.enabled).toBe(false)
    // overrides merge field by field
    const merged = resolveWorldConfig({ feeding: { biteSize: 20 } }).feeding
    expect(merged.biteSize).toBe(20)
    expect(merged.gutCapacity).toBe(DEFAULT_WORLD_CONFIG.feeding.gutCapacity)
  })

  it('rejects numbers that are not positive, a cone wider than all around, and a chew speed above 1', () => {
    for (const key of ['biteRadius', 'biteSize', 'biteInterval', 'gutCapacity', 'absorption']) {
      expect(errorsFor((c) => (c.feeding[key] = 0)).join('\n')).toContain(`feeding.${key}`)
      expect(errorsFor((c) => (c.feeding[key] = -1)).join('\n')).toContain(`feeding.${key}`)
    }
    expect(errorsFor((c) => (c.feeding.biteCone = 4)).join('\n')).toContain('feeding.biteCone')
    expect(errorsFor((c) => (c.feeding.chewSlow = 1.5)).join('\n')).toContain('feeding.chewSlow')
    expect(errorsFor((c) => (c.feeding.chewSlow = 0)).join('\n')).toContain('feeding.chewSlow')
    expect(errorsFor((c) => (c.feeding.enabled = 'yes')).join('\n')).toContain('feeding.enabled')
    expect(errorsFor((c) => (c.feeding.extra = 1)).join('\n')).toContain('feeding.extra')
  })

  it('a kind’s hardness must be positive when given', () => {
    expect(errorsFor((c) => (c.ecology.resourceKinds.kinds[0].hardness = 0)).join('\n')).toContain(
      'hardness'
    )
    expect(errorsFor((c) => delete c.ecology.resourceKinds.kinds[0].hardness)).toEqual([])
  })
})

describe('mouth forms (ADR 0017)', () => {
  it('the mandible is exactly 1 on every kind so the founder is the neutral reference', () => {
    for (const value of Object.values(DEFAULT_WORLD_CONFIG.anatomy.mouthForms.mandible)) {
      expect(value).toBe(1)
    }
    expect(errorsFor((c) => (c.anatomy.mouthForms.mandible.grass = 1.1)).join('\n')).toContain(
      'mandible'
    )
  })

  it('every form is needed, yields must be positive, and an override merges per form and kind', () => {
    expect(errorsFor((c) => delete c.anatomy.mouthForms.jaw).join('\n')).toContain('jaw')
    expect(errorsFor((c) => (c.anatomy.mouthForms.sprout.grass = 0)).join('\n')).toContain('sprout')
    const merged = resolveWorldConfig({ anatomy: { mouthForms: { sprout: { grass: 2 } } } })
    expect(merged.anatomy.mouthForms.sprout.grass).toBe(2)
    expect(merged.anatomy.mouthForms.sprout.fruit).toBe(
      DEFAULT_WORLD_CONFIG.anatomy.mouthForms.sprout.fruit
    )
    expect(merged.anatomy.mouthForms.jaw).toEqual(DEFAULT_WORLD_CONFIG.anatomy.mouthForms.jaw)
  })

  it('sorts the specialists by their own food and the generalist ahead of them elsewhere', () => {
    const forms = DEFAULT_WORLD_CONFIG.anatomy.mouthForms
    const yieldOf = (form: keyof typeof forms, kind: string): number => forms[form][kind] as number
    expect(yieldOf('sprout', 'grass')).toBeGreaterThan(yieldOf('mandible', 'grass'))
    expect(yieldOf('proboscis', 'nectar')).toBeGreaterThan(yieldOf('mandible', 'nectar'))
    expect(yieldOf('radula', 'fungus')).toBeGreaterThan(yieldOf('mandible', 'fungus'))
    expect(yieldOf('sprout', 'fungus')).toBeLessThan(yieldOf('mandible', 'fungus'))
    // the jaw is worse than the generalist on every plant
    for (const [kind, value] of Object.entries(forms.jaw)) {
      expect(value).toBeLessThan(forms.mandible[kind] as number)
    }
  })
})

describe('starting bodies (ADR 0020)', () => {
  const starterOf = (name: string): Loose => {
    const copy = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG.anatomy)) as Loose
    return {
      name,
      description: `${name} body`,
      parts: copy.founder,
      look: copy.founderLook,
      outline: copy.founderOutline
    }
  }

  it('ship five named starters, default to drawing one, and that is valid', () => {
    const { anatomy } = DEFAULT_WORLD_CONFIG
    expect(anatomy.startingBody).toEqual({ mode: 'archetypes', archetype: null })
    expect(anatomy.starters.map((s) => s.name)).toEqual([
      'grazer',
      'nectar-sipper',
      'fungus-scraper',
      'scout',
      'tank'
    ])
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
  })

  it('accept valid starters, a forced name, and merge: startingBody by field, starters whole', () => {
    const config = resolveWorldConfig({
      anatomy: {
        starters: [starterOf('a'), starterOf('b')] as never,
        startingBody: { mode: 'archetypes' }
      }
    })
    expect(config.anatomy.startingBody).toEqual({ mode: 'archetypes', archetype: null })
    expect(config.anatomy.starters.map((s) => s.name)).toEqual(['a', 'b'])
    const forced = resolveWorldConfig({
      anatomy: { starters: [starterOf('a')] as never, startingBody: { archetype: 'a' } }
    })
    expect(forced.anatomy.startingBody.archetype).toBe('a')
    // a second override replaces the list, it does not append
    expect(
      resolveWorldConfig({ anatomy: { starters: [starterOf('z')] as never } }).anatomy.starters
    ).toHaveLength(1)
  })

  it('rejects an empty pool in archetypes mode, an unknown forced name and a bad mode', () => {
    expect(
      errorsFor((c) => {
        c.anatomy.starters = []
        c.anatomy.startingBody.mode = 'archetypes'
      })
    ).toContain('anatomy.startingBody.mode is "archetypes" but anatomy.starters is empty')
    expect(
      errorsFor((c) => {
        c.anatomy.starters = [starterOf('a')]
        c.anatomy.startingBody.archetype = 'b'
      })
    ).toContain('anatomy.startingBody.archetype "b" is not one of anatomy.starters')
    expect(errorsFor((c) => (c.anatomy.startingBody.mode = 'random')).length).toBeGreaterThan(0)
    expect(errorsFor((c) => (c.anatomy.startingBody.archetype = 3))).toContain(
      'anatomy.startingBody.archetype must be a starter name or null'
    )
  })

  it('checks each starter like the founder: names, parts, budget, look and outline', () => {
    expect(errorsFor((c) => (c.anatomy.starters = [starterOf('a'), starterOf('a')]))).toContain(
      'anatomy.starters[1].name "a" is used twice'
    )
    expect(errorsFor((c) => (c.anatomy.starters = [{ ...starterOf(''), name: ' ' }]))).toContain(
      'anatomy.starters[0].name must be a non-empty string'
    )
    const heavy = errorsFor((c) => {
      c.anatomy.structuralBudget = 2
      c.anatomy.starters = [starterOf('a')]
    })
    expect(heavy.some((e) => e.includes('anatomy.starters[0].parts has a total size'))).toBe(true)
    expect(heavy.some((e) => e.includes('the starting body must develop completely'))).toBe(true)
    expect(
      errorsFor((c) => {
        const s = starterOf('a')
        s.parts[0].type = 'wing'
        s.look.pattern = 9
        s.outline.count = 99
        c.anatomy.starters = [s]
      }).filter((e) => e.startsWith('anatomy.starters[0]')).length
    ).toBeGreaterThanOrEqual(3)
    expect(errorsFor((c) => (c.anatomy.starters = [{ ...starterOf('a'), extra: 1 }]))).toContain(
      'unknown property "anatomy.starters[0].extra"'
    )
    expect(errorsFor((c) => (c.anatomy.starters = 'none'))).toContain(
      'anatomy.starters must be an array'
    )
  })
})
