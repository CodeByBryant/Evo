import { SETTINGS, SETTING_GROUPS, diffAgainst, valueAt } from '@evo/config'
import type { SettingValue } from '@evo/config'
import type { SettingField, SettingsState } from '@evo/contracts'

/** The editor's state before anything is changed (no fields filled): used until a world exists. */
export const EMPTY_SETTINGS: SettingsState = {
  groups: [],
  fields: [],
  changed: 0,
  errors: {},
  ignored: 0
}

/**
 * What the settings panel shows: every editable setting with the value this world runs with and the
 * value the preset gives it. Pure. `current` and `baseline` are resolved configurations
 * (`resolveWorldConfig`), `errors` are the validation messages of a rejected change, by path, and
 * `ignored` counts address parameters that were not applied.
 */
export function buildSettingsState(
  baseline: unknown,
  current: unknown,
  errors: Readonly<Record<string, string>> = {},
  ignored = 0
): SettingsState {
  const fields: SettingField[] = SETTINGS.map((setting) => {
    const preset = valueAt(baseline, setting.path) as SettingValue
    const value = valueAt(current, setting.path) as SettingValue
    return {
      path: setting.path,
      label: setting.label,
      group: setting.group,
      kind: setting.kind,
      ...(setting.min === undefined ? {} : { min: setting.min }),
      ...(setting.max === undefined ? {} : { max: setting.max }),
      ...(setting.step === undefined ? {} : { step: setting.step }),
      ...(setting.unit === undefined ? {} : { unit: setting.unit }),
      hint: setting.hint,
      value,
      preset
    }
  })
  return {
    groups: SETTING_GROUPS,
    fields,
    changed: Object.keys(diffAgainst(baseline, current)).length,
    errors,
    ignored
  }
}

/**
 * Turns the messages of a rejected configuration into errors by setting path: a message that starts with
 * an editable setting's path belongs to it, anything else (a rule tying settings together, say
 * `resources.initialCount must not exceed ...`) is kept under `'*'` so it is still shown.
 */
export function errorsByPath(messages: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const message of messages) {
    const setting = SETTINGS.find((s) => message.startsWith(s.path))
    const key = setting?.path ?? '*'
    out[key] = out[key] === undefined ? message : `${out[key]}; ${message}`
  }
  return out
}
