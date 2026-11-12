import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { StartingBody, WorldConfigOverrides } from '@evo/contracts'
import { mouthFormOf } from '@evo/contracts'
import { assignFounderGroups, chooseStartingBody } from '../../src/genetics/BodyGenes'
import { mouthsOf } from '../../src/organisms/mouths'
import { RandomStreams } from '../../src/random/streams'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'

// Mixed founders (ADR 0023): a share of the founders starts with another starter's body, chosen by
// an even spread over their order, so no draw is spent and every seed keeps its base body.

describe('assignFounderGroups', () => {
  it('takes round(count x share) founders, evenly spread, and spends no randomness', () => {
    const a = assignFounderGroups(20, [0.1])
    expect(a.filter((g) => g === 0)).toHaveLength(2)
    expect(a.indexOf(0)).toBe(9)
    expect(a.lastIndexOf(0)).toBe(19)
    expect(a.filter((g) => g === -1)).toHaveLength(18)
    // Pure: the same call twice is the same answer.
    expect(assignFounderGroups(20, [0.1])).toEqual(a)
  })

  it('no groups, a zero share or no founders assigns nobody (negatives)', () => {
    expect(assignFounderGroups(20, []).every((g) => g === -1)).toBe(true)
    expect(assignFounderGroups(20, [0]).every((g) => g === -1)).toBe(true)
    expect(assignFounderGroups(0, [0.5])).toEqual([])
    // A share too small to round up to one founder takes none.
    expect(assignFounderGroups(4, [0.1]).every((g) => g === -1)).toBe(true)
  })

  it('several groups never take the same founder and each gets its own count', () => {
    const a = assignFounderGroups(40, [0.1, 0.25])
    expect(a.filter((g) => g === 0)).toHaveLength(4)
    expect(a.filter((g) => g === 1)).toHaveLength(10)
    expect(a.filter((g) => g === -1)).toHaveLength(26)
  })

  it('a group is spread over the whole run, not packed at one end', () => {
    for (const count of [10, 20, 60, 245]) {
      const a = assignFounderGroups(count, [0.2])
      const taken = a.flatMap((g, i) => (g === 0 ? [i] : []))
      expect(taken.length).toBe(Math.round(count * 0.2))
      expect(Math.min(...taken)).toBeLessThan(count / 2)
      expect(Math.max(...taken)).toBeGreaterThan(count / 2)
    }
  })
})

const HUNTERS: WorldConfigOverrides = {
  anatomy: {
    startingBody: {
      mode: 'archetypes',
      archetype: 'grazer',
      groups: [{ archetype: 'hunter', share: 0.1 }]
    }
  }
}

describe('the hunter starter', () => {
  const anatomy = resolveWorldConfig(HUNTERS).anatomy
  const hunter = anatomy.starters.find((s) => s.name === 'hunter') as StartingBody

  it('is the grazer with a jaw, never drawn as a base body', () => {
    const grazer = anatomy.starters.find((s) => s.name === 'grazer') as StartingBody
    expect(hunter.pool).toBe(false)
    const mouth = hunter.parts.find((p) => p.type === 'mouth')!
    expect(mouthFormOf(mouth.stats[2] ?? 0.5)).toBe('jaw')
    const grazerMouth = grazer.parts.find((p) => p.type === 'mouth')!
    expect(mouthFormOf(grazerMouth.stats[2] ?? 0.5)).toBe('sprout')
    // Everything but the mouth stat is the grazer's.
    expect(hunter.parts.map((p) => p.type)).toEqual(grazer.parts.map((p) => p.type))
    expect(hunter.outline).toEqual(grazer.outline)
  })

  it('over many seeds the base draw never lands on the hunter (the pool excludes it)', () => {
    const open = resolveWorldConfig({ anatomy: { startingBody: { mode: 'archetypes' } } }).anatomy
    const names = new Set<string>()
    for (let seed = 1; seed <= 300; seed++) {
      names.add(chooseStartingBody(open, new RandomStreams(seed).get('genetics')).name as string)
    }
    expect(names.has('hunter')).toBe(false)
    expect([...names].sort()).toEqual([
      'fungus-scraper',
      'grazer',
      'nectar-sipper',
      'scout',
      'tank'
    ])
  })

  it('adding it leaves each seed with the same base body and the same draw', () => {
    const without = resolveWorldConfig({
      anatomy: {
        starters: anatomy.starters.filter((s) => s.name !== 'hunter'),
        startingBody: { groups: [] }
      }
    }).anatomy
    const withIt = resolveWorldConfig({}).anatomy
    for (const seed of [1, 2, 3, 11, 99]) {
      const a = new RandomStreams(seed).get('genetics')
      const b = new RandomStreams(seed).get('genetics')
      expect(chooseStartingBody(without, a).name).toBe(chooseStartingBody(withIt, b).name)
      expect(a.getState()).toEqual(b.getState())
    }
  })

  it('can still be forced by name', () => {
    const forced = resolveWorldConfig({
      anatomy: { startingBody: { mode: 'archetypes', archetype: 'hunter' } }
    }).anatomy
    expect(chooseStartingBody(forced, new RandomStreams(1).get('genetics')).name).toBe('hunter')
  })
})

