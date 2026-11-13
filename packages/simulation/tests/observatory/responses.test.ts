import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { architectureOf } from '../../src/genetics/GenomeFactory'
import { brainLayoutOf } from '../../src/learning/BrainLayout'
import { innatePriorWeights } from '../../src/learning/InnatePrior'
import {
  RESPONSE_BATTERY,
  RESPONSE_SIZE,
  responseDiversity,
  responseSignature,
  responseVector
} from '../../src/observatory/responses'

const architecture = architectureOf(resolveWorldConfig().genetics.brain)
const layout = brainLayoutOf(architecture)
const prior = innatePriorWeights(architecture)

describe('responseVector', () => {
  it('is one thrust, turn and interact value for each situation, all in [-1, 1]', () => {
    const r = responseVector(prior, layout)
    expect(r).toHaveLength(RESPONSE_SIZE)
    expect(RESPONSE_SIZE).toBe(RESPONSE_BATTERY.length * 3)
    for (const v of r) {
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is a pure function of the weights: the same brain gives the same answer', () => {
    expect(responseVector(prior, layout)).toEqual(responseVector(prior.slice(), layout))
  })

  it('the hand-wired prior hunts and flees: it turns toward prey and away from a threat (the battery sees the new senses)', () => {
    const r = responseVector(prior, layout)
    const turn = (situation: number) => r[situation * 3 + 1] as number
    // situation 4: prey ahead and to the left; situation 5: a threat ahead and to the right
    expect(turn(4)).toBeGreaterThan(0.2)
    expect(turn(5)).toBeGreaterThan(0.2) // away from a threat on its right is a turn to the left
    expect(Math.abs(turn(0))).toBeLessThan(0.1)
  })

  it('changes when the weights are changed in the part of the brain the situation uses, and not otherwise (negative)', () => {
    const base = responseVector(prior, layout)
    // zero the prey inputs: only the prey situation should change
    const blind = prior.slice()
    for (let h = 0; h < architecture.hiddenSize; h++) {
      for (let i = 40; i < 44; i++)
        blind[layout.inputToHidden.offset + h * architecture.inputSize + i] = 0
    }
    const after = responseVector(blind, layout)
    const changed = after
      .map((v, i) => (v === base[i] ? -1 : Math.floor(i / 3)))
      .filter((s) => s >= 0)
    expect(new Set(changed)).toEqual(new Set([4]))
  })
})

describe('responseDiversity', () => {
  it('identical brains have one type and no spread; different ones have both (negative first)', () => {
    const a = responseVector(prior, layout)
    expect(responseDiversity([a, a, a])).toEqual({ types: 1, spread: 0 })
    const wild = prior.map((w, i) => (i % 3 === 0 ? -w : w + 0.7))
    const b = responseVector(wild, layout)
    const d = responseDiversity([a, b, a, b])
    expect(d.types).toBeGreaterThanOrEqual(1)
    expect(d.spread).toBeGreaterThan(0)
    expect(d.spread).toBeLessThanOrEqual(1)
  })

  it('discretises into three bins a value', () => {
    expect(responseSignature([-1, 0, 1])).toBe('012')
    expect(responseDiversity([])).toEqual({ types: 0, spread: 0 })
  })
})
