import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { checkArtifact } from './check-pages-artifact.mjs'

/** Builds a throwaway artifact from `{ path: contents }` and returns the checker's errors. */
function check(files) {
  const root = mkdtempSync(join(tmpdir(), 'evo-artifact-'))
  try {
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true })
      writeFileSync(join(root, path), contents)
    }
    return checkArtifact(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const page = (head) =>
  `<!doctype html><html><head>${head}<script type="module" src="./assets/app.js"></script></head><body></body></html>`

const good = {
  'index.html': page(
    '<link rel="icon" href="./favicon.svg" /><link rel="manifest" href="./manifest.webmanifest" />'
  ),
  'assets/app.js': 'console.log(1)',
  'favicon.svg': '<svg/>',
  'icon.png': 'x',
  'manifest.webmanifest': JSON.stringify({
    start_url: './',
    scope: './',
    icons: [{ src: 'icon.png' }]
  })
}

test('accepts a self-contained, relative build', () => {
  assert.deepEqual(check(good), [])
})

test('requires index.html', () => {
  assert.match(check({ 'assets/app.js': '' })[0], /index\.html is missing/)
})

test('rejects root-absolute URLs, which break under /Evo/', () => {
  const errors = check({
    ...good,
    'index.html': page('<link rel="icon" href="/favicon.svg" />')
  })
  assert.equal(errors.length, 1)
  assert.match(errors[0], /root-absolute/)
})

test('rejects external URLs and protocol-relative URLs', () => {
  const errors = check({
    ...good,
    'index.html': page(
      '<link rel="stylesheet" href="https://cdn.example.com/x.css" /><script src="//cdn.example.com/y.js"></script>'
    )
  })
  assert.equal(errors.filter((e) => /external URL/.test(e)).length, 2)
})

test('rejects a reference to a file that is not in the build', () => {
  const errors = check({ ...good, 'index.html': page('<link rel="icon" href="./missing.svg" />') })
  assert.match(errors[0], /does not exist/)
})

test('rejects a reference that climbs out of the build', () => {
  const errors = check({
    ...good,
    'index.html': page('<link rel="icon" href="../../etc/passwd" />')
  })
  assert.match(errors[0], /outside the build/)
})

test('requires a script, or the app would not start', () => {
  const errors = check({ ...good, 'index.html': '<!doctype html><html><body></body></html>' })
  assert.match(errors[0], /no script/)
})

test('checks the manifest: icons and start_url must be relative and exist', () => {
  const absoluteIcon = check({
    ...good,
    'manifest.webmanifest': JSON.stringify({ icons: [{ src: '/assets/icon.png' }] })
  })
  assert.match(absoluteIcon[0], /root-absolute/)
  const missingIcon = check({
    ...good,
    'manifest.webmanifest': JSON.stringify({ icons: [{ src: 'gone.png' }] })
  })
  assert.match(missingIcon[0], /does not exist/)
  const absoluteStart = check({
    ...good,
    'manifest.webmanifest': JSON.stringify({ start_url: '/', icons: [] })
  })
  assert.match(absoluteStart[0], /root-absolute/)
})

test('reports a broken manifest instead of crashing', () => {
  const errors = check({ ...good, 'manifest.webmanifest': '{not json' })
  assert.match(errors[0], /not valid JSON/)
})

test('ignores fragments and data URIs', () => {
  assert.deepEqual(
    check({
      ...good,
      'index.html': page('<a href="#top">x</a><img src="data:image/png;base64,AAAA" />')
    }),
    []
  )
})
