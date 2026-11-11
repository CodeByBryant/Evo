import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { StartingBody, WorldConfigOverrides } from '@evo/contracts'
import { BODY_GENE_COUNT, slotGeneIndex } from '@evo/contracts'
import { RandomStreams } from '../../src/random/streams'
import { World } from '../../src/world/World'
import { bodyVectorOf, chooseStartingBody, founderBodyVector } from '../../src/genetics/BodyGenes'

// Starting bodies (ADR 0020): the founder plan stays the reference, a world may start with a named
// archetype drawn from its seed, and every founder of the world gets it.

const base = resolveWorldConfig({}).anatomy

/** A starter that differs from the founder in one stat, so each is distinguishable by its genes. */
function starter(name: string, mouthForm: number): StartingBody {
  return {
    name,
    description: `${name} test body`,
    parts: base.founder.map((part) =>
      part.type === 'mouth' ? { ...part, stats: [0.5, 0.5, mouthForm, 0.5, 0.5, 0.5] } : { ...part }
    ),
    look: { ...base.founderLook },
    outline: { ...base.founderOutline }
  }
}

const STARTERS = [starter('a', 0.1), starter('b', 0.3), starter('c', 0.7), starter('d', 0.9)]

const withStarters = (
  startingBody: WorldConfigOverrides extends { anatomy?: infer A }
    ? A extends { startingBody?: infer S }
      ? S
      : never
    : never
): WorldConfigOverrides => ({ anatomy: { starters: STARTERS, startingBody } })

const draw = (seed: number): ReturnType<typeof chooseStartingBody> =>
  chooseStartingBody(
    resolveWorldConfig(withStarters({ mode: 'archetypes' })).anatomy,
    new RandomStreams(seed).get('genetics')
  )

