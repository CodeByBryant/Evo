import { describe, expect, it } from 'vitest'
import type { LearningAlgorithmName, WorldConfigOverrides } from '@evo/contracts'
import { World } from '../../src/index'
import { architectureOf, genomeFromParts, genomeToVector } from '../../src/genetics/GenomeFactory'
import { brainLayoutOf } from '../../src/learning/BrainLayout'
import type { BrainState } from '../../src/learning/BrainState'
import type { OrganismState } from '../../src/entities/OrganismStore'

/**
 * Scenario D (roadmap): food appears only in one region, and learning is switched on and off.
 * Two parts:
 *
 * 1. the region is respected, by the initial spawn and by every later one, and a world with a
 *    region is reproducible and learns differently from the same world with learning off;
 * 2. a controlled experiment in the real world pipeline: a lone organism whose `interact` output
 *    starts just below the threshold (it passes over food without eating until noise happens to
 *    push it over). Reward follows the action at once, so credit assignment is immediate and the
 *    only thing to learn is "interact when there is food". Learning must raise that output; with
 *    learning off it stays exactly where it started.
 */
const REGION = { x: 350, y: 0, width: 150, height: 500 }

describe('Scenario D: food in one region', () => {
  const config: WorldConfigOverrides = { resources: { region: REGION } }

  it('spawns every resource, initial and later, inside the region', () => {
    const world = World.create({ seed: 3, config, validateEveryTicks: 100 })
    world.run(3000)
    const spawned = world.events.list().filter((event) => event.type === 'resource-spawned')
    expect(spawned.length).toBeGreaterThan(100)
    for (const event of spawned) {
      if (event.type !== 'resource-spawned') continue
      expect(event.position.x).toBeGreaterThanOrEqual(REGION.x)
      expect(event.position.x).toBeLessThanOrEqual(REGION.x + REGION.width)
      expect(event.position.y).toBeGreaterThanOrEqual(REGION.y)
      expect(event.position.y).toBeLessThanOrEqual(REGION.y + REGION.height)
    }
  })

  it('leaves the spawn draws untouched when no region is set', () => {
    const plain = World.create({ seed: 3 })
    const whole = World.create({
      seed: 3,
      config: { resources: { region: { x: 0, y: 0, width: 500, height: 500 } } }
    })
    plain.run(200)
    whole.run(200)
    expect(whole.snapshot().resources).toEqual(plain.snapshot().resources)
  })

  it('is reproducible, and learning on and off lead to different histories', () => {
    const run = (enabled: boolean) => {
      const world = World.create({ seed: 8, config: { ...config, learning: { enabled } } })
      world.run(3000)
      return world.stateHash()
    }
    expect(run(true)).toBe(run(true))
    expect(run(true)).not.toBe(run(false))
  })

  it('organisms still find the food: the population survives and eats', () => {
    const world = World.create({ seed: 5, config })
    world.run(6000)
    expect(world.snapshot().metrics.resourcesConsumed).toBeGreaterThan(50)
    expect(world.isExtinct).toBe(false)
  })
})

describe('controlled experiment: learning to interact', () => {
  const INTERACT = 3
  const HANDICAP = -0.15
  const SEEDS = Array.from({ length: 12 }, (_, i) => i + 1)

  function lifeOf(seed: number, enabled: boolean, algorithm: LearningAlgorithmName) {
    const world = World.create({
      seed,
      config: {
        maxPopulation: 1,
        organisms: {
          initialCount: 1,
          initialEnergy: 100,
          maxAge: 1200,
          senescenceAge: 1000,
          basalCost: 0.03,
          sensorCost: 0,
          movementCost: 0.0005,
          turningCost: 0.005,
          learningCost: 0
        },
        resources: { initialCount: 100, maxCount: 100, spawnRate: 2 },
        learning: { enabled, algorithm },
        genetics: { learning: { learningRate: 0.05 } }
      }
    })
    const internals = world as unknown as { organisms: { values(): OrganismState[] } }
    const organism = internals.organisms.values()[0] as OrganismState & { genome: unknown }
    const layout = brainLayoutOf(architectureOf(world.config.genetics.brain))
    const biasIndex = layout.outputBias.offset + INTERACT
    const weights = organism.genome.brain.weights.slice()
    weights[biasIndex] = HANDICAP
    ;(organism as { genome: unknown }).genome = genomeFromParts({
      id: organism.genome.id,
      parentIds: [],
      vector: genomeToVector(organism.genome),
      architecture: organism.genome.brain.architecture,
      weights
    })
    const brain = organism.brain as BrainState
    brain.head = Float64Array.from(weights.slice(0, layout.learnOffset))
    brain.learned = weights.slice(layout.learnOffset)
    const learnedIndex = biasIndex - layout.learnOffset

    world.run(12_000)
    return { eaten: world.snapshot().metrics.resourcesConsumed, bias: brain.learned[learnedIndex]! }
  }

  it.each(['hebbian', 'actorCritic'] as const)(
    '%s learning raises the starved interact output; with learning off it never moves',
    (algorithm) => {
      const on = SEEDS.map((seed) => lifeOf(seed, true, algorithm))
      const off = SEEDS.map((seed) => lifeOf(seed, false, algorithm))
      for (const life of off) expect(life.bias).toBe(HANDICAP)
      const raised = on.filter((life) => life.bias > HANDICAP).length
      expect(raised).toBeGreaterThanOrEqual(Math.ceil((SEEDS.length * 2) / 3))
      const meanShift = on.reduce((sum, life) => sum + (life.bias - HANDICAP), 0) / on.length
      // Actor-critic learns this more slowly: its critic soon predicts the meal, shrinking the TD error.
      expect(meanShift).toBeGreaterThan(algorithm === 'hebbian' ? 0.02 : 0.005)
    },
    120_000
  )

  it('the hebbian learner eats more over a life than the same organism with learning off', () => {
    const total = (enabled: boolean) =>
      SEEDS.reduce((sum, seed) => sum + lifeOf(seed, enabled, 'hebbian').eaten, 0)
    expect(total(true)).toBeGreaterThan(total(false))
  }, 120_000)
})
