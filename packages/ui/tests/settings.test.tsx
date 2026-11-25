import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { SettingField, ViewState } from '@evo/contracts'
import { SettingsPanel, planDraft, readDraft } from '../src/index'
import { recorder, view } from './support/fixtures'

// The settings editor (Step 6): what the panel shows, and the pure plan that Apply sends.

const settingsOf = (patch: Partial<ViewState['settings']> = {}): ViewState =>
  view({ settings: { ...view().settings, ...patch } })

const withValue = (path: string, value: number | boolean): SettingField[] =>
  view().settings.fields.map((f) => (f.path === path ? { ...f, value } : f))

describe('the settings panel', () => {
  const { controls } = recorder()
  const render = (v: ViewState): string =>
    renderToStaticMarkup(<SettingsPanel view={v} controls={controls} />)

  it('shows every group and field with its label, unit, hint and a control of the right kind', () => {
    const html = render(view())
    expect(html).toContain('Settings')
    expect(html).toContain('Population and food')
    expect(html).toContain('Seeds')
    expect(html).toContain('Plants a second (/s)')
    expect(html).toContain('How fast new plants appear.')
    // a number box with its range, and a switch for a boolean
    expect(html).toMatch(/<input[^>]*type="number"[^>]*min="0"[^>]*max="2"[^>]*step="0.05"/)
    expect(html).toMatch(/<input[^>]*type="checkbox"[^>]*checked=""/)
    // negative: nothing says "preset:" or "changed" while nothing is changed
    expect(html).not.toContain('preset:')
    expect(html).not.toContain('changed')
  })

  it('opens the first group and leaves the others closed', () => {
    const html = render(view())
    const groups = html.match(/<details[^>]*>/g) ?? []
    expect(groups).toHaveLength(2)
    expect(groups[0]).toContain('open=""')
    expect(groups[1]).not.toContain('open')
  })

  it('says how many are changed, and offers to put a changed field back to the preset', () => {
    const html = render(settingsOf({ fields: withValue('resources.spawnRate', 0.5), changed: 1 }))
    expect(html).toContain('1 changed')
    expect(html).toContain('preset: 0.3')
    expect(html).toContain('Put Plants a second back to the preset&#x27;s 0.3')
    // only that field offers it (negative)
    expect(html.match(/preset: /g)).toHaveLength(1)
  })

  it('shows a switch that is off from the preset as such', () => {
    const html = render(
      settingsOf({ fields: withValue('resources.seeds.enabled', false), changed: 1 })
    )
    expect(html).toContain('preset: on')
  })

  it('shows a rejected change under its setting and a general message, as alerts', () => {
    const html = render(
      settingsOf({
        errors: {
          'resources.spawnRate': 'resources.spawnRate must be positive',
          '*': 'initialCount must not exceed maxCount'
        }
      })
    )
    expect(html.match(/role="alert"/g)).toHaveLength(2)
    expect(html).toContain('resources.spawnRate must be positive')
    expect(html).toContain('initialCount must not exceed maxCount')
    expect(html).toMatch(/aria-invalid="true"/)
  })

  it('says how many link settings were ignored, in the singular and the plural, and nothing when none', () => {
    expect(render(settingsOf({ ignored: 1 }))).toContain(
      '1 setting in the link could not be used and was ignored'
    )
    expect(render(settingsOf({ ignored: 3 }))).toContain(
      '3 settings in the link could not be used and were ignored'
    )
    expect(render(view())).not.toContain('could not be used')
  })

  it('starts with Apply and Reset all off, and turns Reset all on once something is changed', () => {
    const idle = render(view())
    expect(idle).toMatch(/<button[^>]*disabled=""[^>]*>Apply/)
    expect(idle).toMatch(/<button[^>]*disabled=""[^>]*>Reset all/)
    expect(idle).toContain('>Copy link<')
    const changed = render(
      settingsOf({ fields: withValue('resources.spawnRate', 0.5), changed: 1 })
    )
    expect(changed).not.toMatch(/<button[^>]*disabled=""[^>]*>Reset all/)
    // Apply waits for an edit in the panel, not for a change already applied (negative)
    expect(changed).toMatch(/<button[^>]*disabled=""[^>]*>Apply/)
  })
})

describe('reading what was typed', () => {
  const fields = view().settings.fields
  const spawn = fields.find((f) => f.path === 'resources.spawnRate')!
  const count = fields.find((f) => f.path === 'organisms.initialCount')!

  it('takes a number in range, a whole number for an integer, and nothing else (negatives)', () => {
    expect(readDraft(spawn, '0.5')).toBe(0.5)
    expect(readDraft(spawn, '0')).toBe(0)
    expect(readDraft(count, '40')).toBe(40)
    for (const text of ['', ' ', 'abc', '-1', '2.5', 'NaN']) {
      expect(readDraft(spawn, text), text).toBeUndefined()
    }
    expect(readDraft(count, '20.5')).toBeUndefined()
    expect(readDraft(count, '0')).toBeUndefined()
    expect(readDraft(count, '201')).toBeUndefined()
  })
})

describe('what Apply would send', () => {
  const fields = view().settings.fields

  it('is nothing pending and no changes when nothing was typed and nothing differs from the preset', () => {
    expect(planDraft(fields, {})).toEqual({ changes: {}, invalid: {}, pending: false })
  })

  it('sends a typed value that differs from the preset, as a complete change set', () => {
    const plan = planDraft(fields, { 'resources.spawnRate': '0.5' })
    expect(plan.changes).toEqual({ 'resources.spawnRate': 0.5 })
    expect(plan.pending).toBe(true)
    expect(plan.invalid).toEqual({})
  })

  it('keeps a change already applied in the set when something else is edited, and drops one put back', () => {
    const applied = withValue('resources.spawnRate', 0.5)
    // editing another field must not undo the applied one
    const edited = planDraft(applied, { 'organisms.initialCount': '30' })
    expect(edited.changes).toEqual({ 'resources.spawnRate': 0.5, 'organisms.initialCount': 30 })
    // typing the preset's value back drops it
    const back = planDraft(applied, { 'resources.spawnRate': '0.3' })
    expect(back.changes).toEqual({})
    expect(back.pending).toBe(true)
  })

  it('reads a switch from its draft and marks it pending only when it differs from what runs', () => {
    expect(planDraft(fields, { 'resources.seeds.enabled': false })).toEqual({
      changes: { 'resources.seeds.enabled': false },
      invalid: {},
      pending: true
    })
    expect(planDraft(fields, { 'resources.seeds.enabled': true }).pending).toBe(false)
  })

  it('reports the fields whose text does not fit, with the range, and leaves them out of the changes (negative)', () => {
    const plan = planDraft(fields, { 'resources.spawnRate': '9', 'organisms.initialCount': '2.5' })
    expect(plan.invalid['resources.spawnRate']).toBe('from 0 to 2')
    expect(plan.invalid['organisms.initialCount']).toBe('from 1 to 200, whole')
    expect(plan.changes).toEqual({})
  })
})
