import type { HistoryPoint } from '@evo/contracts'
import { formatCount } from './format'

/** Scales values to an SVG polyline's `points` attribute inside a `width x height` box. */
export function polylinePoints(
  values: readonly number[],
  width: number,
  height: number,
  max: number,
  pad = 2
): string {
  if (values.length === 0) return ''
  const span = Math.max(1, values.length - 1)
  const top = Math.max(1, max)
  return values
    .map((value, index) => {
      const x = pad + (index / span) * (width - 2 * pad)
      const y = height - pad - (Math.min(value, top) / top) * (height - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

/**
 * One series of the run's history: a flat line over a flat tint, readable without hovering. `pick`
 * chooses the series, `label` names it for screen readers ("Population"). The `compact` form drops
 * the caption.
 */
export function HistoryChart({
  points,
  pick,
  label,
  floor = 10,
  width = 280,
  height = 72,
  compact = false
}: {
  points: readonly HistoryPoint[]
  pick: (point: HistoryPoint) => number
  label: string
  /** The smallest top of the scale, so a tiny count does not fill the chart. */
  floor?: number
  width?: number
  height?: number
  compact?: boolean
}): React.JSX.Element {
  const values = points.map(pick)
  const max = Math.max(floor, ...values)
  const latest = values[values.length - 1]
  const line = polylinePoints(values, width, height, max)
  const area = values.length === 0 ? '' : `${line} ${width - 2},${height} 2,${height}`
  return (
    <figure className={compact ? 'evo-chart evo-chart-compact' : 'evo-chart'}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          values.length === 0
            ? `${label} over time: no data yet`
            : `${label} over time: now ${latest}, highest ${Math.max(...values)}, lowest ${Math.min(...values)}`
        }
      >
        <line className="evo-chart-axis" x1="0" y1={height - 1} x2={width} y2={height - 1} />
        {area !== '' && <polygon className="evo-chart-area" points={area} />}
        <polyline className="evo-chart-line" fill="none" points={line} />
      </svg>
      {!compact && (
        <figcaption>
          <span>0</span>
          <span>peak {formatCount(max)}</span>
        </figcaption>
      )}
    </figure>
  )
}

/** The population over the run. */
export function PopulationChart(props: {
  points: readonly HistoryPoint[]
  width?: number
  height?: number
  compact?: boolean
}): React.JSX.Element {
  return <HistoryChart {...props} pick={(point) => point.count} label="Population" />
}

/** A tiny trend line with no axes, for rows in a list. */
export function Sparkline({
  values,
  color,
  width = 64,
  height = 18
}: {
  values: readonly number[]
  color: string
  width?: number
  height?: number
}): React.JSX.Element {
  const max = Math.max(1, ...values)
  return (
    <svg className="evo-sparkline" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={polylinePoints(values, width, height, max, 1)}
      />
    </svg>
  )
}
