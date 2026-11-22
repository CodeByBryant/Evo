import { describe, it } from 'vitest'
import { World } from '../../src/index'
import { forwardHidden, readOutput, readValue } from '../../src/learning/Brain'
import { brainLayoutOf } from '../../src/learning/BrainLayout'
import { buildObservation } from '../../src/learning/ObservationBuilder'

describe('bench brain', () => {
  it('times the pieces of a decision', () => {
    const world = World.create({ seed: 3 })
    world.run(1500)
    const o = world.snapshot().organisms[0]!
    const genome = world.genomeOf(o.id)!
    const layout = brainLayoutOf(genome.brain.architecture)
    const weights = Float64Array.from(genome.brain.weights.slice(0, layout.learnOffset))
    const observation = new Array<number>(48).fill(0).map((_, i) => ((i * 7919) % 100) / 100 - 0.5)
    const memory = [0.1, -0.2, 0.3, 0.05]
    const learned = new Array<number>(layout.actorLength + 9).fill(0.01)
    const N = 300_000
    let sink = 0
    const time = (name: string, f: () => number): void => {
      for (let i = 0; i < 20_000; i++) sink += f()
      const t = performance.now()
      for (let i = 0; i < N; i++) sink += f()
      console.log(`${name}: ${(((performance.now() - t) * 1000) / N).toFixed(3)} us`)
    }
    time(
      'forwardHidden',
      () => forwardHidden(layout, weights, observation, memory).hidden[0] as number
    )
    const pass = forwardHidden(layout, weights, observation, memory)
    time('readOutput', () => readOutput(layout, learned, pass.hidden)[0] as number)
    time('readValue', () => readValue(layout, learned, pass.hidden))
    time(
      'buildObservation',
      () =>
        buildObservation({
          energy: 0.5,
          age: 0.2,
          x: 100,
          y: 100,
          vx: 1,
          vy: 0,
          heading: 0.3,
          maxSpeed: 20,
          sensorRadius: 60,
          worldWidth: 700,
          worldHeight: 700,
          food: { dx: 5, dy: 2, distanceSquared: 29 },
          peer: null,
          timeSinceFood: 0.2,
          previousReward: 0.1,
          previousAction: [0, 0, 0, 0, 0],
          health: 1,
          hazard: null
        })[3] as number
    )
    console.log(sink > 0 ? '' : '')
  }, 120_000)
})
