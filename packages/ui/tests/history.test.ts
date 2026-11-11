import { describe, expect, it } from 'vitest'
import type { HistoryPoint } from '@evo/contracts'
import { deathRates, shareOf } from '../src/history'

const point = (time: number, starved: number, aged = 0, damaged = 0): HistoryPoint => ({
  tick: time * 10,
  time,
  count: 10,
  species: 1,
  food: 10,
  starved,
  aged,
  damaged
})

describe('deathRates', () => {
  it('turns a steady stream into deaths per simulated minute', () => {
    // 6 starved a minute, 1 aged a minute, sampled every 10 s
    const points = Array.from({ length: 13 }, (_, i) => point(i * 10, i, i / 6 + 0))
    const rates = deathRates(points.map((p) => ({ ...p, starved: p.time / 10, aged: p.time / 60 })))
    expect(rates.starved).toBeCloseTo(6, 9)
    expect(rates.aged).toBeCloseTo(1, 9)
    expect(rates.damaged).toBe(0)
    expect(rates.total).toBeCloseTo(7, 9)
    expect(rates.seconds).toBe(120)
  })

  it('looks only at the trailing window, so an old famine does not show', () => {
    const points = [point(0, 0), point(60, 600), point(300, 600), point(420, 612)]
    // the last 120 s hold 12 deaths; the 600 in the first minute are outside the window
    expect(deathRates(points).starved).toBeCloseTo(6, 9)
    expect(deathRates(points, 1000).starved).toBeCloseTo((612 / 420) * 60, 9)
  })

  it('is the same however coarsely the run was sampled', () => {
    const fine = Array.from({ length: 241 }, (_, i) => point(i, i * 0.1))
    const coarse = fine.filter((_, i) => i % 8 === 0)
    expect(deathRates(coarse).starved).toBeCloseTo(deathRates(fine).starved, 6)
  })

  it('gives zeros, not NaN, with no history, one sample or no time passing', () => {
    const zero = { starved: 0, aged: 0, damaged: 0, total: 0, seconds: 0 }
    expect(deathRates([])).toEqual(zero)
    expect(deathRates([point(10, 5)])).toEqual(zero)
    expect(deathRates([point(10, 5), point(10, 9)])).toEqual(zero)
  })

  it('never reports a negative rate if a counter was reset', () => {
    expect(deathRates([point(0, 50), point(60, 3)]).starved).toBe(0)
  })
})

describe('shareOf', () => {
  it('is a fraction, clamped, and zero when there is nothing to divide', () => {
    expect(shareOf(1, 4)).toBe(0.25)
    expect(shareOf(9, 4)).toBe(1)
    expect(shareOf(-1, 4)).toBe(0)
    expect(shareOf(1, 0)).toBe(0)
  })
})
