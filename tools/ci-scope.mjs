// Decides which parts of the Quality workflow a change needs, from the files it touches, so a
// documentation or interface change does not pay for the long simulation suites.
//
//   engine  the simulation, its config and contracts, or anything that can change how they are
//           built and run (lockfile, workflows, this tool): run the simulation unit tests and the
//           determinism suite (both operating systems)
//   legacy  the legacy prototype or the workflows: run its job
//   app     anything that is not only documentation: run the Pages artifact job
//
// Anything it cannot tell (a push to main, a missing base, an empty diff) runs everything: a
// skipped check is only ever the result of a diff that was read and understood.
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ENGINE = [
  /^packages\/(simulation|config|contracts)\//,
  /^pnpm-lock\.yaml$/,
  /^pnpm-workspace\.yaml$/,
  /^package\.json$/,
  /^tsconfig[^/]*\.json$/,
  /^\.github\/workflows\//,
  /^tools\//
]
const LEGACY = [/^legacy\//, /^\.github\/workflows\//]
const DOCUMENTATION = [/^docs\//, /\.md$/, /^LICENSE/]

const matches = (patterns, file) => patterns.some((pattern) => pattern.test(file))

/** The scope of a change to `files` (repository-relative, forward slashes); `null` means unknown. */
export function scopeOf(files) {
  if (files === null || files.length === 0) return { engine: true, legacy: true, app: true }
  return {
    engine: files.some((file) => matches(ENGINE, file)),
    legacy: files.some((file) => matches(LEGACY, file)),
    app: files.some((file) => !matches(DOCUMENTATION, file))
  }
}

/** The files a pull request changes against its base branch, or `null` outside a pull request. */
export function changedFiles(env = process.env, run = execFileSync) {
  if (env.GITHUB_EVENT_NAME !== 'pull_request' || !env.GITHUB_BASE_REF) return null
  try {
    const out = run('git', ['diff', '--name-only', `origin/${env.GITHUB_BASE_REF}...HEAD`], {
      encoding: 'utf8'
    })
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
  } catch {
    return null
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = changedFiles()
  const scope = scopeOf(files)
  const lines = Object.entries(scope).map(([name, value]) => `${name}=${value}`)
  console.log(
    `${files === null ? 'unknown change' : `${files.length} changed files`}: ${lines.join(' ')}`
  )
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`)
}
