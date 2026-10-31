import { describe, expect, it } from 'vitest'
import type {
  LearningAlgorithmName,
  LearningInheritanceMode,
  WorldConfigOverrides
} from '@evo/contracts'
import { World } from '../../src/index'

/**
 * The ablation matrix (roadmap Phase 5 exit criteria: "learning inheritance modes are
 * distinguishable"): the same seed and world under every inheritance mode and both algorithms,
 * plus learning switched off. Every cell must be a different history, and the differences must be
 * the ones the modes promise.
 */
const MODES: LearningInheritanceMode[] = ['baldwinian', 'partial', 'lamarckian']
const ALGORITHMS: LearningAlgorithmName[] = ['hebbian', 'actorCritic']
const TICKS = 4000

function configFor(
  algorithm: LearningAlgorithmName,
  mode: LearningInheritanceMode,
  enabled = true
): WorldConfigOverrides {
  return {
    organisms: { initialCount: 20 },
    learning: { controller: 'brain', algorithm, enabled },
    genetics: { learningInheritance: { mode, fraction: 0.5 } }
  }
}

function run(config: WorldConfigOverrides, seed = 5): World {
  const world = World.create({ seed, config, validateEveryTicks: 500 })
  world.run(TICKS)
  return world
}

describe('ablation matrix', () => {
  const cells = ALGORITHMS.flatMap((algorithm) =>
    MODES.map((mode) => ({ algorithm, mode, world: run(configFor(algorithm, mode)) }))
  )
  const off = run(configFor('actorCritic', 'partial', false))

  it('produces a different history for every algorithm and inheritance mode', () => {
    const hashes = new Set(cells.map((cell) => cell.world.stateHash()))
    hashes.add(off.stateHash())
    expect(hashes.size).toBe(cells.length + 1)
  })

  it('keeps every cell valid and populated', () => {
    for (const { world } of [...cells, { world: off }]) {
      expect(world.validate()).toEqual({ ok: true, errors: [] })
      expect(world.snapshot().metrics.organismsBorn).toBeGreaterThan(0)
    }
  })

  it('learning off records no weight change in any organism that ever lived', () => {
    for (const record of off.historicalOrganisms()) {
      expect(record.brain!.updates).toBe(0)
      expect(record.brain!.weightChange).toBe(0)
    }
  })

  it('learning on changes weights in organisms that lived long enough', () => {
    for (const { world } of cells) {
      const changed = world.historicalOrganisms().filter((r) => r.brain!.weightChange > 0)
      expect(changed.length).toBeGreaterThan(0)
    }
  })

  it('the two algorithms learn differently from the same experience', () => {
    const [hebbian, actorCritic] = ALGORITHMS.map((algorithm) =>
      run(configFor(algorithm, 'baldwinian'), 7).historicalOrganisms()
    ) as [ReturnType<World['historicalOrganisms']>, ReturnType<World['historicalOrganisms']>]
    const total = (records: typeof hebbian) =>
      records.reduce((sum, r) => sum + r.brain!.weightChange, 0)
    expect(total(hebbian)).not.toBe(total(actorCritic))
  })

  it('Lamarckian children start closer to what their parents learned than Baldwinian ones', () => {
    // Both worlds live identical lives up to the first birth (the modes differ only in what a
    // child inherits), and weight mutation is off, so the first child of each mode can be
    // compared with its parents' learned weights: weight by weight, how far is it from the
    // nearer parent's learned value?
    const firstChildDistance = (mode: LearningInheritanceMode): number => {
      const world = World.create({
        seed: 11,
        config: {
          ...configFor('actorCritic', mode),
          genetics: {
            learningInheritance: { mode, fraction: 0.5 },
            brain: { weightMutationRate: 0 }
          }
        }
      })
      const internals = world as unknown as {
        organisms: {
          values(): Array<{
            id: number
            parentIds: number[]
            genome: { brain: { weights: readonly number[] } }
            brain: { learned: number[] } | null
          }>
        }
      }
      const known = new Set(internals.organisms.values().map((o) => o.id))
      for (let tick = 0; tick < 8000; tick++) {
        world.step()
        const living = internals.organisms.values()
        const byId = new Map(living.map((o) => [o.id, o]))
        for (const organism of living) {
          if (known.has(organism.id)) continue
          known.add(organism.id)
          if (organism.parentIds.length !== 2) continue
          const parents = organism.parentIds.map((id) => byId.get(id)?.brain?.learned)
          if (parents.some((learned) => learned === undefined)) continue
          const tail = organism.genome.brain.weights.slice(340)
          return tail.reduce((sum, w, i) => {
            const nearest = Math.min(
              ...parents.map((learned) => Math.abs(w - (learned as number[])[i]!))
            )
            return sum + nearest
          }, 0)
        }
      }
      throw new Error('no birth observed')
    }
    const lamarckian = firstChildDistance('lamarckian')
    const baldwinian = firstChildDistance('baldwinian')
    expect(lamarckian).toBeCloseTo(0, 9)
    expect(baldwinian).toBeGreaterThan(0.01)
  })
})
