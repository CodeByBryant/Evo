import { describe, expect, it } from 'vitest'
import { BODY_GENE_COUNT, slotGeneIndex } from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { World } from '../src/index'
import { founderBodyVector } from '../src/genetics/BodyGenes'
import { developAnatomy } from '../src/development/develop'
import { genomeToVector } from '../src/genetics/GenomeFactory'
import { SeededRandom } from '../src/random/SeededRandom'
import { deriveStreamWords } from '../src/random/streams'

/**
 * Body genes in a running world (docs/decisions/0012): inert with anatomy off, harmless to the
 * existing dynamics with it on (nothing reads a body yet), deterministic, and validated.
 */
const SEED = 7
const BUSY: WorldConfigOverrides = {
  anatomy: { mutation: { presenceRate: 0.3, typeRate: 0.3, continuousRate: 0.5, visualRate: 0.5 } },
  genetics: { mutationRateScale: 4 }
}
/** Paint genes mutate with anatomy on (they have no effect on the dynamics), so snapshots are compared without them. */
const unpainted = (key: string, value: unknown): unknown =>
  key === 'pattern' || key === 'accentHue' ? undefined : value
const on = (extra: WorldConfigOverrides = {}): WorldConfigOverrides => ({
  ...BUSY,
  ...extra,
  anatomy: { ...BUSY.anatomy, ...extra.anatomy, enabled: true }
})

interface Internals {
  organisms: { values(): Array<{ id: number; genome: { body: { genes: number[] } } }> }
  randomStreams: { get(name: string): SeededRandom }
}
const internals = (world: World): Internals => world as unknown as Internals

function bodies(world: World): number[][] {
  return internals(world)
    .organisms.values()
    .map((o) => [...o.genome.body.genes])
}

describe('anatomy off', () => {
  const world = World.create({ seed: SEED, config: BUSY })
  world.run(3000)

  it('leaves every body at the founder body and never touches the anatomy stream', () => {
    const founder = founderBodyVector(world.config.anatomy)
    const all = bodies(world)
    expect(all.length).toBeGreaterThan(0)
    for (const body of all) expect(body).toEqual(founder)
    const fresh = new SeededRandom(deriveStreamWords(SEED, 'anatomy'))
    expect(internals(world).randomStreams.get('anatomy').getState()).toEqual(fresh.getState())
    expect(world.snapshot().metrics.organismsBorn).toBeGreaterThan(20)
  })
})

describe('anatomy on', () => {
  // Parts do not act yet (PR 4), but the outline does (ADR 0013), so a body with a changing outline
  // is a different organism. With the outline frozen, every other body gene is invisible.
  const FROZEN_OUTLINE = { anatomy: { mutation: { outlineRate: 0 } } }

  it('does not change the existing dynamics while the outline stays the founder outline', () => {
    const off = World.create({ seed: SEED, config: BUSY })
    const live = World.create({ seed: SEED, config: on(FROZEN_OUTLINE) })
    for (let tick = 1; tick <= 3000; tick++) {
      off.step()
      live.step()
      if (tick % 500 === 0) {
        expect(JSON.stringify(live.snapshot(), unpainted)).toBe(
          JSON.stringify(off.snapshot(), unpainted)
        )
      }
    }
    expect(JSON.stringify(live.events.list())).toBe(JSON.stringify(off.events.list()))
    expect(JSON.stringify(live.historicalOrganisms())).toBe(
      JSON.stringify(off.historicalOrganisms())
    )
    const a = internals(off)
      .organisms.values()
      .map((o) => genomeToVector(o.genome as never))
    const b = internals(live)
      .organisms.values()
      .map((o) => genomeToVector(o.genome as never))
    expect(b).toEqual(a)
    // ... but the bodies themselves have diverged, so the full state hashes differ
    expect(live.stateHash()).not.toBe(off.stateHash())
  })

  it('lets an evolving outline change the dynamics: size, energy and drag follow the shape', () => {
    const off = World.create({ seed: SEED, config: BUSY })
    const live = World.create({ seed: SEED, config: on() })
    off.run(3000)
    live.run(3000)
    expect(JSON.stringify(live.snapshot().organisms)).not.toBe(
      JSON.stringify(off.snapshot().organisms)
    )
    const radii = new Set(live.snapshot().organisms.map((o) => o.radius))
    expect(radii.size).toBeGreaterThan(3)
  })

  it('evolves bodies, keeps every one valid, and stays deterministic', () => {
    const run = () => {
      const world = World.create({ seed: SEED, config: on(), validateEveryTicks: 500 })
      world.run(4000)
      return world
    }
    const world = run()
    const founder = founderBodyVector(world.config.anatomy)
    const all = bodies(world)
    expect(all.some((body) => body.some((gene, i) => gene !== founder[i]))).toBe(true)
    expect(new Set(all.map((body) => body.join(','))).size).toBeGreaterThan(3)
    for (const body of all) expect(body).toHaveLength(BODY_GENE_COUNT)
    expect(world.validate()).toEqual({ ok: true, errors: [] })
    expect(run().stateHash()).toBe(world.stateHash())
  })

  it('gives the same state whether stepped one tick at a time or run in chunks', () => {
    const stepped = World.create({ seed: 3, config: on() })
    for (let i = 0; i < 1500; i++) stepped.step()
    const chunked = World.create({ seed: 3, config: on() })
    chunked.run(400)
    chunked.run(1)
    chunked.run(1099)
    expect(chunked.stateHash()).toBe(stepped.stateHash())
  })

  it('keeps the body off when the mutation scale is zero, even with anatomy on', () => {
    const world = World.create({
      seed: SEED,
      config: on({ genetics: { mutationRateScale: 0 } })
    })
    world.run(3000)
    const founder = founderBodyVector(world.config.anatomy)
    for (const body of bodies(world)) expect(body).toEqual(founder)
  })
})

