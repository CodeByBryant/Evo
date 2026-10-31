import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STREAM_NAMES } from '../src/random/streams'

/**
 * A static, structural check that complements the runtime determinism tests: the roadmap's
 * "random stream isolation works" category isn't fully covered by hash comparisons alone, because
 * a stream nobody draws from is dead weight and a system that draws from the wrong stream would
 * still be reproducible. Every named stream must be drawn from by the engine, and the draws must
 * come from the owner the docs name (docs/simulation/determinism.md, section 3). Each stream left
 * the "reserved" list when its owner arrived: `reproduction` in Phase 3, `genetics` in Phase 4,
 * `learning` in Phase 5, and `events` and `terrain` in Phase 6 (docs/decisions/0009).
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function collectFiles(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full))
    } else if (entry.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

const sourceFiles = collectFiles(join(ROOT, 'src'))

/** Which source files draw from each stream, by the `get('name')` call `World` and the systems use. */
function usersOf(name: string): string[] {
  const pattern = new RegExp(`get\\(\\s*['"\`]${name}['"\`]\\s*\\)`)
  return sourceFiles
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(ROOT.length))
}

describe('every random stream has an owner', () => {
  it.each(STREAM_NAMES)('stream "%s" is drawn from by the engine', (name) => {
    expect(usersOf(name).length).toBeGreaterThan(0)
  })

  it('only the world assembly hands out the streams (systems receive them by injection)', () => {
    for (const name of STREAM_NAMES) {
      for (const user of usersOf(name)) {
        expect(user, `stream "${name}"`).toMatch(/world\/World\.ts$/)
      }
    }
  })

  it('found source files to scan (the scan is not silently empty)', () => {
    expect(sourceFiles.length).toBeGreaterThan(10)
  })
})
