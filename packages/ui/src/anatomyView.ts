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
  mender: '#7dffb0'
}
