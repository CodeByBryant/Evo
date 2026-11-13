import { resolveWorldConfig } from '@evo/config'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'
import type { WorldCreateOptions } from '../../src/world/World'

/**
 * The breeding and lifespan of the worlds that predate the life cycle (ADR 0027): one sex, an
 * instant birth, the nearest ready partner, a hard cutoff at `maxAge`, and the reproduction numbers
 * those worlds were tuned with. Tests that pin numbers measured before the life cycle spread this
 * into their config so they keep describing those worlds.
 */
export const BEFORE_LIFE: WorldConfigOverrides = {
  reproduction: {
    minEnergy: 75,
    cooldown: 45,
    searchRadius: 50,
    mateSenseRadius: 250,
    sexes: { enabled: false },
    eggs: { enabled: false },
    mateChoice: { enabled: false, choosiness: 0.3, preference: 0.3 }
  },
  ageing: { enabled: false }
}

/** `config` with the life cycle, mate choice and ageing switched off and the old breeding numbers, unless it says otherwise. */
export function beforeLife(config: WorldConfigOverrides = {}): WorldConfigOverrides {
  const before = BEFORE_LIFE.reproduction ?? {}
  const given = config.reproduction ?? {}
  return {
    ...config,
    reproduction: {
      ...before,
      ...given,
      sexes: { ...before.sexes, ...given.sexes },
      eggs: { ...before.eggs, ...given.eggs },
      mateChoice: { ...before.mateChoice, ...given.mateChoice }
    },
    ageing: { ...BEFORE_LIFE.ageing, ...config.ageing }
  }
}

/** `resolveWorldConfig` for a world that predates the life cycle. */
export const resolveBefore = (config?: WorldConfigOverrides) =>
  resolveWorldConfig(beforeLife(config))

/** `World.create` for a world that predates the life cycle. */
export const createBefore = (options: WorldCreateOptions): World =>
  World.create({ ...options, config: beforeLife(options.config) })