describe('validation of founder groups', () => {
  const groups = (g: unknown): WorldConfigOverrides =>
    ({ anatomy: { startingBody: { groups: g } } }) as unknown as WorldConfigOverrides

  it('accepts none, one and several', () => {
    expect(() => resolveWorldConfig(groups([]))).not.toThrow()
    expect(() => resolveWorldConfig(groups([{ archetype: 'hunter', share: 0.1 }]))).not.toThrow()
    expect(() =>
      resolveWorldConfig(
        groups([
          { archetype: 'hunter', share: 0.2 },
          { archetype: 'tank', share: 0.3 }
        ])
      )
    ).not.toThrow()
  })

  it('rejects an unknown starter, a bad share, a total over half, a repeat and stray keys', () => {
    expect(() => resolveWorldConfig(groups([{ archetype: 'nope', share: 0.1 }]))).toThrow(/starter/)
    expect(() => resolveWorldConfig(groups([{ archetype: 'hunter', share: 0 }]))).toThrow(/share/)
    expect(() => resolveWorldConfig(groups([{ archetype: 'hunter', share: 0.6 }]))).toThrow(/share/)
    expect(() => resolveWorldConfig(groups([{ archetype: 'hunter', share: -0.1 }]))).toThrow()
    expect(() =>
      resolveWorldConfig(
        groups([
          { archetype: 'hunter', share: 0.3 },
          { archetype: 'tank', share: 0.3 }
        ])
      )
    ).toThrow(/more than 0.5/)
    expect(() =>
      resolveWorldConfig(
        groups([
          { archetype: 'hunter', share: 0.1 },
          { archetype: 'hunter', share: 0.1 }
        ])
      )
    ).toThrow(/two groups/)
    expect(() =>
      resolveWorldConfig(groups([{ archetype: 'hunter', share: 0.1, extra: 1 }]))
    ).toThrow(/unknown property/)
    expect(() => resolveWorldConfig(groups('hunter'))).toThrow(/array/)
  })

  it('rejects a pool of only group-only starters', () => {
    const only = {
      anatomy: {
        starters: resolveWorldConfig({}).anatomy.starters.filter((s) => s.name === 'hunter'),
        startingBody: { groups: [] }
      }
    }
    expect(() => resolveWorldConfig(only)).toThrow(/pool/)
  })
})

describe('a world with a hunter group', () => {
  const make = (seed: number, extra: WorldConfigOverrides = {}) =>
    World.create({ seed, config: withoutEcology({ ...HUNTERS, ...extra }) })

  const jawsOf = (world: World): number =>
    world.snapshot().organisms.filter((o) => {
      const genome = world.genomeOf(o.id)!
      return mouthsOf(genome, world.config).some((m) => m.form === 'jaw')
    }).length

  it('starts 2 of 20 founders as hunters and the rest as the base body', () => {
    const world = make(1)
    expect(world.snapshot().organisms).toHaveLength(20)
    expect(jawsOf(world)).toBe(2)
    expect(world.startingGroups).toEqual([{ name: 'hunter', count: 2 }])
    expect(world.startingBodyName).toBe('grazer')
  })

  it('no groups gives no hunters, and a share that rounds to nothing gives none either (negatives)', () => {
    const none = World.create({
      seed: 1,
      config: withoutEcology({
        anatomy: { startingBody: { mode: 'archetypes', archetype: 'grazer', groups: [] } }
      })
    })
    expect(jawsOf(none)).toBe(0)
    expect(none.startingGroups).toEqual([])
    const tiny = make(1, { organisms: { initialCount: 4 } })
    expect(jawsOf(tiny)).toBe(0)
    expect(tiny.startingGroups).toEqual([{ name: 'hunter', count: 0 }])
  })

  it('reference mode ignores groups (the founder plan is one body)', () => {
    const world = World.create({
      seed: 1,
      config: withoutEcology({
        anatomy: {
          startingBody: { mode: 'reference', groups: [{ archetype: 'hunter', share: 0.1 }] }
        }
      })
    })
    expect(jawsOf(world)).toBe(0)
    expect(world.startingGroups).toEqual([])
  })

  it('draws nothing extra: the base world and the grouped world leave the streams in the same place', () => {
    const state = (w: World) => JSON.stringify(w.stateHash())
    const a = World.create({
      seed: 4,
      config: withoutEcology({
        anatomy: { startingBody: { mode: 'archetypes', archetype: 'grazer', groups: [] } }
      })
    })
    const b = make(4)
    // The founders' brains and positions are drawn identically; only two bodies differ.
    const pos = (w: World) =>
      w.snapshot().organisms.map((o) => [o.position.x, o.position.y, o.heading])
    expect(pos(b)).toEqual(pos(a))
    expect(state(a)).not.toBe(state(b))
  })

  it('stepped and chunked runs agree with groups on', () => {
    const a = make(2)
    a.run(300)
    const b = make(2)
    for (let i = 0; i < 3; i++) b.run(100)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})
