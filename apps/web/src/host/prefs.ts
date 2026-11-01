import { DEFAULT_RENDER_LAYERS, RENDER_LAYERS } from '@evo/contracts'
import type { RenderLayers, SpeedSetting } from '@evo/contracts'

const KEY = 'evo.prefs.v1'

export interface Prefs {
  readonly layers: RenderLayers
  readonly speed: SpeedSetting
}

export const DEFAULT_PREFS: Prefs = { layers: DEFAULT_RENDER_LAYERS, speed: 5 }

/** The slice of `Storage` used here, so tests need no browser. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const SPEEDS: readonly SpeedSetting[] = [1, 5, 25, 100, 'max']

/** Per-viewer conveniences only; every read and write is guarded because storage can be missing or blocked. */
export function loadPrefs(store: KeyValueStore | undefined): Prefs {
  try {
    const raw = store?.getItem(KEY)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as { layers?: Record<string, unknown>; speed?: unknown }
    const layers = { ...DEFAULT_RENDER_LAYERS } as Record<string, boolean>
    for (const name of RENDER_LAYERS) {
      const value = parsed.layers?.[name]
      if (typeof value === 'boolean') layers[name] = value
    }
    const speed = SPEEDS.find((s) => s === parsed.speed) ?? DEFAULT_PREFS.speed
    return { layers: layers as RenderLayers, speed }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(store: KeyValueStore | undefined, prefs: Prefs): void {
  try {
    store?.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // Private windows and blocked storage are fine: the page works without remembering.
  }
}
