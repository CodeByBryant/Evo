import type { MetricsSnapshot, RunStatus, SpeedSetting } from '@evo/contracts'

/** Simulated seconds as `m:ss`, or `h:mm:ss` past an hour. */
export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** `12,345`; anything not finite is shown as a dash. */
export function formatCount(value: number): string {
  return Number.isFinite(value) ? Math.round(value).toLocaleString('en-US') : '-'
}

export function formatNumber(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits) : '-'
}

export function speedLabel(speed: SpeedSetting): string {
  return speed === 'max' ? 'Max' : `${speed}×`
}

export function statusLabel(status: RunStatus): string {
  return status === 'running' ? 'Running' : status === 'paused' ? 'Paused' : 'Extinct'
}

export function totalDeaths(metrics: MetricsSnapshot): number {
  return metrics.deathsByStarvation + metrics.deathsByAge + metrics.deathsByDamage
}

/** `count / total` as a percentage string, or a dash when there is nothing to divide. */
export function percent(count: number, total: number): string {
  return total > 0 ? `${Math.round((count / total) * 100)}%` : '-'
}

/** A value in `[0, max]` as a width percentage for a bar, clamped. */
export function barWidth(value: number, max: number): string {
  if (!(max > 0) || !Number.isFinite(value)) return '0%'
  return `${Math.min(100, Math.max(0, (value / max) * 100)).toFixed(1)}%`
}

/** Splits `camelCaseName` into `camel case name` for labels. */
export function humanize(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase()
}
