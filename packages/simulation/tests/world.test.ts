import { describe, expect, it } from 'vitest'
import { ENGINE_VERSION, World } from '../src/index'

describe('World', () => {
  it('can be imported and created with a seed', () => {
    const world = new World({ seed: 12345 })
    expect(world.seed).toBe(12345)
  })

  it('exposes an engine version', () => {
    expect(ENGINE_VERSION).toMatch(/^[0-9]+[.][0-9]+[.][0-9]+$/)
  })
})
