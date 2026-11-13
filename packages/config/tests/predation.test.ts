import { describe, expect, it } from 'vitest'
import { MOUTH_FORMS } from '@evo/contracts'
import type { WorldConfig } from '@evo/contracts'
import {
  DEFAULT_WORLD_CONFIG,
  presetByName,
  resolveWorldConfig,
  validateWorldConfig
} from '../src/index'

// The predation section (ADR 0023): off by default, merged per field, per mouth form and per carcass
// field, validated, and needing feeding and health.

type Loose = Record<string, Record<string, unknown>>

function errorsFor(mutate: (predation: Loose) => void): string[] {
  const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
  mutate((config as unknown as Loose)['predation'] as unknown as Loose)
  return [...validateWorldConfig(config).errors]
}

describe('predation config', () => {
  it('has valid defaults, switched on, and only a jaw bites creatures', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    const { predation } = DEFAULT_WORLD_CONFIG
    expect(predation.enabled).toBe(true)
    expect(Object.keys(predation.fleshYield)).toEqual([...MOUTH_FORMS])
    expect(predation.fleshYield.jaw).toBeGreaterThan(0)
    for (const form of MOUTH_FORMS) {
      if (form !== 'jaw') expect(predation.fleshYield[form]).toBe(0)
    }
    expect(predation.trophicYield).toBeLessThan(1)
  })

  it('merges field by field, per mouth form, and the carcass section with its yields', () => {
    const config = resolveWorldConfig({
      predation: {
        enabled: true,
        biteDamage: 9,
        fleshYield: { mandible: 0.2 },
        carcass: { lifespan: 30, yields: { sprout: 0.5 } }
      }
    })
    const { predation } = config
    expect(predation.enabled).toBe(true)
    expect(predation.biteDamage).toBe(9)
    expect(predation.biteEnergy).toBe(DEFAULT_WORLD_CONFIG.predation.biteEnergy)
    expect(predation.fleshYield.mandible).toBe(0.2)
    expect(predation.fleshYield.jaw).toBe(DEFAULT_WORLD_CONFIG.predation.fleshYield.jaw)
    expect(predation.carcass.lifespan).toBe(30)
    expect(predation.carcass.yields.sprout).toBe(0.5)
    expect(predation.carcass.yields.jaw).toBe(DEFAULT_WORLD_CONFIG.predation.carcass.yields.jaw)
    expect(predation.carcass.maxCount).toBe(DEFAULT_WORLD_CONFIG.predation.carcass.maxCount)
  })

  it('does not change the defaults when it merges', () => {
    const before = JSON.stringify(DEFAULT_WORLD_CONFIG)
    resolveWorldConfig({ predation: { carcass: { yields: { jaw: 3 } } } })
    expect(JSON.stringify(DEFAULT_WORLD_CONFIG)).toBe(before)
  })

  it('rejects numbers out of range, unknown keys and mouth forms, and non-booleans', () => {
    expect(errorsFor((p) => (p['biteEnergy'] = 0 as never))).toContain(
      'predation.biteEnergy must be greater than zero'
    )
    expect(errorsFor((p) => (p['biteDamage'] = -1 as never))).toContain(
      'predation.biteDamage must be nonnegative'
    )
    expect(errorsFor((p) => (p['trophicYield'] = 1.2 as never))).toContain(
      'predation.trophicYield must be greater than zero and at most one'
    )
    expect(errorsFor((p) => (p['maxPreyRatio'] = 0 as never))).toContain(
      'predation.maxPreyRatio must be greater than zero'
    )
    expect(errorsFor((p) => (p['attackWindow'] = 0 as never))).toContain(
      'predation.attackWindow must be greater than zero'
    )
    expect(errorsFor((p) => (p['bogus'] = 1 as never))).toContain(
      'unknown property "predation.bogus"'
    )
    expect(errorsFor((p) => ((p['fleshYield'] as Loose)['tentacle'] = 1 as never))).toContain(
      'unknown property "predation.fleshYield.tentacle"'
    )
    expect(errorsFor((p) => ((p['fleshYield'] as Loose)['jaw'] = -1 as never))).toContain(
      'predation.fleshYield.jaw must be nonnegative'
    )
    expect(errorsFor((p) => (p['enabled'] = 'yes' as never))).toContain(
      'predation.enabled must be a boolean'
    )
    expect(errorsFor((p) => ((p['carcass'] as Loose)['energyFraction'] = 0 as never))).toContain(
      'predation.carcass.energyFraction must be greater than zero and at most one'
    )
    // zero is allowed (a form that cannot digest meat, ADR 0026); a negative is not
    expect(
      errorsFor((p) => (((p['carcass'] as Loose)['yields'] as Loose)['sprout'] = 0 as never))
    ).toEqual([])
    expect(
      errorsFor((p) => (((p['carcass'] as Loose)['yields'] as Loose)['jaw'] = -1 as never))
    ).toContain('predation.carcass.yields.jaw must be nonnegative')
    expect(errorsFor((p) => ((p['carcass'] as Loose)['maxCount'] = 1.5 as never))).toContain(
      'predation.carcass.maxCount must be an integer'
    )
  })

  it('needs feeding and health when switched on, and not when it is off (negative)', () => {
    expect(() => resolveWorldConfig({ predation: { enabled: true } })).not.toThrow()
    // On by default, so a world that turns feeding or health off must turn predation off with it.
    expect(() => resolveWorldConfig({ feeding: { enabled: false } })).toThrow(
      /predation.enabled needs feeding.enabled/
    )
    expect(() =>
      resolveWorldConfig({ predation: { enabled: true }, feeding: { enabled: false } })
    ).toThrow(/predation.enabled needs feeding.enabled/)
    expect(() =>
      resolveWorldConfig({ predation: { enabled: true }, ecology: { health: { enabled: false } } })
    ).toThrow(/predation.enabled needs ecology.health.enabled/)
    expect(() =>
      resolveWorldConfig({
        predation: { enabled: false },
        feeding: { enabled: false },
        ecology: { health: { enabled: false } }
      })
    ).not.toThrow()
  })

  it('is on in the presets that evolve bodies, and pinned off for fixed bodies, classic and clusters', () => {
    for (const name of ['balanced', 'lush', 'harsh', 'rapid-evolution']) {
      expect(resolveWorldConfig(presetByName(name)?.overrides).predation.enabled).toBe(true)
    }
    for (const name of ['fixed-bodies', 'classic', 'clusters']) {
      expect(presetByName(name)?.overrides.predation).toEqual({ enabled: false })
      expect(resolveWorldConfig(presetByName(name)?.overrides).predation.enabled).toBe(false)
    }
  })
})
