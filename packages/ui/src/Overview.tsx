import type { SimulationControls, ViewState } from '@evo/contracts'
import { PopulationChart } from './Charts'
import { Section } from './Section'
import { formatCount, formatNumber, formatTime, percent, statusLabel, totalDeaths } from './format'

/** Top left: the brand, whether the world is running, and where in time it is. */
export function TopBar({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <header className="evo-topbar">
      <strong className="evo-brand">
        Evo
        <i className={`evo-dot evo-dot-${view.status}`} aria-hidden="true" />
      </strong>
      <dl className="evo-facts">
        <div className={`evo-status evo-status-${view.status}`}>
          <dt className="evo-sr">Status</dt>
          <dd>{statusLabel(view.status)}</dd>
        </div>
        <div>
          <dt className="evo-sr">Time</dt>
          <dd>{formatTime(view.time)}</dd>
        </div>
        <div>
          <dt>Tick</dt>
          <dd>{formatCount(view.tick)}</dd>
        </div>
        {view.season !== null && (
          <div>
            <dt className="evo-sr">Season</dt>
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

/** Top right: the three numbers that matter and the population line under them. */
export function Hud({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <section className="evo-hud" aria-label="Population">
      <dl className="evo-hud-rows">
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
      </dl>
      <PopulationChart points={view.populationHistory} width={170} height={30} compact />
    </section>
  )
}

/** The rest of the numbers, folded away until wanted. */
export function StatsPanel({ view }: { view: ViewState }): React.JSX.Element {
  const { metrics } = view
  const attempts = metrics.reproductionAttempts
  return (
    <Section id="evo-stats" title="Statistics">
      <details className="evo-fold">
        <summary>Births, deaths and mating</summary>
        <dl className="evo-rows">
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
      </details>
    </Section>
  )
}

export function SpeciesPanel({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <Section id="evo-species" title="Species" aside={view.activeSpecies}>
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
                style={{ background: species.color, color: species.color }}
                aria-hidden="true"
              />
              <span className="evo-species-name">
                #{species.id}
                {species.ancestorId !== null && (
                  <small className="evo-hint"> from #{species.ancestorId}</small>
                )}
              </span>
              <span className="evo-species-count" title="living members">
                {formatCount(species.members)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
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
    <div className="evo-banner evo-glass" role="alert">
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
        <button type="button" className="evo-button" onClick={() => controls.reset()}>
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

/** Per-cluster populations and how well each species stays at home (the cluster layout only). */
export function ClusterPanel({ view }: { view: ViewState }): React.JSX.Element | null {
  const report = view.clusters
  if (report === null) return null
  return (
    <Section id="evo-clusters" title="Clusters">
      <dl className="evo-rows">
        {report.clusters.map((cluster) => (
          <div key={cluster.index}>
            <dt>Cluster {cluster.index + 1}</dt>
            <dd>
              {formatCount(cluster.alive)}
              {cluster.inVoid > 0 && <small className="evo-hint"> {cluster.inVoid} in void</small>}
              {cluster.alive === 0 && <small className="evo-hint"> empty</small>}
            </dd>
          </div>
        ))}
      </dl>
      <p className="evo-hint">
        Purity {Math.round(report.meanPurity * 100)}%: how much of each species still lives in its
        home cluster.
      </p>
    </Section>
  )
}
