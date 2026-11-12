import { describe, expect, it } from 'vitest'
import type { AnatomyPart, PartType } from '@evo/contracts'
import {
  NoveltyTracker,
  PERSISTENT_SAMPLES,
  bodyComplexity,
  bodySignature
} from '../../src/observatory/signatures'

const part = (type: PartType, functional = true, mouthStat = 0.5): AnatomyPart =>
  ({
    slot: 0,
    type,
    parent: -1,
    size: 0.5,
    integrity: 1,
    angle: 0,
    offset: 0,
    orientation: 0,
    stats: [0.5, 0.5, mouthStat, 0.5, 0.5, 0.5],
    statValues: {},
    x: 0,
    y: 0,
    axis: 0,
    tipX: 0,
    tipY: 0,
    functional
  }) as AnatomyPart

describe('bodySignature', () => {
  it('names the functional part types, the mouth form and a size bin', () => {
    expect(bodySignature([part('flagellum'), part('eye'), part('mouth')])).toBe(
      'eye,flagellum,mouth|mandible|small'
    )
  })

  it('does not depend on the order of the parts, and a dormant part does not count (negatives)', () => {
    const a = bodySignature([part('eye'), part('flagellum'), part('mouth')])
    const b = bodySignature([part('mouth'), part('flagellum'), part('eye')])
    expect(a).toBe(b)
    expect(bodySignature([part('eye'), part('mouth'), part('armor', false)])).toBe(
      bodySignature([part('eye'), part('mouth')])
    )
  })

  it('tells a jaw from a mandible, and a body with no mouth from both', () => {
    const jaw = bodySignature([part('mouth', true, 0.9)])
    const mandible = bodySignature([part('mouth', true, 0.5)])
    expect(jaw).not.toBe(mandible)
    expect(bodySignature([part('eye')])).toContain('|none|')
  })

  it('bins the part count so one more part of a kind already carried is not a new plan', () => {
    const four = Array.from({ length: 4 }, () => part('flagellum'))
    const five = Array.from({ length: 5 }, () => part('flagellum'))
    const six = Array.from({ length: 6 }, () => part('flagellum'))
    expect(bodySignature(four)).not.toBe(bodySignature(five))
    expect(bodySignature(five).split('|')[2]).toBe(bodySignature(six).split('|')[2])
  })
})

describe('bodyComplexity', () => {
  it('counts functional parts and distinct types', () => {
    expect(bodyComplexity([part('eye'), part('eye'), part('mouth'), part('armor', false)])).toEqual(
      {
        parts: 3,
        types: 2
      }
    )
    expect(bodyComplexity([])).toEqual({ parts: 0, types: 0 })
  })
})

describe('NoveltyTracker (persistent novelty)', () => {
  const sample = (...entries: [string, number][]) => new Map(entries)

  it('counts a plan the first time it is seen and never again', () => {
    const tracker = new NoveltyTracker()
    expect(tracker.observe(sample(['a', 10])).newSignatures).toBe(1)
    const second = tracker.observe(sample(['a', 10], ['b', 3]))
    expect(second.newSignatures).toBe(1)
    expect(second.everSeen).toBe(2)
    expect(tracker.observe(sample(['a', 10], ['b', 3])).newSignatures).toBe(0)
  })

  it('a plan that appears for a moment and is gone has not taken hold (negative)', () => {
    const tracker = new NoveltyTracker()
    tracker.observe(sample(['a', 20], ['flash', 5]))
    tracker.observe(sample(['a', 20]))
    tracker.observe(sample(['a', 20], ['flash', 5]))
    const last = tracker.observe(sample(['a', 20], ['flash', 5]))
    // its run restarted when it vanished, so only two samples in a row
    expect(last.persistent).toBe(1)
  })

  it('takes hold after the persistence run, once, with a real share of the population', () => {
    const tracker = new NoveltyTracker()
    let newly = 0
    let persistent = 0
    for (let i = 0; i < PERSISTENT_SAMPLES + 2; i++) {
      const s = tracker.observe(sample(['a', 20], ['b', 5]))
      newly += s.newlyPersistent
      persistent = s.persistent
    }
    // both a and b have lived long enough and each is over 2 percent
    expect(persistent).toBe(2)
    expect(newly).toBe(2)
  })

  it('a plan below the share never takes hold, however long it lives (negative)', () => {
    const tracker = new NoveltyTracker()
    let last = tracker.observe(sample())
    for (let i = 0; i < 10; i++) last = tracker.observe(sample(['big', 990], ['tiny', 1]))
    expect(last.persistent).toBe(1)
    expect(last.alive).toBe(2)
  })

  it('zero counts are not alive', () => {
    const tracker = new NoveltyTracker()
    const s = tracker.observe(sample(['a', 0]))
    expect(s.alive).toBe(0)
    expect(s.newSignatures).toBe(0)
  })
})