describe('chooseStartingBody', () => {
  it('reference mode is the founder plan, with no name and no draw', () => {
    const anatomy = resolveWorldConfig({ anatomy: { starters: STARTERS } }).anatomy
    expect(anatomy.startingBody.mode).toBe('reference')
    const streams = new RandomStreams(7)
    const random = streams.get('genetics')
    const before = random.getState()
    const choice = chooseStartingBody(anatomy, random)
    expect(choice.name).toBeNull()
    expect(choice.body).toEqual(founderBodyVector(anatomy))
    expect(random.getState()).toEqual(before)
  })

  it('archetypes mode takes exactly one draw, and picks the same one for the same seed', () => {
    const anatomy = resolveWorldConfig(withStarters({ mode: 'archetypes' })).anatomy
    const random = new RandomStreams(11).get('genetics')
    const twin = new RandomStreams(11).get('genetics')
    chooseStartingBody(anatomy, random)
    twin.float()
    expect(random.getState()).toEqual(twin.getState())
    expect(draw(11).name).toBe(draw(11).name)
    expect(draw(11).body).toEqual(draw(11).body)
  })

  it('forcing an archetype uses that body and still takes the one draw', () => {
    const anatomy = resolveWorldConfig(withStarters({ mode: 'archetypes', archetype: 'c' })).anatomy
    const random = new RandomStreams(3).get('genetics')
    const twin = new RandomStreams(3).get('genetics')
    const choice = chooseStartingBody(anatomy, random)
    twin.float()
    expect(random.getState()).toEqual(twin.getState())
    expect(choice.name).toBe('c')
    expect(choice.body).toEqual(bodyVectorOf(STARTERS[2]!))
    // negative: the drawn one differs from the forced one for at least one seed
    expect(Array.from({ length: 40 }, (_, seed) => draw(seed).name).some((n) => n !== 'c')).toBe(
      true
    )
  })

  it('covers every starter, roughly evenly, over many seeds', () => {
    const counts = new Map<string, number>()
    for (let seed = 0; seed < 400; seed++) {
      const name = draw(seed).name as string
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    expect([...counts.keys()].sort()).toEqual(['a', 'b', 'c', 'd'])
    // 100 expected each, standard deviation about 8.7: a 30 band is more than three of them
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(70)
      expect(count).toBeLessThan(130)
    }
  })

  it('the starters differ from each other and from the founder plan in their genes', () => {
    const founder = founderBodyVector(base)
    const bodies = STARTERS.map((s) => bodyVectorOf(s))
    for (const body of bodies) {
      expect(body).toHaveLength(BODY_GENE_COUNT)
      expect(body).not.toEqual(founder)
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(bodies.length)
  })

  it('throws on an empty pool or an unknown forced name instead of guessing', () => {
    // validation refuses both configurations first, so build them by hand to reach the guard
    const empty = {
      ...base,
      starters: [],
      startingBody: { mode: 'archetypes' as const, archetype: null }
    }
    expect(() => chooseStartingBody(empty, new RandomStreams(1).get('genetics'))).toThrow(
      RangeError
    )
    const unknown = {
      ...base,
      starters: STARTERS,
      startingBody: { mode: 'archetypes' as const, archetype: 'nope' }
    }
    expect(() => chooseStartingBody(unknown, new RandomStreams(1).get('genetics'))).toThrow(
      RangeError
    )
    expect(() =>
      resolveWorldConfig({ anatomy: { startingBody: { mode: 'archetypes' } } })
    ).toThrow()
    expect(() =>
      resolveWorldConfig(withStarters({ mode: 'archetypes', archetype: 'nope' }))
    ).toThrow()
  })
})

describe('a world with starting bodies', () => {
  const small = { organisms: { initialCount: 12 } }

  it('gives every founder the drawn body, and says which one it was', () => {
    const world = World.create({
      seed: 5,
      config: { ...small, ...withStarters({ mode: 'archetypes' }) }
    })
    const drawn = draw(5)
    expect(world.startingBodyName).toBe(drawn.name)
    const snapshot = world.snapshot()
    expect(snapshot.organisms).toHaveLength(12)
    for (const organism of snapshot.organisms) {
      expect(world.genomeOf(organism.id)?.body.genes).toEqual(drawn.body)
    }
  })

  it('is the founder plan, nameless, in reference mode (the default)', () => {
    const world = World.create({ seed: 5, config: { ...small, anatomy: { starters: STARTERS } } })
    expect(world.startingBodyName).toBeNull()
    for (const organism of world.snapshot().organisms) {
      expect(world.genomeOf(organism.id)?.body.genes).toEqual(
        founderBodyVector(world.config.anatomy)
      )
    }
  })

  it('keeps the founder plan as the reference: an archetype body has factors against it, not all 1', () => {
    const world = World.create({
      seed: 5,
      config: { ...small, ...withStarters({ mode: 'archetypes', archetype: 'a' }) }
    })
    const id = world.snapshot().organisms[0]!.id
    const view = world.anatomyOf(id)!
    // the grazer-like mouth does not change speed or reach, but its diet yield is not the generalist's
    expect(view.factors.speed).toBe(1)
    expect(Object.values(view.factors.dietEfficiency).some((v) => v !== 1)).toBe(true)
    // negative: the founder plan itself is exactly 1 everywhere
    const plain = World.create({ seed: 5, config: small })
    const founderView = plain.anatomyOf(plain.snapshot().organisms[0]!.id)!
    expect(Object.values(founderView.factors.dietEfficiency).every((v) => v === 1)).toBe(true)
  })

  it('different seeds start different worlds and the same seed the same one', () => {
    const run = (seed: number): { name: string | null; hash: string } => {
      const w = World.create({
        seed,
        config: { ...small, ...withStarters({ mode: 'archetypes' }) }
      })
      w.run(200)
      return { name: w.startingBodyName, hash: w.stateHash() }
    }
    expect(run(2)).toEqual(run(2))
    const names = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((seed) => run(seed).name))
    expect(names.size).toBeGreaterThan(1)
  })

  it('stepped and chunked runs agree in archetypes mode', () => {
    const config = { ...small, ...withStarters({ mode: 'archetypes' as const }) }
    const whole = World.create({ seed: 9, config })
    whole.run(300)
    const chunked = World.create({ seed: 9, config })
    chunked.run(120)
    chunked.run(180)
    expect(chunked.stateHash()).toBe(whole.stateHash())
  })

  it("the cluster layout starts from the drawn body: part genes are the archetype's, outlines vary", () => {
    const world = World.create({
      seed: 4,
      config: {
        environment: { layout: 'clusters' },
        ...withStarters({ mode: 'archetypes', archetype: 'b' })
      }
    })
    const target = bodyVectorOf(STARTERS[1]!)
    const slotIndices: number[] = []
    for (let slot = 0; slot < 12; slot++) {
      for (const field of ['present', 'type', 'size', 'angle', 's2'] as const) {
        slotIndices.push(slotGeneIndex(slot, field))
      }
    }
    for (const organism of world.snapshot().organisms) {
      const genes = world.genomeOf(organism.id)!.body.genes
      for (const index of slotIndices) expect(genes[index]).toBe(target[index])
    }
  })
})
