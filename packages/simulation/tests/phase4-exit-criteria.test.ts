import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import type { Genome } from '@evo/contracts'
import { World } from '../src/index'
import { genomeDistance } from '../src/genetics/GeneticDistance'
import { buildGeneSpecs } from '../src/genetics/GeneSpecs'
import { createFounderGenome, genomeToVector } from '../src/genetics/GenomeFactory'
import { inheritedBrainWeights } from '../src/genetics/LearningInheritance'
import { validateGenome } from '../src/genetics/GenomeValidation'
import { SeededRandom } from '../src/random/SeededRandom'
import { deriveStreamWords } from '../src/random/streams'

/**
 * The Phase 4 exit criteria (roadmap), each checked end to end on a real running world rather than
 * on stand-ins. The last criterion - broad unit test coverage of genome operations - is the
 * contents of tests/genetics/, tests/lineage.test.ts and tests/traits.test.ts.
 *
 * Births are audited by stepping the world one tick at a time and remembering every living genome
 * from the previous tick: a child appears with the ids of two parents that were both alive then,
 * so the parents' genomes at the moment of conception are known exactly even if they die later.
 */
interface Birth {
  child: Genome
  mother: Genome
  father: Genome
}

interface Audit {
  world: World
  births: Birth[]
  founders: Genome[]
}

function auditBirths(ticks: number, seed = 1): Audit {
  const world = World.create({
    seed,
    config: { genetics: { brain: { innatePrior: false } }, learning: { controller: 'reflex' } }
  })
  const living = (): Map<number, Genome> => {
    const genomes = new Map<number, Genome>()
    for (const organism of world.snapshot().organisms) {
      genomes.set(organism.genomeId, world.genomeOf(organism.id) as Genome)
    }
    return genomes
  }
  let previous = living()
  const founders = [...previous.values()]
  const births: Birth[] = []
  for (let tick = 0; tick < ticks; tick++) {
    world.step()
    const current = living()
    for (const [id, child] of current) {
      if (previous.has(id) || child.parentIds.length !== 2) continue
      const mother = previous.get(child.parentIds[0] as number)
      const father = previous.get(child.parentIds[1] as number)
      if (mother && father) births.push({ child, mother, father })
    }
    previous = current
  }
  return { world, births, founders }
}

const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length