describe('invariants', () => {
  it('reject a corrupted body gene (negative test)', () => {
    const world = World.create({ seed: SEED })
    world.run(100)
    expect(world.validate().ok).toBe(true)
    const organism = internals(world).organisms.values()[0]
    if (!organism) throw new Error('expected a population')
    const genes = organism.genome.body.genes as unknown as number[]
    const original = (genes as number[]).slice()
    const frozen = Object.isFrozen(genes)
    expect(frozen).toBe(true)
    // genomes are frozen, so corrupt a copy and swap it in the way a bug would
    const corrupted = {
      ...organism.genome,
      body: { genes: original.map((g, i) => (i === slotGeneIndex(1, 'size') ? 9 : g)) }
    }
    ;(organism as { genome: unknown }).genome = corrupted
    const result = world.validate()
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('body.slot1.size')
  })
})

describe('World.anatomyOf', () => {
  it('is undefined for an organism that does not exist', () => {
    const world = World.create({ seed: SEED })
    expect(world.anatomyOf(987654321)).toBeUndefined()
  })

  it('gives every founder exactly the founder factors, matching its own genes', () => {
    const world = World.create({ seed: SEED })
    for (const o of world.snapshot().organisms) {
      const view = world.anatomyOf(o.id)
      const genome = world.genomeOf(o.id)
      if (!view || !genome) throw new Error('expected a view')
      expect(view.factors.speed).toBe(1)
      expect(view.factors.turn).toBe(1)
      expect(view.factors.senseRange).toBe(1)
      expect(view.factors.upkeepDelta).toBe(0)
      expect(view.anatomy).toEqual(developAnatomy(genome.body.genes, world.config.anatomy))
      expect(view.anatomy.parts).toHaveLength(7)
    }
  })

  it('shows evolved bodies that differ from the founder, all with finite capabilities', () => {
    const world = World.create({ seed: SEED, config: on() })
    world.run(4000)
    const views = world.snapshot().organisms.map((o) => world.anatomyOf(o.id))
    expect(views.length).toBeGreaterThan(0)
    let differing = 0
    for (const view of views) {
      if (!view) throw new Error('expected a view')
      for (const value of Object.values(view.factors).flat())
        expect(Number.isFinite(value)).toBe(true)
      if (
        view.factors.speed !== 1 ||
        view.factors.senseRange !== 1 ||
        view.anatomy.parts.length !== 7
      ) {
        differing++
      }
    }
    expect(differing).toBeGreaterThan(0)
  })

  it('is a read: it does not change the state hash', () => {
    const world = World.create({ seed: SEED, config: on() })
    world.run(500)
    const before = world.stateHash()
    for (const o of world.snapshot().organisms) world.anatomyOf(o.id)
    expect(world.stateHash()).toBe(before)
  })
})
