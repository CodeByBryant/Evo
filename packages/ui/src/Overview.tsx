import type { SimulationControls, ViewState } from '@evo/contracts'
import { HistoryChart, PopulationChart, Sparkline } from './Charts'
import { deathRates } from './history'
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
  { key: 'starved', total: 'deathsByStarvation', label: 'Starved', tone: 'warn' },
  { key: 'aged', total: 'deathsByAge', label: 'Old age', tone: 'age' },
  { key: 'damaged', total: 'deathsByDamage', label: 'Damage', tone: 'bad' },
  { key: 'predated', total: 'deathsByPredation', label: 'Predation', tone: 'predation' }
] as const

/** A rate per minute: one decimal under 10, none above, so a column of them lines up. */
const perMinute = (rate: number): string => `${formatNumber(rate, rate >= 10 ? 0 : 1)} /min`

/**
 * Deaths by cause as rates (per simulated minute over the last two minutes), each with its share of
 * those deaths as a flat bar and the count since the start in small text.
 */
export function DeathCauses({ view }: { view: ViewState }): React.JSX.Element {
  const rates = deathRates(view.history)
  return (
    <dl className="evo-causes">
      {/* Predation is shown only in a world where something has been killed by a bite (ADR 0023). */}
      {DEATH_CAUSES.filter(
        (cause) => cause.key !== 'predated' || view.metrics.deathsByPredation > 0
      ).map((cause) => (
        <div key={cause.key}>
          <dt>{cause.label}</dt>
          <dd>
            {perMinute(rates[cause.key])}
            <small className="evo-hint" title="since the start">
              {' '}
              {formatCount(view.metrics[cause.total])}
            </small>
          </dd>
          <div className="evo-meter-track" aria-hidden="true">
            <div
              className={`evo-meter-fill evo-tone-${cause.tone}`}
              style={{ width: barWidth(rates[cause.key], rates.total) }}
            />
          </div>
        </div>
      ))}
    </dl>
  )
}

const stripTitle = (id: string, title: string, value: React.ReactNode): React.JSX.Element => (
  <h2 id={id} className="evo-section-title">
    <span>{title}</span>
    <em>{value}</em>
  </h2>
)

/**
 * The strip under the world: what is worth watching while the world runs. Each panel is a titled
 * cell; the per-cluster table is there only in a cluster world.
 */
export function Strip({ view }: { view: ViewState }): React.JSX.Element {
  const rates = deathRates(view.history)
  return (
    <section className="evo-strip" aria-label="Charts">
      <div className="evo-strip-panel">
        {stripTitle('evo-strip-population', 'Population', formatCount(view.population))}
        <PopulationChart points={view.history} />
      </div>
      <div className="evo-strip-panel">
        {stripTitle('evo-strip-species', 'Species', view.activeSpecies)}
        <HistoryChart points={view.history} pick={(p) => p.species} label="Species" floor={3} />
      </div>
      <div className="evo-strip-panel">
        {stripTitle('evo-strip-food', 'Food', formatCount(view.resources))}
        <HistoryChart points={view.history} pick={(p) => p.food} label="Food" />
      </div>
      <div className="evo-strip-panel">
        {stripTitle('evo-strip-deaths', 'Deaths by cause', perMinute(rates.total))}
        <DeathCauses view={view} />
        <p className="evo-hint">
          {rates.total > 0
            ? `${percent(rates.starved, rates.total)} of the last ${formatTime(rates.seconds)} of deaths were starvation`
            : 'No deaths in the recent window.'}
        </p>
      </div>
      <div className="evo-strip-panel evo-strip-scroll">
        {stripTitle('evo-strip-evolution', 'Evolution', evolutionHeadline(view))}
        <EvolutionPanel view={view} />
      </div>
      {view.clusters !== null && (
        <div className="evo-strip-panel evo-strip-scroll">
          <ClusterPanel view={view} />
        </div>
      )}
    </section>
  )
}

/** The headline number of the Evolution panel: body plans that have taken hold (ADR 0024). */
function evolutionHeadline(view: ViewState): string {
  const last = view.evolution?.samples.at(-1)
  return last === undefined ? '' : `${last.persistentPlans} plans`
}

