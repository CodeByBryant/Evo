import type { RegionType, SpeciesId } from '@evo/contracts'

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

/** Food colors by kind index, cycling if a configuration defines more kinds. */
export const RESOURCE_COLORS: readonly string[] = ['#9be15d', '#ff7a8a', '#c9a0ff', '#ffd166']

export function resourceColor(kind: number): string {
  return RESOURCE_COLORS[
    ((kind % RESOURCE_COLORS.length) + RESOURCE_COLORS.length) % RESOURCE_COLORS.length
  ] as string
}
