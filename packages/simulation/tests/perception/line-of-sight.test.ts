import { describe, expect, it } from 'vitest'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { ConfigValidationError, presetByName, resolveWorldConfig } from '@evo/config'
import type { PeerBuffer, PerceptionBuffer } from '../../src/buffers/types'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { bodyRadiusOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { SIGHT_BLOCKER_MARGIN, segmentHitsCircle } from '../../src/spatial/sight'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

/**
 * Line of sight (ADR 0016): another creature's body hides what is behind it from a viewer, for
 * food and for the peer sense. Without the switch every creature is transparent, as it always was.
 */
describe('segmentHitsCircle', () => {
  it('blocks when the circle is on the line', () => {
    expect(segmentHitsCircle(0, 0, 20, 0, 10, 0, 3)).toBe(true)
    expect(segmentHitsCircle(0, 0, 0, 20, 0, 10, 3)).toBe(true)
  })

  it('lets a near miss through and stops a graze (the circle must be nearer than its radius)', () => {
    expect(segmentHitsCircle(0, 0, 20, 0, 10, 6, 5)).toBe(false)
    expect(segmentHitsCircle(0, 0, 20, 0, 10, 4, 5)).toBe(true)
  })

  it('ignores a circle behind the eye or beyond the target', () => {
    expect(segmentHitsCircle(0, 0, 10, 0, -8, 0, 5)).toBe(false)
    expect(segmentHitsCircle(0, 0, 10, 0, 18, 0, 5)).toBe(false)
  })

  it('hides a target that is inside the circle, but not one just outside it', () => {
    expect(segmentHitsCircle(0, 0, 10.5, 0, 10, 0, 3)).toBe(true)
    expect(segmentHitsCircle(0, 0, 10, 0, 14, 0, 3)).toBe(false)
  })

  it('does not blind an eye that is inside the circle (bodies overlap freely)', () => {
    expect(segmentHitsCircle(0, 0, 30, 0, 1, 1, 5)).toBe(false)
  })

  it('handles a zero-length line (eye on the target) and a symmetric line', () => {
    expect(segmentHitsCircle(5, 5, 5, 5, 50, 50, 3)).toBe(false)
    expect(segmentHitsCircle(0, 0, 20, 7, 10, 3.5, 2)).toBe(
      segmentHitsCircle(20, 7, 0, 0, 10, 3.5, 2)
    )
  })
})

const plain = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(withoutEcology({ learning: { controller: 'brain' }, ...extra }))

const ORIGIN = 100

interface Scene {
  /** Other creatures: [id, dx, dy] from the viewer. */
  readonly others?: ReadonlyArray<readonly [number, number, number]>
  /** Food items: [id, dx, dy] from the viewer. */
  readonly foods?: ReadonlyArray<readonly [number, number, number]>
  readonly blockers?: boolean
  readonly heading?: number
  readonly viewer?: (config: WorldConfig, state: OrganismState) => OrganismState
}

/** What the viewer (id 1) perceives: the id of the food and of the peer, or `null`. */
function look(config: WorldConfig, scene: Scene): { food: number | null; peer: number | null } {
  const base = organismFor(config, 1, { x: ORIGIN, y: ORIGIN, heading: scene.heading ?? 0 })
  const viewer = scene.viewer === undefined ? base : scene.viewer(config, base)
  const organisms = new OrganismStore()
  organisms.add(viewer)
  for (const [id, dx, dy] of scene.others ?? []) {
    organisms.add(organismFor(config, id, { x: ORIGIN + dx, y: ORIGIN + dy }))
  }
  const resources = new ResourceStore()
  for (const [id, dx, dy] of scene.foods ?? []) {
    resources.add({ id, x: ORIGIN + dx, y: ORIGIN + dy, remaining: 30, kind: 0 })
  }
  const foodIndex = new SpatialHash<ResourceState>(60, (r) => r)
  foodIndex.rebuild(resources.values())
  const organismIndex = new SpatialHash<OrganismState>(60, (o) => o)
  organismIndex.rebuild(organisms.values())
  const food: PerceptionBuffer = new Map()
  const peers: PeerBuffer = new Map()
  new PerceptionSystem(
    config,
    organisms,
    foodIndex,
    food,
    { organismIndex, buffer: peers },
    null,
    undefined,
    undefined,
    scene.blockers === false ? undefined : { organismIndex }
  ).update(0)
  const f = food.get(1) as { resourceId: number } | null | undefined
  const p = peers.get(1) as { organismId: number } | null | undefined
  return { food: f?.resourceId ?? null, peer: p?.organismId ?? null }
}

describe('food behind a creature', () => {
  const config = plain()
  const r = bodyRadiusOf(organismFor(config, 2).genome, config)

  it('is not seen through it; with the switch off it is (the old, transparent world)', () => {
    const scene = { others: [[2, 25, 0]] as const, foods: [[9, 45, 0]] as const }
    expect(look(config, scene).food).toBeNull()
    expect(look(config, { ...scene, blockers: false }).food).toBe(9)
  })

  it('is seen when the creature is off the line by more than its radius (negative)', () => {
    expect(look(config, { others: [[2, 25, r + 3]], foods: [[9, 45, 0]] }).food).toBe(9)
  })

  it('is seen when the creature is beyond the food or behind the viewer (negative)', () => {
    expect(look(config, { others: [[2, 60, 0]], foods: [[9, 40, 0]] }).food).toBe(9)
    expect(look(config, { others: [[2, -25, 0]], foods: [[9, 40, 0]] }).food).toBe(9)
  })

  it('falls back to the next nearest food that is not hidden', () => {
    const scene = {
      others: [[2, 20, 0]] as const,
      foods: [
        [8, 40, 0],
        [9, 0, 45]
      ] as const
    }
    expect(look(config, scene).food).toBe(9)
    expect(look(config, { ...scene, blockers: false }).food).toBe(8)
  })

  it('is hidden when it sits inside another creature (it is being eaten under it)', () => {
    expect(look(config, { others: [[2, 30, 0]], foods: [[9, 30.5, 0.5]] }).food).toBeNull()
    expect(
      look(config, { others: [[2, 30, 0]], foods: [[9, 30.5, 0.5]], blockers: false }).food
    ).toBe(9)
  })

  it('is only checked up to maxSightChecks candidates (the cap bounds the work)', () => {
    // two candidates in a row behind a creature, a third visible: with a cap of 1 nothing is seen
    const scene = {
      others: [[2, 15, 0]] as const,
      foods: [
        [7, 30, 0],
        [8, 40, 0],
        [9, 0, 50]
      ] as const
    }
    const capped = plain({ perception: { maxSightChecks: 1 } })
    expect(look(capped, scene).food).toBeNull()
    expect(look(plain({ perception: { maxSightChecks: 3 } }), scene).food).toBe(9)
  })
})

describe('peers', () => {
  const config = plain()

  it('sees the nearest peer, and a peer never hides itself (a large body does not block its own centre)', () => {
    expect(look(config, { others: [[2, 40, 0]] }).peer).toBe(2)
    expect(look(config, { others: [[2, 40, 0]], blockers: false }).peer).toBe(2)
  })

  it('sees the nearer of two peers in a line (the one in front hides the one behind, so the front one is it)', () => {
    expect(
      look(config, {
        others: [
          [2, 20, 0],
          [3, 40, 0]
        ]
      }).peer
    ).toBe(2)
  })

  it('does not block itself while it blocks the food behind it', () => {
    const scene = { others: [[2, 25, 0]] as const, foods: [[9, 45, 0]] as const }
    const seen = look(config, scene)
    expect(seen.peer).toBe(2)
    expect(seen.food).toBeNull()
  })
})

describe('a directional eye', () => {
  const config = plain()
  const narrow = (cfg: WorldConfig, state: OrganismState): OrganismState => {
    const gene = (1.4 - 0.5) / (6.28 - 0.5) // a 1.4 radian cone
    const parts: FounderPart[] = [
      ...cfg.anatomy.founder.filter((p) => p.type !== 'eye').map((p) => ({ ...p })),
      {
        type: 'eye',
        parent: 0,
        size: 0.5,
        angle: 0,
        offset: 0.8,
        orientation: 0,
        integrity: 1,
        stats: [0.5, 0.5, gene, 0.5, 0.5, 0.5]
      }
    ]
    const body = founderBodyVector({ ...cfg.anatomy, founder: parts })
    return {
      ...state,
      genome: genomeFromParts({
        id: state.genome.id,
        parentIds: state.genome.parentIds,
        vector: genomeToVector(state.genome),
        architecture: state.genome.brain.architecture,
        weights: state.genome.brain.weights,
        body
      })
    }
  }

  it('is blocked on the line it looks along and not when the creature is off to the side', () => {
    const food = [[9, 70, 0]] as const
    expect(look(config, { viewer: narrow, others: [[2, 30, 0]], foods: food }).food).toBeNull()
    expect(look(config, { viewer: narrow, others: [[2, 30, 15]], foods: food }).food).toBe(9)
    expect(
      look(config, { viewer: narrow, others: [[2, 30, 0]], foods: food, blockers: false }).food
    ).toBe(9)
  })
})

describe('worlds with line of sight', () => {
  const overrides = (block: boolean): WorldConfigOverrides => ({
    organisms: { initialCount: 30 },
    perception: { organismsBlockSight: block }
  })

  it('stepped, chunked and single runs agree in a crowded world', () => {
    const single = World.create({ seed: 51, config: overrides(true) })
    single.run(1_500)
    const chunked = World.create({ seed: 51, config: overrides(true) })
    for (let i = 0; i < 5; i++) chunked.run(300)
    const stepped = World.create({ seed: 51, config: overrides(true) })
    for (let i = 0; i < 1_500; i++) stepped.step()
    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(stepped.stateHash()).toBe(single.stateHash())
    expect(single.validate()).toEqual({ ok: true, errors: [] })
  })

  it('changes what happens (negative: a world where it never matters would prove nothing)', () => {
    const on = World.create({ seed: 51, config: overrides(true) })
    const off = World.create({ seed: 51, config: overrides(false) })
    on.run(1_500)
    off.run(1_500)
    expect(on.stateHash()).not.toBe(off.stateHash())
  })

  it('works under the reflex controller too', () => {
    const config: WorldConfigOverrides = { ...overrides(true), learning: { controller: 'reflex' } }
    const a = World.create({ seed: 52, config })
    const b = World.create({ seed: 52, config })
    a.run(1_200)
    for (let i = 0; i < 4; i++) b.run(300)
    expect(b.stateHash()).toBe(a.stateHash())
  })
})

describe('perception config', () => {
  it('defaults to bodies blocking sight, six checks, and classic keeps the transparent world', () => {
    const config = resolveWorldConfig({})
    expect(config.perception).toEqual({ organismsBlockSight: true, maxSightChecks: 6 })
    expect(
      resolveWorldConfig(presetByName('classic')?.overrides ?? {}).perception.organismsBlockSight
    ).toBe(false)
    expect(SIGHT_BLOCKER_MARGIN).toBeGreaterThan(0)
  })

  it('rejects a bad check cap and a non-boolean switch', () => {
    expect(() => resolveWorldConfig({ perception: { maxSightChecks: 0 } })).toThrow(
      ConfigValidationError
    )
    expect(() => resolveWorldConfig({ perception: { maxSightChecks: 2.5 } })).toThrow(
      ConfigValidationError
    )
    expect(() =>
      resolveWorldConfig({ perception: { organismsBlockSight: 1 as unknown as boolean } })
    ).toThrow(ConfigValidationError)
  })
})
