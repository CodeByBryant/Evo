import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { MateBuffer } from '../src/buffers/types'
import { OrganismStore } from '../src/entities/OrganismStore'
import type { OrganismState } from '../src/entities/OrganismStore'
import type { ResourceState } from '../src/entities/ResourceStore'
import { buildObservation } from '../src/learning/ObservationBuilder'
import { brainLayoutOf } from '../src/learning/BrainLayout'
import { forwardHidden, readOutput } from '../src/learning/Brain'
import { innatePriorWeights } from '../src/learning/InnatePrior'
import { architectureOf } from '../src/genetics/GenomeFactory'
import { ReproductionReadiness } from '../src/organisms/reproductionReadiness'
import { SpatialHash } from '../src/spatial/SpatialHash'
import { PerceptionSystem } from '../src/systems/PerceptionSystem'
import { World } from '../src/index'
import { withoutEcology } from './support/ecology'
import { organismFor } from './support/organism'

/**
 * Mate seeking (ADR 0010): a ready organism senses the nearest other ready organism within
 * `reproduction.mateSenseRadius`, and only then. Sensing and mating share one definition of
 * "ready" (`ReproductionReadiness`).
 */
const config: WorldConfig = resolveWorldConfig(
  withoutEcology({ learning: { controller: 'brain' } })
)

function ready(
  id: number,
  x: number,
  y: number,
  extra: Partial<OrganismState> = {}
): OrganismState {
  // Adult (age well past maturity), off cooldown, energy above the founder's reproduction threshold.
  return organismFor(config, id, { x, y, age: 300, energy: 95, ...extra })
}

function sense(
  organisms: OrganismState[],
  options: { radius?: number; compatible?: (a: OrganismState, b: OrganismState) => boolean } = {}
): MateBuffer {
  const store = new OrganismStore()
  for (const o of organisms) store.add(o)
  const index = new SpatialHash<OrganismState>(60, (o) => o)
  index.rebuild(store.values())
  const resources = new SpatialHash<ResourceState>(60, (r) => r)
  resources.rebuild([])
  const buffer: MateBuffer = new Map()
  new PerceptionSystem(store, resources, new Map(), undefined, null, undefined, {
    organismIndex: index,
    buffer,
    radius: options.radius ?? config.reproduction.mateSenseRadius,
    readiness: new ReproductionReadiness(config, null),
    compatible: options.compatible ?? (() => true)
  }).update(0)
  return buffer
}

describe('sensing an eligible partner', () => {
  it('sees a ready partner far beyond the sensor radius, from both sides', () => {
    const a = ready(1, 100, 100)
    const b = ready(2, 300, 100) // 200 away; the sensor radius is far smaller
    expect(b.x - a.x).toBeGreaterThan(a.genome.sensory.sensorRadius * 2)
    const mates = sense([a, b])
    expect(mates.get(1)).toMatchObject({ organismId: 2, distanceSquared: 200 * 200 })
    expect(mates.get(2)).toMatchObject({ organismId: 1 })
  })

  it('reports the nearest ready partner and skips closer ones that are not ready', () => {
    const a = ready(1, 100, 100)
    const hungry = ready(2, 120, 100, { energy: 5 })
    const juvenile = ready(3, 125, 100, { age: 1 })
    const resting = ready(4, 130, 100, { reproductionCooldownRemaining: 10 })
    const far = ready(5, 260, 100)
    const near = ready(6, 200, 100)
    const mates = sense([a, hungry, juvenile, resting, far, near])
    expect(mates.get(1)).toMatchObject({ organismId: 6 })
  })

  it('gives nothing to an organism that is not itself ready, even with a ready partner next to it', () => {
    const hungry = ready(1, 100, 100, { energy: 5 })
    const other = ready(2, 110, 100)
    const mates = sense([hungry, other])
    expect(mates.get(1)).toBeNull()
    // the ready one has nobody ready to find
    expect(mates.get(2)).toBeNull()
  })

  it('does not see a partner outside mateSenseRadius', () => {
    const a = ready(1, 0, 0)
    const b = ready(2, 400, 0)
    expect(sense([a, b], { radius: 300 }).get(1)).toBeNull()
    expect(sense([a, b], { radius: 401 }).get(1)).toMatchObject({ organismId: 2 })
  })

  it('respects the compatibility rule (reproductive isolation)', () => {
    const a = ready(1, 100, 100)
    const other = ready(2, 150, 100)
    const kin = ready(3, 250, 100)
    const mates = sense([a, other, kin], { compatible: (x, y) => x.id % 2 === y.id % 2 })
    expect(mates.get(1)).toMatchObject({ organismId: 3 })
  })

  it('is not computed when mate sensing is not given (reflex controller)', () => {
    const store = new OrganismStore()
    store.add(ready(1, 100, 100))
    const resources = new SpatialHash<ResourceState>(60, (r) => r)
    resources.rebuild([])
    expect(() => new PerceptionSystem(store, resources, new Map()).update(0)).not.toThrow()
  })
})

