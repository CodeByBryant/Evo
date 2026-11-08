import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import {
  BODY_GENE_COUNT,
  OUTLINE_COUNT_INDEX,
  BODY_GENE_DEFINITIONS,
  BODY_SLOT_COUNT,
  PART_TYPES,
  STAT_FIELDS,
  slotGeneIndex,
  visualGeneIndex
} from '@evo/contracts'
import type { WorldConfigOverrides } from '@evo/contracts'
import { buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeDistance, weightedDistance } from '../../src/genetics/GeneticDistance'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import {
  repairGenome,
  validateGenome,
  validateGeneValues
} from '../../src/genetics/GenomeValidation'
import { GenomeRecombiner } from '../../src/genetics/Recombination'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { architectureOf } from '../../src/genetics/GenomeFactory'
import { fixture, founder, geneticsStream, sameState } from './helpers'

const anatomyStream = (seed: number): SeededRandom =>
  new SeededRandom(deriveStreamWords(seed, 'anatomy'))

function setup(overrides?: WorldConfigOverrides) {
  const f = fixture(overrides)
  const bodySpecs = buildBodySpecs(f.config.anatomy)
  const body = founderBodyVector(f.config.anatomy)
  const mother = genomeFromParts({ ...parts(founder(f, 10, 1)), body })
  const father = genomeFromParts({ ...parts(founder(f, 11, 2)), body })
  let nextId = 100
  const recombiner = (random: SeededRandom, enabled: boolean, withBody = true) =>
    new GenomeRecombiner(
      f.specs,
      f.config.genetics,
      () => nextId++,
      withBody ? { specs: bodySpecs, random, enabled } : undefined
    )
  return { f, bodySpecs, body, mother, father, recombiner }
}

function parts(genome: ReturnType<typeof founder>) {
  return {
    id: genome.id,
    parentIds: genome.parentIds,
    vector: genomeToVector(genome),
    architecture: genome.brain.architecture,
    weights: genome.brain.weights
  }
}

describe('the founder body', () => {
  const config = resolveWorldConfig().anatomy
  const vector = founderBodyVector(config)

  it('has one value per body gene and satisfies its own gene table', () => {
    expect(vector).toHaveLength(BODY_GENE_COUNT)
    expect(validateGeneValues(vector, buildBodySpecs(config))).toEqual([])
  })

  it('puts the founder parts in the first slots, empty latent slots after, and the look at the end', () => {
    config.founder.forEach((part, slot) => {
      expect(vector[slotGeneIndex(slot, 'present')]).toBe(1)
      expect(PART_TYPES[vector[slotGeneIndex(slot, 'type')] as number]).toBe(part.type)
      expect(vector[slotGeneIndex(slot, 'size')]).toBe(part.size)
      expect(vector[slotGeneIndex(slot, 'angle')]).toBe(part.angle)
      expect(vector[slotGeneIndex(slot, 'offset')]).toBe(part.offset)
      expect(vector[slotGeneIndex(slot, 'orientation')]).toBe(part.orientation)
      expect(vector[slotGeneIndex(slot, 'parent')]).toBe(part.parent)
      expect(vector[slotGeneIndex(slot, 'integrity')]).toBe(part.integrity)
      for (const [i, field] of STAT_FIELDS.entries()) {
        expect(vector[slotGeneIndex(slot, field)]).toBe(part.stats[i] ?? 0.5)
      }
    })
    for (let slot = config.founder.length; slot < BODY_SLOT_COUNT; slot++) {
      expect(vector[slotGeneIndex(slot, 'present')]).toBe(0)
    }
    expect(vector[visualGeneIndex('pattern')]).toBe(config.founderLook.pattern)
    expect(vector[OUTLINE_COUNT_INDEX]).toBe(config.founderOutline.count)
    expect(vector[visualGeneIndex('accentHue')]).toBe(config.founderLook.accentHue)
  })

  it('follows an overridden founder', () => {
    const custom = resolveWorldConfig({
      anatomy: {
        founder: [
          {
            type: 'armor',
            parent: 0,
            size: 0.9,
            angle: 1,
            offset: 0.3,
            orientation: 2,
            integrity: 0.7,
            stats: [0.1, 0.9]
          }
        ]
      }
    }).anatomy
    const v = founderBodyVector(custom)
    expect(PART_TYPES[v[slotGeneIndex(0, 'type')] as number]).toBe('armor')
    expect(v[slotGeneIndex(0, 'integrity')]).toBe(0.7)
    // missing stats are the middle of their range
    expect([
      v[slotGeneIndex(0, 's0')],
      v[slotGeneIndex(0, 's1')],
      v[slotGeneIndex(0, 's2')]
    ]).toEqual([0.1, 0.9, 0.5])
    expect(v[slotGeneIndex(1, 'present')]).toBe(0)
  })
})

