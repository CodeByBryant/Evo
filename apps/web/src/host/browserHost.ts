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

/**
 * The host for the real page: seed, preset and changed settings from the address, layers and speed from
 * storage. The address is kept current (seed, preset and only the settings changed from the preset), and a
 * link pasted or edited into the address bar of an open page opens that world (`hashchange`).
 */
export function createBrowserHost(): SimulationHost {
  const fromUrl = parseHash(window.location.hash)
  const prefs = loadPrefs(safeLocalStorage())
  const host = new SimulationHost({
    env: browserEnvironment,
    ...(fromUrl.seed !== undefined ? { seed: fromUrl.seed } : {}),
    ...(fromUrl.preset !== undefined ? { preset: fromUrl.preset } : {}),
    ...(fromUrl.settings !== undefined ? { settings: fromUrl.settings } : {}),
    ...(fromUrl.ignored !== undefined ? { ignored: fromUrl.ignored } : {}),
    speed: prefs.speed,
    layers: prefs.layers,
    onWorldChange: (seed, preset, settings) => {
      try {
        window.history.replaceState(null, '', formatHash(seed, preset, settings))
      } catch {
        // An address bar we cannot write to is not a reason to stop.
      }
    }
  })
  try {
    window.addEventListener('hashchange', () => host.loadAddress(parseHash(window.location.hash)))
  } catch {
    // No window to listen on (a test or a worker): the address is read once, at the start.
  }
  return host
}
