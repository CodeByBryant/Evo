import type { ObstacleKind, PartType, RegionType, SpeciesId } from '@evo/contracts'

/** The hue step that spreads consecutive ids as far apart as possible (the golden angle). */
const GOLDEN_ANGLE = 137.50776405003785

/** Hue in degrees `[0, 360)` for a species; stable across runs, and `null` (no species) is a neutral hue. */
export function speciesHue(id: SpeciesId | null): number {
  if (id === null) return 210
  return (((id * GOLDEN_ANGLE + 195) % 360) + 360) % 360
}

/** `#rrggbb` for a hue, with saturation and lightness chosen to read on a dark background. */
export function hslToHex(hue: number, saturation = 0.78, lightness = 0.62): string {
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const h = (((hue % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((h % 2) - 1))
  const [r1, g1, b1] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x]
  const m = lightness - c / 2
  const channel = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(r1)}${channel(g1)}${channel(b1)}`
}

/** The colour of each part type's glyph (drawn only at high zoom). */
export const PART_COLORS: Readonly<Record<PartType, string>> = {
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
  eyestalk: '#b8c4d0',
  gyro: '#a4b9ff',
  lipid: '#f2e08a',
  pheromone: '#f5c542',
  skeleton: '#d7dde6',
  join: '#9aa6b5'
}

export function speciesColor(id: SpeciesId | null): string {
  return hslToHex(speciesHue(id))
}

/** `#rrggbb` to `0xrrggbb`. */
export function hexToNumber(hex: string): number {
  return Number.parseInt(hex.slice(1), 16)
}

/** Muted terrain colors, dark enough that organisms and food stand out. */
export const REGION_COLORS: Readonly<Record<RegionType, string>> = {
  meadow: '#1c3322',
  forest: '#142a1d',
  wetland: '#17303a',
  desert: '#3a3320',
  cave: '#25222c',
  volcanic: '#3a2420'
}

/**
 * Flat obstacle colours (ADR 0022): a fill, an edge and the fill's opacity. Rocks and trees are
 * solid; a pond and reeds are translucent, because you can see across water and a reed bed is cover
 * rather than a wall.
 */
export const OBSTACLE_COLORS: Readonly<
  Record<ObstacleKind, { readonly fill: string; readonly edge: string; readonly alpha: number }>
> = {
  boulder: { fill: '#55565c', edge: '#7a7b82', alpha: 1 },
  tree: { fill: '#2d6a45', edge: '#4f9468', alpha: 1 },
  ridge: { fill: '#6a5b4b', edge: '#907e68', alpha: 1 },
  pond: { fill: '#2a6a92', edge: '#5fa0c8', alpha: 0.7 },
  reeds: { fill: '#8da35a', edge: '#b4c97c', alpha: 0.45 }
}

/** Food colors by kind index, cycling if a configuration defines more kinds. */
export const RESOURCE_COLORS: readonly string[] = [
  '#9be15d',
  '#ff7a8a',
  '#c9a0ff',
  '#ffd166',
  // The fifth kind exists only with predation: a carcass (ADR 0023), a dull red.
  '#b5524a'
]

export function resourceColor(kind: number): string {
  return RESOURCE_COLORS[
    ((kind % RESOURCE_COLORS.length) + RESOURCE_COLORS.length) % RESOURCE_COLORS.length
  ] as string
}