describe('the body gene table', () => {
  const config = resolveWorldConfig().anatomy
  const specs = buildBodySpecs(config)

  it('mirrors the contract definitions in order', () => {
    expect(specs.map((s) => s.path)).toEqual(BODY_GENE_DEFINITIONS.map((d) => d.path))
    specs.forEach((spec, i) => {
      expect(spec.kind).toBe(BODY_GENE_DEFINITIONS[i]?.kind)
      expect(spec.baseline).toBe(founderBodyVector(config)[i])
    })
  })

  it('assigns mutation rates by kind of gene', () => {
    const rate = (index: number) => specs[index]?.mutationRate
    expect(rate(slotGeneIndex(3, 'present'))).toBe(config.mutation.presenceRate)
    expect(rate(slotGeneIndex(3, 'type'))).toBe(config.mutation.typeRate)
    expect(rate(slotGeneIndex(3, 'parent'))).toBe(config.mutation.parentRate)
    expect(rate(slotGeneIndex(3, 'integrity'))).toBe(config.mutation.continuousRate)
    expect(rate(slotGeneIndex(3, 's4'))).toBe(config.mutation.continuousRate)
    expect(rate(slotGeneIndex(3, 'size'))).toBe(config.mutation.continuousRate)
    expect(rate(slotGeneIndex(3, 'orientation'))).toBe(config.mutation.continuousRate)
    expect(rate(visualGeneIndex('pattern'))).toBe(config.mutation.visualRate)
  })
})

describe('recombining bodies', () => {
  it('with anatomy off, the child keeps its mother body and nothing is drawn from the anatomy stream', () => {
    const { mother, father, recombiner } = setup()
    const anatomy = anatomyStream(5)
    const untouched = anatomyStream(5)
    const child = recombiner(anatomy, false).combine(mother, father, geneticsStream(9))
    expect(child.body.genes).toEqual(mother.body.genes)
    expect(sameState(anatomy, untouched)).toBe(true)
  })

  it('the legacy genes are drawn exactly as before whether or not bodies evolve', () => {
    const { mother, father, recombiner } = setup({ genetics: { mutationRateScale: 3 } })
    const results = [
      recombiner(anatomyStream(1), false, false),
      recombiner(anatomyStream(1), false),
      recombiner(anatomyStream(1), true)
    ].map((r) => {
      const genetics = geneticsStream(9)
      const child = r.combine(mother, father, genetics)
      return { vector: genomeToVector(child), weights: [...child.brain.weights], genetics }
    })
    expect(results[1]?.vector).toEqual(results[0]?.vector)
    expect(results[2]?.vector).toEqual(results[0]?.vector)
    expect(results[2]?.weights).toEqual(results[0]?.weights)
    // the genetics stream advanced by exactly the same number of draws in all three
    expect(sameState(results[0]!.genetics, results[1]!.genetics)).toBe(true)
    expect(sameState(results[0]!.genetics, results[2]!.genetics)).toBe(true)
  })

  it('with anatomy on, draws only from the anatomy stream and gives a valid, deterministic child', () => {
    const { bodySpecs, mother, father, recombiner } = setup({
      genetics: { mutationRateScale: 20 }
    })
    const a1 = anatomyStream(3)
    const a2 = anatomyStream(3)
    const c1 = recombiner(a1, true).combine(mother, father, geneticsStream(9))
    const c2 = recombiner(a2, true).combine(mother, father, geneticsStream(9))
    expect(c1.body.genes).toEqual(c2.body.genes)
    expect(validateGeneValues(c1.body.genes, bodySpecs)).toEqual([])
    expect(sameState(a1, anatomyStream(3))).toBe(false)
  })

  it('identical parents with mutation off give an identical body', () => {
    const { mother, recombiner } = setup({ genetics: { mutationRateScale: 0 } })
    const child = recombiner(anatomyStream(4), true).combine(mother, mother, geneticsStream(1))
    expect(child.body.genes).toEqual(mother.body.genes)
  })

  it('with high rates, bodies change structurally while staying valid', () => {
    const { bodySpecs, mother, father, recombiner } = setup({
      anatomy: {
        mutation: { presenceRate: 1, typeRate: 1, continuousRate: 1, visualRate: 1, outlineRate: 1 }
      },
      genetics: { mutationRateScale: 1 }
    })
    let flips = 0
    let typeSteps = 0
    for (let seed = 0; seed < 40; seed++) {
      const child = recombiner(anatomyStream(seed), true).combine(
        mother,
        father,
        geneticsStream(seed)
      )
      expect(validateGeneValues(child.body.genes, bodySpecs)).toEqual([])
      for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
        if (
          child.body.genes[slotGeneIndex(slot, 'present')] !==
          mother.body.genes[slotGeneIndex(slot, 'present')]
        )
          flips++
        const dt = Math.abs(
          (child.body.genes[slotGeneIndex(slot, 'type')] as number) -
            (mother.body.genes[slotGeneIndex(slot, 'type')] as number)
        )
        if (dt === 1) typeSteps++
        expect(dt).toBeLessThanOrEqual(1)
      }
    }
    expect(flips).toBeGreaterThan(0)
    expect(typeSteps).toBeGreaterThan(0)
  })

  it('keeps types inside the vocabulary and the outline valid over many generations', () => {
    const { bodySpecs, mother, father, recombiner } = setup({
      anatomy: {
        mutation: { presenceRate: 1, typeRate: 1, continuousRate: 1, visualRate: 1, outlineRate: 1 }
      }
    })
    let a = mother
    for (let generation = 0; generation < 60; generation++) {
      a = recombiner(anatomyStream(generation), true).combine(a, father, geneticsStream(generation))
      const count = a.body.genes[OUTLINE_COUNT_INDEX] as number
      expect(Number.isInteger(count) && count >= 5 && count <= 16).toBe(true)
      expect(validateGeneValues(a.body.genes, bodySpecs)).toEqual([])
    }
  })
})

