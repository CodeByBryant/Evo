import { useId } from 'react'
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

/**
 * The population over the run: a line with a soft glow under it, readable without hovering. The
 * `compact` form drops the caption, for the heads-up display.
 */
export function PopulationChart({
  points,
  width = 280,
  height = 72,
  compact = false
}: {
  points: readonly PopulationPoint[]
  width?: number
  height?: number
  compact?: boolean
}): React.JSX.Element {
  const gradientId = useId()
  const counts = points.map((p) => p.count)
  const max = Math.max(10, ...counts)
  const latest = counts[counts.length - 1]
  const line = polylinePoints(counts, width, height, max)
  const area = counts.length === 0 ? '' : `${line} ${width - 2},${height} 2,${height}`
  return (
    <figure className={compact ? 'evo-chart evo-chart-compact' : 'evo-chart'}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          counts.length === 0
            ? 'Population over time: no data yet'
            : `Population over time: now ${latest}, highest ${Math.max(...counts)}, lowest ${Math.min(...counts)}`
        }
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--evo-cyan)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--evo-violet)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="evo-chart-axis" x1="0" y1={height - 1} x2={width} y2={height - 1} />
        {area !== '' && <polygon fill={`url(#${gradientId})`} points={area} />}
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
