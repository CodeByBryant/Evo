import { describe, expect, it } from 'vitest'
import { ACTION_LABELS, ACTION_SIZE, OBSERVATION_LABELS, OBSERVATION_SIZE } from '@evo/contracts'
import { resolveWorldConfig } from '@evo/config'
import { buildGeneSpecs } from '../../src/genetics/GeneSpecs'
import {
  architectureOf,
  brainBlockLengths,
  brainWeightCount,
  createFounderGenome
} from '../../src/genetics/GenomeFactory'
import { forwardHidden, readOutput, readValue, softsign } from '../../src/learning/Brain'
import { brainLayoutOf } from '../../src/learning/BrainLayout'
import { brainStateProblems, createBrainState } from '../../src/learning/BrainState'
import { explorationSigma } from '../../src/learning/Exploration'
import { innatePriorWeights } from '../../src/learning/InnatePrior'
import { createLearner } from '../../src/learning/LearningAlgorithm'
import { buildObservation } from '../../src/learning/ObservationBuilder'
import type { ObservationInput } from '../../src/learning/ObservationBuilder'
import { computeReward } from '../../src/learning/RewardModel'
import { cos, sin } from '../../src/math/trig'
import { SeededRandom } from '../../src/random/SeededRandom'
import { deriveStreamWords } from '../../src/random/streams'

const config = resolveWorldConfig()
const architecture = architectureOf(config.genetics.brain)
const layout = brainLayoutOf(architecture)

const base: ObservationInput = {
  energy: 0.5,
  age: 0.25,
  x: 100,
  y: 400,
  vx: 0,
  vy: 0,
  heading: 0,
  maxSpeed: 20,
  sensorRadius: 60,
  worldWidth: 500,
  worldHeight: 500,
  food: null,
  peer: null,
  timeSinceFood: 0.5,
  previousReward: 0.1,
  previousAction: [0.1, 0.2, 0.3, 0.4, 0.5]
}

describe('contracts and layout', () => {
  it('has labels for every observation and action value', () => {
    expect(OBSERVATION_LABELS).toHaveLength(OBSERVATION_SIZE)
    expect(ACTION_LABELS).toHaveLength(ACTION_SIZE)
    expect(new Set(OBSERVATION_LABELS).size).toBe(OBSERVATION_SIZE)
  })

  it('derives input and output sizes from the constants', () => {
    expect(architecture).toEqual({
      inputSize: OBSERVATION_SIZE,
      hiddenSize: 8,
      memorySize: 4,
      outputSize: ACTION_SIZE
    })
  })

  it('lays out eight blocks totalling 426 weights, learnable ones last', () => {
    expect(brainBlockLengths(architecture)).toEqual([296, 32, 8, 32, 4, 40, 5, 9])
    expect(brainWeightCount(architecture)).toBe(426)
    expect(layout.total).toBe(426)
    expect(layout.learnOffset).toBe(372)
    expect(layout.learnLength).toBe(54)
    expect(layout.actorLength).toBe(45)
    expect(layout.hiddenToValue.offset + layout.hiddenToValue.length).toBe(layout.total)
  })
})

describe('softsign and the forward pass', () => {
  it('is bounded, odd, monotone and exact at zero', () => {
    expect(softsign(0)).toBe(0)
    expect(softsign(1)).toBe(0.5)
    expect(softsign(-3)).toBe(-0.75)
    expect(softsign(1e12)).toBeLessThan(1)
    expect(softsign(2)).toBeGreaterThan(softsign(1))
  })

  it('is a pure function of its inputs and keeps every value finite and bounded', () => {
    const random = new SeededRandom(deriveStreamWords(1, 'genetics'))
    const weights = Array.from({ length: layout.total }, () => random.normal(0, 2))
    const observation = Array.from({ length: OBSERVATION_SIZE }, () => random.float() * 2 - 1)
    const memory = [0.1, -0.2, 0.3, 0]
    const a = forwardHidden(layout, weights, observation, memory)
    const b = forwardHidden(layout, weights, observation, memory)
    expect(a).toEqual(b)
    expect(a.hidden).toHaveLength(8)
    expect(a.memory).toHaveLength(4)
    for (const value of [...a.hidden, ...a.memory]) expect(Math.abs(value)).toBeLessThan(1)
    const learned = weights.slice(layout.learnOffset)
    for (const value of readOutput(layout, learned, a.hidden)) {
      expect(Math.abs(value)).toBeLessThan(1)
    }
    expect(Number.isFinite(readValue(layout, learned, a.hidden))).toBe(true)
  })

  it('feeds memory back: the same observation gives different hidden units for different memory', () => {
    const random = new SeededRandom(deriveStreamWords(2, 'genetics'))
    const weights = Array.from({ length: layout.total }, () => random.normal(0, 1))
    const observation = new Array<number>(OBSERVATION_SIZE).fill(0.3)
    const a = forwardHidden(layout, weights, observation, [0, 0, 0, 0])
    const b = forwardHidden(layout, weights, observation, [0.9, -0.9, 0.9, -0.9])
    expect(a.hidden).not.toEqual(b.hidden)
  })
})

