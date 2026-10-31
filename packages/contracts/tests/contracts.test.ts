import { describe, expect, it } from 'vitest'
import { MAX_SEED } from '../src/index'
import type {
  DeathCause,
  HistoricalOrganismRecord,
  LifeStage,
  OrganismSnapshot,
  ReproductionFailureReason,
  WorldEvent,
  WorldEventType
} from '../src/index'

/** Compile-time exhaustiveness: adding a WorldEvent variant without handling it fails typecheck. */
function describeEvent(event: WorldEvent): string {
  switch (event.type) {
    case 'organism-born':
      return `born ${event.organismId}`
    case 'organism-died':
      return `died ${event.organismId} (${event.cause})`
    case 'resource-spawned':
      return `spawned ${event.resourceId}`
    case 'resource-consumed':
      return `consumed ${event.resourceId}`
    case 'organism-moved':
      return `moved ${event.organismId}`
    case 'energy-changed':
      return `energy ${event.organismId}`
    case 'reproduction-attempted':
      return `reproduction ${event.organismId}`
    case 'organism-damaged':
      return `damaged ${event.organismId}`
    case 'season-changed':
      return `season ${event.season}`
    case 'hazard-spawned':
      return `hazard ${event.hazardId}`
    case 'hazard-expired':
      return `expired ${event.hazardId}`
    default: {
      const unreachable: never = event
      return unreachable
    }
  }
}

describe('contracts', () => {
  it('describes every event variant', () => {
    const died: WorldEvent = {
      type: 'organism-died',
      tick: 5,
      organismId: 3,
      cause: 'starvation',
      position: { x: 1, y: 2 }
    }
    expect(describeEvent(died)).toBe('died 3 (starvation)')
  })

  it('event types and death causes are the documented sets', () => {
    const types: WorldEventType[] = [
      'organism-born',
      'organism-died',
      'resource-spawned',
      'resource-consumed',
      'organism-moved',
      'energy-changed',
      'reproduction-attempted',
      'organism-damaged',
      'season-changed',
      'hazard-spawned',
      'hazard-expired'
    ]
    const causes: DeathCause[] = ['starvation', 'age', 'damage', 'environment']
    expect(new Set(types).size).toBe(11)
    expect(new Set(causes).size).toBe(4)
  })

  it('MAX_SEED is the largest uint32', () => {
    expect(MAX_SEED).toBe(4294967295)
  })

  it('life stages and reproduction failure reasons are the documented sets', () => {
    const stages: LifeStage[] = ['juvenile', 'mature', 'senescent']
    const reasons: ReproductionFailureReason[] = ['no-partner', 'population-cap']
    expect(new Set(stages).size).toBe(3)
    expect(new Set(reasons).size).toBe(2)
  })

  it('constructs a successful and a failed reproduction-attempted event', () => {
    const succeeded: WorldEvent = {
      type: 'reproduction-attempted',
      tick: 10,
      organismId: 1,
      partnerId: 2,
      childId: 3,
      succeeded: true,
      failureReason: null
    }
    const failed: WorldEvent = {
      type: 'reproduction-attempted',
      tick: 10,
      organismId: 1,
      partnerId: null,
      childId: null,
      succeeded: false,
      failureReason: 'no-partner'
    }
    expect(describeEvent(succeeded)).toBe('reproduction 1')
    expect(describeEvent(failed)).toBe('reproduction 1')
  })

  it('constructs a HistoricalOrganismRecord', () => {
    const record: HistoricalOrganismRecord = {
      id: 5,
      genomeId: 9,
      parentIds: [1, 2],
      speciesId: 3,
      birthTick: 100,
      deathTick: 200,
      deathCause: 'starvation',
      migration: null,
      brain: { rewardTotal: 1.5, updates: 12, weightChange: 0.25 }
    }
    expect(record.parentIds).toEqual([1, 2])
    expect(record.genomeId).toBe(9)
    expect(record.speciesId).toBe(3)
    expect(record.brain?.updates).toBe(12)
  })

  it('OrganismSnapshot has no generation counter, embedded genome, or alive flag', () => {
    const snapshot: OrganismSnapshot = {
      id: 1,
      genomeId: 1,
      parentIds: [],
      speciesId: null,
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      heading: 0,
      radius: 5,
      age: 0,
      energy: 50,
      health: 100,
      lifeStage: 'mature',
      reproductionCooldownRemaining: 0
    }
    const keys = Object.keys(snapshot)
    for (const forbidden of ['generation', 'genome', 'alive']) {
      expect(keys).not.toContain(forbidden)
    }
  })
})

describe('learning contracts', () => {
  it('fixes the observation and action sizes and labels them one to one', async () => {
    const { ACTION_LABELS, ACTION_SIZE, OBSERVATION_LABELS, OBSERVATION_SIZE } =
      await import('../src/index')
    expect(OBSERVATION_SIZE).toBe(33)
    expect(ACTION_SIZE).toBe(5)
    expect(OBSERVATION_LABELS).toHaveLength(OBSERVATION_SIZE)
    expect(ACTION_LABELS).toEqual(['thrust', 'turn', 'strafe', 'interact', 'explore'])
  })
})
