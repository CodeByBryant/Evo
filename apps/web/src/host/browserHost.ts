import { SimulationHost } from './SimulationHost'
import type { HostEnvironment } from './SimulationHost'
import { loadPrefs } from './prefs'
import type { KeyValueStore } from './prefs'
import { formatHash, parseHash, randomSeedFrom } from './url'

/** `localStorage` if it exists and is reachable; reading it can throw in some privacy modes. */
export function safeLocalStorage(): KeyValueStore | undefined {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

export const browserEnvironment: HostEnvironment = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(() => callback()),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  randomSeed: () => randomSeedFrom(() => crypto.getRandomValues(new Uint32Array(1))[0] as number)
}

/** The host for the real page: seed and preset from the address, layers and speed from storage. */
export function createBrowserHost(): SimulationHost {
  const fromUrl = parseHash(window.location.hash)
  const prefs = loadPrefs(safeLocalStorage())
  return new SimulationHost({
    env: browserEnvironment,
    ...(fromUrl.seed !== undefined ? { seed: fromUrl.seed } : {}),
    ...(fromUrl.preset !== undefined ? { preset: fromUrl.preset } : {}),
    speed: prefs.speed,
    layers: prefs.layers,
    onWorldChange: (seed, preset) => {
      try {
        window.history.replaceState(null, '', formatHash(seed, preset))
      } catch {
        // An address bar we cannot write to is not a reason to stop.
      }
    }
  })
}
