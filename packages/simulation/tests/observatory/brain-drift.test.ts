import { describe, expect, it } from 'vitest'
import { OBSERVATION_LABELS, OBSERVATION_SIZE } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import { architectureOf } from '../../src/genetics/GenomeFactory'
import { innatePriorWeights } from '../../src/learning/InnatePrior'
import { brainLayoutOf } from '../../src/learning/BrainLayout'
import {
  INPUT_GROUPS,
  brainDiversity,
  groupUsage,
  inputGroupOf,
  learnedGap,
  priorDistance
} from '../../src/observatory/brainDrift'

const config = resolveWorldConfig()
const architecture = architectureOf(config.genetics.brain)
const layout = brainLayoutOf(architecture)
const prior = innatePriorWeights(architecture)

describe('input groups', () => {
  it('refuses a slot that belongs to no group instead of calling it a threat', () => {
    expect(() => inputGroupOf(OBSERVATION_SIZE)).toThrow(RangeError)
  })

  it('place every observation slot in a group, in step with the labels', () => {
    expect(OBSERVATION_SIZE).toBe(52)
    for (let i = 0; i < OBSERVATION_SIZE; i++) {
      expect(INPUT_GROUPS).toContain(inputGroupOf(i))
    }
    const label = (i: number): string => OBSERVATION_LABELS[i] as string
    for (let i = 0; i < OBSERVATION_SIZE; i++) {
      const name = label(i)
      const group = inputGroupOf(i)
      if (name.startsWith('food')) expect(group).toBe('food')
      if (name.startsWith('peer')) expect(group).toBe('peer')
      if (name.startsWith('hazard')) expect(group).toBe('hazard')
      if (name.startsWith('mate')) expect(group).toBe('mate')
      if (name.startsWith('home')) expect(group).toBe('home')
      if (name.startsWith('prey')) expect(group).toBe('prey')
      if (name.startsWith('threat')) expect(group).toBe('threat')
      if (name.startsWith('recall')) expect(group).toBe('recall')
      if (name.startsWith('season')) expect(group).toBe('season')
      if (name.startsWith('previousAction') || name === 'energy') expect(group).toBe('self')
    }
  })
})

describe('priorDistance', () => {
  it('is 0 at the prior and grows with the change (negative: not 0 elsewhere)', () => {
    expect(priorDistance(prior, prior)).toBe(0)
    const nudged = prior.map((w, i) => (i === 3 ? w + 1 : w))
    const shoved = prior.map((w, i) => (i === 3 ? w + 4 : w))
    expect(priorDistance(nudged, prior)).toBeGreaterThan(0)
    expect(priorDistance(shoved, prior)).toBeGreaterThan(priorDistance(nudged, prior))
  })

  it('a zero prior reads 0 rather than dividing by zero', () => {
    expect(priorDistance([1, 2], [0, 0])).toBe(0)
  })
})

describe('groupUsage', () => {
  it('moves only in the group whose inputs were changed', () => {
    const base = groupUsage(prior, layout)
    const weights = prior.slice()
    const preyStart = 40
    for (let h = 0; h < architecture.hiddenSize; h++) {
      for (let i = preyStart; i < preyStart + 4; i++) {
        weights[layout.inputToHidden.offset + h * architecture.inputSize + i] = 2
      }
    }
    const after = groupUsage(weights, layout)
    expect(after.prey).toBeCloseTo(2, 12)
    for (const group of INPUT_GROUPS) {
      if (group !== 'prey') expect(after[group]).toBe(base[group])
    }
  })

  it('the prior wires the new senses (prey and threat are above zero from tick 0)', () => {
    const usage = groupUsage(prior, layout)
    expect(usage.prey).toBeGreaterThan(0)
    expect(usage.threat).toBeGreaterThan(0)
    expect(usage.food).toBeGreaterThan(0)
  })
})

describe('learnedGap', () => {
  it('is 0 for a creature that has learned nothing and positive after it has', () => {
    const born = [0.5, -0.5, 1]
    expect(learnedGap(born, born)).toBe(0)
    expect(learnedGap(born, [0.6, -0.5, 1])).toBeGreaterThan(0)
    expect(learnedGap([], [])).toBe(0)
  })
})

describe('brainDiversity', () => {
  it('is 0 for identical brains, positive for different ones, and never above 1', () => {
    const a = prior.slice()
    const b = prior.map((w) => w + 0.1)
    const wild = prior.map((w, i) => w + (i % 2 === 0 ? 50 : -50))
    expect(brainDiversity([a, a, a], 0.1)).toBe(0)
    expect(brainDiversity([a, b], 0.1)).toBeGreaterThan(0)
    expect(brainDiversity([a, wild], 0.1)).toBe(1)
    expect(brainDiversity([a], 0.1)).toBe(0)
  })
})
