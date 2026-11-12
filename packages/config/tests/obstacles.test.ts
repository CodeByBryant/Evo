import { describe, expect, it } from 'vitest'
import { MIN_OBSTACLE_RADIUS, OBSTACLE_KINDS } from '@evo/contracts'
import type { WorldConfig } from '@evo/contracts'
import { DEFAULT_WORLD_CONFIG, resolveWorldConfig, validateWorldConfig } from '../src/index'

// The obstacle section (ADR 0022): defaults, merging per kind and per density, and the rules that
// keep every circle too big to be tunnelled through.

type Loose = Record<string, Record<string, unknown>>

function errorsFor(mutate: (obstacles: Loose) => void): string[] {
  const config = JSON.parse(JSON.stringify(DEFAULT_WORLD_CONFIG)) as WorldConfig
  const ecology = (config as unknown as Loose)['ecology'] as unknown as Loose
  mutate(ecology['obstacles'] as unknown as Loose)
  return [...validateWorldConfig(config).errors]
}

const kind = (obstacles: Loose, name: string): Record<string, unknown> =>
  (obstacles['kinds'] as unknown as Loose)[name] as Record<string, unknown>

describe('obstacles config', () => {
  it('has valid defaults, one entry for every kind, and starts switched off', () => {
    expect(validateWorldConfig(DEFAULT_WORLD_CONFIG)).toEqual({ ok: true, errors: [] })
    const { obstacles } = DEFAULT_WORLD_CONFIG.ecology
    expect(Object.keys(obstacles.kinds)).toEqual([...OBSTACLE_KINDS])
    expect(obstacles.enabled).toBe(false)
  })

  it('gives each kind a different job (the kinds are not boulders in other colours)', () => {
    const { kinds } = DEFAULT_WORLD_CONFIG.ecology.obstacles
    expect(kinds.reeds.blocksMovement).toBe(false)
    expect(kinds.reeds.blocksSight).toBe(true)
    expect(kinds.pond.blocksMovement).toBe(true)
    expect(kinds.pond.blocksSight).toBe(false)
    expect(kinds.ridge.recipe).toBe('chain')
    expect(kinds.boulder.blocksMovement && kinds.boulder.blocksSight).toBe(true)
  })

  it('merges per kind and per region density', () => {
    const config = resolveWorldConfig({
      ecology: {
        obstacles: { enabled: true, kinds: { tree: { density: { forest: 9 } } } }
      }
    })
    const { obstacles } = config.ecology
    expect(obstacles.enabled).toBe(true)
    expect(obstacles.kinds.tree.density.forest).toBe(9)
    // Everything else about the tree, and every other kind, is the default.
    expect(obstacles.kinds.tree.density.meadow).toBe(
      DEFAULT_WORLD_CONFIG.ecology.obstacles.kinds.tree.density.meadow
    )
    expect(obstacles.kinds.tree.radiusMax).toBe(
      DEFAULT_WORLD_CONFIG.ecology.obstacles.kinds.tree.radiusMax
    )
    expect(obstacles.kinds.boulder).toEqual(DEFAULT_WORLD_CONFIG.ecology.obstacles.kinds.boulder)
  })

  it('does not change the defaults when it merges', () => {
    const before = JSON.stringify(DEFAULT_WORLD_CONFIG)
    resolveWorldConfig({ ecology: { obstacles: { kinds: { pond: { density: { cave: 5 } } } } } })
    expect(JSON.stringify(DEFAULT_WORLD_CONFIG)).toBe(before)
  })

  it('rejects a circle smaller than the smallest a body cannot tunnel through', () => {
    expect(
      errorsFor((o) => {
        kind(o, 'tree')['radiusMin'] = MIN_OBSTACLE_RADIUS - 0.5
      })
    ).toContain(`ecology.obstacles.kinds.tree.radiusMin must be at least ${MIN_OBSTACLE_RADIUS}`)
    // The smallest legal radius is accepted (the negative's twin).
    expect(
      errorsFor((o) => {
        kind(o, 'tree')['radiusMin'] = MIN_OBSTACLE_RADIUS
      })
    ).toEqual([])
  })

  it('rejects a maximum below the minimum, for radius and for members', () => {
    expect(
      errorsFor((o) => {
        kind(o, 'boulder')['radiusMax'] = 7
        kind(o, 'boulder')['radiusMin'] = 9
      })
    ).toContain('ecology.obstacles.kinds.boulder.radiusMax must not be below radiusMin')
    expect(
      errorsFor((o) => {
        kind(o, 'ridge')['membersMin'] = 6
        kind(o, 'ridge')['membersMax'] = 5
      })
    ).toContain('ecology.obstacles.kinds.ridge.membersMax must not be below membersMin')
  })

  it('requires a single circle to have exactly one member', () => {
    expect(
      errorsFor((o) => {
        kind(o, 'boulder')['membersMax'] = 3
      })
    ).toContain(
      'ecology.obstacles.kinds.boulder is a single circle, so membersMin and membersMax must both be 1'
    )
  })

  it('rejects negative densities, an unknown kind or recipe, and a coverage of one or more', () => {
    expect(
      errorsFor((o) => {
        ;(kind(o, 'tree')['density'] as Record<string, number>)['forest'] = -1
      })
    ).toContain('ecology.obstacles.kinds.tree.density.forest must be nonnegative')
    expect(
      errorsFor((o) => {
        ;(o['kinds'] as unknown as Loose)['bush'] = {}
      })
    ).toContain('unknown property "ecology.obstacles.kinds.bush"')
    expect(
      errorsFor((o) => {
        kind(o, 'tree')['recipe'] = 'spiral'
      })
    ).toContain('ecology.obstacles.kinds.tree.recipe must be one of: single, chain, cluster')
    expect(
      errorsFor((o) => {
        o['maxCoverage'] = 1 as never
      })
    ).toContain('ecology.obstacles.maxCoverage must be less than one')
  })

  it('requires the flags to be booleans and the section to be complete', () => {
    expect(
      errorsFor((o) => {
        kind(o, 'pond')['blocksSight'] = 'no'
      })
    ).toContain('ecology.obstacles.kinds.pond.blocksSight must be a boolean')
    expect(
      errorsFor((o) => {
        delete (o as Record<string, unknown>)['kinds']
      })
    ).toContain('ecology.obstacles.kinds is required')
  })
})
