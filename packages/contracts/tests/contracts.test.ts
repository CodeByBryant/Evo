import { describe, expect, it } from 'vitest'
import { MAX_SEED } from '../src/index'
import type { DeathCause, WorldEvent, WorldEventType } from '../src/index'

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
      'reproduction-attempted'
    ]
    const causes: DeathCause[] = ['starvation', 'age', 'damage', 'environment']
    expect(new Set(types).size).toBe(7)
    expect(new Set(causes).size).toBe(4)
  })

  it('MAX_SEED is the largest uint32', () => {
    expect(MAX_SEED).toBe(4294967295)
  })
})
