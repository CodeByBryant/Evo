import type { SimulationControls, ViewState } from '@evo/contracts'
import { PopulationChart, Sparkline } from './Charts'
import { formatCount, formatNumber, formatTime, percent, statusLabel, totalDeaths } from './format'

export function TopBar({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <header className="evo-topbar">
      <strong className="evo-brand">Evo</strong>
      <span className={`evo-status evo-status-${view.status}`}>{statusLabel(view.status)}</span>
      <dl className="evo-facts">
        <div>
          <dt>Time</dt>
          <dd>{formatTime(view.time)}</dd>
        </div>
        <div>
          <dt>Tick</dt>
          <dd>{formatCount(view.tick)}</dd>
        </div>
        {view.season !== null && (
          <div>
            <dt>Season</dt>
            <dd className="evo-capitalize">{view.season}</dd>
          </div>
        )}
        <div>
          <dt>Seed</dt>
          <dd>{view.seed}</dd>
        </div>
      </dl>
    </header>
  )
}

export function StatsPanel({ view }: { view: ViewState }): React.JSX.Element {
  const { metrics } = view
  const attempts = metrics.reproductionAttempts
  return (
    <section className="evo-panel" aria-labelledby="evo-stats-title">
      <h2 id="evo-stats-title">Population</h2>
      <dl className="evo-stats">
        <div>
          <dt>Organisms</dt>
          <dd>{formatCount(view.population)}</dd>
        </div>
        <div>
          <dt>Food</dt>
          <dd>{formatCount(view.resources)}</dd>
        </div>
        <div>
          <dt>Species</dt>
          <dd>
            {view.activeSpecies}
            {view.extinctSpecies > 0 && (
              <small className="evo-hint"> +{view.extinctSpecies} extinct</small>
            )}
          </dd>
        </div>
        <div>
          <dt>Born</dt>
          <dd>{formatCount(metrics.organismsBorn)}</dd>
        </div>
        <div>
          <dt>Died</dt>
          <dd>{formatCount(totalDeaths(metrics))}</dd>
        </div>
        <div>
          <dt>Mating success</dt>
          <dd>{percent(metrics.reproductionSuccesses, attempts)}</dd>
        </div>
        <div>
          <dt>Starved</dt>
          <dd>{formatCount(metrics.deathsByStarvation)}</dd>
        </div>
        <div>
          <dt>Old age</dt>
          <dd>{formatCount(metrics.deathsByAge)}</dd>
        </div>
        <div>
          <dt>Damage deaths</dt>
          <dd>{formatCount(metrics.deathsByDamage)}</dd>
        </div>
      </dl>
      <PopulationChart points={view.populationHistory} />
    </section>
  )
}

export function SpeciesPanel({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <section className="evo-panel" aria-labelledby="evo-species-title">
      <h2 id="evo-species-title">Species</h2>
      {view.species.length === 0 ? (
        <p className="evo-hint">No living species.</p>
      ) : (
        <ul className="evo-species">
          {view.species.map((species) => (
            <li
              key={species.id}
              className={view.selected?.speciesId === species.id ? 'evo-species-selected' : ''}
            >
              <span
                className="evo-swatch"
                style={{ background: species.color }}
                aria-hidden="true"
              />
              <span className="evo-species-name">
                #{species.id}
                {species.ancestorId !== null && (
                  <small className="evo-hint"> from #{species.ancestorId}</small>
                )}
              </span>
              <Sparkline values={species.history} color={species.color} />
              <span className="evo-species-count" title="living members">
                {formatCount(species.members)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Shown when the population hits zero: extinction is a result, not an error, and the way out is one click. */
export function ExtinctionBanner({
  view,
  controls
}: {
  view: ViewState
  controls: SimulationControls
}): React.JSX.Element | null {
  if (view.status !== 'extinct') return null
  return (
    <div className="evo-banner" role="alert">
      <h2>Extinct</h2>
      <p>
        The last organism died at tick {formatCount(view.extinctionTick ?? view.tick)} (
        {formatTime(view.time)} of simulated time). Seed {view.seed} on the{' '}
        {view.presets.find((preset) => preset.name === view.preset)?.label ?? view.preset} preset
        ends this way every time.
      </p>
      <div className="evo-row">
        <button
          type="button"
          className="evo-button evo-primary"
          onClick={() => controls.newWorld()}
        >
          New world
        </button>
        <button type="button" className="evo-button" onClick={controls.reset}>
          Replay this seed
        </button>
      </div>
      <small className="evo-hint">
        Peak population came to{' '}
        {formatNumber(Math.max(0, ...view.populationHistory.map((p) => p.count)), 0)}.
      </small>
    </div>
  )
}
