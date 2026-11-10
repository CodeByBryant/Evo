import { useState } from 'react'
import type {
  InspectorPart,
  InspectorView,
  LabelledValue,
  SimulationControls
} from '@evo/contracts'
import {
  PART_TINT,
  arrowEnd,
  bareBody,
  formatStat,
  partRadius,
  partTree,
  sightLabel,
  smoothPath
} from './anatomyView'
import { barWidth, formatCount, formatNumber, humanize } from './format'

const TABS = ['Body', 'Genome', 'Brain', 'Lineage', 'Env'] as const
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

/** The state that changes while you watch: meters, life stage, position, cooldown. */
function Vitals({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const o = inspector.overview
  return (
    <div>
      <Meter label="Energy" value={o.energy} max={o.maxEnergy} tone="energy" />
      {o.gutCapacity > 0 && <Meter label="Gut" value={o.gut} max={o.gutCapacity} tone="gut" />}
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
      </dl>
    </div>
  )
}

/** One part in the table: a row, and under it (opened by its button) every stat with its unit. */
function PartRows({ part }: { part: InspectorPart }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const key = part.stats[0]
  return (
    <tbody className={part.functional ? '' : 'evo-dormant'}>
      <tr>
        <th scope="row">{part.slot}</th>
        <td>
          <button
            type="button"
            className="evo-part-toggle"
            aria-expanded={open}
            aria-controls={`evo-part-${part.slot}-stats`}
            onClick={() => setOpen(!open)}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span> {part.type}
          </button>
        </td>
        <td className="evo-muted" title={key?.label}>
          {key === undefined ? '' : formatStat(key.value, key.unit)}
        </td>
        <td className="evo-num">{formatNumber(part.mass, 3)}</td>
        <td className="evo-num evo-muted">{formatNumber(part.upkeep, 4)}</td>
      </tr>
      <tr hidden={!open} id={`evo-part-${part.slot}-stats`}>
        <td colSpan={PART_COLUMNS}>
          <table className="evo-table evo-stat-table" aria-label={`Part ${part.slot} stats`}>
            <tbody>
              {part.stats.map((stat) => (
                <tr key={stat.key}>
                  <th scope="row">{stat.label}</th>
                  <td className="evo-num">{formatStat(stat.value, stat.unit)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">integrity</th>
                <td className="evo-num">{formatNumber(part.integrity, 2)}</td>
              </tr>
              <tr>
                <th scope="row">size</th>
                <td className="evo-num">{formatNumber(part.size, 2)}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>
    </tbody>
  )
}

/** The part table's columns: slot, part, key stat, mass, upkeep. */
const PART_COLUMNS = 5

/** The body: a schematic, who hangs from whom, every part's stats, mass and upkeep, sight, and what it can do. */
export function AnatomyTab({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  const body = inspector.anatomy
  if (body === null) return <p className="evo-hint">No body for this organism.</p>
  const tree = partTree(body.parts)
  const bySlot = new Map(body.parts.map((part) => [part.slot, part]))
  const find = (label: string): number =>
    body.capabilities.find((row) => row.label === label)?.value ?? 0
  const total = { mass: find('mass'), upkeep: find('upkeep (energy/s)') }
  const bare = bareBody(body.parts, total)
  const eyes = body.parts.filter((part) => part.sight !== null)
  const against = body.capabilities.filter(
    (row) => row.label !== 'mass' && row.label !== 'upkeep (energy/s)'
  )
  return (
    <div>
      <figure className="evo-anatomy">
        <svg viewBox="-1.3 -1.3 2.6 2.6" role="img" aria-label="Body schematic, front to the right">
          <path d={smoothPath(body.outline)} className="evo-anatomy-body" />
          {body.parts.map((part) => {
            const end = arrowEnd(part, 0.3)
            const tint = PART_TINT[part.type] ?? '#ffffff'
            return (
              <g key={part.slot} opacity={part.functional ? 1 : 0.4}>
                <line
                  x1={part.x}
                  y1={part.y}
                  x2={end.x}
                  y2={end.y}
                  stroke={tint}
                  strokeWidth={0.03}
                />
                <circle
                  cx={part.x}
                  cy={part.y}
                  r={partRadius(part.size)}
                  fill={tint}
                  stroke={part.functional ? 'none' : '#ff6b6b'}
                  strokeWidth={0.03}
                  strokeDasharray={part.functional ? undefined : '0.05 0.05'}
                />
              </g>
            )
          })}
        </svg>
        <figcaption>
          {body.parts.length} parts, size {formatNumber(body.sizeUsed, 2)} of{' '}
          {formatNumber(body.budget, 1)}
          {body.undeveloped.length > 0 && ` (${body.undeveloped.length} did not develop)`}
        </figcaption>
      </figure>
      <h3>Parts and what they hang from</h3>
      <ul className="evo-tree" aria-label="Parent tree">
        <li className="evo-tree-body">Body</li>
        {tree.map((row) => (
          <li
            key={row.slot}
            className={row.functional ? '' : 'evo-dormant'}
            style={{ paddingLeft: `${row.depth * 14}px` }}
          >
            <span className="evo-num-inline">{row.slot}</span>{' '}
            <span
              className="evo-swatch"
              style={{ background: PART_TINT[row.type] ?? '#fff' }}
              aria-hidden="true"
            />{' '}
            {row.type}
            {!row.functional && <small className="evo-hint"> dormant</small>}
          </li>
        ))}
      </ul>
      <h3>Mass and upkeep</h3>
      <table className="evo-table evo-parts">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Part</th>
            <th scope="col">Key stat</th>
            <th scope="col" className="evo-num">
              Mass
            </th>
            <th scope="col" className="evo-num" title="energy per second">
              Upkeep /s
            </th>
          </tr>
        </thead>
        {tree.map((row) => {
          const part = bySlot.get(row.slot)
          return part === undefined ? null : <PartRows key={part.slot} part={part} />
        })}
        <tfoot>
          <tr>
            <th scope="row" colSpan={PART_COLUMNS - 2}>
              Bare body
            </th>
            <td className="evo-num">{formatNumber(bare.mass, 3)}</td>
            <td className="evo-num evo-muted">{formatNumber(bare.upkeep, 4)}</td>
          </tr>
          <tr>
            <th scope="row" colSpan={PART_COLUMNS - 2}>
              Total
            </th>
            <td className="evo-num">{formatNumber(total.mass, 3)}</td>
            <td className="evo-num">{formatNumber(total.upkeep, 4)}</td>
          </tr>
        </tfoot>
      </table>
      {eyes.length > 0 && (
        <>
          <h3>
            Sight <small className="evo-hint">field of view, reach</small>
          </h3>
          <dl className="evo-rows">
            {eyes.map((part) => (
              <div key={part.slot}>
                <dt>Eye {part.slot}</dt>
                <dd>{part.sight === null ? '' : sightLabel(part.sight)}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <h3>
        Against the founder <small className="evo-hint">1 is the founder</small>
      </h3>
      <Values rows={against} />
    </div>
  )
}

/** The Body tab: vitals first (they change as you watch), then the anatomy. */
function Body({ inspector }: { inspector: InspectorView }): React.JSX.Element {
  return (
    <div>
      <Vitals inspector={inspector} />
      <AnatomyTab inspector={inspector} />
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

/** What the inspector's place shows while nothing is selected: that, and how to select. */
export function InspectorEmpty(): React.JSX.Element {
  return (
    <aside className="evo-inspector evo-inspector-empty" aria-labelledby="evo-inspector-title">
      <header className="evo-inspector-head">
        <h2 id="evo-inspector-title">Nothing selected</h2>
      </header>
      <p className="evo-hint">
        Click an organism in the world to inspect its body, genes, brain and lineage. Esc deselects.
      </p>
    </aside>
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
  const [tab, setTab] = useState<Tab>('Body')
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
            aria-label={name === 'Env' ? 'Environment' : undefined}
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
        {tab === 'Body' && <Body inspector={inspector} />}
        {tab === 'Genome' && <Genome inspector={inspector} />}
        {tab === 'Brain' && <Brain inspector={inspector} />}
        {tab === 'Lineage' && <Lineage inspector={inspector} />}
        {tab === 'Env' && <Environment inspector={inspector} />}
      </div>
    </aside>
  )
}
