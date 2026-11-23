import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { MOUTH_FORMS, mouthFormOf, scavengerFromOf } from '@evo/contracts'
import type { FounderPart, StartingBody, WorldConfig, WorldConfigOverrides } from '@evo/contracts'
import type { PerceptionBuffer } from '../../src/buffers/types'
import { OrganismStore } from '../../src/entities/OrganismStore'
import type { OrganismState } from '../../src/entities/OrganismStore'
import { ResourceStore } from '../../src/entities/ResourceStore'
import type { ResourceState } from '../../src/entities/ResourceStore'
import { EventLog } from '../../src/events/EventLog'
import { founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { developAnatomy } from '../../src/development/develop'
import { mouthsOf } from '../../src/organisms/mouths'
import { bitesCreatures } from '../../src/organisms/predation'
import { bodyRadiusOf } from '../../src/organisms/traits'
import { SpatialHash } from '../../src/spatial/SpatialHash'
import { InteractionSystem } from '../../src/systems/InteractionSystem'
import { PerceptionSystem } from '../../src/systems/PerceptionSystem'
import { withCarrion } from '../../src/world/predationConfig'
import { World } from '../../src/world/World'
import { withoutEcology } from '../support/ecology'
import { organismFor } from '../support/organism'

// The scavenger mouth (ADR 0031): a sixth form in a narrow band above the jaw's, off by default.
// It takes carrion and nothing else: no plant, no creature, no egg.

const config = (extra: WorldConfigOverrides = {}, enabled = true): WorldConfig =>
  withCarrion(
    resolveWorldConfig(
      withoutEcology({
        ...extra,
        learning: { controller: 'reflex' },
        ecology: { health: { enabled: true }, resourceKinds: { enabled: true }, ...extra.ecology },
        predation: { enabled: true, ...extra.predation },
        anatomy: { ...extra.anatomy, scavenger: { enabled } }
      })
    )
  )

const GRASS = 0
const MANDIBLE = 0.5
const JAW = 0.9
const SCAVENGER = 0.98

function body(cfg: WorldConfig, mouth: number): FounderPart[] {
  return cfg.anatomy.founder.map((p) =>
    p.type === 'mouth'
      ? { ...p, stats: [0.5, 0.5, mouth, 0.5, 0.5, 0.5] }
      : { ...p, stats: [...p.stats] }
  )
}

function creature(cfg: WorldConfig, mouth: number, overrides: Partial<OrganismState> = {}) {
  const base = organismFor(cfg, 1, {
    x: 100,
    y: 100,
    age: 200,
    energy: 50,
    heading: 0,
    ...overrides
  })
  const genome = genomeFromParts({
    id: base.genome.id,
    parentIds: [],
    vector: genomeToVector(base.genome),
    architecture: base.genome.brain.architecture,
    weights: base.genome.brain.weights,
    body: founderBodyVector({ ...cfg.anatomy, founder: body(cfg, mouth) })
  })
  return { ...base, genome }
}

const carrionOf = (cfg: WorldConfig): number =>
  cfg.ecology.resourceKinds.kinds.findIndex((k) => k.name === 'carrion')

/** One creature and one piece of food of a kind, a few units in front of its mouth. */
function eat(mouth: number, kind: number, enabled = true) {
  const cfg = config({}, enabled)
  const organism = creature(cfg, mouth)
  const [first] = mouthsOf(organism.genome, cfg)
  const radius = bodyRadiusOf(organism.genome, cfg)
  const food: ResourceState = {
    id: 5,
    x: organism.x + (first?.x ?? 0) * radius + 3,
    y: organism.y + (first?.y ?? 0) * radius,
    remaining: 30,
    kind
  }
  const organisms = new OrganismStore()
  organisms.add(organism)
  const resources = new ResourceStore()
  resources.add(food)
  const index = new SpatialHash<ResourceState>(60, (r) => r)
  index.rebuild(resources.values())
  const events = new EventLog(100)
  events.beginTick()
  new InteractionSystem(cfg, organisms, resources, index, events).update(1)
  return { organism, food, events, cfg }
}

describe('the scavenger band (a gene is a form)', () => {
  it('with the switch off every gene reads as before: 0.97 is a jaw, five bands of a fifth', () => {
    expect(scavengerFromOf(resolveWorldConfig({}).anatomy)).toBe(Infinity)
    expect(mouthFormOf(0.97)).toBe('jaw')
    expect(mouthFormOf(1)).toBe('jaw')
    expect(mouthFormOf(0.1)).toBe('sprout')
    expect(mouthFormOf(0.3)).toBe('proboscis')
    expect(mouthFormOf(0.5)).toBe('mandible')
    expect(mouthFormOf(0.7)).toBe('radula')
    expect(mouthFormOf(0.9)).toBe('jaw')
  })

  it('with it on only the top of the jaw band moves: the five old bands and the founder are untouched', () => {
    const from = scavengerFromOf(
      resolveWorldConfig({ anatomy: { scavenger: { enabled: true } } }).anatomy
    )
    expect(from).toBe(0.95)
    expect(mouthFormOf(0.98, from)).toBe('scavenger')
    expect(mouthFormOf(0.95, from)).toBe('scavenger')
    expect(mouthFormOf(1, from)).toBe('scavenger')
    // negative: just below the band, and every other band, read exactly as with the switch off
    expect(mouthFormOf(0.949, from)).toBe('jaw')
    expect(mouthFormOf(0.9, from)).toBe('jaw')
    for (let gene = 0; gene < 0.95; gene += 0.01) {
      expect(mouthFormOf(gene, from)).toBe(mouthFormOf(gene))
    }
    expect(mouthFormOf(0.5, from)).toBe('mandible')
  })

  it('the form is the sixth and last, so every older index is unchanged', () => {
    expect(MOUTH_FORMS).toEqual(['sprout', 'proboscis', 'mandible', 'radula', 'jaw', 'scavenger'])
  })

  it('a developed body reports the form the band gives', () => {
    const on = config()
    const off = config({}, false)
    const formOf = (cfg: WorldConfig): string | undefined => {
      const genome = creature(cfg, SCAVENGER).genome
      return mouthsOf(genome, cfg)[0]?.form
    }
    expect(formOf(on)).toBe('scavenger')
    expect(formOf(off)).toBe('jaw')
    expect(
      developAnatomy(creature(on, SCAVENGER).genome.body.genes, on.anatomy).parts.length
    ).toBeGreaterThan(0)
  })
})

describe('what a scavenger eats', () => {
  it('yields exactly 0 on every plant and on flesh, and more than the jaw on carrion', () => {
    const cfg = config()
    for (const value of Object.values(cfg.anatomy.mouthForms.scavenger)) {
      if (value !== cfg.predation.carcass.yields.scavenger) expect(value).toBe(0)
    }
    expect(cfg.predation.fleshYield.scavenger).toBe(0)
    expect(cfg.predation.carcass.yields.scavenger).toBeGreaterThan(cfg.predation.carcass.yields.jaw)
    // negative: the jaw does eat flesh
    expect(cfg.predation.fleshYield.jaw).toBeGreaterThan(0)
  })

  it('does not bite a plant: it is untouched and the gut stays empty', () => {
    const { organism, food, events } = eat(SCAVENGER, GRASS)
    expect(food.remaining).toBe(30)
    expect(organism.gut).toBe(0)
    expect(events.eventsThisTick().some((e) => e.type === 'resource-bitten')).toBe(false)
  })

  it('bites carrion, and takes more from it than a jaw does', () => {
    const cfg = config()
    const scavenger = eat(SCAVENGER, carrionOf(cfg))
    const jaw = eat(JAW, carrionOf(cfg))
    expect(scavenger.food.remaining).toBeLessThan(30)
    expect(scavenger.organism.gut).toBeGreaterThan(jaw.organism.gut)
    expect(jaw.organism.gut).toBeGreaterThan(0)
  })

  it('a mandible still does not bite carrion and still bites a plant (negative: only the scavenger is new)', () => {
    const cfg = config()
    expect(eat(MANDIBLE, carrionOf(cfg)).food.remaining).toBe(30)
    expect(eat(MANDIBLE, GRASS).food.remaining).toBeLessThan(30)
  })

  it('with the switch off the same gene is a jaw: it takes plants at 0 and carrion at the jaw yield', () => {
    const off = config({}, false)
    const carrion = eat(SCAVENGER, carrionOf(off), false)
    const jaw = eat(JAW, carrionOf(off), false)
    expect(carrion.organism.gut).toBeCloseTo(jaw.organism.gut, 9)
  })

  it('is not a creature biter: a body with only scavenger mouths never bites creatures', () => {
    const on = config()
    expect(bitesCreatures(creature(on, SCAVENGER).genome, on)).toBe(false)
    expect(bitesCreatures(creature(on, JAW).genome, on)).toBe(true)
    // with the switch off the very same gene is a jaw and does (negative)
    const off = config({}, false)
    expect(bitesCreatures(creature(off, SCAVENGER).genome, off)).toBe(true)
  })
})

describe('what a scavenger sees as food', () => {
  function see(mouth: number, kind: number, occluding: boolean): number | null {
    const cfg = config()
    const viewer = creature(cfg, mouth)
    const organisms = new OrganismStore()
    organisms.add(viewer)
    const resources = new ResourceStore()
    resources.add({ id: 7, x: viewer.x + 25, y: viewer.y, remaining: 30, kind })
    const index = new SpatialHash<ResourceState>(60, (r) => r)
    index.rebuild(resources.values())
    const buffer: PerceptionBuffer = new Map()
    new PerceptionSystem(
      cfg,
      organisms,
      index,
      buffer,
      undefined,
      null,
      undefined,
      undefined,
      occluding ? {} : undefined
    ).update(0)
    return buffer.get(1)?.resourceId ?? null
  }

  it.each([false, true])(
    'sees carrion and not a plant; a mandible sees a plant and not carrion (occluding search: %s)',
    (occluding) => {
      const carrion = carrionOf(config())
      expect(see(SCAVENGER, GRASS, occluding)).toBeNull()
      expect(see(SCAVENGER, carrion, occluding)).toBe(7)
      expect(see(MANDIBLE, GRASS, occluding)).toBe(7)
      expect(see(MANDIBLE, carrion, occluding)).toBeNull()
    }
  )
})

describe('the scavenger starter and its config', () => {
  const anatomy = resolveWorldConfig({}).anatomy
  const starter = anatomy.starters.find((s) => s.name === 'scavenger') as StartingBody

  it('is the grazer with a mouth in the scavenger band, never drawn as a base body', () => {
    const grazer = anatomy.starters.find((s) => s.name === 'grazer') as StartingBody
    expect(starter.pool).toBe(false)
    const mouth = starter.parts.find((p) => p.type === 'mouth')!
    expect(mouth.stats[2]).toBeGreaterThanOrEqual(0.95)
    expect(starter.parts.map((p) => p.type)).toEqual(grazer.parts.map((p) => p.type))
    expect(starter.outline).toEqual(grazer.outline)
    // negative: the grazer's own mouth is no scavenger
    const grazerMouth = grazer.parts.find((p) => p.type === 'mouth')!
    expect(mouthFormOf(grazerMouth.stats[2] ?? 0.5, 0.95)).toBe('sprout')
  })

  it('a founder group of it starts exactly round(20 x share) scavengers, the rest keep the base body', () => {
    for (const [share, expected] of [
      [0.1, 2],
      [0.2, 4],
      [0.4, 8]
    ] as const) {
      const world = World.create({
        seed: 5,
        config: {
          anatomy: {
            scavenger: { enabled: true },
            startingBody: {
              mode: 'archetypes',
              archetype: 'grazer',
              groups: [{ archetype: 'scavenger', share }]
            }
          }
        }
      })
      const forms = world.snapshot().organisms.map((o) => {
        const genome = world.genomeOf(o.id)
        return genome === undefined ? 'none' : (mouthsOf(genome, world.config)[0]?.form ?? 'none')
      })
      expect(forms.filter((f) => f === 'scavenger')).toHaveLength(expected)
      expect(forms.filter((f) => f === 'sprout')).toHaveLength(forms.length - expected)
    }
  })

  it('validation: the band must sit above the jaw and no higher than 1; the switch must be a boolean', () => {
    const bad = (anatomy: Record<string, unknown>) =>
      expect(() => resolveWorldConfig({ anatomy } as never)).toThrow(/scavenger/)
    bad({ scavenger: { from: 0.8 } })
    bad({ scavenger: { from: 1.01 } })
    bad({ scavenger: { enabled: 'yes' } })
    // negative: the default and an in-range value pass
    expect(() => resolveWorldConfig({ anatomy: { scavenger: { from: 0.9 } } })).not.toThrow()
    expect(resolveWorldConfig({}).anatomy.scavenger).toEqual({ enabled: false, from: 0.95 })
  })
})

describe('in a world', () => {
  it('a world with scavengers is the same stepped or run in chunks, and survives its start', () => {
    const extra: WorldConfigOverrides = {
      anatomy: {
        scavenger: { enabled: true },
        startingBody: { groups: [{ archetype: 'scavenger', share: 0.2 }] }
      }
    }
    const a = World.create({ seed: 7, config: extra })
    const b = World.create({ seed: 7, config: extra })
    for (let t = 0; t < 600; t++) a.step()
    b.run(250)
    b.run(350)
    expect(a.stateHash()).toBe(b.stateHash())
    expect(a.isExtinct).toBe(false)
  })

  it('founder scavengers never take energy from a plant (event scan)', () => {
    const world = World.create({
      seed: 3,
      config: {
        anatomy: {
          scavenger: { enabled: true },
          startingBody: { groups: [{ archetype: 'scavenger', share: 0.3 }] }
        }
      }
    })
    const carrion = world.config.ecology.resourceKinds.kinds.findIndex((k) => k.name === 'carrion')
    const pure = new Map<number, boolean>()
    let plantBites = 0
    for (let t = 0; t < 1500; t++) {
      world.step()
      for (const e of world.events.eventsThisTick()) {
        if (e.type !== 'resource-bitten') continue
        let only = pure.get(e.organismId)
        if (only === undefined) {
          const genome = world.genomeOf(e.organismId)
          const mouths = genome === undefined ? [] : mouthsOf(genome, world.config)
          only = mouths.length > 0 && mouths.every((m) => m.form === 'scavenger')
          pure.set(e.organismId, only)
        }
        if (!only) continue
        if (e.kind !== carrion) plantBites += 1
      }
    }
    expect(plantBites).toBe(0)
  }, 120_000)
})
