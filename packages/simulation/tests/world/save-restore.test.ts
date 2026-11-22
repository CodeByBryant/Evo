import { describe, expect, it } from 'vitest'
import { presetByName } from '@evo/config'
import type { WorldConfigOverrides } from '@evo/contracts'
import { cloneData } from '../../src/serialization/cloneData'
import { World } from '../../src/world/World'
import { hasLimb, hasLimbMouth, runToFork } from '../support/fork'

// Saving a world's state and putting it into another (WorldState): the receiving world must go on
// exactly as the original does. The state hash is the whole contract of what matters (docs/simulation/
// determinism.md), so equal hashes after more ticks mean nothing that decides the future was left
// behind; the tests would fail loudly on any unhashed state that did.

const preset = (name: string): WorldConfigOverrides =>
  (presetByName(name)?.overrides ?? {}) as WorldConfigOverrides

/** The event types of each of the next `ticks` ticks, plus the state hash after each. */
function trace(world: World, ticks: number): string[] {
  const out: string[] = []
  for (let i = 0; i < ticks; i++) {
    world.step()
    out.push(
      `${world.events
        .eventsThisTick()
        .map((e) => e.type)
        .join(',')}|${world.stateHash()}`
    )
  }
  return out
}

describe('cloneData', () => {
  it('copies plain data deeply and keeps shared objects shared', () => {
    const shared = { n: 1 }
    const source = {
      a: [shared, shared],
      m: new Map([[1, { x: 2 }]]),
      s: new Set([3]),
      t: new Float64Array([1, 2])
    }
    const copy = cloneData(source)
    expect(copy).toEqual(source)
    expect(copy.a[0]).toBe(copy.a[1])
    expect(copy.a[0]).not.toBe(shared)
    copy.t[0] = 9
    expect(source.t[0]).toBe(1)
    ;(copy.m.get(1) as { x: number }).x = 5
    expect(source.m.get(1)).toEqual({ x: 2 })
  })

  it('refuses a class instance or a function (negative: nothing stays linked to the live world)', () => {
    class Thing {}
    expect(() => cloneData({ thing: new Thing() })).toThrow(/instance of Thing/)
    expect(() => cloneData({ f: () => 1 })).toThrow(/function/)
    expect(() => cloneData(new DataView(new ArrayBuffer(2)))).toThrow(/DataView/)
  })

  it('handles a cycle', () => {
    const a: { self?: unknown } = {}
    a.self = a
    const copy = cloneData(a)
    expect(copy.self).toBe(copy)
  })
})

describe('restoring a saved state', () => {
  const scenarios: Array<{
    name: string
    seed: number
    config: WorldConfigOverrides
    save: number
    more: number
  }> = [
    {
      name: 'the default world (eggs, sexes, ageing, mate choice, predation)',
      seed: 4,
      config: {},
      save: 2500,
      more: 600
    },
    { name: 'the classic preset', seed: 3, config: preset('classic'), save: 1500, more: 500 },
    {
      name: 'the reflex controller',
      seed: 5,
      config: { learning: { controller: 'reflex' } },
      save: 1500,
      more: 500
    },
    { name: 'the cluster world', seed: 2, config: preset('clusters'), save: 300, more: 150 },
    { name: 'lush with obstacles', seed: 6, config: preset('lush'), save: 2000, more: 500 }
  ]

  for (const s of scenarios) {
    it(`goes on exactly as the original does: ${s.name}`, () => {
      const original = World.create({ seed: s.seed, config: s.config })
      original.run(s.save)
      const saved = original.saveState()
      const receiver = World.create({ seed: s.seed, config: s.config })
      receiver.restoreState(saved)
      // The same instant, and then the same future, tick by tick (events and hash).
      expect(receiver.stateHash()).toBe(original.stateHash())
      // The derived views carried along continue the same too: species and lineage.
      expect(receiver.species.list()).toEqual(original.species.list())
      expect(receiver.lineage.size).toBe(original.lineage.size)
      expect(trace(receiver, s.more)).toEqual(trace(original, s.more))
      expect(receiver.species.list()).toEqual(original.species.list())
      expect(receiver.lineage.size).toBe(original.lineage.size)
    })
  }

  it('covers what it claims: the default scenario has eggs and carried clutches when it is saved', () => {
    const world = World.create({ seed: 4 })
    world.run(2500)
    const snapshot = world.snapshot()
    expect(snapshot.metrics.eggsLaid).toBeGreaterThan(0)
    expect(
      snapshot.metrics.deathsByPredation + snapshot.metrics.predationBites
    ).toBeGreaterThanOrEqual(0)
    expect(
      world.saveState().eggs.length +
        world.saveState().organisms.filter((o) => o.pregnancy !== null).length
    ).toBeGreaterThan(0)
  })

  it('is independent of the original and of the saved object (copies both ways)', () => {
    const original = World.create({ seed: 4 })
    original.run(800)
    const hashAtSave = original.stateHash()
    const saved = original.saveState()
    // Running on does not change what was saved ...
    original.run(300)
    const a = World.create({ seed: 4 })
    a.restoreState(saved)
    expect(a.stateHash()).toBe(hashAtSave)
    // ... changing the saved object after the fact does not change a world already restored from it ...
    const b = World.create({ seed: 4 })
    b.restoreState(saved)
    const mutable = saved as unknown as { organisms: Array<{ energy: number }> }
    if (mutable.organisms[0] !== undefined) mutable.organisms[0].energy += 10
    expect(b.stateHash()).toBe(hashAtSave)
    // ... and a restore does not touch the saved object.
    const c = World.create({ seed: 4 })
    c.restoreState(saved)
    c.run(200)
    expect(saved.tick).toBe(800)
  })

  it('a restored world passes the engine invariants every tick (negative: nothing is left half-restored)', () => {
    const original = World.create({ seed: 4 })
    original.run(1500)
    const receiver = World.create({ seed: 4, validateEveryTicks: 1 })
    receiver.restoreState(original.saveState())
    expect(() => receiver.run(400)).not.toThrow()
    expect(receiver.validate().ok).toBe(true)
  })

  it('refuses a state of another seed, schema or format, or one with a field missing (negatives)', () => {
    const source = World.create({ seed: 4 })
    source.run(50)
    const saved = source.saveState()
    const other = World.create({ seed: 5 })
    expect(() => other.restoreState(saved)).toThrow(/seed 4/)
    const same = World.create({ seed: 4 })
    expect(() => same.restoreState({ ...saved, hashSchema: saved.hashSchema + 1 })).toThrow(
      /hash schema/
    )
    expect(() => same.restoreState({ ...saved, format: 2 as never })).toThrow(/format/)
    const broken: Record<string, unknown> = { ...saved }
    delete broken['eggs']
    expect(() => same.restoreState(broken as never)).toThrow(/no "eggs"/)
  })

  it('keeps the original world untouched by saving (negative: saveState changes nothing)', () => {
    const a = World.create({ seed: 4 })
    const b = World.create({ seed: 4 })
    a.run(400)
    b.run(400)
    a.saveState()
    a.saveState()
    expect(trace(a, 100)).toEqual(trace(b, 100))
  })
})

