import type { PopulationPoint } from '@evo/contracts'
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

/** The population over the run. A single polyline with its range, readable without hovering. */
export function PopulationChart({
  points,
  width = 280,
  height = 72
}: {
  points: readonly PopulationPoint[]
  width?: number
  height?: number
}): React.JSX.Element {
  const counts = points.map((p) => p.count)
  const max = Math.max(10, ...counts)
  const latest = counts[counts.length - 1]
  return (
    <figure className="evo-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          counts.length === 0
            ? 'Population over time: no data yet'
            : `Population over time: now ${latest}, highest ${Math.max(...counts)}, lowest ${Math.min(...counts)}`
        }
      >
        <line className="evo-chart-axis" x1="0" y1={height - 2} x2={width} y2={height - 2} />
        <polyline
          className="evo-chart-line"
          fill="none"
          points={polylinePoints(counts, width, height, max)}
        />
      </svg>
      <figcaption>
        <span>0</span>
        <span>peak {formatCount(max)}</span>
      </figcaption>
    </figure>
  )
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
