import { describe, expect, it } from 'vitest'
import { PRESETS } from '@evo/config'
import { World } from '../src/index'

// Every preset the application offers must start a valid, living world.
describe('presets run', () => {
  it.each(PRESETS.map((p) => [p.name, p] as const))(
    '%s stays valid and populated for 3,000 ticks',
    (_name, preset) => {
      for (const seed of [1, 2]) {
        const world = World.create({ seed, config: preset.overrides, validateEveryTicks: 500 })
        world.run(3000)
        expect(world.isExtinct).toBe(false)
        expect(world.validate()).toEqual({ ok: true, errors: [] })
        expect(world.snapshot().metrics.organismsBorn).toBeGreaterThan(0)
      }
    },
    120_000
  )
})
