import type { SimulationControls, ViewState } from '@evo/contracts'
import { PopulationChart } from './Charts'
import { Section } from './Section'
import {
  barWidth,
  formatCount,
  formatNumber,
  formatTime,
  percent,
  statusLabel,
  totalDeaths
} from './format'

/**
 * The top bar: the brand, whether the world is running and where in time it is, which world it is
 * (seed and preset), and on the right whatever the app docks there (the playback toolbar).
 */
export function TopBar({
  view,
  children
}: {
  view: ViewState
  children?: React.ReactNode
}): React.JSX.Element {
  const preset = view.presets.find((entry) => entry.name === view.preset)?.label ?? view.preset
  return (
    <header className="evo-topbar">
      <strong className="evo-brand">Evo</strong>
      <dl className="evo-facts">
        <div className={`evo-status evo-status-${view.status}`}>
          <dt className="evo-sr">Status</dt>
          <dd>
            <i className={`evo-dot evo-dot-${view.status}`} aria-hidden="true" />
            {statusLabel(view.status)}
          </dd>
        </div>
        <div>
          <dt className="evo-sr">Time</dt>
          <dd>{formatTime(view.time)}</dd>
        </div>
        <div className="evo-fact-extra">
          <dt>Tick</dt>
          <dd>{formatCount(view.tick)}</dd>
        </div>
        {view.season !== null && (
          <div className="evo-fact-extra">
            <dt className="evo-sr">Season</dt>
            <dd className="evo-capitalize">{view.season}</dd>
          </div>
        )}
        <div className="evo-fact-extra">
          <dt>Seed</dt>
          <dd>{view.seed}</dd>
        </div>
        <div className="evo-fact-extra">
          <dt>Preset</dt>
          <dd>{preset}</dd>
        </div>
      </dl>
      {children !== undefined && <div className="evo-topbar-tools">{children}</div>}
    </header>
  )
}

/** The three numbers that matter, at the top of the left rail. */
export function Hud({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <Section id="evo-now" title="Now">
      <dl className="evo-rows">
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
    </Section>
  )
}

/** The running totals since the world began (deaths by cause are in the strip). */
export function StatsPanel({ view }: { view: ViewState }): React.JSX.Element {
  const { metrics } = view
  return (
    <Section id="evo-stats" title="Statistics" aside="since start">
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
          <dd>{percent(metrics.reproductionSuccesses, metrics.reproductionAttempts)}</dd>
        </div>
        <div>
          <dt>Food eaten</dt>
          <dd>{formatCount(metrics.resourcesConsumed)}</dd>
        </div>
      </dl>
    </Section>
  )
}

const DEATH_CAUSES = [
  { key: 'deathsByStarvation', label: 'Starved', tone: 'warn' },
  { key: 'deathsByAge', label: 'Old age', tone: 'age' },
  { key: 'deathsByDamage', label: 'Damage', tone: 'bad' }
] as const

/** Deaths by cause since the world began: a count and a flat bar (its share of all deaths) each. */
export function DeathCauses({ view }: { view: ViewState }): React.JSX.Element {
  const total = totalDeaths(view.metrics)
  return (
    <dl className="evo-causes">
      {DEATH_CAUSES.map((cause) => {
        const count = view.metrics[cause.key]
        return (
          <div key={cause.key}>
            <dt>{cause.label}</dt>
            <dd>
              {formatCount(count)}
              <small className="evo-hint"> {percent(count, total)}</small>
            </dd>
            <div className="evo-meter-track" aria-hidden="true">
              <div
                className={`evo-meter-fill evo-tone-${cause.tone}`}
                style={{ width: barWidth(count, total) }}
              />
            </div>
          </div>
        )
      })}
    </dl>
  )
}

/**
 * The strip under the world: what is worth watching while the world runs. Each panel is a titled
 * cell; the per-cluster table is there only in a cluster world.
 */
export function Strip({ view }: { view: ViewState }): React.JSX.Element {
  return (
    <section className="evo-strip" aria-label="Charts">
      <div className="evo-strip-panel">
        <h2 className="evo-section-title">
          <span>Population</span>
          <em>{formatCount(view.population)}</em>
        </h2>
        <PopulationChart points={view.populationHistory} />
      </div>
      <div className="evo-strip-panel">
        <h2 className="evo-section-title">
          <span>Deaths by cause</span>
          <em>{formatCount(totalDeaths(view.metrics))}</em>
        </h2>
        <DeathCauses view={view} />
      </div>
      {view.clusters !== null && (
        <div className="evo-strip-panel evo-strip-scroll">
          <ClusterPanel view={view} />
        </div>
      )}
    </section>
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
    <div className="evo-banner evo-surface" role="alert">
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
