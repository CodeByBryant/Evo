import { describe, expect, it } from 'vitest'
import { ACTION_LABELS, ACTION_SIZE, OBSERVATION_LABELS, OBSERVATION_SIZE } from '@evo/contracts'
import { World } from '../src/index'

/**
 * The Phase 5 exit criteria (roadmap), each checked on a real running world. Criteria that need
 * a longer or controlled experiment point at the test that holds it:
 *
 * - learning improves performance in a controlled scenario: tests/learning/toy-task.test.ts (the
 *   algorithms) and tests/learning/scenario-d.test.ts (the full pipeline);
 * - learning inheritance modes are distinguishable: tests/learning/ablation.test.ts.
 */
const world = World.create({ seed: 12, validateEveryTicks: 100 })
world.run(1500)
const alive = world.snapshot().organisms

describe('Phase 5 exit criteria', () => {
  it('has organisms to examine', () => {
    expect(alive.length).toBeGreaterThan(5)
  })

  it('organisms receive observations', () => {
    for (const organism of alive) {
      const brain = world.brainOf(organism.id)!
      expect(brain.observation).toHaveLength(OBSERVATION_SIZE)
      expect(brain.observation.every((value) => Number.isFinite(value))).toBe(true)
      expect(brain.observation.some((value) => value !== 0)).toBe(true)
    }
    expect(OBSERVATION_LABELS).toHaveLength(OBSERVATION_SIZE)
  })

  it('brains produce actions, bounded and with every output used', () => {
    const seen = new Array<number>(ACTION_SIZE).fill(0)
    for (const organism of alive) {
      const { action } = world.brainOf(organism.id)!
      expect(action).toHaveLength(ACTION_SIZE)
      action.forEach((value, i) => {
        expect(Math.abs(value)).toBeLessThanOrEqual(1)
        seen[i] = (seen[i] as number) + Math.abs(value)
      })
    }
    seen.forEach((total, i) => expect(total, ACTION_LABELS[i]).toBeGreaterThan(0))
  })

  it('actions affect survival: a primed brain survives where a random brain starves', () => {
    const survivors = (innatePrior: boolean): number => {
      const w = World.create({
        seed: 4,
        config: {
          maxPopulation: 20,
          organisms: { initialCount: 20 },
          reproduction: { minEnergy: 999 },
          genetics: { brain: { innatePrior } }
        }
      })
      w.run(1500)
      return w.snapshot().population.active
    }
    expect(survivors(true)).toBeGreaterThan(survivors(false))
  })

  it('rewards are recorded, with their breakdown', () => {
    let fed = 0
    for (const organism of alive) {
      const { reward, telemetry } = world.brainOf(organism.id)!
      expect(reward.total).toBeGreaterThanOrEqual(-1)
      expect(reward.total).toBeLessThanOrEqual(1)
      expect(reward.energyCost).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(telemetry.rewardTotal)).toBe(true)
      if (telemetry.rewardTotal !== 0) fed += 1
    }
    expect(fed).toBeGreaterThan(0)
  })

  it('brain state changes over time', () => {
    const id = alive[0]!.id
    const before = world.brainOf(id)!
    const twin = World.create({ seed: 12, validateEveryTicks: 100 })
    twin.run(1500)
    twin.run(50)
    const after = twin.brainOf(id)
    if (after) {
      expect(after.memory).not.toEqual(before.memory)
      expect(after.hidden).not.toEqual(before.hidden)
    }
  })

  it('learning changes weights, and can be switched off', () => {
    const totalChange = (enabled: boolean): number => {
      const w = World.create({ seed: 12, config: { learning: { enabled } } })
      w.run(1500)
      return w
        .snapshot()
        .organisms.reduce((sum, o) => sum + w.brainOf(o.id)!.telemetry.weightChange, 0)
    }
    expect(totalChange(true)).toBeGreaterThan(0)
    expect(totalChange(false)).toBe(0)
  })

  it('activations and reward breakdowns are inspectable', () => {
    const brain = world.brainOf(alive[0]!.id)!
    expect(brain.hidden).toHaveLength(8)
    expect(brain.memory).toHaveLength(4)
    expect(brain.output).toHaveLength(ACTION_SIZE)
    expect(Object.keys(brain.reward).sort()).toEqual([
      'damage',
      'energyCost',
      'exploration',
      'feeding',
      'reproduction',
      'total'
    ])
    // The inspection is a copy: changing it cannot change the simulation.
    ;(brain.hidden as number[])[0] = 99
    expect(world.brainOf(alive[0]!.id)!.hidden[0]).not.toBe(99)
  })

  it('keeps the whole world valid', () => {
    expect(world.validate()).toEqual({ ok: true, errors: [] })
  })
})
