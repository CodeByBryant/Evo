import { describe, expect, it } from 'vitest'
import type { FounderPart, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import { ConfigValidationError, resolveWorldConfig } from '@evo/config'
import type { PeerBuffer, PerceptionBuffer } from '../../src/buffers/types'
import type { HazardStore } from '../../src/ecology/HazardStore'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { factorsOf } from '../../src/organisms/bodyFactors'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { ALL_ROUND } from '../support/bodies'
import { organismFor } from '../support/organism'

/**
 * Directional vision (ADR 0016): an eye sees a cone, not a circle. The founder's eye is all-round,
 * so nothing changes until a body narrows it; narrowing buys reach (the range-for-angle trade);
 * the mating signal is not vision and stays all-round.
 */
const plain = (extra: WorldConfigOverrides = {}): WorldConfig =>
  resolveWorldConfig(withoutEcology({ feeding: { enabled: false }, ...extra }))

type Parts = FounderPart[]
const eye = (angle: number, fovGene: number, size = 0.5): FounderPart => ({
  type: 'eye',
  parent: 0,
  size,
  angle,
  offset: 0.8,
  orientation: 0,
  integrity: 1,
  stats: [0.5, 0.5, fovGene, 0.5, 0.5, 0.5]
})
/** The field-of-view gene for a cone of `radians` (the stat runs 0.5 to 6.28). */
const gene = (radians: number): number => (radians - 0.5) / (6.28 - 0.5)
const NINETY = gene(Math.PI / 2)

const founderParts = (config: WorldConfig): Parts => config.anatomy.founder.map((p) => ({ ...p }))
const withoutEyes = (parts: Parts): Parts => parts.filter((p) => p.type !== 'eye')

function withBody(organism: OrganismState, config: WorldConfig, parts: Parts): OrganismState {
  const body = founderBodyVector({ ...config.anatomy, founder: parts })
  const genome = genomeFromParts({
    id: organism.genome.id,
    parentIds: organism.genome.parentIds,
    vector: genomeToVector(organism.genome),
    architecture: organism.genome.brain.architecture,
    weights: organism.genome.brain.weights,
    body
  })
  return { ...organism, genome }
}

const store = (...organisms: OrganismState[]): OrganismStore => {
  const s = new OrganismStore()
  for (const o of organisms) s.add(o)
  return s
}

const ORIGIN = 100

/** Whether an organism with this body, facing `heading`, perceives food at (`dx`, `dy`) from it. */
function seesFood(config: WorldConfig, parts: Parts, dx: number, dy: number, heading = 0): boolean {
  const organism = withBody(
    organismFor(config, 1, { x: ORIGIN, y: ORIGIN, heading }),
    config,
    parts
  )
  const resources = new ResourceStore()
  resources.add({ id: 9, x: ORIGIN + dx, y: ORIGIN + dy, remaining: 30, kind: 0 })
  const index = new SpatialHash<ResourceState>(60, (r) => r)
  index.rebuild(resources.values())
  const buffer: PerceptionBuffer = new Map()
  new PerceptionSystem(config, store(organism), index, buffer).update(0)
  const seen = buffer.get(1)
  return seen !== null && seen !== undefined
}

/** The same question for another organism (the peer sense). */
function seesPeer(config: WorldConfig, parts: Parts, dx: number, dy: number): boolean {
  const watcher = withBody(organismFor(config, 1, { x: ORIGIN, y: ORIGIN }), config, parts)
  const other = organismFor(config, 2, { x: ORIGIN + dx, y: ORIGIN + dy })
  const organisms = store(watcher, other)
  const index = new SpatialHash<OrganismState>(60, (o) => o)
  index.rebuild(organisms.values())
  const resources = new SpatialHash<ResourceState>(60, (r) => r)
  resources.rebuild([])
  const peers: PeerBuffer = new Map()
  new PerceptionSystem(config, organisms, resources, new Map(), {
    organismIndex: index,
    buffer: peers
  }).update(0)
  const seen = peers.get(1)
  return seen !== null && seen !== undefined
}

const R = (config: WorldConfig): number => config.organisms.sensorRadius

describe('the founder sees a forward cone', () => {
  const FOV = 0.5 + 0.3211 * (6.28 - 0.5) // 135 degrees, the founder eye's field of view
  const NARROW = Math.sqrt(6.28 / FOV)

  it('has a 135 degree eye, so it is not omni, and it reaches about 1.6 times the sensor radius', () => {
    const config = plain()
    const f = factorsOf(organismFor(config, 1).genome, config)
    expect(f.vision.omni).toBe(false)
    expect(f.vision.cones).toHaveLength(1)
    expect(f.vision.cones[0]?.half).toBeCloseTo(FOV / 2, 9)
    expect(f.vision.cones[0]?.reach).toBeCloseTo(NARROW, 9)
    // The range for angle trade keeps the area it sees: a sector of this reach and angle covers
    // the same ground as the old full circle.
    expect(0.5 * NARROW * NARROW * FOV).toBeCloseTo(Math.PI, 2)
    expect(f.senseRange).toBe(1)
  })

  it('sees food ahead out to about 1.6 radii and nothing beside or behind past the touch radius', () => {
    const config = plain()
    const founder = founderParts(config)
    const R0 = R(config)
    expect(seesFood(config, founder, R0 * 1.5, 0)).toBe(true)
    expect(seesFood(config, founder, R0 * 1.8, 0)).toBe(false)
    // behind and to the side: only the touch radius
    expect(seesFood(config, founder, -R0 * 0.9, 0)).toBe(false)
    expect(seesFood(config, founder, 0, R0 * 0.9)).toBe(false)
    expect(seesFood(config, founder, 0, -R0 * 0.9)).toBe(false)
    const touch = R0 * config.anatomy.senseFloor
    expect(seesFood(config, founder, -touch * 0.8, 0)).toBe(true)
  })

  it('looks along its heading: the cone turns with the creature', () => {
    const config = plain()
    const founder = founderParts(config)
    const d = R(config) * 1.2
    expect(seesFood(config, founder, d, 0, 0)).toBe(true)
    expect(seesFood(config, founder, d, 0, Math.PI)).toBe(false)
    expect(seesFood(config, founder, 0, d, Math.PI / 2)).toBe(true)
  })

  it('an all-round founder (the test helper) sees every bearing inside its range', () => {
    const config = plain(ALL_ROUND)
    const f = factorsOf(organismFor(config, 1).genome, config)
    expect(f.vision.omni).toBe(true)
    expect(f.vision.cones[0]?.cosHalf).toBe(-1)
    expect(f.vision.cones[0]?.reach).toBe(1)
    const founder = config.anatomy.founder.map((p) => ({ ...p }))
    const d = R(config) * 0.9
    for (const angle of [0, 1, 2, 3, 4, 5, 6]) {
      expect(seesFood(config, founder, d * Math.cos(angle), d * Math.sin(angle))).toBe(true)
    }
    expect(seesFood(config, founder, R(config) * 1.1, 0)).toBe(false)
  })
})

describe('a narrow eye sees a cone', () => {
  const config = plain()
  const forward = [...withoutEyes(founderParts(config)), eye(0, NINETY)]

  it('is not omni, and sees further than an all-round eye of the same size', () => {
    const f = factorsOf(withBody(organismFor(config, 1), config, forward).genome, config)
    expect(f.vision.omni).toBe(false)
    // The stat runs to 6.28, so a 90 degree eye reaches sqrt(6.28 / (pi / 2)), about twice as far.
    expect(f.vision.cones[0]?.reach).toBeCloseTo(Math.sqrt(6.28 / (Math.PI / 2)), 9)
    expect(f.senseRange).toBe(1)
  })

  it('sees food straight ahead beyond the all-round range', () => {
    expect(seesFood(config, forward, R(config) * 1.8, 0)).toBe(true)
    expect(seesFood(config, forward, R(config) * 2.2, 0)).toBe(false)
  })

  it('does not see food behind it or beside it, at a distance an all-round eye would', () => {
    const d = R(config) * 0.8
    expect(seesFood(config, forward, -d, 0)).toBe(false)
    expect(seesFood(config, forward, 0, d)).toBe(false)
    expect(seesFood(config, forward, 0, -d)).toBe(false)
  })

  it('sees food inside the cone and not just outside it (half-angle 45 degrees)', () => {
    const d = R(config) * 0.9
    const at = (deg: number): boolean => {
      const a = (deg * Math.PI) / 180
      return seesFood(config, forward, d * Math.cos(a), d * Math.sin(a))
    }
    expect(at(0)).toBe(true)
    expect(at(40)).toBe(true)
    expect(at(-40)).toBe(true)
    expect(at(50)).toBe(false)
    expect(at(-50)).toBe(false)
  })

  it('always feels what it touches: food inside the touch radius is seen from any bearing', () => {
    const touch = R(config) * config.anatomy.senseFloor
    expect(seesFood(config, forward, -touch * 0.8, 0)).toBe(true)
    expect(seesFood(config, forward, -touch * 1.5, 0)).toBe(false)
  })

  it('turns with the body: the cone follows the heading', () => {
    const d = R(config) * 0.9
    // Facing backward, the food that was ahead is now behind and the food that was behind is ahead.
    expect(seesFood(config, forward, d, 0, Math.PI)).toBe(false)
    expect(seesFood(config, forward, -d, 0, Math.PI)).toBe(true)
    // Facing up (+y), food straight up is ahead.
    expect(seesFood(config, forward, 0, d, Math.PI / 2)).toBe(true)
    expect(seesFood(config, forward, d, 0, Math.PI / 2)).toBe(false)
  })

  it('an eye mounted on the other side looks the other way', () => {
    const back = [...withoutEyes(founderParts(config)), eye(Math.PI, NINETY)]
    const d = R(config) * 0.9
    expect(seesFood(config, back, -d, 0)).toBe(true)
    expect(seesFood(config, back, d, 0)).toBe(false)
  })
})

describe('width is traded against reach', () => {
  const config = plain()
  const body = (fov: number): Parts => [...withoutEyes(founderParts(config)), eye(0, gene(fov))]
  const reachOf = (fov: number): number =>
    factorsOf(withBody(organismFor(config, 1), config, body(fov)).genome, config).vision.cones[0]
      ?.reach as number

  it('a narrower cone reaches strictly further than a wider one', () => {
    expect(reachOf(0.8)).toBeGreaterThan(reachOf(1.6))
    expect(reachOf(1.6)).toBeGreaterThan(reachOf(3.2))
    expect(reachOf(3.2)).toBeGreaterThan(1)
  })

  it('visionNarrowing 0 removes the trade: every cone reaches the sense range', () => {
    const flat = plain({ anatomy: { effects: { visionNarrowing: 0 } } })
    const f = factorsOf(withBody(organismFor(flat, 1), flat, body(0.8)).genome, flat)
    expect(f.vision.cones[0]?.reach).toBe(f.senseRange)
  })

  it('rejects a narrowing outside [0, 1]', () => {
    expect(() => plain({ anatomy: { effects: { visionNarrowing: 1.5 } } })).toThrow(
      ConfigValidationError
    )
    expect(() => plain({ anatomy: { effects: { visionNarrowing: -0.1 } } })).toThrow(
      ConfigValidationError
    )
  })
})

describe('several eyes', () => {
  const config = plain()
  const ahead = (): Parts => [...withoutEyes(founderParts(config)), eye(0, NINETY)]
  const both = (): Parts => [...ahead(), eye(Math.PI, NINETY)]
  const d = R(config) * 0.9

  it('one forward eye does not see behind; a second eye on the back does', () => {
    expect(seesFood(config, ahead(), -d, 0)).toBe(false)
    expect(seesFood(config, both(), -d, 0)).toBe(true)
    expect(seesFood(config, both(), d, 0)).toBe(true)
  })

  it('two opposite eyes still leave the sides blind', () => {
    expect(seesFood(config, both(), 0, d)).toBe(false)
    expect(seesFood(config, both(), 0, -d)).toBe(false)
  })

  it('an eye with no integrity is not an eye: it adds no cone and no sight', () => {
    const dead: Parts = [...withoutEyes(founderParts(config)), { ...eye(0, NINETY), integrity: 0 }]
    const f = factorsOf(withBody(organismFor(config, 1), config, dead).genome, config)
    expect(f.vision.cones).toHaveLength(0)
    expect(seesFood(config, dead, d, 0)).toBe(false)
  })
})

describe('other organisms are seen through the same cones', () => {
  const config = plain()
  const forward = [...withoutEyes(founderParts(config)), eye(0, NINETY)]
  const d = R(config) * 0.9

  it('a peer ahead is seen and a peer behind is not', () => {
    expect(seesPeer(config, forward, d, 0)).toBe(true)
    expect(seesPeer(config, forward, -d, 0)).toBe(false)
  })

  it('the founder sees a peer ahead and not behind or beside (past the touch radius)', () => {
    const founder = founderParts(config)
    expect(seesPeer(config, founder, d, 0)).toBe(true)
    expect(seesPeer(config, founder, -d, 0)).toBe(false)
    expect(seesPeer(config, founder, 0, d)).toBe(false)
  })
})

describe('hazards are seen through the same cones', () => {
  const config = plain()
  const forward = [...withoutEyes(founderParts(config)), eye(0, NINETY)]
  const seesHazard = (parts: Parts, dx: number): boolean => {
    const organism = withBody(organismFor(config, 1, { x: ORIGIN, y: ORIGIN }), config, parts)
    const zone = { id: 5, x: ORIGIN + dx, y: ORIGIN, radius: 5 }
    const hazards = { values: () => [zone] } as unknown as HazardStore
    const buffer = new Map()
    const resources = new SpatialHash<ResourceState>(60, (r) => r)
    resources.rebuild([])
    new PerceptionSystem(config, store(organism), resources, new Map(), undefined, null, {
      hazards,
      buffer
    }).update(0)
    return buffer.get(1) !== null && buffer.get(1) !== undefined
  }

  it('a zone ahead is seen and the same zone behind is not', () => {
    const d = R(config) * 0.9 + 5
    expect(seesHazard(forward, d)).toBe(true)
    expect(seesHazard(forward, -d)).toBe(false)
    // the founder's own cone is forward too: the zone behind it is out of view
    expect(seesHazard(founderParts(config), -d)).toBe(false)
    expect(seesHazard(founderParts(config), d)).toBe(true)
  })
})

describe('worlds with narrow eyes stay deterministic and valid', () => {
  it('stepped, chunked and single runs agree, and every cone is well formed', () => {
    const config = plain()
    const narrow = [...withoutEyes(founderParts(config)), eye(0.3, gene(1.2))]
    const overrides: WorldConfigOverrides = {
      organisms: { initialCount: 12 },
      anatomy: { founder: narrow },
      genetics: { mutationRateScale: 3 }
    }
    const single = World.create({ seed: 31, config: overrides })
    single.run(1_200)
    const chunked = World.create({ seed: 31, config: overrides })
    for (let i = 0; i < 6; i++) chunked.run(200)
    const stepped = World.create({ seed: 31, config: overrides })
    for (let i = 0; i < 1_200; i++) stepped.step()
    expect(chunked.stateHash()).toBe(single.stateHash())
    expect(stepped.stateHash()).toBe(single.stateHash())
    expect(single.validate()).toEqual({ ok: true, errors: [] })

    for (const o of single.snapshot().organisms) {
      const view = single.anatomyOf(o.id)
      for (const cone of view?.factors.vision.cones ?? []) {
        expect(Number.isFinite(cone.reach)).toBe(true)
        expect(cone.reach).toBeGreaterThan(0)
        expect(cone.cosHalf).toBeGreaterThanOrEqual(-1)
        expect(cone.cosHalf).toBeLessThanOrEqual(1)
        expect(cone.axisCos * cone.axisCos + cone.axisSin * cone.axisSin).toBeCloseTo(1, 9)
      }
    }
  })
})
