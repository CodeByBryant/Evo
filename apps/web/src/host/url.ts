import { formatSettingValue, parseSettingValue, settingByPath } from '@evo/config'
import type { SettingValue } from '@evo/config'
import { MAX_SEED } from '@evo/contracts'

export interface UrlState {
  readonly seed?: number
  readonly preset?: string
  /** Settings changed from the preset, by dotted path (only ones the editor offers, in range). */
  readonly settings?: Readonly<Record<string, SettingValue>>
  /** How many parameters were not applied (not a setting, malformed, out of range or repeated). */
  readonly ignored?: number
}

/**
 * Reads `#seed=123&preset=lush&resources.seeds.energy=30`. Anything malformed is ignored, never thrown.
 * A parameter other than `seed` and `preset` is a setting only if its key is in the editor's table
 * (`@evo/config` `SETTINGS`) and its value fits that setting's range: a link cannot name any other
 * configuration. `settings` and `ignored` are present only when there is something to report.
 */
export function parseHash(hash: string): UrlState {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const out: {
    seed?: number
    preset?: string
    settings?: Record<string, SettingValue>
    ignored?: number
  } = {}
  const seed = params.get('seed')
  if (seed !== null && /^\d{1,10}$/.test(seed)) {
    const value = Number(seed)
    if (Number.isSafeInteger(value) && value <= MAX_SEED) out.seed = value
  }
  const preset = params.get('preset')
  if (preset !== null && /^[a-z][a-z0-9-]{0,40}$/.test(preset)) out.preset = preset
  const settings: Record<string, SettingValue> = {}
  let ignored = 0
  for (const [key, text] of params.entries()) {
    if (key === 'seed' || key === 'preset') continue
    const setting = settingByPath(key)
    const value = setting === undefined ? undefined : parseSettingValue(setting, text)
    if (value === undefined || key in settings) ignored++
    else settings[key] = value
  }
  if (Object.keys(settings).length > 0) out.settings = settings
  if (ignored > 0) out.ignored = ignored
  return out
}

/**
 * The hash that reproduces a world: `#seed=123&preset=lush`, then one parameter for each setting changed
 * from the preset, in path order (`&resources.seeds.energy=30`, switches as 1 and 0). A path the editor
 * does not offer is left out.
 */
export function formatHash(
  seed: number,
  preset: string,
  settings: Readonly<Record<string, SettingValue>> = {}
): string {
  const changed = Object.keys(settings)
    .filter((path) => settingByPath(path) !== undefined)
    .sort()
    .map((path) => `&${path}=${formatSettingValue(settings[path] as SettingValue)}`)
  return `#seed=${seed}&preset=${preset}${changed.join('')}`
}

/** A random seed in `[0, MAX_SEED]` from the given source of random 32-bit unsigned integers. */
export function randomSeedFrom(random32: () => number): number {
  return random32() % (MAX_SEED + 1)
}