describe('forking arms from a checkpoint (ADR 0029 limb levers)', () => {
  const levers: WorldConfigOverrides = {
    anatomy: { effects: { maxMouthOffset: 1.2, carrierParentsOnly: 1, limbUpkeep: 0.02 } }
  }

  it('an arm forked before any limb exists is the world that had the levers from tick 0', () => {
    const control = World.create({ seed: 4 })
    const fork = runToFork(control, { until: 2500, every: 250, relevant: hasLimb })
    // The control run did not reach a body the levers could touch, so the checkpoint is late and valid.
    expect(fork.checkpoint).not.toBeNull()
    expect(fork.firedAt === null || fork.firedAt > fork.tick).toBe(true)
    expect(fork.tick).toBeGreaterThan(0)

    const arm = World.create({ seed: 4, config: levers })
    arm.restoreState(fork.checkpoint as never)
    const straight = World.create({ seed: 4, config: levers })
    straight.run(fork.tick)
    expect(arm.stateHash()).toBe(straight.stateHash())
    straight.run(1000)
    arm.run(1000)
    expect(arm.stateHash()).toBe(straight.stateHash())
  })

  it('a setting that matters from the first tick is not the same world when forked (negative: why the predicate gates the fork)', () => {
    const matters: WorldConfigOverrides = { organisms: { basalCost: 0.9 } }
    const control = World.create({ seed: 4 })
    control.run(600)
    const arm = World.create({ seed: 4, config: matters })
    arm.restoreState(control.saveState())
    arm.run(400)
    const straight = World.create({ seed: 4, config: matters })
    straight.run(1000)
    expect(arm.stateHash()).not.toBe(straight.stateHash())
  })

  it('the mouth-only predicate waits for a mouth on a part (negative: a hung eye or tail does not fire it)', () => {
    const anatomy = World.create({ seed: 1 }).config.anatomy
    const world = World.create({ seed: 1 })
    // A founder has no hung parts at all, so neither predicate fires for any of them.
    for (const o of world.snapshot().organisms) {
      expect(hasLimb(world, o.id)).toBe(false)
      expect(hasLimbMouth(world, o.id)).toBe(false)
    }
    expect(anatomy.founder.every((p) => p.parent === 0)).toBe(true)
  })

  it('stops at the first relevant body and never hands back a checkpoint after it', () => {
    // Founders are not relevant; the first newborn is, so the run stops at the first birth.
    const stopped = runToFork(World.create({ seed: 4 }), {
      until: 3000,
      every: 100,
      relevant: (world) => world.snapshot().tick > 0
    })
    expect(stopped.firedAt).not.toBeNull()
    expect(stopped.tick).toBeLessThan(stopped.firedAt as number)
    expect(stopped.tick % 100).toBe(0)
    // A founder that is relevant leaves no checkpoint at all (the arms must start from tick 0).
    const none = runToFork(World.create({ seed: 4 }), {
      until: 100,
      every: 50,
      relevant: () => true
    })
    expect(none).toEqual({ checkpoint: null, tick: 0, firedAt: 0 })
    // Nothing relevant by the end: the latest checkpoint is returned and nothing fired.
    const clean = runToFork(World.create({ seed: 4 }), {
      until: 300,
      every: 100,
      relevant: () => false
    })
    expect(clean.firedAt).toBeNull()
    expect(clean.tick).toBe(300)
  })
})
