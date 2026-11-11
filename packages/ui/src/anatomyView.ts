/**
 * Pure geometry for the anatomy tab's schematic (no React, so every rule is unit-tested). Points
 * and parts are in body-radius units with the front along +x; the SVG has y pointing down, so the
 * creature's left is drawn up, which is what you see when it faces right.
 */

/** The outline as a smooth closed SVG path through its points (Catmull-Rom segments turned into Beziers). */
export function smoothPath(points: readonly number[], scale = 1): string {
  const n = Math.floor(points.length / 2)
  if (n < 3) return ''
  const at = (i: number, axis: 0 | 1): number =>
    (points[(((i % n) + n) % n) * 2 + axis] as number) * scale
  const f = (v: number): string => (Math.round(v * 1000) / 1000).toString()
  let d = `M ${f(at(0, 0))} ${f(at(0, 1))}`
  for (let i = 0; i < n; i++) {
    d +=
      ` C ${f(at(i, 0) + (at(i + 1, 0) - at(i - 1, 0)) / 6)} ${f(at(i, 1) + (at(i + 1, 1) - at(i - 1, 1)) / 6)}` +
      ` ${f(at(i + 1, 0) - (at(i + 2, 0) - at(i, 0)) / 6)} ${f(at(i + 1, 1) - (at(i + 2, 1) - at(i, 1)) / 6)}` +
      ` ${f(at(i + 1, 0))} ${f(at(i + 1, 1))}`
  }
  return `${d} Z`
}

/** The glyph radius of a part, from its `size` (0.1-1), in body-radius units. */
export function partRadius(size: number): number {
  return 0.2 * Math.sqrt(Math.max(0, size))
}

/** The end of a part's direction arrow, `length` body-radius units from its centre. */
export function arrowEnd(
  part: { readonly x: number; readonly y: number; readonly orientation: number },
  length: number
): { x: number; y: number } {
  return {
    x: part.x + Math.cos(part.orientation) * length,
    y: part.y + Math.sin(part.orientation) * length
  }
}

/** The colour of each part type in the schematic (the same hues as the glyphs drawn in the world). */
export const PART_TINT: Readonly<Record<string, string>> = {
  flagellum: '#ffb347',
  cilia: '#ffd98a',
  eye: '#ffffff',
  sniffer: '#c792ea',
  mouth: '#ff6b6b',
  intestine: '#e58a6e',
  stomach: '#f0a8a8',
  armor: '#9fb3c8',
  membrane: '#7dd3fc',
  mender: '#7dffb0',
  eyestalk: '#f5f5f5',
  gyro: '#80d8ff',
  lipid: '#ffe082',
  pheromone: '#f48fb1',
  skeleton: '#bcaaa4',
  join: '#b0bec5'
}

/** One line of the parent tree: a part and how deep it hangs below the body. */
export interface TreeRow {
  readonly slot: number
  readonly type: string
  /** 1 for a part on the body, 2 for its child, and so on (the body itself is depth 0, not a row). */
  readonly depth: number
  readonly functional: boolean
}

/**
 * The parts as a tree in reading order (each part directly under its parent, children by slot).
 * A part whose parent is not an earlier, existing slot hangs from the body, which is also where
 * development puts it, so the tree always shows every part exactly once.
 */
export function partTree(
  parts: readonly {
    readonly slot: number
    readonly parent: number
    readonly type: string
    readonly functional: boolean
  }[]
): TreeRow[] {
  const known = new Set(parts.map((part) => part.slot))
  const parentOf = (part: { slot: number; parent: number }): number =>
    part.parent >= 0 && part.parent < part.slot && known.has(part.parent) ? part.parent : -1
  const children = new Map<number, (typeof parts)[number][]>()
  for (const part of parts) {
    const key = parentOf(part)
    const list = children.get(key)
    if (list === undefined) children.set(key, [part])
    else list.push(part)
  }
  const rows: TreeRow[] = []
  const walk = (key: number, depth: number): void => {
    for (const part of (children.get(key) ?? []).sort((a, b) => a.slot - b.slot)) {
      rows.push({ slot: part.slot, type: part.type, depth, functional: part.functional })
      walk(part.slot, depth + 1)
    }
  }
  walk(-1, 1)
  return rows
}

/** A stat in real units with its unit: three significant-ish digits, fewer as the number grows. */
export function formatStat(value: number, unit: string): string {
  if (!Number.isFinite(value)) return '-'
  const magnitude = Math.abs(value)
  const digits = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2
  const number = value.toFixed(digits)
  return unit === '' ? number : `${number} ${unit}`
}

/** What an eye sees as text: "all round, reach 60" or "56°, reach 109" (the half-angle doubled is the field of view). */
export function sightLabel(sight: { readonly half: number; readonly reach: number }): string {
  const reach = Math.round(sight.reach)
  return sight.half >= Math.PI - 1e-6
    ? `all round, reach ${reach}`
    : `${Math.round(((2 * sight.half) / Math.PI) * 180)}°, reach ${reach}`
}

/** Mass and upkeep of the bare body: the whole body's totals minus what the parts add (never negative). */
export function bareBody(
  parts: readonly { readonly mass: number; readonly upkeep: number }[],
  total: { readonly mass: number; readonly upkeep: number }
): { mass: number; upkeep: number } {
  const mass = parts.reduce((sum, part) => sum + part.mass, 0)
  const upkeep = parts.reduce((sum, part) => sum + part.upkeep, 0)
  return { mass: Math.max(0, total.mass - mass), upkeep: Math.max(0, total.upkeep - upkeep) }
}
