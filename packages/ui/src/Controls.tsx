import { useState } from 'react'
import { MAX_SEED, RENDER_LAYERS, SPEED_SETTINGS } from '@evo/contracts'
import type { RenderLayerName, SimulationControls, ViewState } from '@evo/contracts'
import { formatNumber, speedLabel } from './format'

const LAYER_LABELS: Readonly<Record<RenderLayerName, string>> = {
  grid: 'Grid',
  terrain: 'Regions',
  hazards: 'Hazards',
  resources: 'Food',
  shadows: 'Shadows',
  organisms: 'Organisms',
  trails: 'Trails',
  selection: 'Selection and events',
  debug: 'Debug overlay'
}

/** A seed typed by a person: a whole number from 0 to the largest seed, or `null`. */
export function parseSeedInput(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d{1,10}$/.test(trimmed)) return null
  const value = Number(trimmed)
  return value <= MAX_SEED ? value : null
}

export function ControlPanel({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element {
  const [seedText, setSeedText] = useState('')
  const parsed = parseSeedInput(seedText)
  const running = view.status === 'running'
  const extinct = view.status === 'extinct'
  return (
    <section className="evo-panel" aria-labelledby="evo-controls-title">
      <h2 id="evo-controls-title">World</h2>
      <div className="evo-row">
        <button
          type="button"
          className="evo-button evo-primary"
          onClick={controls.toggle}
          disabled={extinct}
          aria-keyshortcuts="Space"
        >
          {running ? 'Pause' : 'Start'}
        </button>
        <button
          type="button"
          className="evo-button"
          onClick={() => controls.step()}
          disabled={running || extinct}
          aria-keyshortcuts="."
        >
          Step
        </button>
        <button type="button" className="evo-button" onClick={controls.reset}>
          Reset
        </button>
        <button type="button" className="evo-button" onClick={() => controls.newWorld()}>
          New seed
        </button>
      </div>

      <div className="evo-field">
        <span id="evo-speed-label">Speed</span>
        <div className="evo-segments" role="group" aria-labelledby="evo-speed-label">
          {SPEED_SETTINGS.map((speed) => (
            <button
              key={speed}
              type="button"
              className="evo-segment"
              aria-pressed={view.speed === speed}
              onClick={() => controls.setSpeed(speed)}
            >
              {speedLabel(speed)}
            </button>
          ))}
        </div>
        <small className="evo-hint">
          {running ? `${formatNumber(view.achievedTicksPerSecond, 0)} ticks/s achieved` : 'paused'}
        </small>
      </div>

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
          <button type="submit" className="evo-button" disabled={parsed === null}>
            Go
          </button>
        </div>
        <small className="evo-hint">Same seed and preset, same world, every time.</small>
      </form>
    </section>
  )
}

export function LayerPanel({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element {
  return (
    <section className="evo-panel" aria-labelledby="evo-layers-title">
      <h2 id="evo-layers-title">View</h2>
      <div className="evo-row">
        <button type="button" className="evo-button" onClick={controls.fitWorld}>
          Fit
        </button>
        <button
          type="button"
          className="evo-button"
          onClick={controls.focusSelected}
          disabled={view.selectedId === null}
        >
          Focus
        </button>
        <button
          type="button"
          className="evo-button"
          aria-pressed={view.following}
          onClick={controls.toggleFollow}
          disabled={view.selectedId === null && !view.following}
        >
          Follow
        </button>
      </div>
      <ul className="evo-checks">
        {RENDER_LAYERS.map((layer) => (
          <li key={layer}>
            <label>
              <input
                type="checkbox"
                checked={view.layers[layer]}
                onChange={(event) => controls.setLayer(layer, event.target.checked)}
              />
              {LAYER_LABELS[layer]}
            </label>
          </li>
        ))}
      </ul>
    </section>
  )
}