describe('the innate prior and mates', () => {
  const architecture = architectureOf(config.genetics.brain)
  const layout = brainLayoutOf(architecture)
  const weights = innatePriorWeights(architecture)
  const learned = weights.slice(layout.learnOffset)
  const base = {
    energy: 0.9,
    age: 0.3,
    x: 250,
    y: 250,
    vx: 0,
    vy: 0,
    heading: 0,
    maxSpeed: 20,
    sensorRadius: 60,
    worldWidth: 500,
    worldHeight: 500,
    food: null,
    peer: null,
    timeSinceFood: 0,
    previousReward: 0,
    previousAction: [0, 0, 0, 0, 0]
  }
  const act = (extra: Partial<Parameters<typeof buildObservation>[0]>): number[] => {
    const { hidden } = forwardHidden(
      layout,
      weights,
      buildObservation({ ...base, ...extra }),
      [0, 0, 0, 0]
    )
    return readOutput(layout, learned, hidden)
  }

  it('turns toward a partner on either side and speeds up', () => {
    const idle = act({})
    const left = act({ mate: { dx: 100, dy: 100, distanceSquared: 20000 } })
    const right = act({ mate: { dx: 100, dy: -100, distanceSquared: 20000 } })
    expect(left[1]).toBeGreaterThan(0.5)
    expect(right[1]).toBeLessThan(-0.5)
    expect(left[0]).toBeGreaterThan((idle[0] as number) + 0.2)
    expect(Math.abs(idle[1] as number)).toBeLessThan(0.05)
  })

  it('still turns toward food on the right when a partner is on the left', () => {
    const out = act({
      food: { dx: 0, dy: -20, distanceSquared: 400 },
      mate: { dx: 0, dy: 100, distanceSquared: 10000 }
    })
    expect(out[1]).toBeLessThan(-0.3)
  })
})

describe('mating behavior in a world', () => {
  const run = (controller: 'brain' | 'reflex', mateSenseRadius: number, seed: number): World => {
    const overrides: WorldConfigOverrides = {
      learning: { controller },
      reproduction: { mateSenseRadius }
    }
    const world = World.create({ seed, config: overrides })
    world.run(12_000)
    return world
  }

  it('a long-range mating signal produces more births than almost none, under the brain', () => {
    let withSignal = 0
    let withoutSignal = 0
    for (const seed of [1, 2]) {
      withSignal += run('brain', 250, seed).snapshot().metrics.organismsBorn
      withoutSignal += run('brain', 1, seed).snapshot().metrics.organismsBorn
    }
    expect(withSignal).toBeGreaterThan(withoutSignal * 1.1)
  }, 300_000)

  it('does nothing under the reflex controller, which never senses mates', () => {
    expect(run('reflex', 250, 3).stateHash()).toBe(run('reflex', 1, 3).stateHash())
  }, 120_000)
})
