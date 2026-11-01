#!/usr/bin/env node
/**
 * Checks that a built web app can be served from a sub-path (GitHub Pages serves this repository
 * at /Evo/) and from file://: every URL the page and its manifest use must be relative and must
 * point at a file that exists in the build. The deploy workflow runs this before uploading, and a
 * pull-request job runs it too, because the deploy itself can only run on main.
 *
 * Usage: node tools/check-pages-artifact.mjs apps/web/dist
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const URL_ATTRIBUTE = /\b(?:src|href)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi

/** `true` for a reference that is not a file in the build (fragments, data URIs, mail links). */
const isInert = (reference) =>
  reference === '' || reference.startsWith('#') || /^(data|mailto|tel|javascript):/i.test(reference)

/** The problems with one reference found in `from` (a path relative to the artifact root). */
function checkReference(root, from, reference) {
  if (isInert(reference)) return []
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(reference)) {
    return [`${from}: "${reference}" is an external URL; the page must be self-contained`]
  }
  if (reference.startsWith('/')) {
    return [
      `${from}: "${reference}" is root-absolute and breaks under a sub-path such as /Evo/; use a relative URL`
    ]
  }
  const target = resolve(root, dirname(from), reference.split(/[?#]/)[0])
  if (!target.startsWith(root)) return [`${from}: "${reference}" points outside the build`]
  if (!existsSync(target)) return [`${from}: "${reference}" does not exist in the build`]
  return []
}

export function checkArtifact(directory) {
  const root = resolve(directory)
  const errors = []
  const indexPath = join(root, 'index.html')
  if (!existsSync(indexPath)) return [`${directory}: index.html is missing`]

  const html = readFileSync(indexPath, 'utf8')
  const references = [...html.matchAll(URL_ATTRIBUTE)].map((m) => m[1] ?? m[2] ?? '')
  for (const reference of references) errors.push(...checkReference(root, 'index.html', reference))
  if (!references.some((r) => /\.js(\?|$)/.test(r))) {
    errors.push('index.html: no script is referenced, so the app would not start')
  }

  const manifestReference = references.find((r) => /\.(webmanifest|json)(\?|$)/.test(r))
  if (manifestReference !== undefined && !isInert(manifestReference)) {
    const manifestPath = resolve(root, manifestReference.split(/[?#]/)[0])
    if (existsSync(manifestPath)) {
      let manifest
      try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      } catch {
        errors.push(`${manifestReference}: is not valid JSON`)
      }
      if (manifest !== undefined) {
        const from = manifestReference.split(/[?#]/)[0]
        for (const key of ['start_url', 'scope']) {
          if (typeof manifest[key] === 'string')
            errors.push(...checkReference(root, from, manifest[key]))
        }
        for (const icon of manifest.icons ?? []) {
          errors.push(...checkReference(root, from, String(icon.src ?? '')))
        }
      }
    }
  }
  return errors
}

function countFiles(directory) {
  let count = 0
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    count += statSync(full).isDirectory() ? countFiles(full) : 1
  }
  return count
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2]
  if (!directory) {
    console.error('Usage: node tools/check-pages-artifact.mjs <build directory>')
    process.exit(2)
  }
  if (!existsSync(directory)) {
    console.error(`${directory} does not exist; build the app first`)
    process.exit(2)
  }
  const errors = checkArtifact(directory)
  if (errors.length > 0) {
    console.error('Pages artifact problems:')
    for (const error of errors) console.error(`  - ${error}`)
    process.exit(1)
  }
  console.log(`Pages artifact OK (${countFiles(directory)} files in ${directory})`)
}
