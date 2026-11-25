import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORLD_CONFIG,
  PRESETS,
  SETTINGS,
  SETTING_GROUPS,
  applyDotted,
  changesToOverrides,
  diffAgainst,
  formatSettingValue,
  parseSettingValue,
  resolveWorldConfig,
  settingByPath,
  valueAt
} from '../src/index'

// The editor's table (Step 6): the ranges it offers are ones the validation accepts, every path is a real
// setting of the right type, and a change set round-trips through the nested overrides a world is built from.

describe('the settings table', () => {
  it('has unique paths, a known group for each, and a label and a hint', () => {
    expect(new Set(SETTINGS.map((s) => s.path)).size).toBe(SETTINGS.length)
    const groups = new Set(SETTING_GROUPS.map((g) => g.name))
    for (const setting of SETTINGS) {
      expect(groups.has(setting.group)).toBe(true)
      expect(setting.label.length).toBeGreaterThan(2)
      expect(setting.hint.length).toBeGreaterThan(8)
    }
    // every group has at least one setting, so no empty heading is ever drawn
    for (const group of SETTING_GROUPS) {
      expect(SETTINGS.some((s) => s.group === group.name)).toBe(true)
    }
  })

  it('names real configuration leaves of the right type', () => {
    for (const setting of SETTINGS) {
      const value = valueAt(DEFAULT_WORLD_CONFIG, setting.path)
      expect(value, setting.path).not.toBeUndefined()
      expect(typeof value, setting.path).toBe(setting.kind === 'boolean' ? 'boolean' : 'number')
    }
    // negative: a path that is not a leaf of the configuration reads as nothing
    expect(valueAt(DEFAULT_WORLD_CONFIG, 'resources.nothing.here')).toBeUndefined()
  })

  it('offers a range that holds the default and every preset value', () => {
    for (const setting of SETTINGS) {
      if (setting.kind === 'boolean') continue
      expect(setting.min as number).toBeLessThan(setting.max as number)
      expect(setting.step as number).toBeGreaterThan(0)
      const values = [DEFAULT_WORLD_CONFIG, ...PRESETS.map((p) => resolveWorldConfig(p.overrides))]
      for (const config of values) {
        const value = valueAt(config, setting.path) as number
        expect(value, setting.path).toBeGreaterThanOrEqual(setting.min as number)
        expect(value, setting.path).toBeLessThanOrEqual(setting.max as number)
      }
    }
  })

  it('is accepted by the validation at both ends of every range, one setting at a time', () => {
    for (const setting of SETTINGS) {
      const ends =
        setting.kind === 'boolean' ? [true, false] : [setting.min as number, setting.max as number]
      for (const value of ends) {
        const overrides = changesToOverrides({ [setting.path]: value })
        expect(() => resolveWorldConfig(overrides), `${setting.path} = ${value}`).not.toThrow()
      }
    }
  })

  it('does not hide a rule the validation has: a bound the table lets through is rejected where it matters (negative)', () => {
    // the validation, not the table, owns the rules that tie two settings together
    // (so `maxCount` and the `sexes` switch, which others depend on, are not offered on their own)
    expect(() => resolveWorldConfig({ resources: { maxCount: 100, initialCount: 200 } })).toThrow(
      /initialCount/
    )
    expect(() => resolveWorldConfig({ reproduction: { sexes: { enabled: false } } })).toThrow(
      /requires reproduction.sexes.enabled/
    )
    expect(settingByPath('resources.maxCount')).toBeUndefined()
    expect(settingByPath('reproduction.sexes.enabled')).toBeUndefined()
  })
})

