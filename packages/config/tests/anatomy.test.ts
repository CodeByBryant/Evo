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
  it('defaults are valid, anatomy is off, and the founder fits its budget', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    const { anatomy } = DEFAULT_WORLD_CONFIG
    expect(anatomy.enabled).toBe(false)
    expect(anatomy.founder).toHaveLength(7)
    const total = anatomy.founder.reduce((sum, part) => sum + part.size, 0)
    expect(total).toBeCloseTo(3.5, 12)
    expect(total).toBeLessThanOrEqual(anatomy.structuralBudget)
    expect(DEFAULT_WORLD_CONFIG.species.distanceWeights.body).toBe(0)
  })

  it('merges overrides: sections field by field, parts per type, the founder whole', () => {
    const config = resolveWorldConfig({
      anatomy: {
        enabled: true,
        mutation: { presenceRate: 0.5 },
        parts: { eye: { strength: 2 } },
        founder: [{ type: 'mouth', size: 0.5, angle: 0, offset: 1, orientation: 0, param: 0.5 }],
        founderLook: { shape: 4 }
      }
    })
    expect(config.anatomy.enabled).toBe(true)
    expect(config.anatomy.mutation.presenceRate).toBe(0.5)
    expect(config.anatomy.mutation.typeRate).toBe(DEFAULT_WORLD_CONFIG.anatomy.mutation.typeRate)
    expect(config.anatomy.parts.eye).toEqual({ mass: 0.1, upkeep: 0.01, strength: 2 })
    expect(config.anatomy.parts.flagellum).toEqual(DEFAULT_WORLD_CONFIG.anatomy.parts.flagellum)
    expect(config.anatomy.founder).toHaveLength(1)
    expect(config.anatomy.founderLook).toEqual({ shape: 4, pattern: 0, accentHue: 0.1 })
  })

  it('does not change the shared defaults', () => {
    resolveWorldConfig({ anatomy: { enabled: true, parts: { eye: { strength: 9 } } } })
    expect(DEFAULT_WORLD_CONFIG.anatomy.enabled).toBe(false)
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
        { type: 'wing', size: 5, angle: 7, offset: 2, orientation: -1, param: 3 },
        'not an object'
      ]
    })
    expect(errors).toContain(
      'anatomy.founder[0].type must be one of: flagellum, cilia, eye, sniffer, mouth, intestine, stomach, armor, membrane, mender'
    )
    expect(errors).toContain('anatomy.founder[0].size must be from 0.1 to 1')
    expect(errors).toContain(
      'anatomy.founder[0].angle must be from 0 to 6.283185307179586 (exclusive)'
    )
    expect(errors).toContain('anatomy.founder[0].offset must be from 0 to 1')
    expect(errors).toContain(
      'anatomy.founder[0].orientation must be from 0 to 6.283185307179586 (exclusive)'
    )
    expect(errors).toContain('anatomy.founder[0].param must be from 0 to 1')
    expect(errors).toContain('anatomy.founder[1] must be an object')
  })

  it('rejects a founder with too many parts or too much size for its budget', () => {
    const part = { type: 'eye', size: 1, angle: 0, offset: 0.5, orientation: 0, param: 0.5 }
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
    expect(errorsFor((c) => (c.anatomy.founderLook.shape = 2))).toContain(
      'anatomy.founderLook.shape must be an integer from 3 to 8'
    )
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