describe('body distance and validation', () => {
  it('is zero for identical bodies and positive for different ones, and does not touch the total', () => {
    const { f, bodySpecs, mother } = setup()
    const std = f.config.genetics.brain.initialWeightStd
    const changed = genomeFromParts({
      ...parts(mother),
      body: mother.body.genes.map((g, i) => (i === slotGeneIndex(0, 'size') ? 0.9 : g))
    })
    const same = genomeDistance(mother, mother, f.specs, std, bodySpecs)
    const different = genomeDistance(mother, changed, f.specs, std, bodySpecs)
    expect(same.body).toBe(0)
    expect(different.body).toBeGreaterThan(0)
    expect(different.total).toBe(same.total)
    expect(genomeDistance(mother, changed, f.specs, std).body).toBe(0) // no table: not compared
  })

  it('counts the body in the weighted distance only when its weight is positive', () => {
    const { f, bodySpecs, mother } = setup()
    const std = f.config.genetics.brain.initialWeightStd
    const changed = genomeFromParts({
      ...parts(mother),
      body: mother.body.genes.map((g, i) => (i === slotGeneIndex(0, 'size') ? 0.9 : g))
    })
    const distance = genomeDistance(mother, changed, f.specs, std, bodySpecs)
    const off = f.config.species.distanceWeights
    expect(off.body).toBe(0)
    expect(weightedDistance(distance, off)).toBe(0)
    expect(weightedDistance(distance, { ...off, body: 1 })).toBeGreaterThan(0)
  })

  it('validates body genes: length, range, integer and boolean rules', () => {
    const { f, bodySpecs, mother } = setup()
    const context = { brain: architectureOf(f.config.genetics.brain), body: bodySpecs }
    expect(validateGenome(mother, f.specs, context)).toEqual({ ok: true, errors: [] })
    const bad = (mutate: (genes: number[]) => void) => {
      const genes = [...mother.body.genes]
      mutate(genes)
      return validateGenome(genomeFromParts({ ...parts(mother), body: genes }), f.specs, context)
        .errors
    }
    expect(bad((g) => (g[slotGeneIndex(2, 'size')] = 5)).join()).toContain('body.slot2.size')
    expect(bad((g) => (g[slotGeneIndex(1, 'type')] = 2.5)).join()).toContain('body.slot1.type')
    expect(bad((g) => (g[slotGeneIndex(1, 'type')] = 11)).join()).toContain('body.slot1.type')
    expect(bad((g) => (g[slotGeneIndex(4, 'present')] = 0.5)).join()).toContain(
      'body.slot4.present must be 0 or 1'
    )
    expect(bad((g) => (g[slotGeneIndex(4, 'angle')] = 7)).join()).toContain('body.slot4.angle')
    expect(bad((g) => (g[OUTLINE_COUNT_INDEX] = 17)).join()).toContain('body.outline.count')
    expect(bad((g) => (g[3] = Number.NaN)).join()).toContain('is not a finite number')
    expect(bad((g) => g.pop()).join()).toContain(`body has ${BODY_GENE_COUNT - 1} genes`)
  })

  it('repairs a broken body when given the table, and leaves it alone otherwise', () => {
    const { f, bodySpecs, mother } = setup()
    const broken = genomeFromParts({
      ...parts(mother),
      body: mother.body.genes.map((g, i) => (i === slotGeneIndex(2, 'size') ? 5 : g))
    })
    const repaired = repairGenome(broken, f.specs, bodySpecs)
    expect(validateGeneValues(repaired.body.genes, bodySpecs)).toEqual([])
    expect(repairGenome(broken, f.specs).body.genes).toEqual(broken.body.genes)
  })

  it('freezes the body so accidental mutation throws', () => {
    const { mother } = setup()
    expect(Object.isFrozen(mother.body)).toBe(true)
    expect(Object.isFrozen(mother.body.genes)).toBe(true)
    expect(() => {
      ;(mother.body.genes as number[])[0] = 1
    }).toThrow()
  })
})