describe('change sets', () => {
  it('apply dotted paths into nested overrides without touching their input', () => {
    const base = Object.freeze({ resources: Object.freeze({ spawnRate: 1 }) })
    const next = applyDotted(base, 'resources.seeds.energy', 30) as Record<string, unknown>
    expect(next).toEqual({ resources: { spawnRate: 1, seeds: { energy: 30 } } })
    expect(base).toEqual({ resources: { spawnRate: 1 } })
    expect(applyDotted({}, 'ageing.enabled', false)).toEqual({ ageing: { enabled: false } })
  })

  it('turn into overrides a world builds from, and only for paths in the table (negative)', () => {
    const overrides = changesToOverrides({
      'resources.seeds.energy': 30,
      'anatomy.scavenger.enabled': true,
      // in the configuration but not editable: never read from a change set
      'environment.width': 5,
      'resources.nothing': 1
    })
    expect(overrides).toEqual({
      resources: { seeds: { energy: 30 } },
      anatomy: { scavenger: { enabled: true } }
    })
    const config = resolveWorldConfig(overrides)
    expect(config.resources.seeds.energy).toBe(30)
    expect(config.anatomy.scavenger.enabled).toBe(true)
    expect(config.environment.width).toBe(DEFAULT_WORLD_CONFIG.environment.width)
  })

  it('diff against the preset, not the defaults: a value equal to the default but not the preset is kept', () => {
    const lush = PRESETS.find((p) => p.name === 'lush')!
    const baseline = resolveWorldConfig(lush.overrides)
    // nothing changed
    expect(diffAgainst(baseline, baseline)).toEqual({})
    // a change shows, an unchanged setting does not
    const changed = resolveWorldConfig({
      ...lush.overrides,
      resources: { ...lush.overrides.resources, seeds: { energy: 33 } }
    })
    expect(diffAgainst(baseline, changed)).toEqual({ 'resources.seeds.energy': 33 })
    // lush's spawn rate is not the default's: putting the default's back is a change from lush
    const back = resolveWorldConfig({
      ...lush.overrides,
      resources: {
        ...lush.overrides.resources,
        spawnRate: DEFAULT_WORLD_CONFIG.resources.spawnRate
      }
    })
    expect(diffAgainst(baseline, back)).toEqual({
      'resources.spawnRate': DEFAULT_WORLD_CONFIG.resources.spawnRate
    })
    // negative: against the bare defaults that one setting is not a change at all
    expect(diffAgainst(DEFAULT_WORLD_CONFIG, back)['resources.spawnRate']).toBeUndefined()
  })

  it('round-trip: a change set, built into a config and diffed against its baseline, comes back', () => {
    const changes = {
      'resources.spawnRate': 0.45,
      'genetics.mutationRateScale': 2,
      'ageing.enabled': false,
      'resources.seeds.germinate': true
    }
    const config = resolveWorldConfig(changesToOverrides(changes))
    expect(diffAgainst(DEFAULT_WORLD_CONFIG, config)).toEqual(changes)
  })
})

describe('reading a value from text', () => {
  const spawn = settingByPath('resources.spawnRate')!
  const count = settingByPath('organisms.initialCount')!
  const toggle = settingByPath('ageing.enabled')!

  it('takes numbers in range, whole numbers for integers, and switches as 1 and 0', () => {
    expect(parseSettingValue(spawn, '0.5')).toBe(0.5)
    expect(parseSettingValue(spawn, '1')).toBe(1)
    expect(parseSettingValue(count, '40')).toBe(40)
    expect(parseSettingValue(toggle, '1')).toBe(true)
    expect(parseSettingValue(toggle, '0')).toBe(false)
    expect(parseSettingValue(toggle, 'true')).toBe(true)
  })

  it('ignores anything that does not fit, never throws and never clamps (negatives)', () => {
    for (const text of ['', 'abc', '1e999', '-1', '2.5', '0x10', ' 1', 'NaN', 'Infinity']) {
      expect(parseSettingValue(spawn, text), text).toBeUndefined()
    }
    expect(parseSettingValue(count, '20.5')).toBeUndefined()
    expect(parseSettingValue(count, '0')).toBeUndefined()
    expect(parseSettingValue(count, '201')).toBeUndefined()
    expect(parseSettingValue(toggle, '2')).toBeUndefined()
    expect(parseSettingValue(toggle, 'yes')).toBeUndefined()
  })

  it('formats back to what it parses: 1 and 0 for switches, the shortest number otherwise', () => {
    for (const [setting, text] of [
      [spawn, '0.45'],
      [count, '25'],
      [toggle, '1']
    ] as const) {
      const value = parseSettingValue(setting, text)!
      expect(formatSettingValue(value)).toBe(text)
    }
    expect(formatSettingValue(false)).toBe('0')
  })
})
