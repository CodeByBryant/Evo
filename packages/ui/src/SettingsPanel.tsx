import { useEffect, useState } from 'react'
import type { SettingField, SimulationControls, ViewState } from '@evo/contracts'
import { Section } from './Section'

/** What a person has typed so far, by setting path: the text of a number, the state of a switch. */
export type SettingsDraft = Readonly<Record<string, string | boolean>>

/** What a field would be set to by its draft: its own value until something is typed. */
function draftValue(field: SettingField, draft: SettingsDraft): string | boolean {
  const typed = draft[field.path]
  if (typed !== undefined) return typed
  return typeof field.value === 'boolean' ? field.value : String(field.value)
}

/** The number a draft text means for a field, or `undefined` when it is empty, not a number, not whole for an integer or out of range. */
export function readDraft(field: SettingField, text: string): number | undefined {
  if (text.trim() === '' || !Number.isFinite(Number(text))) return undefined
  const value = Number(text)
  if (field.kind === 'integer' && !Number.isInteger(value)) return undefined
  if (field.min !== undefined && value < field.min) return undefined
  if (field.max !== undefined && value > field.max) return undefined
  return value
}

/**
 * What applying a draft would do: the settings that would differ from the preset (the change set the
 * controls take, which is a complete one: a setting not in it goes back to the preset's value), the
 * fields whose text does not fit, and whether anything differs from what the world runs with now.
 * Pure, so it is tested without a page.
 */
export function planDraft(
  fields: readonly SettingField[],
  draft: SettingsDraft
): {
  changes: Record<string, number | boolean>
  invalid: Record<string, string>
  pending: boolean
} {
  const changes: Record<string, number | boolean> = {}
  const invalid: Record<string, string> = {}
  let pending = false
  for (const field of fields) {
    const typed = draftValue(field, draft)
    let value: number | boolean | undefined
    if (field.kind === 'boolean') value = typed === true
    else {
      value = readDraft(field, String(typed))
      if (value === undefined) {
        invalid[field.path] =
          field.min !== undefined && field.max !== undefined
            ? `from ${field.min} to ${field.max}${field.kind === 'integer' ? ', whole' : ''}`
            : 'not a valid number'
        continue
      }
    }
    if (value !== field.preset) changes[field.path] = value
    if (value !== field.value) pending = true
  }
  return { changes, invalid, pending }
}

function SettingRow({
  field,
  draft,
  error,
  onChange
}: {
  field: SettingField
  draft: SettingsDraft
  error: string | undefined
  onChange: (path: string, value: string | boolean | null) => void
}): React.JSX.Element {
  const shown = draftValue(field, draft)
  const id = `evo-setting-${field.path}`
  const differs =
    field.kind === 'boolean'
      ? shown !== field.preset
      : readDraft(field, String(shown)) !== field.preset
  return (
    <div className="evo-setting">
      <label htmlFor={id} className="evo-setting-label">
        {field.label}
        {field.unit !== undefined && field.kind !== 'boolean' ? ` (${field.unit})` : ''}
      </label>
      {field.kind === 'boolean' ? (
        <input
          id={id}
          type="checkbox"
          className="evo-setting-switch"
          checked={shown === true}
          onChange={(event) => onChange(field.path, event.target.checked)}
        />
      ) : (
        <input
          id={id}
          type="number"
          className="evo-input evo-setting-input"
          min={field.min}
          max={field.max}
          step={field.step}
          value={String(shown)}
          aria-invalid={error !== undefined}
          aria-describedby={`${id}-note`}
          onChange={(event) => onChange(field.path, event.target.value)}
        />
      )}
      <span id={`${id}-note`} className="evo-setting-note">
        <span className="evo-hint">{field.hint}</span>
        {differs && (
          <button
            type="button"
            className="evo-setting-reset"
            aria-label={`Put ${field.label} back to the preset's ${String(field.preset)}`}
            onClick={() => onChange(field.path, null)}
          >
            preset:{' '}
            {typeof field.preset === 'boolean' ? (field.preset ? 'on' : 'off') : field.preset}
          </button>
        )}
        {error !== undefined && (
          <small role="alert" className="evo-error">
            {error}
          </small>
        )}
      </span>
    </div>
  )
}

/**
 * The settings editor (Step 6): the editable settings in groups, a number box or a switch for each.
 * Edits stay in this panel until **Apply** (which starts the same seed again with them), so typing never
 * restarts anything; each field can go back to the preset's value, **Reset all** puts every one back, and
 * **Copy link** copies the address, which carries only what differs from the preset.
 */
export function SettingsPanel({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element {
  const { settings } = view
  const [draft, setDraft] = useState<SettingsDraft>({})
  const [copied, setCopied] = useState(false)
  // A new world (or a rejected one) starts the draft afresh from what the world runs with.
  const signature = `${view.seed}|${view.preset}|${settings.fields.map((f) => String(f.value)).join(',')}`
  useEffect(() => setDraft({}), [signature])

  const plan = planDraft(settings.fields, draft)
  const errorOf = (path: string): string | undefined => plan.invalid[path] ?? settings.errors[path]
  const change = (path: string, value: string | boolean | null): void =>
    setDraft((current) => {
      const next = { ...current }
      if (value === null) {
        const field = settings.fields.find((f) => f.path === path)
        if (field !== undefined)
          next[path] = typeof field.preset === 'boolean' ? field.preset : String(field.preset)
      } else next[path] = value
      return next
    })
  const copyLink = (): void => {
    try {
      void navigator.clipboard?.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // No clipboard (an insecure page, a test): the address bar has the link anyway.
    }
  }
  const general = settings.errors['*']

  return (
    <Section
      id="evo-settings"
      title="Settings"
      aside={settings.changed > 0 ? `${settings.changed} changed` : undefined}
    >
      {settings.groups.map((group, index) => {
        const fields = settings.fields.filter((f) => f.group === group.name)
        const changed = fields.filter((f) => f.value !== f.preset).length
        return (
          <details key={group.name} className="evo-settings-group" open={index === 0}>
            <summary>
              {group.label}
              {changed > 0 && <em> {changed} changed</em>}
            </summary>
            {fields.map((field) => (
              <SettingRow
                key={field.path}
                field={field}
                draft={draft}
                error={errorOf(field.path)}
                onChange={change}
              />
            ))}
          </details>
        )
      })}
      {general !== undefined && (
        <p role="alert" className="evo-error">
          {general}
        </p>
      )}
      {settings.ignored > 0 && (
        <p className="evo-hint">
          {settings.ignored} setting{settings.ignored === 1 ? '' : 's'} in the link could not be
          used and {settings.ignored === 1 ? 'was' : 'were'} ignored.
        </p>
      )}
      <div className="evo-row evo-settings-actions">
        <button
          type="button"
          className="evo-button"
          disabled={!plan.pending || Object.keys(plan.invalid).length > 0}
          onClick={() => controls.applySettings(plan.changes)}
        >
          Apply
        </button>
        <button
          type="button"
          className="evo-button"
          disabled={settings.changed === 0 && Object.keys(draft).length === 0}
          onClick={() => {
            setDraft({})
            controls.resetSettings()
          }}
        >
          Reset all
        </button>
        <button type="button" className="evo-button" onClick={copyLink}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <small className="evo-hint">Apply starts the same seed again with the new settings.</small>
    </Section>
  )
}
