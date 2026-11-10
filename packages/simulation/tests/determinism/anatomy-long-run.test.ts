import { describe, expect, it } from 'vitest'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/world/World'
import { PHASE3_ECONOMY } from '../support/phase3'
import { BUSY } from '../support/busy-bodies'

/**
 * Evolving bodies over a long run (ADR 0012); the replay of one world however it is sliced is in anatomy-replay.test.ts. Bodies are derived from genes that are hashed, and
 * development has no randomness, so replays must agree exactly however the run is sliced; and
 * a body that cannot change is the founder body, whose capability factors are exactly 1 (ADR 0015),
 * so anatomy on with a frozen body must not change a single dynamic against anatomy off.
 */
/** The part types of every living body, for a quick structural fingerprint of the population. */
const plans = (world: World): string[] =>
  world
    .snapshot()
    .organisms.map((o) => (world.anatomyOf(o.id)?.anatomy.parts ?? []).map((p) => p.type).join(','))

describe('anatomy long run', () => {
  it('bodies really evolve: many distinct body plans, all developing within budget', () => {
    const world = World.create({ seed: 22, config: BUSY })
    world.run(50_000)
    expect(world.isExtinct).toBe(false)
    const fingerprints = new Set(plans(world))
    expect(fingerprints.size).toBeGreaterThan(3)
    for (const o of world.snapshot().organisms) {
      const view = world.anatomyOf(o.id)
      expect(view?.anatomy.sizeUsed).toBeLessThanOrEqual(world.config.anatomy.structuralBudget)
      expect(view?.anatomy.parts.length).toBeLessThanOrEqual(12)
    }
  }, 300_000)

  it('anatomy on with a frozen body leaves the legacy dynamics alone: birth for birth', () => {
    // Anatomy is on by default (ADR 0015), so the baseline must switch it off explicitly.
    const off = World.create({
      seed: 23,
      config: { ...PHASE3_ECONOMY, genetics: BUSY.genetics ?? {}, anatomy: { enabled: false } }
    })
    const on = World.create({
      seed: 23,
      config: {
        ...BUSY,
        anatomy: {
          ...BUSY.anatomy,
          mutation: {
            ...BUSY.anatomy?.mutation,
            outlineRate: 0,
            presenceRate: 0,
            typeRate: 0,
            parentRate: 0,
            continuousRate: 0
          }
        }
      }
    })
    off.run(30_000)
    on.run(30_000)
    expect(on.snapshot().metrics).toEqual(off.snapshot().metrics)
    expect(on.snapshot().organisms.map((o) => [o.id, o.position, o.energy])).toEqual(
      off.snapshot().organisms.map((o) => [o.id, o.position, o.energy])
    )
    expect(on.stateHash()).not.toBe(off.stateHash()) // the bodies themselves differ
  }, 300_000)

  it('works under the reflex controller too', () => {
    const config: WorldConfigOverrides = { ...BUSY, learning: { controller: 'reflex' } }
    const a = World.create({ seed: 24, config })
    const b = World.create({ seed: 24, config })
    a.run(40_000)
    for (let i = 0; i < 8; i++) b.run(5_000)
    expect(b.stateHash()).toBe(a.stateHash())
  }, 300_000)
})
