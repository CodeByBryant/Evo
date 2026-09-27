import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * A static, structural check that complements the runtime determinism tests: the roadmap's
 * "random stream isolation works" category isn't fully covered by hash comparisons alone, because
 * a system that draws from an unused stream would still be reproducible (same seed -> same
 * result); it just wouldn't be *isolated* in spirit. Reading a stream that the current phase has
 * no business touching should fail loudly here, not be discovered by accident later. `reproduction`
 * left this list in Phase 3 once `ReproductionSystem` became real (docs/decisions/0005).
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

const engineFiles = [
  ...collectFiles(join(ROOT, 'src', 'systems')),
  ...collectFiles(join(ROOT, 'src', 'world'))
]

const RESERVED_FOR_LATER_PHASES = ['genetics', 'learning', 'events'] as const

describe('reserved random streams are never drawn from by systems/ or world/', () => {
  it.each(RESERVED_FOR_LATER_PHASES)(
    'stream "%s" is not referenced in systems/ or world/',
    (name) => {
      const pattern = new RegExp(`get\\(\\s*['"\`]${name}['"\`]\\s*\\)`)
      for (const file of engineFiles) {
        const text = readFileSync(file, 'utf8')
        if (pattern.test(text)) {
          throw new Error(`${file} references the reserved "${name}" random stream`)
        }
      }
    }
  )

  it('found at least one file to check (the scan is not silently empty)', () => {
    expect(engineFiles.length).toBeGreaterThan(0)
  })
})