/**
 * Indicators of whether the world is still changing (ADR 0024): body plans that took hold, how
 * differently brains respond, how far brains are from the innate prior, and how fast the traits
 * move, each as a trend, and one plain sentence for the stasis indicator. They are indicators, not a
 * verdict: the sentence says what was measured, not what it means.
 */
export function EvolutionPanel({ view }: { view: ViewState }): React.JSX.Element {
  const series = view.evolution
  if (series === null) {
    return <p className="evo-hint">The evolution observatory is switched off for this world.</p>
  }
  const samples = series.samples
  const last = samples.at(-1)
  if (last === undefined) return <p className="evo-hint">No samples yet.</p>
  const rows = [
    {
      label: 'Plans that took hold',
      values: samples.map((s) => s.persistentPlans),
      now: String(last.persistentPlans)
    },
    {
      label: 'Response types',
      values: samples.map((s) => s.responseTypes),
      now: formatNumber(last.responseTypes, 1)
    },
    {
      label: 'Brain drift',
      values: samples.map((s) => s.priorDrift * 100),
      now: `${formatNumber(last.priorDrift * 100, 1)}%`
    },
    {
      label: 'Trait change',
      values: samples.map((s) => s.rate * 100),
      now: `${formatNumber(last.rate * 100, 2)}%`
    }
  ]
  return (
    <div className="evo-evolution">
      <ul className="evo-evolution-rows" aria-label="Evolution indicators">
        {rows.map((row) => (
          <li key={row.label}>
            <span>{row.label}</span>
            <Sparkline values={row.values} color="currentColor" width={72} />
            <strong>{row.now}</strong>
          </li>
        ))}
      </ul>
      <p className="evo-hint">
        {last.stasis
          ? `Nothing new has taken hold and no trait has moved for ${last.quietSamples} samples.`
          : last.newPlans > 0
            ? `${last.newPlans} new body ${last.newPlans === 1 ? 'plan' : 'plans'} since the last sample.`
            : 'Still changing.'}
      </p>
    </div>
  )
}

/**
 * The living species as a table: trend (members over time), members now, the species it came from
 * and how long ago it appeared. The selected organism's species is highlighted.
 */
export function SpeciesPanel({ view }: { view: ViewState }): React.JSX.Element {
  // Simulated seconds per tick, from the clock itself (the timestep is configuration).
  const secondsPerTick = view.tick > 0 ? view.time / view.tick : 0
  return (
    <Section id="evo-species" title="Species" aside={view.activeSpecies}>
      {view.species.length === 0 ? (
        <p className="evo-hint">No living species.</p>
      ) : (
        <div className="evo-species-scroll">
          <table className="evo-table evo-species">
            <thead>
              <tr>
                <th scope="col">Id</th>
                <th scope="col">Trend</th>
                <th scope="col" className="evo-num">
                  Now
                </th>
                <th scope="col" className="evo-num">
                  From
                </th>
                <th scope="col" className="evo-num evo-species-since">
                  Since
                </th>
              </tr>
            </thead>
            <tbody>
              {view.species.map((species) => (
                <tr
                  key={species.id}
                  className={view.selected?.speciesId === species.id ? 'evo-species-selected' : ''}
                >
                  <th scope="row">
                    <span
                      className="evo-swatch"
                      style={{ background: species.color }}
                      aria-hidden="true"
                    />{' '}
                    #{species.id}
                  </th>
                  <td>
                    <Sparkline values={species.history} color={species.color} width={48} />
                  </td>
                  <td className="evo-num" title="living members">
                    {formatCount(species.members)}
                  </td>
                  <td className="evo-num" title="the species it descends from">
                    {species.ancestorId === null ? '-' : `#${species.ancestorId}`}
                  </td>
                  <td className="evo-num evo-species-since" title="time since it appeared">
                    {formatTime(view.time - species.createdAtTick * secondsPerTick)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        Peak population came to {formatNumber(Math.max(0, ...view.history.map((p) => p.count)), 0)}.
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
