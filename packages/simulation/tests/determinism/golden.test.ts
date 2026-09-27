import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { HASH_SCHEMA_VERSION, World } from '../../src/index'
import type { WorldConfigOverrides } from '@evo/contracts'

interface GoldenEntry {
  readonly name: string
  readonly seed: number
  readonly config: WorldConfigOverrides
  readonly steps: number
  readonly expectedHash: string
}

interface GoldenFile {
  readonly hashSchemaVersion: number
  readonly engineVersion: string
  readonly entries: readonly GoldenEntry[]
}

const goldenPath = fileURLToPath(new URL('../golden/state-hashes.json', import.meta.url))
const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenFile

describe('golden state hashes', () => {
  it("the golden file matches the engine's current hash schema version", () => {
    // A mismatch here means the canonical hash layout changed (docs/simulation/determinism.md,
    // section 7.3): bump HASH_SCHEMA_VERSION, regenerate every entry below, and say why in the PR.
    expect(golden.hashSchemaVersion).toBe(HASH_SCHEMA_VERSION)
  })

  it('has at least one entry, so this suite cannot silently pass empty', () => {
    expect(golden.entries.length).toBeGreaterThan(0)
  })

  it.each(golden.entries.map((entry) => [entry.name, entry] as const))(
    '%s reproduces its pinned hash',
    (_name, entry) => {
      const world = World.create({ seed: entry.seed, config: entry.config })
      world.run(entry.steps)
      expect(world.stateHash()).toBe(entry.expectedHash)
    }
  )
})
