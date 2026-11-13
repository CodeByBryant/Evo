import { describe, expect, it } from 'vitest'
import { resolveWorldConfig } from '@evo/config'
import { developAnatomy } from '../../src/development/develop'
import { capabilitiesOf, sniffedKind } from '../../src/development/capabilities'
import { bodyVectorOf } from '../../src/genetics/BodyGenes'

// Fixes found while planning hard diets (ADR 0026).

const config = resolveWorldConfig({})
const { anatomy } = config
const natural = config.ecology.resourceKinds.kinds.map((k) => k.name)
const withCarrion = [...natural, 'carrion']
const sipper = anatomy.starters.find((s) => s.name === 'nectar-sipper')!
const body = bodyVectorOf({ parts: sipper.parts, look: sipper.look, outline: sipper.outline })
const developed = developAnatomy(body, anatomy)

describe('a sniffer is spread over the food kinds a world grows, not the carcass kind', () => {
  const sniffer = developed.parts.find((p) => p.type === 'sniffer')

  it('the nectar sipper has a sniffer tuned to nectar when four kinds are grown', () => {
    expect(sniffer).toBeDefined()
    expect(natural[sniffedKind(sniffer!.stats[2] as number, natural.length)]).toBe('nectar')
  })

  it('still smells nectar, and not carrion, once predation appends the carcass kind', () => {
    const caps = capabilitiesOf(developed, anatomy, 1, withCarrion.length, withCarrion)
    const nectar = natural.indexOf('nectar')
    const carrion = withCarrion.indexOf('carrion')
    // the sniffer boosts the kind it favors above the plain baseline every kind has
    expect(caps.foodDetection[nectar] as number).toBeGreaterThan(
      caps.foodDetection[carrion] as number
    )
    expect(caps.foodDetection[carrion]).toBe(caps.foodDetection[natural.indexOf('grass')])
  })

  it('negative: counting the carcass kind (the old mapping) puts that selectivity on carrion', () => {
    const old = sniffedKind(sniffer!.stats[2] as number, withCarrion.length)
    expect(withCarrion[old]).toBe('carrion')
  })

  it('is the same with or without the carcass kind for every selectivity over the grown kinds', () => {
    for (let s = 0; s <= 1; s += 0.05) {
      const a = capabilitiesOf(
        developAnatomy(withSelectivity(s), anatomy),
        anatomy,
        1,
        natural.length,
        natural
      )
      const b = capabilitiesOf(
        developAnatomy(withSelectivity(s), anatomy),
        anatomy,
        1,
        withCarrion.length,
        withCarrion
      )
      natural.forEach((_, i) => expect(b.foodDetection[i]).toBe(a.foodDetection[i]))
      // the carcass kind is never the one a sniffer favors: it keeps the baseline
      expect(b.foodDetection[withCarrion.length - 1]).toBe(Math.min(...b.foodDetection))
    }
  })
})

function withSelectivity(selectivity: number): number[] {
  const copy = [...body]
  const slot = developed.parts.find((p) => p.type === 'sniffer')!.slot
  // stat s2 of the sniffer's slot: 14 genes a slot, field order present..integrity then s0..s5
  copy[slot * 14 + 8 + 2] = selectivity
  return copy
}
