import { useState } from 'react'
import type { InspectorView, LabelledValue, SimulationControls } from '@evo/contracts'
import { barWidth, formatCount, formatNumber, humanize, percent } from './format'

const TABS = ['Overview', 'Genome', 'Brain', 'Lineage', 'Environment'] as const
type Tab = (typeof TABS)[number]

function Meter({
  label,
  value,
  max,
  tone
}: {
  label: string
  value: number
  max: number
  tone: string
}): React.JSX.Element {
  return (
    <div className="evo-meter">
      <div className="evo-meter-head">
        <span>{label}</span>
        <span>
          {formatNumber(value, 0)} / {formatNumber(max, 0)}
        </span>
      </div>
      <div
        className="evo-meter-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.round(max)}
        aria-valuenow={Math.round(value)}
      >
        <div
          className={`evo-meter-fill evo-tone-${tone}`}
          style={{ width: barWidth(value, max) }}
        />
      </div>
    </div>
  )
}

/** A table of labelled numbers, with a bar when the value is a bounded signal. */
function Values({
  rows,
  bounded = false
}: {
  rows: readonly LabelledValue[]
  bounded?: boolean
}): React.JSX.Element {
  return (
    <table className="evo-table">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{humanize(row.label)}</th>
            <td className="evo-num">{formatNumber(row.value, 3)}</td>
            {bounded && (
              <td aria-hidden="true">
                <span className="evo-signal">
                  <span
                    className={row.value < 0 ? 'evo-signal-neg' : 'evo-signal-pos'}
                    style={{ width: barWidth(Math.abs(row.value), 1) }}
                  />
                </span>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Overview({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const o = inspector.overview
  return (
    <div>
      <Meter label="Energy" value={o.energy} max={o.maxEnergy} tone="energy" />
      <Meter label="Health" value={o.health} max={o.maxHealth} tone="health" />
      <Meter label="Age" value={o.age} max={o.maxAge} tone="age" />
      <dl className="evo-stats evo-stats-compact">
        <div>
          <dt>Life stage</dt>
          <dd className="evo-capitalize">{o.lifeStage}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>
            {formatNumber(o.x, 0)}, {formatNumber(o.y, 0)}
          </dd>
        </div>
        <div>
          <dt>Mating cooldown</dt>
          <dd>{o.cooldown > 0 ? `${formatNumber(o.cooldown, 0)} s` : 'ready'}</dd>
        </div>
        <div>
          <dt>Age</dt>
          <dd>{percent(o.age, o.maxAge)} of lifespan</dd>
        </div>
      </dl>
    </div>
  )
}

function Genome({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const groups = [...new Set(inspector.genome.map((gene) => gene.group))]
  return (
    <div>
      {groups.map((group) => (
        <details key={group} open={group === 'physical'}>
          <summary className="evo-capitalize">{group}</summary>
          <Values
            rows={inspector.genome
              .filter((gene) => gene.group === group)
              .map((gene) => ({ label: gene.name, value: gene.value }))}
          />
        </details>
      ))}
    </div>
  )
}

function Brain({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const brain = inspector.brain
  if (brain === null) {
    return (
      <p className="evo-hint">This world uses the reflex controller: there is no brain to show.</p>
    )
  }
  return (
    <div>
      <h3>Chosen action</h3>
      <Values rows={brain.actions} bounded />
      <h3>Last reward ({formatNumber(brain.rewardTotal, 3)})</h3>
      <Values rows={brain.reward} />
      <p className="evo-hint">
        Value estimate {formatNumber(brain.value, 3)}. Learned {formatCount(brain.updates)} times,
        total weight change {formatNumber(brain.weightChange, 2)}.
      </p>
      <details>
        <summary>What it senses ({brain.inputs.length} inputs)</summary>
        <Values rows={brain.inputs} bounded />
      </details>
    </div>
  )
}

function Lineage({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const l = inspector.lineage
  return (
    <dl className="evo-stats evo-stats-compact">
      <div>
        <dt>Parents</dt>
        <dd>
          {l.parentIds.length === 0 ? 'founder' : l.parentIds.map((id) => `#${id}`).join(', ')}
        </dd>
      </div>
      <div>
        <dt>Genome</dt>
        <dd>#{l.genomeId}</dd>
      </div>
      <div>
        <dt>Ancestor genomes</dt>
        <dd>{formatCount(l.ancestorGenomes)}</dd>
      </div>
      <div>
        <dt>Descendant genomes</dt>
        <dd>{formatCount(l.descendantGenomes)}</dd>
      </div>
      <div>
        <dt>Species line</dt>
        <dd>
          {inspector.speciesId === null
            ? '-'
            : [inspector.speciesId, ...l.speciesAncestry].map((id) => `#${id}`).join(' ← ')}
        </dd>
      </div>
    </dl>
  )
}

function Environment({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const e = inspector.environment
  const m = e.migration
  return (
    <dl className="evo-stats evo-stats-compact">
      <div>
        <dt>Region</dt>
        <dd className="evo-capitalize">{e.regionType ?? 'none'}</dd>
      </div>
      <div>
        <dt>Season</dt>
        <dd className="evo-capitalize">{e.season ?? 'none'}</dd>
      </div>
      {m !== null && (
        <>
          <div>
            <dt>Born in</dt>
            <dd className="evo-capitalize">{m.homeType}</dd>
          </div>
          <div>
            <dt>Region crossings</dt>
            <dd>{formatCount(m.crossings)}</dd>
          </div>
          <div>
            <dt>Distance away from home</dt>
            <dd>{formatNumber(m.distanceOutsideHome, 0)}</dd>
          </div>
          <div>
            <dt>Migrated</dt>
            <dd>{m.migrated ? 'yes' : 'no'}</dd>
          </div>
        </>
      )}
    </dl>
  )
}

/** The selected organism, in tabs (roadmap 7.7). Renders nothing until something is selected. */
export function Inspector({
  inspector,
  controls
}: {
  inspector: InspectorView | null
  controls: SimulationControls
}): React.JSX.Element | null {
  const [tab, setTab] = useState<Tab>('Overview')
  if (inspector === null) return null
  return (
    <aside className="evo-inspector" aria-labelledby="evo-inspector-title">
      <header className="evo-inspector-head">
        <span
          className="evo-swatch"
          style={{ background: inspector.speciesColor }}
          aria-hidden="true"
        />
        <h2 id="evo-inspector-title">
          Organism #{inspector.id}
          {inspector.speciesId !== null && (
            <small className="evo-hint"> species #{inspector.speciesId}</small>
          )}
        </h2>
        <button
          type="button"
          className="evo-button evo-icon"
          onClick={() => controls.select(null)}
          aria-label="Close inspector"
          aria-keyshortcuts="Escape"
        >
          {'×'}
        </button>
      </header>
      <div className="evo-tabs" role="tablist" aria-label="Inspector sections">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`evo-tab-${name}`}
            aria-selected={tab === name}
            aria-controls="evo-tab-panel"
            className="evo-tab"
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        id="evo-tab-panel"
        role="tabpanel"
        aria-labelledby={`evo-tab-${tab}`}
        className="evo-tab-panel"
      >
        {tab === 'Overview' && <Overview inspector={inspector} />}
        {tab === 'Genome' && <Genome inspector={inspector} />}
        {tab === 'Brain' && <Brain inspector={inspector} />}
        {tab === 'Lineage' && <Lineage inspector={inspector} />}
        {tab === 'Environment' && <Environment inspector={inspector} />}
      </div>
    </aside>
  )
}
