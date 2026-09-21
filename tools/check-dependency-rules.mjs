#!/usr/bin/env node
/**
 * Enforces the workspace dependency rules from ADR 0001 / roadmap 1.3.
 *
 * - Every `@evo/*` dependency must be an allowed edge.
 * - `@evo/simulation` must not depend on UI, bundler, or desktop packages.
 * - Source files must not import `@evo/*` packages that are not allowed edges.
 * - Simulation systems (`packages/simulation/src/systems/`) must not import sibling systems
 *   or anything under `world/`: ordering is controlled exclusively by `World`.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join, posix, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** package name (without scope) -> internal packages it may depend on. */
export const ALLOWED = {
  contracts: [],
  config: ['contracts'],
  simulation: ['contracts', 'config'],
  renderer: ['contracts'],
  ui: ['contracts'],
  experiment: ['simulation', 'config'],
  web: ['simulation', 'renderer', 'ui', 'config', 'contracts'],
  desktop: ['web'],
  'simulator-cli': ['simulation', 'config', 'experiment']
}

/** External packages the simulation engine must never depend on or import. */
export const SIMULATION_FORBIDDEN = [
  /^react($|\/)/,
  /^react-dom($|\/)/,
  /^vite($|\/)/,
  /^@vitejs\//,
  /^electron($|\/)/,
  /^@electron/,
  /^@types\/(react|react-dom)$/,
  /^pixi\.js($|\/)/
]

const SCOPE = '@evo/'
const DEP_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
const SOURCE_EXT = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g

/** Validate declared dependencies. `packages` is `[{ name, dir, dependencies... }]`. */
export function checkManifests(packages) {
  const errors = []
  for (const pkg of packages) {
    if (!pkg.name?.startsWith(SCOPE)) {
      errors.push(`${pkg.dir}: package name must start with "${SCOPE}" (got "${pkg.name}")`)
      continue
    }
    const short = pkg.name.slice(SCOPE.length)
    const allowed = ALLOWED[short]
    if (!allowed) {
      errors.push(`${pkg.name}: not listed in tools/check-dependency-rules.mjs ALLOWED graph`)
      continue
    }
    for (const field of DEP_FIELDS) {
      for (const dep of Object.keys(pkg[field] ?? {})) {
        if (dep.startsWith(SCOPE)) {
          const depShort = dep.slice(SCOPE.length)
          if (!allowed.includes(depShort)) {
            errors.push(`${pkg.name}: forbidden dependency on ${dep} (${field})`)
          }
        } else if (short === 'simulation' && SIMULATION_FORBIDDEN.some((re) => re.test(dep))) {
          errors.push(`${pkg.name}: the simulation engine must not depend on "${dep}" (${field})`)
        }
      }
    }
  }
  return errors
}

/** Validate import specifiers found in a package's source files. */
export function checkImports(shortName, files) {
  const errors = []
  const allowed = ALLOWED[shortName] ?? []
  for (const { path, text } of files) {
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1]
      if (spec.startsWith(SCOPE)) {
        const target = spec.slice(SCOPE.length).split('/')[0]
        if (target !== shortName && !allowed.includes(target)) {
          errors.push(`${path}: @evo/${shortName} must not import ${spec}`)
        }
      } else if (shortName === 'simulation' && SIMULATION_FORBIDDEN.some((re) => re.test(spec))) {
        errors.push(`${path}: the simulation engine must not import "${spec}"`)
      }
    }
  }
  return errors
}

const stripExtension = (path) => path.replace(/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/, '')

const SYSTEMS_DIR = 'packages/simulation/src/systems/'
const WORLD_DIR = 'packages/simulation/src/world'

/**
 * A system may only mutate state it owns and never talks to another system.
 * `files` use repo-relative POSIX paths. Only files under the systems directory are checked.
 */
export function checkSystemImports(files) {
  const errors = []
  for (const { path, text } of files) {
    if (!path.startsWith(SYSTEMS_DIR)) continue
    const own = stripExtension(path)
    for (const match of text.matchAll(IMPORT_RE)) {
      const spec = match[1]
      if (!spec.startsWith('.')) continue
      const target = stripExtension(posix.normalize(posix.join(posix.dirname(path), spec)))
      if (target === own) continue
      if (target === SYSTEMS_DIR.slice(0, -1) || target.startsWith(SYSTEMS_DIR)) {
        errors.push(
          `${path}: systems must not import other systems ("${spec}"); pass data through world-owned buffers`
        )
      } else if (target === WORLD_DIR || target.startsWith(`${WORLD_DIR}/`)) {
        errors.push(
          `${path}: systems must not import from world/ ("${spec}"); World orchestrates systems, not the reverse`
        )
      }
    }
  }
  return errors
}

function listSourceFiles(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full))
    else if (SOURCE_EXT.test(entry)) out.push(full)
  }
  return out
}

function loadWorkspace(root) {
  const packages = []
  for (const group of ['apps', 'packages']) {
    const base = join(root, group)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base)) {
      const dir = join(base, entry)
      const manifest = join(dir, 'package.json')
      if (!existsSync(manifest)) continue
      packages.push({ ...JSON.parse(readFileSync(manifest, 'utf8')), dir })
    }
  }
  return packages
}

export function run(root) {
  const packages = loadWorkspace(root)
  const errors = checkManifests(packages)
  for (const pkg of packages) {
    if (!pkg.name?.startsWith(SCOPE)) continue
    const files = listSourceFiles(pkg.dir).map((path) => ({
      path: relative(root, path).replaceAll('\\', '/'),
      text: readFileSync(path, 'utf8')
    }))
    errors.push(...checkImports(pkg.name.slice(SCOPE.length), files))
    errors.push(...checkSystemImports(files))
  }
  return { packages: packages.length, errors }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(import.meta.url), '..', '..')
  const { packages, errors } = run(root)
  if (errors.length > 0) {
    console.error('Dependency rule violations:')
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }
  console.log(`Dependency rules OK (${packages} workspace packages checked)`)
}
