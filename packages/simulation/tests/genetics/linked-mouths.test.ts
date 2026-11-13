import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import {
  BODY_SLOT_COUNT,
  PART_TYPES,
  SLOT_FIELDS,
  mouthFormOf,
  slotGeneIndex
} from '@evo/contracts'
import { buildBodySpecs, founderBodyVector } from '../../src/genetics/BodyGenes'
import { genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { crossoverVector, GenomeRecombiner } from '../../src/genetics/Recombination'
import { linkedMouthGroups } from '../../src/genetics/SlotLinkage'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'
import { fixture, founder, geneticsStream, sameState } from './helpers'

// Linked mouth slots (ADR 0023 step four): a slot that holds a mouth in either parent is inherited
// whole from one parent, so a mouth breeds true instead of blending its form with the mate's.

const MOUTH = PART_TYPES.indexOf('mouth')
const STOMACH = PART_TYPES.indexOf('stomach')
const anatomy = resolveWorldConfig().anatomy
const specs = buildBodySpecs(anatomy)
const base = founderBodyVector(anatomy)
const anatomyStream = (seed: number): SeededRandom =>
  new SeededRandom(deriveStreamWords(seed, 'anatomy'))

/** A copy of the founder body with `slot` holding the given part. */
function withPart(
  slot: number,
  type: number,
  s2: number,
  extra: Partial<Record<(typeof SLOT_FIELDS)[number], number>> = {}
): number[] {
  const body = [...base]
  body[slotGeneIndex(slot, 'present')] = 1
  body[slotGeneIndex(slot, 'type')] = type
  body[slotGeneIndex(slot, 's2')] = s2
  for (const [field, value] of Object.entries(extra)) {
    body[slotGeneIndex(slot, field as (typeof SLOT_FIELDS)[number])] = value
  }
  return body
}

const slotOf = (body: readonly number[], slot: number): number[] =>
  body.slice(slotGeneIndex(slot, 'present'), slotGeneIndex(slot, 'present') + SLOT_FIELDS.length)

/** The founder's own mouth slot, so the tests do not hard-code which slot it is. */
const founderMouthSlot = base.findIndex(
  (_, i) =>
    i % SLOT_FIELDS.length === 0 && base[i] === 1 && base[i + SLOT_FIELDS.indexOf('type')] === MOUTH
)
const MOUTH_SLOT = founderMouthSlot / SLOT_FIELDS.length

describe('which slots are linked', () => {
  it('is the slot that holds a present mouth in either parent, in slot order', () => {
    const groups = linkedMouthGroups(base, base)
    expect(groups).toEqual([
      { start: slotGeneIndex(MOUTH_SLOT, 'present'), length: SLOT_FIELDS.length }
    ])
    // A second mouth in the father's slot 9 adds that slot too, after the first.
    const father = withPart(9, MOUTH, 0.9)
    const both = linkedMouthGroups(base, father)
    expect(both.map((g) => g.start)).toEqual([
      slotGeneIndex(MOUTH_SLOT, 'present'),
      slotGeneIndex(9, 'present')
    ])
  })

  it('is empty when neither parent has a mouth, and ignores absent or other parts', () => {
    const noMouth = [...base]
    noMouth[slotGeneIndex(MOUTH_SLOT, 'present')] = 0
    expect(linkedMouthGroups(noMouth, noMouth)).toEqual([])
    // A stomach in a slot is not a mouth; an absent slot that still carries type mouth is not either.
    const stomach = [...noMouth]
    stomach[slotGeneIndex(10, 'present')] = 1
    stomach[slotGeneIndex(10, 'type')] = STOMACH
    expect(linkedMouthGroups(noMouth, stomach)).toEqual([])
    const ghost = [...noMouth]
    ghost[slotGeneIndex(10, 'type')] = MOUTH // present stays 0
    expect(linkedMouthGroups(ghost, ghost)).toEqual([])
  })

  it('covers every slot index without overflowing the body table', () => {
    for (let slot = 0; slot < BODY_SLOT_COUNT; slot++) {
      const body = withPart(slot, MOUTH, 0.9)
      const [group] = linkedMouthGroups(body, body)
      expect(group).toBeDefined()
      expect((group?.start as number) + SLOT_FIELDS.length).toBeLessThanOrEqual(specs.length)
    }
  })
})

describe('crossover with linked mouths', () => {
  const jaw = withPart(MOUTH_SLOT, MOUTH, 0.9, { size: 0.8, offset: 0.3 })
  const grazer = withPart(MOUTH_SLOT, MOUTH, 0.1, { size: 0.4, offset: 0.7 })
  const groups = linkedMouthGroups(jaw, grazer)

  it('hands the whole mouth slot to the child from exactly one parent', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 200; seed++) {
      const child = crossoverVector(jaw, grazer, specs, anatomyStream(seed), 0.25, groups)
      const slot = slotOf(child, MOUTH_SLOT)
      const isJaw = JSON.stringify(slot) === JSON.stringify(slotOf(jaw, MOUTH_SLOT))
      const isGrazer = JSON.stringify(slot) === JSON.stringify(slotOf(grazer, MOUTH_SLOT))
      expect(isJaw || isGrazer).toBe(true)
      seen.add(isJaw ? 'jaw' : 'grazer')
    }
    expect([...seen].sort()).toEqual(['grazer', 'jaw'])
  })

  it('gives each parent about half of the children', () => {
    let jaws = 0
    const n = 2000
    for (let seed = 0; seed < n; seed++) {
      const child = crossoverVector(jaw, grazer, specs, anatomyStream(seed), 0.25, groups)
      if (mouthFormOf(child[slotGeneIndex(MOUTH_SLOT, 's2')] as number) === 'jaw') jaws++
    }
    expect(jaws / n).toBeGreaterThan(0.45)
    expect(jaws / n).toBeLessThan(0.55)
  })

  it('a jaw bred with a jaw is a jaw, always', () => {
    const jaw2 = withPart(MOUTH_SLOT, MOUTH, 0.95, { size: 0.7 })
    const g = linkedMouthGroups(jaw, jaw2)
    for (let seed = 0; seed < 300; seed++) {
      const child = crossoverVector(jaw, jaw2, specs, anatomyStream(seed), 0.25, g)
      expect(mouthFormOf(child[slotGeneIndex(MOUTH_SLOT, 's2')] as number)).toBe('jaw')
    }
  })

  it('negative: without linkage the form blends and the jaw survives only about a third of the time', () => {
    let jaws = 0
    let intermediate = 0
    const n = 2000
    for (let seed = 0; seed < n; seed++) {
      const child = crossoverVector(jaw, grazer, specs, anatomyStream(seed), 0.25)
      const s2 = child[slotGeneIndex(MOUTH_SLOT, 's2')] as number
      if (mouthFormOf(s2) === 'jaw') jaws++
      if (s2 !== 0.9 && s2 !== 0.1) intermediate++
    }
    expect(jaws / n).toBeLessThan(0.35)
    expect(intermediate / n).toBeGreaterThan(0.9)
  })

  it('negative: a slot without a mouth in either parent still blends', () => {
    const flagellumSlot = base.findIndex(
      (_, i) =>
        i % SLOT_FIELDS.length === 0 &&
        base[i] === 1 &&
        base[i + SLOT_FIELDS.indexOf('type')] === PART_TYPES.indexOf('flagellum')
    )
    const slot = flagellumSlot / SLOT_FIELDS.length
    const a = [...jaw]
    const b = [...grazer]
    a[slotGeneIndex(slot, 'size')] = 0.2
    b[slotGeneIndex(slot, 'size')] = 0.8
    let blended = 0
    for (let seed = 0; seed < 200; seed++) {
      const child = crossoverVector(a, b, specs, anatomyStream(seed), 0.25, groups)
      const size = child[slotGeneIndex(slot, 'size')] as number
      if (size !== 0.2 && size !== 0.8) blended++
    }
    expect(blended).toBeGreaterThan(190)
  })

  it('a mouth in different slots in the two parents gives each slot from one parent', () => {
    const left = withPart(3, MOUTH, 0.9, { size: 0.9 })
    const right = withPart(7, MOUTH, 0.2, { size: 0.3 })
    const both = linkedMouthGroups(left, right)
    expect(both.map((g) => g.start)).toContain(slotGeneIndex(3, 'present'))
    expect(both.map((g) => g.start)).toContain(slotGeneIndex(7, 'present'))
    for (let seed = 0; seed < 100; seed++) {
      const child = crossoverVector(left, right, specs, anatomyStream(seed), 0.25, both)
      for (const slot of [3, 7]) {
        const got = JSON.stringify(slotOf(child, slot))
        expect([left, right].map((p) => JSON.stringify(slotOf(p, slot)))).toContain(got)
      }
    }
  })

  it('draws exactly as before: the stream ends in the same state with or without linkage', () => {
    for (let seed = 0; seed < 20; seed++) {
      const linked = anatomyStream(seed)
      const plain = anatomyStream(seed)
      crossoverVector(jaw, grazer, specs, linked, 0.25, groups)
      crossoverVector(jaw, grazer, specs, plain, 0.25)
      expect(sameState(linked, plain)).toBe(true)
    }
  })

  it('leaves every gene outside the linked slots exactly as the plain crossover makes it', () => {
    const start = slotGeneIndex(MOUTH_SLOT, 'present')
    for (let seed = 0; seed < 50; seed++) {
      const linked = crossoverVector(jaw, grazer, specs, anatomyStream(seed), 0.25, groups)
      const plain = crossoverVector(jaw, grazer, specs, anatomyStream(seed), 0.25)
      linked.forEach((value, i) => {
        if (i >= start && i < start + SLOT_FIELDS.length) return
        expect(value).toBe(plain[i])
      })
    }
  })
})

