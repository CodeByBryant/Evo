import { describe, expect, it } from 'vitest'
import { EventLog } from '../src/events/EventLog'

const spawned = (tick: number, resourceId: number) =>
  ({ type: 'resource-spawned', tick, resourceId, position: { x: 0, y: 0 } }) as const

describe('EventLog', () => {
  it('rejects a negative or non-integer capacity', () => {
    expect(() => new EventLog(-1)).toThrow(RangeError)
    expect(() => new EventLog(1.5)).toThrow(RangeError)
  })

  it('counts and retains events up to capacity', () => {
    const log = new EventLog(3)
    log.beginTick()
    log.record(spawned(1, 1))
    log.record(spawned(1, 2))
    expect(log.emittedCount).toBe(2)
    expect(log.droppedCount).toBe(0)
    expect(log.list().map((e) => (e.type === 'resource-spawned' ? e.resourceId : -1))).toEqual([
      1, 2
    ])
  })

  it('evicts the oldest event once capacity is exceeded (ring buffer), still counting every emission', () => {
    const log = new EventLog(2)
    log.beginTick()
    log.record(spawned(1, 1))
    log.record(spawned(1, 2))
    log.record(spawned(1, 3))
    expect(log.emittedCount).toBe(3)
    expect(log.droppedCount).toBe(1)
    expect(log.list().map((e) => (e.type === 'resource-spawned' ? e.resourceId : -1))).toEqual([
      2, 3
    ])
  })

  it('keeps evicting correctly across many more events than capacity', () => {
    const log = new EventLog(3)
    log.beginTick()
    for (let i = 0; i < 100; i++) log.record(spawned(1, i))
    expect(log.emittedCount).toBe(100)
    expect(log.droppedCount).toBe(97)
    expect(log.list().map((e) => (e.type === 'resource-spawned' ? e.resourceId : -1))).toEqual([
      97, 98, 99
    ])
  })

  it('capacity 0 retains nothing but still counts every emission as dropped', () => {
    const log = new EventLog(0)
    log.beginTick()
    log.record(spawned(1, 1))
    log.record(spawned(1, 2))
    expect(log.emittedCount).toBe(2)
    expect(log.droppedCount).toBe(2)
    expect(log.list()).toEqual([])
  })

  it('eventsThisTick() resets on beginTick() and reflects only the current tick', () => {
    const log = new EventLog(10)
    log.beginTick()
    log.record(spawned(1, 1))
    log.record(spawned(1, 2))
    expect(log.eventsThisTick()).toHaveLength(2)
    log.beginTick()
    expect(log.eventsThisTick()).toEqual([])
    log.record(spawned(2, 3))
    expect(log.eventsThisTick()).toHaveLength(1)
    // Retained history still holds everything within capacity.
    expect(log.list()).toHaveLength(3)
  })
})