describe('buildObservation', () => {
  it('has the fixed length and order, and zeros for what is absent', () => {
    const o = buildObservation(base)
    expect(o).toHaveLength(OBSERVATION_SIZE)
    const at = (label: string): number => o[OBSERVATION_LABELS.indexOf(label)] as number
    expect(at('energy')).toBe(0.5)
    expect(at('age')).toBe(0.25)
    expect(at('positionX')).toBe(0.2)
    expect(at('positionY')).toBe(0.8)
    expect(at('headingCos')).toBe(1)
    expect(at('foodPresent')).toBe(0)
    expect(at('peerPresent')).toBe(0)
    expect(at('timeSinceFood')).toBe(0.5)
    expect(at('previousReward')).toBe(0.1)
    expect(at('previousExplore')).toBe(0.5)
  })

  it('expresses bearings in the body frame, so turning the organism rotates the bearing', () => {
    const food = { dx: 0, dy: 30, distanceSquared: 900 }
    const north = buildObservation({ ...base, food, heading: 0 })
    const facing = buildObservation({ ...base, food, heading: 1.5707963267948966 })
    const sinIndex = OBSERVATION_LABELS.indexOf('foodBearingSin')
    const cosIndex = OBSERVATION_LABELS.indexOf('foodBearingCos')
    expect(north[sinIndex]).toBeCloseTo(1, 12)
    expect(facing[cosIndex]).toBeCloseTo(1, 12)
    expect(north[OBSERVATION_LABELS.indexOf('foodProximity')]).toBe(0.5)
  })

  it('reports forward and lateral velocity in the body frame', () => {
    const o = buildObservation({ ...base, vx: 0, vy: 10, heading: 1.5707963267948966 })
    expect(o[OBSERVATION_LABELS.indexOf('forwardVelocity')]).toBeCloseTo(0.5, 12)
    expect(o[OBSERVATION_LABELS.indexOf('lateralVelocity')]).toBeCloseTo(0, 12)
  })
})

describe('exploration and reward', () => {
  it('scales noise with the gene, the explore output, and age unless persistent', () => {
    expect(explorationSigma(0.3, 1, 300, 600, 0)).toBeCloseTo(0.3, 12)
    expect(explorationSigma(0.3, 0, 300, 600, 0)).toBeCloseTo(0.15, 12)
    expect(explorationSigma(0.3, 0, 600, 600, 0)).toBe(0)
    expect(explorationSigma(0.3, 1, 0, 600, 1)).toBeCloseTo(0.6, 12)
    expect(explorationSigma(0.3, 1, 0, 600, -1)).toBe(0)
    expect(explorationSigma(0.3, 1, 0, 600, -5)).toBe(0)
  })

  it('splits reward into its terms and clamps the total', () => {
    const weights = { feeding: 1, reproduction: 0.5, energyCost: 5, damage: 0, exploration: 0 }
    const r = computeReward(
      { energyGained: 30, reproduced: true, energyCost: 0.05, capacity: 100 },
      weights
    )
    expect(r.feeding).toBeCloseTo(0.3, 12)
    expect(r.reproduction).toBe(0.5)
    expect(r.energyCost).toBeCloseTo(0.0025, 12)
    expect(r.total).toBeCloseTo(0.7975, 12)
    const big = computeReward(
      { energyGained: 500, reproduced: true, energyCost: 0, capacity: 1 },
      weights
    )
    expect(big.total).toBe(1)
    const starving = computeReward(
      { energyGained: 0, reproduced: false, energyCost: 1, capacity: 100 },
      weights
    )
    expect(starving.total).toBeLessThan(0)
  })
})