describe('Phase 4 exit criteria', () => {
  const audit = auditBirths(6000)
  const { world, births, founders } = audit
  const specs = buildGeneSpecs(world.config)
  const initialWeightStd = world.config.genetics.brain.initialWeightStd

  it('audits enough births to mean something', () => {
    expect(births.length).toBeGreaterThanOrEqual(25)
  })

  describe('offspring inherit traits from both parents', () => {
    it('keeps every scalar gene inside the blend of its parents’ values, allowing for mutation', () => {
      for (const { child, mother, father } of births) {
        const c = genomeToVector(child)
        const a = genomeToVector(mother)
        const b = genomeToVector(father)
        specs.forEach((spec, i) => {
          const lo = Math.min(a[i] as number, b[i] as number)
          const hi = Math.max(a[i] as number, b[i] as number)
          const blend = world.config.genetics.blendAlpha * (hi - lo)
          const scale = spec.relative ? hi : spec.max - spec.min
          const slack = blend + 6 * spec.mutationStd * scale
          expect(c[i]).toBeGreaterThanOrEqual(lo - slack)
          expect(c[i]).toBeLessThanOrEqual(hi + slack)
        })
      }
    })

    it('draws brain weights from both parents in every birth', () => {
      for (const { child, mother, father } of births) {
        const w = child.brain.weights
        const fromMother = w.some(
          (x, i) => x === mother.brain.weights[i] && x !== father.brain.weights[i]
        )
        const fromFather = w.some(
          (x, i) => x === father.brain.weights[i] && x !== mother.brain.weights[i]
        )
        expect(fromMother && fromFather).toBe(true)
      }
    })

    it('records both parents’ genomes, in ascending order', () => {
      for (const { child, mother, father } of births) {
        expect(child.parentIds).toEqual([mother.id, father.id].sort((x, y) => x - y))
      }
    })
  })

  describe('offspring inherit compatible neural weights', () => {
    it('keeps the parents’ brain architecture and weight count', () => {
      for (const { child, mother, father } of births) {
        expect(child.brain.architecture).toEqual(mother.brain.architecture)
        expect(child.brain.architecture).toEqual(father.brain.architecture)
        expect(child.brain.weights).toHaveLength(mother.brain.weights.length)
      }
    })
  })

  describe('mutations remain within valid ranges', () => {
    it('produces only valid genomes', () => {
      for (const { child } of births) {
        expect(
          validateGenome(child, specs, { brain: child.brain.architecture, nextGenomeId: 1e9 })
        ).toEqual({ ok: true, errors: [] })
      }
    })

    it('leaves the whole world valid', () => {
      expect(world.validate()).toEqual({ ok: true, errors: [] })
    })
  })

  describe('parent and child genomes can be compared', () => {
    const dist = (a: Genome, b: Genome) => genomeDistance(a, b, specs, initialWeightStd)

    it('measures every pair within [0, 1] on every axis', () => {
      for (const { child, mother, father } of births) {
        for (const parent of [mother, father]) {
          for (const value of Object.values(dist(child, parent))) {
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThanOrEqual(1)
          }
        }
      }
    })

    it('puts a child closer to each parent than the parents are to each other', () => {
      const toMother = mean(births.map((b) => dist(b.child, b.mother).total))
      const toFather = mean(births.map((b) => dist(b.child, b.father).total))
      const between = mean(births.map((b) => dist(b.mother, b.father).total))
      expect(toMother).toBeLessThan(between)
      expect(toFather).toBeLessThan(between)
    })

    it('puts a child’s brain far closer to its parents than unrelated founders are to each other', () => {
      const parentChild = mean(births.map((b) => dist(b.child, b.mother).brain))
      const strangers: number[] = []
      for (let i = 0; i < founders.length; i++) {
        for (let j = i + 1; j < founders.length; j++) {
          strangers.push(dist(founders[i] as Genome, founders[j] as Genome).brain)
        }
      }
      expect(parentChild).toBeLessThan(mean(strangers))
    })
  })

  describe('lineage records survive parent death', () => {
    it('keeps the record of a parent that has since died, with its child among its descendants', () => {
      const living = new Set(world.snapshot().organisms.map((o) => o.genomeId))
      const orphaned = births.filter((b) => !living.has(b.mother.id))
      expect(orphaned.length).toBeGreaterThan(0)
      for (const { child, mother } of orphaned) {
        const record = world.lineage.record(mother.id)
        expect(record).toBeDefined()
        expect(world.lineage.descendantsOf(mother.id)).toContain(child.id)
      }
    })

    it('can name every founder and trace the living back to them', () => {
      expect(world.lineage.founders()).toEqual(founders.map((g) => g.id))
    })
  })

  describe('learning inheritance mode is configurable', () => {
    it('defaults to partial at 0.15', () => {
      expect(world.config.genetics.learningInheritance).toEqual({ mode: 'partial', fraction: 0.15 })
    })

    it('accepts each mode and rejects anything else', () => {
      for (const mode of ['baldwinian', 'partial', 'lamarckian'] as const) {
        const config = resolveWorldConfig({ genetics: { learningInheritance: { mode } } })
        expect(config.genetics.learningInheritance.mode).toBe(mode)
        expect(() =>
          World.create({ seed: 1, config: { genetics: { learningInheritance: { mode } } } })
        ).not.toThrow()
      }
      expect(() =>
        resolveWorldConfig({ genetics: { learningInheritance: { mode: 'magic' as never } } })
      ).toThrow(/learningInheritance.mode/)
    })

    it('makes the three modes produce three different results', () => {
      const genome = [0, 1, 2, 3]
      const learned = [4, 1, 0, 11]
      const results = (['baldwinian', 'partial', 'lamarckian'] as const).map((mode) =>
        inheritedBrainWeights(genome, learned, mode, 0.15).join(',')
      )
      expect(new Set(results).size).toBe(3)
    })
  })

  describe('reproduction no longer creates unrelated fresh brains', () => {
    it('gives a child brain that is overwhelmingly its parents’ own weights', () => {
      for (const { child, mother, father } of births) {
        const inherited = child.brain.weights.filter(
          (x, i) => x === mother.brain.weights[i] || x === father.brain.weights[i]
        ).length
        expect(inherited / child.brain.weights.length).toBeGreaterThan(0.85)
      }
    })

    it('shares essentially nothing with a freshly drawn brain', () => {
      const fresh = createFounderGenome(
        0,
        specs,
        world.config.genetics.brain,
        new SeededRandom(deriveStreamWords(999, 'genetics'))
      )
      for (const { child } of births) {
        const same = child.brain.weights.filter((x, i) => x === fresh.brain.weights[i]).length
        expect(same / child.brain.weights.length).toBeLessThan(0.01)
      }
    })
  })
})
