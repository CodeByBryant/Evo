import { describe, expect, it } from 'vitest'
import {
  BEHAVIOUR_SIZE,
  BehaviourLedger,
  behaviourDiversity,
  behaviourSignature
} from '../../src/observatory/behaviour'

const idx = { speed: 0, turn: 1, rest: 2, plant: 3, flesh: 4, carrion: 5, bite: 6, range: 7 }

describe('BehaviourLedger', () => {
  it('has no descriptor for a creature it has not seen', () => {
    expect(new BehaviourLedger(100).descriptor(1)).toBeUndefined()
  })

  it('a creature that never moves rests and has no range; one that runs does not', () => {
    const ledger = new BehaviourLedger(100)
    for (let i = 0; i < 100; i++) {
      ledger.observeMotion(1, 0, 0, 50, 50, 1)
      ledger.observeMotion(2, 1, 0.5, 50 + i, 50, 1)
    }
    const still = ledger.descriptor(1) as number[]
    const runner = ledger.descriptor(2) as number[]
    expect(still).toHaveLength(BEHAVIOUR_SIZE)
    expect(still[idx.rest]).toBeGreaterThan(0.99)
    expect(still[idx.speed]).toBe(0)
    expect(still[idx.range]).toBe(0)
    expect(runner[idx.rest]).toBeLessThan(0.01)
    expect(runner[idx.speed]).toBeGreaterThan(0.99)
    expect(runner[idx.turn]).toBeCloseTo(0.5, 6)
    expect(runner[idx.range]).toBeGreaterThan(0.9)
  })

  it('recent behaviour counts more than old (a running average)', () => {
    const ledger = new BehaviourLedger(100)
    for (let i = 0; i < 50; i++) ledger.observeMotion(1, 1, 0, 0, 0, 1)
    const fast = (ledger.descriptor(1) as number[])[idx.speed] as number
    for (let i = 0; i < 50; i++) ledger.observeMotion(1, 0, 0, 0, 0, 1)
    const slow = (ledger.descriptor(1) as number[])[idx.speed] as number
    expect(fast).toBeGreaterThan(0.99)
    expect(slow).toBeLessThan(0.01)
  })

  it('splits energy into plant, flesh and carrion shares that add up to 1 (and 0 with no intake)', () => {
    const ledger = new BehaviourLedger(100)
    ledger.observeMotion(1, 0.5, 0, 0, 0, 1)
    expect((ledger.descriptor(1) as number[]).slice(3, 6)).toEqual([0, 0, 0])
    ledger.recordIntake(1, 'plant', 6)
    ledger.recordIntake(1, 'flesh', 3)
    ledger.recordIntake(1, 'carrion', 1)
    const d = ledger.descriptor(1) as number[]
    expect(d[idx.plant]).toBeCloseTo(0.6, 12)
    expect(d[idx.flesh]).toBeCloseTo(0.3, 12)
    expect(d[idx.carrion]).toBeCloseTo(0.1, 12)
    expect(ledger.intakeTotals()).toEqual({ plant: 6, flesh: 3, carrion: 1 })
  })

  it('ignores intake and bites for a creature it has not seen and non-positive energy (negatives)', () => {
    const ledger = new BehaviourLedger(100)
    ledger.recordIntake(9, 'plant', 5)
    ledger.recordBite(9)
    expect(ledger.size).toBe(0)
    ledger.observeMotion(1, 0.5, 0, 0, 0, 1)
    ledger.recordIntake(1, 'plant', -2)
    expect(ledger.intakeTotals().plant).toBe(0)
  })

  it('reads a bite rate in bites a second, and forgets the dead', () => {
    const ledger = new BehaviourLedger(100)
    for (let i = 0; i < 10; i++) ledger.observeMotion(1, 0.5, 0, 0, 0, 1)
    for (let i = 0; i < 10; i++) ledger.recordBite(1)
    expect((ledger.descriptor(1) as number[])[idx.bite]).toBeCloseTo(1 / 2.5, 12)
    ledger.forget(1)
    expect(ledger.descriptor(1)).toBeUndefined()
    expect(ledger.size).toBe(0)
  })
})

describe('behaviour diversity', () => {
  const grazer = [0.5, 0.2, 0.1, 1, 0, 0, 0.1, 0.3]
  const hunter = [0.9, 0.6, 0, 0.1, 0.9, 0, 0.8, 0.7]

  it('a population of one behaviour has one type and no spread (negative)', () => {
    const d = behaviourDiversity([grazer, grazer, grazer])
    expect(d.types).toBe(1)
    expect(d.spread).toBe(0)
  })

  it('two equally common behaviours are two types, with spread', () => {
    const d = behaviourDiversity([grazer, hunter, grazer, hunter])
    expect(d.types).toBe(2)
    expect(d.spread).toBeGreaterThan(0)
  })

  it('discretises into three bins a dimension', () => {
    expect(behaviourSignature([0, 0.5, 1])).toBe('012')
    expect(behaviourSignature([0.3, 0.34, 0.66])).toBe('011')
  })

  it('an empty population has no diversity', () => {
    expect(behaviourDiversity([])).toEqual({ types: 0, spread: 0 })
  })
})
