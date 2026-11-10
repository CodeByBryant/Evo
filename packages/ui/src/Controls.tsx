import { useState } from 'react'
import { MAX_SEED, RENDER_LAYERS, SPEED_SETTINGS } from '@evo/contracts'
import type { RenderLayerName, SimulationControls, ViewState } from '@evo/contracts'
import { Section } from './Section'
import { formatNumber, speedLabel } from './format'

const LAYER_LABELS: Readonly<Record<RenderLayerName, string>> = {
  grid: 'Grid',
  terrain: 'Regions',
  hazards: 'Hazards',
  resources: 'Food',
  organisms: 'Organisms',
  trails: 'Trails',
  selection: 'Selection and events',
  motion: 'Motion',
  debug: 'Debug overlay'
}

/** A seed typed by a person: a whole number from 0 to the largest seed, or `null`. */
export function parseSeedInput(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,10}$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value <= MAX_SEED ? value : null
}

/** The world's settings: which preset, which seed, and a fresh start. */
export function WorldPanel({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element {
  const [seedText, setSeedText] = useState('')
  const parsed = parseSeedInput(seedText)
  return (
    <Section id="evo-world" title="World">
      <label className="evo-field">
        <span>Preset</span>
        <select
          className="evo-input"
          value={view.preset}
          onChange={(event) => controls.setPreset(event.target.value)}
        >
          {view.presets.map((preset) => (
            <option key={preset.name} value={preset.name}>
              {preset.label}
            </option>
          ))}
        </select>
        <small className="evo-hint">
          {view.presets.find((preset) => preset.name === view.preset)?.description}
        </small>
      </label>

      <form
        className="evo-field"
        onSubmit={(event) => {
          event.preventDefault()
          if (parsed !== null) {
            controls.newWorld(parsed)
            setSeedText('')
          }
        }}
      >
        <label htmlFor="evo-seed">Seed</label>
        <div className="evo-row">
          <input
            id="evo-seed"
            className="evo-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder={String(view.seed)}
            value={seedText}
            aria-invalid={seedText !== '' && parsed === null}
            onChange={(event) => setSeedText(event.target.value)}
          />
          <button type="submit" className="evo-cmd" disabled={parsed === null}>
            Go
          </button>
        </div>
        <small className="evo-hint">Same seed and preset, same world, every time.</small>
      </form>

      <div className="evo-row evo-cmds">
        <button type="button" className="evo-cmd evo-cmd-main" onClick={() => controls.newWorld()}>
          New seed
        </button>
        <button type="button" className="evo-cmd" onClick={() => controls.reset()}>
          Reset
        </button>
      </div>
    </Section>
  )
}

/**
 * The playback toolbar: step, start or pause, speed, and how fast the world is really going.
 * `compact` keeps only start or pause, for a top bar with no room for the rest.
 */
export function Dock({
  view,
  controls,
  compact = false
}: {
  view: ViewState
  controls: SimulationControls
  compact?: boolean
}): React.JSX.Element {
  const running = view.status === 'running'
  const extinct = view.status === 'extinct'
  const toggle = (
    <button
      type="button"
      className="evo-cmd evo-cmd-main"
      onClick={() => controls.toggle()}
      disabled={extinct}
      aria-keyshortcuts="Space"
    >
      {running ? 'Pause' : 'Start'}
    </button>
  )
  if (compact) {
    return (
      <div className="evo-dock evo-dock-compact" role="toolbar" aria-label="Playback">
        {toggle}
      </div>
    )
  }
  return (
    <div className="evo-dock" role="toolbar" aria-label="Playback">
      <button
        type="button"
        className="evo-cmd"
        onClick={() => controls.step()}
        disabled={running || extinct}
        aria-keyshortcuts="."
      >
        Step
      </button>
      {toggle}
      <span className="evo-sep" aria-hidden="true" />
      <div className="evo-speeds" role="group" aria-label="Speed">
        {SPEED_SETTINGS.map((speed) => (
          <button
            key={speed}
            type="button"
            className="evo-speed"
            aria-pressed={view.speed === speed}
            onClick={() => controls.setSpeed(speed)}
          >
            {speedLabel(speed)}
          </button>
        ))}
      </div>
      <span className="evo-sep" aria-hidden="true" />
      <span className="evo-tps">
        {running ? (
          <>
            <b>{formatNumber(view.achievedTicksPerSecond, 0)}</b> ticks/s
          </>
        ) : (
          'paused'
        )}
      </span>
    </div>
  )
}

/** Where the camera looks: fit the world, go to the selected organism, or keep following it. */
export function ViewTools({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element {
  return (
    <div className="evo-viewtools" role="toolbar" aria-label="Camera">
      <button
        type="button"
        className="evo-button"
        onClick={() => controls.fitWorld()}
        aria-keyshortcuts="0"
      >
        Fit
      </button>
      <button
        type="button"
        className="evo-button"
        onClick={() => controls.focusSelected()}
        disabled={view.selectedId === null}
        aria-keyshortcuts="Z"
      >
        Focus
      </button>
      <button
        type="button"
        className="evo-button"
        aria-pressed={view.following}
        onClick={() => controls.toggleFollow()}
        disabled={view.selectedId === null && !view.following}
        aria-keyshortcuts="F"
      >
        Follow
      </button>
    </div>
  )
}

/** What is drawn. */
export function LayerPanel({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element {
  return (
    <Section id="evo-layers" title="Layers">
      <ul className="evo-toggles">
        {RENDER_LAYERS.map((layer) => (
          <li key={layer}>
            <label className="evo-toggle">
              <span>{LAYER_LABELS[layer]}</span>
              <input
                type="checkbox"
                checked={view.layers[layer]}
                onChange={(event) => controls.setLayer(layer, event.target.checked)}
              />
            </label>
          </li>
        ))}
      </ul>
    </Section>
  )
}