describe('innate prior', () => {
  const weights = innatePriorWeights(architecture)
  const learned = weights.slice(layout.learnOffset)
  const act = (food: ObservationInput['food']): number[] => {
    const { hidden } = forwardHidden(
      layout,
      weights,
      buildObservation({ ...base, food }),
      [0, 0, 0, 0]
    )
    return readOutput(layout, learned, hidden)
  }

  it('turns toward food on either side and drives forward when food is in sight', () => {
    const left = act({ dx: 20, dy: 20, distanceSquared: 800 })
    const right = act({ dx: 20, dy: -20, distanceSquared: 800 })
    const nothing = act(null)
    expect(left[1]).toBeGreaterThan(0.5)
    expect(right[1]).toBeLessThan(-0.5)
    expect(Math.abs(nothing[1] as number)).toBeLessThan(0.05)
    expect(left[0]).toBeGreaterThan((nothing[0] as number) + 0.2)
    expect(nothing[0]).toBeGreaterThan(0.3)
  })

  it('always tries to interact and starts neutral on strafe and explore', () => {
    const out = act(null)
    expect(out[3]).toBeGreaterThan(0)
    expect(out[2]).toBe(0)
    expect(out[4]).toBe(0)
  })

  it('needs enough hidden units', () => {
    expect(() => innatePriorWeights({ ...architecture, hiddenSize: 4 })).toThrow(/hidden units/)
    expect(() => resolveWorldConfig({ genetics: { brain: { hiddenSize: 4 } } })).toThrow(
      /hiddenSize/
    )
  })

  it('founders with the prior are the template plus small noise; without it, plain random', () => {
    const specs = buildGeneSpecs(config)
    const stream = () => new SeededRandom(deriveStreamWords(9, 'genetics'))
    const prior = createFounderGenome(0, specs, config.genetics.brain, stream())
    const plain = createFounderGenome(
      0,
      specs,
      { ...config.genetics.brain, innatePrior: false },
      stream()
    )
    expect(prior.brain.weights).toHaveLength(426)
    expect(plain.brain.weights).toHaveLength(426)
    const worst = Math.max(
      ...prior.brain.weights.map((w, i) => Math.abs(w - (weights[i] as number)))
    )
    expect(worst).toBeLessThan(0.3 * 0.1 * 6)
    expect(prior.brain.weights).not.toEqual(plain.brain.weights)
  })
})

describe('learners', () => {
  const genes = {
    learningRate: 0.2,
    discountFactor: 0.9,
    eligibilityTraceDecay: 0.8,
    explorationRate: 0.3,
    riskTolerance: 0.5,
    noveltyPreference: 0.5,
    persistence: 1
  }
  const params = { weightLimit: 1.5, baselineRate: 0.05, valueRateScale: 1 }
  const specs = buildGeneSpecs(config)
  const genome = createFounderGenome(
    0,
    specs,
    config.genetics.brain,
    new SeededRandom(deriveStreamWords(5, 'genetics'))
  )

  function drive(name: 'hebbian' | 'actorCritic', enabled: boolean, steps: number) {
    const brain = createBrainState(genome, layout, 50)
    const learner = createLearner(name)
    const random = new SeededRandom(deriveStreamWords(5, 'learning'))
    for (let i = 0; i < steps; i++) {
      learner.decide(
        {
          layout,
          weights: genome.brain.weights,
          genes,
          params,
          observation: buildObservation({
            ...base,
            food: { dx: cos(i) * 20, dy: sin(i) * 20, distanceSquared: 400 },
            previousReward: brain.reward.total,
            previousAction: brain.prevAction
          }),
          noise: Array.from({ length: ACTION_SIZE }, () => random.normal()),
          age: 10,
          maxAge: 600,
          learningEnabled: enabled
        },
        brain
      )
      brain.reward.total = i % 7 === 0 ? 5 : -0.2
    }
    return brain
  }

  it.each(['hebbian', 'actorCritic'] as const)(
    '%s: actions are bounded and state stays finite',
    (name) => {
      const brain = drive(name, true, 500)
      expect(brainStateProblems(brain, layout)).toEqual([])
      for (const a of brain.prevAction) expect(Math.abs(a)).toBeLessThanOrEqual(1)
      for (const w of brain.learned) {
        expect(Math.abs(w)).toBeLessThanOrEqual(params.weightLimit + 1e-12)
      }
    }
  )

  it.each(['hebbian', 'actorCritic'] as const)(
    '%s: learning off freezes weights but still explores',
    (name) => {
      const brain = drive(name, false, 200)
      expect(brain.learned).toEqual(genome.brain.weights.slice(layout.learnOffset))
      expect(brain.updates).toBe(0)
      expect(brain.weightChange).toBe(0)
      expect(brain.prevAction.some((a, i) => a !== (brain.lastOutput[i] as number))).toBe(true)
    }
  )

  it('hebbian leaves the value head alone; actor-critic trains it', () => {
    const valueOf = (b: ReturnType<typeof drive>) => b.learned.slice(layout.actorLength)
    const initial = genome.brain.weights.slice(layout.learnOffset + layout.actorLength)
    expect(valueOf(drive('hebbian', true, 300))).toEqual(initial)
    expect(valueOf(drive('actorCritic', true, 300))).not.toEqual(initial)
  })

  it('is deterministic: the same inputs give the same brain', () => {
    expect(drive('actorCritic', true, 300)).toEqual(drive('actorCritic', true, 300))
  })

  it('leaves the immutable genome weights untouched while the overlay moves', () => {
    const brain = drive('hebbian', true, 100)
    expect(brain.learned).not.toEqual(genome.brain.weights.slice(layout.learnOffset))
    expect(Object.isFrozen(genome.brain.weights)).toBe(true)
  })
})
