import { describe, expect, it } from 'vitest'
import { DEFAULT_PRESET, PRESETS, presetByName, resolveWorldConfig } from '../src/index'

describe('presets', () => {
  it('have unique names, labels and descriptions', () => {
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(PRESETS.length)
    expect(new Set(PRESETS.map((p) => p.label)).size).toBe(PRESETS.length)
    for (const preset of PRESETS) expect(preset.description.length).toBeGreaterThan(10)
  })

  it('include the default preset, which changes nothing', () => {
    expect(presetByName(DEFAULT_PRESET)?.overrides).toEqual({})
    expect(PRESETS[0]?.name).toBe(DEFAULT_PRESET)
  })

  it.each(PRESETS.map((p) => [p.name, p] as const))(
    '%s resolves to a valid configuration',
    (_n, p) => {
      expect(() => resolveWorldConfig(p.overrides)).not.toThrow()
    }
  )

  it('actually changes what it says it changes', () => {
    const base = resolveWorldConfig({})
    expect(resolveWorldConfig(presetByName('lush')?.overrides).resources.spawnRate).toBeGreaterThan(
      base.resources.spawnRate
    )
    expect(resolveWorldConfig(presetByName('harsh')?.overrides).resources.spawnRate).toBeLessThan(
      base.resources.spawnRate
    )
    expect(
      resolveWorldConfig(presetByName('rapid-evolution')?.overrides).genetics.mutationRateScale
    ).toBe(3)
    expect(resolveWorldConfig(presetByName('clusters')?.overrides).environment.layout).toBe(
      'clusters'
    )
    expect(base.environment.layout).toBe('field')
    expect(resolveWorldConfig(presetByName('fixed-bodies')?.overrides).anatomy.enabled).toBe(false)
    expect(base.anatomy.enabled).toBe(true)
    const classic = resolveWorldConfig(presetByName('classic')?.overrides)
    expect(classic.ecology.regions.enabled).toBe(false)
    expect(classic.ecology.seasons.enabled).toBe(false)
    expect(classic.ecology.hazards.enabled).toBe(false)
  })

  it('looks up unknown names as undefined', () => {
    expect(presetByName('nope')).toBeUndefined()
  })

  it('worlds that evolve bodies draw a starting body; classic, fixed-bodies and clusters keep the founder plan', () => {
    const mode = (name: string): string =>
      resolveWorldConfig(presetByName(name)?.overrides).anatomy.startingBody.mode
    for (const name of ['balanced', 'lush', 'harsh', 'rapid-evolution']) {
      expect(mode(name)).toBe('archetypes')
    }
    for (const name of ['classic', 'fixed-bodies', 'clusters']) {
      expect(mode(name)).toBe('reference')
    }
  })
})