describe('the recombiner honours genetics.linkedMouths', () => {
  function children(linkedMouths: boolean) {
    const f = fixture({ genetics: { mutationRateScale: 0, linkedMouths } })
    const motherBody = withPart(MOUTH_SLOT, MOUTH, 0.9)
    const fatherBody = withPart(MOUTH_SLOT, MOUTH, 0.1)
    const part = (id: number, body: number[]) => {
      const g = founder(f, id, id)
      return genomeFromParts({
        id: g.id,
        parentIds: g.parentIds,
        vector: genomeToVector(g),
        architecture: g.brain.architecture,
        weights: g.brain.weights,
        body
      })
    }
    let next = 100
    const recombiner = new GenomeRecombiner(f.specs, f.config.genetics, () => next++, {
      specs: buildBodySpecs(f.config.anatomy),
      random: anatomyStream(7),
      enabled: true
    })
    const mother = part(1, motherBody)
    const father = part(2, fatherBody)
    const out: number[] = []
    for (let seed = 0; seed < 300; seed++) {
      const child = recombiner.combine(mother, father, geneticsStream(seed))
      out.push(child.body.genes[slotGeneIndex(MOUTH_SLOT, 's2')] as number)
    }
    return out
  }

  it('on: every child has one parent mouth form value, mutation off', () => {
    const values = children(true)
    for (const value of values) expect([0.9, 0.1]).toContain(value)
  })

  it('off (negative): children get blended values', () => {
    const values = children(false)
    expect(values.some((v) => v !== 0.9 && v !== 0.1)).toBe(true)
  })
})
